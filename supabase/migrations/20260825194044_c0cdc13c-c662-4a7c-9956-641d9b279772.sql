DO $mig$
DECLARE
  d text;
  old_txt text := '''linkedins_checkout'', COALESCE(c.links, 0) + COALESCE(li.links, 0),';
  new_txt text := '''linkedins_checkout'', COALESCE(li.links, 0),';
BEGIN
  SELECT pg_get_functiondef(oid) INTO d
  FROM pg_proc
  WHERE proname = 'productivity_summary' AND pronamespace = 'public'::regnamespace;

  IF d IS NULL THEN
    RAISE EXCEPTION 'productivity_summary not found';
  END IF;

  IF position(old_txt in d) = 0 THEN
    IF position(new_txt in d) > 0 THEN
      RAISE NOTICE 'already applied';
      RETURN;
    END IF;
    RAISE EXCEPTION 'expected linkedins_checkout expression not found';
  END IF;

  EXECUTE replace(d, old_txt, new_txt);
END $mig$;