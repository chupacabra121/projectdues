import { requireUser } from "@/lib/auth";
import { parseUserPreferences } from "@/lib/db";
import AppShell from "@/components/AppShell";
import SettingsForm from "./SettingsForm";

export default async function SettingsPage() {
  const user = await requireUser();
  const preferences = parseUserPreferences(user.preferences);
  return (
    <AppShell chapterName={user.chapter_name} userId={user.id}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <SettingsForm
          initial={{
            firstName: user.first_name,
            lastName: user.last_name,
            email: user.email,
            phone: user.phone,
            title: user.title,
            chapterName: user.chapter_name,
          }}
          preferences={preferences}
        />
      </div>
    </AppShell>
  );
}
