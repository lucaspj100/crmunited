ALTER TABLE public.public_seller_links DROP CONSTRAINT IF EXISTS public_seller_links_slug_format;
ALTER TABLE public.public_seller_links ADD CONSTRAINT public_seller_links_slug_format CHECK (public_slug ~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$');
UPDATE public.public_seller_links
SET public_slug = regexp_replace(public_slug, '^.*-', ''), updated_at = now()
WHERE public_slug LIKE 'https---%';