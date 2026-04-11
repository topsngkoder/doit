-- YDB9.1: очистка записей вложений со статусом `failed` старше заданного возраста (спец. SLA ≤24 ч).
-- Удаляются только строки БД; файлы на Яндекс.Диске при failed-upload — YDB9.2 (orphan cleanup).

CREATE INDEX IF NOT EXISTS card_attachments_failed_uploaded_at_idx
  ON public.card_attachments (uploaded_at)
  WHERE status = 'failed';

COMMENT ON INDEX public.card_attachments_failed_uploaded_at_idx IS
  'YDB9.1: ускорение выборки failed-вложений по uploaded_at для служебного DELETE.';

CREATE OR REPLACE FUNCTION public.cleanup_failed_card_attachments_older_than(
  p_min_age_hours integer DEFAULT 24
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted bigint;
BEGIN
  IF p_min_age_hours IS NULL OR p_min_age_hours < 1 OR p_min_age_hours > 8760 THEN
    RAISE EXCEPTION 'p_min_age_hours must be between 1 and 8760';
  END IF;

  WITH deleted AS (
    DELETE FROM public.card_attachments
    WHERE status = 'failed'
      AND uploaded_at < (now() - make_interval(hours => p_min_age_hours))
    RETURNING id
  )
  SELECT count(*)::bigint INTO v_deleted FROM deleted;

  RETURN COALESCE(v_deleted, 0);
END;
$$;

COMMENT ON FUNCTION public.cleanup_failed_card_attachments_older_than(integer) IS
  'YDB9.1: удалить из БД card_attachments со status = failed и uploaded_at старше p_min_age_hours (по умолчанию 24). Только service_role.';

REVOKE ALL ON FUNCTION public.cleanup_failed_card_attachments_older_than(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_failed_card_attachments_older_than(integer) TO service_role;
