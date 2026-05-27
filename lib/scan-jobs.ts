import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";

export type JobStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export type ScanJobPublic = {
  id: string;
  filePath: string;
  status: JobStatus;
  stage: string;
  progress: number; // 0~100
  issuesFound: number | null;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
};

type InternalJob = ScanJobPublic & {
  proc: ChildProcess | null;
  resultPath: string | null;
};

const jobs = new Map<string, InternalJob>();

// running 상태로 30분 넘게 멈춰있는 job 강제 만료 — 자식 프로세스가 exit 이벤트 못 받고
// 죽은 경우(SIGKILL 직격, 부모 재기동 등) 메모리에 영원히 'running' 남는 걸 차단.
const STALE_RUNNING_MS = 30 * 60 * 1000;

function reapStaleRunning() {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (job.status !== "running" && job.status !== "pending") continue;
    if (now - job.startedAt > STALE_RUNNING_MS) {
      // 살아있을지 모르는 자식 프로세스 정리 시도 (best-effort)
      if (job.proc) {
        try {
          job.proc.kill("SIGKILL");
        } catch {}
      }
      job.status = "failed";
      job.error = `watchdog: ${Math.floor((now - job.startedAt) / 60000)}분 무응답 — 강제 만료`;
      job.finishedAt = now;
      job.proc = null;
    }
  }
}

// 오래된 완료 job 정리 (1시간 이상)
function gcOldJobs() {
  reapStaleRunning();
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (
      job.finishedAt &&
      now - job.finishedAt > 60 * 60 * 1000
    ) {
      jobs.delete(id);
    }
  }
}

export function createScanJob(filePath: string): InternalJob {
  gcOldJobs();
  const id = randomUUID();
  const job: InternalJob = {
    id,
    filePath,
    status: "pending",
    stage: "대기 중",
    progress: 0,
    issuesFound: null,
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
    proc: null,
    resultPath: null,
  };
  jobs.set(id, job);
  return job;
}

export function getScanJob(id: string): InternalJob | undefined {
  return jobs.get(id);
}

export function listRunningJobsForPath(filePath: string): InternalJob[] {
  return [...jobs.values()].filter(
    (j) => j.filePath === filePath && (j.status === "running" || j.status === "pending"),
  );
}

export function publicView(job: InternalJob): ScanJobPublic {
  const {
    id,
    filePath,
    status,
    stage,
    progress,
    issuesFound,
    startedAt,
    finishedAt,
    error,
  } = job;
  return {
    id,
    filePath,
    status,
    stage,
    progress,
    issuesFound,
    startedAt,
    finishedAt,
    error,
  };
}

export function cancelScanJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  if (job.status !== "running" && job.status !== "pending") return false;
  job.status = "cancelled";
  job.finishedAt = Date.now();
  job.stage = "취소됨";
  if (job.proc) {
    try {
      job.proc.kill("SIGTERM");
      setTimeout(() => {
        try {
          job.proc?.kill("SIGKILL");
        } catch {}
      }, 3000);
    } catch {}
  }
  return true;
}

// Parse stdout 라인에서 stage/progress 추출
const STAGE_MAP: Array<[RegExp, { stage: string; progress: number }]> = [
  [/\[1\/6\] 프레임 추출/, { stage: "영상 프레임 추출", progress: 5 }],
  [/\[2\/6\] Vision OCR/, { stage: "OCR 인식 중", progress: 20 }],
  [/y_bands/, { stage: "자막 영역 분석", progress: 45 }],
  [/\[3\/6\] Claude 1차/, { stage: "AI 맞춤법 분석 1차", progress: 55 }],
  [/\[4\/6\] 의심 자막/, { stage: "의심 자막 재확인", progress: 70 }],
  [/\[5\/6\] Claude 2차/, { stage: "AI 맞춤법 재평가", progress: 80 }],
  [/\[6\/6\] 최종 병합/, { stage: "결과 정리", progress: 88 }],
  [/\[7\/7\] 프레임 정밀/, { stage: "타이밍 정밀화", progress: 92 }],
];

export function parseStageFromOutput(text: string): { stage: string; progress: number } | null {
  for (const [re, result] of STAGE_MAP) {
    if (re.test(text)) return result;
  }
  return null;
}

export function bindProcess(
  job: InternalJob,
  proc: ChildProcess,
  resultPath: string,
) {
  job.proc = proc;
  job.resultPath = resultPath;
  job.status = "running";
  job.stage = "시작 중";
  job.progress = 2;
}

export function markDone(job: InternalJob, issuesFound: number) {
  if (job.status === "cancelled") return;
  job.status = "done";
  job.stage = "완료";
  job.progress = 100;
  job.issuesFound = issuesFound;
  job.finishedAt = Date.now();
  job.proc = null;
}

export function markFailed(job: InternalJob, error: string) {
  if (job.status === "cancelled") return;
  job.status = "failed";
  job.stage = "실패";
  job.error = error;
  job.finishedAt = Date.now();
  job.proc = null;
}

export function updateProgress(
  job: InternalJob,
  update: { stage?: string; progress?: number },
) {
  if (job.status !== "running") return;
  if (update.stage) job.stage = update.stage;
  if (typeof update.progress === "number") {
    job.progress = Math.max(job.progress, update.progress);
  }
}
