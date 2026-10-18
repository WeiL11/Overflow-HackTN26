-- Categorize food listings so receivers can search by need (AI search on the receiver dashboard).
--
-- Tag vocabulary (kept in sync with server/searchFood.mjs and src/config/foodTaxonomy.ts):
--   dietary:  vegetarian, vegan, halal, kosher, gluten_free, dairy_free, nut_free
--   temperature: cold (eat as-is), warm (needs cooking or microwaving)
--   meal size:   snack, small_meal (one person), large_meal (family or group)

ALTER TABLE public.food_listings
  ADD COLUMN category text NOT NULL DEFAULT 'other',
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN description text;

ALTER TABLE public.food_listings
  ADD CONSTRAINT food_listings_category_check CHECK (category IN (
    'produce', 'bakery', 'prepared_meals', 'dairy_eggs', 'meat_seafood',
    'pantry', 'snacks', 'beverages', 'baby_kids', 'frozen', 'other'
  )),
  ADD CONSTRAINT food_listings_description_length CHECK (description IS NULL OR char_length(description) <= 500);

CREATE INDEX food_listings_category_idx ON public.food_listings (category);
CREATE INDEX food_listings_tags_idx ON public.food_listings USING gin (tags);
