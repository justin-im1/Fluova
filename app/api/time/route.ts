import { okResponse } from "@/lib/api/response";

export async function POST() {
  const serverNowIso = new Date().toISOString();
  return okResponse({ server_now_iso: serverNowIso });
}
