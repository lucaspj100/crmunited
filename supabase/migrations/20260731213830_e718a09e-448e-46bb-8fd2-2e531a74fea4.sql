ALTER TABLE public.individual_feedbacks
  ADD COLUMN IF NOT EXISTS shared_at timestamptz,
  ADD COLUMN IF NOT EXISTS shared_by uuid,
  ADD COLUMN IF NOT EXISTS viewed_by_collaborator boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz;

CREATE OR REPLACE FUNCTION public.my_shared_feedbacks()
RETURNS TABLE(
  id uuid,
  period_start date,
  period_end date,
  period_label text,
  meeting_date date,
  final_feedback text,
  next_focus text,
  agreed_action text,
  shared_at timestamptz,
  viewed_by_collaborator boolean,
  viewed_at timestamptz,
  admin_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id, f.period_start, f.period_end, f.period_label, f.meeting_date,
         COALESCE(NULLIF(f.final_feedback, ''), f.generated_feedback) AS final_feedback,
         f.next_focus, f.agreed_action, f.shared_at, f.viewed_by_collaborator, f.viewed_at,
         COALESCE(p.full_name, p.email) AS admin_name
  FROM public.individual_feedbacks f
  LEFT JOIN public.profiles p ON p.id = COALESCE(f.shared_by, f.created_by)
  WHERE auth.uid() IS NOT NULL
    AND f.subject_user_id = auth.uid()
    AND f.shared_with_collaborator = true
  ORDER BY f.period_start DESC, f.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.my_shared_feedbacks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_shared_feedbacks() TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_feedback_viewed(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ok boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.individual_feedbacks
     SET viewed_by_collaborator = true,
         viewed_at = COALESCE(viewed_at, now())
   WHERE id = _id
     AND subject_user_id = auth.uid()
     AND shared_with_collaborator = true;
  ok := FOUND;
  RETURN ok;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_feedback_viewed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_feedback_viewed(uuid) TO authenticated;