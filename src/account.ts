import {
  AuthError, MissingIdentityError, login, logout, requestPasswordRecovery, signup, updateUser,
} from "@netlify/identity";
import { art } from "./art";
import {
  $, $$, api, ApiError, countryName, esc, field, money, showFieldErrors, state, STATUS_LABEL, toast, withLoading,
} from "./lib";

function authMessage(err: unknown, mode: "login" | "signup" | "recover" | "reset") {
  if (err instanceof MissingIdentityError) return "Accounts are not available right now. Please try again later.";
  if (err instanceof AuthError) {
    const m = (err.message || "").toLowerCase();
    if (m.includes("not confirmed") || m.includes("email not confirmed")) return "Please confirm your email first — check your inbox for the confirmation link.";
    if (err.status === 401 || err.status === 400) return mode === "login" ? "Invalid email or password." : err.message;
    if (err.status === 403) return "New sign-ups are closed. Please contact the store.";
    if (err.status === 422) return mode === "signup" ? "Use a valid email and a password of at least 8 characters. This email may already be registered." : err.message;
    if (err.status === 429) return "Too many attempts. Please wait a minute and try again.";
    return err.message;
  }
  return "Something went wrong. Please try again.";
}

/** Renders the login / sign-up / reset panel. `onDone` runs after a successful login. */
export function authPanel(host: HTMLElement, onDone: () => void, initial: "login" | "signup" = "login") {
  let mode: "login" | "signup" | "recover" = initial;
  const draw = () => {
    host.innerHTML = `<div class="card auth">
      ${mode !== "recover" ? `<div class="tabs" role="tablist"><button class="${mode === "login" ? "on" : ""}" data-m="login" role="tab">Sign in</button><button class="${mode === "signup" ? "on" : ""}" data-m="signup" role="tab">Create account</button></div>` : `<h3>Reset your password</h3><p class="muted">We'll email you a secure link to choose a new password.</p>`}
      <div class="form-error" id="auth-err"></div>
      <form novalidate id="auth-form">
        ${mode === "signup" ? field("name", "Full name", 'autocomplete="name" required') : ""}
        ${field("email", "Email", 'type="email" autocomplete="email" required')}
        ${mode !== "recover" ? field("password", "Password", `type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" required minlength="8"`, mode === "signup" ? "At least 8 characters." : "") : ""}
        <button class="btn red block">${mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}</button>
      </form>
      <p style="text-align:center;margin:1rem 0 0;font-size:.92rem">
        ${mode === "login" ? `<button class="link" data-m="recover">Forgot your password?</button>` : mode === "recover" ? `<button class="link" data-m="login">Back to sign in</button>` : `<span class="muted">We'll send a link to confirm your email address.</span>`}
      </p>
    </div>`;
    $$<HTMLButtonElement>("[data-m]", host).forEach((b) => b.addEventListener("click", () => { mode = b.dataset.m as typeof mode; draw(); }));
    const form = $<HTMLFormElement>("#auth-form", host);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const email = String(fd.get("email") ?? "").trim();
      const password = String(fd.get("password") ?? "");
      const name = String(fd.get("name") ?? "").trim();
      const errs: Record<string, string> = {};
      if (!/^\S+@\S+\.\S+$/.test(email)) errs.email = "Enter a valid email address.";
      if (mode !== "recover" && password.length < (mode === "signup" ? 8 : 1)) errs.password = mode === "signup" ? "Use at least 8 characters." : "Enter your password.";
      if (mode === "signup" && name.split(/\s+/).length < 2) errs.name = "Enter your first and last name.";
      showFieldErrors(form, errs);
      if (Object.keys(errs).length) return;
      const errBox = $("#auth-err", host);
      errBox.textContent = "";
      await withLoading($("button.btn", form) as HTMLButtonElement, async () => {
        try {
          if (mode === "login") {
            await login(email, password);
            onDone();
          } else if (mode === "signup") {
            const user = await signup(email, password, { full_name: name });
            if (user.confirmedAt) onDone();
            else host.innerHTML = `<div class="card auth" style="text-align:center">${art.eggs}<h3>Check your inbox</h3><p>We sent a confirmation link to <b>${esc(email)}</b>. Click it to activate your account — this proves the email address is really yours.</p><p class="muted" style="font-size:.9rem">Can't find it? Check spam, or <button class="link" id="again">try signing up again</button>.</p></div>`,
              $("#again", host)?.addEventListener("click", () => { mode = "signup"; draw(); });
          } else {
            await requestPasswordRecovery(email);
            host.innerHTML = `<div class="card auth" style="text-align:center"><h3>Check your email</h3><p>If an account exists for <b>${esc(email)}</b>, a password reset link is on its way.</p></div>`;
          }
        } catch (err) {
          errBox.textContent = authMessage(err, mode === "recover" ? "recover" : mode);
        }
      });
    });
  };
  draw();
}

