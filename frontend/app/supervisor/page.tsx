import { redirect } from "next/navigation";

export default function SupervisorRedirect() {
  redirect("/dashboard");
}
