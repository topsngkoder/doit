-- Doit: auto-create public profile for every auth user

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger AS $$
DECLARE
  profile_email text;
  profile_display_name text;
  profile_avatar_url text;
BEGIN
  profile_email := COALESCE(NEW.email, NEW.raw_user_meta_data->>'email');

  IF profile_email IS NULL OR btrim(profile_email) = '' THEN
    RAISE EXCEPTION 'Cannot create profile without email for auth.users.id=%', NEW.id;
  END IF;

  profile_display_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'user_name'), ''),
    split_part(profile_email, '@', 1)
  );

  profile_avatar_url := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data->>'avatar_url'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'picture'), '')
  );

  INSERT INTO public.profiles (
    user_id,
    email,
    display_name,
    avatar_url
  )
  VALUES (
    NEW.id,
    profile_email,
    profile_display_name,
    profile_avatar_url
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth;

DROP TRIGGER IF EXISTS on_auth_user_created_create_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_create_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
