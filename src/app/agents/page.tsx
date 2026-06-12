import { redirect } from "next/navigation";

// The team strip lives in the global header now; home is the dashboard.
export default function AgentsHubRedirect() {
  redirect("/dashboard");
}
