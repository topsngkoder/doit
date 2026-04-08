-- Doit: enforce per-field permission checks for boards update

CREATE OR REPLACE FUNCTION public.boards_enforce_update_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name
     AND NOT public.has_board_permission(OLD.id, 'board.rename') THEN
    RAISE EXCEPTION 'board.rename permission required to update board name';
  END IF;

  IF (
      NEW.background_type IS DISTINCT FROM OLD.background_type
      OR NEW.background_color IS DISTINCT FROM OLD.background_color
      OR NEW.background_image_path IS DISTINCT FROM OLD.background_image_path
    )
    AND NOT public.has_board_permission(OLD.id, 'board.change_background') THEN
    RAISE EXCEPTION 'board.change_background permission required to update board background';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boards_enforce_update_permissions ON public.boards;
CREATE TRIGGER boards_enforce_update_permissions
  BEFORE UPDATE ON public.boards
  FOR EACH ROW
  EXECUTE FUNCTION public.boards_enforce_update_permissions();
