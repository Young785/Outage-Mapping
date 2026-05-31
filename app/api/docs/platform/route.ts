import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export async function GET() {
  try {
    const p = path.join(process.cwd(), "docs", "PLATFORM_DOCUMENTATION.md");
    const content = await readFile(p, "utf8");
    return NextResponse.json({ title: "Platform Documentation", content });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load docs" }, { status: 500 });
  }
}

