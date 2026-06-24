import { Router } from "express";
import { db } from "@workspace/db";
import { snapshots } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { verifyJwt } from "./auth.js";
import crypto from "crypto";

const router = Router();

// ─── Auth middleware ───
function getUserIdFromRequest(req: any): number | null {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const decoded = verifyJwt(token);
  return decoded?.userId || null;
}

// Max snapshot size: 10MB
const MAX_SNAPSHOT_SIZE = 10 * 1024 * 1024;
// Max snapshots per user
const MAX_SNAPSHOTS_PER_USER = 10;

// ─── CREATE SNAPSHOT ───
router.post("/create", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authorization required" });

  const { device_id, name, description, payload, tables, record_count } = req.body;

  if (!device_id || typeof device_id !== "string" || device_id.length > 128) {
    return res.status(400).json({ error: "device_id is required and must be a string ≤ 128 chars" });
  }

  if (!name || typeof name !== "string" || name.length > 256) {
    return res.status(400).json({ error: "name is required and must be ≤ 256 chars" });
  }

  if (!payload || typeof payload !== "string") {
    return res.status(400).json({ error: "payload is required" });
  }

  if (payload.length > MAX_SNAPSHOT_SIZE) {
    return res.status(413).json({ error: `Snapshot exceeds ${MAX_SNAPSHOT_SIZE} bytes limit` });
  }

  // Enforce max snapshots per user
  const existing = await db
    .select({ id: snapshots.id })
    .from(snapshots)
    .where(eq(snapshots.userId, userId))
    .orderBy(desc(snapshots.createdAt));

  if (existing.length >= MAX_SNAPSHOTS_PER_USER) {
    // Delete oldest snapshots to make room
    const toDelete = existing.slice(MAX_SNAPSHOTS_PER_USER - 1);
    for (const row of toDelete) {
      await db.delete(snapshots).where(eq(snapshots.id, row.id));
    }
  }

  const checksum = crypto.createHash("sha256").update(payload).digest("hex");
  const now = Date.now();

  const result = await db
    .insert(snapshots)
    .values({
      userId,
      deviceId: device_id,
      name,
      description: description || null,
      sizeBytes: payload.length,
      tables: JSON.stringify(tables || []),
      recordCount: record_count || 0,
      checksum,
      payload,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return res.json({ ok: true, snapshot: result[0] });
});

// ─── LIST SNAPSHOTS ───
router.get("/list", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authorization required" });

  const rows = await db
    .select({
      id: snapshots.id,
      name: snapshots.name,
      description: snapshots.description,
      deviceId: snapshots.deviceId,
      sizeBytes: snapshots.sizeBytes,
      tables: snapshots.tables,
      recordCount: snapshots.recordCount,
      checksum: snapshots.checksum,
      createdAt: snapshots.createdAt,
    })
    .from(snapshots)
    .where(eq(snapshots.userId, userId))
    .orderBy(desc(snapshots.createdAt));

  return res.json({ ok: true, snapshots: rows });
});

// ─── DOWNLOAD SNAPSHOT ───
router.get("/download/:id", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authorization required" });

  const snapshotId = Number(req.params.id);
  if (!Number.isFinite(snapshotId)) {
    return res.status(400).json({ error: "Invalid snapshot ID" });
  }

  const rows = await db
    .select()
    .from(snapshots)
    .where(and(eq(snapshots.id, snapshotId), eq(snapshots.userId, userId)))
    .limit(1);

  if (rows.length === 0) {
    return res.status(404).json({ error: "Snapshot not found" });
  }

  const snapshot = rows[0];

  // Verify checksum
  const computedChecksum = crypto
    .createHash("sha256")
    .update(snapshot.payload || "")
    .digest("hex");

  if (computedChecksum !== snapshot.checksum) {
    return res.status(500).json({ error: "Snapshot checksum mismatch — data may be corrupted" });
  }

  return res.json({
    ok: true,
    snapshot: {
      id: snapshot.id,
      name: snapshot.name,
      description: snapshot.description,
      deviceId: snapshot.deviceId,
      tables: snapshot.tables,
      recordCount: snapshot.recordCount,
      checksum: snapshot.checksum,
      createdAt: snapshot.createdAt,
      payload: snapshot.payload,
    },
  });
});

// ─── DELETE SNAPSHOT ───
router.delete("/delete/:id", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authorization required" });

  const snapshotId = Number(req.params.id);
  if (!Number.isFinite(snapshotId)) {
    return res.status(400).json({ error: "Invalid snapshot ID" });
  }

  const result = await db
    .delete(snapshots)
    .where(and(eq(snapshots.id, snapshotId), eq(snapshots.userId, userId)));

  return res.json({ ok: true, deleted: true });
});

export default router;
