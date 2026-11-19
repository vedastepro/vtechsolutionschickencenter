import { art, categoryInfo, type Category } from "./art";
import { $, $$, allProducts, api, ApiError, cart, esc, money, productArt, state, toast, withLoading, type Product } from "./lib";

const CATS = Object.keys(categoryInfo) as Category[];

function card(p: Product) {
  const out = p.stock <= 0;
  const low = !out && p.stock < 20;
  return `<article class="product ${out ? "sold-out" : ""}">
    <a class="media cat-bg-${p.category}" href="#/p/${esc(p.slug)}">
      ${out ? `<span class="badge low">Sold out</span>` : low ? `<span class="badge low">Only ${p.stock} left</span>` : p.featured ? `<span class="badge">Popular</span>` : ""}
      ${productArt(p)}
    </a>
    <div class="body">
      <span class="unit">${esc(categoryInfo[p.category]?.label ?? p.category)} · ${esc(p.unit)}</span>
      <h3><a href="#/p/${esc(p.slug)}">${esc(p.name)}</a></h3>
      <div class="foot">
        <span class="price">${money(p.priceCents)}</span>
        <button class="btn small red" data-add="${p.id}" ${out ? "disabled" : ""}>${out ? "Sold out" : "Add to cart"}</button>
      </div>
    </div>
  </article>`;
}

function bindAdd(root: HTMLElement, list: Product[]) {
  $$<HTMLButtonElement>("[data-add]", root).forEach((b) =>
    b.addEventListener("click", () => {
      const p = list.find((x) => x.id === Number(b.dataset.add));
      if (!p) return;
      cart.add(p.id, Math.max(1, p.minOrder));
      toast(`Added ${p.name} to your cart`);
    }),
  );
}

const skeletons = (n: number) => Array.from({ length: n }, () => `<div class="skeleton"></div>`).join("");

