-- Pickup coordinates so receivers can see listings on a map and how far away they are.
-- Nullable: a listing whose address could not be located still posts, it just has no pin.

ALTER TABLE public.food_listings
  ADD COLUMN latitude double precision,
  ADD COLUMN longitude double precision;

ALTER TABLE public.food_listings
  ADD CONSTRAINT food_listings_latitude_range CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT food_listings_longitude_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
