"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Popover } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  deleteCardAction,
  mutateCardAssigneeAction,
  mutateCardLabelAction,
  setCardResponsibleAction,
  updateCardBodyAndCustomFieldsAction,
  type CardMutationResult
} from "./actions";
import {
  buildFieldValuesPayload,
  isValidHttpUrl,
  snapshotsToFieldDrafts,
  validateRequiredCustomFields,
  type FieldDraft,
  type NewCardFieldDefinition
} from "./card-field-drafts";
import { CardCommentsSidebar } from "./card-comments-sidebar";
import type { NewCardMemberOption } from "./create-card-modal";
import type { BoardCardListItem, BoardLabelOption } from "./column-types";

const inputClass = "field-base";

function AutoSizeTextarea({
  value,
  className,
  disabled,
  onChange,
  id,
  rows = 1
}: {
  value: string;
  className: string;
  disabled?: boolean;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  id?: string;
  rows?: number;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 20;
    const verticalPadding = 16;
    const singleLineHeight = Math.ceil(lineHeight + verticalPadding);
    el.style.height = `${singleLineHeight}px`;
    el.style.height = `${Math.max(singleLineHeight, el.scrollHeight)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      id={id}
      className={className}
      value={value}
      onChange={onChange}
      disabled={disabled}
      rows={rows}
    />
  );
}

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function AssigneeAvatar({
  label,
  src,
  className
}: {
  label: string;
  src: string | null;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className={cn("rounded-full object-cover", className)} />
    );
  }
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-slate-700 font-medium text-slate-200",
        className
      )}
      aria-hidden
    >
      {memberInitials(label)}
    </div>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M9 3.75A1.5 1.5 0 0 0 7.5 5.25V6H4.75a.75.75 0 0 0 0 1.5h.49l.73 10.27a2.25 2.25 0 0 0 2.24 2.08h7.56a2.25 2.25 0 0 0 2.24-2.08l.73-10.27h.49a.75.75 0 0 0 0-1.5H16.5v-.75A1.5 1.5 0 0 0 15 3.75H9Zm6 2.25v-.75h-6V6h6Zm-4.25 3.5a.75.75 0 0 0-1.5 0v6a.75.75 0 0 0 1.5 0v-6Zm4 0a.75.75 0 0 0-1.5 0v6a.75.75 0 0 0 1.5 0v-6Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

type EditCardModalProps = {
  open: boolean;
  boardId: string;
  card: BoardCardListItem | null;
  boardLabels: BoardLabelOption[];
  canEditContent: boolean;
  /** Добавление/исключение участников и ответственный — только редактор карточки (не только assignee). */
  canManageAssignees: boolean;
  /** Метки на карточке — как у RLS card_labels (редактор или участник карточки). */
  canManageLabels: boolean;
  canDelete: boolean;
  canCreateComment: boolean;
  canEditOwnComment: boolean;
  canDeleteOwnComment: boolean;
  canModerate: boolean;
  currentUserId: string;
  boardMembers: NewCardMemberOption[];
  fieldDefinitions: NewCardFieldDefinition[];
  onClose: () => void;
};

export function EditCardModal({
  open,
  boardId,
  card,
  boardLabels,
  canEditContent,
  canManageAssignees,
  canManageLabels,
  canDelete,
  canCreateComment,
  canEditOwnComment,
  canDeleteOwnComment,
  canModerate,
  currentUserId,
  boardMembers,
  fieldDefinitions,
  onClose
}: EditCardModalProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<"details" | "history">("details");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = React.useState<Set<string>>(
    () => new Set()
  );
  const [assigneePending, setAssigneePending] = React.useState(false);
  const [openAssigneePanelUserId, setOpenAssigneePanelUserId] = React.useState<string | null>(
    null
  );
  const [selectedLabelIds, setSelectedLabelIds] = React.useState<Set<string>>(() => new Set());
  const [labelPending, setLabelPending] = React.useState(false);
  const [openLabelMenuId, setOpenLabelMenuId] = React.useState<string | "new" | null>(null);
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  const [fieldDrafts, setFieldDrafts] = React.useState<Record<string, FieldDraft>>({});

  const assigneeSyncKey = card ? [...card.assigneeUserIds].sort().join("\0") : "";
  const labelSyncKey = card ? [...card.labelIds].sort().join("\0") : "";
  const fieldValuesSyncKey = card ? JSON.stringify(card.fieldValues) : "";

  React.useEffect(() => {
    if (!open || !card) return;
    setActiveTab("details");
    setTitle(card.title);
    setDescription(card.description);
    setError(null);
    setPending(false);
    setConfirmDelete(false);
    setIsEditingTitle(false);
  }, [open, card?.id, card?.title, card?.description]);

  React.useEffect(() => {
    if (!isEditingTitle) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [isEditingTitle]);

  React.useEffect(() => {
    if (!open || !card) return;
    setFieldDrafts(snapshotsToFieldDrafts(fieldDefinitions, card.fieldValues));
  }, [open, card?.id, fieldValuesSyncKey, fieldDefinitions]);

  React.useEffect(() => {
    if (!open || !card) return;
    setSelectedAssigneeIds(new Set(card.assigneeUserIds));
  }, [open, card?.id, assigneeSyncKey]);

  React.useEffect(() => {
    if (!open || !card) return;
    setSelectedLabelIds(new Set(card.labelIds));
    setOpenLabelMenuId(null);
  }, [open, card?.id, labelSyncKey]);

  React.useEffect(() => {
    if (!open) setOpenLabelMenuId(null);
  }, [open]);

  React.useEffect(() => {
    if (!openLabelMenuId) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      const hit = el.closest("[data-label-menu]");
      if (hit?.getAttribute("data-label-menu") === String(openLabelMenuId)) return;
      setOpenLabelMenuId(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [openLabelMenuId]);

  React.useEffect(() => {
    if (!openAssigneePanelUserId) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      const hit = el.closest("[data-assignee-panel]");
      if (hit?.getAttribute("data-assignee-panel") === openAssigneePanelUserId) return;
      setOpenAssigneePanelUserId(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [openAssigneePanelUserId]);

  React.useEffect(() => {
    if (!open) setOpenAssigneePanelUserId(null);
  }, [open]);

  if (!card) return null;

  const handleSave = async () => {
    setError(null);
    const t = title.trim();
    if (!t || t.length > 200) {
      setError("Название: от 1 до 200 символов.");
      return;
    }
    const reqErr = validateRequiredCustomFields(fieldDefinitions, fieldDrafts);
    if (reqErr) {
      setError(reqErr);
      return;
    }
    for (const f of fieldDefinitions) {
      const d = fieldDrafts[f.id];
      if (f.fieldType === "link" && d?.fieldType === "link") {
        const u = d.url.trim();
        if (u && !isValidHttpUrl(u)) {
          setError(`Поле «${f.name}»: укажите корректную ссылку (http/https).`);
          return;
        }
      }
    }
    setPending(true);
    const res: CardMutationResult = await updateCardBodyAndCustomFieldsAction(boardId, card.id, {
      title: t,
      description,
      fieldValues: buildFieldValuesPayload(fieldDefinitions, fieldDrafts)
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

  const toggleAssignee = async (userId: string) => {
    if (!card || !canManageAssignees || assigneePending) return;
    const isMember = selectedAssigneeIds.has(userId);
    const add = !isMember;
    if (!add && selectedAssigneeIds.size <= 1) {
      setError("На карточке должен остаться хотя бы один участник.");
      return;
    }
    setError(null);
    setAssigneePending(true);
    const res = await mutateCardAssigneeAction(boardId, card.id, userId, add);
    setAssigneePending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setSelectedAssigneeIds((prev) => {
      const next = new Set(prev);
      if (add) next.add(userId);
      else next.delete(userId);
      return next;
    });
    router.refresh();
  };

  const handleSetResponsible = async (userId: string) => {
    if (!card || !canManageAssignees || assigneePending || userId === card.responsibleUserId) return;
    setError(null);
    setAssigneePending(true);
    const res = await setCardResponsibleAction(boardId, card.id, userId);
    setAssigneePending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setOpenAssigneePanelUserId(null);
    router.refresh();
  };

  const assigneesOnCard = boardMembers.filter((m) => selectedAssigneeIds.has(m.userId));
  const membersToAdd = boardMembers.filter((m) => !selectedAssigneeIds.has(m.userId));

  const labelsOnCard = boardLabels
    .filter((l) => selectedLabelIds.has(l.id))
    .sort((a, b) => a.position - b.position);
  const labelCandidates = boardLabels
    .filter((l) => !selectedLabelIds.has(l.id))
    .sort((a, b) => a.position - b.position);

  const toggleCardLabel = async (labelId: string, add: boolean) => {
    if (!card || !canManageLabels || labelPending) return;
    setError(null);
    setLabelPending(true);
    const res = await mutateCardLabelAction(boardId, card.id, labelId, add);
    setLabelPending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setSelectedLabelIds((prev) => {
      const next = new Set(prev);
      if (add) next.add(labelId);
      else next.delete(labelId);
      return next;
    });
    setOpenLabelMenuId(null);
    router.refresh();
  };

  const replaceCardLabel = async (currentLabelId: string, nextLabelId: string) => {
    if (!card || !canManageLabels || labelPending || currentLabelId === nextLabelId) return;
    setError(null);
    setLabelPending(true);
    const removeRes = await mutateCardLabelAction(boardId, card.id, currentLabelId, false);
    if (!removeRes.ok) {
      setLabelPending(false);
      setError(removeRes.message);
      return;
    }
    const addRes = await mutateCardLabelAction(boardId, card.id, nextLabelId, true);
    setLabelPending(false);
    if (!addRes.ok) {
      setError(addRes.message);
      return;
    }
    setSelectedLabelIds((prev) => {
      const next = new Set(prev);
      next.delete(currentLabelId);
      next.add(nextLabelId);
      return next;
    });
    setOpenLabelMenuId(null);
    router.refresh();
  };

  return (
    <Modal
      open={open}
      title={
        isEditingTitle && canEditContent ?
          <input
            ref={titleInputRef}
            className="field-base max-w-[min(100%,34rem)] px-2.5 py-1.5 text-base font-semibold"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setIsEditingTitle(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setIsEditingTitle(false);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setTitle(card.title);
                setIsEditingTitle(false);
              }
            }}
            maxLength={200}
            autoComplete="off"
            aria-label="Название карточки"
          />
        : <button
            type="button"
            className={cn(
              "max-w-[min(100%,34rem)] truncate text-left text-base font-semibold text-slate-50",
              canEditContent && !pending && "cursor-text hover:text-slate-200"
            )}
            onClick={() => {
              if (!canEditContent || pending) return;
              setIsEditingTitle(true);
            }}
            title={title || "Без названия"}
          >
            {title || "Без названия"}
          </button>
      }
      onClose={onClose}
      headerClassName="border-b border-slate-800"
      verticalAlign="custom"
      overlayClassName="items-center md:items-start md:pt-[7vh] xl:pt-[11vh]"
      className="max-w-none rounded-lg"
      panelClassName="h-[90vh] w-[96vw] md:h-[82vh] md:w-[92vw] xl:h-[70vh] xl:w-[70vw]"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-y-auto px-0 pb-0 pt-0 md:overflow-hidden"
    >
      <div className="flex flex-col md:min-h-0 md:flex-1 md:flex-row md:overflow-hidden xl:min-h-[420px]">
        <div className="flex w-full shrink-0 flex-col overflow-y-visible px-5 pb-5 pt-1 md:min-h-0 md:min-w-0 md:basis-2/3 md:grow-0 md:overflow-y-auto">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <button
                type="button"
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium",
                  activeTab === "details" ?
                    "bg-slate-800 text-slate-100"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                )}
                onClick={() => setActiveTab("details")}
              >
                Детали
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium",
                  activeTab === "history" ?
                    "bg-slate-800 text-slate-100"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                )}
                onClick={() => setActiveTab("history")}
              >
                История
              </button>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                {assigneesOnCard.map((m) => {
                  const isResponsible = card.responsibleUserId === m.userId;
                  const isCardCreator = card.createdByUserId === m.userId;
                  const panelOpen = openAssigneePanelUserId === m.userId;
                  const showActions = canManageAssignees;

                  return (
                    <div
                      key={m.userId}
                      className="relative"
                      data-assignee-panel={m.userId}
                    >
                      <button
                        type="button"
                        disabled={pending}
                        aria-expanded={panelOpen}
                        aria-haspopup="dialog"
                        onClick={() =>
                          setOpenAssigneePanelUserId((cur) => (cur === m.userId ? null : m.userId))
                        }
                        className={cn(
                          "flex items-center justify-center rounded-full border p-1 text-left text-sm transition-colors",
                          isCardCreator ?
                            "border-amber-400/90 bg-amber-950/20 text-amber-100"
                          : "border-slate-700 bg-slate-900/80 text-slate-100 hover:border-slate-600"
                        )}
                        title={m.displayName}
                      >
                        <span className="relative flex items-center justify-center">
                          {isResponsible ?
                            <span
                              className="pointer-events-none absolute -bottom-2.5 left-1/2 -translate-x-1/2 text-sky-200 drop-shadow-[0_0_4px_rgba(56,189,248,0.7)]"
                              aria-hidden
                            >
                              <span className="text-sm leading-none">🛠️</span>
                            </span>
                          : null}
                          <AssigneeAvatar
                            label={m.displayName}
                            src={m.avatarUrl ?? null}
                            className="h-7 w-7 shrink-0 text-xs"
                          />
                        </span>
                        <span className="sr-only">{m.displayName}</span>
                      </button>
                      {panelOpen ?
                        <div className="absolute right-0 top-[calc(100%+6px)] z-[60] w-max min-w-[240px] max-w-[min(100vw-3rem,280px)]">
                          <Popover className="space-y-3 p-3 text-xs">
                            <div className="flex gap-3">
                              <AssigneeAvatar
                                label={m.displayName}
                                src={m.avatarUrl ?? null}
                                className="h-12 w-12 shrink-0 text-sm"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-slate-100">{m.displayName}</p>
                                <p className="break-all text-slate-400">{m.email}</p>
                              </div>
                            </div>
                            {showActions ?
                              <div className="flex flex-col gap-1.5 border-t border-slate-800 pt-2">
                                {!isResponsible ?
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="w-full justify-center"
                                    disabled={assigneePending}
                                    onClick={() => void handleSetResponsible(m.userId)}
                                  >
                                    Сделать ответственным
                                  </Button>
                                : null}
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="w-full justify-center text-rose-200 hover:bg-rose-950/50"
                                  disabled={assigneePending || selectedAssigneeIds.size <= 1}
                                  onClick={() => void toggleAssignee(m.userId)}
                                >
                                  Исключить из карточки
                                </Button>
                              </div>
                            : null}
                          </Popover>
                        </div>
                      : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {activeTab === "history" ?
              <div className="space-y-2">
                {card.activityEntries.length === 0 ?
                  <p className="rounded-md border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-400">
                    История пока пуста.
                  </p>
                : <ul className="space-y-2">
                    {card.activityEntries.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-md border border-slate-800 bg-slate-900/70 px-3 py-2"
                      >
                        <p className="text-sm text-slate-100">
                          {entry.message || entry.activityType}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {entry.actorDisplayName} ·{" "}
                          {new Date(entry.createdAt).toLocaleString("ru-RU")}
                        </p>
                      </li>
                    ))}
                  </ul>}
              </div>
            : <>
            <div className="sm:grid sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-start sm:gap-3">
              <label
                htmlFor={`card-desc-${card.id}`}
                className="mb-1 block pt-2 text-xs text-slate-400 sm:mb-0"
              >
                Описание
              </label>
              <AutoSizeTextarea
                id={`card-desc-${card.id}`}
                className={`${inputClass} resize-none overflow-hidden`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={readOnly || pending}
                rows={1}
              />
            </div>

            {(() => {
              const sortedFields = [...fieldDefinitions].sort((a, b) => a.position - b.position);
              if (sortedFields.length === 0) return null;
              return (
                <div className="space-y-4 border-t border-slate-800 pt-4">
                  <p className="text-xs font-medium text-slate-400">Поля доски</p>
                  {sortedFields.map((f) => {
                    const d = fieldDrafts[f.id];
                    const reqLabel = f.isRequired ? " *" : "";
                    if (!d) return null;
                    const ro = readOnly || pending;

                    if (f.fieldType === "text" && d.fieldType === "text") {
                      return (
                        <label
                          key={f.id}
                          className="sm:grid sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-start sm:gap-3"
                        >
                          <span className="pb-1 pt-2 text-xs text-slate-400 sm:pb-0">
                            {f.name}
                            {reqLabel}
                          </span>
                          <AutoSizeTextarea
                            value={d.value}
                            onChange={(e) =>
                              setFieldDrafts((prev) => ({
                                ...prev,
                                [f.id]: { fieldType: "text", value: e.target.value }
                              }))
                            }
                            rows={1}
                            disabled={ro}
                            className={`${inputClass} resize-none overflow-hidden`}
                          />
                        </label>
                      );
                    }

                    if (f.fieldType === "date" && d.fieldType === "date") {
                      return (
                        <label
                          key={f.id}
                          className="sm:grid sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-start sm:gap-3"
                        >
                          <span className="pb-1 pt-2 text-xs text-slate-400 sm:pb-0">
                            {f.name}
                            {reqLabel}
                          </span>
                          <input
                            type="date"
                            value={d.value}
                            onChange={(e) =>
                              setFieldDrafts((prev) => ({
                                ...prev,
                                [f.id]: { fieldType: "date", value: e.target.value }
                              }))
                            }
                            disabled={ro}
                            className={cn(inputClass, "w-[12.5rem] max-w-[12.5rem] self-start")}
                          />
                        </label>
                      );
                    }

                    if (f.fieldType === "link" && d.fieldType === "link") {
                      return (
                        <div
                          key={f.id}
                          className="sm:grid sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-start sm:gap-3"
                        >
                          <p className="pb-1 pt-2 text-xs font-medium text-slate-400 sm:pb-0">
                            {f.name}
                            {reqLabel}
                          </p>
                          <div className="space-y-2 rounded-md border border-slate-800/80 p-3">
                            <label className="flex flex-col gap-1">
                            <span className="text-xs text-slate-500">URL</span>
                            <input
                              type="url"
                              value={d.url}
                              onChange={(e) =>
                                setFieldDrafts((prev) => ({
                                  ...prev,
                                  [f.id]: {
                                    fieldType: "link",
                                    url: e.target.value,
                                    text: d.text
                                  }
                                }))
                              }
                              placeholder="https://…"
                              disabled={ro}
                              className={inputClass}
                            />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-xs text-slate-500">Текст ссылки (необязательно)</span>
                              <input
                                value={d.text}
                                onChange={(e) =>
                                  setFieldDrafts((prev) => ({
                                    ...prev,
                                    [f.id]: {
                                      fieldType: "link",
                                      url: d.url,
                                      text: e.target.value
                                    }
                                  }))
                                }
                                disabled={ro}
                                className={inputClass}
                              />
                            </label>
                          </div>
                        </div>
                      );
                    }

                    if (f.fieldType === "select" && d.fieldType === "select") {
                      const opts = [...f.selectOptions].sort((a, b) => a.position - b.position);
                      return (
                        <label
                          key={f.id}
                          className="sm:grid sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-start sm:gap-3"
                        >
                          <span className="pb-1 pt-2 text-xs text-slate-400 sm:pb-0">
                            {f.name}
                            {reqLabel}
                          </span>
                          <select
                            value={d.optionId}
                            onChange={(e) =>
                              setFieldDrafts((prev) => ({
                                ...prev,
                                [f.id]: { fieldType: "select", optionId: e.target.value }
                              }))
                            }
                            disabled={ro}
                            className={cn(inputClass, "w-[18rem] max-w-[18rem] self-start")}
                          >
                            {!f.isRequired ?
                              <option value="">— не выбрано —</option>
                            : <option value="" disabled>
                                Выберите…
                              </option>}
                            {opts.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    }

                    return null;
                  })}
                </div>
              );
            })()}

            <div>
              {canManageAssignees && membersToAdd.length > 0 ?
                <div className="mt-4 border-t border-slate-800/80 pt-3">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Добавить участника с доски
                  </p>
                  <ul className="space-y-2">
                    {membersToAdd.map((m) => (
                      <li key={m.userId}>
                        <label
                          className="flex cursor-pointer items-center gap-2 text-sm"
                          title={`${m.displayName} (${m.email})`}
                        >
                          <input
                            type="checkbox"
                            className="rounded border-slate-600"
                            checked={false}
                            disabled={assigneePending || pending}
                            onChange={() => void toggleAssignee(m.userId)}
                          />
                          <AssigneeAvatar
                            label={m.displayName}
                            src={m.avatarUrl ?? null}
                            className="h-6 w-6 shrink-0 text-[10px]"
                          />
                          <span className="sr-only">{m.displayName}</span>
                          <span className="sr-only">{m.email}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              : null}
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-slate-400">Метка</p>
              {boardLabels.length === 0 ?
                <p className="text-xs text-slate-500">
                  На доске пока нет меток. Владелец или администратор доски может создать их кнопкой{" "}
                  <span className="text-slate-400">«Метки»</span> в шапке страницы доски.
                </p>
              : <>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {labelsOnCard.length === 0 ?
                      <div className="relative" data-label-menu="new">
                        <button
                          type="button"
                          disabled={!canManageLabels || labelPending || pending}
                          className={cn(
                            "text-xs",
                            canManageLabels ?
                              "text-slate-400 hover:text-slate-200"
                            : "cursor-default text-slate-500"
                          )}
                          onClick={() => setOpenLabelMenuId((cur) => (cur === "new" ? null : "new"))}
                        >
                          Меток нет
                        </button>
                        {canManageLabels && openLabelMenuId === "new" ?
                          <ul className="absolute z-[70] mt-1 max-h-48 w-[18rem] overflow-auto rounded-md border border-slate-700 bg-slate-950 py-1 shadow-lg">
                            {labelCandidates.length === 0 ?
                              <li className="px-3 py-2 text-xs text-slate-500">Нет доступных меток</li>
                            : labelCandidates.map((l) => (
                                <li key={l.id}>
                                  <button
                                    type="button"
                                    disabled={labelPending || pending}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800"
                                    onClick={() => void toggleCardLabel(l.id, true)}
                                  >
                                    <span
                                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                                      style={{ backgroundColor: l.color }}
                                      aria-hidden
                                    />
                                    <span className="min-w-0 truncate">{l.name}</span>
                                  </button>
                                </li>
                              ))}
                          </ul>
                        : null}
                      </div>
                    : labelsOnCard.map((l) => (
                        <div
                          key={l.id}
                          className="relative"
                          data-label-menu={l.id}
                        >
                          <button
                            type="button"
                            disabled={!canManageLabels || labelPending || pending}
                            className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-700 bg-slate-900/80 px-2 py-1 text-xs text-slate-100"
                            style={{ borderLeftWidth: 3, borderLeftColor: l.color }}
                            onClick={() =>
                              setOpenLabelMenuId((cur) => (cur === l.id ? null : l.id))
                            }
                          >
                            <span className="min-w-0 truncate">{l.name}</span>
                          </button>
                          {canManageLabels && openLabelMenuId === l.id ?
                            <ul className="absolute z-[70] mt-1 max-h-48 w-[18rem] overflow-auto rounded-md border border-slate-700 bg-slate-950 py-1 shadow-lg">
                              {labelCandidates.length === 0 ?
                                <li className="px-3 py-2 text-xs text-slate-500">Нет доступных меток</li>
                              : labelCandidates.map((candidate) => (
                                  <li key={candidate.id}>
                                    <button
                                      type="button"
                                      disabled={labelPending || pending}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800"
                                      onClick={() => void replaceCardLabel(l.id, candidate.id)}
                                    >
                                      <span
                                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                                        style={{ backgroundColor: candidate.color }}
                                        aria-hidden
                                      />
                                      <span className="min-w-0 truncate">{candidate.name}</span>
                                    </button>
                                  </li>
                                ))}
                            </ul>
                          : null}
                          {canManageLabels ?
                            <button
                              type="button"
                              disabled={labelPending || pending}
                              className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                              aria-label={`Снять метку ${l.name}`}
                              onClick={() => void toggleCardLabel(l.id, false)}
                            >
                              ×
                            </button>
                          : null}
                        </div>
                      ))}
                  </div>
                </>
              }
            </div>

            {error ?
              <p className="text-sm text-rose-400" role="alert">
                {error}
              </p>
            : null}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-4">
              {canDelete ?
                <div className="flex flex-wrap items-center gap-2">
                  {confirmDelete ?
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
                  : <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-10 w-10 rounded-md p-0 text-rose-500 hover:bg-rose-950/20 hover:text-rose-400"
                      disabled={pending}
                      aria-label="Удалить карточку"
                      title="Удалить карточку"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <TrashIcon className="h-7 w-7 text-white" />
                    </Button>}
                </div>
              : <span />}

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={onClose}
                >
                  Закрыть
                </Button>
                {canEditContent ?
                  <Button type="button" size="sm" disabled={pending} onClick={handleSave}>
                    Сохранить
                  </Button>
                : null}
              </div>
            </div>
            </>}
          </div>
        </div>

        <aside
          className="flex w-full shrink-0 flex-col overflow-visible border-t border-slate-800 md:min-h-0 md:min-w-0 md:basis-1/3 md:grow-0 md:overflow-hidden md:border-l md:border-t-0"
          aria-label="Комментарии к карточке"
        >
          <CardCommentsSidebar
            boardId={boardId}
            cardId={card.id}
            open={open}
            canCreate={canCreateComment}
            canEditOwn={canEditOwnComment}
            canDeleteOwn={canDeleteOwnComment}
            canModerate={canModerate}
            currentUserId={currentUserId}
            boardMembers={boardMembers}
            onMutation={() => router.refresh()}
          />
        </aside>
      </div>
    </Modal>
  );
}
