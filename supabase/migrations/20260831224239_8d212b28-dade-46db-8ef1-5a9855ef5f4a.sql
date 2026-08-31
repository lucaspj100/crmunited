CREATE OR REPLACE FUNCTION public.career_badges()
RETURNS TABLE(user_id uuid, full_name text, career_role career_role, career_stars integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.career_role, COALESCE(p.career_stars, 0)
  FROM public.profiles p
$$;

REVOKE ALL ON FUNCTION public.career_badges() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.career_badges() FROM anon;
GRANT EXECUTE ON FUNCTION public.career_badges() TO authenticated;
GRANT EXECUTE ON FUNCTION public.career_badges() TO service_role;