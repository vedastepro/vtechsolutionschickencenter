import { categoryInfo, type Category } from "./art";
import { $, $$, api, ApiError, countryName, esc, field, money, productArt, showFieldErrors, state, STATUS_LABEL, toast, withLoading, type Product } from "./lib";

const TABS = [["", "Orders"], ["products", "Products"], ["settings", "Store settings"], ["subscribers", "Subscribers"]] as const;

export async function admin(app: HTMLElement, tab = "") {
  if (!state.me.user?.isAdmin) {
    app.innerHTML = `<div class="page empty"><h2>Admins only</h2><p class="muted">Sign in with a store administrator account to manage orders and products.</p><a class="btn" href="#/account">Go to account</a></div>`;
    return;
  }
  app.innerHTML = `<div class="page"><span class="eyebrow">Store admin</span><h1 style="font-size:clamp(2.2rem,4.6vw,3.4rem)">${TABS.find(([k]) => k === tab)?.[1] ?? "Orders"}</h1>
    <div class="admin-tabs">${TABS.map(([k, l]) => `<a class="chip ${k === tab ? "on" : ""}" href="#/admin${k ? "/" + k : ""}">${l}</a>`).join("")}</div><div id="admin-body"><div class="skeleton"></div></div></div>`;
  const body = $("#admin-body", app);
  try {
    if (tab === "products") await products(body);
    else if (tab === "settings") await settings(body);
    else if (tab === "subscribers") await subs(body);
    else await ordersTab(body);
  } catch (e) {
    body.innerHTML = `<p class="form-error">${esc((e as Error).message)}</p>`;
  }
}

/* ------------------------------------------------------------------ orders */
function vBadges(o: any) {
  const b = (ok: boolean, warn: boolean, label: string) => `<span class="vb ${ok ? "" : warn ? "warn" : "no"}">${ok ? "✓" : warn ? "!" : "✗"} ${label}</span>`;
  const c = o.checks ?? {};
  return `<div class="vbadges">
    ${b(o.verification.email.verified, c.email === "manual_check_required", "email")}
    ${b(o.verification.phone.verified, c.phone === "manual_check_required", "phone")}
    ${b(c.emailDomain === "ok", c.emailDomain === "unknown", "mail domain")}
    ${o.paymentMethod === "momo" ? b(o.paymentStatus === "paid", o.paymentStatus === "awaiting_confirmation", "payment") : ""}
  </div>`;
}

