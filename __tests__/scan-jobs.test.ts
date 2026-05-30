import { describe, it, expect } from "vitest";
import {
  createScanJob,
  getScanJob,
  listRunningJobsForPath,
  publicView,
  markDone,
  markFailed,
  cancelScanJob,
  parseStageFromOutput,
  updateProgress,
} from "@/lib/scan-jobs";

describe("scan-jobs — lifecycle", () => {
  it("create → status pending → listRunningJobsForPath 반환", () => {
    const job = createScanJob("/a/b.mp4");
    expect(job.status).toBe("pending");
    expect(job.progress).toBe(0);
    expect(listRunningJobsForPath("/a/b.mp4").map((j) => j.id)).toContain(job.id);
  });

  it("markDone → status done, progress 100, finishedAt 채움", () => {
    const job = createScanJob("/a/done.mp4");
    job.status = "running";
    markDone(job, 7);
    expect(job.status).toBe("done");
    expect(job.progress).toBe(100);
    expect(job.issuesFound).toBe(7);
    expect(job.finishedAt).toBeTruthy();
  });

  it("markFailed → status failed + error 보존", () => {
    const job = createScanJob("/a/fail.mp4");
    job.status = "running";
    markFailed(job, "exit 1: ffmpeg not found");
    expect(job.status).toBe("failed");
    expect(job.error).toContain("ffmpeg not found");
    expect(job.finishedAt).toBeTruthy();
  });

  it("cancelScanJob — pending/running 만 가능, done 은 거부", () => {
    const a = createScanJob("/cancel/1.mp4");
    expect(cancelScanJob(a.id)).toBe(true);
    expect(a.status).toBe("cancelled");

    const b = createScanJob("/cancel/2.mp4");
    b.status = "running";
    markDone(b, 0);
    expect(cancelScanJob(b.id)).toBe(false);
  });

  it("cancelled 후 markDone 호출은 no-op (취소 상태 보존)", () => {
    const job = createScanJob("/race.mp4");
    job.status = "running";
    cancelScanJob(job.id);
    markDone(job, 5);
    expect(job.status).toBe("cancelled");
  });

  it("listRunningJobsForPath — done/failed 는 제외", () => {
    const a = createScanJob("/list.mp4");
    a.status = "running";
    const b = createScanJob("/list.mp4");
    markDone(b, 0);
    const running = listRunningJobsForPath("/list.mp4");
    expect(running.find((j) => j.id === a.id)).toBeTruthy();
    expect(running.find((j) => j.id === b.id)).toBeFalsy();
  });

  it("publicView — proc/resultPath 같은 내부 필드 노출 안 함", () => {
    const job = createScanJob("/pub.mp4");
    const view = publicView(job);
    expect("proc" in view).toBe(false);
    expect("resultPath" in view).toBe(false);
    expect(view.id).toBe(job.id);
  });

  it("parseStageFromOutput — 스크립트 stdout 라벨 매칭", () => {
    expect(parseStageFromOutput("[1/6] 프레임 추출 시작")?.stage).toBe(
      "영상 프레임 추출",
    );
    expect(parseStageFromOutput("[3/6] Claude 1차 맞춤법")?.progress).toBe(55);
    expect(parseStageFromOutput("unrelated")).toBeNull();
  });

  it("updateProgress — 역행 progress 무시", () => {
    const job = createScanJob("/p.mp4");
    job.status = "running";
    updateProgress(job, { progress: 50 });
    updateProgress(job, { progress: 30 }); // 역행
    expect(job.progress).toBe(50);
  });

  it("getScanJob — 존재하지 않는 id 는 undefined", () => {
    expect(getScanJob("does-not-exist")).toBeUndefined();
  });

  it("watchdog — 30분 넘는 running job 은 다음 createScanJob 호출 시 failed 로 만료", () => {
    const stale = createScanJob("/stale.mp4");
    stale.status = "running";
    // startedAt 을 과거로 조작 (31분 전)
    stale.startedAt = Date.now() - 31 * 60 * 1000;

    // createScanJob 호출 → gcOldJobs → reapStaleRunning 트리거
    createScanJob("/trigger-reap.mp4");

    expect(stale.status).toBe("failed");
    expect(stale.error).toContain("watchdog");
    expect(stale.finishedAt).toBeTruthy();
  });
});
