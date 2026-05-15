import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getServerUser() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch (e) {
            // Expected when called from a Server Component (read-only cookies).
            // Log unexpected errors to aid debugging.
            if (e instanceof Error && e.message !== "Cookies can only be modified in a Server Action or Route Handler") {
              console.warn("[auth] Unexpected cookie-set failure:", e.message);
            }
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}
