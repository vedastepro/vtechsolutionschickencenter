import { needLogin } from "./account";
import {
  $, $$, allProducts, api, ApiError, cart, COUNTRIES, countryName, esc, field, money, showFieldErrors, state, toast, withLoading, type Product,
} from "./lib";

type Delivery = { delivered: boolean; devCode?: string; error?: string };
const devKey = (code: string, ch: string) => `cpc-dev-${code}-${ch}`;
function rememberDelivery(code: string, delivery: Record<string, Delivery | undefined>) {
  for (const [ch, d] of Object.entries(delivery)) {
    if (d?.devCode) sessionStorage.setItem(devKey(code, ch), d.devCode);
    if (d && !d.delivered && d.error) toast(d.error, true);
  }
}

const steps = (n: number) => `<ol class="steps">${["Delivery details", "Verify email & phone", "Payment & confirm"].map((s, i) => `<li class="${i < n ? "done" : i === n ? "on" : ""}">${s}</li>`).join("")}</ol>`;

function summary(rows: { p: Product; q: number }[] | { name: string; unit: string; unitPriceCents: number; quantity: number }[], subtotal: number, fee: number, currency?: string) {
  return `<aside class="card summary"><h3>Your order</h3>
    ${(rows as any[]).map((r) => r.p
      ? `<div class="r"><span>${r.q} × ${esc(r.p.name)}</span><span>${money(r.p.priceCents * r.q)}</span></div>`
      : `<div class="r"><span>${r.quantity} × ${esc(r.name)}</span><span>${money(r.unitPriceCents * r.quantity, currency)}</span></div>`).join("")}
    <div class="r" style="border-top:1px solid var(--line);margin-top:.4rem;padding-top:.7rem"><span>Subtotal</span><span>${money(subtotal, currency)}</span></div>
    <div class="r"><span>Delivery</span><span>${fee ? money(fee, currency) : "Free"}</span></div>
    <div class="r total"><span>Total</span><span>${money(subtotal + fee, currency)}</span></div>
    <p class="muted" style="font-size:.82rem;margin:.8rem 0 0">Final prices are confirmed by our server when you submit.</p>
  </aside>`;
}

