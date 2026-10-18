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
    (SELECT COALESCE(sum(quantity), 0)::bigint FROM public.food_requests WHERE status = 'accepted') AS total_meals_saved;
$$;

REVOKE ALL ON FUNCTION public.get_public_impact_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_impact_metrics() TO anon, authenticated;
