-- Doit: add profiles.default_board_id with FK to boards

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS default_board_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_default_board_id_fkey'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_default_board_id_fkey
    FOREIGN KEY (default_board_id)
    REFERENCES public.boards(id)
    ON DELETE SET NULL;
  END IF;
END
$$;
