-- PC1.2: enrich profile creation from auth.users metadata

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger AS $$
DECLARE
  profile_email text;
  profile_display_name text;
  profile_avatar_url text;
  profile_first_name text;
  profile_last_name text;
  profile_position text;
  profile_department text;
BEGIN
  profile_email := COALESCE(NEW.email, NEW.raw_user_meta_data->>'email');

  IF profile_email IS NULL OR btrim(profile_email) = '' THEN
    RAISE EXCEPTION 'Cannot create profile without email for auth.users.id=%', NEW.id;
  END IF;

  profile_first_name := NULLIF(btrim(NEW.raw_user_meta_data->>'first_name'), '');
  profile_last_name := NULLIF(btrim(NEW.raw_user_meta_data->>'last_name'), '');
  profile_position := NULLIF(btrim(NEW.raw_user_meta_data->>'position'), '');
  profile_department := NULLIF(btrim(NEW.raw_user_meta_data->>'department'), '');

  IF profile_first_name IS NOT NULL AND profile_last_name IS NOT NULL THEN
    profile_display_name := btrim(profile_first_name || ' ' || profile_last_name);
  ELSE
    profile_display_name := COALESCE(
      NULLIF(btrim(NEW.raw_user_meta_data->>'display_name'), ''),
      NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(btrim(NEW.raw_user_meta_data->>'name'), ''),
      NULLIF(btrim(NEW.raw_user_meta_data->>'user_name'), ''),
      split_part(profile_email, '@', 1)
    );
  END IF;

  profile_avatar_url := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data->>'avatar_url'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'picture'), '')
  );

  INSERT INTO public.profiles (
    user_id,
    email,
    display_name,
    avatar_url,
    first_name,
    last_name,
    position,
    department
  )
  VALUES (
    NEW.id,
    profile_email,
    profile_display_name,
    profile_avatar_url,
    profile_first_name,
    profile_last_name,
    profile_position,
    profile_department
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    position = EXCLUDED.position,
    department = EXCLUDED.department,
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth;

