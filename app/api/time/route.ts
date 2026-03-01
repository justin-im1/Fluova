import { okResponse } from "@/lib/api/response";
import { NextResponse } from "next/server";

export async function POST() {
  const serverNowIso = new Date().toISOString();
  return okResponse({ server_now_iso: serverNowIso });
}
