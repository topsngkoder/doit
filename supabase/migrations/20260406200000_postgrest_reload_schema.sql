-- Обновить кэш схемы PostgREST (иначе RPC может быть «not in schema cache» сразу после CREATE).
NOTIFY pgrst, 'reload schema';
