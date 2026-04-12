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
import type { CardAttachmentListItem } from "@/lib/card-attachment-ui-types";
import {
  getYandexDiskCardFieldUnavailableCopy,
  YANDEX_DISK_CARD_FIELD_EMPTY_UPLOAD_CTA,
  YANDEX_DISK_CARD_FIELD_EMPTY_VIEWER
} from "@/lib/yandex-disk/yandex-disk-card-field-empty-copy";
import {
  cardAttachmentDownloadPath,
  cardAttachmentCompleteUploadApiPath,
  cardAttachmentFailUploadApiPath,
  cardAttachmentPrepareUploadApiPath
} from "@/lib/yandex-disk/yandex-disk-board-ui-endpoints";
import {
  formatByteProgressRu,
  formatUploadSpeedRu,
  uploadYandexCardAttachmentsWithProgress,
  YANDEX_CARD_ATTACHMENT_UPLOAD_SERVER_PHASE_MESSAGE,
  type YandexCardAttachmentUploadProgress
} from "@/lib/yandex-disk/upload-yandex-card-attachments-client";
import {
  useBoardYandexDiskIntegration,
  useCanManageBoardYandexDiskIntegration
} from "./board-yandex-disk-integration-context";
import {
  deleteCardAttachmentAction,
  listReadyCardAttachmentsAction
} from "./board-yandex-disk-ui-server-contract";

const inputClass = "field-base";

