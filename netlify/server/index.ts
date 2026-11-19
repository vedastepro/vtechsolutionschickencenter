import { Hono, type Context } from "hono";
import { getContext } from "@netlify/server";
import { getStore } from "@netlify/blobs";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { db, products, orders, orderItems, verificationCodes, customers, subscribers } from "../../db/index.js";
import { getAuthUser, isAdmin, type AuthUser } from "../../server/auth.js";
import {
  checkAddress, checkEmail, checkName, checkPaymentReference, checkPhone, maskEmail, maskPhone, type FieldErrors,
} from "../../server/validate.js";
import { emailConfigured, isNonProduction, sendCode, sendEmail, smsConfigured } from "../../server/notify.js";
import { deliveryFee, getStoreSettings, saveStoreSettings } from "../../server/store.js";

export const config = { path: "/api/*" };

const app = new Hono();
const CATEGORIES = ["chicks", "eggs", "mature", "feeds"] as const;
const CODE_TTL_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 45_000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 5;

type Channel = "email" | "phone";
const MANUAL = "manual_check_required";

class HttpError extends Error {
  status: number;
  fields?: FieldErrors;
  constructor(status: number, message: string, fields?: FieldErrors) { super(message); this.status = status; this.fields = fields; }
}

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message, fields: err.fields }, err.status as any);
  console.error(err);
  return c.json({ error: "Something went wrong on our side. Please try again." }, 500);
});

async function requireUser(c: Context): Promise<AuthUser> {
  const user = await getAuthUser(c);
  if (!user) throw new HttpError(401, "Please sign in to continue.");
  if (!user.emailConfirmed) throw new HttpError(403, "Please confirm your email address first.");
  return user;
}
async function requireAdmin(c: Context): Promise<AuthUser> {
  const user = await requireUser(c);
  if (!isAdmin(user)) throw new HttpError(403, "Admins only.");
  return user;
}
async function body<T = any>(c: Context): Promise<T> {
  try { return await c.req.json(); } catch { throw new HttpError(400, "Invalid request body."); }
}
const later = (p: Promise<unknown>) => {
  try { getContext().waitUntil(p.catch((e) => console.error(e))); } catch { p.catch((e) => console.error(e)); }
};

const hashCode = (code: string, salt: string) => createHash("sha256").update(`${salt}:${code}`).digest("hex");
const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
const orderCodeGen = () => {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const b = randomBytes(6);
  return "CPC-" + Array.from(b, (x) => alphabet[x % alphabet.length]).join("");
};
const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 60);

function publicProduct(p: typeof products.$inferSelect) {
  return {
    id: p.id, slug: p.slug, name: p.name, category: p.category, description: p.description, priceCents: p.priceCents,
    unit: p.unit, stock: p.stock, minOrder: p.minOrder, featured: p.featured, active: p.active,
    image: p.imageKey ? `/api/images/${encodeURIComponent(p.imageKey)}` : null,
  };
}

async function orderPayload(order: typeof orders.$inferSelect) {
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.id));
  const codes = await db.select().from(verificationCodes).where(eq(verificationCodes.orderId, order.id));
  const channel = (ch: Channel) => {
    const verifiedAt = ch === "email" ? order.emailVerifiedAt : order.phoneVerifiedAt;
    const row = codes.find((r) => r.channel === ch);
    const check = (order.checks as any)?.[ch] as string | undefined;
    return {
      verified: Boolean(verifiedAt),
      method: check ?? null,
      target: ch === "email" ? maskEmail(order.email) : maskPhone(order.phone),
      attemptsLeft: row ? Math.max(0, MAX_ATTEMPTS - row.attempts) : MAX_ATTEMPTS,
      resendAvailableAt: row ? new Date(row.sentAt.getTime() + RESEND_COOLDOWN_MS).toISOString() : null,
    };
  };
  const { checks, userId, ...rest } = order;
  return { ...rest, checks, items, verification: { email: channel("email"), phone: channel("phone") } };
}

/* ------------------------------------------------------------------ public */

app.get("/api/store", async (c) => {
  const s = await getStoreSettings();
  return c.json({ ...s, verification: { email: emailConfigured(), sms: smsConfigured(), devMode: isNonProduction() } });
});

