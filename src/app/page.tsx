import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const settings = getSettings(user.id);
  redirect(settings?.onboarded ? "/agents" : "/onboarding");
}
