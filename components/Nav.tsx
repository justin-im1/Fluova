"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function Nav() {
  const router = useRouter();
  const pathname = usePathname();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="border-b border-edge/60 bg-surface/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-8">
        <Link
          href="/dashboard"
          className="text-[15px] font-semibold tracking-tight text-fg"
        >
          Fluova
        </Link>
        <div className="flex items-center gap-0.5">
          <NavLink href="/dashboard" active={pathname === "/dashboard"}>
            Dashboard
          </NavLink>
          <NavLink href="/session/new" active={pathname === "/session/new"}>
            New session
          </NavLink>
          <button
            onClick={handleSignOut}
            className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted/40 transition-colors duration-150 hover:text-muted"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
        active
          ? "text-fg"
          : "text-muted/60 hover:text-muted"
      }`}
    >
      {children}
    </Link>
  );
}