app.get("/api/products", async (c) => {
  const category = c.req.query("category");
  const featured = c.req.query("featured") === "1";
  const where = [eq(products.active, true)];
  if (category && (CATEGORIES as readonly string[]).includes(category)) where.push(eq(products.category, category));
  if (featured) where.push(eq(products.featured, true));
  const rows = await db.select().from(products).where(and(...where)).orderBy(desc(products.featured), asc(products.category), asc(products.priceCents));
  c.header("cache-control", "public, max-age=0, must-revalidate");
  return c.json(rows.map(publicProduct));
});

app.get("/api/products/:slug", async (c) => {
  const [p] = await db.select().from(products).where(and(eq(products.slug, c.req.param("slug")), eq(products.active, true)));
  if (!p) throw new HttpError(404, "Product not found.");
  return c.json(publicProduct(p));
});

app.get("/api/images/:key", async (c) => {
  const store = getStore("product-images");
  const res = await store.getWithMetadata(c.req.param("key"), { type: "arrayBuffer" });
  if (!res) return c.notFound();
  return new Response(res.data, {
    headers: {
      "content-type": String(res.metadata?.contentType ?? "image/jpeg"),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
});

app.post("/api/subscribe", async (c) => {
  const { email } = await body(c);
  const chk = await checkEmail(email);
  if (!chk.ok) throw new HttpError(422, chk.error!);
  await db.insert(subscribers).values({ email: chk.email }).onConflictDoNothing();
  return c.json({ ok: true });
});

/** Live field checks used by the checkout form so customers see problems before submitting. */
app.post("/api/validate", async (c) => {
  await requireUser(c);
  const { email, phone, country } = await body(c);
  const out: Record<string, unknown> = {};
  if (email !== undefined) out.email = await checkEmail(email);
  if (phone !== undefined) out.phone = checkPhone(phone, country);
  return c.json(out);
});

/* ------------------------------------------------------------------ account */

app.get("/api/me", async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ user: null });
  const [profile] = await db.select().from(customers).where(eq(customers.userId, user.id));
  return c.json({
    user: { ...user, isAdmin: isAdmin(user) },
    profile: profile ? { phone: profile.phone, phoneVerified: Boolean(profile.phoneVerifiedAt), fullName: profile.fullName } : null,
  });
});

/* ------------------------------------------------------------------ checkout */

async function issueCode(orderId: number, orderCode: string, channel: Channel, target: string) {
  const code = newCode();
  const salt = randomBytes(12).toString("hex");
  const now = new Date();
  const [existing] = await db.select().from(verificationCodes)
    .where(and(eq(verificationCodes.orderId, orderId), eq(verificationCodes.channel, channel)));
  if (existing) {
    if (existing.sendCount >= MAX_SENDS) throw new HttpError(429, "Too many codes requested for this order. Please start a new order or contact us.");
    const wait = existing.sentAt.getTime() + RESEND_COOLDOWN_MS - now.getTime();
    if (wait > 0) throw new HttpError(429, `Please wait ${Math.ceil(wait / 1000)} seconds before requesting another code.`);
    await db.update(verificationCodes).set({
      codeHash: hashCode(code, salt), salt, attempts: 0, sendCount: existing.sendCount + 1, sentAt: now,
      expiresAt: new Date(now.getTime() + CODE_TTL_MS), target,
    }).where(eq(verificationCodes.id, existing.id));
  } else {
    await db.insert(verificationCodes).values({
      orderId, channel, target, codeHash: hashCode(code, salt), salt, expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    });
  }
  return sendCode(channel, target, code, orderCode);
}

