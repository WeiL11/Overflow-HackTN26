ALTER TABLE public.food_requests
  DROP CONSTRAINT food_requests_status_check;

UPDATE public.food_requests
SET status = 'pending_pickup'
WHERE status = 'accepted';

ALTER TABLE public.food_requests
  ADD COLUMN pickup_confirmed_at timestamptz,
  ADD CONSTRAINT food_requests_status_check
    CHECK (status IN ('pending', 'pending_pickup', 'completed', 'rejected', 'cancelled'));

DROP FUNCTION IF EXISTS public.respond_to_food_request(uuid, text);

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
  existing_request public.food_requests%ROWTYPE;
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

  SELECT *
  INTO existing_request
  FROM public.food_requests
  WHERE listing_id = p_listing_id
    AND receiver_id = current_user_id
  FOR UPDATE;

  IF FOUND AND existing_request.status NOT IN ('rejected', 'cancelled') THEN
    RAISE EXCEPTION 'You already have an active request for this listing';
  END IF;

  UPDATE public.food_listings
  SET
    quantity = quantity - p_quantity,
    status = CASE WHEN quantity - p_quantity = 0 THEN 'requested' ELSE 'available' END
  WHERE id = p_listing_id
    AND status IN ('available', 'requested')
    AND expiry_time > now()
    AND quantity >= p_quantity
  RETURNING * INTO reserved_listing;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The requested quantity is no longer available';
  END IF;

  IF existing_request.id IS NOT NULL THEN
    UPDATE public.food_requests
    SET
      quantity = p_quantity,
      notes = normalized_notes,
      status = 'pending',
      pickup_confirmed_at = NULL,
      created_at = now()
    WHERE id = existing_request.id
    RETURNING * INTO created_request;
  ELSE
    INSERT INTO public.food_requests (listing_id, receiver_id, quantity, notes)
    VALUES (p_listing_id, current_user_id, p_quantity, normalized_notes)
    RETURNING * INTO created_request;
  END IF;

  RETURN created_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_food_request(
  p_request_id uuid,
  p_direction text
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
  next_status text;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_direction NOT IN ('forward', 'back') THEN
    RAISE EXCEPTION 'Direction must be forward or back';
  END IF;

  SELECT *
  INTO selected_request
  FROM public.food_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  SELECT *
  INTO selected_listing
  FROM public.food_listings
  WHERE id = selected_request.listing_id
    AND donor_id = current_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the listing donor can update this request';
  END IF;

  IF p_direction = 'forward' THEN
    IF selected_request.status = 'pending' THEN
      next_status := 'pending_pickup';
    ELSIF selected_request.status = 'pending_pickup' AND selected_request.pickup_confirmed_at IS NOT NULL THEN
      next_status := 'completed';
    ELSIF selected_request.status = 'pending_pickup' THEN
      RAISE EXCEPTION 'The recipient must confirm pickup before this request can be completed';
    ELSE
      RAISE EXCEPTION 'This request cannot move forward';
    END IF;
  ELSE
    IF selected_request.status = 'completed' THEN
      next_status := 'pending_pickup';
    ELSIF selected_request.status = 'pending_pickup' THEN
      next_status := 'pending';
    ELSE
      RAISE EXCEPTION 'This request cannot move back';
    END IF;
  END IF;

  UPDATE public.food_requests
  SET
    status = next_status,
    pickup_confirmed_at = CASE
      WHEN next_status = 'pending' THEN NULL
      ELSE pickup_confirmed_at
    END
  WHERE id = p_request_id
  RETURNING * INTO selected_request;

  UPDATE public.food_listings
  SET status = CASE
    WHEN quantity > 0 THEN 'available'
    WHEN EXISTS (
      SELECT 1
      FROM public.food_requests
      WHERE listing_id = selected_listing.id
        AND status IN ('pending', 'pending_pickup')
    ) THEN 'requested'
    ELSE 'completed'
  END
  WHERE id = selected_listing.id;

  RETURN selected_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_food_pickup(
  p_request_id uuid
)
RETURNS public.food_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  selected_request public.food_requests%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.food_requests
  SET pickup_confirmed_at = now()
  WHERE id = p_request_id
    AND receiver_id = current_user_id
    AND status = 'pending_pickup'
    AND pickup_confirmed_at IS NULL
  RETURNING * INTO selected_request;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending pickup request not found or already confirmed';
  END IF;

  RETURN selected_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_food_request(
  p_request_id uuid
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

  SELECT *
  INTO selected_request
  FROM public.food_requests
  WHERE id = p_request_id
    AND receiver_id = current_user_id
  FOR UPDATE;

  IF NOT FOUND OR selected_request.status NOT IN ('pending', 'pending_pickup') THEN
    RAISE EXCEPTION 'Active request not found';
  END IF;

  SELECT *
  INTO selected_listing
  FROM public.food_listings
  WHERE id = selected_request.listing_id
  FOR UPDATE;

  UPDATE public.food_requests
  SET status = 'cancelled', pickup_confirmed_at = NULL
  WHERE id = p_request_id
  RETURNING * INTO selected_request;

  UPDATE public.food_listings
  SET quantity = quantity + selected_request.quantity,
      status = 'available'
  WHERE id = selected_request.listing_id;

  RETURN selected_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_food_request(
  p_request_id uuid
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

  SELECT *
  INTO selected_request
  FROM public.food_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR selected_request.status NOT IN ('pending', 'pending_pickup') THEN
    RAISE EXCEPTION 'Active request not found';
  END IF;

  SELECT *
  INTO selected_listing
  FROM public.food_listings
  WHERE id = selected_request.listing_id
    AND donor_id = current_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the listing donor can reject this request';
  END IF;

  UPDATE public.food_requests
  SET status = 'rejected', pickup_confirmed_at = NULL
  WHERE id = p_request_id
  RETURNING * INTO selected_request;

  UPDATE public.food_listings
  SET quantity = quantity + selected_request.quantity,
      status = 'available'
  WHERE id = selected_request.listing_id;

  RETURN selected_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_impact_metrics()
RETURNS TABLE (
  total_donors bigint,
  total_recipients bigint,
  total_meals_saved bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    (SELECT count(*) FROM public.profiles WHERE role = 'donor') AS total_donors,
    (SELECT count(*) FROM public.profiles WHERE role IN ('receiver', 'ngo')) AS total_recipients,
    (SELECT COALESCE(sum(quantity), 0)::bigint FROM public.food_requests WHERE status = 'completed') AS total_meals_saved;
$$;

REVOKE ALL ON FUNCTION public.advance_food_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_food_request(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.advance_food_request(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.confirm_food_pickup(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_food_pickup(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_food_pickup(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_food_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_food_request(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_food_request(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_food_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_food_request(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_food_request(uuid) TO authenticated;
