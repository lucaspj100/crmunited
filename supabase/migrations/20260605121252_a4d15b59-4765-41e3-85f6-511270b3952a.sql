
-- Promote lucas_atl@yahoo.com.br to admin
INSERT INTO public.user_roles (user_id, role)
VALUES ('a4eec2fc-9fe8-47d3-b615-879dc08dac7d', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Remove the default "vendedor" role from this admin so they are purely admin
DELETE FROM public.user_roles
WHERE user_id = 'a4eec2fc-9fe8-47d3-b615-879dc08dac7d'
  AND role = 'vendedor';
