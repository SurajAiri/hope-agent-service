import { redirect } from "next/navigation";

export default function RootPage() {
  // The dashboard layout handles auth — redirect to dashboard which will
  // redirect to /login if no token is found.
  redirect("/dashboard");
}
