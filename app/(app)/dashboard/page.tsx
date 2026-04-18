import { Suspense } from "react";
import { getServerUser } from "@/lib/auth/getServerUser";
import { redirect } from "next/navigation";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const user = await getServerUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <Suspense
      fallback={
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <div className="h-52 animate-pulse rounded-2xl bg-surface" />
            <div className="h-56 animate-pulse rounded-2xl bg-surface" />
          </div>
          <div className="space-y-4">
            <div className="h-[72px] animate-pulse rounded-2xl bg-surface" />
            <div className="h-[72px] animate-pulse rounded-2xl bg-surface" />
            <div className="h-[72px] animate-pulse rounded-2xl bg-surface" />
            <div className="h-64 animate-pulse rounded-2xl bg-surface" />
          </div>
        </div>
      }
    >
      <DashboardClient />
    </Suspense>
  );
}
