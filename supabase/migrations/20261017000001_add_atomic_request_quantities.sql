-- Some local databases applied this schema under the old shared 20261017000000
-- version. Upgrade text quantities only once, preserving integer quantities (including zero).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'food_listings'
      AND column_name = 'quantity' AND data_type <> 'integer'
  ) THEN
    IF EXISTS (SELECT 1 FROM public.food_listings WHERE quantity !~ '^\s*[1-9][0-9]*') THEN
      RAISE EXCEPTION 'Existing food listing quantities must begin with a positive whole number';
    END IF;
    ALTER TABLE public.food_listings
      ALTER COLUMN quantity TYPE integer
      USING substring(quantity FROM '^\s*([0-9]+)')::integer;
  END IF;
END;
$$;

ALTER TABLE public.food_requests
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS notes text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.food_listings'::regclass AND conname = 'food_listings_quantity_nonnegative') THEN
    ALTER TABLE public.food_listings ADD CONSTRAINT food_listings_quantity_nonnegative CHECK (quantity >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.food_requests'::regclass AND conname = 'food_requests_quantity_positive') THEN
    ALTER TABLE public.food_requests ADD CONSTRAINT food_requests_quantity_positive CHECK (quantity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.food_requests'::regclass AND conname = 'food_requests_notes_length') THEN
    ALTER TABLE public.food_requests ADD CONSTRAINT food_requests_notes_length CHECK (notes IS NULL OR char_length(notes) <= 1000);
  END IF;
END;
$$;

DROP POLICY IF EXISTS "Receivers can insert requests" ON public.food_requests;
DROP POLICY IF EXISTS "Donors can update request status" ON public.food_requests;

CREATE OR REPLACE FUNCTION public.reserve_food(
  p_listing_id uuid,
  p_quantity integer,
  p_notes text DEFAULT NULL
)
RETURNS public.food_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  reserved_listing public.food_listings%ROWTYPE;
  created_request public.food_requests%ROWTYPE;
  normalized_notes text := NULLIF(btrim(p_notes), '');
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Requested quantity must be a positive whole number';
  END IF;

  IF p_notes IS NOT NULL AND char_length(p_notes) > 1000 THEN
    RAISE EXCEPTION 'Notes must be 1000 characters or fewer';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = current_user_id
      AND role IN ('receiver', 'ngo')
  ) THEN
    RAISE EXCEPTION 'Only recipients can request food';
  END IF;

  UPDATE public.food_listings
  SET
    quantity = quantity - p_quantity,
    status = CASE WHEN quantity - p_quantity = 0 THEN 'completed' ELSE 'available' END
  WHERE id = p_listing_id
    AND status IN ('available', 'requested')
    AND expiry_time > now()
    AND quantity >= p_quantity
  RETURNING * INTO reserved_listing;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The requested quantity is no longer available';
  END IF;

  INSERT INTO public.food_requests (listing_id, receiver_id, quantity, notes)
  VALUES (p_listing_id, current_user_id, p_quantity, normalized_notes)
  RETURNING * INTO created_request;

  RETURN created_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_food_request(
  p_request_id uuid,
  p_status text
)
RETURNS public.food_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  selected_request public.food_requests%ROWTYPE;
  selected_listing public.food_listings%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_status NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'Response must be accepted or rejected';
  END IF;

  SELECT *
  INTO selected_request
  FROM public.food_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR selected_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Pending request not found';
  END IF;

  SELECT *
  INTO selected_listing
  FROM public.food_listings
  WHERE id = selected_request.listing_id
    AND donor_id = current_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the listing donor can respond to this request';
  END IF;

  UPDATE public.food_requests
  SET status = p_status
  WHERE id = p_request_id
  RETURNING * INTO selected_request;

  IF p_status = 'rejected' THEN
    UPDATE public.food_listings
    SET
      quantity = quantity + selected_request.quantity,
      status = 'available'
    WHERE id = selected_request.listing_id;
  END IF;

  RETURN selected_request;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_food(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_food(uuid, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reserve_food(uuid, integer, text) TO authenticated;

REVOKE ALL ON FUNCTION public.respond_to_food_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_to_food_request(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.respond_to_food_request(uuid, text) TO authenticated;