/* ------------------------------------------------------------------ home */
export async function home(app: HTMLElement) {
  const s = state.store;
  app.innerHTML = `
  <section class="hero">
    <div>
      <span class="eyebrow">Poultry, straight from the yard</span>
      <h1><span class="line">Hatched here.</span><span class="line"><em>Raised</em> right.</span><span class="line">At your gate.</span></h1>
      <p class="lead">Day-old chicks, eggs collected this morning, healthy market birds and the feed to raise them — ordered in a few taps and delivered by people who know poultry.</p>
      <div class="hero-cta"><a class="btn red" href="#/shop">Shop the yard</a><a class="btn ghost" href="#/about">How ordering works</a></div>
    </div>
    <div class="hero-art">
      <div class="egg-big">${art.chicks}</div>
      <svg class="stamp" viewBox="0 0 132 132" aria-hidden="true"><defs><path id="c" d="M66 66m-50 0a50 50 0 1 1 100 0a50 50 0 1 1-100 0"/></defs>
        <circle cx="66" cy="66" r="64" fill="#f5ecd9" stroke="#9c3b1c" stroke-width="2"/><text><textPath href="#c">verified orders · farm fresh · delivered ·</textPath></text>
        <circle cx="66" cy="66" r="14" fill="#e8a531"/></svg>
      <div class="hero-tag"><b>06:00</b>eggs collected daily</div>
    </div>
  </section>

  <section class="cats" aria-label="Shop by category">
    ${CATS.map((c) => `<a class="cat ${c}" href="#/shop/${c}"><div><h3>${categoryInfo[c].label}</h3><p>${categoryInfo[c].blurb}</p></div><span class="go">Browse →</span><div class="cat-art">${art[c]}</div></a>`).join("")}
  </section>

  <section class="section">
    <div class="section-head"><div><span class="eyebrow">This week in the yard</span><h2>Most ordered right now</h2></div><a class="btn ghost small" href="#/shop">See everything</a></div>
    <div class="grid" id="featured">${skeletons(4)}</div>
  </section>

  <div class="marquee" aria-hidden="true"><div class="marquee-track">${Array(2).fill(["Vaccinated chicks", "Eggs graded by hand", "Live & dressed birds", "Starter · finisher · layers mash", "Every order verified"].map((t) => `<span>${t}</span>`).join("")).join("")}</div></div>

  <section class="section">
    <div class="section-head"><div><span class="eyebrow">Why farmers order from us</span><h2>Honest birds, honest orders.</h2></div></div>
    <div class="promise">
      <div class="p"><div class="num">01</div><h3>Healthy from day one</h3><p class="muted">Chicks leave the hatchery vaccinated against Marek's and Newcastle, with a care sheet for the first two weeks.</p></div>
      <div class="p"><div class="num">02</div><h3>Every order is verified</h3><p class="muted">We confirm your email and phone with one-time codes and check your delivery address, so no rider is sent to a fake order and your price stays fair.</p></div>
      <div class="p"><div class="num">03</div><h3>Pay the way you like</h3><p class="muted">Cash on delivery${s?.momoNumber ? " or mobile money" : ""}. ${s && s.freeDeliveryOverCents ? `Delivery is free on orders over ${money(s.freeDeliveryOverCents)}.` : ""}</p></div>
    </div>
  </section>

  <section class="section">
    <div class="newsletter">
      <div><span class="eyebrow">Hatch-day alerts</span><h2 style="margin-top:.4rem">Be first when new chicks hatch.</h2><p class="muted">One short email when a batch is ready, plus seasonal feed offers. Nothing else.</p></div>
      <form id="sub" novalidate><input type="email" name="email" placeholder="you@example.com" required aria-label="Email address" /><button class="btn red">Notify me</button></form>
    </div>
  </section>`;

  const subForm = $<HTMLFormElement>("#sub", app);
  subForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (subForm.elements.namedItem("email") as HTMLInputElement).value;
    await withLoading($("button", subForm) as HTMLButtonElement, async () => {
      try { await api("/api/subscribe", { body: { email } }); subForm.reset(); toast("You're on the list. Thank you!"); }
      catch (err) { toast((err as Error).message, true); }
    });
  });

  try {
    const list = await allProducts();
    const featured = list.filter((p) => p.featured).slice(0, 4);
    const el = $("#featured", app);
    el.innerHTML = (featured.length ? featured : list.slice(0, 4)).map(card).join("") || `<p class="muted">New stock is on its way.</p>`;
    bindAdd(el, list);
  } catch {
    $("#featured", app).innerHTML = `<p class="form-error">We couldn't load products. Refresh to try again.</p>`;
  }
}

/* ------------------------------------------------------------------ shop */
export async function shop(app: HTMLElement, category?: string) {
  const cat = CATS.includes(category as Category) ? (category as Category) : undefined;
  app.innerHTML = `<div class="page">
    <span class="eyebrow">${cat ? "Category" : "The whole yard"}</span>
    <h1 style="font-size:clamp(2.4rem,5vw,4rem)">${cat ? categoryInfo[cat].label : "Shop everything"}</h1>
    <p class="muted" style="max-width:40em">${cat ? categoryInfo[cat].blurb : "Chicks, eggs, mature chickens and feeds. Prices include careful packing; delivery is added at checkout."}</p>
    <div class="filters" style="margin-top:1.6rem">
      <a class="chip ${!cat ? "on" : ""}" href="#/shop">All</a>
      ${CATS.map((c) => `<a class="chip ${cat === c ? "on" : ""}" href="#/shop/${c}">${categoryInfo[c].label}</a>`).join("")}
    </div>
    <div class="grid" id="list">${skeletons(8)}</div>
  </div>`;
  try {
    const list = await allProducts();
    const shown = cat ? list.filter((p) => p.category === cat) : list;
    const el = $("#list", app);
    el.innerHTML = shown.length
      ? shown.map(card).join("")
      : `<div class="empty" style="grid-column:1/-1">${art.basket}<h3>Nothing here yet</h3><p class="muted">This shelf is being restocked. Check back soon or browse another category.</p></div>`;
    bindAdd(el, list);
  } catch {
    $("#list", app).innerHTML = `<p class="form-error">We couldn't load products. Refresh to try again.</p>`;
  }
}

