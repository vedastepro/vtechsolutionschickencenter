/**
 * Delivery of verification codes and order emails.
 * Email: Resend (RESEND_API_KEY, EMAIL_FROM). SMS: Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER).
 * Outside production (local dev / deploy previews) an unconfigured channel returns the code so the flow stays testable.
 */
export interface SendResult { delivered: boolean; devCode?: string; error?: string }

export const isNonProduction = () => {
  const ctx = process.env.CONTEXT;
  return process.env.NETLIFY_DEV === "true" || ctx === "dev" || ctx === "deploy-preview" || ctx === "branch-deploy";
};

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);
export const smsConfigured = () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);

export async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { delivered: false, error: "Email delivery is not configured." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "Chicken Products Center <onboarding@resend.dev>",
        to: [to], subject, text, html: html ?? undefined,
      }),
    });
    if (!res.ok) {
      console.error("Resend error", res.status, (await res.text()).slice(0, 300));
      return { delivered: false, error: "We couldn't send the email. Try again shortly." };
    }
    return { delivered: true };
  } catch (e) {
    console.error("Resend request failed", e);
    return { delivered: false, error: "We couldn't send the email. Try again shortly." };
  }
}

export async function sendSms(to: string, body: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return { delivered: false, error: "SMS delivery is not configured." };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!res.ok) {
      console.error("Twilio error", res.status, (await res.text()).slice(0, 300));
      return { delivered: false, error: "We couldn't send the SMS to this number. Check it and try again." };
    }
    return { delivered: true };
  } catch (e) {
    console.error("Twilio request failed", e);
    return { delivered: false, error: "We couldn't send the SMS. Try again shortly." };
  }
}

export async function sendCode(channel: "email" | "phone", target: string, code: string, orderCode: string): Promise<SendResult> {
  const msg = `Your Chicken Products Center verification code for order ${orderCode} is ${code}. It expires in 10 minutes. Never share this code.`;
  const configured = channel === "email" ? emailConfigured() : smsConfigured();
  if (!configured && isNonProduction()) {
    console.log(`[dev] ${channel} code for ${orderCode}: ${code}`);
    return { delivered: false, devCode: code };
  }
  if (channel === "email") {
    return sendEmail(target, `Your verification code: ${code}`, msg,
      `<div style="font-family:Georgia,serif;font-size:16px;color:#2b211b"><p>Your verification code for order <b>${orderCode}</b> is:</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#9c3b1c">${code}</p><p>It expires in 10 minutes. If you didn't place this order, ignore this email.</p><p>— Chicken Products Center</p></div>`);
  }
  return sendSms(target, msg);
}