app.post("/api/checkout", async (c) => {
  const user = await requireUser(c);
  const input = await body(c);
  const store = await getStoreSettings();
  const fields: FieldErrors = {};

  // Throttle: avoid code-spamming by limiting unverified orders per account.
  const [{ pending }] = await db.select({ pending: sql<number>`count(*)::int` }).from(orders)
    .where(and(eq(orders.userId, user.id), eq(orders.status, "awaiting_verification"), gte(orders.createdAt, new Date(Date.now() - 60 * 60_000))));
  if (pending >= 5) throw new HttpError(429, "You have several unfinished orders. Please complete or cancel one before starting another.");

  const name = checkName(input?.contact?.fullName);
  if (!name.ok) fields.fullName = name.error!;
  const address = checkAddress(input?.address ?? {}, store.allowedCountries);
  Object.assign(fields, address.errors);
  const phone = checkPhone(input?.contact?.phone, address.value.country || undefined);
  if (!phone.ok) fields.phone = phone.error!;
  const email = await checkEmail(input?.contact?.email ?? user.email);
  if (!email.ok) fields.email = email.error!;

  const paymentMethod = input?.paymentMethod;
  let paymentPhone: string | null = null;
  if (paymentMethod === "momo") {
    if (!store.momoNumber) fields.paymentMethod = "Mobile money is not available right now. Please choose cash on delivery.";
    const pp = checkPhone(input?.paymentPhone || input?.contact?.phone, address.value.country || undefined);
    if (!pp.ok) fields.paymentPhone = pp.error!;
    else paymentPhone = pp.e164!;
  } else if (paymentMethod !== "cod") fields.paymentMethod = "Choose a payment method.";

  // Cart: prices and stock always come from the database, never from the browser.
  const rawItems = Array.isArray(input?.items) ? input.items : [];
  const qty = new Map<number, number>();
  for (const it of rawItems) {
    const id = Number(it?.productId), q = Number(it?.quantity);
    if (!Number.isInteger(id) || !Number.isInteger(q) || q < 1 || q > 1000) continue;
    qty.set(id, (qty.get(id) ?? 0) + q);
  }
  if (!qty.size) fields.items = "Your cart is empty.";
  const rows = qty.size ? await db.select().from(products).where(inArray(products.id, [...qty.keys()])) : [];
  const lines: { p: typeof products.$inferSelect; q: number }[] = [];
  for (const [id, q] of qty) {
    const p = rows.find((r) => r.id === id);
    if (!p || !p.active) { fields.items = "Some products in your cart are no longer available."; continue; }
    if (q < p.minOrder) { fields.items = `${p.name}: minimum order is ${p.minOrder}.`; continue; }
    if (q > p.stock) { fields.items = `${p.name}: only ${p.stock} left in stock.`; continue; }
    lines.push({ p, q });
  }

  if (Object.keys(fields).length) throw new HttpError(422, "Please fix the highlighted fields.", fields);

  const subtotal = lines.reduce((s, l) => s + l.p.priceCents * l.q, 0);
  const fee = deliveryFee(store, subtotal);
  const accountEmail = email.email === user.email;
  const [profile] = await db.select().from(customers).where(eq(customers.userId, user.id));
  const knownPhone = Boolean(profile?.phoneVerifiedAt && profile.phone === phone.e164);
  const now = new Date();

  const checks: Record<string, unknown> = {
    emailDomain: email.mx,
    phoneType: phone.type ?? "unknown",
    addressComplete: true,
    pricesFromServer: true,
    email: accountEmail ? "account_confirmed" : null,
    phone: knownPhone ? "previously_verified" : null,
    accountCreatedAt: profile?.createdAt ?? now,
  };

  const order = await db.transaction(async (tx) => {
    const [o] = await tx.insert(orders).values({
      code: orderCodeGen(), userId: user.id, customerName: name.value, email: email.email, phone: phone.e164!,
      country: address.value.country, region: address.value.region, city: address.value.city, street: address.value.street,
      landmark: address.value.landmark ?? "", notes: String(input?.notes ?? "").trim().slice(0, 500),
      paymentMethod, paymentPhone, subtotalCents: subtotal, deliveryFeeCents: fee, totalCents: subtotal + fee,
      currency: store.currency, emailVerifiedAt: accountEmail ? now : null, phoneVerifiedAt: knownPhone ? now : null, checks,
    }).returning();
    await tx.insert(orderItems).values(lines.map((l) => ({
      orderId: o.id, productId: l.p.id, name: l.p.name, unit: l.p.unit, unitPriceCents: l.p.priceCents, quantity: l.q,
    })));
    return o;
  });

  await db.insert(customers).values({ userId: user.id, email: user.email, fullName: name.value })
    .onConflictDoUpdate({ target: customers.userId, set: { fullName: name.value } });

  const delivery: Record<string, unknown> = {};
  for (const ch of ["email", "phone"] as Channel[]) {
    if ((ch === "email" && accountEmail) || (ch === "phone" && knownPhone)) continue;
    const configured = ch === "email" ? emailConfigured() : smsConfigured();
    if (!configured && !isNonProduction()) {
      // No delivery provider: don't block the sale, but flag the order so staff verify by phone before dispatch.
      checks[ch] = MANUAL;
      continue;
    }
    delivery[ch] = await issueCode(order.id, order.code, ch, ch === "email" ? order.email : order.phone);
  }
  const [fresh] = await db.update(orders).set({ checks }).where(eq(orders.id, order.id)).returning();
  return c.json({ order: await orderPayload(fresh), delivery }, 201);
});