/* ------------------------------------------------------------------ step 1 */
export async function checkout(app: HTMLElement, refreshMe: () => Promise<void>) {
  if (!state.me.user) return needLogin(app, refreshMe, "Sign in to check out securely", "#/checkout", () => checkout(app, refreshMe));
  const lines = cart.get();
  if (!lines.length) { location.hash = "#/cart"; return; }
  app.innerHTML = `<div class="page">${steps(0)}<div class="two-col"><div class="skeleton"></div><div class="skeleton"></div></div></div>`;
  const list = await allProducts(true).catch(() => [] as Product[]);
  const rows = lines.map((l) => ({ p: list.find((x) => x.id === l.productId)!, q: l.quantity })).filter((r) => r.p);
  if (!rows.length) { location.hash = "#/cart"; return; }
  const st = state.store!;
  const subtotal = rows.reduce((s, r) => s + r.p.priceCents * r.q, 0);
  const fee = st.freeDeliveryOverCents && subtotal >= st.freeDeliveryOverCents ? 0 : st.deliveryFeeCents;
  const me = state.me;
  const draft = JSON.parse(sessionStorage.getItem("cpc-checkout-draft") || "{}");
  const countries = st.allowedCountries.length ? COUNTRIES.filter(([c]) => st.allowedCountries.includes(c)) : COUNTRIES;
  const defCountry = draft.country || st.defaultCountry || (countries.length === 1 ? countries[0][0] : "");
  const v = (k: string, d = "") => esc(draft[k] ?? d);

  app.innerHTML = `<div class="page">
    ${steps(0)}
    <div class="two-col">
      <form class="card" id="co" novalidate>
        <div class="form-error" id="co-err"></div>
        <h3>Who is receiving the order?</h3>
        ${field("fullName", "Full name", `autocomplete="name" required value="${v("fullName", me.user!.name || me.profile?.fullName || "")}"`, "As it appears on your ID — our rider may ask.")}
        <div class="row">
          ${field("email", "Email", `type="email" autocomplete="email" required value="${v("email", me.user!.email)}"`, "Using a different email than your account? We'll send it a code.")}
          ${field("phone", "Mobile number", `type="tel" autocomplete="tel" required value="${v("phone", me.profile?.phone ?? "")}" placeholder="e.g. 078 123 4567"`, me.profile?.phoneVerified ? "Verified on a previous order." : "We'll text a 6-digit code to this number.")}
        </div>
        <h3 style="margin-top:1rem">Delivery address</h3>
        <div class="field"><label for="f-country">Country</label><select id="f-country" name="country" required><option value="">Select country…</option>${countries.map(([c, n]) => `<option value="${c}" ${c === defCountry ? "selected" : ""}>${esc(n)}</option>`).join("")}</select><span class="err"></span></div>
        <div class="row">${field("region", "Province / region", `required autocomplete="address-level1" value="${v("region")}"`)}${field("city", "City / town / district", `required autocomplete="address-level2" value="${v("city")}"`)}</div>
        ${field("street", "Street, house number or village", `required autocomplete="street-address" value="${v("street")}"`)}
        ${field("landmark", "Nearby landmark (optional)", `value="${v("landmark")}" placeholder="e.g. behind the parish church, blue gate"`)}
        <div class="field"><label for="f-notes">Delivery notes (optional)</label><textarea id="f-notes" name="notes" maxlength="500" placeholder="Best time to deliver, access instructions…">${v("notes")}</textarea><span class="err"></span></div>

        <h3 style="margin-top:1rem">Payment method</h3>
        <div class="pay-options field" style="margin-bottom:0">
          <label class="pay-opt"><input type="radio" name="paymentMethod" value="cod" ${draft.paymentMethod !== "momo" ? "checked" : ""}/><div><b>Cash on delivery</b><div class="muted" style="font-size:.9rem">Pay the rider when your order arrives.</div></div></label>
          <label class="pay-opt ${st.momoNumber ? "" : "disabled"}"><input type="radio" name="paymentMethod" value="momo" ${st.momoNumber ? "" : "disabled"} ${draft.paymentMethod === "momo" && st.momoNumber ? "checked" : ""}/><div><b>Mobile money</b><div class="muted" style="font-size:.9rem">${st.momoNumber ? "Send the total to our number and enter the transaction ID. We confirm it before dispatch." : "Not available at the moment."}</div></div></label>
          <span class="err"></span>
        </div>
        <div id="momo-extra" ${draft.paymentMethod === "momo" && st.momoNumber ? "" : "hidden"}>${field("paymentPhone", "Mobile money number you'll pay from", `type="tel" value="${v("paymentPhone")}"`, "Leave empty if it's the same as your mobile number.")}</div>
        <input type="hidden" name="items" />
        <div class="field" style="margin:0"><span class="err" data-for="items"></span></div>
        <button class="btn red block" style="margin-top:1.2rem">Continue — send my verification codes</button>
        <p class="muted" style="font-size:.84rem;margin-top:.8rem">By continuing you confirm the details above are real. Fake or incomplete details mean we can't deliver.</p>
      </form>
      ${summary(rows, subtotal, fee)}
    </div>
  </div>`;

  const form = $<HTMLFormElement>("#co", app);
  const saveDraft = () => {
    const fd = Object.fromEntries(new FormData(form) as any);
    delete fd.items;
    sessionStorage.setItem("cpc-checkout-draft", JSON.stringify(fd));
  };
  form.addEventListener("input", saveDraft);
  $$<HTMLInputElement>('[name="paymentMethod"]', form).forEach((r) => r.addEventListener("change", () => {
    $("#momo-extra", form).hidden = r.value !== "momo" || !r.checked;
  }));

  // Live validation: checks email deliverability and phone validity as the customer types.
  const live = async (name: "email" | "phone") => {
    const input = form.elements.namedItem(name) as HTMLInputElement;
    const f = input.closest(".field")!;
    if (!input.value.trim()) return;
    try {
      const country = (form.elements.namedItem("country") as HTMLSelectElement).value;
      const res = await api<any>("/api/validate", { body: name === "email" ? { email: input.value } : { phone: input.value, country } });
      const r = res[name];
      f.classList.toggle("invalid", !r.ok);
      f.classList.toggle("valid", r.ok);
      (f.querySelector(".err") as HTMLElement).textContent = r.error ?? "";
      (f.querySelector(".ok") as HTMLElement).textContent = r.ok ? (name === "phone" ? `Looks good: ${r.e164}` : r.mx === "ok" ? "This email domain accepts mail." : "") : "";
    } catch { /* non-blocking */ }
  };
  (form.elements.namedItem("email") as HTMLInputElement).addEventListener("blur", () => live("email"));
  (form.elements.namedItem("phone") as HTMLInputElement).addEventListener("blur", () => live("phone"));
  (form.elements.namedItem("country") as HTMLSelectElement).addEventListener("change", () => live("phone"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    saveDraft();
    const fd = new FormData(form);
    const g = (k: string) => String(fd.get(k) ?? "").trim();
    const payload = {
      items: cart.get(),
      contact: { fullName: g("fullName"), email: g("email"), phone: g("phone") },
      address: { country: g("country"), region: g("region"), city: g("city"), street: g("street"), landmark: g("landmark") },
      notes: g("notes"),
      paymentMethod: g("paymentMethod"),
      paymentPhone: g("paymentPhone"),
    };
    $("#co-err", form).textContent = "";
    await withLoading($("button.btn", form) as HTMLButtonElement, async () => {
      try {
        const res = await api<any>("/api/checkout", { body: payload });
        rememberDelivery(res.order.code, res.delivery);
        location.hash = `#/checkout/${res.order.code}`;
      } catch (err) {
        const e = err as ApiError;
        $("#co-err", form).textContent = e.message;
        if (e.fields?.items) { const el = $('[data-for="items"]', form); el.textContent = e.fields.items; el.parentElement!.classList.add("invalid"); }
        showFieldErrors(form, e.fields);
        if (e.status === 401) { await refreshMe(); checkout(app, refreshMe); }
      }
    });
  });
}

