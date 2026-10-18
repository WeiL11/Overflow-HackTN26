ALTER TABLE public.food_requests
  ADD COLUMN status_note text,
  ADD COLUMN status_note_author uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT food_requests_status_note_length CHECK (status_note IS NULL OR char_length(status_note) <= 1000);

DROP FUNCTION public.reserve_food(uuid, integer, text);
DROP FUNCTION public.advance_food_request(uuid, text);
DROP FUNCTION public.confirm_food_pickup(uuid);
DROP FUNCTION public.cancel_food_request(uuid);
DROP FUNCTION public.reject_food_request(uuid);

CREATE FUNCTION public.reserve_food(
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
    SELECT 1 FROM public.profiles
    WHERE user_id = current_user_id AND role IN ('receiver', 'ngo')
  ) THEN
    RAISE EXCEPTION 'Only recipients can request food';
  END IF;

  SELECT * INTO existing_request
  FROM public.food_requests
  WHERE listing_id = p_listing_id AND receiver_id = current_user_id
  FOR UPDATE;

  IF FOUND AND existing_request.status NOT IN ('rejected', 'cancelled') THEN
    RAISE EXCEPTION 'You already have an active request for this listing';
  END IF;

  UPDATE public.food_listings
  SET quantity = quantity - p_quantity,
      status = CASE WHEN quantity - p_quantity = 0 THEN 'requested' ELSE 'available' END
  WHERE id = p_listing_id
    AND status IN ('available', 'requested', 'completed')
    AND expiry_time > now()
    AND quantity >= p_quantity
  RETURNING * INTO reserved_listing;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The requested quantity is no longer available';
  END IF;

  IF existing_request.id IS NOT NULL THEN
    UPDATE public.food_requests
    SET quantity = p_quantity,
        notes = normalized_notes,
        status = 'pending',
        pickup_confirmed_at = NULL,
        status_note = NULL,
        status_note_author = NULL,
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

