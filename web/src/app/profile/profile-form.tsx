"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import type { UpdateProfileResult } from "./actions";

type Props = {
  initialFirstName: string;
  initialLastName: string;
  initialPosition: string;
  initialDepartment: string;
  requiresNameCompletion: boolean;
  updateProfileAction: (input: {
    firstName: string;
    lastName: string;
    position?: string | null;
    department?: string | null;
  }) => Promise<UpdateProfileResult>;
};

type FieldErrors = {
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  department: string | null;
};

function validateField(value: string, min: number, max: number, required: boolean, emptyMessage: string) {
  const trimmed = value.trim();
  if (required && !trimmed) return emptyMessage;
  if (!trimmed) return null;
  if (trimmed.length < min || trimmed.length > max) return `Поле должно быть от ${min} до ${max} символов`;
  return null;
}

export function ProfileForm({
  initialFirstName,
  initialLastName,
  initialPosition,
  initialDepartment,
  requiresNameCompletion,
  updateProfileAction
}: Props) {
  const [isPending, startTransition] = useTransition();

  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [position, setPosition] = useState(initialPosition);
  const [department, setDepartment] = useState(initialDepartment);
  const [initialSnapshot, setInitialSnapshot] = useState({
    firstName: initialFirstName,
    lastName: initialLastName,
    position: initialPosition,
    department: initialDepartment
  });
  const [message, setMessage] = useState<{ text: string; variant: "success" | "error" } | null>(null);

  const errors = useMemo<FieldErrors>(() => {
    return {
      firstName: validateField(firstName, 1, 50, true, "Заполните имя"),
      lastName: validateField(lastName, 1, 50, true, "Заполните фамилию"),
      position: validateField(position, 1, 100, false, ""),
      department: validateField(department, 1, 100, false, "")
    };
  }, [firstName, lastName, position, department]);

  const hasErrors = !!errors.firstName || !!errors.lastName || !!errors.position || !!errors.department;
  const isDirty =
    firstName.trim() !== initialSnapshot.firstName.trim() ||
    lastName.trim() !== initialSnapshot.lastName.trim() ||
    position.trim() !== initialSnapshot.position.trim() ||
    department.trim() !== initialSnapshot.department.trim();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending || hasErrors || !isDirty) return;

    setMessage(null);
    startTransition(async () => {
      const result = await updateProfileAction({
        firstName,
        lastName,
        position,
        department
      });

      if (!result.ok) {
        setMessage({ text: result.message, variant: "error" });
        return;
      }

      setInitialSnapshot({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        position: position.trim(),
        department: department.trim()
      });
      setFirstName((prev) => prev.trim());
      setLastName((prev) => prev.trim());
      setPosition((prev) => prev.trim());
      setDepartment((prev) => prev.trim());
      setMessage({ text: "Профиль сохранен", variant: "success" });
    });
  }

  return (
    <form onSubmit={onSubmit} className="surface-card space-y-4 px-4 py-5">
      {requiresNameCompletion ? (
        <p
          className="rounded-md border px-3 py-2 text-xs"
          style={{
            borderColor: "var(--warning-subtle-border)",
            backgroundColor: "var(--warning-subtle-bg)",
            color: "var(--warning-subtle-text)"
          }}
        >
          Профиль считается заполненным только после ввода имени и фамилии.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm text-app-primary">
          <span className="text-xs text-app-tertiary">Имя *</span>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            maxLength={50}
            disabled={isPending}
            className="field-base"
          />
          {errors.firstName ? <span className="text-xs text-app-validation-error">{errors.firstName}</span> : null}
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-app-primary">
          <span className="text-xs text-app-tertiary">Фамилия *</span>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            maxLength={50}
            disabled={isPending}
            className="field-base"
          />
          {errors.lastName ? <span className="text-xs text-app-validation-error">{errors.lastName}</span> : null}
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-app-primary">
          <span className="text-xs text-app-tertiary">Должность</span>
          <input
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            maxLength={100}
            disabled={isPending}
            className="field-base"
          />
          {errors.position ? <span className="text-xs text-app-validation-error">{errors.position}</span> : null}
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-app-primary">
          <span className="text-xs text-app-tertiary">Отдел</span>
          <input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            maxLength={100}
            disabled={isPending}
            className="field-base"
          />
          {errors.department ? <span className="text-xs text-app-validation-error">{errors.department}</span> : null}
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-app-tertiary">{isPending ? "Сохранение..." : " "}</span>
        <Button type="submit" size="sm" disabled={isPending || hasErrors || !isDirty}>
          Сохранить
        </Button>
      </div>

      {message ? (
        <Toast
          title={message.variant === "success" ? "Успешно" : "Ошибка"}
          message={message.text}
          variant={message.variant}
        />
      ) : null}
    </form>
  );
}

