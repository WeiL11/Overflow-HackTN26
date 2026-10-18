ALTER TABLE public.food_listings
  ADD COLUMN notes text,
  ADD CONSTRAINT food_listings_notes_length CHECK (notes IS NULL OR char_length(notes) <= 1000);
