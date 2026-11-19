import { resolveMx, resolve4 } from "node:dns/promises";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";

export type FieldErrors = Record<string, string>;

const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com",
  "trashmail.com", "sharklasers.com", "getnada.com", "dispostable.com", "fakeinbox.com", "throwawaymail.com",
  "maildrop.cc", "mintemail.com", "mohmal.com", "emailondeck.com", "tempail.com", "moakt.com", "mailnesia.com",
  "spamgourmet.com", "burnermail.io", "discard.email", "tempmailo.com", "minuteinbox.com", "inboxkitten.com",
]);

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

const domainCache = new Map<string, { ok: boolean | null; until: number }>();

/** Checks that the email is well-formed, not disposable, and that its domain can actually receive mail. */
export async function checkEmail(raw: string): Promise<{ ok: boolean; email: string; error?: string; mx: "ok" | "none" | "unknown" }> {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, email, error: "Enter a valid email address.", mx: "unknown" };
  const domain = email.split("@")[1];
  if (DISPOSABLE.has(domain)) return { ok: false, email, error: "Temporary/disposable email addresses are not accepted.", mx: "unknown" };

  const cached = domainCache.get(domain);
  let ok: boolean | null;
  if (cached && cached.until > Date.now()) ok = cached.ok;
  else {
    try {
      const mx = await withTimeout(resolveMx(domain), 3500);
      ok = mx.some((r) => r.exchange && r.exchange !== ".");
    } catch (e: any) {
      if (e?.code === "ENOTFOUND" || e?.code === "ENODATA") {
        // No MX record: RFC 5321 falls back to the A record.
        try { ok = (await withTimeout(resolve4(domain), 2500)).length > 0; } catch { ok = false; }
      } else ok = null; // DNS timeout/unavailable: don't punish the customer
    }
    domainCache.set(domain, { ok, until: Date.now() + 30 * 60_000 });
  }
  if (ok === false) return { ok: false, email, error: `The domain "${domain}" cannot receive email. Check for typos.`, mx: "none" };
  return { ok: true, email, mx: ok ? "ok" : "unknown" };
}

/** Validates a phone number for its country and makes sure it can receive SMS (mobile line). */
export function checkPhone(raw: string, country?: string): { ok: boolean; e164?: string; error?: string; type?: string } {
  const input = String(raw ?? "").trim();
  if (!input) return { ok: false, error: "Phone number is required." };
  const region = country && /^[A-Z]{2}$/.test(country) ? (country as CountryCode) : undefined;
  const parsed = parsePhoneNumberFromString(input, region);
  if (!parsed || !parsed.isValid()) {
    return { ok: false, error: region ? "This is not a valid phone number for the selected country." : "Enter the number in international format, e.g. +250 78 123 4567." };
  }
  const type = parsed.getType();
  if (type && !["MOBILE", "FIXED_LINE_OR_MOBILE"].includes(type)) {
    return { ok: false, error: "Please use a mobile number that can receive SMS codes.", type };
  }
  return { ok: true, e164: parsed.number, type };
}

const JUNK_RE = /^(test|asdf|qwerty|xxx+|aaa+|none|n\/a|na|null|unknown|abc|123+|fake)$/i;

function looksLikeJunk(s: string) {
  const t = s.trim();
  if (JUNK_RE.test(t)) return true;
  if (/^(.)\1{3,}$/.test(t.replace(/\s/g, ""))) return true; // "aaaa", "1111"
  return false;
}

export function checkName(raw: string): { ok: boolean; value: string; error?: string } {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (value.length < 3 || value.length > 80) return { ok: false, value, error: "Enter your full name." };
  const parts = value.split(" ");
  if (parts.length < 2) return { ok: false, value, error: "Enter your first and last name." };
  if (!/^[\p{L}][\p{L}\p{M}'’.\- ]+$/u.test(value)) return { ok: false, value, error: "Names can only contain letters, spaces, apostrophes and hyphens." };
  if (parts.some((p) => looksLikeJunk(p))) return { ok: false, value, error: "Please enter your real name." };
  return { ok: true, value };
}

export interface AddressInput { country: string; region: string; city: string; street: string; landmark?: string }

export function checkAddress(a: Partial<AddressInput>, allowedCountries: string[]): { ok: boolean; value: AddressInput; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const value: AddressInput = {
    country: String(a.country ?? "").trim().toUpperCase(),
    region: String(a.region ?? "").trim().replace(/\s+/g, " "),
    city: String(a.city ?? "").trim().replace(/\s+/g, " "),
    street: String(a.street ?? "").trim().replace(/\s+/g, " "),
    landmark: String(a.landmark ?? "").trim().replace(/\s+/g, " ").slice(0, 200),
  };
  if (!/^[A-Z]{2}$/.test(value.country)) errors.country = "Select your country.";
  else if (allowedCountries.length && !allowedCountries.includes(value.country)) errors.country = "Sorry, we don't deliver to this country yet.";
  for (const [k, label] of [["region", "Province / region"], ["city", "City / town"]] as const) {
    const v = value[k];
    if (v.length < 2 || v.length > 80) errors[k] = `${label} is required.`;
    else if (!/\p{L}/u.test(v) || looksLikeJunk(v)) errors[k] = `Enter a real ${label.toLowerCase()}.`;
  }
  if (value.street.length < 5 || value.street.length > 200) errors.street = "Enter the street, house number or village (at least 5 characters).";
  else if (!/\p{L}/u.test(value.street) || looksLikeJunk(value.street)) errors.street = "Enter a real delivery address.";
  return { ok: Object.keys(errors).length === 0, value, errors };
}

export function checkPaymentReference(raw: string): { ok: boolean; value: string; error?: string } {
  const value = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9.\-]{6,30}$/.test(value) || looksLikeJunk(value)) {
    return { ok: false, value, error: "Enter the transaction ID from your mobile money confirmation SMS (6–30 letters/digits)." };
  }
  return { ok: true, value };
}

export function maskEmail(e: string) {
  const [u, d] = e.split("@");
  return `${u.slice(0, 2)}${"•".repeat(Math.max(1, u.length - 2))}@${d}`;
}
export function maskPhone(p: string) {
  return p.length > 6 ? `${p.slice(0, 4)}${"•".repeat(p.length - 7)}${p.slice(-3)}` : p;
}
