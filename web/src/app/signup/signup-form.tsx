"use client";

import { useMemo, useState, useTransition } from "react";
import { signUpAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toast } from "@/components/ui/toast";

type FieldErrors = {
  email: string | null;
  password: string | null;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  department: string | null;
};

function validateLength(
  value: string,
  min: number,
  max: number,
  required: boolean,
  emptyMessage: string
) {
  const trimmed = value.trim();
  if (required && !trimmed) return emptyMessage;
  if (!trimmed) return null;
  if (trimmed.length < min || trimmed.length > max) {
    return `Поле должно быть от ${min} до ${max} символов`;
  }
  return null;
}

export function SignupForm() {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  const [banner, setBanner] = useState<{ variant: "success" | "error"; text: string } | null>(null);

  const errors = useMemo<FieldErrors>(() => {
    return {
      email: email.trim() ? null : "Заполните email",
      password: password.length >= 1 ? null : "Заполните пароль",
      firstName: validateLength(firstName, 1, 50, true, "Заполните имя"),
      lastName: validateLength(lastName, 1, 50, true, "Заполните фамилию"),
      position: validateLength(position, 1, 100, false, ""),
      department: validateLength(department, 1, 100, false, "")
    };
  }, [department, email, firstName, lastName, password, position]);

  const hasErrors = Object.values(errors).some(Boolean);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isPending || hasErrors) return;

    setBanner(null);
    startTransition(async () => {
      const result = await signUpAction({
        email,
        password,
        firstName,
        lastName,
        position,
        department
      });

      if (!result.ok) {
        setBanner({ variant: "error", text: result.message });
        return;
      }

      setBanner({
        variant: "success",
        text: "Проверьте почту и подтвердите email, если на проекте включено подтверждение адреса. После этого войдите через страницу «Вход»."
      });
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-app-secondary">Email</span>
          <Input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            disabled={isPending}
            onChange={(e) => setEmail(e.target.value)}
          />
          {errors.email ? (
            <span className="text-app-validation-error text-xs">{errors.email}</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-app-secondary">Пароль</span>
          <Input
            name="password"
            type="password"
            required
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            disabled={isPending}
            onChange={(e) => setPassword(e.target.value)}
          />
          {errors.password ? (
            <span className="text-app-validation-error text-xs">{errors.password}</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-app-secondary">Имя *</span>
          <Input
            name="first_name"
            required
            maxLength={50}
            value={firstName}
            disabled={isPending}
            onChange={(e) => setFirstName(e.target.value)}
          />
          {errors.firstName ? (
            <span className="text-app-validation-error text-xs">{errors.firstName}</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-app-secondary">Фамилия *</span>
          <Input
            name="last_name"
            required
            maxLength={50}
            value={lastName}
            disabled={isPending}
            onChange={(e) => setLastName(e.target.value)}
          />
          {errors.lastName ? (
            <span className="text-app-validation-error text-xs">{errors.lastName}</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-app-secondary">Должность</span>
          <Input
            name="position"
            maxLength={100}
            value={position}
            disabled={isPending}
            onChange={(e) => setPosition(e.target.value)}
          />
          {errors.position ? (
            <span className="text-app-validation-error text-xs">{errors.position}</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-app-secondary">Отдел</span>
          <Input
            name="department"
            maxLength={100}
            value={department}
            disabled={isPending}
            onChange={(e) => setDepartment(e.target.value)}
          />
          {errors.department ? (
            <span className="text-app-validation-error text-xs">{errors.department}</span>
          ) : null}
        </label>
      </div>

      <Button type="submit" className="w-full" disabled={isPending || hasErrors}>
        {isPending ? "Регистрация…" : "Зарегистрироваться"}
      </Button>

      {banner ? (
        <Toast
          title={banner.variant === "success" ? "Почти готово" : "Ошибка"}
          message={banner.text}
          variant={banner.variant}
        />
      ) : null}
    </form>
  );
}
