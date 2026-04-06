"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  deleteCardAction,
  updateCardAction,
  type CardMutationResult
} from "./actions";
import type { BoardCardListItem } from "./column-types";

const inputClass =
  "w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-600 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600";

type EditCardModalProps = {
  open: boolean;
  boardId: string;
  card: BoardCardListItem | null;
  canEditContent: boolean;
  canDelete: boolean;
  onClose: () => void;
};

export function EditCardModal({
  open,
  boardId,
  card,
  canEditContent,
  canDelete,
  onClose
}: EditCardModalProps) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  React.useEffect(() => {
    if (!open || !card) return;
    setTitle(card.title);
    setDescription(card.description);
    setError(null);
    setPending(false);
    setConfirmDelete(false);
  }, [open, card]);

  if (!card) return null;

  const handleSave = async () => {
    setError(null);
    setPending(true);
    const res: CardMutationResult = await updateCardAction(boardId, card.id, {
      title,
      description
    });
    setPending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    onClose();
    router.refresh();
  };

  const handleDelete = async () => {
    setError(null);
    setPending(true);
    const res = await deleteCardAction(boardId, card.id);
    setPending(false);
    if (!res.ok) {
      setError(res.message);
      setConfirmDelete(false);
      return;
    }
    onClose();
    router.refresh();
  };

  const readOnly = !canEditContent;

  return (
    <Modal
      open={open}
      title="Карточка"
      onClose={onClose}
      className="max-w-xl"
    >
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor={`card-title-${card.id}`} className="mb-1 block text-xs text-slate-400">
            Название
          </label>
          <input
            id={`card-title-${card.id}`}
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={readOnly || pending}
            maxLength={200}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor={`card-desc-${card.id}`} className="mb-1 block text-xs text-slate-400">
            Описание
          </label>
          <textarea
            id={`card-desc-${card.id}`}
            className={`${inputClass} min-h-[120px] resize-y`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={readOnly || pending}
            rows={5}
          />
        </div>

        {error ? (
          <p className="text-sm text-rose-400" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-4">
          {canDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              {confirmDelete ? (
                <>
                  <span className="text-xs text-amber-200/90">Удалить карточку безвозвратно?</span>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={pending}
                    onClick={handleDelete}
                  >
                    Да, удалить
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Отмена
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                  onClick={() => setConfirmDelete(true)}
                >
                  Удалить карточку
                </Button>
              )}
            </div>
          ) : (
            <span />
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={onClose}>
              Закрыть
            </Button>
            {canEditContent ?
              <Button type="button" size="sm" disabled={pending} onClick={handleSave}>
                Сохранить
              </Button>
            : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}