function formatAttachmentBytesRu(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["Б", "КБ", "МБ", "ГБ"] as const;
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const rounded =
    i === 0 ? Math.round(v) : v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${rounded}\u00a0${units[i]}`;
}

function attachmentUploaderLabel(
  members: NewCardMemberOption[],
  uploadedByUserId: string
): string {
  const m = members.find((x) => x.userId === uploadedByUserId);
  return m?.displayName ?? "Участник";
}

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
        "flex items-center justify-center rounded-full bg-app-surface-muted font-medium text-app-primary",
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

/** YDB8.4: загрузка только внутри открытой карточки и конкретного поля `yandex_disk`. */
function YandexDiskCardFieldAttachmentsSection({
  boardId,
  cardId,
  fieldId,
  fieldName,
  reqLabel,
  attachments,
  boardMembers,
  canEditContent,
  canOfferYandexUpload,
  canDownloadThisField,
  canDeleteThisField,
  yandexUnavailableReason,
  yandexOwnerActionHint,
  formPending,
  uploadingFieldId,
  uploadProgress,
  uploadError,
  onUpload,
  yandexAttachmentDeletingId,
  setYandexAttachmentDeletingId,
  onDeleteAttachmentError,
  onAfterYandexAttachmentMutation,
  router
}: {
  boardId: string;
  cardId: string;
  fieldId: string;
  fieldName: string;
  reqLabel: string;
  attachments: CardAttachmentListItem[];
  boardMembers: NewCardMemberOption[];
  canEditContent: boolean;
  canOfferYandexUpload: boolean;
  canDownloadThisField: boolean;
  canDeleteThisField: boolean;
  yandexUnavailableReason: string | null;
  yandexOwnerActionHint: string | null;
  formPending: boolean;
  uploadingFieldId: string | null;
  uploadProgress: YandexCardAttachmentUploadProgress | null;
  uploadError: string | undefined;
  onUpload: (files: File[]) => void | Promise<void>;
  yandexAttachmentDeletingId: string | null;
  setYandexAttachmentDeletingId: React.Dispatch<React.SetStateAction<string | null>>;
  onDeleteAttachmentError: React.Dispatch<React.SetStateAction<string | null>>;
  /** После успешного удаления: подтянуть актуальный список `ready` в локальный state доски (в обход кэша RSC). */
  onAfterYandexAttachmentMutation?: () => void | Promise<void>;
  router: ReturnType<typeof useRouter>;
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);

  const isThisFieldUploading = uploadingFieldId === fieldId;
  const uploadBusyElsewhere = uploadingFieldId !== null && uploadingFieldId !== fieldId;
  const uploadInteractionsDisabled = formPending || uploadBusyElsewhere;
  const isUploading = isThisFieldUploading;

  const runFilePick = (list: FileList | File[] | null) => {
    if (!list || uploadInteractionsDisabled || isUploading) return;
    const files = Array.from(list as ArrayLike<File>);
    if (files.length === 0) return;
    void onUpload(files);
  };

  return (
    <div className="sm:grid sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-start sm:gap-3">
      <p className="pb-1 pt-2 text-xs font-medium text-app-secondary sm:pb-0">
        {fieldName}
        {reqLabel}
      </p>
      <div className="space-y-2 rounded-[var(--radius-control)] border border-app-divider bg-app-surface-muted p-3">
        {uploadError ?
          <p className="text-xs text-app-validation-error" role="alert">
            {uploadError}
          </p>
        : null}
        {yandexUnavailableReason ?
          <div className="space-y-1">
            <p className="text-xs text-app-secondary">{yandexUnavailableReason}</p>
            {yandexOwnerActionHint ?
              <p className="text-xs text-app-secondary">{yandexOwnerActionHint}</p>
            : null}
          </div>
        : null}

        {attachments.length > 0 ?
          <ul className="space-y-2">
            {attachments.map((a) => (
              <li
                key={a.id}
                className="border-b border-app-divider/70 pb-2 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-all text-sm text-app-primary">{a.original_file_name}</p>
                    <p className="mt-0.5 text-xs text-app-tertiary">
                      {formatAttachmentBytesRu(a.size_bytes)} ·{" "}
                      {attachmentUploaderLabel(boardMembers, a.uploaded_by_user_id)} ·{" "}
                      {new Date(a.uploaded_at).toLocaleString("ru-RU")}
                    </p>
                  </div>
                  {(canDownloadThisField || canDeleteThisField) ?
                    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
                      {canDownloadThisField ?
                        <a
                          href={cardAttachmentDownloadPath(boardId, cardId, a.id, fieldId)}
                          download={a.original_file_name}
                          className="text-xs font-medium text-app-accent underline-offset-2 hover:underline"
                        >
                          Скачать
                        </a>
                      : null}
                      {canDeleteThisField ?
                        <button
                          type="button"
                          disabled={
                            yandexAttachmentDeletingId !== null ||
                            formPending ||
                            uploadingFieldId !== null
                          }
                          onClick={() => {
                            onDeleteAttachmentError(null);
                            setYandexAttachmentDeletingId(a.id);
                            void (async () => {
                              const res = await deleteCardAttachmentAction(
                                boardId,
                                cardId,
                                a.id,
                                fieldId
                              );
                              setYandexAttachmentDeletingId(null);
                              if (!res.ok) {
                                onDeleteAttachmentError(res.message);
                                return;
                              }
                              await onAfterYandexAttachmentMutation?.();
                              router.refresh();
                            })();
                          }}
                          className="text-xs font-medium text-app-validation-error underline-offset-2 hover:underline disabled:opacity-50"
                        >
                          {yandexAttachmentDeletingId === a.id ? "Удаление…" : "Удалить"}
                        </button>
                      : null}
                    </div>
                  : null}
                </div>
              </li>
            ))}
          </ul>
        : null}

        {attachments.length === 0 && !canEditContent ?
          <p className="text-xs text-app-tertiary">{YANDEX_DISK_CARD_FIELD_EMPTY_VIEWER}</p>
        : attachments.length === 0 && !canOfferYandexUpload ?
          <p className="text-xs text-app-tertiary">{YANDEX_DISK_CARD_FIELD_EMPTY_VIEWER}</p>
        : canOfferYandexUpload ?
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              disabled={uploadInteractionsDisabled || isUploading}
              onChange={(e) => {
                runFilePick(e.target.files);
                e.target.value = "";
              }}
            />
            <div
              role="region"
              aria-label={`Загрузка файлов: ${fieldName}`}
              onDragEnter={(e) => {
                e.preventDefault();
                if (uploadInteractionsDisabled || isUploading) return;
                setIsDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                const rt = e.relatedTarget as Node | null;
                if (rt && e.currentTarget.contains(rt)) return;
                setIsDragOver(false);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (uploadInteractionsDisabled || isUploading) return;
                runFilePick(e.dataTransfer.files);
              }}
              className={cn(
                "rounded-[var(--radius-control)] border border-dashed border-app-accent/35 bg-app-surface px-3 py-4 text-center transition-colors",
                isDragOver && "border-app-accent bg-app-accent/[0.07]",
                (uploadInteractionsDisabled || isUploading) && "pointer-events-none opacity-60"
              )}
            >
              {isUploading ?
                <div className="space-y-2 text-left">
                  {uploadProgress ?
                    <>
                      <p className="text-xs text-app-secondary">
                        Файл {uploadProgress.fileIndex + 1} из {uploadProgress.fileCount}
                      </p>
                      <p className="break-all text-xs font-medium text-app-primary">
                        {uploadProgress.fileName}
                      </p>
                      <div
                        className="h-1.5 w-full overflow-hidden rounded-full bg-app-divider"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(uploadProgress.barPercent)}
                        aria-valuetext={
                          uploadProgress.phase === "server" ?
                            uploadProgress.serverStatusText ??
                            YANDEX_CARD_ATTACHMENT_UPLOAD_SERVER_PHASE_MESSAGE
                          : undefined
                        }
                        aria-label="Прогресс загрузки файла на сервер"
                      >
                        <div
                          className={cn(
                            "h-full rounded-full bg-app-accent transition-[width] duration-150 ease-out",
                            uploadProgress.phase === "server" && "animate-pulse",
                            uploadProgress.phase === "client" &&
                              (uploadProgress.total === null || uploadProgress.total <= 0) &&
                              "animate-pulse"
                          )}
                          style={{
                            width: `${Math.min(100, uploadProgress.barPercent)}%`
                          }}
                        />
                      </div>
                      {uploadProgress.phase === "server" ?
                        <p className="text-xs font-medium text-[color:var(--success-strong)]">
                          {uploadProgress.serverStatusText ??
                            YANDEX_CARD_ATTACHMENT_UPLOAD_SERVER_PHASE_MESSAGE}
                        </p>
                      : uploadProgress.total !== null && uploadProgress.total > 0 ?
                        <p className="text-xs text-app-tertiary">
                          {Math.min(
                            100,
                            Math.round((100 * uploadProgress.loaded) / uploadProgress.total)
                          )}
                          % ·{" "}
                          {formatByteProgressRu(uploadProgress.loaded, uploadProgress.total)}
                          {uploadProgress.smoothedSpeedBps !== null ?
                            <>
                              {" "}
                              · {formatUploadSpeedRu(uploadProgress.smoothedSpeedBps)}
                            </>
                          : null}
                        </p>
                      : <p className="text-xs text-app-tertiary">
                          Передано{" "}
                          {formatAttachmentBytesRu(uploadProgress.loaded)}
                          {uploadProgress.smoothedSpeedBps !== null ?
                            <>
                              {" "}
                              · {formatUploadSpeedRu(uploadProgress.smoothedSpeedBps)}
                            </>
                          : null}
                        </p>
                      }
                    </>
                  : <p className="text-xs font-medium text-app-secondary">Загрузка…</p>}
                </div>
              : <>
                  <p className="text-xs leading-relaxed text-app-secondary">
                    {attachments.length === 0 ?
                      YANDEX_DISK_CARD_FIELD_EMPTY_UPLOAD_CTA
                    : "Перетащите файлы сюда или нажмите кнопку ниже, чтобы добавить ещё."}
                  </p>
                  <div className="mt-3 flex justify-center">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={uploadInteractionsDisabled}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Добавить файлы
                    </Button>
                  </div>
                </>
              }
            </div>
          </>
        : null}
      </div>
    </div>
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
  /** Просмотр карточки в модалке (спец.: скачивание — только с правом просмотра; здесь — `canOpenCardModal`). */
  canDownloadAttachments: boolean;
  currentUserId: string;
  boardMembers: NewCardMemberOption[];
  fieldDefinitions: NewCardFieldDefinition[];
  onClose: () => void;
  /**
   * После загрузки/удаления вложений: синхронизировать `readyAttachmentsByFieldId` у карточки в клиентском state доски.
   * Нужен, потому что `router.refresh()` может вернуть устаревший снимок до инвалидации кэша Next.js.
   */
  onYandexFieldReadyAttachmentsSynced?: (
    cardId: string,
    fieldDefinitionId: string,
    attachments: CardAttachmentListItem[]
  ) => void;
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
  canDownloadAttachments,
  currentUserId,
  boardMembers,
  fieldDefinitions,
  onClose,
  onYandexFieldReadyAttachmentsSynced
}: EditCardModalProps) {
  const yandexDiskIntegration = useBoardYandexDiskIntegration();
  const canManageYandexDiskIntegration = useCanManageBoardYandexDiskIntegration();
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
  const [assigneeSearchQuery, setAssigneeSearchQuery] = React.useState("");
  const [openAssigneePanelUserId, setOpenAssigneePanelUserId] = React.useState<string | null>(
    null
  );
  const [selectedLabelIds, setSelectedLabelIds] = React.useState<Set<string>>(() => new Set());
  const [labelPending, setLabelPending] = React.useState(false);
  const [openLabelMenuId, setOpenLabelMenuId] = React.useState<string | "new" | null>(null);
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const titleInputRef = React.useRef<HTMLInputElement>(null);
  const [yandexAttachmentDeletingId, setYandexAttachmentDeletingId] = React.useState<string | null>(
    null
  );
  const [yandexAttachmentDeleteError, setYandexAttachmentDeleteError] = React.useState<string | null>(
    null
  );
  const [yandexAttachmentUploadingFieldId, setYandexAttachmentUploadingFieldId] = React.useState<
    string | null
  >(null);
  const [yandexAttachmentUploadProgress, setYandexAttachmentUploadProgress] =
    React.useState<YandexCardAttachmentUploadProgress | null>(null);
  const [yandexAttachmentUploadErrorByFieldId, setYandexAttachmentUploadErrorByFieldId] =
    React.useState<Record<string, string>>({});

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
    setYandexAttachmentDeletingId(null);
    setYandexAttachmentDeleteError(null);
    setYandexAttachmentUploadingFieldId(null);
    setYandexAttachmentUploadProgress(null);
    setYandexAttachmentUploadErrorByFieldId({});
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
    setAssigneeSearchQuery("");
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

  const pullYandexReadyAttachmentsForField = React.useCallback(
    async (fieldId: string) => {
      if (!card || !onYandexFieldReadyAttachmentsSynced) return;
      const listed = await listReadyCardAttachmentsAction(boardId, card.id, fieldId);
      if (listed.ok) {
        onYandexFieldReadyAttachmentsSynced(card.id, fieldId, listed.attachments);
      }
    },
    [boardId, card, onYandexFieldReadyAttachmentsSynced]
  );

  const handleYandexDiskFieldUpload = React.useCallback(
    async (fieldId: string, files: File[]) => {
      if (!card || files.length === 0) return;
      setYandexAttachmentUploadErrorByFieldId((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
      setYandexAttachmentUploadingFieldId(fieldId);
      setYandexAttachmentUploadProgress(null);
      const res = await uploadYandexCardAttachmentsWithProgress(
        {
          prepareUrl: cardAttachmentPrepareUploadApiPath(boardId, card.id),
          completeUrl: cardAttachmentCompleteUploadApiPath(boardId, card.id),
          failUrl: cardAttachmentFailUploadApiPath(boardId, card.id)
        },
        {
        fieldDefinitionId: fieldId,
        files,
        onProgress: setYandexAttachmentUploadProgress
        }
      );
      setYandexAttachmentUploadingFieldId(null);
      setYandexAttachmentUploadProgress(null);
      if (!res.ok) {
        setYandexAttachmentUploadErrorByFieldId((prev) => ({ ...prev, [fieldId]: res.message }));
        return;
      }
      const failures = res.files.filter((x): x is { ok: false; originalName: string; message: string } => !x.ok);
      if (failures.length > 0) {
        setYandexAttachmentUploadErrorByFieldId((prev) => ({
          ...prev,
          [fieldId]: failures.map((x) => `${x.originalName}: ${x.message}`).join("\n")
        }));
      }
      if (res.files.some((x) => x.ok)) {
        await pullYandexReadyAttachmentsForField(fieldId);
        router.refresh();
      }
    },
    [boardId, card, pullYandexReadyAttachmentsForField, router]
  );

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
  const assigneeSearchQueryNormalized = assigneeSearchQuery.trim().toLocaleLowerCase("ru-RU");
  const assigneeSearchSuggestions =
    !assigneeSearchQueryNormalized ? []
    : membersToAdd
        .filter((m) => {
          const haystack = `${m.displayName} ${m.email}`.toLocaleLowerCase("ru-RU");
          return haystack.includes(assigneeSearchQueryNormalized);
        })
        .slice(0, 8);

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
              "max-w-[min(100%,34rem)] truncate text-left text-base font-semibold text-app-primary",
              canEditContent && !pending && "cursor-text hover:text-app-secondary"
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
      headerClassName="border-b border-app-divider"
      verticalAlign="custom"
      overlayClassName="items-center md:items-start md:pt-[7vh] xl:pt-[11vh]"
      className="max-w-none rounded-lg"
      panelClassName="h-[90vh] w-[96vw] md:h-[82vh] md:w-[92vw] xl:h-[70vh] xl:w-[70vw]"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-y-auto px-0 pb-0 pt-0 md:overflow-hidden"
    >
      <div className="flex flex-col md:min-h-0 md:flex-1 md:flex-row md:overflow-hidden xl:min-h-[420px]">
        <div className="flex w-full shrink-0 flex-col overflow-y-visible px-5 pb-5 pt-1 md:min-h-0 md:min-w-0 md:basis-2/3 md:grow-0 md:overflow-y-auto">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-app-divider pb-2">
              <button
                type="button"
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium",
                  activeTab === "details" ?
                    "bg-app-surface-muted text-app-primary"
                  : "text-app-secondary hover:bg-app-surface-muted hover:text-app-primary"
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
                    "bg-app-surface-muted text-app-primary"
                  : "text-app-secondary hover:bg-app-surface-muted hover:text-app-primary"
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
                            "border-[color:var(--warning-subtle-border)] bg-[color:var(--warning-subtle-bg)] text-[color:var(--warning-subtle-text)]"
                          : "border-app-default bg-app-surface text-app-primary hover:border-app-strong"
                        )}
                        title={m.displayName}
                      >
                        <span className="relative flex items-center justify-center">
                          {isResponsible ?
                            <span
                              className="pointer-events-none absolute -bottom-2.5 left-1/2 -translate-x-1/2 text-[color:var(--info-strong)] drop-shadow-[0_0_4px_color-mix(in_srgb,var(--info-strong)_55%,transparent)]"
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
                                <p className="font-medium text-app-primary">{m.displayName}</p>
                                <p className="break-all text-app-secondary">{m.email}</p>
                              </div>
                            </div>
                            {showActions ?
                              <div className="flex flex-col gap-1.5 border-t border-app-divider pt-2">
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
                                  className="w-full justify-center text-[color:var(--danger-subtle-text)] hover:bg-[color:var(--danger-subtle-bg)]"
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
                  <p className="rounded-md border border-app-divider bg-app-surface-muted px-3 py-2 text-sm text-app-secondary">
                    История пока пуста.
                  </p>
                : <ul className="space-y-2">
                    {card.activityEntries.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-md border border-app-divider bg-app-surface px-3 py-2"
                      >
                        <p className="text-sm text-app-primary">
                          {entry.message || entry.activityType}
                        </p>
                        <p className="mt-1 text-xs text-app-tertiary">
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
                  className="mb-1 block pt-2 text-xs text-app-secondary sm:mb-0"
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
                <div className="space-y-4 border-t border-app-divider pt-4">
                  <p className="text-xs font-medium text-app-secondary">Поля доски</p>
                  {yandexAttachmentDeleteError ?
                    <p className="text-xs text-app-validation-error" role="alert">
                      {yandexAttachmentDeleteError}
                    </p>
                  : null}
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
                          <span className="pb-1 pt-2 text-xs text-app-secondary sm:pb-0">
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
                          <span className="pb-1 pt-2 text-xs text-app-secondary sm:pb-0">
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
                          <p className="pb-1 pt-2 text-xs font-medium text-app-secondary sm:pb-0">
                            {f.name}
                            {reqLabel}
                          </p>
                          <div className="space-y-2 rounded-[var(--radius-control)] border border-app-divider bg-app-surface-muted p-3">
                            <label className="flex flex-col gap-1">
                            <span className="text-xs text-app-tertiary">URL</span>
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
                              <span className="text-xs text-app-tertiary">Текст ссылки (необязательно)</span>
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
                          <span className="pb-1 pt-2 text-xs text-app-secondary sm:pb-0">
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

                    if (f.fieldType === "yandex_disk" && d.fieldType === "yandex_disk") {
                      const attachments: CardAttachmentListItem[] =
                        card.readyAttachmentsByFieldId[f.id] ?? [];
                      const yandexIntegrationActive = yandexDiskIntegration?.status === "active";
                      const canOfferYandexUpload = canEditContent && yandexIntegrationActive;
                      const canDownloadThisField =
                        canDownloadAttachments && yandexIntegrationActive;
                      const canDeleteThisField = canEditContent && yandexIntegrationActive;
                      const unavailableCopy = getYandexDiskCardFieldUnavailableCopy(
                        yandexDiskIntegration,
                        {
                          canManageIntegration: canManageYandexDiskIntegration
                        }
                      );
                      return (
                        <YandexDiskCardFieldAttachmentsSection
                          key={f.id}
                          boardId={boardId}
                          cardId={card.id}
                          fieldId={f.id}
                          fieldName={f.name}
                          reqLabel={reqLabel}
                          attachments={attachments}
                          boardMembers={boardMembers}
                          canEditContent={canEditContent}
                          canOfferYandexUpload={canOfferYandexUpload}
                          canDownloadThisField={canDownloadThisField}
                          canDeleteThisField={canDeleteThisField}
                          yandexUnavailableReason={unavailableCopy?.reason ?? null}
                          yandexOwnerActionHint={unavailableCopy?.ownerActionHint ?? null}
                          formPending={pending}
                          uploadingFieldId={yandexAttachmentUploadingFieldId}
                          uploadProgress={
                            yandexAttachmentUploadingFieldId === f.id ?
                              yandexAttachmentUploadProgress
                            : null
                          }
                          uploadError={yandexAttachmentUploadErrorByFieldId[f.id]}
                          onUpload={(files) => {
                            void handleYandexDiskFieldUpload(f.id, files);
                          }}
                          yandexAttachmentDeletingId={yandexAttachmentDeletingId}
                          setYandexAttachmentDeletingId={setYandexAttachmentDeletingId}
                          onDeleteAttachmentError={setYandexAttachmentDeleteError}
                          onAfterYandexAttachmentMutation={() =>
                            void pullYandexReadyAttachmentsForField(f.id)
                          }
                          router={router}
                        />
                      );
                    }

                    return null;
                  })}
                </div>
              );
            })()}

            <div>
              {canManageAssignees && membersToAdd.length > 0 ?
                <div className="mt-4 border-t border-app-divider pt-3">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-app-tertiary">Добавить участника</p>
                  <div className="relative max-w-[22rem]">
                    <input
                      type="text"
                      value={assigneeSearchQuery}
                      onChange={(e) => setAssigneeSearchQuery(e.target.value)}
                      placeholder="Поиск по имени или фамилии"
                      disabled={assigneePending || pending}
                      className={cn(inputClass, "h-8 py-1.5 text-sm")}
                      autoComplete="off"
                      aria-label="Поиск участника для добавления"
                    />
                    {assigneeSearchQuery.trim().length > 0 ?
                      <div className="popup-panel absolute left-0 right-0 top-[calc(100%+6px)] z-[70] max-h-64 overflow-auto py-1 shadow-[var(--shadow-card)]">
                        {assigneeSearchSuggestions.length === 0 ?
                          <p className="px-3 py-2 text-sm text-app-tertiary">Ничего не найдено</p>
                        : <ul>
                            {assigneeSearchSuggestions.map((m) => (
                              <li key={m.userId}>
                                <button
                                  type="button"
                                  disabled={assigneePending || pending}
                                  onClick={() => {
                                    void toggleAssignee(m.userId);
                                    setAssigneeSearchQuery("");
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-app-primary hover:bg-app-surface-muted"
                                  title={`${m.displayName} (${m.email})`}
                                >
                                  <AssigneeAvatar
                                    label={m.displayName}
                                    src={m.avatarUrl ?? null}
                                    className="h-6 w-6 shrink-0 text-[10px]"
                                  />
                                  <span className="min-w-0 truncate">{m.displayName}</span>
                                </button>
                              </li>
                            ))}
                          </ul>}
                      </div>
                    : null}
                  </div>
                </div>
              : null}
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-app-secondary">Метка</p>
              {boardLabels.length === 0 ?
                <p className="text-xs text-app-tertiary">
                  На доске пока нет меток. Владелец или администратор доски может создать их кнопкой{" "}
                  <span className="text-app-secondary">«Метки»</span> в шапке страницы доски.
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
                              "text-app-secondary hover:text-app-primary"
                            : "cursor-default text-app-tertiary"
                          )}
                          onClick={() => setOpenLabelMenuId((cur) => (cur === "new" ? null : "new"))}
                        >
                          Меток нет
                        </button>
                        {canManageLabels && openLabelMenuId === "new" ?
                          <ul className="popup-panel absolute z-[70] mt-1 max-h-48 w-[18rem] overflow-auto py-1 shadow-[var(--shadow-card)]">
                            {labelCandidates.length === 0 ?
                              <li className="px-3 py-2 text-xs text-app-tertiary">Нет доступных меток</li>
                            : labelCandidates.map((l) => (
                                <li key={l.id}>
                                  <button
                                    type="button"
                                    disabled={labelPending || pending}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-app-primary hover:bg-app-surface-muted"
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
                            className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs"
                            style={{
                              borderColor: l.color,
                              backgroundColor: `color-mix(in srgb, ${l.color} 16%, var(--bg-surface))`,
                              color: "var(--text-primary)"
                            }}
                            onClick={() =>
                              setOpenLabelMenuId((cur) => (cur === l.id ? null : l.id))
                            }
                          >
                            <span className="min-w-0 truncate">{l.name}</span>
                          </button>
                          {canManageLabels && openLabelMenuId === l.id ?
                            <ul className="popup-panel absolute z-[70] mt-1 max-h-48 w-[18rem] overflow-auto py-1 shadow-[var(--shadow-card)]">
                              {labelCandidates.length === 0 ?
                                <li className="px-3 py-2 text-xs text-app-tertiary">Нет доступных меток</li>
                              : labelCandidates.map((candidate) => (
                                  <li key={candidate.id}>
                                    <button
                                      type="button"
                                      disabled={labelPending || pending}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-app-primary hover:bg-app-surface-muted"
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
                              className="shrink-0 rounded p-0.5 text-app-secondary hover:bg-app-surface-muted hover:text-app-primary"
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
              <p className="text-app-validation-error text-sm" role="alert">
                {error}
              </p>
            : null}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-app-divider pt-4">
              {canDelete ?
                <div className="flex flex-wrap items-center gap-2">
                  {confirmDelete ?
                    <>
                      <span className="text-xs text-[color:var(--warning-subtle-text)]">Удалить карточку безвозвратно?</span>
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
                      className="h-10 w-10 rounded-md p-0 text-[color:var(--danger-strong)] hover:bg-[color:var(--danger-subtle-bg)] hover:text-[color:var(--danger-subtle-text)]"
                      disabled={pending}
                      aria-label="Удалить карточку"
                      title="Удалить карточку"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <TrashIcon className="h-7 w-7" />
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
          className="flex w-full shrink-0 flex-col overflow-visible border-t border-app-divider bg-app-surface-muted md:min-h-0 md:min-w-0 md:basis-1/3 md:grow-0 md:overflow-hidden md:border-l md:border-t-0"
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