async function loadOwnOrder(c: Context, user: AuthUser) {
  const [o] = await db.select().from(orders).where(eq(orders.code, c.req.param("code") ?? ""));
  if (!o || (o.userId !== user.id && !isAdmin(user))) throw new HttpError(404, "Order not found.");
  return o;
}

app.post("/api/orders/:code/verify", async (c) => {
  const user = await requireUser(c);
  const order = await loadOwnOrder(c, user);
  const { channel, code } = await body(c);
  if (channel !== "email" && channel !== "phone") throw new HttpError(400, "Unknown verification channel.");
  if (order.status !== "awaiting_verification") throw new HttpError(409, "This order has already been submitted.");
  const [row] = await db.select().from(verificationCodes)
    .where(and(eq(verificationCodes.orderId, order.id), eq(verificationCodes.channel, channel)));
  if (!row) throw new HttpError(400, "No code was sent for this step.");
  if (row.verifiedAt) return c.json({ order: await orderPayload(order) });
  if (row.attempts >= MAX_ATTEMPTS) throw new HttpError(429, "Too many wrong attempts. Request a new code.");
  if (row.expiresAt.getTime() < Date.now()) throw new HttpError(410, "This code has expired. Request a new code.");

  const given = String(code ?? "").replace(/\D/g, "");
  const a = Buffer.from(hashCode(given, row.salt), "hex"), b = Buffer.from(row.codeHash, "hex");
  if (given.length !== 6 || !timingSafeEqual(a, b)) {
    await db.update(verificationCodes).set({ attempts: row.attempts + 1 }).where(eq(verificationCodes.id, row.id));
    const left = MAX_ATTEMPTS - row.attempts - 1;
    throw new HttpError(422, left > 0 ? `That code is not correct. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many wrong attempts. Request a new code.");
  }
  const now = new Date();
  await db.update(verificationCodes).set({ verifiedAt: now }).where(eq(verificationCodes.id, row.id));
  const [updated] = await db.update(orders).set({
    ...(channel === "email" ? { emailVerifiedAt: now } : { phoneVerifiedAt: now }),
    checks: { ...(order.checks as object), [channel]: "code_verified" },
  }).where(eq(orders.id, order.id)).returning();
  if (channel === "phone") {
    await db.update(customers).set({ phone: order.phone, phoneVerifiedAt: now }).where(eq(customers.userId, order.userId));
  }
  return c.json({ order: await orderPayload(updated) });
});

app.post("/api/orders/:code/resend", async (c) => {
  const user = await requireUser(c);
  const order = await loadOwnOrder(c, user);
  const { channel } = await body(c);
  if (channel !== "email" && channel !== "phone") throw new HttpError(400, "Unknown verification channel.");
  if (order.status !== "awaiting_verification") throw new HttpError(409, "This order has already been submitted.");
  if ((channel === "email" ? order.emailVerifiedAt : order.phoneVerifiedAt)) throw new HttpError(409, "Already verified.");
  const result = await issueCode(order.id, order.code, channel, channel === "email" ? order.email : order.phone);
  return c.json({ delivery: result, order: await orderPayload(order) });
});

app.post("/api/orders/:code/place", async (c) => {
  const user = await requireUser(c);
  const order = await loadOwnOrder(c, user);
  if (order.status !== "awaiting_verification") throw new HttpError(409, "This order has already been submitted.");
  const ch = order.checks as Record<string, unknown>;
  if (!order.emailVerifiedAt && ch.email !== MANUAL) throw new HttpError(403, "Verify your email address first.");
  if (!order.phoneVerifiedAt && ch.phone !== MANUAL) throw new HttpError(403, "Verify your phone number first.");

  const { paymentReference } = await body(c);
  let ref: string | null = null;
  if (order.paymentMethod === "momo") {
    const chk = checkPaymentReference(paymentReference);
    if (!chk.ok) throw new HttpError(422, chk.error!, { paymentReference: chk.error! });
    const [dupe] = await db.select({ id: orders.id }).from(orders).where(eq(orders.paymentReference, chk.value));
    if (dupe) throw new HttpError(422, "This transaction ID was already used for another order.", { paymentReference: "Already used." });
    ref = chk.value;
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const placed = await db.transaction(async (tx) => {
    for (const it of items) {
      const res = await tx.update(products).set({ stock: sql`${products.stock} - ${it.quantity}`, updatedAt: new Date() })
        .where(and(eq(products.id, it.productId), gte(products.stock, it.quantity), eq(products.active, true))).returning({ id: products.id });
      if (!res.length) throw new HttpError(409, `Sorry, "${it.name}" just sold out. Please update your cart.`);
    }
    const [o] = await tx.update(orders).set({
      status: "placed", placedAt: new Date(), paymentReference: ref,
      paymentStatus: order.paymentMethod === "momo" ? "awaiting_confirmation" : "unpaid",
    }).where(and(eq(orders.id, order.id), eq(orders.status, "awaiting_verification"))).returning();
    if (!o) throw new HttpError(409, "This order has already been submitted.");
    return o;
  });

  const store = await getStoreSettings();
  const money = (n: number) => `${placed.currency} ${(n / 100).toFixed(2)}`;
  const lines = items.map((i) => `• ${i.quantity} × ${i.name} (${i.unit}) — ${money(i.unitPriceCents * i.quantity)}`).join("\n");
  later(sendEmail(placed.email, `Order ${placed.code} received`,
    `Hello ${placed.customerName},\n\nThank you! We received your order ${placed.code}.\n\n${lines}\nDelivery: ${money(placed.deliveryFeeCents)}\nTotal: ${money(placed.totalCents)}\n\nPayment: ${placed.paymentMethod === "momo" ? `Mobile money (ref ${placed.paymentReference}) — we'll confirm it shortly.` : "Cash on delivery."}\nDeliver to: ${placed.street}, ${placed.city}, ${placed.region}, ${placed.country}\n\nWe'll call ${placed.phone} before delivery.\n\n— Chicken Products Center`));
  if (store.storeEmail) {
    later(sendEmail(store.storeEmail, `New order ${placed.code} — ${money(placed.totalCents)}`,
      `New verified order from ${placed.customerName} (${placed.phone}, ${placed.email}).\n\n${lines}\nTotal: ${money(placed.totalCents)}\nPayment: ${placed.paymentMethod}${placed.paymentReference ? ` ref ${placed.paymentReference}` : ""}`));
  }
  return c.json({ order: await orderPayload(placed) });
});

app.post("/api/orders/:code/cancel", async (c) => {
  const user = await requireUser(c);
  const order = await loadOwnOrder(c, user);
  if (!["awaiting_verification", "placed"].includes(order.status)) throw new HttpError(409, "This order can no longer be cancelled online. Please call us.");
  const updated = await cancelOrder(order);
  return c.json({ order: await orderPayload(updated) });
});

async function cancelOrder(order: typeof orders.$inferSelect) {
  return db.transaction(async (tx) => {
    if (order.status !== "awaiting_verification" && order.status !== "cancelled") {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      for (const it of items) {
        await tx.update(products).set({ stock: sql`${products.stock} + ${it.quantity}` }).where(eq(products.id, it.productId));
      }
    }
    const [o] = await tx.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order.id)).returning();
    return o;
  });
}

