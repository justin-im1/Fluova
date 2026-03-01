import { redirect } from "next/navigation";

/**
 * Legacy callback - redirects to the route handler at /api/auth/callback
 */
export default async function CallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; next?: string; token_hash?: string; type?: string }>;
}) {
  const params = await searchParams;
  const search = new URLSearchParams();
  if (params.code) search.set("code", params.code);
  if (params.next) search.set("next", params.next);
  if (params.token_hash) search.set("token_hash", params.token_hash);
  if (params.type) search.set("type", params.type);

  redirect(`/api/auth/callback?${search.toString()}`);
}
