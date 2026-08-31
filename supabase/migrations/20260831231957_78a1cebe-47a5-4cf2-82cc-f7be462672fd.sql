REVOKE EXECUTE ON FUNCTION public.career_descendants(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.career_structure_points_between(uuid, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.career_tree(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.career_set_leader(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.career_set_quotas(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.career_sync_quotas(uuid) FROM anon;