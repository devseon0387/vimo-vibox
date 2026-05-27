import webpush from "web-push";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";

// VAPID 초기화 — process 부팅 시 한 번. 키 없으면 sendPush 가 silently no-op.
let configured = false;
function ensureVapid(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subj) return false;
  webpush.setVapidDetails(subj, pub, priv);
  configured = true;
  return true;
}

export type PushPayload = {
  /** 알림 제목 */
  title: string;
  /** 본문 한 줄 */
  body: string;
  /** 클릭 시 이동할 경로 — 비워두면 / */
  url?: string;
  /** 알림 그룹화 키 — 같은 tag 는 OS 가 최근 1개로 합침 (예: "inbox:<userId>") */
  tag?: string;
  /** 작은 아이콘 절대 경로 — 기본 /icon-192.png */
  icon?: string;
  /** 추가 메타 (notificationclick 핸들러로 전달) */
  data?: Record<string, unknown>;
};

/**
 * 한 사용자의 모든 활성 구독에 푸시 발송.
 * 410 Gone (브라우저가 구독 해제) → 행 제거.
 * 그 외 실패 → failureCount++. 5회 누적 시 제거.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{
  sent: number;
  removed: number;
  failed: number;
}> {
  if (!ensureVapid()) {
    return { sent: 0, removed: 0, failed: 0 };
  }

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  let sent = 0;
  let removed = 0;
  let failed = 0;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
    tag: payload.tag,
    icon: payload.icon ?? "/icon-192.png",
    data: payload.data ?? {},
  });

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
        await db
          .update(pushSubscriptions)
          .set({ lastUsedAt: new Date(), failureCount: 0 })
          .where(eq(pushSubscriptions.id, s.id));
      } catch (err) {
        const e = err as { statusCode?: number; body?: string };
        // 410 Gone or 404 — 구독 사라짐
        if (e.statusCode === 410 || e.statusCode === 404) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
          removed++;
          return;
        }
        failed++;
        // 누적 실패 5회 이상이면 prune
        await db
          .update(pushSubscriptions)
          .set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` })
          .where(eq(pushSubscriptions.id, s.id));
        // best-effort cleanup
        await db
          .delete(pushSubscriptions)
          .where(
            sql`${pushSubscriptions.id} = ${s.id} AND ${pushSubscriptions.failureCount} >= 5`,
          );
      }
    }),
  );

  return { sent, removed, failed };
}

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}
