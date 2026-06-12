import { redirect } from "next/navigation";

// Penny's office moved to the main tabs.
export default function LegacyAgentRedirect() {
  redirect("/dashboard");
}
