alter table public.food_listings
  add column if not exists photo_metadata jsonb,
  add column if not exists photo_uploaded_at timestamptz,
  add column if not exists notes text;

-- Version 000003 was previously shared with listing notes. Reconcile both
-- schemas regardless of which file was recorded under that version locally.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.food_listings'::regclass AND conname = 'food_listing_photo_metadata_object') THEN
    ALTER TABLE public.food_listings ADD CONSTRAINT food_listing_photo_metadata_object
      CHECK (photo_metadata IS NULL OR jsonb_typeof(photo_metadata) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.food_listings'::regclass AND conname = 'food_listings_notes_length') THEN
    ALTER TABLE public.food_listings ADD CONSTRAINT food_listings_notes_length
      CHECK (notes IS NULL OR char_length(notes) <= 1000);
  END IF;
END;
$$;

-- Use database time, rather than accepting a client-supplied upload timestamp.
-- Old listings keep a null time: their original upload time is unknown.
create or replace function public.set_listing_photo_timestamp()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.photo_path is null then
    new.photo_uploaded_at := null;
    new.photo_metadata := null;
  elsif TG_OP = 'INSERT' then
    new.photo_uploaded_at := now();
  elsif new.photo_path is distinct from old.photo_path then
    new.photo_uploaded_at := now();
  else
    new.photo_uploaded_at := old.photo_uploaded_at;
  end if;
  return new;
end;
$$;

drop trigger if exists set_listing_photo_timestamp on public.food_listings;
create trigger set_listing_photo_timestamp
before insert or update on public.food_listings
for each row execute function public.set_listing_photo_timestamp();
