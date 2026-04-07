-- NT7.4: подписка клиента на новые строки internal_notifications через Supabase Realtime.
DO $pub$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'internal_notifications'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_notifications;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'realtime internal_notifications: publication skip: %', SQLERRM;
END;
$pub$;
