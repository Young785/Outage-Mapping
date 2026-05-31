import twilio from "twilio";

type NotifyResult = { sent: boolean; reason?: string; sid?: string };

function buildClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return twilio(sid, token);
}

function fromNumber() {
  return process.env.TWILIO_FROM_NUMBER || "";
}

function smsEnabled() {
  return process.env.SMS_NOTIFICATIONS_ENABLED === "true";
}

export async function sendSms(to: string | null | undefined, body: string): Promise<NotifyResult> {
  if (!smsEnabled()) return { sent: false, reason: "sms_disabled" };
  if (!to) return { sent: false, reason: "missing_phone" };
  const from = fromNumber();
  if (!from) return { sent: false, reason: "missing_from_number" };
  const client = buildClient();
  if (!client) return { sent: false, reason: "missing_twilio_credentials" };
  try {
    const msg = await client.messages.create({ from, to, body });
    return { sent: true, sid: msg.sid };
  } catch (err: any) {
    return { sent: false, reason: err?.message ?? "send_failed" };
  }
}

export async function notifyDispatchAssigned(opts: {
  techPhone?: string | null;
  techName?: string | null;
  address?: string | null;
  kind?: "job" | "outage";
}) {
  const kindLabel = opts.kind === "outage" ? "storm lead" : "job";
  const msg = `Dispatch assigned: new ${kindLabel} at ${opts.address ?? "unknown location"}. Open app and navigate now.`;
  return sendSms(opts.techPhone ?? null, msg);
}

export async function notifyAutoArrival(opts: {
  officePhone?: string | null;
  techName?: string | null;
  address?: string | null;
}) {
  const msg = `Auto-arrival logged: ${opts.techName ?? "Tech"} reached ${opts.address ?? "assigned location"} and job is now in progress.`;
  return sendSms(opts.officePhone ?? null, msg);
}