/* ------------------------------------------------------------------ product */
export async function product(app: HTMLElement, slug: string) {
  app.innerHTML = `<div class="page"><div class="pdp"><div class="skeleton" style="aspect-ratio:1"></div><div class="skeleton"></div></div></div>`;
  let p: Product;
  try { p = await api<Product>(`/api/products/${encodeURIComponent(slug)}`); }
  catch (e) {
    app.innerHTML = `<div class="page empty">${art.basket}<h2>Product not found</h2><p class="muted">It may have sold out or been removed.</p><a class="btn" href="#/shop">Back to the shop</a></div>`;
    return;
  }
  document.title = `${p.name} — Chicken Products Center`;
  const url = `${location.origin}/#/p/${p.slug}`;
  const shareText = `${p.name} — ${money(p.priceCents)} (${p.unit}) at Chicken Products Center`;
  const out = p.stock <= 0;
  app.innerHTML = `<div class="page">
    <p><a href="#/shop/${p.category}" class="muted">← ${esc(categoryInfo[p.category]?.label)}</a></p>
    <div class="pdp">
      <div class="media cat-bg-${p.category}">${productArt(p, true)}</div>
      <div>
        <span class="eyebrow">${esc(categoryInfo[p.category]?.label)}</span>
        <h1 style="font-size:clamp(2.2rem,4.4vw,3.6rem);margin-top:.4rem">${esc(p.name)}</h1>
        <div class="price">${money(p.priceCents)} <span class="unit muted mono" style="font-size:.9rem;font-weight:400">/ ${esc(p.unit)}</span></div>
        <p style="font-size:1.08rem;color:var(--ink-2)">${esc(p.description)}</p>
        <ul class="facts">
          <li><span>Availability</span><b>${out ? "Sold out" : p.stock < 20 ? `Only ${p.stock} left` : "In stock"}</b></li>
          <li><span>Sold as</span><b>${esc(p.unit)}</b></li>
          ${p.minOrder > 1 ? `<li><span>Minimum order</span><b>${p.minOrder}</b></li>` : ""}
          <li><span>Payment</span><b>Cash on delivery${state.store?.momoNumber ? " · Mobile money" : ""}</b></li>
        </ul>
        <div style="display:flex;gap:.8rem;align-items:center;flex-wrap:wrap">
          <div class="qty"><button type="button" data-q="-1" aria-label="Fewer">−</button><input type="number" id="qty" value="${Math.max(1, p.minOrder)}" min="${Math.max(1, p.minOrder)}" max="${p.stock}" aria-label="Quantity"/><button type="button" data-q="1" aria-label="More">+</button></div>
          <button class="btn red" id="add" ${out ? "disabled" : ""}>${out ? "Sold out" : "Add to cart"}</button>
          <a class="btn ghost" href="#/cart">View cart</a>
        </div>
        <div class="share"><span class="muted" style="font-size:.9rem">Share:</span>
          <a class="chip" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}">WhatsApp</a>
          <a class="chip" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}">Facebook</a>
          <a class="chip" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}">X</a>
          <button class="chip" id="copy" style="background:none;cursor:pointer">Copy link</button>
        </div>
      </div>
    </div>
  </div>`;
  const q = $<HTMLInputElement>("#qty", app);
  const min = Math.max(1, p.minOrder);
  $$<HTMLButtonElement>("[data-q]", app).forEach((b) => b.addEventListener("click", () => {
    q.value = String(Math.min(p.stock, Math.max(min, Number(q.value) + Number(b.dataset.q))));
  }));
  $("#add", app).addEventListener("click", () => {
    const n = Math.min(p.stock, Math.max(min, Math.floor(Number(q.value) || min)));
    const inCart = cart.get().find((l) => l.productId === p.id)?.quantity ?? 0;
    if (inCart + n > p.stock) return toast(`Only ${p.stock} available — you already have ${inCart} in your cart.`, true);
    cart.add(p.id, n);
    toast(`Added ${n} × ${p.name}`);
  });
  $("#copy", app).addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(url); toast("Link copied — paste it anywhere to share."); } catch { toast(url); }
  });
}