/* ------------------------------------------------------------------ steps 2 & 3 */
export async function verifyStep(app: HTMLElement, code: string, refreshMe: () => Promise<void>) {
  if (!state.me.user) return needLogin(app, refreshMe, "Sign in to finish your order", `#/checkout/${code}`, () => verifyStep(app, code, refreshMe));
  app.innerHTML = `<div class="page">${steps(1)}<div class="two-col"><div class="skeleton"></div><div class="skeleton"></div></div></div>`;
  let order: any;
  try { order = await api(`/api/orders/${encodeURIComponent(code)}`); }
  catch (e) { app.innerHTML = `<div class="page empty"><h2>Order not found</h2><a class="btn" href="#/cart">Back to cart</a></div>`; return; }
  if (order.status !== "awaiting_verification") { location.hash = `#/orders/${order.code}`; return; }

  const timers: number[] = [];
  const done = (ch: "email" | "phone") => order.verification[ch].verified || order.verification[ch].method === "manual_check_required";

  const render = () => {
    timers.forEach(clearInterval);
    const allDone = done("email") && done("phone");
    const s = state.store!;
    const channelBox = (ch: "email" | "phone") => {
      const v = order.verification[ch];
      const label = ch === "email" ? "Email address" : "Mobile number";
      if (v.verified) {
        const how = v.method === "account_confirmed" ? "confirmed when you created your account" : v.method === "previously_verified" ? "verified on a previous order" : "verified with a one-time code";
        return `<div class="verify-box done"><h4><span class="checklist"><span class="y">✓</span></span>${label} ${how}</h4><span class="muted mono">${esc(v.target)}</span></div>`;
      }
      if (v.method === "manual_check_required") {
        return `<div class="verify-box"><h4>${label}</h4><p class="muted" style="margin:0">We'll confirm <b>${esc(v.target)}</b> with a quick call before dispatch.</p></div>`;
      }
      const dev = sessionStorage.getItem(devKey(order.code, ch));
      return `<div class="verify-box" data-ch="${ch}">
        <h4>Enter the code we ${ch === "email" ? "emailed" : "texted"} to <span class="mono">${esc(v.target)}</span></h4>
        ${dev ? `<p class="notice" style="margin:.6rem 0 0;font-size:.85rem">Test mode — no ${ch === "email" ? "email" : "SMS"} provider is connected, so your code is shown here: <span class="dev-code">${dev}</span></p>` : ""}
        <div class="otp" role="group" aria-label="6-digit code">${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" autocomplete="${i === 0 ? "one-time-code" : "off"}" maxlength="${i === 0 ? 6 : 1}" aria-label="Digit ${i + 1}" />`).join("")}</div>
        <div class="err-msg" style="color:var(--danger);font-size:.88rem;min-height:1.2em"></div>
        <div style="display:flex;gap:1rem;align-items:center;flex-wrap:wrap;margin-top:.4rem">
          <button class="btn small" data-verify>Verify</button>
          <button class="link" data-resend>Send a new code</button><span class="muted mono" data-timer style="font-size:.85rem"></span>
        </div>
      </div>`;
    };

    const items = order.items;
    app.innerHTML = `<div class="page">${steps(allDone ? 2 : 1)}<div class="two-col"><div>
      ${allDone ? paymentStep(order, s) : `<div class="card"><h3>Confirm it's really you</h3><p class="muted">These one-time codes prove the contact details on this order belong to you. They expire after 10 minutes.</p>${channelBox("phone")}${channelBox("email")}
        <p style="margin:1rem 0 0;font-size:.9rem"><button class="link" id="edit">Wrong number or email? Edit details</button></p></div>`}
    </div>${summary(items, order.subtotalCents, order.deliveryFeeCents, order.currency)}</div></div>`;

    $("#edit", app)?.addEventListener("click", async () => {
      try { await api(`/api/orders/${order.code}/cancel`, { method: "POST", body: {} }); } catch { /* ignore */ }
      location.hash = "#/checkout";
    });

    $$<HTMLElement>("[data-ch]", app).forEach((box) => {
      const ch = box.dataset.ch as "email" | "phone";
      const inputs = $$<HTMLInputElement>(".otp input", box);
      const errEl = $(".err-msg", box);
      const submit = async () => {
        const codeVal = inputs.map((i) => i.value).join("");
        if (codeVal.length !== 6) { errEl.textContent = "Enter all 6 digits."; return; }
        await withLoading($("[data-verify]", box) as HTMLButtonElement, async () => {
          try {
            const res = await api<any>(`/api/orders/${order.code}/verify`, { body: { channel: ch, code: codeVal } });
            order = res.order;
            sessionStorage.removeItem(devKey(order.code, ch));
            toast(ch === "email" ? "Email verified." : "Phone verified.");
            render();
          } catch (err) {
            errEl.textContent = (err as Error).message;
            const otp = $(".otp", box); otp.classList.remove("shake"); void otp.offsetWidth; otp.classList.add("shake");
            inputs.forEach((i) => (i.value = "")); inputs[0].focus();
          }
        });
      };
      inputs.forEach((inp, i) => {
        inp.addEventListener("input", () => {
          const digits = inp.value.replace(/\D/g, "");
          if (digits.length > 1) { digits.slice(0, 6).split("").forEach((d, j) => { if (inputs[j]) inputs[j].value = d; }); inputs[Math.min(5, digits.length - 1)].focus(); }
          else { inp.value = digits; if (digits && inputs[i + 1]) inputs[i + 1].focus(); }
          if (inputs.every((x) => x.value)) submit();
        });
        inp.addEventListener("keydown", (e) => { if (e.key === "Backspace" && !inp.value && inputs[i - 1]) inputs[i - 1].focus(); if (e.key === "Enter") submit(); });
        inp.addEventListener("paste", (e) => {
          const t = e.clipboardData?.getData("text")?.replace(/\D/g, "") ?? "";
          if (t.length >= 6) { e.preventDefault(); t.slice(0, 6).split("").forEach((d, j) => (inputs[j].value = d)); submit(); }
        });
      });
      $("[data-verify]", box).addEventListener("click", submit);

      const resendBtn = $<HTMLButtonElement>("[data-resend]", box);
      const timerEl = $("[data-timer]", box);
      const tick = () => {
        const at = order.verification[ch].resendAvailableAt ? new Date(order.verification[ch].resendAvailableAt).getTime() : 0;
        const left = Math.ceil((at - Date.now()) / 1000);
        resendBtn.disabled = left > 0;
        resendBtn.style.opacity = left > 0 ? ".5" : "1";
        timerEl.textContent = left > 0 ? `in ${left}s` : "";
      };
      tick();
      timers.push(window.setInterval(tick, 1000));
      resendBtn.addEventListener("click", async () => {
        try {
          const res = await api<any>(`/api/orders/${order.code}/resend`, { body: { channel: ch } });
          rememberDelivery(order.code, { [ch]: res.delivery });
          order = res.order;
          if (res.delivery.delivered) toast(`A new code is on its way to ${order.verification[ch].target}.`);
          render();
        } catch (err) { errEl.textContent = (err as Error).message; }
      });
    });
    const firstInput = $<HTMLInputElement>(".otp input", app);
    firstInput?.focus();

    if (allDone) bindPayment();
  };

  const bindPayment = () => {
    const form = $<HTMLFormElement>("#pay", app);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const ref = String(new FormData(form).get("paymentReference") ?? "").trim();
      if (order.paymentMethod === "momo" && ref.length < 6) return showFieldErrors(form, { paymentReference: "Enter the transaction ID from your confirmation SMS." });
      await withLoading($("button.btn", form) as HTMLButtonElement, async () => {
        try {
          const res = await api<any>(`/api/orders/${order.code}/place`, { body: { paymentReference: ref } });
          cart.clear();
          sessionStorage.removeItem("cpc-checkout-draft");
          sessionStorage.setItem("cpc-just-placed", res.order.code);
          location.hash = `#/orders/${res.order.code}`;
        } catch (err) {
          const e = err as ApiError;
          $("#pay-err", form).textContent = e.message;
          showFieldErrors(form, e.fields);
        }
      });
    });
  };

  render();
  window.addEventListener("hashchange", () => timers.forEach(clearInterval), { once: true });
}

