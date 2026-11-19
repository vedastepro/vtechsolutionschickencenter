import {
  pgTable, serial, text, integer, boolean, timestamp, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: serial().primaryKey(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  category: text().notNull(), // chicks | eggs | mature | feeds
  description: text().notNull().default(""),
  priceCents: integer("price_cents").notNull(),
  unit: text().notNull().default("each"),
  stock: integer().notNull().default(0),
  minOrder: integer("min_order").notNull().default(1),
  imageKey: text("image_key"),
  featured: boolean().notNull().default(false),
  active: boolean().notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("products_category_idx").on(t.category)]);

export const customers = pgTable("customers", {
  userId: text("user_id").primaryKey(),
  email: text().notNull(),
  fullName: text("full_name"),
  phone: text(),
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const orders = pgTable("orders", {
  id: serial().primaryKey(),
  code: text().notNull().unique(),
  userId: text("user_id").notNull(),
  customerName: text("customer_name").notNull(),
  email: text().notNull(),
  phone: text().notNull(),
  country: text().notNull(),
  region: text().notNull(),
  city: text().notNull(),
  street: text().notNull(),
  landmark: text().notNull().default(""),
  notes: text().notNull().default(""),
  paymentMethod: text("payment_method").notNull(), // cod | momo
  paymentPhone: text("payment_phone"),
  paymentReference: text("payment_reference"),
  paymentStatus: text("payment_status").notNull().default("unpaid"), // unpaid | awaiting_confirmation | paid | refunded
  status: text().notNull().default("awaiting_verification"), // awaiting_verification | placed | confirmed | out_for_delivery | delivered | cancelled
  subtotalCents: integer("subtotal_cents").notNull(),
  deliveryFeeCents: integer("delivery_fee_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  currency: text().notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
  checks: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  placedAt: timestamp("placed_at", { withTimezone: true }),
}, (t) => [index("orders_user_idx").on(t.userId), index("orders_status_idx").on(t.status)]);

export const orderItems = pgTable("order_items", {
  id: serial().primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  name: text().notNull(),
  unit: text().notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  quantity: integer().notNull(),
}, (t) => [index("order_items_order_idx").on(t.orderId)]);

export const verificationCodes = pgTable("verification_codes", {
  id: serial().primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  channel: text().notNull(), // email | phone
  target: text().notNull(),
  codeHash: text("code_hash").notNull(),
  salt: text().notNull(),
  attempts: integer().notNull().default(0),
  sendCount: integer("send_count").notNull().default(1),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
}, (t) => [uniqueIndex("verification_order_channel_idx").on(t.orderId, t.channel)]);

export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
});

export const subscribers = pgTable("subscribers", {
  id: serial().primaryKey(),
  email: text().notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
