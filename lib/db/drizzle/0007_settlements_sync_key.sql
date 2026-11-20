-- Settlements are written offline and pushed later under the client's local
-- Dexie auto-increment key: the push payload carries `id`, the mapper turns it
-- into `local_id`, and no primary key is sent. `id` was declared
-- `bigint PRIMARY KEY NOT NULL` with no default, so every settlement insert was
-- rejected by Postgres (23502) and — because /sync/push runs all tables in one
-- transaction — a single offline settlement rolled the whole push back, sales
-- included. Give `id` the same database-side default the other seven synced
-- tables have, and enforce the (device_id, local_id) pair the pusher already
-- looks rows up by so a re-delivered row can never insert a second copy.
--
-- `bigserial` rather than `serial`: the deployed column is already bigint and
-- changing its type would rewrite the table for no benefit. Safe to re-run.

CREATE SEQUENCE IF NOT EXISTS "settlements_id_seq";

ALTER TABLE "settlements" ALTER COLUMN "id" SET DEFAULT nextval('"settlements_id_seq"');
ALTER SEQUENCE "settlements_id_seq" OWNED BY "settlements"."id";

SELECT setval('"settlements_id_seq"', GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "settlements"), 1), true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settlements_device_local') THEN
    ALTER TABLE "settlements" ADD CONSTRAINT "settlements_device_local" UNIQUE ("device_id","local_id");
  END IF;
END $$;