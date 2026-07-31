import { NextResponse } from "next/server";
import { getDatabase } from "@/db/client";

export const runtime = "nodejs";

export async function GET() {
  try {
    getDatabase().$client.prepare("SELECT 1").get();
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
