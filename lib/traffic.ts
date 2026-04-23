import { randomUUID } from "node:crypto";
import { lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { trafficLog } from "@/lib/db/schema";

export type TrafficSource = "download" | "share" | "thumb" | "upload";

type LogParams = {
  path: string;
  source: TrafficSource;
  shareToken?: string | null;
  userId?: string | null;
};

/**
 * 트래픽 로그 기록.
 * 단순 기록용 (단일 파일 응답 전체 크기 등 "알려진 값").
 * 실패해도 요청 처리는 막지 않음 (silent catch).
 *
 * 20MB 이하 download/share 는 **기록하지 않음** — 영상 메타데이터(moov 등) 프리로드나
 * 아주 작은 Range 요청이 조회수를 과도하게 부풀리는 문제 방지.
 * thumb/upload 은 항상 기록 (작은 바이트도 의미 있음).
 */
const MIN_LOG_BYTES = 20 * 1024 * 1024; // 20MB

export function logTraffic(params: LogParams & { bytes: number }): void {
  if (!params.bytes || params.bytes <= 0) return;
  if (
    (params.source === "download" || params.source === "share") &&
    params.bytes < MIN_LOG_BYTES
  ) {
    return;
  }
  try {
    db.insert(trafficLog)
      .values({
        id: randomUUID(),
        path: params.path,
        bytes: params.bytes,
        source: params.source,
        shareToken: params.shareToken ?? null,
        userId: params.userId ?? null,
      })
      .run?.();
  } catch {
    /* 로그 실패는 무시 */
  }
}

/**
 * 스트림을 감싸 **실제로 전송된 바이트**를 집계한 뒤 로그 기록.
 * 클라이언트가 중간에 연결 끊어도 해당 시점까지의 실제 바이트만 기록됨.
 *
 * 사용:
 *   const webStream = streamWithTrafficLog(nodeStream, { path, source });
 *   return new Response(webStream, ...);
 */
/**
 * 오래된 traffic_log 삭제.
 * 기본 90일 이상 경과한 행을 지워 테이블 크기·쿼리 성능 유지.
 * launchd 크론에서 호출 (scripts/com.vibox.prune.plist).
 */
export function pruneTrafficLog(keepDays = 90): number {
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);
  const result = db
    .delete(trafficLog)
    .where(lt(trafficLog.at, cutoff))
    .run?.();
  return (result as { changes?: number } | undefined)?.changes ?? 0;
}

export function streamWithTrafficLog(
  nodeStream: NodeJS.ReadableStream,
  params: LogParams,
): ReadableStream {
  let transferred = 0;
  let logged = false;

  const finalize = () => {
    if (logged) return;
    logged = true;
    logTraffic({ ...params, bytes: transferred });
  };

  // Web ReadableStream 으로 직접 바이트 카운트하며 전달.
  // Readable.toWeb(Transform) 조합이 Node 25에서 "Controller is already closed"
  // uncaughtException 발생시켜 전체 프로세스 불안정 유발 → 직접 구현.
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const onData = (chunk: Buffer) => {
        transferred += chunk.length;
        try {
          controller.enqueue(new Uint8Array(chunk));
        } catch {
          // 이미 닫힌 경우 — 클라 연결 끊김. 소스 스트림 중단.
          (nodeStream as unknown as { destroy?: () => void }).destroy?.();
        }
      };
      const onEnd = () => {
        try {
          controller.close();
        } catch {
          /* 이미 닫힘 */
        }
        finalize();
      };
      const onError = (err: Error) => {
        try {
          controller.error(err);
        } catch {
          /* 이미 닫힘 */
        }
        finalize();
      };

      nodeStream.on("data", onData);
      nodeStream.on("end", onEnd);
      nodeStream.on("error", onError);
      nodeStream.on("close", () => {
        finalize();
      });
    },
    cancel() {
      // 클라가 연결 끊음 → 소스 스트림 중단
      (nodeStream as unknown as { destroy?: () => void }).destroy?.();
      finalize();
    },
  });
}
