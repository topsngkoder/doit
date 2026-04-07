import { redirect } from "next/navigation";
import { Toast } from "@/components/ui/toast";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteAvatarAction, updateProfileAction, uploadAvatarAction } from "./actions";
import { ProfileAvatar } from "./profile-avatar";
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
  const profileNeedsNameCompletion =
    !profile?.first_name?.trim() || !profile?.last_name?.trim();

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
          {profileNeedsNameCompletion ? (
            <Toast
              title="Профиль не заполнен"
              message="Чтобы завершить настройку личного кабинета, заполните имя и фамилию и нажмите «Сохранить»."
              variant="error"
            />
          ) : null}

          <ProfileAvatar
            userId={user.id}
            initialAvatarPath={profile.avatar_url}
            firstName={profile.first_name ?? null}
            lastName={profile.last_name ?? null}
            email={user.email ?? null}
            displayName={profile.display_name}
            uploadAvatarAction={uploadAvatarAction}
            deleteAvatarAction={deleteAvatarAction}
          />

          <ProfileForm
            initialFirstName={profile.first_name ?? ""}
            initialLastName={profile.last_name ?? ""}
            initialPosition={profile.position ?? ""}
            initialDepartment={profile.department ?? ""}
            requiresNameCompletion={profileNeedsNameCompletion}
            updateProfileAction={updateProfileAction}
          />
        </>
      )}
    </main>
  );
}

