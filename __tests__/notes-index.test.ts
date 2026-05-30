import { describe, it, expect } from "vitest";
import path from "node:path";
import { absFromNotePath } from "@/lib/notes-index";
import { getZoneRoot } from "@/lib/fs/storage";

// setup.ts 가 STORAGE_ROOT 를 세팅 → notesRoot = getZoneRoot("notes")
const NOTES_ROOT = getZoneRoot("notes");

describe("notes-index — absFromNotePath path traversal 봉쇄", () => {
  it("정상 노트 경로는 Notes 루트 하위 절대경로로 변환", () => {
    expect(absFromNotePath("/notes/일기/2026-05-24.md")).toBe(
      path.join(NOTES_ROOT, "일기/2026-05-24.md"),
    );
  });

  it("/notes/ 접두가 없으면 null", () => {
    expect(absFromNotePath("/foo.md")).toBeNull();
    expect(absFromNotePath("/personal/x.md")).toBeNull();
    expect(absFromNotePath("notes/x.md")).toBeNull(); // 선행 슬래시 없음
  });

  it("../ 로 zone 밖 탈출 시도는 null", () => {
    expect(absFromNotePath("/notes/../../etc/passwd")).toBeNull();
    expect(absFromNotePath("/notes/../Personal/victim.md")).toBeNull();
    expect(absFromNotePath("/notes/../../../etc/hosts")).toBeNull();
  });

  it("백슬래시를 이용한 우회도 null", () => {
    expect(absFromNotePath("/notes/..\\..\\etc\\passwd")).toBeNull();
  });

  it("루트 안에 머무는 내부 정규화(../)는 허용", () => {
    expect(absFromNotePath("/notes/sub/../a.md")).toBe(
      path.join(NOTES_ROOT, "a.md"),
    );
  });
});
