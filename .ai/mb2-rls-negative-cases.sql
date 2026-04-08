-- MB2.4: RLS negative verification scenarios for my-boards-management
-- Run manually in Supabase SQL editor (staging/dev DB).
-- Replace UUID placeholders before execution.

-- ============================================================
-- Case 1: rename without board.rename must fail
-- Preconditions:
-- - USER_NO_RENAME is a board member of BOARD_ID
-- - USER_NO_RENAME does NOT have board.rename on BOARD_ID
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'USER_NO_RENAME_UUID';

UPDATE public.boards
SET name = 'RLS forbidden rename check'
WHERE id = 'BOARD_ID_UUID';

ROLLBACK;

-- Expected result: ERROR
-- "board.rename permission required to update board name"
-- (or generic permission denied error from RLS)

-- ============================================================
-- Case 2: delete by non-owner and non-admin must fail
-- Preconditions:
-- - USER_NOT_OWNER is member of BOARD_ID (or at least can see it)
-- - USER_NOT_OWNER is NOT boards.owner_user_id and NOT system admin
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'USER_NOT_OWNER_UUID';

DELETE FROM public.boards
WHERE id = 'BOARD_ID_UUID';

ROLLBACK;

-- Expected result: ERROR / 0 rows affected due to RLS filter.
-- Board must remain in DB.

-- ============================================================
-- Case 3: set default_board_id to чужая доска must fail
-- Preconditions:
-- - USER_PROFILE has row in public.profiles
-- - FOREIGN_BOARD_ID exists
-- - USER_PROFILE is NOT member of FOREIGN_BOARD_ID
-- ============================================================
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'USER_PROFILE_UUID';

UPDATE public.profiles
SET default_board_id = 'FOREIGN_BOARD_ID_UUID'
WHERE user_id = 'USER_PROFILE_UUID';

ROLLBACK;

-- Expected result: ERROR (new row violates row-level security policy).
-- default_board_id must stay unchanged.
