import webPush from "web-push";
import { db } from "@workspace/db";
import { pushSubscriptions } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@gebya.app";

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return true;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  try {
    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
    return true;
  } catch {
    return false;
  }
}

export function isPushConfigured() {
  return ensureVapid();
}

export function getVapidPublicKey() {
  return VAPID_PUBLIC_KEY;
}

export async function sendPushToOwner(
  businessId: number,
  notification: { title: string; body: string; type: string; id: number }
): Promise<{ sent: number; failed: number }> {
  if (!ensureVapid()) {
    console.warn("[push] VAPID not configured, skipping push delivery");
    return { sent: 0, failed: 0 };
  }

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.businessId, businessId));

  if (subscriptions.length === 0) return { sent: 0, failed: 0 };

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    type: notification.type,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: "/", notificationId: notification.id },
    tag: `gebya-${notification.type}`,
    renotify: true,
  });

  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      await webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      );
      sent++;
    } catch (err: any) {
      failed++;
      if (err.statusCode === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      }
    }
  }

  return { sent, failed };
}
