import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { searchFiles } from "@/lib/fs/storage";
import { db } from "@/lib/db/client";
import { fileUploads } from "@/lib/db/schema";

// GET /api/files/search?q=...
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const q = req.nextUrl.searchParams.get("q") ?? "";
  try {
    let results = await searchFiles(q);

    // 파트너는 본인 업로드한 파일만 표시
    if (session.role === "partner") {
      const filePaths = results.filter((e) => !e.isFolder).map((e) => e.path);
      if (filePaths.length > 0) {
        const owned = await db
          .select({ path: fileUploads.path, uploadedBy: fileUploads.uploadedBy })
          .from(fileUploads)
          .where(inArray(fileUploads.path, filePaths));
        const ownedSet = new Set(
          owned
            .filter((o) => o.uploadedBy === session.sub)
            .map((o) => o.path),
        );
        results = results.filter((e) => e.isFolder || ownedSet.has(e.path));
      } else {
        // 모두 폴더면 그대로
      }
    }

    return NextResponse.json({ query: q, results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
