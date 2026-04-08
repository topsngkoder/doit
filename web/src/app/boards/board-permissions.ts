import type { BoardsPageBoardItem } from "./types";

export type BoardRowForPermissions = {
  id: string;
  name: string;
  created_at: string;
  owner_user_id: string;
};

type HasBoardPermissionRpc = (args: {
  p_board_id: string;
  p_permission: string;
}) => Promise<{ data: boolean | null; error: { message: string } | null }>;

export async function buildBoardsWithPermissions(args: {
  boards: BoardRowForPermissions[] | null;
  currentUserId: string;
  isSystemAdmin: boolean;
  hasBoardPermissionRpc: HasBoardPermissionRpc;
}): Promise<BoardsPageBoardItem[] | null> {
  const { boards, currentUserId, isSystemAdmin, hasBoardPermissionRpc } = args;

  if (!boards) {
    return null;
  }

  return Promise.all(
    boards.map(async (board) => {
      const { data: canRenameByPolicy, error: canRenameError } = await hasBoardPermissionRpc({
        p_board_id: board.id,
        p_permission: "board.rename"
      });

      return {
        id: board.id,
        name: board.name,
        created_at: board.created_at,
        can_rename: !canRenameError && !!canRenameByPolicy,
        can_delete: isSystemAdmin || board.owner_user_id === currentUserId
      };
    })
  );
}
