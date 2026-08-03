CREATE OR REPLACE FUNCTION public.can_view_contact_via_whatsapp_list(_contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_list_entries w
    WHERE w.prospect_contact_id = _contact_id
      AND w.owner_id = auth.uid()
  )
$$;

REVOKE ALL ON FUNCTION public.can_view_contact_via_whatsapp_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_contact_via_whatsapp_list(uuid) TO authenticated;

DROP POLICY IF EXISTS prospect_contacts_whatsapp_list_select ON public.prospect_contacts;
CREATE POLICY prospect_contacts_whatsapp_list_select
ON public.prospect_contacts
FOR SELECT
TO authenticated
USING (public.can_view_contact_via_whatsapp_list(id));