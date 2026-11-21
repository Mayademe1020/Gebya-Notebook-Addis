-- Settings and analytics are per-business data, but both were keyed by
-- (device_id, key). Two businesses signed in on one phone therefore shared a
-- single row per key: switching shops silently overwrote the first shop's
-- settings with the second's, and there was no way to get them back.
--
-- Re-key both tables by (business_id, device_id, key). Existing rows already
-- belong to exactly one business, so no data needs rewriting — only the
-- constraint changes. Safe to re-run.

ALTER TABLE "settings" DROP CONSTRAINT IF EXISTS "settings_device_key";
ALTER TABLE "settings" ADD CONSTRAINT "settings_business_device_key" UNIQUE ("business_id","device_id","key");

ALTER TABLE "analytics" DROP CONSTRAINT IF EXISTS "analytics_device_key";
ALTER TABLE "analytics" ADD CONSTRAINT "analytics_business_device_key" UNIQUE ("business_id","device_id","key");