CREATE FUNCTION public.advance_food_request(
  p_request_id uuid,
  p_direction text,
  p_note text DEFAULT NULL
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
  normalized_note text := NULLIF(btrim(p_note), '');
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 1000 THEN
    RAISE EXCEPTION 'Reason must be 1000 characters or fewer';
  END IF;
  IF p_direction NOT IN ('forward', 'back') THEN
    RAISE EXCEPTION 'Direction must be forward or back';
  END IF;

  SELECT * INTO selected_request
  FROM public.food_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  SELECT * INTO selected_listing
  FROM public.food_listings
  WHERE id = selected_request.listing_id AND donor_id = current_user_id
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
  SET status = next_status,
      pickup_confirmed_at = CASE WHEN next_status = 'pending' THEN NULL ELSE pickup_confirmed_at END,
      status_note = CASE WHEN p_direction = 'forward' AND next_status = 'completed' THEN normalized_note ELSE NULL END,
      status_note_author = CASE WHEN p_direction = 'forward' AND next_status = 'completed' AND normalized_note IS NOT NULL THEN current_user_id ELSE NULL END
  WHERE id = p_request_id
  RETURNING * INTO selected_request;

  UPDATE public.food_listings
  SET status = CASE
    WHEN quantity > 0 THEN 'available'
    WHEN EXISTS (
      SELECT 1 FROM public.food_requests
      WHERE listing_id = selected_listing.id AND status IN ('pending', 'pending_pickup')
    ) THEN 'requested'
    ELSE 'completed'
  END
  WHERE id = selected_listing.id;

  RETURN selected_request;
END;
$$;

CREATE FUNCTION public.confirm_food_pickup(
  p_request_id uuid,
  p_note text DEFAULT NULL
)
RETURNS public.food_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  selected_request public.food_requests%ROWTYPE;
  normalized_note text := NULLIF(btrim(p_note), '');
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 1000 THEN
    RAISE EXCEPTION 'Reason must be 1000 characters or fewer';
  END IF;

  UPDATE public.food_requests
  SET pickup_confirmed_at = now(),
      status_note = normalized_note,
      status_note_author = CASE WHEN normalized_note IS NOT NULL THEN current_user_id ELSE NULL END
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

CREATE FUNCTION public.cancel_food_request(
  p_request_id uuid,
  p_note text DEFAULT NULL
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
  normalized_note text := NULLIF(btrim(p_note), '');
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 1000 THEN
    RAISE EXCEPTION 'Reason must be 1000 characters or fewer';
  END IF;

  SELECT * INTO selected_request
  FROM public.food_requests
  WHERE id = p_request_id AND receiver_id = current_user_id
  FOR UPDATE;

  IF NOT FOUND OR selected_request.status NOT IN ('pending', 'pending_pickup') THEN
    RAISE EXCEPTION 'Active request not found';
  END IF;

  SELECT * INTO selected_listing
  FROM public.food_listings
  WHERE id = selected_request.listing_id
  FOR UPDATE;

  UPDATE public.food_requests
  SET status = 'cancelled',
      pickup_confirmed_at = NULL,
      status_note = normalized_note,
      status_note_author = CASE WHEN normalized_note IS NOT NULL THEN current_user_id ELSE NULL END
  WHERE id = p_request_id
  RETURNING * INTO selected_request;

  UPDATE public.food_listings
  SET quantity = quantity + selected_request.quantity, status = 'available'
  WHERE id = selected_request.listing_id;

  RETURN selected_request;
END;
$$;

CREATE FUNCTION public.reject_food_request(
  p_request_id uuid,
  p_note text DEFAULT NULL
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
  normalized_note text := NULLIF(btrim(p_note), '');
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 1000 THEN
    RAISE EXCEPTION 'Reason must be 1000 characters or fewer';
  END IF;

  SELECT * INTO selected_request
  FROM public.food_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR selected_request.status NOT IN ('pending', 'pending_pickup') THEN
    RAISE EXCEPTION 'Active request not found';
  END IF;

  SELECT * INTO selected_listing
  FROM public.food_listings
  WHERE id = selected_request.listing_id AND donor_id = current_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the listing donor can reject this request';
  END IF;

  UPDATE public.food_requests
  SET status = 'rejected',
      pickup_confirmed_at = NULL,
      status_note = normalized_note,
      status_note_author = CASE WHEN normalized_note IS NOT NULL THEN current_user_id ELSE NULL END
  WHERE id = p_request_id
  RETURNING * INTO selected_request;

  UPDATE public.food_listings
  SET quantity = quantity + selected_request.quantity, status = 'available'
  WHERE id = selected_request.listing_id;

  RETURN selected_request;
END;
$$;

CREATE FUNCTION public.undo_food_request_rejection(p_request_id uuid)
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

  SELECT * INTO selected_request
  FROM public.food_requests
  WHERE id = p_request_id AND status = 'rejected'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rejected request not found';
  END IF;

  SELECT * INTO selected_listing
  FROM public.food_listings
  WHERE id = selected_request.listing_id AND donor_id = current_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the listing donor can undo this rejection';
  END IF;

  UPDATE public.food_listings
  SET quantity = quantity - selected_request.quantity,
      status = CASE WHEN quantity - selected_request.quantity = 0 THEN 'requested' ELSE 'available' END
  WHERE id = selected_listing.id
    AND expiry_time > now()
    AND quantity >= selected_request.quantity
  RETURNING * INTO selected_listing;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The request cannot be restored because enough inventory is no longer available';
  END IF;

  UPDATE public.food_requests
  SET status = 'pending',
      pickup_confirmed_at = NULL,
      status_note = NULL,
      status_note_author = NULL
  WHERE id = p_request_id
  RETURNING * INTO selected_request;

  RETURN selected_request;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_food(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_food(uuid, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reserve_food(uuid, integer, text) TO authenticated;

REVOKE ALL ON FUNCTION public.advance_food_request(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_food_request(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.advance_food_request(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.confirm_food_pickup(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_food_pickup(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_food_pickup(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_food_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_food_request(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_food_request(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_food_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_food_request(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_food_request(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.undo_food_request_rejection(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.undo_food_request_rejection(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.undo_food_request_rejection(uuid) TO authenticated;


ALTER TABLE public.food_requests
  DROP CONSTRAINT food_requests_status_check;

UPDATE public.food_requests
SET status = 'declined'
WHERE status = 'rejected';

ALTER TABLE public.food_requests
  ADD CONSTRAINT food_requests_status_check
    CHECK (status IN ('pending', 'pending_pickup', 'completed', 'declined', 'cancelled'));

ALTER FUNCTION public.reject_food_request(uuid, text) RENAME TO decline_food_request;
ALTER FUNCTION public.undo_food_request_rejection(uuid) RENAME TO undo_food_request_decline;

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
    SELECT 1 FROM public.profiles
    WHERE user_id = current_user_id AND role IN ('receiver', 'ngo')
  ) THEN
    RAISE EXCEPTION 'Only recipients can request food';
  END IF;

  SELECT * INTO existing_request
  FROM public.food_requests
  WHERE listing_id = p_listing_id AND receiver_id = current_user_id
  FOR UPDATE;

  IF FOUND AND existing_request.status NOT IN ('declined', 'cancelled') THEN
    RAISE EXCEPTION 'You already have an active request for this listing';
  END IF;

  UPDATE public.food_listings
  SET quantity = quantity - p_quantity,
      status = CASE WHEN quantity - p_quantity = 0 THEN 'requested' ELSE 'available' END
  WHERE id = p_listing_id
    AND status IN ('available', 'requested', 'completed')
    AND expiry_time > now()
    AND quantity >= p_quantity
  RETURNING * INTO reserved_listing;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The requested quantity is no longer available';
  END IF;

  IF existing_request.id IS NOT NULL THEN
    UPDATE public.food_requests
    SET quantity = p_quantity,
        notes = normalized_notes,
        status = 'pending',
        pickup_confirmed_at = NULL,
        status_note = NULL,
        status_note_author = NULL,
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

CREATE OR REPLACE FUNCTION public.decline_food_request(
  p_request_id uuid,
  p_note text DEFAULT NULL
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
  normalized_note text := NULLIF(btrim(p_note), '');
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 1000 THEN
    RAISE EXCEPTION 'Reason must be 1000 characters or fewer';
  END IF;

  SELECT * INTO selected_request
  FROM public.food_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR selected_request.status NOT IN ('pending', 'pending_pickup') THEN
    RAISE EXCEPTION 'Active request not found';
  END IF;

  SELECT * INTO selected_listing
  FROM public.food_listings
  WHERE id = selected_request.listing_id AND donor_id = current_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the listing donor can decline this request';
  END IF;

  UPDATE public.food_requests
  SET status = 'declined',
      pickup_confirmed_at = NULL,
      status_note = normalized_note,
      status_note_author = CASE WHEN normalized_note IS NOT NULL THEN current_user_id ELSE NULL END
  WHERE id = p_request_id
  RETURNING * INTO selected_request;

  UPDATE public.food_listings
  SET quantity = quantity + selected_request.quantity, status = 'available'
  WHERE id = selected_request.listing_id;

  RETURN selected_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_food_request_decline(p_request_id uuid)
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

  SELECT * INTO selected_request
  FROM public.food_requests
  WHERE id = p_request_id AND status = 'declined'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Declined request not found';
  END IF;

  SELECT * INTO selected_listing
  FROM public.food_listings
  WHERE id = selected_request.listing_id AND donor_id = current_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the listing donor can undo this decline';
  END IF;

  UPDATE public.food_listings
  SET quantity = quantity - selected_request.quantity,
      status = CASE WHEN quantity - selected_request.quantity = 0 THEN 'requested' ELSE 'available' END
  WHERE id = selected_listing.id
    AND expiry_time > now()
    AND quantity >= selected_request.quantity
  RETURNING * INTO selected_listing;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The request cannot be restored because enough inventory is no longer available';
  END IF;

  UPDATE public.food_requests
  SET status = 'pending',
      pickup_confirmed_at = NULL,
      status_note = NULL,
      status_note_author = NULL
  WHERE id = p_request_id
  RETURNING * INTO selected_request;

  RETURN selected_request;
END;
$$;

REVOKE ALL ON FUNCTION public.decline_food_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decline_food_request(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.decline_food_request(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.undo_food_request_decline(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.undo_food_request_decline(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.undo_food_request_decline(uuid) TO authenticated;


CREATE TABLE public.pickup_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.food_listings(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pickup_slots_thirty_minutes CHECK (ends_at = starts_at + interval '30 minutes'),
  UNIQUE (listing_id, starts_at)
);

ALTER TABLE public.pickup_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view pickup slots"
ON public.pickup_slots FOR SELECT TO authenticated USING (true);

ALTER TABLE public.food_requests
  ADD COLUMN pickup_slot_id uuid REFERENCES public.pickup_slots(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX food_requests_active_pickup_slot_key
ON public.food_requests (pickup_slot_id)
WHERE pickup_slot_id IS NOT NULL AND status IN ('pending', 'pending_pickup', 'completed');

CREATE OR REPLACE FUNCTION public.create_food_listing_with_slots(
  p_food_name text,
  p_quantity integer,
  p_location text,
  p_expiry_time timestamptz,
  p_notes text,
  p_photo_path text,
  p_food_analysis jsonb,
  p_pickup_start timestamptz,
  p_pickup_end timestamptz
)
RETURNS public.food_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  created_listing public.food_listings%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = current_user_id AND role = 'donor') THEN
    RAISE EXCEPTION 'Only donors can create food listings';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be a positive whole number';
  END IF;
  IF p_photo_path IS NOT NULL AND split_part(p_photo_path, '/', 1) <> current_user_id::text THEN
    RAISE EXCEPTION 'Photo path must belong to the listing donor';
  END IF;
  IF p_pickup_start IS NULL OR p_pickup_end IS NULL OR p_pickup_start <= now() OR p_pickup_end <= p_pickup_start THEN
    RAISE EXCEPTION 'Choose a valid future pickup window';
  END IF;
  IF p_pickup_end > p_expiry_time THEN
    RAISE EXCEPTION 'Pickup must end before the food availability expires';
  END IF;
  IF extract(epoch FROM (p_pickup_end - p_pickup_start))::integer % 1800 <> 0 THEN
    RAISE EXCEPTION 'Pickup range must divide into 30-minute windows';
  END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > 1000 THEN
    RAISE EXCEPTION 'Notes must be 1000 characters or fewer';
  END IF;

  INSERT INTO public.food_listings (donor_id, food_name, quantity, location, expiry_time, notes, photo_path, food_analysis)
  VALUES (current_user_id, btrim(p_food_name), p_quantity, btrim(p_location), p_expiry_time, NULLIF(btrim(p_notes), ''), p_photo_path, p_food_analysis)
  RETURNING * INTO created_listing;

  INSERT INTO public.pickup_slots (listing_id, starts_at, ends_at)
  SELECT created_listing.id, slot_start, slot_start + interval '30 minutes'
  FROM generate_series(p_pickup_start, p_pickup_end - interval '30 minutes', interval '30 minutes') AS slot_start;

  RETURN created_listing;
END;
$$;

CREATE FUNCTION public.get_available_pickup_slots(p_listing_id uuid)
RETURNS SETOF public.pickup_slots
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT slot.*
  FROM public.pickup_slots AS slot
  WHERE auth.uid() IS NOT NULL
    AND slot.listing_id = p_listing_id
    AND slot.starts_at > now()
    AND NOT EXISTS (
      SELECT 1
      FROM public.food_requests AS request
      WHERE request.pickup_slot_id = slot.id
        AND request.status IN ('pending', 'pending_pickup', 'completed')
    )
  ORDER BY slot.starts_at;
$$;

DROP FUNCTION public.reserve_food(uuid, integer, text);

CREATE FUNCTION public.reserve_food(
  p_listing_id uuid,
  p_quantity integer,
  p_pickup_slot_id uuid,
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
  selected_slot public.pickup_slots%ROWTYPE;
  existing_request public.food_requests%ROWTYPE;
  created_request public.food_requests%ROWTYPE;
  normalized_notes text := NULLIF(btrim(p_notes), '');
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Requested quantity must be a positive whole number'; END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > 1000 THEN RAISE EXCEPTION 'Notes must be 1000 characters or fewer'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = current_user_id AND role IN ('receiver', 'ngo')) THEN
    RAISE EXCEPTION 'Only recipients can request food';
  END IF;

  SELECT * INTO selected_slot
  FROM public.pickup_slots
  WHERE id = p_pickup_slot_id AND listing_id = p_listing_id AND starts_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select an available future pickup window'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.food_requests
    WHERE pickup_slot_id = p_pickup_slot_id AND status IN ('pending', 'pending_pickup', 'completed')
  ) THEN
    RAISE EXCEPTION 'That pickup window is no longer available';
  END IF;

  SELECT * INTO existing_request
  FROM public.food_requests
  WHERE listing_id = p_listing_id AND receiver_id = current_user_id
  FOR UPDATE;
  IF FOUND AND existing_request.status NOT IN ('declined', 'cancelled') THEN
    RAISE EXCEPTION 'You already have an active request for this listing';
  END IF;

  UPDATE public.food_listings
  SET quantity = quantity - p_quantity,
      status = CASE WHEN quantity - p_quantity = 0 THEN 'requested' ELSE 'available' END
  WHERE id = p_listing_id
    AND status IN ('available', 'requested', 'completed')
    AND expiry_time > now()
    AND quantity >= p_quantity
  RETURNING * INTO reserved_listing;
  IF NOT FOUND THEN RAISE EXCEPTION 'The requested quantity is no longer available'; END IF;

  IF existing_request.id IS NOT NULL THEN
    UPDATE public.food_requests
    SET quantity = p_quantity, notes = normalized_notes, pickup_slot_id = p_pickup_slot_id,
        status = 'pending', pickup_confirmed_at = NULL, status_note = NULL,
        status_note_author = NULL, created_at = now()
    WHERE id = existing_request.id
    RETURNING * INTO created_request;
  ELSE
    INSERT INTO public.food_requests (listing_id, receiver_id, quantity, notes, pickup_slot_id)
    VALUES (p_listing_id, current_user_id, p_quantity, normalized_notes, p_pickup_slot_id)
    RETURNING * INTO created_request;
  END IF;

  RETURN created_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_food_request_decline(p_request_id uuid)
RETURNS public.food_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  selected_request public.food_requests%ROWTYPE;
  selected_listing public.food_listings%ROWTYPE;
  selected_slot public.pickup_slots%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO selected_request
  FROM public.food_requests
  WHERE id = p_request_id AND status = 'declined'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Declined request not found'; END IF;

  SELECT * INTO selected_listing
  FROM public.food_listings
  WHERE id = selected_request.listing_id AND donor_id = current_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the listing donor can undo this decline'; END IF;

  IF selected_request.pickup_slot_id IS NOT NULL THEN
    SELECT * INTO selected_slot
    FROM public.pickup_slots
    WHERE id = selected_request.pickup_slot_id AND starts_at > now()
    FOR UPDATE;
    IF NOT FOUND OR EXISTS (
      SELECT 1 FROM public.food_requests
      WHERE pickup_slot_id = selected_request.pickup_slot_id
        AND id <> selected_request.id
        AND status IN ('pending', 'pending_pickup', 'completed')
    ) THEN
      RAISE EXCEPTION 'The original pickup window is no longer available';
    END IF;
  END IF;

  UPDATE public.food_listings
  SET quantity = quantity - selected_request.quantity,
      status = CASE WHEN quantity - selected_request.quantity = 0 THEN 'requested' ELSE 'available' END
  WHERE id = selected_listing.id
    AND expiry_time > now()
    AND quantity >= selected_request.quantity
  RETURNING * INTO selected_listing;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The request cannot be restored because enough inventory is no longer available';
  END IF;

  UPDATE public.food_requests
  SET status = 'pending', pickup_confirmed_at = NULL, status_note = NULL, status_note_author = NULL
  WHERE id = p_request_id
  RETURNING * INTO selected_request;

  RETURN selected_request;
END;
$$;

REVOKE ALL ON FUNCTION public.create_food_listing_with_slots(text, integer, text, timestamptz, text, text, jsonb, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_food_listing_with_slots(text, integer, text, timestamptz, text, text, jsonb, timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_food_listing_with_slots(text, integer, text, timestamptz, text, text, jsonb, timestamptz, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.get_available_pickup_slots(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_available_pickup_slots(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_available_pickup_slots(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.reserve_food(uuid, integer, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_food(uuid, integer, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reserve_food(uuid, integer, uuid, text) TO authenticated;


ALTER TABLE public.profiles DISABLE TRIGGER prevent_role_change_trigger;

UPDATE public.profiles
SET role = 'receiver'
WHERE role = 'ngo';

ALTER TABLE public.profiles ENABLE TRIGGER prevent_role_change_trigger;

UPDATE auth.users
SET raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{role}', '"receiver"'::jsonb, true)
WHERE raw_user_meta_data->>'role' = 'ngo';

ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('donor', 'receiver'));

CREATE OR REPLACE FUNCTION public.reserve_food(
  p_listing_id uuid,
  p_quantity integer,
  p_pickup_slot_id uuid,
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
  selected_slot public.pickup_slots%ROWTYPE;
  existing_request public.food_requests%ROWTYPE;
  created_request public.food_requests%ROWTYPE;
  normalized_notes text := NULLIF(btrim(p_notes), '');
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Requested quantity must be a positive whole number'; END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > 1000 THEN RAISE EXCEPTION 'Notes must be 1000 characters or fewer'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = current_user_id AND role = 'receiver') THEN
    RAISE EXCEPTION 'Only recipients can request food';
  END IF;

  SELECT * INTO selected_slot
  FROM public.pickup_slots
  WHERE id = p_pickup_slot_id AND listing_id = p_listing_id AND starts_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select an available future pickup window'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.food_requests
    WHERE pickup_slot_id = p_pickup_slot_id AND status IN ('pending', 'pending_pickup', 'completed')
  ) THEN
    RAISE EXCEPTION 'That pickup window is no longer available';
  END IF;

  SELECT * INTO existing_request
  FROM public.food_requests
  WHERE listing_id = p_listing_id AND receiver_id = current_user_id
  FOR UPDATE;
  IF FOUND AND existing_request.status NOT IN ('declined', 'cancelled') THEN
    RAISE EXCEPTION 'You already have an active request for this listing';
  END IF;

  UPDATE public.food_listings
  SET quantity = quantity - p_quantity,
      status = CASE WHEN quantity - p_quantity = 0 THEN 'requested' ELSE 'available' END
  WHERE id = p_listing_id
    AND status IN ('available', 'requested', 'completed')
    AND expiry_time > now()
    AND quantity >= p_quantity
  RETURNING * INTO reserved_listing;
  IF NOT FOUND THEN RAISE EXCEPTION 'The requested quantity is no longer available'; END IF;

  IF existing_request.id IS NOT NULL THEN
    UPDATE public.food_requests
    SET quantity = p_quantity, notes = normalized_notes, pickup_slot_id = p_pickup_slot_id,
        status = 'pending', pickup_confirmed_at = NULL, status_note = NULL,
        status_note_author = NULL, created_at = now()
    WHERE id = existing_request.id
    RETURNING * INTO created_request;
  ELSE
    INSERT INTO public.food_requests (listing_id, receiver_id, quantity, notes, pickup_slot_id)
    VALUES (p_listing_id, current_user_id, p_quantity, normalized_notes, p_pickup_slot_id)
    RETURNING * INTO created_request;
  END IF;

  RETURN created_request;
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
    (SELECT count(*) FROM public.profiles WHERE role = 'receiver') AS total_recipients,
    (SELECT COALESCE(sum(quantity), 0)::bigint FROM public.food_requests WHERE status = 'completed') AS total_meals_saved;
$$;


ALTER TABLE public.pickup_slots ADD COLUMN capacity integer;

UPDATE public.pickup_slots AS slot
SET capacity = listing.quantity + COALESCE((
  SELECT sum(request.quantity)
  FROM public.food_requests AS request
  WHERE request.listing_id = listing.id
    AND request.status IN ('pending', 'pending_pickup', 'completed')
), 0)
FROM public.food_listings AS listing
WHERE listing.id = slot.listing_id;

ALTER TABLE public.pickup_slots
  ALTER COLUMN capacity SET NOT NULL,
  ADD CONSTRAINT pickup_slots_capacity_positive CHECK (capacity > 0),
  DROP CONSTRAINT pickup_slots_thirty_minutes,
  ADD CONSTRAINT pickup_slots_minimum_duration CHECK (ends_at >= starts_at + interval '15 minutes');

CREATE TABLE public.request_pickup_allocations (
  request_id uuid NOT NULL REFERENCES public.food_requests(id) ON DELETE CASCADE,
  pickup_slot_id uuid NOT NULL REFERENCES public.pickup_slots(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (request_id, pickup_slot_id)
);

ALTER TABLE public.request_pickup_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view relevant pickup allocations"
ON public.request_pickup_allocations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.food_requests AS request
    JOIN public.food_listings AS listing ON listing.id = request.listing_id
    WHERE request.id = request_id
      AND (request.receiver_id = auth.uid() OR listing.donor_id = auth.uid())
  )
);

INSERT INTO public.request_pickup_allocations (request_id, pickup_slot_id, quantity)
SELECT id, pickup_slot_id, quantity
FROM public.food_requests
WHERE pickup_slot_id IS NOT NULL;

DROP INDEX public.food_requests_active_pickup_slot_key;
DROP FUNCTION public.reserve_food(uuid, integer, uuid, text);
DROP FUNCTION public.get_available_pickup_slots(uuid);
DROP FUNCTION public.create_food_listing_with_slots(text, integer, text, timestamptz, text, text, jsonb, timestamptz, timestamptz);

ALTER TABLE public.food_requests DROP COLUMN pickup_slot_id;

CREATE FUNCTION public.create_food_listing_with_slots(
  p_food_name text,
  p_quantity integer,
  p_location text,
  p_notes text,
  p_photo_path text,
  p_food_analysis jsonb,
  p_pickup_blocks jsonb
)
RETURNS public.food_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  created_listing public.food_listings%ROWTYPE;
  latest_pickup timestamptz;
  invalid_blocks integer;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = current_user_id AND role = 'donor') THEN
    RAISE EXCEPTION 'Only donors can create food listings';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be a positive whole number'; END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > 1000 THEN RAISE EXCEPTION 'Notes must be 1000 characters or fewer'; END IF;
  IF p_photo_path IS NOT NULL AND split_part(p_photo_path, '/', 1) <> current_user_id::text THEN
    RAISE EXCEPTION 'Photo path must belong to the listing donor';
  END IF;
  IF jsonb_typeof(p_pickup_blocks) <> 'array' OR jsonb_array_length(p_pickup_blocks) = 0 THEN
    RAISE EXCEPTION 'Select at least one pickup availability block';
  END IF;

  SELECT count(*), max((block->>'endsAt')::timestamptz)
  INTO invalid_blocks, latest_pickup
  FROM jsonb_array_elements(p_pickup_blocks) AS block
  WHERE (block->>'startsAt') IS NULL
    OR (block->>'endsAt') IS NULL
    OR (block->>'startsAt')::timestamptz <= now()
    OR (block->>'endsAt')::timestamptz < (block->>'startsAt')::timestamptz + interval '15 minutes';

  IF invalid_blocks > 0 OR latest_pickup IS NULL THEN
    RAISE EXCEPTION 'Pickup blocks must be future windows of at least 15 minutes';
  END IF;

  SELECT max((block->>'endsAt')::timestamptz)
  INTO latest_pickup
  FROM jsonb_array_elements(p_pickup_blocks) AS block;

  INSERT INTO public.food_listings (donor_id, food_name, quantity, location, expiry_time, notes, photo_path, food_analysis)
  VALUES (current_user_id, btrim(p_food_name), p_quantity, btrim(p_location), latest_pickup,
          NULLIF(btrim(p_notes), ''), p_photo_path, p_food_analysis)
  RETURNING * INTO created_listing;

  INSERT INTO public.pickup_slots (listing_id, starts_at, ends_at, capacity)
  SELECT created_listing.id, (block->>'startsAt')::timestamptz,
         (block->>'endsAt')::timestamptz, p_quantity
  FROM jsonb_array_elements(p_pickup_blocks) AS block;

  RETURN created_listing;
END;
$$;

CREATE FUNCTION public.get_available_pickup_slots(p_listing_id uuid)
RETURNS TABLE (id uuid, listing_id uuid, starts_at timestamptz, ends_at timestamptz, created_at timestamptz, capacity integer, allocated integer, remaining integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT slot.id, slot.listing_id, slot.starts_at, slot.ends_at, slot.created_at, slot.capacity,
         COALESCE(sum(allocation.quantity) FILTER (WHERE request.status IN ('pending', 'pending_pickup', 'completed')), 0)::integer AS allocated,
         (slot.capacity - COALESCE(sum(allocation.quantity) FILTER (WHERE request.status IN ('pending', 'pending_pickup', 'completed')), 0))::integer AS remaining
  FROM public.pickup_slots AS slot
  LEFT JOIN public.request_pickup_allocations AS allocation ON allocation.pickup_slot_id = slot.id
  LEFT JOIN public.food_requests AS request ON request.id = allocation.request_id
  WHERE auth.uid() IS NOT NULL AND slot.listing_id = p_listing_id AND slot.ends_at > now()
  GROUP BY slot.id
  ORDER BY slot.starts_at;
$$;

CREATE FUNCTION public.reserve_food(
  p_listing_id uuid,
  p_quantity integer,
  p_allocations jsonb,
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
  allocation_count integer;
  allocation_total integer;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Requested quantity must be a positive whole number'; END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > 1000 THEN RAISE EXCEPTION 'Notes must be 1000 characters or fewer'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = current_user_id AND role = 'receiver') THEN
    RAISE EXCEPTION 'Only recipients can request food';
  END IF;
  IF jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'Allocate the requested quantity to pickup windows';
  END IF;

  SELECT count(*), COALESCE(sum((entry->>'quantity')::integer), 0)
  INTO allocation_count, allocation_total
  FROM jsonb_array_elements(p_allocations) AS entry;
  IF allocation_count <> (SELECT count(DISTINCT entry->>'slotId') FROM jsonb_array_elements(p_allocations) AS entry)
     OR allocation_total <> p_quantity
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_allocations) AS entry WHERE (entry->>'quantity')::integer <= 0) THEN
    RAISE EXCEPTION 'Pickup allocations must be positive, unique, and total the requested quantity';
  END IF;

  PERFORM 1
  FROM public.pickup_slots
  WHERE id IN (SELECT (entry->>'slotId')::uuid FROM jsonb_array_elements(p_allocations) AS entry)
  ORDER BY id
  FOR UPDATE;

  IF (SELECT count(*) FROM public.pickup_slots WHERE id IN (SELECT (entry->>'slotId')::uuid FROM jsonb_array_elements(p_allocations) AS entry) AND listing_id = p_listing_id AND ends_at > now()) <> allocation_count THEN
    RAISE EXCEPTION 'One or more pickup windows are invalid or expired';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_allocations) AS entry
    JOIN public.pickup_slots AS slot ON slot.id = (entry->>'slotId')::uuid
    WHERE (entry->>'quantity')::integer + COALESCE((
      SELECT sum(existing.quantity)
      FROM public.request_pickup_allocations AS existing
      JOIN public.food_requests AS request ON request.id = existing.request_id
      WHERE existing.pickup_slot_id = slot.id AND request.status IN ('pending', 'pending_pickup', 'completed')
    ), 0) > slot.capacity
  ) THEN
    RAISE EXCEPTION 'One or more pickup windows no longer have enough capacity';
  END IF;

  SELECT * INTO existing_request
  FROM public.food_requests
  WHERE listing_id = p_listing_id AND receiver_id = current_user_id
  FOR UPDATE;
  IF FOUND AND existing_request.status NOT IN ('declined', 'cancelled') THEN
    RAISE EXCEPTION 'You already have an active request for this listing';
  END IF;

  UPDATE public.food_listings
  SET quantity = quantity - p_quantity,
      status = CASE WHEN quantity - p_quantity = 0 THEN 'requested' ELSE 'available' END
  WHERE id = p_listing_id AND status IN ('available', 'requested', 'completed')
    AND expiry_time > now() AND quantity >= p_quantity
  RETURNING * INTO reserved_listing;
  IF NOT FOUND THEN RAISE EXCEPTION 'The requested quantity is no longer available'; END IF;

  IF existing_request.id IS NOT NULL THEN
    DELETE FROM public.request_pickup_allocations WHERE request_id = existing_request.id;
    UPDATE public.food_requests
    SET quantity = p_quantity, notes = normalized_notes, status = 'pending',
        pickup_confirmed_at = NULL, status_note = NULL, status_note_author = NULL, created_at = now()
    WHERE id = existing_request.id RETURNING * INTO created_request;
  ELSE
    INSERT INTO public.food_requests (listing_id, receiver_id, quantity, notes)
    VALUES (p_listing_id, current_user_id, p_quantity, normalized_notes)
    RETURNING * INTO created_request;
  END IF;

  INSERT INTO public.request_pickup_allocations (request_id, pickup_slot_id, quantity)
  SELECT created_request.id, (entry->>'slotId')::uuid, (entry->>'quantity')::integer
  FROM jsonb_array_elements(p_allocations) AS entry;

  RETURN created_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_food_request_decline(p_request_id uuid)
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
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO selected_request FROM public.food_requests
  WHERE id = p_request_id AND status = 'declined' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Declined request not found'; END IF;

  SELECT * INTO selected_listing FROM public.food_listings
  WHERE id = selected_request.listing_id AND donor_id = current_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the listing donor can undo this decline'; END IF;

  PERFORM 1 FROM public.pickup_slots
  WHERE id IN (SELECT pickup_slot_id FROM public.request_pickup_allocations WHERE request_id = p_request_id)
  ORDER BY id FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.request_pickup_allocations AS restored
    JOIN public.pickup_slots AS slot ON slot.id = restored.pickup_slot_id
    WHERE restored.request_id = p_request_id
      AND restored.quantity + COALESCE((
        SELECT sum(existing.quantity)
        FROM public.request_pickup_allocations AS existing
        JOIN public.food_requests AS request ON request.id = existing.request_id
        WHERE existing.pickup_slot_id = slot.id
          AND existing.request_id <> p_request_id
          AND request.status IN ('pending', 'pending_pickup', 'completed')
      ), 0) > slot.capacity
  ) THEN
    RAISE EXCEPTION 'The original pickup windows no longer have enough capacity';
  END IF;

  UPDATE public.food_listings
  SET quantity = quantity - selected_request.quantity,
      status = CASE WHEN quantity - selected_request.quantity = 0 THEN 'requested' ELSE 'available' END
  WHERE id = selected_listing.id AND expiry_time > now() AND quantity >= selected_request.quantity
  RETURNING * INTO selected_listing;
  IF NOT FOUND THEN RAISE EXCEPTION 'The request cannot be restored because enough inventory is no longer available'; END IF;

  UPDATE public.food_requests
  SET status = 'pending', pickup_confirmed_at = NULL, status_note = NULL, status_note_author = NULL
  WHERE id = p_request_id RETURNING * INTO selected_request;

  RETURN selected_request;
END;
$$;

REVOKE ALL ON FUNCTION public.create_food_listing_with_slots(text, integer, text, text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_food_listing_with_slots(text, integer, text, text, text, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_food_listing_with_slots(text, integer, text, text, text, jsonb, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.get_available_pickup_slots(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_available_pickup_slots(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_available_pickup_slots(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.reserve_food(uuid, integer, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_food(uuid, integer, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reserve_food(uuid, integer, jsonb, text) TO authenticated;


ALTER TABLE public.request_pickup_allocations
  ADD COLUMN active boolean NOT NULL DEFAULT true;

UPDATE public.request_pickup_allocations AS allocation
SET active = request.status IN ('pending', 'pending_pickup', 'completed')
FROM public.food_requests AS request
WHERE request.id = allocation.request_id;

CREATE UNIQUE INDEX request_pickup_allocations_active_slot_key
ON public.request_pickup_allocations (pickup_slot_id)
WHERE active;

INSERT INTO public.pickup_slots (listing_id, starts_at, ends_at, capacity)
SELECT slot.listing_id, segment_start, segment_start + interval '15 minutes', slot.capacity
FROM public.pickup_slots AS slot
CROSS JOIN LATERAL generate_series(
  slot.starts_at + interval '15 minutes',
  slot.ends_at - interval '15 minutes',
  interval '15 minutes'
) AS segment_start
ON CONFLICT (listing_id, starts_at) DO NOTHING;

UPDATE public.pickup_slots
SET ends_at = starts_at + interval '15 minutes'
WHERE ends_at > starts_at + interval '15 minutes';

ALTER TABLE public.pickup_slots
  DROP CONSTRAINT pickup_slots_minimum_duration,
  ADD CONSTRAINT pickup_slots_fifteen_minutes CHECK (ends_at = starts_at + interval '15 minutes');

CREATE OR REPLACE FUNCTION public.sync_request_pickup_allocation_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.request_pickup_allocations
  SET active = NEW.status IN ('pending', 'pending_pickup', 'completed')
  WHERE request_id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_request_pickup_allocation_state
AFTER UPDATE OF status ON public.food_requests
FOR EACH ROW EXECUTE FUNCTION public.sync_request_pickup_allocation_state();

CREATE OR REPLACE FUNCTION public.reserve_food(
  p_listing_id uuid,
  p_quantity integer,
  p_allocations jsonb,
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
  allocation_count integer;
  allocation_total integer;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Requested quantity must be a positive whole number'; END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > 1000 THEN RAISE EXCEPTION 'Notes must be 1000 characters or fewer'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = current_user_id AND role = 'receiver') THEN
    RAISE EXCEPTION 'Only recipients can request food';
  END IF;
  IF jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) <> 1 THEN
    RAISE EXCEPTION 'Select exactly one 15-minute pickup slot';
  END IF;

  SELECT count(*), COALESCE(sum((entry->>'quantity')::integer), 0)
  INTO allocation_count, allocation_total
  FROM jsonb_array_elements(p_allocations) AS entry;
  IF allocation_total <> p_quantity OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_allocations) AS entry
    WHERE (entry->>'quantity')::integer <= 0
  ) THEN
    RAISE EXCEPTION 'Pickup allocation must equal the requested quantity';
  END IF;

  PERFORM 1
  FROM public.pickup_slots
  WHERE id = (p_allocations->0->>'slotId')::uuid
    AND listing_id = p_listing_id
    AND starts_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select an available future pickup slot'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.request_pickup_allocations
    WHERE pickup_slot_id = (p_allocations->0->>'slotId')::uuid AND active
  ) THEN
    RAISE EXCEPTION 'That pickup slot is no longer available';
  END IF;

  SELECT * INTO existing_request
  FROM public.food_requests
  WHERE listing_id = p_listing_id AND receiver_id = current_user_id
  FOR UPDATE;
  IF FOUND AND existing_request.status NOT IN ('declined', 'cancelled') THEN
    RAISE EXCEPTION 'You already have an active request for this listing';
  END IF;

  UPDATE public.food_listings
  SET quantity = quantity - p_quantity,
      status = CASE WHEN quantity - p_quantity = 0 THEN 'requested' ELSE 'available' END
  WHERE id = p_listing_id AND status IN ('available', 'requested', 'completed')
    AND expiry_time > now() AND quantity >= p_quantity
  RETURNING * INTO reserved_listing;
  IF NOT FOUND THEN RAISE EXCEPTION 'The requested quantity is no longer available'; END IF;

  IF existing_request.id IS NOT NULL THEN
    DELETE FROM public.request_pickup_allocations WHERE request_id = existing_request.id;
    UPDATE public.food_requests
    SET quantity = p_quantity, notes = normalized_notes, status = 'pending',
        pickup_confirmed_at = NULL, status_note = NULL, status_note_author = NULL, created_at = now()
    WHERE id = existing_request.id RETURNING * INTO created_request;
  ELSE
    INSERT INTO public.food_requests (listing_id, receiver_id, quantity, notes)
    VALUES (p_listing_id, current_user_id, p_quantity, normalized_notes)
    RETURNING * INTO created_request;
  END IF;

  INSERT INTO public.request_pickup_allocations (request_id, pickup_slot_id, quantity, active)
  VALUES (created_request.id, (p_allocations->0->>'slotId')::uuid, p_quantity, true);

  RETURN created_request;
END;
$$;


CREATE FUNCTION public.replace_listing_pickup_slots(
  p_listing_id uuid,
  p_remove_ids uuid[],
  p_new_slots jsonb
)
RETURNS SETOF public.pickup_slots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  remove_count integer := COALESCE(cardinality(p_remove_ids), 0);
  new_count integer;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  PERFORM 1 FROM public.food_listings
  WHERE id = p_listing_id AND donor_id = current_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the listing donor can manage pickup slots'; END IF;

  IF remove_count > 0 AND (
    SELECT count(*) FROM public.pickup_slots
    WHERE id = ANY(p_remove_ids) AND listing_id = p_listing_id
  ) <> remove_count THEN
    RAISE EXCEPTION 'One or more pickup slots do not belong to this listing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.request_pickup_allocations
    WHERE pickup_slot_id = ANY(COALESCE(p_remove_ids, ARRAY[]::uuid[]))
  ) THEN
    RAISE EXCEPTION 'Booked pickup slots cannot be changed or deleted';
  END IF;

  IF jsonb_typeof(COALESCE(p_new_slots, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Pickup slots must be an array';
  END IF;

  SELECT jsonb_array_length(COALESCE(p_new_slots, '[]'::jsonb)) INTO new_count;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_new_slots, '[]'::jsonb)) AS slot
    WHERE (slot->>'startsAt') IS NULL
      OR (slot->>'endsAt') IS NULL
      OR (slot->>'startsAt')::timestamptz <= now()
      OR (slot->>'endsAt')::timestamptz <> (slot->>'startsAt')::timestamptz + interval '15 minutes'
  ) THEN
    RAISE EXCEPTION 'Pickup slots must be future 15-minute intervals';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_new_slots, '[]'::jsonb)) AS candidate
    JOIN public.pickup_slots AS existing
      ON existing.listing_id = p_listing_id
     AND existing.id <> ALL(COALESCE(p_remove_ids, ARRAY[]::uuid[]))
     AND tstzrange(existing.starts_at, existing.ends_at, '[)') &&
         tstzrange((candidate->>'startsAt')::timestamptz, (candidate->>'endsAt')::timestamptz, '[)')
  ) THEN
    RAISE EXCEPTION 'Pickup slots cannot overlap';
  END IF;

  DELETE FROM public.pickup_slots
  WHERE id = ANY(COALESCE(p_remove_ids, ARRAY[]::uuid[]));

  INSERT INTO public.pickup_slots (listing_id, starts_at, ends_at, capacity)
  SELECT p_listing_id, (slot->>'startsAt')::timestamptz,
         (slot->>'endsAt')::timestamptz,
         (SELECT quantity + COALESCE((
           SELECT sum(request.quantity) FROM public.food_requests AS request
           WHERE request.listing_id = p_listing_id
             AND request.status IN ('pending', 'pending_pickup', 'completed')
         ), 0) FROM public.food_listings WHERE id = p_listing_id)
  FROM jsonb_array_elements(COALESCE(p_new_slots, '[]'::jsonb)) AS slot;

  IF NOT EXISTS (SELECT 1 FROM public.pickup_slots WHERE listing_id = p_listing_id) THEN
    RAISE EXCEPTION 'A listing must keep at least one pickup slot';
  END IF;

  UPDATE public.food_listings
  SET expiry_time = (SELECT max(ends_at) FROM public.pickup_slots WHERE listing_id = p_listing_id)
  WHERE id = p_listing_id;

  RETURN QUERY
  SELECT * FROM public.pickup_slots
  WHERE listing_id = p_listing_id
  ORDER BY starts_at;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_listing_pickup_slots(uuid, uuid[], jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_listing_pickup_slots(uuid, uuid[], jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.replace_listing_pickup_slots(uuid, uuid[], jsonb) TO authenticated;


CREATE FUNCTION public.update_food_listing_details(
  p_listing_id uuid,
  p_food_name text,
  p_total_quantity integer,
  p_location text,
  p_notes text
)
RETURNS public.food_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  selected_listing public.food_listings%ROWTYPE;
  allocated_quantity integer;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_total_quantity IS NULL OR p_total_quantity <= 0 THEN RAISE EXCEPTION 'Total quantity must be a positive whole number'; END IF;
  IF NULLIF(btrim(p_food_name), '') IS NULL THEN RAISE EXCEPTION 'Food name is required'; END IF;
  IF NULLIF(btrim(p_location), '') IS NULL THEN RAISE EXCEPTION 'Pickup location is required'; END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > 1000 THEN RAISE EXCEPTION 'Notes must be 1000 characters or fewer'; END IF;

  SELECT * INTO selected_listing
  FROM public.food_listings
  WHERE id = p_listing_id AND donor_id = current_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the listing donor can edit this listing'; END IF;

  SELECT COALESCE(sum(quantity), 0)::integer
  INTO allocated_quantity
  FROM public.food_requests
  WHERE listing_id = p_listing_id
    AND status IN ('pending', 'pending_pickup', 'completed');

  IF p_total_quantity < allocated_quantity THEN
    RAISE EXCEPTION 'Total quantity cannot be less than the quantity already allocated';
  END IF;

  UPDATE public.food_listings
  SET food_name = btrim(p_food_name),
      quantity = p_total_quantity - allocated_quantity,
      location = btrim(p_location),
      notes = NULLIF(btrim(p_notes), ''),
      status = CASE
        WHEN p_total_quantity - allocated_quantity > 0 THEN 'available'
        WHEN EXISTS (
          SELECT 1 FROM public.food_requests
          WHERE listing_id = p_listing_id AND status IN ('pending', 'pending_pickup')
        ) THEN 'requested'
        ELSE 'completed'
      END
  WHERE id = p_listing_id
  RETURNING * INTO selected_listing;

  UPDATE public.pickup_slots
  SET capacity = p_total_quantity
  WHERE listing_id = p_listing_id;

  RETURN selected_listing;
END;
$$;

REVOKE ALL ON FUNCTION public.update_food_listing_details(uuid, text, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_food_listing_details(uuid, text, integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_food_listing_details(uuid, text, integer, text, text) TO authenticated;


DROP INDEX public.request_pickup_allocations_active_slot_key;

CREATE OR REPLACE FUNCTION public.reserve_food(
  p_listing_id uuid,
  p_quantity integer,
  p_allocations jsonb,
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
  selected_slot public.pickup_slots%ROWTYPE;
  existing_request public.food_requests%ROWTYPE;
  created_request public.food_requests%ROWTYPE;
  normalized_notes text := NULLIF(btrim(p_notes), '');
  requested_slot_id uuid;
  allocated_quantity integer;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Requested quantity must be a positive whole number'; END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > 1000 THEN RAISE EXCEPTION 'Notes must be 1000 characters or fewer'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = current_user_id AND role = 'receiver') THEN
    RAISE EXCEPTION 'Only recipients can request food';
  END IF;
  IF jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) <> 1 THEN
    RAISE EXCEPTION 'Select exactly one 15-minute pickup slot';
  END IF;
  IF (p_allocations->0->>'quantity')::integer <> p_quantity OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Pickup allocation must equal the requested quantity';
  END IF;

  requested_slot_id := (p_allocations->0->>'slotId')::uuid;

  SELECT * INTO selected_slot
  FROM public.pickup_slots
  WHERE id = requested_slot_id AND listing_id = p_listing_id AND starts_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select an available future pickup slot'; END IF;

  SELECT COALESCE(sum(allocation.quantity), 0)::integer
  INTO allocated_quantity
  FROM public.request_pickup_allocations AS allocation
  JOIN public.food_requests AS request ON request.id = allocation.request_id
  WHERE allocation.pickup_slot_id = requested_slot_id
    AND allocation.active
    AND request.status IN ('pending', 'pending_pickup', 'completed');

  IF allocated_quantity + p_quantity > selected_slot.capacity THEN
    RAISE EXCEPTION 'That pickup slot does not have enough remaining capacity';
  END IF;

  SELECT * INTO existing_request
  FROM public.food_requests
  WHERE listing_id = p_listing_id AND receiver_id = current_user_id
  FOR UPDATE;
  IF FOUND AND existing_request.status NOT IN ('declined', 'cancelled') THEN
    RAISE EXCEPTION 'You already have an active request for this listing';
  END IF;

  UPDATE public.food_listings
  SET quantity = quantity - p_quantity,
      status = CASE WHEN quantity - p_quantity = 0 THEN 'requested' ELSE 'available' END
  WHERE id = p_listing_id AND status IN ('available', 'requested', 'completed')
    AND expiry_time > now() AND quantity >= p_quantity
  RETURNING * INTO reserved_listing;
  IF NOT FOUND THEN RAISE EXCEPTION 'The requested quantity is no longer available'; END IF;

  IF existing_request.id IS NOT NULL THEN
    DELETE FROM public.request_pickup_allocations WHERE request_id = existing_request.id;
    UPDATE public.food_requests
    SET quantity = p_quantity, notes = normalized_notes, status = 'pending',
        pickup_confirmed_at = NULL, status_note = NULL, status_note_author = NULL, created_at = now()
    WHERE id = existing_request.id RETURNING * INTO created_request;
  ELSE
    INSERT INTO public.food_requests (listing_id, receiver_id, quantity, notes)
    VALUES (p_listing_id, current_user_id, p_quantity, normalized_notes)
    RETURNING * INTO created_request;
  END IF;

  INSERT INTO public.request_pickup_allocations (request_id, pickup_slot_id, quantity, active)
  VALUES (created_request.id, requested_slot_id, p_quantity, true);

  RETURN created_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_food_request_decline(p_request_id uuid)
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
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO selected_request FROM public.food_requests
  WHERE id = p_request_id AND status = 'declined' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Declined request not found'; END IF;

  SELECT * INTO selected_listing FROM public.food_listings
  WHERE id = selected_request.listing_id AND donor_id = current_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the listing donor can undo this decline'; END IF;

  PERFORM 1 FROM public.pickup_slots
  WHERE id IN (SELECT pickup_slot_id FROM public.request_pickup_allocations WHERE request_id = p_request_id)
  ORDER BY id FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.request_pickup_allocations AS restored
    JOIN public.pickup_slots AS slot ON slot.id = restored.pickup_slot_id
    WHERE restored.request_id = p_request_id
      AND restored.quantity + COALESCE((
        SELECT sum(existing.quantity)
        FROM public.request_pickup_allocations AS existing
        JOIN public.food_requests AS request ON request.id = existing.request_id
        WHERE existing.pickup_slot_id = slot.id
          AND existing.request_id <> p_request_id
          AND existing.active
          AND request.status IN ('pending', 'pending_pickup', 'completed')
      ), 0) > slot.capacity
  ) THEN
    RAISE EXCEPTION 'The original pickup slot no longer has enough capacity';
  END IF;

  UPDATE public.food_listings
  SET quantity = quantity - selected_request.quantity,
      status = CASE WHEN quantity - selected_request.quantity = 0 THEN 'requested' ELSE 'available' END
  WHERE id = selected_listing.id AND expiry_time > now() AND quantity >= selected_request.quantity
  RETURNING * INTO selected_listing;
  IF NOT FOUND THEN RAISE EXCEPTION 'The request cannot be restored because enough inventory is no longer available'; END IF;

  UPDATE public.food_requests
  SET status = 'pending', pickup_confirmed_at = NULL, status_note = NULL, status_note_author = NULL
  WHERE id = p_request_id RETURNING * INTO selected_request;

  RETURN selected_request;
END;
$$;


CREATE OR REPLACE FUNCTION public.confirm_food_pickup(
  p_request_id uuid,
  p_note text DEFAULT NULL
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
  normalized_note text := NULLIF(btrim(p_note), '');
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 1000 THEN
    RAISE EXCEPTION 'Reason must be 1000 characters or fewer';
  END IF;

  SELECT * INTO selected_request
  FROM public.food_requests
  WHERE id = p_request_id
    AND receiver_id = current_user_id
    AND status = 'pending_pickup'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending pickup request not found';
  END IF;

  SELECT * INTO selected_listing
  FROM public.food_listings
  WHERE id = selected_request.listing_id
  FOR UPDATE;

  UPDATE public.food_requests
  SET status = 'completed',
      pickup_confirmed_at = now(),
      status_note = normalized_note,
      status_note_author = CASE WHEN normalized_note IS NOT NULL THEN current_user_id ELSE NULL END
  WHERE id = p_request_id
  RETURNING * INTO selected_request;

  UPDATE public.food_listings
  SET status = CASE
    WHEN quantity > 0 THEN 'available'
    WHEN EXISTS (
      SELECT 1 FROM public.food_requests
      WHERE listing_id = selected_listing.id
        AND status IN ('pending', 'pending_pickup')
    ) THEN 'requested'
    ELSE 'completed'
  END
  WHERE id = selected_listing.id;

  RETURN selected_request;
END;
$$;


CREATE TYPE public.pickup_interval AS ENUM ('15_minutes');

ALTER TABLE public.pickup_slots
  ADD COLUMN interval_unit public.pickup_interval NOT NULL DEFAULT '15_minutes';

CREATE TEMP TABLE pickup_slot_alignment_map ON COMMIT DROP AS
SELECT
  slot.id AS old_id,
  first_value(slot.id) OVER (
    PARTITION BY slot.listing_id,
      date_trunc('hour', slot.starts_at) + floor(extract(minute FROM slot.starts_at) / 15) * interval '15 minutes'
    ORDER BY EXISTS (
      SELECT 1 FROM public.request_pickup_allocations AS allocation
      WHERE allocation.pickup_slot_id = slot.id
    ) DESC, slot.starts_at, slot.id
  ) AS keeper_id
FROM public.pickup_slots AS slot;

INSERT INTO public.request_pickup_allocations (request_id, pickup_slot_id, quantity, active)
SELECT allocation.request_id, map.keeper_id, allocation.quantity, allocation.active
FROM public.request_pickup_allocations AS allocation
JOIN pickup_slot_alignment_map AS map ON map.old_id = allocation.pickup_slot_id
WHERE map.old_id <> map.keeper_id
ON CONFLICT (request_id, pickup_slot_id) DO UPDATE
SET quantity = public.request_pickup_allocations.quantity + EXCLUDED.quantity,
    active = public.request_pickup_allocations.active OR EXCLUDED.active;

DELETE FROM public.request_pickup_allocations AS allocation
USING pickup_slot_alignment_map AS map
WHERE allocation.pickup_slot_id = map.old_id
  AND map.old_id <> map.keeper_id;

DELETE FROM public.pickup_slots AS slot
USING pickup_slot_alignment_map AS map
WHERE slot.id = map.old_id
  AND map.old_id <> map.keeper_id;

UPDATE public.pickup_slots
SET starts_at = date_trunc('hour', starts_at)
      + floor(extract(minute FROM starts_at) / 15) * interval '15 minutes',
    ends_at = date_trunc('hour', starts_at)
      + floor(extract(minute FROM starts_at) / 15) * interval '15 minutes'
      + interval '15 minutes';

ALTER TABLE public.pickup_slots
  ADD CONSTRAINT pickup_slots_quarter_hour_alignment CHECK (
    extract(minute FROM starts_at)::integer % 15 = 0
    AND extract(second FROM starts_at) = 0
    AND extract(minute FROM ends_at)::integer % 15 = 0
    AND extract(second FROM ends_at) = 0
  );


DROP FUNCTION public.create_food_listing_with_slots(text, integer, text, text, text, jsonb, jsonb);
DROP FUNCTION public.update_food_listing_details(uuid, text, integer, text, text);

CREATE FUNCTION public.create_food_listing_with_slots(
  p_food_name text,
  p_quantity integer,
  p_location text,
  p_expiry_time timestamptz,
  p_notes text,
  p_photo_path text,
  p_food_analysis jsonb,
  p_pickup_blocks jsonb
)
RETURNS public.food_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  created_listing public.food_listings%ROWTYPE;
  latest_pickup timestamptz;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = current_user_id AND role = 'donor') THEN RAISE EXCEPTION 'Only donors can create food listings'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be a positive whole number'; END IF;
  IF p_expiry_time IS NULL OR p_expiry_time <= now() THEN RAISE EXCEPTION 'Expiration must be in the future'; END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > 1000 THEN RAISE EXCEPTION 'Notes must be 1000 characters or fewer'; END IF;
  IF p_photo_path IS NOT NULL AND split_part(p_photo_path, '/', 1) <> current_user_id::text THEN RAISE EXCEPTION 'Photo path must belong to the listing donor'; END IF;
  IF jsonb_typeof(p_pickup_blocks) <> 'array' OR jsonb_array_length(p_pickup_blocks) = 0 THEN RAISE EXCEPTION 'Select at least one pickup availability block'; END IF;

  SELECT max((block->>'endsAt')::timestamptz) INTO latest_pickup
  FROM jsonb_array_elements(p_pickup_blocks) AS block;
  IF latest_pickup IS NULL OR latest_pickup > p_expiry_time THEN RAISE EXCEPTION 'All pickup times must end before expiration'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_pickup_blocks) AS block
    WHERE (block->>'startsAt')::timestamptz <= now()
      OR (block->>'endsAt')::timestamptz <> (block->>'startsAt')::timestamptz + interval '15 minutes'
  ) THEN RAISE EXCEPTION 'Pickup slots must be future 15-minute intervals'; END IF;

  INSERT INTO public.food_listings (donor_id, food_name, quantity, location, expiry_time, notes, photo_path, food_analysis)
  VALUES (current_user_id, btrim(p_food_name), p_quantity, btrim(p_location), p_expiry_time, NULLIF(btrim(p_notes), ''), p_photo_path, p_food_analysis)
  RETURNING * INTO created_listing;

  INSERT INTO public.pickup_slots (listing_id, starts_at, ends_at, capacity)
  SELECT created_listing.id, (block->>'startsAt')::timestamptz, (block->>'endsAt')::timestamptz, p_quantity
  FROM jsonb_array_elements(p_pickup_blocks) AS block;

  RETURN created_listing;
END;
$$;

CREATE FUNCTION public.update_food_listing_details(
  p_listing_id uuid,
  p_food_name text,
  p_total_quantity integer,
  p_location text,
  p_expiry_time timestamptz,
  p_notes text
)
RETURNS public.food_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  selected_listing public.food_listings%ROWTYPE;
  allocated_quantity integer;
  latest_pickup timestamptz;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_total_quantity IS NULL OR p_total_quantity <= 0 THEN RAISE EXCEPTION 'Total quantity must be a positive whole number'; END IF;
  IF NULLIF(btrim(p_food_name), '') IS NULL THEN RAISE EXCEPTION 'Food name is required'; END IF;
  IF NULLIF(btrim(p_location), '') IS NULL THEN RAISE EXCEPTION 'Pickup location is required'; END IF;
  IF p_expiry_time IS NULL OR p_expiry_time <= now() THEN RAISE EXCEPTION 'Expiration must be in the future'; END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > 1000 THEN RAISE EXCEPTION 'Notes must be 1000 characters or fewer'; END IF;

  SELECT * INTO selected_listing FROM public.food_listings
  WHERE id = p_listing_id AND donor_id = current_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the listing donor can edit this listing'; END IF;

  SELECT max(ends_at) INTO latest_pickup FROM public.pickup_slots WHERE listing_id = p_listing_id;
  IF latest_pickup > p_expiry_time THEN RAISE EXCEPTION 'Expiration must be after every pickup time'; END IF;

  SELECT COALESCE(sum(quantity), 0)::integer INTO allocated_quantity
  FROM public.food_requests
  WHERE listing_id = p_listing_id AND status IN ('pending', 'pending_pickup', 'completed');
  IF p_total_quantity < allocated_quantity THEN RAISE EXCEPTION 'Total quantity cannot be less than the quantity already allocated'; END IF;

  UPDATE public.food_listings
  SET food_name = btrim(p_food_name), quantity = p_total_quantity - allocated_quantity,
      location = btrim(p_location), expiry_time = p_expiry_time,
      notes = NULLIF(btrim(p_notes), ''),
      status = CASE WHEN p_total_quantity - allocated_quantity > 0 THEN 'available'
        WHEN EXISTS (SELECT 1 FROM public.food_requests WHERE listing_id = p_listing_id AND status IN ('pending', 'pending_pickup')) THEN 'requested'
        ELSE 'completed' END
  WHERE id = p_listing_id RETURNING * INTO selected_listing;

  UPDATE public.pickup_slots SET capacity = p_total_quantity WHERE listing_id = p_listing_id;
  RETURN selected_listing;
END;
$$;

REVOKE ALL ON FUNCTION public.create_food_listing_with_slots(text, integer, text, timestamptz, text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_food_listing_with_slots(text, integer, text, timestamptz, text, text, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_food_listing_with_slots(text, integer, text, timestamptz, text, text, jsonb, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.update_food_listing_details(uuid, text, integer, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_food_listing_details(uuid, text, integer, text, timestamptz, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_food_listing_details(uuid, text, integer, text, timestamptz, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.reserve_food(
  p_listing_id uuid,
  p_quantity integer,
  p_allocations jsonb,
  p_notes text DEFAULT NULL
)
RETURNS public.food_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  selected_listing public.food_listings%ROWTYPE;
  selected_slot public.pickup_slots%ROWTYPE;
  existing_request public.food_requests%ROWTYPE;
  created_request public.food_requests%ROWTYPE;
  normalized_notes text := NULLIF(btrim(p_notes), '');
  requested_slot_id uuid;
  allocated_quantity integer;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Requested quantity must be a positive whole number'; END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > 1000 THEN RAISE EXCEPTION 'Notes must be 1000 characters or fewer'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = current_user_id AND role = 'receiver') THEN RAISE EXCEPTION 'Only recipients can request food'; END IF;
  IF jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) <> 1 THEN RAISE EXCEPTION 'Select exactly one 15-minute pickup slot'; END IF;
  IF (p_allocations->0->>'quantity')::integer <> p_quantity THEN RAISE EXCEPTION 'Pickup allocation must equal the requested quantity'; END IF;

  requested_slot_id := (p_allocations->0->>'slotId')::uuid;

  SELECT * INTO selected_listing
  FROM public.food_listings
  WHERE id = p_listing_id AND expiry_time > now()
  FOR UPDATE;
  IF NOT FOUND OR selected_listing.quantity < p_quantity THEN RAISE EXCEPTION 'The requested quantity is no longer available'; END IF;

  SELECT * INTO selected_slot
  FROM public.pickup_slots
  WHERE id = requested_slot_id AND listing_id = p_listing_id AND starts_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select an available future pickup slot'; END IF;

  SELECT COALESCE(sum(allocation.quantity), 0)::integer INTO allocated_quantity
  FROM public.request_pickup_allocations AS allocation
  JOIN public.food_requests AS request ON request.id = allocation.request_id
  WHERE allocation.pickup_slot_id = requested_slot_id
    AND allocation.active
    AND request.status IN ('pending', 'pending_pickup', 'completed');
  IF allocated_quantity + p_quantity > selected_slot.capacity THEN RAISE EXCEPTION 'That pickup slot does not have enough remaining capacity'; END IF;

  SELECT * INTO existing_request
  FROM public.food_requests
  WHERE listing_id = p_listing_id AND receiver_id = current_user_id
  FOR UPDATE;
  IF FOUND AND existing_request.status NOT IN ('declined', 'cancelled') THEN RAISE EXCEPTION 'You already have an active request for this listing'; END IF;

  UPDATE public.food_listings
  SET quantity = quantity - p_quantity,
      status = CASE WHEN quantity - p_quantity = 0 THEN 'requested' ELSE 'available' END
  WHERE id = p_listing_id
  RETURNING * INTO selected_listing;

  IF existing_request.id IS NOT NULL THEN
    DELETE FROM public.request_pickup_allocations WHERE request_id = existing_request.id;
    UPDATE public.food_requests
    SET quantity = p_quantity, notes = normalized_notes, status = 'pending',
        pickup_confirmed_at = NULL, status_note = NULL, status_note_author = NULL, created_at = now()
    WHERE id = existing_request.id RETURNING * INTO created_request;
  ELSE
    INSERT INTO public.food_requests (listing_id, receiver_id, quantity, notes)
    VALUES (p_listing_id, current_user_id, p_quantity, normalized_notes)
    RETURNING * INTO created_request;
  END IF;

  INSERT INTO public.request_pickup_allocations (request_id, pickup_slot_id, quantity, active)
  VALUES (created_request.id, requested_slot_id, p_quantity, true);
  RETURN created_request;
END;
$$;


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


CREATE OR REPLACE FUNCTION public.advance_food_request(
  p_request_id uuid,
  p_direction text,
  p_note text DEFAULT NULL
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
  normalized_note text := NULLIF(btrim(p_note), '');
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 1000 THEN RAISE EXCEPTION 'Reason must be 1000 characters or fewer'; END IF;
  IF p_direction NOT IN ('forward', 'back') THEN RAISE EXCEPTION 'Direction must be forward or back'; END IF;

  SELECT * INTO selected_request FROM public.food_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  SELECT * INTO selected_listing FROM public.food_listings
  WHERE id = selected_request.listing_id AND donor_id = current_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the listing donor can update this request'; END IF;

  IF p_direction = 'forward' THEN
    IF selected_request.status = 'pending' THEN next_status := 'pending_pickup';
    ELSIF selected_request.status = 'pending_pickup' THEN next_status := 'completed';
    ELSE RAISE EXCEPTION 'This request cannot move forward';
    END IF;
  ELSE
    IF selected_request.status = 'completed' THEN next_status := 'pending_pickup';
    ELSIF selected_request.status = 'pending_pickup' THEN next_status := 'pending';
    ELSE RAISE EXCEPTION 'This request cannot move back';
    END IF;
  END IF;

  UPDATE public.food_requests
  SET status = next_status,
      pickup_confirmed_at = CASE
        WHEN p_direction = 'forward' AND next_status = 'completed' THEN COALESCE(pickup_confirmed_at, now())
        WHEN p_direction = 'back' THEN NULL
        ELSE pickup_confirmed_at
      END,
      status_note = CASE WHEN p_direction = 'forward' AND next_status = 'completed' THEN normalized_note ELSE NULL END,
      status_note_author = CASE WHEN p_direction = 'forward' AND next_status = 'completed' AND normalized_note IS NOT NULL THEN current_user_id ELSE NULL END
  WHERE id = p_request_id RETURNING * INTO selected_request;

  UPDATE public.food_listings
  SET status = CASE
    WHEN quantity > 0 THEN 'available'
    WHEN EXISTS (
      SELECT 1 FROM public.food_requests
      WHERE listing_id = selected_listing.id AND status IN ('pending', 'pending_pickup')
    ) THEN 'requested'
    ELSE 'completed'
  END
  WHERE id = selected_listing.id;

  RETURN selected_request;
END;
$$;


ALTER TABLE public.food_listings ADD COLUMN original_quantity integer;

UPDATE public.food_listings AS listing
SET original_quantity = listing.quantity + COALESCE((
  SELECT sum(request.quantity)
  FROM public.food_requests AS request
  WHERE request.listing_id = listing.id
    AND request.status IN ('pending', 'pending_pickup', 'completed')
), 0);

ALTER TABLE public.food_listings
  ALTER COLUMN original_quantity SET NOT NULL,
  ADD CONSTRAINT food_listings_original_quantity_positive CHECK (original_quantity > 0),
  ADD CONSTRAINT food_listings_available_not_above_original CHECK (quantity <= original_quantity);

CREATE FUNCTION public.set_food_listing_original_quantity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.original_quantity IS NULL THEN
    NEW.original_quantity := NEW.quantity;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_food_listing_original_quantity
BEFORE INSERT ON public.food_listings
FOR EACH ROW EXECUTE FUNCTION public.set_food_listing_original_quantity();

CREATE OR REPLACE FUNCTION public.update_food_listing_details(
  p_listing_id uuid,
  p_food_name text,
  p_total_quantity integer,
  p_location text,
  p_expiry_time timestamptz,
  p_notes text
)
RETURNS public.food_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  selected_listing public.food_listings%ROWTYPE;
  allocated_quantity integer;
  latest_pickup timestamptz;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_total_quantity IS NULL OR p_total_quantity <= 0 THEN RAISE EXCEPTION 'Total quantity must be a positive whole number'; END IF;
  IF NULLIF(btrim(p_food_name), '') IS NULL THEN RAISE EXCEPTION 'Food name is required'; END IF;
  IF NULLIF(btrim(p_location), '') IS NULL THEN RAISE EXCEPTION 'Pickup location is required'; END IF;
  IF p_expiry_time IS NULL OR p_expiry_time <= now() THEN RAISE EXCEPTION 'Expiration must be in the future'; END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > 1000 THEN RAISE EXCEPTION 'Notes must be 1000 characters or fewer'; END IF;

  SELECT * INTO selected_listing FROM public.food_listings
  WHERE id = p_listing_id AND donor_id = current_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the listing donor can edit this listing'; END IF;

  SELECT max(ends_at) INTO latest_pickup FROM public.pickup_slots WHERE listing_id = p_listing_id;
  IF latest_pickup > p_expiry_time THEN RAISE EXCEPTION 'Expiration must be after every pickup time'; END IF;

  SELECT COALESCE(sum(quantity), 0)::integer INTO allocated_quantity
  FROM public.food_requests
  WHERE listing_id = p_listing_id AND status IN ('pending', 'pending_pickup', 'completed');
  IF p_total_quantity < allocated_quantity THEN RAISE EXCEPTION 'Total quantity cannot be less than the quantity already allocated'; END IF;

  UPDATE public.food_listings
  SET food_name = btrim(p_food_name),
      original_quantity = p_total_quantity,
      quantity = p_total_quantity - allocated_quantity,
      location = btrim(p_location),
      expiry_time = p_expiry_time,
      notes = NULLIF(btrim(p_notes), ''),
      status = CASE WHEN p_total_quantity - allocated_quantity > 0 THEN 'available'
        WHEN EXISTS (SELECT 1 FROM public.food_requests WHERE listing_id = p_listing_id AND status IN ('pending', 'pending_pickup')) THEN 'requested'
        ELSE 'completed' END
  WHERE id = p_listing_id RETURNING * INTO selected_listing;

  UPDATE public.pickup_slots SET capacity = p_total_quantity WHERE listing_id = p_listing_id;
  RETURN selected_listing;
END;
$$;


CREATE OR REPLACE FUNCTION public.replace_listing_pickup_slots(
  p_listing_id uuid,
  p_remove_ids uuid[],
  p_new_slots jsonb
)
RETURNS SETOF public.pickup_slots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  selected_listing public.food_listings%ROWTYPE;
  remove_count integer := COALESCE(cardinality(p_remove_ids), 0);
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO selected_listing FROM public.food_listings
  WHERE id = p_listing_id AND donor_id = current_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the listing donor can manage pickup slots'; END IF;

  IF remove_count > 0 AND (
    SELECT count(*) FROM public.pickup_slots
    WHERE id = ANY(p_remove_ids) AND listing_id = p_listing_id
  ) <> remove_count THEN RAISE EXCEPTION 'One or more pickup slots do not belong to this listing'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.request_pickup_allocations
    WHERE pickup_slot_id = ANY(COALESCE(p_remove_ids, ARRAY[]::uuid[]))
  ) THEN RAISE EXCEPTION 'Booked pickup slots cannot be changed or deleted'; END IF;

  IF jsonb_typeof(COALESCE(p_new_slots, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Pickup slots must be an array'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_new_slots, '[]'::jsonb)) AS slot
    WHERE (slot->>'startsAt') IS NULL
      OR (slot->>'endsAt') IS NULL
      OR (slot->>'startsAt')::timestamptz <= now()
      OR (slot->>'endsAt')::timestamptz <> (slot->>'startsAt')::timestamptz + interval '15 minutes'
      OR (slot->>'endsAt')::timestamptz > selected_listing.expiry_time
  ) THEN RAISE EXCEPTION 'Pickup slots must be future 15-minute intervals before food expiration'; END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_new_slots, '[]'::jsonb)) AS candidate
    JOIN public.pickup_slots AS existing
      ON existing.listing_id = p_listing_id
     AND existing.id <> ALL(COALESCE(p_remove_ids, ARRAY[]::uuid[]))
     AND tstzrange(existing.starts_at, existing.ends_at, '[)') &&
         tstzrange((candidate->>'startsAt')::timestamptz, (candidate->>'endsAt')::timestamptz, '[)')
  ) THEN RAISE EXCEPTION 'Pickup slots cannot overlap'; END IF;

  DELETE FROM public.pickup_slots
  WHERE id = ANY(COALESCE(p_remove_ids, ARRAY[]::uuid[]));

  INSERT INTO public.pickup_slots (listing_id, starts_at, ends_at, capacity)
  SELECT p_listing_id, (slot->>'startsAt')::timestamptz,
         (slot->>'endsAt')::timestamptz, selected_listing.original_quantity
  FROM jsonb_array_elements(COALESCE(p_new_slots, '[]'::jsonb)) AS slot;

  IF NOT EXISTS (SELECT 1 FROM public.pickup_slots WHERE listing_id = p_listing_id) THEN
    RAISE EXCEPTION 'A listing must keep at least one pickup slot';
  END IF;

  RETURN QUERY
  SELECT * FROM public.pickup_slots
  WHERE listing_id = p_listing_id
  ORDER BY starts_at;
END;
$$;