function paymentStep(order: any, s: any) {
  const total = money(order.totalCents, order.currency);
  return `<form class="card" id="pay" novalidate>
    <div class="notice sage"><b>Verified.</b> Your contact details are confirmed — one last step.</div>
    <div class="form-error" id="pay-err"></div>
    <h3>Deliver to</h3>
    <p style="margin-top:0"><b>${esc(order.customerName)}</b> · ${esc(order.verification.phone.target)}<br/>${esc(order.street)}${order.landmark ? `, ${esc(order.landmark)}` : ""}<br/>${esc(order.city)}, ${esc(order.region)}, ${esc(countryName(order.country))}</p>
    ${order.paymentMethod === "momo" ? `
      <h3>Pay with mobile money</h3>
      <ol style="padding-left:1.2rem;line-height:1.8">
        <li>Send <b>${total}</b> to <b class="mono">${esc(s.momoNumber)}</b>${s.momoName ? ` (${esc(s.momoName)})` : ""}.</li>
        <li>Use <b class="mono">${esc(order.code)}</b> as the payment reason if your app allows it.</li>
        <li>Enter the transaction ID from your confirmation SMS below.</li>
      </ol>
      ${field("paymentReference", "Transaction ID", 'required autocomplete="off" style="font-family:var(--mono);text-transform:uppercase"', "We match it against our mobile money statement before dispatch.")}
    ` : `<h3>Cash on delivery</h3><p>Please have <b>${total}</b> ready when the rider arrives. We'll call you before delivery.</p>`}
    <button class="btn red block">Place order · ${total}</button>
  </form>`;
}
