import { eq } from "drizzle-orm";
import { db, settings } from "../db/index.js";

export interface StoreSettings {
  currency: string;
  deliveryFeeCents: number;
  freeDeliveryOverCents: number;
  defaultCountry: string;
  allowedCountries: string[];
  momoNumber: string;
  momoName: string;
  storePhone: string;
  storeEmail: string;
  whatsapp: string;
  announcement: string;
}

export const DEFAULTS: StoreSettings = {
  currency: "USD", deliveryFeeCents: 350, freeDeliveryOverCents: 15000, defaultCountry: "", allowedCountries: [],
  momoNumber: "", momoName: "", storePhone: "", storeEmail: "", whatsapp: "", announcement: "",
};

export async function getStoreSettings(): Promise<StoreSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "store"));
  return { ...DEFAULTS, ...((row?.value as Partial<StoreSettings>) ?? {}) };
}

export async function saveStoreSettings(input: Partial<StoreSettings>): Promise<StoreSettings> {
  const current = await getStoreSettings();
  const clean = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
  const cents = (v: unknown, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 ? n : d; };
  const next: StoreSettings = {
    currency: /^[A-Z]{3}$/.test(clean(input.currency).toUpperCase()) ? clean(input.currency).toUpperCase() : current.currency,
    deliveryFeeCents: cents(input.deliveryFeeCents, current.deliveryFeeCents),
    freeDeliveryOverCents: cents(input.freeDeliveryOverCents, current.freeDeliveryOverCents),
    defaultCountry: /^[A-Z]{2}$/.test(clean(input.defaultCountry).toUpperCase()) ? clean(input.defaultCountry).toUpperCase() : "",
    allowedCountries: Array.isArray(input.allowedCountries)
      ? [...new Set(input.allowedCountries.map((c) => String(c).trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))]
      : current.allowedCountries,
    momoNumber: clean(input.momoNumber, 40),
    momoName: clean(input.momoName, 80),
    storePhone: clean(input.storePhone, 40),
    storeEmail: clean(input.storeEmail, 120),
    whatsapp: clean(input.whatsapp, 40).replace(/[^\d]/g, ""),
    announcement: clean(input.announcement, 240),
  };
  await db.insert(settings).values({ key: "store", value: next })
    .onConflictDoUpdate({ target: settings.key, set: { value: next } });
  return next;
}

export function deliveryFee(s: StoreSettings, subtotal: number) {
  return s.freeDeliveryOverCents > 0 && subtotal >= s.freeDeliveryOverCents ? 0 : s.deliveryFeeCents;
}
