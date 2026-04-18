import { getServerUser } from "@/lib/auth/getServerUser";
import { redirect } from "next/navigation";
import Nav from "@/components/Nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getServerUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-bg">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8">{children}</main>
    </div>
  );
}
