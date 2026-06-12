import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import OnboardingWizard from "./wizard";

export default async function OnboardingPage() {
  const user = await requireUser();
  const settings = getSettings(user.id);
  if (settings?.onboarded) redirect("/agents");
  return <OnboardingWizard chapterName={user.chapter_name} />;
}
