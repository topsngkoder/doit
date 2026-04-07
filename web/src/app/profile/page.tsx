import { redirect } from "next/navigation";
import { Toast } from "@/components/ui/toast";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateProfileAction } from "./actions";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("first_name,last_name,position,department,avatar_url,display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
          Личный кабинет
        </h1>
        <p className="text-sm text-slate-400">
          Настройки профиля и аватара.
        </p>
      </header>

      {profileError ? (
        <Toast
          title="Ошибка загрузки профиля"
          message={profileError.message}
          variant="error"
        />
      ) : !profile ? (
        <Toast
          title="Профиль не найден"
          message="Не удалось найти вашу строку профиля. Попробуйте выйти из аккаунта и войти снова. Если не поможет — сообщите в поддержку."
          variant="error"
        />
      ) : (
        <>
          <section className="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-5 text-sm text-slate-200">
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <div className="text-xs text-slate-400">Email</div>
                <div className="text-slate-100">{user.email ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Отображаемое имя</div>
                <div className="text-slate-100">{profile.display_name?.trim() || "—"}</div>
              </div>
            </div>
          </section>

          <ProfileForm
            initialFirstName={profile.first_name ?? ""}
            initialLastName={profile.last_name ?? ""}
            initialPosition={profile.position ?? ""}
            initialDepartment={profile.department ?? ""}
            updateProfileAction={updateProfileAction}
          />
        </>
      )}
    </main>
  );
}

