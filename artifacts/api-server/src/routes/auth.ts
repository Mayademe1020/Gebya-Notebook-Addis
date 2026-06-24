import { Router } from "express";
import { db } from "@workspace/db";
import { users, devices, otps, businesses, businessMembers } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sendTelegramTextMessage } from "../services/telegramBotService.js";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "gebya-dev-secret-change-me";
const JWT_EXPIRES_IN = "30d";
const OTP_EXPIRES_MS = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;

function hashOtp(plain: string) {
  return crypto.createHash("sha256").update(plain).digest("hex");
}

function generateOtp() {
  // 6-digit numeric OTP
  return String(Math.floor(100000 + Math.random() * 900000));
}

function signJwt(userId: number) {
  return jwt.sign({ userId, type: "access" }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyJwt(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET, { clockTolerance: 60 }) as { userId: number; type: string };
  } catch {
    return null;
  }
}

// --- POST /api/auth/otp ---
router.post("/otp", async (req, res) => {
  const { phone_number } = req.body;
  if (!phone_number || typeof phone_number !== "string" || phone_number.length < 8) {
    return res.status(400).json({ error: "phone_number is required" });
  }

  const normalizedPhone = phone_number.trim().replace(/\s+/g, "");

  // Check for existing user and telegram chat_id
  const existingUser = await db.select().from(users).where(eq(users.phoneNumber, normalizedPhone)).limit(1);
  const user = existingUser[0];

  const plainOtp = generateOtp();
  const codeHash = hashOtp(plainOtp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_MS);

  // Insert OTP record
  await db.insert(otps).values({
    phoneNumber: normalizedPhone,
    codeHash,
    attempts: 0,
    maxAttempts: OTP_MAX_ATTEMPTS,
    expiresAt,
    consumed: false,
  });

  // Send OTP via Telegram if user has a linked chat_id
  if (user?.telegramChatId) {
    try {
      await sendTelegramTextMessage(
        user.telegramChatId,
        `Your Gebya login code: ${plainOtp}\n\nThis code expires in 10 minutes. Do not share it with anyone.`
      );
    } catch (err) {
      console.error("[auth:otp] Telegram send failed:", err);
    }
  }

  // In dev, return the OTP for testing
  if (process.env.NODE_ENV === "development") {
    return res.json({ ok: true, phone_number: normalizedPhone, otp: plainOtp });
  }

  return res.json({ ok: true, phone_number: normalizedPhone, sent: true });
});

// --- POST /api/auth/verify ---
router.post("/verify", async (req, res) => {
  const { phone_number, otp } = req.body;
  if (!phone_number || !otp || typeof phone_number !== "string" || typeof otp !== "string") {
    return res.status(400).json({ error: "phone_number and otp are required" });
  }

  const normalizedPhone = phone_number.trim().replace(/\s+/g, "");
  const codeHash = hashOtp(otp.trim());

  // Find the most recent unconsumed OTP for this phone
  const otpRows = await db
    .select()
    .from(otps)
    .where(
      and(
        eq(otps.phoneNumber, normalizedPhone),
        eq(otps.consumed, false),
        gt(otps.expiresAt, new Date())
      )
    )
    .orderBy(otps.createdAt)
    .limit(1);

  const otpRecord = otpRows[0];
  if (!otpRecord) {
    return res.status(400).json({ error: "Invalid or expired OTP" });
  }

  const attempts = otpRecord.attempts ?? 0;
  const maxAttempts = otpRecord.maxAttempts ?? OTP_MAX_ATTEMPTS;

  if (attempts >= maxAttempts) {
    return res.status(429).json({ error: "Too many attempts. Request a new OTP." });
  }

  // Increment attempts
  await db
    .update(otps)
    .set({ attempts: attempts + 1 })
    .where(eq(otps.id, otpRecord.id));

  if (otpRecord.codeHash !== codeHash) {
    return res.status(400).json({ error: "Invalid OTP" });
  }

  // Mark consumed
  await db.update(otps).set({ consumed: true }).where(eq(otps.id, otpRecord.id));

  // Get or create user
  let userRows = await db.select().from(users).where(eq(users.phoneNumber, normalizedPhone)).limit(1);
  let user = userRows[0];

  if (!user) {
    const inserted = await db
      .insert(users)
      .values({ phoneNumber: normalizedPhone, active: true })
      .returning();
    user = inserted[0];

    // Every new user gets their own business and becomes the owner
    const [biz] = await db
      .insert(businesses)
      .values({ ownerUserId: user.id, name: "My Shop" })
      .returning({ id: businesses.id });
    await db.insert(businessMembers).values({
      businessId: biz.id,
      userId: user.id,
      role: "owner",
      joinedAt: new Date(),
      active: true,
    });
  }

  const token = signJwt(user.id);

  // Fetch membership info (role + permissions)
  const memberRows = await db
    .select({ role: businessMembers.role, permissions: businessMembers.permissions })
    .from(businessMembers)
    .where(eq(businessMembers.userId, user.id))
    .limit(1);
  const member = memberRows[0];

  return res.json({
    ok: true,
    token,
    user: {
      id: user.id,
      phone_number: user.phoneNumber,
      preferred_lang: user.preferredLang,
      created_at: user.createdAt,
    },
    role: member?.role || null,
    permissions: member?.permissions || null,
  });
});

// --- POST /api/auth/link-device ---
router.post("/link-device", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return res.status(401).json({ error: "Authorization token required" });
  }

  const decoded = verifyJwt(token);
  if (!decoded) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const { device_id, device_name } = req.body;
  if (!device_id || typeof device_id !== "string") {
    return res.status(400).json({ error: "device_id is required" });
  }

  // Upsert device link
  await db
    .insert(devices)
    .values({
      userId: decoded.userId,
      deviceId: device_id,
      name: device_name || null,
    })
    .onConflictDoUpdate({
      target: devices.deviceId,
      set: { userId: decoded.userId, lastSeenAt: new Date() },
    });

  return res.json({ ok: true, device_id, user_id: decoded.userId });
});

// --- GET /api/auth/me ---
router.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return res.status(401).json({ error: "Authorization token required" });
  }

  const decoded = verifyJwt(token);
  if (!decoded) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const userRows = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
  const user = userRows[0];
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // Fetch user's business membership (role + permissions)
  const memberRows = await db
    .select({ role: businessMembers.role, permissions: businessMembers.permissions })
    .from(businessMembers)
    .where(eq(businessMembers.userId, user.id))
    .limit(1);
  const member = memberRows[0];

  return res.json({
    ok: true,
    user: {
      id: user.id,
      phone_number: user.phoneNumber,
      preferred_lang: user.preferredLang,
      created_at: user.createdAt,
    },
    role: member?.role || null,
    permissions: member?.permissions || null,
  });
});

export default router;
