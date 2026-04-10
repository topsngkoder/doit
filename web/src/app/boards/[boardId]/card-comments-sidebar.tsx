"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import type { NewCardMemberOption } from "./create-card-modal";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { softDeleteCardCommentAction, updateCardCommentAction } from "./actions";

const textareaClass = "field-base";

type CardCommentRow = {
  id: string;
  body: string;
  createdAt: string;
  authorUserId: string;
  replyToCommentId: string | null;
};

function memberName(members: NewCardMemberOption[], userId: string): string {
  return members.find((m) => m.userId === userId)?.displayName ?? "Участник";
}

function formatCommentDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

function MemberAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";
  if (avatarUrl) {
    return (
      <img src={avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-app-surface-muted text-xs font-medium text-app-primary">
      {initial}
    </div>
  );
}

type CardCommentsSidebarProps = {
  boardId: string;
  cardId: string;
  open: boolean;
  canCreate: boolean;
  canEditOwn: boolean;
  canDeleteOwn: boolean;
  canModerate: boolean;
  currentUserId: string;
  boardMembers: NewCardMemberOption[];
  onMutation?: () => void;
};

export function CardCommentsSidebar({
  boardId,
  cardId,
  open,
  canCreate,
  canEditOwn,
  canDeleteOwn,
  canModerate,
  currentUserId,
  boardMembers,
  onMutation
}: CardCommentsSidebarProps) {
  const [comments, setComments] = React.useState<CardCommentRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [replyToId, setReplyToId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [editingCommentId, setEditingCommentId] = React.useState<string | null>(null);
  const [editingBody, setEditingBody] = React.useState("");
  const [mutatingCommentId, setMutatingCommentId] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const load = React.useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data, error: qErr } = await supabase
      .from("card_comments")
      .select("id, body, created_at, author_user_id, reply_to_comment_id")
      .eq("card_id", cardId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (qErr) throw qErr;
    setComments(
      (data ?? []).map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: r.created_at,
        authorUserId: r.author_user_id,
        replyToCommentId: r.reply_to_comment_id
      }))
    );
  }, [cardId]);

  React.useEffect(() => {
    if (!open || !cardId) return;
    setError(null);
    setDraft("");
    setReplyToId(null);
    setLoading(true);
    void load()
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Не удалось загрузить комментарии")
      )
      .finally(() => setLoading(false));
  }, [open, cardId, load]);

  const commentById = React.useMemo(() => new Map(comments.map((c) => [c.id, c])), [comments]);

  const handleReply = (commentId: string) => {
    setReplyToId(commentId);
    queueMicrotask(() => inputRef.current?.focus());
  };

  const canEditComment = React.useCallback(
    (comment: CardCommentRow) => canModerate || (canEditOwn && comment.authorUserId === currentUserId),
    [canModerate, canEditOwn, currentUserId]
  );

  const canDeleteComment = React.useCallback(
    (comment: CardCommentRow) => canModerate || (canDeleteOwn && comment.authorUserId === currentUserId),
    [canModerate, canDeleteOwn, currentUserId]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !canCreate) return;
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: rpcErr } = await supabase.rpc("create_card_comment", {
        p_card_id: cardId,
        p_body: text,
        p_reply_to_comment_id: replyToId
      });
      if (rpcErr) throw rpcErr;
      setDraft("");
      setReplyToId(null);
      await load();
      onMutation?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Не удалось отправить");
    } finally {
      setSubmitting(false);
    }
  };

  const replyTarget = replyToId ? commentById.get(replyToId) : undefined;

  const handleStartEdit = (comment: CardCommentRow) => {
    setEditingCommentId(comment.id);
    setEditingBody(comment.body);
    setError(null);
  };

  const handleSaveEdit = async (commentId: string) => {
    const body = editingBody.trim();
    if (!body) {
      setError("Комментарий не может быть пустым.");
      return;
    }
    setMutatingCommentId(commentId);
    setError(null);
    try {
      const res = await updateCardCommentAction(
        boardId,
        cardId,
        commentId,
        body
      );
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setEditingCommentId(null);
      setEditingBody("");
      await load();
      onMutation?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить комментарий");
    } finally {
      setMutatingCommentId(null);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!window.confirm("Удалить комментарий? Действие необратимо.")) return;
    setMutatingCommentId(commentId);
    setError(null);
    try {
      const res = await softDeleteCardCommentAction(boardId, cardId, commentId);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      if (replyToId === commentId) {
        setReplyToId(null);
      }
      if (editingCommentId === commentId) {
        setEditingCommentId(null);
        setEditingBody("");
      }
      await load();
      onMutation?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Не удалось удалить комментарий");
    } finally {
      setMutatingCommentId(null);
    }
  };

  return (
    <div className="flex min-h-[240px] flex-col overflow-visible bg-app-surface-muted md:h-full md:min-h-0 md:overflow-hidden">
      <div className="shrink-0 border-b border-app-divider px-4 py-3">
        <h3 className="text-sm font-semibold text-app-primary">Комментарии</h3>
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="shrink-0 space-y-2 border-b border-app-divider p-4"
      >
        {replyTarget ?
          <div className="flex items-start justify-between gap-2 rounded-md bg-app-surface px-2 py-1.5 text-xs text-app-secondary">
            <div className="min-w-0">
              <span className="text-app-tertiary">Ответ на комментарий </span>
              <span className="text-app-secondary">
                {memberName(boardMembers, replyTarget.authorUserId)}
              </span>
              <p className="truncate text-app-tertiary">{replyTarget.body}</p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded p-0.5 text-app-tertiary hover:text-app-secondary"
              onClick={() => setReplyToId(null)}
              aria-label="Сбросить ответ"
            >
              ✕
            </button>
          </div>
        : null}
        <textarea
          ref={inputRef}
          className={`${textareaClass} min-h-[72px] resize-none`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!canCreate || submitting}
          placeholder={canCreate ? "Новый комментарий…" : "Нет права комментировать"}
          maxLength={5000}
        />
        <Button
          type="submit"
          size="sm"
          disabled={!canCreate || submitting || draft.trim().length === 0}
        >
          Отправить
        </Button>
      </form>

      <div className="px-4 py-3 md:min-h-0 md:flex-1 md:overflow-y-auto">
        {loading ?
          <p className="text-xs text-app-tertiary">Загрузка…</p>
        : null}
        {error ?
          <p className="text-app-validation-error text-xs" role="alert">
            {error}
          </p>
        : null}
        {!loading && comments.length === 0 ?
          <p className="text-xs text-app-tertiary">Пока нет комментариев</p>
        : null}
        <ul className="flex flex-col gap-4">
          {comments.map((c) => {
            const author = memberName(boardMembers, c.authorUserId);
            const av = boardMembers.find((m) => m.userId === c.authorUserId)?.avatarUrl;
            const parent = c.replyToCommentId ? commentById.get(c.replyToCommentId) : undefined;
            const canEditThis = canEditComment(c);
            const canDeleteThis = canDeleteComment(c);
            const isEditing = editingCommentId === c.id;
            const isPendingComment = mutatingCommentId === c.id;

            return (
              <li key={c.id} className="border-b border-app-divider pb-4 last:border-0 last:pb-0">
                {parent ?
                  <div className="mb-2 rounded bg-app-surface px-2 py-1 text-xs text-app-tertiary">
                    <span>Ответ на комментарий </span>
                    <span className="text-app-secondary">
                      {memberName(boardMembers, parent.authorUserId)}
                    </span>
                    <p className="truncate text-app-tertiary">{parent.body}</p>
                  </div>
                : null}
                <div className="flex gap-2">
                  <MemberAvatar name={author} avatarUrl={av} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                      <span className="text-sm font-medium text-app-primary">{author}</span>
                      <time
                        className="text-xs text-app-tertiary"
                        dateTime={c.createdAt}
                        title={c.createdAt}
                      >
                        {formatCommentDate(c.createdAt)}
                      </time>
                    </div>
                    {isEditing ?
                      <div className="mt-2 space-y-2">
                        <textarea
                          className={`${textareaClass} min-h-[72px] resize-none`}
                          value={editingBody}
                          onChange={(e) => setEditingBody(e.target.value)}
                          maxLength={5000}
                          disabled={isPendingComment}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={isPendingComment || editingBody.trim().length === 0}
                            onClick={() => void handleSaveEdit(c.id)}
                          >
                            Сохранить
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={isPendingComment}
                            onClick={() => {
                              setEditingCommentId(null);
                              setEditingBody("");
                            }}
                          >
                            Отмена
                          </Button>
                        </div>
                      </div>
                    : <p className="mt-1 whitespace-pre-wrap break-words text-sm text-app-primary">{c.body}</p>}
                    {!isEditing ?
                      <div className="mt-2 flex items-center gap-3">
                        <button
                          type="button"
                          className="text-xs text-app-link hover:text-[color:var(--text-link-hover)]"
                          onClick={() => handleReply(c.id)}
                        >
                          Ответить
                        </button>
                        {canEditThis ?
                          <button
                            type="button"
                            className="text-xs text-app-secondary hover:text-app-primary"
                            onClick={() => handleStartEdit(c)}
                            disabled={isPendingComment}
                          >
                            Редактировать
                          </button>
                        : null}
                        {canDeleteThis ?
                          <button
                            type="button"
                            className="text-xs text-[color:var(--danger-strong)] hover:text-[color:var(--danger-subtle-text)]"
                            onClick={() => void handleDelete(c.id)}
                            disabled={isPendingComment}
                          >
                            Удалить
                          </button>
                        : null}
                      </div>
                    : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
