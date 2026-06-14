import { redirect } from "next/navigation";

export default function DuesCollectionRedirect() {
  redirect("/agents/dues-collection/email");
}
