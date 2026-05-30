import { NextRequest } from "next/server";
import { getCurrentSession, type SessionPayload } from "./session";
import { checkSameOrigin } from "./csrf";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * notes/v2/* 공통 가드.
 *
 * 이 라우트들은 proxy.ts matcher 에서 제외된다 — cross-subdomain(note.vibox.cloud)
 * 호출의 CORS preflight 를 각 라우트의 OPTIONS 핸들러가 직접 처리해야 하기 때문.
 * 그 대가로 미들웨어의 세션·CSRF·admin 가드가 전혀 걸리지 않으므로, 라우트가 직접:
 *   1) 세션 인증 (cookie / Bearer)
 *   2) admin 전용 — notes zone 은 개발 노트(admin 전용 .md, SEON Hub 동기화)이고
 *      vinote 도 현재 admin 단독 사용. noteIndex/noteVersions 에 owner 컬럼이 없어
 *      role 게이트가 유일한 경계다.
 *   3) mutating 메서드(POST/PUT/PATCH/DELETE)에 same-origin(CSRF) 검증
 * 을 수행한다. OPTIONS(preflight)는 가드 대상이 아니므로 각 라우트에서 그대로 통과시킨다.
 *
 * 반환: 통과 시 { session }, 거부 시 { res } — 호출부에서 `if (g.res) return g.res;`.
 */
export async function guardNotesV2(
  req: NextRequest,
  cors: Record<string, string>,
): Promise<
  | { session: SessionPayload; res?: undefined }
  | { res: Response; session?: undefined }
> {
  const session = await getCurrentSession();
  if (!session) {
    return {
      res: Response.json({ error: "unauthorized" }, { status: 401, headers: cors }),
    };
  }
  if (session.role !== "admin") {
    return {
      res: Response.json({ error: "admin only" }, { status: 403, headers: cors }),
    };
  }
  if (MUTATING.has(req.method) && !checkSameOrigin(req)) {
    return {
      res: Response.json(
        { error: "cross-origin request denied (CSRF)" },
        { status: 403, headers: cors },
      ),
    };
  }
  return { session };
}
