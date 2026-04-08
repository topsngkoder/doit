export type BoardsPageBoardItem = {
  id: string;
  name: string;
  created_at: string;
  can_rename: boolean;
  can_delete: boolean;
};

export type BoardsPageData = {
  boards: BoardsPageBoardItem[];
  default_board_id: string | null;
};