app.get("/api/orders", async (c) => {
  const user = await requireUser(c);
  const rows = await db.select().from(orders).where(eq(orders.userId, user.id)).orderBy(desc(orders.createdAt)).limit(50);
  return c.json(await Promise.all(rows.map(orderPayload)));
});

app.get("/api/orders/:code", async (c) => {
  const user = await requireUser(c);
  return c.json(await orderPayload(await loadOwnOrder(c, user)));
});

/* ------------------------------------------------------------------ admin */

app.get("/api/admin/stats", async (c) => {
  await requireAdmin(c);
  const [s] = await db.select({
    orders: sql<number>`count(*) filter (where ${orders.status} <> 'awaiting_verification')::int`,
    open: sql<number>`count(*) filter (where ${orders.status} in ('placed','confirmed','out_for_delivery'))::int`,
    revenue: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} = 'delivered' or ${orders.paymentStatus} = 'paid'),0)::int`,
    toConfirmPayment: sql<number>`count(*) filter (where ${orders.paymentStatus} = 'awaiting_confirmation' and ${orders.status} <> 'cancelled')::int`,
    abandoned: sql<number>`count(*) filter (where ${orders.status} = 'awaiting_verification')::int`,
  }).from(orders);
  const low = await db.select().from(products).where(and(eq(products.active, true), sql`${products.stock} < 20`)).orderBy(asc(products.stock));
  const [{ subs }] = await db.select({ subs: sql<number>`count(*)::int` }).from(subscribers);
  return c.json({ ...s, subscribers: subs, lowStock: low.map(publicProduct) });
});

app.get("/api/admin/orders", async (c) => {
  await requireAdmin(c);
  const status = c.req.query("status");
  const where = status && status !== "all" ? eq(orders.status, status) : sql`${orders.status} <> 'awaiting_verification'`;
  const rows = await db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).limit(200);
  return c.json(await Promise.all(rows.map(async (o) => ({ ...(await orderPayload(o)), phoneFull: o.phone, emailFull: o.email }))));
});

const ORDER_STATUSES = ["placed", "confirmed", "out_for_delivery", "delivered", "cancelled"];
const PAYMENT_STATUSES = ["unpaid", "awaiting_confirmation", "paid", "refunded"];

app.patch("/api/admin/orders/:code", async (c) => {
  await requireAdmin(c);
  const [order] = await db.select().from(orders).where(eq(orders.code, c.req.param("code")));
  if (!order) throw new HttpError(404, "Order not found.");
  const { status, paymentStatus } = await body(c);
  if (status === "cancelled" && order.status !== "cancelled") await cancelOrder(order);
  const set: Partial<typeof orders.$inferInsert> = {};
  if (status && status !== "cancelled") {
    if (!ORDER_STATUSES.includes(status)) throw new HttpError(400, "Invalid status.");
    if (order.status === "cancelled" || order.status === "awaiting_verification") throw new HttpError(409, "Unverified or cancelled orders can't be moved forward.");
    set.status = status;
  }
  if (paymentStatus) {
    if (!PAYMENT_STATUSES.includes(paymentStatus)) throw new HttpError(400, "Invalid payment status.");
    set.paymentStatus = paymentStatus;
  }
  let updated = order;
  if (Object.keys(set).length) [updated] = await db.update(orders).set(set).where(eq(orders.id, order.id)).returning();
  else [updated] = await db.select().from(orders).where(eq(orders.id, order.id));
  if (status && status !== order.status && ["confirmed", "out_for_delivery", "delivered"].includes(status)) {
    const label = { confirmed: "has been confirmed", out_for_delivery: "is out for delivery", delivered: "has been delivered" }[status as string];
    later(sendEmail(updated.email, `Order ${updated.code} ${label}`, `Hello ${updated.customerName},\n\nYour order ${updated.code} ${label}.\n\n— Chicken Products Center`));
  }
  return c.json({ ...(await orderPayload(updated)), phoneFull: updated.phone, emailFull: updated.email });
});

app.get("/api/admin/products", async (c) => {
  await requireAdmin(c);
  const rows = await db.select().from(products).orderBy(asc(products.category), asc(products.name));
  return c.json(rows.map(publicProduct));
});

function productInput(b: any, partial: boolean) {
  const fields: FieldErrors = {};
  const out: Partial<typeof products.$inferInsert> = {};
  if (!partial || b.name !== undefined) {
    const n = String(b.name ?? "").trim();
    if (n.length < 2 || n.length > 100) fields.name = "Name is required."; else out.name = n;
  }
  if (!partial || b.category !== undefined) {
    if (!(CATEGORIES as readonly string[]).includes(b.category)) fields.category = "Choose a category."; else out.category = b.category;
  }
  if (!partial || b.priceCents !== undefined) {
    const v = Math.round(Number(b.priceCents));
    if (!Number.isFinite(v) || v <= 0) fields.priceCents = "Enter a price above zero."; else out.priceCents = v;
  }
  for (const k of ["stock", "minOrder"] as const) {
    if (b[k] !== undefined || !partial) {
      const v = Math.round(Number(b[k] ?? (k === "minOrder" ? 1 : 0)));
      if (!Number.isFinite(v) || v < (k === "minOrder" ? 1 : 0)) fields[k] = "Enter a valid number."; else out[k] = v;
    }
  }
  if (b.description !== undefined || !partial) out.description = String(b.description ?? "").trim().slice(0, 2000);
  if (b.unit !== undefined || !partial) out.unit = String(b.unit ?? "each").trim().slice(0, 40) || "each";
  if (b.featured !== undefined) out.featured = Boolean(b.featured);
  if (b.active !== undefined) out.active = Boolean(b.active);
  if (Object.keys(fields).length) throw new HttpError(422, "Please fix the highlighted fields.", fields);
  return out;
}

app.post("/api/admin/products", async (c) => {
  await requireAdmin(c);
  const input = productInput(await body(c), false);
  let slug = slugify(input.name!) || "product";
  const [clash] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug));
  if (clash) slug = `${slug}-${randomBytes(2).toString("hex")}`;
  const [p] = await db.insert(products).values({ ...(input as typeof products.$inferInsert), slug }).returning();
  return c.json(publicProduct(p), 201);
});

app.patch("/api/admin/products/:id", async (c) => {
  await requireAdmin(c);
  const input = productInput(await body(c), true);
  const [p] = await db.update(products).set({ ...input, updatedAt: new Date() }).where(eq(products.id, Number(c.req.param("id")))).returning();
  if (!p) throw new HttpError(404, "Product not found.");
  return c.json(publicProduct(p));
});

app.delete("/api/admin/products/:id", async (c) => {
  await requireAdmin(c);
  const id = Number(c.req.param("id"));
  const [used] = await db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.productId, id)).limit(1);
  if (used) {
    await db.update(products).set({ active: false }).where(eq(products.id, id));
    return c.json({ ok: true, archived: true });
  }
  const [p] = await db.delete(products).where(eq(products.id, id)).returning();
  if (p?.imageKey) later(getStore("product-images").delete(p.imageKey));
  return c.json({ ok: true, archived: false });
});

app.post("/api/admin/products/:id/image", async (c) => {
  await requireAdmin(c);
  const id = Number(c.req.param("id"));
  const [p] = await db.select().from(products).where(eq(products.id, id));
  if (!p) throw new HttpError(404, "Product not found.");
  const form = await c.req.formData();
  const file = form.get("image");
  if (!(file instanceof File)) throw new HttpError(400, "Choose an image to upload.");
  if (!/^image\/(jpeg|png|webp|avif|gif)$/.test(file.type)) throw new HttpError(415, "Use a JPG, PNG, WebP, AVIF or GIF image.");
  if (file.size > 5 * 1024 * 1024) throw new HttpError(413, "Images must be under 5 MB.");
  const key = `${p.slug}-${Date.now().toString(36)}`;
  const store = getStore("product-images");
  await store.set(key, await file.arrayBuffer(), { metadata: { contentType: file.type } });
  if (p.imageKey) later(store.delete(p.imageKey));
  const [u] = await db.update(products).set({ imageKey: key, updatedAt: new Date() }).where(eq(products.id, id)).returning();
  return c.json(publicProduct(u));
});

app.get("/api/admin/settings", async (c) => {
  await requireAdmin(c);
  return c.json({ ...(await getStoreSettings()), verification: { email: emailConfigured(), sms: smsConfigured() } });
});

app.put("/api/admin/settings", async (c) => {
  await requireAdmin(c);
  return c.json(await saveStoreSettings(await body(c)));
});

app.get("/api/admin/subscribers", async (c) => {
  await requireAdmin(c);
  return c.json(await db.select().from(subscribers).orderBy(desc(subscribers.createdAt)));
});

app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

export default app;
