import { NextRequest, NextResponse } from "next/server";
import { convertToSkills, detectFormat, type ConvertibleFormat } from "@/lib/skill-converters";

export const dynamic = "force-dynamic";

// POST /api/skills/convert
// Body: { data: object | string, format?: ConvertibleFormat }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      data: unknown;
      format?: ConvertibleFormat;
    };

    if (!body.data) {
      return NextResponse.json(
        { error: "No data provided. Send JSON in the 'data' field." },
        { status: 400 }
      );
    }

    // Parse string data if needed
    let parsedData = body.data;
    if (typeof parsedData === "string") {
      try {
        parsedData = JSON.parse(parsedData);
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON string in 'data' field." },
          { status: 400 }
        );
      }
    }

    const detectedFormat = body.format || detectFormat(parsedData);
    const result = convertToSkills(parsedData, detectedFormat);

    return NextResponse.json(result);
  } catch (err) {
    console.error("Skill conversion error:", err);
    return NextResponse.json(
      { error: `Conversion failed: ${err instanceof Error ? err.message : "Unknown error"}` },
      { status: 500 }
    );
  }
}
