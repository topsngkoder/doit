-- PC1.1: extend public.profiles with personal fields (nullable for existing users)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text NULL,
  ADD COLUMN IF NOT EXISTS last_name text NULL,
  ADD COLUMN IF NOT EXISTS position text NULL,
  ADD COLUMN IF NOT EXISTS department text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_first_name_length'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_first_name_length
      CHECK (first_name IS NULL OR char_length(btrim(first_name)) BETWEEN 1 AND 50);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_last_name_length'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_last_name_length
      CHECK (last_name IS NULL OR char_length(btrim(last_name)) BETWEEN 1 AND 50);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_position_length'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_position_length
      CHECK (position IS NULL OR char_length(btrim(position)) BETWEEN 1 AND 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_department_length'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_department_length
      CHECK (department IS NULL OR char_length(btrim(department)) BETWEEN 1 AND 100);
  END IF;
END
$$;