async function ordersTab(body: HTMLElement, filter = "") {
  const [stats, list] = await Promise.all([api<any>("/api/admin/stats"), api<any[]>(`/api/admin/orders${filter ? `?status=${filter}` : ""}`)]);
  body.innerHTML = `
    <div class="stats">
      <div class="stat"><b>${stats.open}</b><span>Open orders</span></div>
      <div class="stat ${stats.toConfirmPayment ? "alert" : ""}"><b>${stats.toConfirmPayment}</b><span>Mobile money to confirm</span></div>
      <div class="stat"><b>${money(stats.revenue)}</b><span>Paid / delivered revenue</span></div>
      <div class="stat"><b>${stats.orders}</b><span>Verified orders, all time</span></div>
      <div class="stat"><b>${stats.abandoned}</b><span>Stopped at verification</span></div>
      <div class="stat"><b>${stats.subscribers}</b><span>Newsletter subscribers</span></div>
    </div>
    ${stats.lowStock.length ? `<div class="notice"><b>Low stock:</b> ${stats.lowStock.map((p: Product) => `${esc(p.name)} (${p.stock})`).join(", ")}</div>` : ""}
    <div class="filters">${[["", "All active"], ["placed", "New"], ["confirmed", "Confirmed"], ["out_for_delivery", "Out for delivery"], ["delivered", "Delivered"], ["cancelled", "Cancelled"], ["awaiting_verification", "Unverified"]].map(([k, l]) => `<button class="chip ${k === filter ? "on" : ""}" data-f="${k}" style="background:${k === filter ? "" : "none"};cursor:pointer">${l}</button>`).join("")}</div>
    ${list.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Order</th><th>Customer</th><th>Checks</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead>
      <tbody>${list.map((o) => `<tr>
        <td><button class="link mono" data-open="${esc(o.code)}">${esc(o.code)}</button><div class="muted" style="font-size:.8rem">${new Date(o.placedAt ?? o.createdAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</div></td>
        <td><b>${esc(o.customerName)}</b><div style="font-size:.84rem"><a href="tel:${esc(o.phoneFull)}">${esc(o.phoneFull)}</a></div><div class="muted" style="font-size:.8rem">${esc(o.city)}, ${esc(o.region)}</div></td>
        <td>${vBadges(o)}</td>
        <td><b>${money(o.totalCents, o.currency)}</b><div class="muted" style="font-size:.8rem">${o.paymentMethod === "momo" ? `MoMo <span class="mono">${esc(o.paymentReference ?? "")}</span>` : "Cash on delivery"}</div></td>
        <td><select data-pay="${esc(o.code)}" aria-label="Payment status">${["unpaid", "awaiting_confirmation", "paid", "refunded"].map((s) => `<option value="${s}" ${s === o.paymentStatus ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}</select></td>
        <td>${o.status === "awaiting_verification" ? `<span class="status ${o.status}">Unverified</span>` : `<select data-status="${esc(o.code)}" aria-label="Order status">${["placed", "confirmed", "out_for_delivery", "delivered", "cancelled"].map((s) => `<option value="${s}" ${s === o.status ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}</select>`}</td>
      </tr>`).join("")}</tbody></table></div>`
      : `<div class="empty card"><h3>No orders here yet</h3><p class="muted">Share your product links on WhatsApp and Facebook to bring in your first customers.</p></div>`}
    <dialog id="od"></dialog>`;

  $$<HTMLButtonElement>("[data-f]", body).forEach((b) => b.addEventListener("click", () => ordersTab(body, b.dataset.f)));
  const patch = async (code: string, data: any, sel: HTMLSelectElement) => {
    if (data.status === "cancelled" && !confirm(`Cancel ${code}? Stock will be returned.`)) { ordersTab(body, filter); return; }
    sel.disabled = true;
    try { await api(`/api/admin/orders/${code}`, { method: "PATCH", body: data }); toast(`${code} updated — customer notified by email.`); }
    catch (e) { toast((e as Error).message, true); ordersTab(body, filter); }
    finally { sel.disabled = false; }
  };
  $$<HTMLSelectElement>("[data-status]", body).forEach((s) => s.addEventListener("change", () => patch(s.dataset.status!, { status: s.value }, s)));
  $$<HTMLSelectElement>("[data-pay]", body).forEach((s) => s.addEventListener("change", () => patch(s.dataset.pay!, { paymentStatus: s.value }, s)));
  $$<HTMLButtonElement>("[data-open]", body).forEach((b) => b.addEventListener("click", () => {
    const o = list.find((x) => x.code === b.dataset.open);
    const d = $<HTMLDialogElement>("#od", body);
    const c = o.checks ?? {};
    const yes = (ok: boolean, warn = false) => `<span class="${ok ? "y" : warn ? "w" : "n"}">${ok ? "✓" : warn ? "!" : "✗"}</span>`;
    d.innerHTML = `<div class="card"><div style="display:flex;justify-content:space-between;align-items:start"><h3 class="mono" style="font-family:var(--mono)">${esc(o.code)}</h3><button class="btn ghost small" data-close>Close</button></div>
      <p><b>${esc(o.customerName)}</b><br/><a href="tel:${esc(o.phoneFull)}">${esc(o.phoneFull)}</a> · <a href="mailto:${esc(o.emailFull)}">${esc(o.emailFull)}</a><br/>${esc(o.street)}${o.landmark ? ` (${esc(o.landmark)})` : ""}, ${esc(o.city)}, ${esc(o.region)}, ${esc(countryName(o.country))}</p>
      ${o.notes ? `<p class="notice">${esc(o.notes)}</p>` : ""}
      <h4>Verification report</h4>
      <ul class="checklist">
        <li>${yes(o.verification.email.verified, c.email === "manual_check_required")} Email ${o.verification.email.verified ? (c.email === "account_confirmed" ? "confirmed via account sign-up link" : "verified with one-time code") : "NOT verified — confirm by phone before dispatch"}</li>
        <li>${yes(o.verification.phone.verified, c.phone === "manual_check_required")} Phone ${o.verification.phone.verified ? (c.phone === "previously_verified" ? "verified on an earlier order" : "verified with SMS code") : "NOT verified — call the customer before dispatch"}</li>
        <li>${yes(c.emailDomain === "ok", c.emailDomain === "unknown")} Email domain ${c.emailDomain === "ok" ? "has working mail servers" : "could not be checked"}</li>
        <li>${yes(true)} Phone is a valid ${esc(String(c.phoneType ?? "").toLowerCase().replace(/_/g, " "))} number for ${esc(countryName(o.country))}</li>
        <li>${yes(true)} Name and address passed completeness checks</li>
        <li>${yes(true)} Prices and stock calculated on the server</li>
        ${o.paymentMethod === "momo" ? `<li>${yes(o.paymentStatus === "paid", o.paymentStatus === "awaiting_confirmation")} Mobile money ref <b class="mono">${esc(o.paymentReference)}</b>${o.paymentPhone ? ` from ${esc(o.paymentPhone)}` : ""} — ${o.paymentStatus === "paid" ? "confirmed" : "match it on your statement, then set payment to Paid"}</li>` : `<li>${yes(true)} Cash on delivery</li>`}
      </ul>
      <h4 style="margin-top:1.2rem">Items</h4>
      ${o.items.map((i: any) => `<div class="summary"><div class="r"><span>${i.quantity} × ${esc(i.name)} (${esc(i.unit)})</span><span>${money(i.unitPriceCents * i.quantity, o.currency)}</span></div></div>`).join("")}
      <div class="summary"><div class="r"><span>Delivery</span><span>${money(o.deliveryFeeCents, o.currency)}</span></div><div class="r total"><span>Total</span><span>${money(o.totalCents, o.currency)}</span></div></div>
    </div>`;
    $("[data-close]", d).addEventListener("click", () => d.close());
    d.showModal();
  }));
}

/* ------------------------------------------------------------------ products */
async function products(body: HTMLElement) {
  const list = await api<Product[]>("/api/admin/products");
  const cur = state.store?.currency ?? "USD";
  body.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;gap:1rem;flex-wrap:wrap"><p class="muted" style="margin:0">${list.length} products. Featured products appear on the home page.</p><button class="btn red" id="new">Add product</button></div>
    <div class="table-wrap"><table><thead><tr><th></th><th>Product</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody>
    ${list.map((p) => `<tr>
      <td><div class="thumb cat-bg-${p.category}" style="width:56px;height:56px;border-radius:12px;overflow:hidden;display:grid;place-items:center">${productArt(p)}</div></td>
      <td><b>${esc(p.name)}</b><div class="muted" style="font-size:.82rem">${esc(categoryInfo[p.category]?.label ?? p.category)} · ${esc(p.unit)}</div></td>
      <td>${money(p.priceCents)}</td>
      <td class="${p.stock < 20 ? "" : ""}" style="${p.stock < 20 ? "color:var(--danger);font-weight:600" : ""}">${p.stock}</td>
      <td>${p.active ? `<span class="status delivered">Live</span>` : `<span class="status cancelled">Hidden</span>`} ${p.featured ? `<span class="vb">featured</span>` : ""}</td>
      <td><button class="btn small ghost" data-edit="${p.id}">Edit</button></td></tr>`).join("")}
    </tbody></table></div><dialog id="pd"></dialog>`;

  const open = (p?: Product) => {
    const d = $<HTMLDialogElement>("#pd", body);
    d.innerHTML = `<form class="card" id="pf" novalidate>
      <div style="display:flex;justify-content:space-between;align-items:start"><h3>${p ? "Edit product" : "New product"}</h3><button type="button" class="btn ghost small" data-close>Close</button></div>
      <div class="form-error" id="pf-err"></div>
      ${field("name", "Name", `required value="${esc(p?.name ?? "")}"`)}
      <div class="row">
        <div class="field"><label for="f-category">Category</label><select id="f-category" name="category">${(Object.keys(categoryInfo) as Category[]).map((c) => `<option value="${c}" ${p?.category === c ? "selected" : ""}>${categoryInfo[c].label}</option>`).join("")}</select><span class="err"></span></div>
        ${field("unit", "Sold as (unit)", `value="${esc(p?.unit ?? "")}" placeholder="tray of 30, per bird, 50 kg bag"`)}
      </div>
      <div class="row">
        ${field("price", `Price (${esc(cur)})`, `type="number" step="0.01" min="0" required value="${p ? (p.priceCents / 100).toFixed(2) : ""}"`)}
        ${field("stock", "In stock", `type="number" min="0" step="1" value="${p?.stock ?? 0}"`)}
      </div>
      ${field("minOrder", "Minimum order quantity", `type="number" min="1" step="1" value="${p?.minOrder ?? 1}"`)}
      <div class="field"><label for="f-description">Description</label><textarea id="f-description" name="description">${esc(p?.description ?? "")}</textarea><span class="err"></span></div>
      <label style="display:flex;gap:.5rem;align-items:center;margin-bottom:.6rem"><input type="checkbox" name="featured" ${p?.featured ? "checked" : ""}/> Feature on home page</label>
      <label style="display:flex;gap:.5rem;align-items:center;margin-bottom:1rem"><input type="checkbox" name="active" ${p?.active ?? true ? "checked" : ""}/> Visible in shop</label>
      <div class="field"><label for="f-image">Photo ${p?.image ? "(replace)" : ""}</label><input type="file" id="f-image" name="image" accept="image/jpeg,image/png,image/webp,image/avif,image/gif"/><span class="hint">JPG, PNG or WebP under 5 MB. Square photos look best.</span><span class="err"></span></div>
      <div style="display:flex;gap:.6rem;justify-content:space-between;flex-wrap:wrap">
        <button class="btn red">Save product</button>
        ${p ? `<button type="button" class="btn ghost" data-del>Delete</button>` : ""}
      </div>
    </form>`;
    const f = $<HTMLFormElement>("#pf", d);
    $("[data-close]", d).addEventListener("click", () => d.close());
    $("[data-del]", d)?.addEventListener("click", async () => {
      if (!confirm(`Delete ${p!.name}? Products with past orders are hidden instead.`)) return;
      try { const r = await api<any>(`/api/admin/products/${p!.id}`, { method: "DELETE" }); toast(r.archived ? "Product hidden (it has past orders)." : "Product deleted."); d.close(); products(body); }
      catch (e) { toast((e as Error).message, true); }
    });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      const data = {
        name: fd.get("name"), category: fd.get("category"), unit: fd.get("unit"), description: fd.get("description"),
        priceCents: Math.round(Number(fd.get("price")) * 100), stock: Number(fd.get("stock")), minOrder: Number(fd.get("minOrder")),
        featured: fd.get("featured") === "on", active: fd.get("active") === "on",
      };
      await withLoading($("button.btn.red", f) as HTMLButtonElement, async () => {
        try {
          const saved = await api<Product>(p ? `/api/admin/products/${p.id}` : "/api/admin/products", { method: p ? "PATCH" : "POST", body: data });
          const img = fd.get("image");
          if (img instanceof File && img.size) {
            const up = new FormData(); up.set("image", img);
            await api(`/api/admin/products/${saved.id}/image`, { form: up });
          }
          toast("Product saved.");
          d.close();
          products(body);
        } catch (err) {
          const ae = err as ApiError;
          $("#pf-err", f).textContent = ae.message;
          showFieldErrors(f, ae.fields?.priceCents ? { ...ae.fields, price: ae.fields.priceCents } : ae.fields);
        }
      });
    });
    d.showModal();
  };
  $("#new", body).addEventListener("click", () => open());
  $$<HTMLButtonElement>("[data-edit]", body).forEach((b) => b.addEventListener("click", () => open(list.find((p) => p.id === Number(b.dataset.edit)))));
}

/* ------------------------------------------------------------------ settings */
async function settings(body: HTMLElement) {
  const s = await api<any>("/api/admin/settings");
  const amt = (c: number) => (c / 100).toFixed(2);
  body.innerHTML = `<div class="two-col">
    <form class="card" id="sf" novalidate>
      <h3>Pricing & delivery</h3>
      <div class="row">${field("currency", "Currency (3-letter code)", `value="${esc(s.currency)}" maxlength="3" style="text-transform:uppercase"`, "e.g. RWF, KES, UGX, TZS, NGN, USD")}${field("deliveryFee", "Delivery fee", `type="number" step="0.01" min="0" value="${amt(s.deliveryFeeCents)}"`)}</div>
      ${field("freeOver", "Free delivery on orders over (0 = never)", `type="number" step="0.01" min="0" value="${amt(s.freeDeliveryOverCents)}"`)}
      <h3 style="margin-top:1rem">Where you deliver</h3>
      <div class="row">${field("defaultCountry", "Default country (2-letter code)", `value="${esc(s.defaultCountry)}" maxlength="2" style="text-transform:uppercase"`, "Pre-selected at checkout, e.g. RW, KE, UG")}${field("allowedCountries", "Delivery countries", `value="${esc(s.allowedCountries.join(", "))}"`, "Comma-separated codes. Leave empty to accept any country.")}</div>
      <h3 style="margin-top:1rem">Mobile money</h3>
      <div class="row">${field("momoNumber", "Receiving number", `value="${esc(s.momoNumber)}"`, "Leave empty to offer cash on delivery only.")}${field("momoName", "Registered name", `value="${esc(s.momoName)}"`)}</div>
      <h3 style="margin-top:1rem">Contact & promotion</h3>
      <div class="row">${field("storePhone", "Store phone", `value="${esc(s.storePhone)}"`)}${field("whatsapp", "WhatsApp number (international, digits)", `value="${esc(s.whatsapp)}"`)}</div>
      ${field("storeEmail", "Order notification email", `type="email" value="${esc(s.storeEmail)}"`, "We email new orders here.")}
      ${field("announcement", "Announcement bar", `value="${esc(s.announcement)}" maxlength="240"`, "Shown at the top of every page. Great for promotions.")}
      <button class="btn red">Save settings</button>
    </form>
    <aside class="card"><h3>Verification services</h3>
      <ul class="checklist">
        <li>${s.verification.email ? `<span class="y">✓</span> Email codes are being sent` : `<span class="w">!</span> Email provider not connected`}</li>
        <li>${s.verification.sms ? `<span class="y">✓</span> SMS codes are being sent` : `<span class="w">!</span> SMS provider not connected`}</li>
      </ul>
      <p class="muted" style="font-size:.9rem;margin-top:1rem">Account emails are always verified through the sign-up confirmation link. While a code provider isn't connected, affected orders are flagged in red so your team can confirm them with a phone call before dispatch.</p>
    </aside></div>`;
  const f = $<HTMLFormElement>("#sf", body);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const g = (k: string) => String(fd.get(k) ?? "").trim();
    await withLoading($("button.btn", f) as HTMLButtonElement, async () => {
      try {
        const saved = await api<any>("/api/admin/settings", {
          method: "PUT",
          body: {
            currency: g("currency").toUpperCase(), deliveryFeeCents: Math.round(Number(g("deliveryFee")) * 100), freeDeliveryOverCents: Math.round(Number(g("freeOver")) * 100),
            defaultCountry: g("defaultCountry").toUpperCase(), allowedCountries: g("allowedCountries").split(/[\s,]+/).filter(Boolean),
            momoNumber: g("momoNumber"), momoName: g("momoName"), storePhone: g("storePhone"), whatsapp: g("whatsapp"), storeEmail: g("storeEmail"), announcement: g("announcement"),
          },
        });
        Object.assign(state.store!, saved);
        window.dispatchEvent(new Event("store-change"));
        toast("Settings saved.");
      } catch (err) { toast((err as Error).message, true); }
    });
  });
}

async function subs(body: HTMLElement) {
  const list = await api<any[]>("/api/admin/subscribers");
  body.innerHTML = list.length
    ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem"><p class="muted" style="margin:0">${list.length} people asked to hear about new batches.</p><button class="btn small" id="copy">Copy all emails</button></div>
       <div class="table-wrap"><table><thead><tr><th>Email</th><th>Joined</th></tr></thead><tbody>${list.map((s) => `<tr><td>${esc(s.email)}</td><td>${new Date(s.createdAt).toLocaleDateString()}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty card"><h3>No subscribers yet</h3><p class="muted">The “Hatch-day alerts” form on the home page collects them.</p></div>`;
  $("#copy", body)?.addEventListener("click", async () => { await navigator.clipboard.writeText(list.map((s) => s.email).join(", ")); toast("Emails copied."); });
}