export function resetPasswordPanel(host: HTMLElement, onDone: () => void) {
  host.innerHTML = `<div class="card auth"><h3>Choose a new password</h3><div class="form-error" id="rp-err"></div>
    <form novalidate id="rp">${field("password", "New password", 'type="password" autocomplete="new-password" minlength="8" required', "At least 8 characters.")}<button class="btn red block">Save password</button></form></div>`;
  const form = $<HTMLFormElement>("#rp", host);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = String(new FormData(form).get("password"));
    if (pw.length < 8) return showFieldErrors(form, { password: "Use at least 8 characters." });
    await withLoading($("button", form) as HTMLButtonElement, async () => {
      try { await updateUser({ password: pw }); toast("Password updated."); onDone(); }
      catch (err) { $("#rp-err", host).textContent = authMessage(err, "reset"); }
    });
  });
}

/* ------------------------------------------------------------------ account page */
export function account(app: HTMLElement, refreshMe: () => Promise<void>) {
  const me = state.me;
  if (!me.user) {
    app.innerHTML = `<div class="page"><div style="text-align:center;margin-bottom:2rem"><span class="eyebrow">Your account</span><h1 style="font-size:clamp(2.2rem,5vw,3.6rem)">Welcome to the yard.</h1><p class="muted">Sign in to check out, track deliveries and reorder in seconds.</p></div><div id="auth"></div></div>`;
    authPanel($("#auth", app), async () => { await refreshMe(); toast("Signed in."); location.hash = sessionStorage.getItem("cpc-after-login") || "#/orders"; sessionStorage.removeItem("cpc-after-login"); });
    return;
  }
  const u = me.user;
  app.innerHTML = `<div class="page" style="max-width:760px">
    <span class="eyebrow">Your account</span>
    <h1 style="font-size:clamp(2.2rem,5vw,3.6rem)">Hello, ${esc(u.name || me.profile?.fullName || u.email.split("@")[0])}.</h1>
    <div class="card">
      <ul class="checklist">
        <li><span class="y">✓</span> Email confirmed: <b>${esc(u.email)}</b></li>
        <li>${me.profile?.phoneVerified ? `<span class="y">✓</span> Phone verified: <b>${esc(me.profile.phone)}</b>` : `<span class="w">!</span> Phone not verified yet — you'll verify it with a code at your first checkout.`}</li>
        ${u.isAdmin ? `<li><span class="y">✓</span> Store administrator</li>` : ""}
      </ul>
      <div style="display:flex;gap:.6rem;margin-top:1.4rem;flex-wrap:wrap">
        <a class="btn" href="#/orders">My orders</a>
        ${u.isAdmin ? `<a class="btn red" href="#/admin">Open admin</a>` : ""}
        <button class="btn ghost" id="logout">Sign out</button>
      </div>
    </div>
    <div class="card" style="margin-top:1.4rem" id="pw-card"><h3>Change password</h3><form id="pw" novalidate>${field("password", "New password", 'type="password" autocomplete="new-password" minlength="8"', "At least 8 characters.")}<button class="btn small">Update password</button></form></div>
  </div>`;
  $("#logout", app).addEventListener("click", async () => {
    try { await logout(); } catch { /* cookies are cleared regardless */ }
    await refreshMe();
    toast("Signed out.");
    location.hash = "#/";
  });
  const pw = $<HTMLFormElement>("#pw", app);
  pw.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = String(new FormData(pw).get("password"));
    if (v.length < 8) return showFieldErrors(pw, { password: "Use at least 8 characters." });
    await withLoading($("button", pw) as HTMLButtonElement, async () => {
      try { await updateUser({ password: v }); pw.reset(); toast("Password updated."); } catch (err) { toast(authMessage(err, "reset"), true); }
    });
  });
}

/* ------------------------------------------------------------------ orders */
export function needLogin(app: HTMLElement, refreshMe: () => Promise<void>, title: string, after: string, onDone: () => void) {
  app.innerHTML = `<div class="page"><div style="text-align:center;margin-bottom:2rem"><span class="eyebrow">Sign in required</span><h1 style="font-size:clamp(2.2rem,5vw,3.4rem)">${title}</h1></div><div id="auth"></div></div>`;
  sessionStorage.setItem("cpc-after-login", after);
  authPanel($("#auth", app), async () => { await refreshMe(); sessionStorage.removeItem("cpc-after-login"); onDone(); });
}

export async function orders(app: HTMLElement, refreshMe: () => Promise<void>) {
  if (!state.me.user) return needLogin(app, refreshMe, "Sign in to see your orders", "#/orders", () => orders(app, refreshMe));
  app.innerHTML = `<div class="page" style="max-width:900px"><span class="eyebrow">Order history</span><h1 style="font-size:clamp(2.2rem,5vw,3.6rem)">My orders</h1><div class="skeleton" style="min-height:90px;margin-bottom:.7rem"></div><div class="skeleton" style="min-height:90px"></div></div>`;
  try {
    const list = await api<any[]>("/api/orders");
    const page = $(".page", app);
    $$(".skeleton", page).forEach((s) => s.remove());
    page.insertAdjacentHTML("beforeend", list.length
      ? list.map((o) => `<a class="order-row" href="#/orders/${esc(o.code)}">
          <div><b class="mono">${esc(o.code)}</b><div class="muted" style="font-size:.88rem">${new Date(o.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })} · ${o.items.length} item${o.items.length === 1 ? "" : "s"}</div></div>
          <span class="status ${o.status}">${STATUS_LABEL[o.status] ?? o.status}</span>
          <b class="price" style="font-size:1.15rem">${money(o.totalCents, o.currency)}</b></a>`).join("")
      : `<div class="empty">${art.basket}<h3>No orders yet</h3><p class="muted">When you order, you'll track it here.</p><a class="btn red" href="#/shop">Shop now</a></div>`);
  } catch (e) {
    $(".page", app).innerHTML += `<p class="form-error">${esc((e as Error).message)}</p>`;
  }
}

