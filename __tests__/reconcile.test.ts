import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  walkZone,
  isFatalReaddirError,
  isNotesPath,
  buildLiveDirs,
  findSuspectZones,
  StorageUnreadableError,
} from "@/lib/reconcile";

// reconcile 몰살 footgun 봉쇄. 방어 층:
//  (1) walkZone: 언마운트/TCC/손상으로 readdir 가 ENOENT 이외 사유로 막히면 throw.
//  (2) findSuspectZones: throw 없이(빈 placeholder 마운트포인트 readdir 성공·[]) 한 zone 이
//      비거나 '거의 다' 사라지는 부분 붕괴를 — zone별 live/dbRefs/orphans 통계로 — 잡는다.
//  (3) buildLiveDirs: 폴더 공유(filePath=디렉터리)가 liveSet에 없어 매 apply 삭제되던 버그 차단.
describe("reconcile — 언마운트/부분붕괴/폴더공유 footgun 봉쇄", () => {
  describe("isFatalReaddirError", () => {
    it("ENOENT(부재)만 치명 아님 — 미사용 zone·삭제된 폴더는 정상적으로 고아 탐지 대상", () => {
      expect(isFatalReaddirError("ENOENT")).toBe(false);
    });

    it("ENOTDIR(zone root가 디렉터리 아님=손상)은 치명 — walk는 isDirectory 통과만 재귀하므로 root에서만 발생", () => {
      expect(isFatalReaddirError("ENOTDIR")).toBe(true);
    });

    it("접근불가·IO·언마운트(EACCES/EPERM/EIO/ENOTCONN/EBUSY)는 치명", () => {
      for (const c of ["EACCES", "EPERM", "EIO", "ENOTCONN", "EBUSY"]) {
        expect(isFatalReaddirError(c)).toBe(true);
      }
    });

    it("코드 미상(undefined)은 보수적으로 치명 처리", () => {
      expect(isFatalReaddirError(undefined)).toBe(true);
    });
  });

  describe("isNotesPath — notes zone은 reconcile 미관리 → 고아 분류 제외", () => {
    it("/notes 와 /notes/* 는 true", () => {
      expect(isNotesPath("/notes")).toBe(true);
      expect(isNotesPath("/notes/일기/2026.md")).toBe(true);
    });

    it("그 외 경로는 false (오탐 방지)", () => {
      expect(isNotesPath("/notesy/x")).toBe(false);
      expect(isNotesPath("/foo.mp4")).toBe(false);
      expect(isNotesPath("/personal/u/notes/x")).toBe(false);
      expect(isNotesPath("/library/notes.pdf")).toBe(false);
    });
  });

  describe("buildLiveDirs — 폴더 공유 보존 (filePath=디렉터리)", () => {
    it("라이브 파일의 모든 조상 디렉터리를 수집", () => {
      const dirs = buildLiveDirs(["/personal/u/a/b.mp4"]);
      expect([...dirs].sort()).toEqual([
        "/personal",
        "/personal/u",
        "/personal/u/a",
      ]);
    });

    it("rendering 루트 직속 파일은 조상 디렉터리 없음", () => {
      expect([...buildLiveDirs(["/foo.mp4"])]).toEqual([]);
    });

    it("rendering 루트 폴더 공유는 그 폴더가 라이브 디렉터리로 잡힘", () => {
      // 폴더 '/myfolder' 공유 + 그 안의 파일 → /myfolder 가 살아있는 디렉터리
      expect(buildLiveDirs(["/myfolder/clip.mp4"]).has("/myfolder")).toBe(true);
    });

    it("여러 파일이 공유하는 접두는 중복 없이 1회", () => {
      const dirs = buildLiveDirs([
        "/personal/u/a/x.mp4",
        "/personal/u/a/y.mp4",
        "/personal/u/b/z.mp4",
      ]);
      expect([...dirs].sort()).toEqual([
        "/personal",
        "/personal/u",
        "/personal/u/a",
        "/personal/u/b",
      ]);
    });
  });

  describe("findSuspectZones — 부분 붕괴 가드 (핵심)", () => {
    it("완전 붕괴: DB 참조 있고 live 0 → 의심", () => {
      expect(
        findSuspectZones({ personal: { live: 0, dbRefs: 5, orphans: 5 } }),
      ).toEqual(["personal"]);
    });

    it("부분 붕괴: stray 파일 1개 남았어도 대부분(>=90%, >=floor) 고아면 의심 — 이진 가드 우회 차단", () => {
      // rendering=STORAGE_ROOT 루트에 placeholder 1개, DB 행 5000개 전부 사라짐
      expect(
        findSuspectZones({ rendering: { live: 1, dbRefs: 5000, orphans: 5000 } }),
      ).toEqual(["rendering"]);
    });

    it("정상 churn: 일부만 고아(비율 낮음)면 의심 아님 — 정상 고아 정리 허용", () => {
      expect(
        findSuspectZones({ rendering: { live: 50, dbRefs: 100, orphans: 40 } }),
      ).toEqual([]);
    });

    it("소량 고아(floor 미만)는 부분붕괴로 보지 않음 (단, live 0이면 완전붕괴로 잡음)", () => {
      expect(
        findSuspectZones({ rendering: { live: 5, dbRefs: 3, orphans: 3 } }),
      ).toEqual([]);
      expect(
        findSuspectZones({ rendering: { live: 0, dbRefs: 3, orphans: 3 } }),
      ).toEqual(["rendering"]);
    });

    it("DB 참조 없는 zone은 의심 아님 — 정상 빈 스토리지 정리 허용", () => {
      expect(
        findSuspectZones({ rendering: { live: 0, dbRefs: 0, orphans: 0 } }),
      ).toEqual([]);
    });

    it("여러 zone 혼합 — 무너진 zone만 보고", () => {
      const suspect = findSuspectZones({
        rendering: { live: 100, dbRefs: 100, orphans: 2 }, // 정상
        personal: { live: 0, dbRefs: 30, orphans: 30 }, // 완전 붕괴
        library: { live: 1, dbRefs: 200, orphans: 195 }, // 부분 붕괴
      });
      expect(suspect.sort()).toEqual(["library", "personal"]);
    });
  });

  describe("walkZone", () => {
    const tmpDirs: string[] = [];
    afterAll(async () => {
      for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true });
    });

    async function mkTmp(): Promise<string> {
      const d = await fs.mkdtemp(path.join(os.tmpdir(), "vibox-recon-"));
      tmpDirs.push(d);
      return d;
    }

    it("중첩 파일을 urlPrefix 붙여 수집하고 .숨김은 제외", async () => {
      const root = await mkTmp();
      await fs.mkdir(path.join(root, "sub"), { recursive: true });
      await fs.writeFile(path.join(root, "a.mp4"), "x");
      await fs.writeFile(path.join(root, "sub", "b.mp4"), "x");
      await fs.mkdir(path.join(root, ".vibox"), { recursive: true });
      await fs.writeFile(path.join(root, ".vibox", "skip.jpg"), "x");

      const files = await walkZone(root, "/personal");
      expect(files.sort()).toEqual(["/personal/a.mp4", "/personal/sub/b.mp4"]);
    });

    it("루트 부재(ENOENT)는 빈 목록 — 미사용 zone·전체 언마운트 시 throw 안 함(상위 가드가 잡음)", async () => {
      const files = await walkZone(
        path.join(os.tmpdir(), "vibox-recon-does-not-exist-zzz"),
        "",
      );
      expect(files).toEqual([]);
    });

    it("zone root가 디렉터리가 아님(ENOTDIR)이면 StorageUnreadableError — 마운트 손상 차단", async () => {
      const root = await mkTmp();
      const filePath = path.join(root, "not-a-dir");
      await fs.writeFile(filePath, "x");
      await expect(walkZone(filePath, "")).rejects.toBeInstanceOf(
        StorageUnreadableError,
      );
    });

    it("읽을 수 없는 디렉터리(EACCES)는 StorageUnreadableError 로 중단", async () => {
      // root 는 권한을 무시하므로 스킵 (CI 가 root 로 돌 때)
      if (typeof process.getuid === "function" && process.getuid() === 0) return;
      const root = await mkTmp();
      await fs.chmod(root, 0o000);
      try {
        await expect(walkZone(root, "")).rejects.toBeInstanceOf(
          StorageUnreadableError,
        );
      } finally {
        await fs.chmod(root, 0o755); // afterAll rm 가능하도록 복구
      }
    });
  });
});
