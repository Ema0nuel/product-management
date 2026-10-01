import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

// The root path is the sign-in sheet. A live session bounces to the
// ledger dashboard so a signed-in employee never sees the form twice.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return <LoginForm />;
}