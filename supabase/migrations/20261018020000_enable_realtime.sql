-- Send changes on the tables the donor and receiver dashboards subscribe to through Supabase
-- Realtime, so new listings, pickup slots and requests show up without waiting for polling.
-- Realtime still applies each table's row-level security before delivering a change.
DO $$
DECLARE
  table_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  FOREACH table_name IN ARRAY ARRAY['food_listings', 'pickup_slots', 'food_requests', 'request_pickup_allocations'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;
