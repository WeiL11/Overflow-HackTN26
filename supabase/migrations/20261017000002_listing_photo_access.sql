-- Owners can read their drafts. Authenticated users can read photos attached to
-- listings they can see, without exposing unattached uploads or making the bucket public.
create policy "Readers view attached listing photos" on storage.objects
for select to authenticated using (
  bucket_id = 'food-photos' and exists (
    select 1 from public.food_listings listing
    where listing.photo_path = storage.objects.name
  )
);
