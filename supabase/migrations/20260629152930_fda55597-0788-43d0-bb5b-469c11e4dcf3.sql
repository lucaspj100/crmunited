CREATE TABLE public.seller_daily_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_calls_goal integer NOT NULL DEFAULT 100 CHECK (daily_calls_goal > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_daily_goals TO authenticated;
GRANT ALL ON public.seller_daily_goals TO service_role;

ALTER TABLE public.seller_daily_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own daily goal"
  ON public.seller_daily_goals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_seller_daily_goals_updated_at
  BEFORE UPDATE ON public.seller_daily_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();