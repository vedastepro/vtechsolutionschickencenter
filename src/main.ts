import "./styles.css";
import { AuthError, getUser, handleAuthCallback, onAuthChange } from "@netlify/identity";
import { about, cartView, home, product, shop } from "./shop";
import { account, orderDetail, orders, resetPasswordPanel } from "./account";
import { checkout, verifyStep } from "./checkout";
import { admin } from "./admin";
import { $, $$, api, cart, esc, state, toast, type Me, type StoreInfo } from "./lib";

const app = $("#app");

async function refreshMe() {
  try {
    const u = await getUser();
    state.me = u ? await api<Me>("/api/me") : { user: null, profile: null };
  } catch {
    state.me = { user: null, profile: null };
  }
  paintHeader();
}

function paintHeader() {
  const u = state.me.user;
  const acc = $(".account-link");
  acc.textContent = u ? "Account" : "Sign in";
  ($(".orders-link") as HTMLElement).hidden = !u;
  ($(".admin-link") as HTMLElement).hidden = !u?.isAdmin;
}

function paintCart() {
  const el = $(".cart-count");
  const n = cart.count();
  if (el.textContent !== String(n)) { el.textContent = String(n); el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
}

function paintStore() {
  const s = state.store;
  if (!s) return;
  const ann = $("#announce");
  ann.hidden = !s.announcement;
  ann.textContent = s.announcement;
  $("#footer-contact").innerHTML = `<h4>Contact</h4>
    ${s.storePhone ? `<a href="tel:${esc(s.storePhone)}">${esc(s.storePhone)}</a>` : ""}
    ${s.whatsapp ? `<a href="https://wa.me/${esc(s.whatsapp)}" target="_blank" rel="noopener">WhatsApp us</a>` : ""}
    ${s.storeEmail ? `<a href="mailto:${esc(s.storeEmail)}">${esc(s.storeEmail)}</a>` : ""}
    ${!s.storePhone && !s.whatsapp && !s.storeEmail ? `<span class="muted">Open daily, 6am–6pm</span>` : ""}`;
}

const DEFAULT_TITLE = document.title;

async function route() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [path] = hash.split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  const [a, b] = parts;
  document.title = DEFAULT_TITLE;
  $$("[data-nav]").forEach((l) => l.classList.toggle("active", l.dataset.nav === (a === "shop" ? b ?? "shop" : a)));
  $("#nav").classList.remove("open");
  $(".menu-toggle").setAttribute("aria-expanded", "false");
  window.scrollTo({ top: 0 });

  if (!a) return home(app);
  switch (a) {
    case "shop": return shop(app, b);
    case "p": return product(app, b);
    case "cart": return cartView(app);
    case "about": return about(app);
    case "account": return account(app, refreshMe);
    case "orders": {
      if (!b) return orders(app, refreshMe);
      const just = sessionStorage.getItem("cpc-just-placed") === b;
      sessionStorage.removeItem("cpc-just-placed");
      return orderDetail(app, b, refreshMe, just);
    }
    case "checkout": return b ? verifyStep(app, b, refreshMe) : checkout(app, refreshMe);
    case "admin": return admin(app, b);
    default:
      app.innerHTML = `<div class="page empty"><h2>Page not found</h2><a class="btn" href="#/">Go home</a></div>`;
  }
}

async function boot() {
  $("#year").textContent = String(new Date().getFullYear());
  const toggle = $(".menu-toggle");
  toggle.addEventListener("click", () => {
    const open = $("#nav").classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  window.addEventListener("cart-change", paintCart);
  window.addEventListener("store-change", paintStore);
  window.addEventListener("storage", (e) => e.key?.startsWith("cpc-cart") && paintCart());
  paintCart();

  // Email confirmation, password recovery and invite links land here with a token in the URL hash.
  let recovery = false;
  try {
    const result = await handleAuthCallback();
    if (result?.type === "confirmation") toast("Email confirmed — you're signed in.");
    if (result?.type === "recovery") recovery = true;
    if (result) history.replaceState(null, "", location.pathname + (result.type === "confirmation" ? "#/checkout" : "#/account"));
    if (result?.type === "confirmation" && !cart.count()) history.replaceState(null, "", location.pathname + "#/account");
  } catch (e) {
    if (e instanceof AuthError) toast("That link has expired or was already used. Please try again.", true);
    history.replaceState(null, "", location.pathname + "#/account");
  }

  try { state.store = await api<StoreInfo>("/api/store"); } catch {
    state.store = { currency: "USD", deliveryFeeCents: 0, freeDeliveryOverCents: 0, defaultCountry: "", allowedCountries: [], momoNumber: "", momoName: "", storePhone: "", storeEmail: "", whatsapp: "", announcement: "", verification: { email: false, sms: false, devMode: false } };
  }
  paintStore();
  await refreshMe();
  onAuthChange(() => refreshMe());

  if (recovery) {
    app.innerHTML = `<div class="page"><div id="rp"></div></div>`;
    resetPasswordPanel($("#rp", app), () => { location.hash = "#/account"; });
  } else {
    route();
  }
  window.addEventListener("hashchange", route);
}

boot();
