import type { CreateCardFieldValuePayload } from "./actions";
import type { CardFieldValueSnapshot } from "./column-types";

export type NewCardFieldDefinition = {
  id: string;
  name: string;
  fieldType: "link" | "text" | "date" | "select";
  isRequired: boolean;
  position: number;
  selectOptions: Array<{ id: string; name: string; color: string; position: number }>;
};

export type FieldDraft =
  | { fieldType: "text"; value: string }
  | { fieldType: "date"; value: string }
  | { fieldType: "link"; url: string; text: string }
  | { fieldType: "select"; optionId: string };

export function buildEmptyFieldDrafts(
  defs: NewCardFieldDefinition[]
): Record<string, FieldDraft> {
  const out: Record<string, FieldDraft> = {};
  for (const f of defs) {
    if (f.fieldType === "text") out[f.id] = { fieldType: "text", value: "" };
    else if (f.fieldType === "date") out[f.id] = { fieldType: "date", value: "" };
    else if (f.fieldType === "link") out[f.id] = { fieldType: "link", url: "", text: "" };
    else out[f.id] = { fieldType: "select", optionId: "" };
  }
  return out;
}

export function snapshotsToFieldDrafts(
  defs: NewCardFieldDefinition[],
  fieldValues: Record<string, CardFieldValueSnapshot>
): Record<string, FieldDraft> {
  const out: Record<string, FieldDraft> = {};
  for (const f of defs) {
    const s = fieldValues[f.id];
    if (f.fieldType === "text") {
      out[f.id] = { fieldType: "text", value: s?.textValue?.trim() ?? "" };
    } else if (f.fieldType === "date") {
      const d = s?.dateValue;
      out[f.id] = {
        fieldType: "date",
        value: d ? String(d).slice(0, 10) : ""
      };
    } else if (f.fieldType === "link") {
      out[f.id] = {
        fieldType: "link",
        url: s?.linkUrl?.trim() ?? "",
        text: s?.linkText?.trim() ?? ""
      };
    } else {
      out[f.id] = { fieldType: "select", optionId: s?.selectOptionId ?? "" };
    }
  }
  return out;
}

export function buildFieldValuesPayload(
  defs: NewCardFieldDefinition[],
  drafts: Record<string, FieldDraft>
): CreateCardFieldValuePayload[] {
  const fieldValues: CreateCardFieldValuePayload[] = [];
  for (const f of defs) {
    const d = drafts[f.id];
    if (!d) continue;
    if (f.fieldType === "text" && d.fieldType === "text") {
      fieldValues.push({
        field_definition_id: f.id,
        ...(d.value.trim() ? { text_value: d.value.trim() } : {})
      });
    } else if (f.fieldType === "date" && d.fieldType === "date") {
      fieldValues.push({
        field_definition_id: f.id,
        ...(d.value.trim() ? { date_value: d.value.trim() } : {})
      });
    } else if (f.fieldType === "link" && d.fieldType === "link") {
      fieldValues.push({
        field_definition_id: f.id,
        ...(d.url.trim() ? { link_url: d.url.trim() } : {}),
        ...(d.text.trim() ? { link_text: d.text.trim() } : {})
      });
    } else if (f.fieldType === "select" && d.fieldType === "select") {
      fieldValues.push({
        field_definition_id: f.id,
        ...(d.optionId.trim() ? { select_option_id: d.optionId.trim() } : {})
      });
    }
  }
  return fieldValues;
}

export function validateRequiredCustomFields(
  defs: NewCardFieldDefinition[],
  drafts: Record<string, FieldDraft>
): string | null {
  const sorted = [...defs].sort((a, b) => a.position - b.position);
  for (const f of sorted) {
    if (!f.isRequired) continue;
    const d = drafts[f.id];
    if (!d) {
      return `Заполните обязательное поле «${f.name}».`;
    }
    if (f.fieldType === "text" && d.fieldType === "text") {
      if (!d.value.trim()) return `Заполните обязательное поле «${f.name}».`;
    } else if (f.fieldType === "date" && d.fieldType === "date") {
      if (!d.value.trim()) return `Заполните обязательное поле «${f.name}».`;
    } else if (f.fieldType === "link" && d.fieldType === "link") {
      if (!d.url.trim()) return `Укажите ссылку в поле «${f.name}».`;
    } else if (f.fieldType === "select" && d.fieldType === "select") {
      if (!d.optionId.trim()) return `Выберите значение в поле «${f.name}».`;
    }
  }
  return null;
}

export function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
