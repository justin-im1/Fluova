import { getServerUser } from "@/lib/auth/getServerUser";
import { redirect } from "next/navigation";
import Link from "next/link";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const user = await getServerUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Dashboard
        </h1>
        <p className="mt-1 text-zinc-500 dark:text-zinc-400">
          Start a focus session or review your history.
        </p>
      </div>

      <DashboardClient />
    </div>
  );
}
