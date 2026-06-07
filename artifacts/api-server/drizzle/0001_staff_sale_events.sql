CREATE TABLE IF NOT EXISTS staff_sale_events (
  event_id text PRIMARY KEY,
  transaction_id text NOT NULL,
  shop_id text NOT NULL,
  staff_id text NOT NULL,
  staff_name_snapshot text NOT NULL,
  device_id text NOT NULL,
  amount numeric(14, 2) NOT NULL,
  item_note text,
  item_code text,
  payment_type text,
  created_at_device bigint NOT NULL,
  received_at_server timestamptz NOT NULL,
  event_type text NOT NULL,
  schema_version integer NOT NULL,
  raw_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_sale_events_shop_received_idx
  ON staff_sale_events (shop_id, received_at_server DESC);

CREATE INDEX IF NOT EXISTS staff_sale_events_transaction_idx
  ON staff_sale_events (transaction_id);
