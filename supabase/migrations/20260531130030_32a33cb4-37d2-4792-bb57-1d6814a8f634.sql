ALTER TABLE public.profiles ALTER COLUMN aura_balance SET DEFAULT 10;
UPDATE public.profiles SET aura_balance = 10 WHERE aura_balance > 10;