/* ------------------------------------------------------------------ cart */
export async function cartView(app: HTMLElement) {
  const lines = cart.get();
  if (!lines.length) {
    app.innerHTML = `<div class="page empty">${art.basket}<h2>Your basket is empty</h2><p class="muted">Fresh eggs, chicks and feed are a click away.</p><a class="btn red" href="#/shop">Start shopping</a></div>`;
    return;
  }
  app.innerHTML = `<div class="page"><h1 style="font-size:clamp(2.4rem,5vw,4rem)">Your cart</h1><div class="two-col"><div class="skeleton"></div><div class="skeleton"></div></div></div>`;
  let list: Product[];
  try { list = await allProducts(true); } catch { app.innerHTML = `<div class="page"><p class="form-error">Couldn't load your cart. Refresh to try again.</p></div>`; return; }

  const render = () => {
    const ls = cart.get();
    const rows = ls.map((l) => ({ l, p: list.find((x) => x.id === l.productId) })).filter((r) => r.p) as { l: { productId: number; quantity: number }; p: Product }[];
    if (rows.length !== ls.length) cart.set(rows.map((r) => r.l));
    if (!rows.length) return cartView(app);
    const subtotal = rows.reduce((s, r) => s + r.p.priceCents * r.l.quantity, 0);
    const st = state.store!;
    const fee = st.freeDeliveryOverCents && subtotal >= st.freeDeliveryOverCents ? 0 : st.deliveryFeeCents;
    const problems = rows.filter((r) => r.l.quantity > r.p.stock || r.l.quantity < r.p.minOrder);
    app.innerHTML = `<div class="page">
      <h1 style="font-size:clamp(2.4rem,5vw,4rem)">Your cart</h1>
      <div class="two-col">
        <div>${rows.map(({ l, p }) => `<div class="line-item">
            <a class="thumb cat-bg-${p.category}" href="#/p/${esc(p.slug)}">${productArt(p)}</a>
            <div><b>${esc(p.name)}</b><div class="unit mono muted" style="font-size:.82rem">${money(p.priceCents)} / ${esc(p.unit)}</div>
              ${l.quantity > p.stock ? `<div style="color:var(--danger);font-size:.85rem">Only ${p.stock} in stock</div>` : ""}
              ${l.quantity < p.minOrder ? `<div style="color:var(--danger);font-size:.85rem">Minimum order is ${p.minOrder}</div>` : ""}
              <div style="display:flex;gap:.8rem;align-items:center;margin-top:.5rem">
                <div class="qty"><button data-dec="${p.id}" aria-label="Fewer">−</button><input value="${l.quantity}" data-set="${p.id}" type="number" min="1" aria-label="Quantity"/><button data-inc="${p.id}" aria-label="More">+</button></div>
                <button class="link" data-rm="${p.id}">Remove</button></div></div>
            <b class="price" style="font-size:1.2rem">${money(p.priceCents * l.quantity)}</b>
          </div>`).join("")}</div>
        <aside class="card summary">
          <h3>Order summary</h3>
          <div class="r"><span>Subtotal</span><span>${money(subtotal)}</span></div>
          <div class="r"><span>Delivery</span><span>${fee ? money(fee) : "Free"}</span></div>
          ${fee && st.freeDeliveryOverCents ? `<p class="muted" style="font-size:.85rem;margin:.2rem 0">Add ${money(st.freeDeliveryOverCents - subtotal)} more for free delivery.</p>` : ""}
          <div class="r total"><span>Total</span><span>${money(subtotal + fee)}</span></div>
          ${problems.length ? `<button class="btn red block" style="margin-top:1rem" disabled>Fix the items above to continue</button>` : `<a class="btn red block" style="margin-top:1rem" href="#/checkout">Continue to secure checkout</a>`}
          <p class="muted" style="font-size:.84rem;margin-top:.8rem">You'll sign in and verify your email and phone with a one-time code before the order is sent to us.</p>
        </aside>
      </div></div>`;
    $$<HTMLButtonElement>("[data-inc]", app).forEach((b) => b.onclick = () => { const l = cart.get().find((x) => x.productId === +b.dataset.inc!)!; cart.update(l.productId, l.quantity + 1); render(); });
    $$<HTMLButtonElement>("[data-dec]", app).forEach((b) => b.onclick = () => { const l = cart.get().find((x) => x.productId === +b.dataset.dec!)!; cart.update(l.productId, Math.max(1, l.quantity - 1)); render(); });
    $$<HTMLButtonElement>("[data-rm]", app).forEach((b) => b.onclick = () => { cart.update(+b.dataset.rm!, 0); render(); });
    $$<HTMLInputElement>("[data-set]", app).forEach((i) => i.onchange = () => { cart.update(+i.dataset.set!, Math.max(1, Math.floor(+i.value || 1))); render(); });
  };
  render();
}

