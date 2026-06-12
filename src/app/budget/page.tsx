import { redirect } from "next/navigation";

// Legacy route — the app is organized around agents now.
export default function LegacyRedirect() {
  redirect("/agents/budgeting/budget");
}
