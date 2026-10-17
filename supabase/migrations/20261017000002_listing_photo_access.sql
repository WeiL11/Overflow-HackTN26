-- Reconcile databases where the old shared migration version recorded quantities
-- but skipped the food-photo schema. These statements preserve existing data.
alter table public.food_listings
  add column if not exists photo_path text,
  add column if not exists food_analysis jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-photos', 'food-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Donors upload food photos" on storage.objects;
create policy "Donors upload food photos" on storage.objects for insert to authenticated
with check (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from public.profiles where user_id = auth.uid() and role = 'donor'));
drop policy if exists "Owners read food photos" on storage.objects;
create policy "Owners read food photos" on storage.objects for select to authenticated
using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Owners delete food photos" on storage.objects;
create policy "Owners delete food photos" on storage.objects for delete to authenticated
using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Owners can read their drafts. Authenticated users can read photos attached to
-- listings they can see, without exposing unattached uploads or making the bucket public.
drop policy if exists "Readers view attached listing photos" on storage.objects;
create policy "Readers view attached listing photos" on storage.objects
for select to authenticated using (
  bucket_id = 'food-photos' and exists (
    select 1 from public.food_listings listing
    where listing.photo_path = storage.objects.name
  )
);
