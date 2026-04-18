import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function getSafeRedirect(raw: string | null): string {
  if (!raw) return "/dashboard";
  // Only allow relative paths that start with / and don't contain protocol-relative tricks
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("://")) {
    return raw;
  }
  return "/dashboard";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = getSafeRedirect(requestUrl.searchParams.get("next"));

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
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  // PKCE flow
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  // Token hash flow (magic link)
  if (tokenHash && (type === "email" || type === "magiclink")) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: (type as "email" | "magiclink") ?? "magiclink",
    });
    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", requestUrl.origin));
}
