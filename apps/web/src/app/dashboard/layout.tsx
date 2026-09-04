import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionOrNull } from "@themcpdirectory/auth";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const session = await getSessionOrNull(await headers());
  if (!session) {
    redirect("/sign-in");
  }

  return <>{children}</>;
}