const FLOW = ["placed", "confirmed", "out_for_delivery", "delivered"];

export async function orderDetail(app: HTMLElement, code: string, refreshMe: () => Promise<void>, justPlaced = false) {
  if (!state.me.user) return needLogin(app, refreshMe, "Sign in to view this order", `#/orders/${code}`, () => orderDetail(app, code, refreshMe));
  app.innerHTML = `<div class="page" style="max-width:900px"><div class="skeleton"></div></div>`;
  let o: any;
  try { o = await api(`/api/orders/${encodeURIComponent(code)}`); }
  catch (e) {
    app.innerHTML = `<div class="page empty"><h2>Order not found</h2><p class="muted">${esc((e as Error).message)}</p><a class="btn" href="#/orders">My orders</a></div>`;
    return;
  }
  if (o.status === "awaiting_verification") { location.hash = `#/checkout/${o.code}`; return; }
  const idx = FLOW.indexOf(o.status);
  const s = state.store;
  app.innerHTML = `<div class="page" style="max-width:900px">
    ${justPlaced ? `<div class="notice sage"><b>Thank you — your order is in!</b> A confirmation email is on its way. We'll call ${esc(o.verification.phone.target)} before delivery.</div>` : ""}
    <p><a class="muted" href="#/orders">← My orders</a></p>
    <div style="display:flex;justify-content:space-between;align-items:end;gap:1rem;flex-wrap:wrap">
      <div><span class="eyebrow">Order</span><h1 class="mono" style="font-size:clamp(1.8rem,4vw,2.8rem);font-family:var(--mono)">${esc(o.code)}</h1></div>
      <div style="display:flex;gap:.5rem"><span class="status ${o.status}">${STATUS_LABEL[o.status]}</span><span class="status ${o.paymentStatus}">${STATUS_LABEL[o.paymentStatus]}</span></div>
    </div>
    ${o.status !== "cancelled" ? `<div class="timeline">${FLOW.map((f, i) => `<div class="${i <= idx ? "on" : ""}">${STATUS_LABEL[f]}</div>`).join("")}</div>` : `<div class="notice">This order was cancelled.</div>`}
    <div class="two-col">
      <div class="card">
        <h3>Items</h3>
        ${o.items.map((i: any) => `<div class="summary"><div class="r"><span>${i.quantity} × ${esc(i.name)} <span class="muted mono" style="font-size:.8rem">(${esc(i.unit)})</span></span><span>${money(i.unitPriceCents * i.quantity, o.currency)}</span></div></div>`).join("")}
        <div class="summary" style="position:static"><div class="r"><span>Delivery</span><span>${o.deliveryFeeCents ? money(o.deliveryFeeCents, o.currency) : "Free"}</span></div><div class="r total"><span>Total</span><span>${money(o.totalCents, o.currency)}</span></div></div>
        <h3 style="margin-top:1.6rem">Payment</h3>
        <p>${o.paymentMethod === "momo" ? `Mobile money · ref <b class="mono">${esc(o.paymentReference)}</b>${o.paymentStatus === "awaiting_confirmation" ? " — we're confirming your payment." : ""}` : `Cash on delivery — please have ${money(o.totalCents, o.currency)} ready.`}</p>
      </div>
      <div class="card">
        <h3>Delivery</h3>
        <p><b>${esc(o.customerName)}</b><br/>${esc(o.street)}${o.landmark ? `<br/><span class="muted">${esc(o.landmark)}</span>` : ""}<br/>${esc(o.city)}, ${esc(o.region)}<br/>${esc(countryName(o.country))}</p>
        <h3 style="margin-top:1.4rem">Verification</h3>
        <ul class="checklist">
          <li>${o.verification.email.verified ? `<span class="y">✓</span> Email verified` : `<span class="w">!</span> Email to be confirmed by phone`} <span class="muted">${esc(o.verification.email.target)}</span></li>
          <li>${o.verification.phone.verified ? `<span class="y">✓</span> Phone verified` : `<span class="w">!</span> We'll call to confirm`} <span class="muted">${esc(o.verification.phone.target)}</span></li>
          <li><span class="y">✓</span> Delivery address checked</li>
        </ul>
        ${["placed"].includes(o.status) ? `<button class="btn ghost small" id="cancel" style="margin-top:1.4rem">Cancel order</button>` : ""}
        ${s?.storePhone ? `<p class="muted" style="font-size:.88rem;margin-top:1rem">Need to change something? Call <a href="tel:${esc(s.storePhone)}">${esc(s.storePhone)}</a>.</p>` : ""}
      </div>
    </div>
  </div>`;
  $("#cancel", app)?.addEventListener("click", async (e) => {
    if (!confirm("Cancel this order?")) return;
    await withLoading(e.currentTarget as HTMLButtonElement, async () => {
      try { await api(`/api/orders/${o.code}/cancel`, { method: "POST", body: {} }); toast("Order cancelled."); orderDetail(app, code, refreshMe); }
      catch (err) { toast((err as ApiError).message, true); }
    });
  });
}
