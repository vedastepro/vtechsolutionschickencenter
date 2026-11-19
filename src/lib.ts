import { refreshSession } from "@netlify/identity";
import { art, type Category } from "./art";

export interface Product {
  id: number; slug: string; name: string; category: Category; description: string; priceCents: number;
  unit: string; stock: number; minOrder: number; featured: boolean; active: boolean; image: string | null;
}
export interface StoreInfo {
  currency: string; deliveryFeeCents: number; freeDeliveryOverCents: number; defaultCountry: string; allowedCountries: string[];
  momoNumber: string; momoName: string; storePhone: string; storeEmail: string; whatsapp: string; announcement: string;
  verification: { email: boolean; sms: boolean; devMode: boolean };
}
export interface Me {
  user: { id: string; email: string; name: string; roles: string[]; isAdmin: boolean } | null;
  profile: { phone: string | null; phoneVerified: boolean; fullName: string | null } | null;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>) { super(message); }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  await refreshSession().catch(() => null); // keeps the nf_jwt cookie fresh for the server
  const res = await fetch(path, {
    method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
    headers: opts.form ? undefined : opts.body ? { "content-type": "application/json" } : undefined,
    body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Request failed.", data.fields);
  return data as T;
}

/* ---------------- state */
export const state: { store: StoreInfo | null; me: Me } = { store: null, me: { user: null, profile: null } };

export function money(cents: number, currency = state.store?.currency ?? "USD") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
  } catch { return `${currency} ${(cents / 100).toFixed(2)}`; }
}

/* ---------------- cart (kept in the browser; prices are re-read from the server at checkout) */
export interface CartLine { productId: number; quantity: number }
const CART_KEY = "cpc-cart-v1";
export const cart = {
  get(): CartLine[] {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]").filter((l: any) => Number.isInteger(l.productId) && l.quantity > 0); } catch { return []; }
  },
  set(lines: CartLine[]) {
    localStorage.setItem(CART_KEY, JSON.stringify(lines.filter((l) => l.quantity > 0)));
    window.dispatchEvent(new Event("cart-change"));
  },
  add(productId: number, quantity: number) {
    const lines = cart.get();
    const l = lines.find((x) => x.productId === productId);
    if (l) l.quantity += quantity; else lines.push({ productId, quantity });
    cart.set(lines);
  },
  update(productId: number, quantity: number) {
    cart.set(cart.get().map((l) => (l.productId === productId ? { ...l, quantity } : l)));
  },
  clear() { cart.set([]); },
  count() { return cart.get().reduce((s, l) => s + l.quantity, 0); },
};

let productCache: { at: number; list: Product[] } | null = null;
export async function allProducts(force = false): Promise<Product[]> {
  if (!force && productCache && Date.now() - productCache.at < 60_000) return productCache.list;
  const list = await api<Product[]>("/api/products");
  productCache = { at: Date.now(), list };
  return list;
}

/* ---------------- DOM helpers */
export const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];

export function productArt(p: Pick<Product, "image" | "name" | "category">, eager = false) {
  return p.image
    ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="${eager ? "eager" : "lazy"}" />`
    : art[p.category] ?? art.basket;
}

let toastTimer: number | undefined;
export function toast(msg: string, isErr = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("err", isErr);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove("show"), 3400);
}

export async function withLoading<T>(btn: HTMLButtonElement | null, fn: () => Promise<T>): Promise<T | undefined> {
  btn?.classList.add("loading");
  if (btn) btn.disabled = true;
  try { return await fn(); } finally { btn?.classList.remove("loading"); if (btn) btn.disabled = false; }
}

/** Shows field-level errors returned by the API next to the matching inputs. */
export function showFieldErrors(form: HTMLElement, fields: Record<string, string> = {}) {
  $$(".field", form).forEach((f) => f.classList.remove("invalid"));
  for (const [k, msg] of Object.entries(fields)) {
    const input = form.querySelector(`[name="${k}"]`);
    const field = input?.closest(".field");
    if (field) {
      field.classList.add("invalid");
      const err = field.querySelector(".err");
      if (err) err.textContent = msg;
    }
  }
  const first = form.querySelector(".field.invalid input, .field.invalid select") as HTMLElement | null;
  first?.focus();
}

export function field(name: string, label: string, attrs = "", hint = "") {
  return `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" ${attrs} />${hint ? `<span class="hint">${hint}</span>` : ""}<span class="ok"></span><span class="err"></span></div>`;
}

export const STATUS_LABEL: Record<string, string> = {
  awaiting_verification: "Awaiting verification", placed: "Placed", confirmed: "Confirmed", out_for_delivery: "Out for delivery",
  delivered: "Delivered", cancelled: "Cancelled", unpaid: "Unpaid", awaiting_confirmation: "Payment check", paid: "Paid", refunded: "Refunded",
};

export const COUNTRIES: [string, string][] = (() => {
  const codes = "AO BI BJ BW CD CG CI CM DJ DZ EG ER ET GA GH GM GN GQ GW KE LR LS LY MA MG ML MR MU MW MZ NA NE NG RW SC SD SL SN SO SS ST SZ TD TG TN TZ UG ZA ZM ZW AE BE CA CH CN DE ES FR GB IN IT NL PK QA SA SE TR US".split(" ");
  const dn = new Intl.DisplayNames(["en"], { type: "region" });
  return codes.map((c) => [c, dn.of(c) ?? c] as [string, string]).sort((a, b) => a[1].localeCompare(b[1]));
})();
export const countryName = (c: string) => COUNTRIES.find(([k]) => k === c)?.[1] ?? c;
