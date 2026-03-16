import { NextResponse } from "next/server";
import { getAnalyticsSummary } from "@/lib/db";

export async function GET() {
  try {
    const summary = getAnalyticsSummary();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[analytics] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
