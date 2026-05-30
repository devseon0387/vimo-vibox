import { describe, it, expect, vi, beforeEach } from "vitest";

// canAccessFile 가 fileUploads 테이블을 조회하기 때문에 db 클라이언트를 mock 한다.
vi.mock("@/lib/db/client", () => {
  const ownerRows: { uploadedBy: string }[] = [];
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => ownerRows,
          }),
        }),
      }),
      // 테스트에서 dynamic 변경 위한 helper
      __setOwner: (sub: string | null) => {
        ownerRows.length = 0;
        if (sub) ownerRows.push({ uploadedBy: sub });
      },
    },
  };
});

import { canAccessFile } from "@/lib/auth/access";
import { db } from "@/lib/db/client";
import type { SessionPayload } from "@/lib/auth/session";

const admin: SessionPayload = { sub: "a1", username: "a", name: "a", role: "admin" };
const member: SessionPayload = { sub: "m1", username: "m", name: "m", role: "member" };
const partner: SessionPayload = { sub: "p1", username: "p", name: "p", role: "partner" };

describe("auth/access — canAccessFile zone matrix", () => {
  beforeEach(() => {
    (db as unknown as { __setOwner: (s: string | null) => void }).__setOwner(null);
  });

  it("미인증은 모든 경로 차단", async () => {
    expect(await canAccessFile(null, "/Rendering/x.mp4")).toBe(false);
    expect(await canAccessFile(null, "/library/x.mp4")).toBe(false);
  });

  it("library: 로그인만 돼 있으면 모두 읽기 허용", async () => {
    expect(await canAccessFile(admin, "/library/x.mp4")).toBe(true);
    expect(await canAccessFile(member, "/library/x.mp4")).toBe(true);
    expect(await canAccessFile(partner, "/library/x.mp4")).toBe(true);
  });

  it("personal: 본인 또는 admin 만", async () => {
    expect(await canAccessFile(admin, "/personal/m1/file.mp4")).toBe(true);
    expect(await canAccessFile(member, "/personal/m1/file.mp4")).toBe(true);
    expect(await canAccessFile(member, "/personal/m2/file.mp4")).toBe(false);
    expect(await canAccessFile(partner, "/personal/p1/file.mp4")).toBe(true);
    expect(await canAccessFile(partner, "/personal/m1/file.mp4")).toBe(false);
  });

  it("rendering: admin/member 전부, partner 는 본인 업로드만", async () => {
    const path = "/Rendering/x.mp4";
    expect(await canAccessFile(admin, path)).toBe(true);
    expect(await canAccessFile(member, path)).toBe(true);

    // partner — 업로더 row 없음 → false
    expect(await canAccessFile(partner, path)).toBe(false);

    // partner — 본인 업로드면 true
    (db as unknown as { __setOwner: (s: string | null) => void }).__setOwner("p1");
    expect(await canAccessFile(partner, path)).toBe(true);

    // partner — 타인 업로드면 false
    (db as unknown as { __setOwner: (s: string | null) => void }).__setOwner("p2");
    expect(await canAccessFile(partner, path)).toBe(false);
  });
});
