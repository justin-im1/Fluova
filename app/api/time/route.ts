import { getServerUser } from "@/lib/auth/getServerUser";
import { okResponse, errorResponse } from "@/lib/api/response";

export async function POST() {
  const user = await getServerUser();
  if (!user) {
    return errorResponse("unauthorized", "Not authenticated", 401);
  }
  const serverNowIso = new Date().toISOString();
  return okResponse({ server_now_iso: serverNowIso });
}
