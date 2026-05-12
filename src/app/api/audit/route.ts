import { NextRequest, NextResponse } from "next/server";
import { getAuditLogs, getAuditToolNames } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const section = url.searchParams.get("section");

    if (section === "tool_names") {
      const tools = await getAuditToolNames();
      return NextResponse.json({ tools });
    }

    const opts = {
      limit: Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50),
      offset: Math.max(0, parseInt(url.searchParams.get("offset") || "0") || 0),
      event_type: url.searchParams.get("event_type") || undefined,
      tool_name: url.searchParams.get("tool_name") || undefined,
      success: url.searchParams.get("success") === "true" ? true : url.searchParams.get("success") === "false" ? false : undefined,
      from_date: url.searchParams.get("from_date") || undefined,
      to_date: url.searchParams.get("to_date") || undefined,
      search: url.searchParams.get("search") || undefined,
    };

    const result = await getAuditLogs(opts);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[audit] Error:", err);
    return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 });
  }
}