/* ------------------------------------------------------------------ about */
export function about(app: HTMLElement) {
  const s = state.store;
  app.innerHTML = `<div class="page" style="max-width:860px">
    <span class="eyebrow">How ordering works</span>
    <h1 style="font-size:clamp(2.4rem,5vw,4rem)">Simple for you. Safe for everyone.</h1>
    <p style="font-size:1.12rem;color:var(--ink-2)">We deliver live animals and fresh food, so every order is checked before a rider leaves the yard. Here's what happens:</p>
    <ol class="how">
      <li><div><h3>Pick your products</h3><p class="muted">Browse chicks, eggs, mature birds and feeds. Add what you need to your cart.</p></div></li>
      <li><div><h3>Sign in to your account</h3><p class="muted">Create an account with your email. We send a confirmation link to prove the inbox is really yours. You can then track every order.</p></div></li>
      <li><div><h3>Enter delivery details</h3><p class="muted">We check that your name, mobile number and address are complete and real. Phone numbers are validated for your country; email domains are checked to make sure they can receive mail.</p></div></li>
      <li><div><h3>Confirm with one-time codes</h3><p class="muted">We text a 6-digit code to your phone, and email one to you if you use a different address than your account. Codes expire after 10 minutes and lock after 5 wrong tries.</p></div></li>
      <li><div><h3>Choose how to pay</h3><p class="muted">Pay cash on delivery${s?.momoNumber ? `, or send mobile money to <b>${esc(s.momoNumber)}</b>${s.momoName ? ` (${esc(s.momoName)})` : ""} and enter the transaction ID — we confirm it before dispatch` : ""}. Prices are always calculated on our side, never in your browser.</p></div></li>
      <li><div><h3>We call, pack and deliver</h3><p class="muted">You'll get an email at each step. Track your order status anytime under “My orders”.</p></div></li>
    </ol>
    ${s?.storePhone || s?.whatsapp ? `<div class="card" style="margin-top:2rem"><h3>Questions? Talk to us.</h3><p>${s.storePhone ? `Call <a href="tel:${esc(s.storePhone)}">${esc(s.storePhone)}</a>` : ""}${s.storePhone && s.whatsapp ? " or " : ""}${s.whatsapp ? `<a href="https://wa.me/${esc(s.whatsapp)}" target="_blank" rel="noopener">message us on WhatsApp</a>` : ""}.</p></div>` : ""}
    <a class="btn red" href="#/shop" style="margin-top:2rem">Start shopping</a>
  </div>`;
}

export { ApiError };
