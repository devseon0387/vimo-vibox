/**
 * 서버에서 받은 에러 코드/문자열을 사용자 친화 메시지로 변환.
 * 컨텍스트별로 "왜" + "다음 행동" 까지 설명.
 */

export type ErrorContext =
  | "delete"
  | "rename"
  | "move"
  | "upload"
  | "share"
  | "comment"
  | "trash-restore"
  | "trash-permanent"
  | "encode"
  | "library-write"
  | "personal-write"
  | "general";

type ErrorRule = {
  match: (raw: string) => boolean;
  byContext: Partial<Record<ErrorContext, string>> & { default: string };
};

// 우선순위 순서대로 매칭됨
const RULES: ErrorRule[] = [
  {
    match: (r) => /^forbidden$/i.test(r) || /^staff only$/i.test(r),
    byContext: {
      "library-write": "자료실은 매니저·멤버만 올릴 수 있어요. 관리자에게 문의하세요.",
      "personal-write": "다른 사람의 박스에는 올릴 수 없어요.",
      delete: "이 항목을 지울 권한이 없어요. 본인이 올린 파일만 삭제 가능합니다.",
      rename: "이 항목 이름을 바꿀 권한이 없어요.",
      move: "이 항목을 이동할 권한이 없어요.",
      share: "공유 링크를 만들 권한이 없어요.",
      comment: "댓글 권한이 없어요. 매니저에게 문의하세요.",
      default: "권한이 없어 진행할 수 없어요.",
    },
  },
  {
    match: (r) => /^unauthorized$/i.test(r) || /401/.test(r),
    byContext: {
      default:
        "로그인 세션이 만료됐어요. 새로고침 후 다시 로그인해주세요.",
    },
  },
  {
    match: (r) => /^quota exceeded$/i.test(r) || /quota/i.test(r),
    byContext: {
      "personal-write":
        "내 박스 용량이 부족해요. 용량 늘려달라고 관리자에게 요청하거나 오래된 파일을 정리하세요.",
      default: "용량 한도를 초과했어요.",
    },
  },
  {
    match: (r) => /reserved path/i.test(r),
    byContext: {
      default: "시스템 예약 폴더(_storage, .vibox 등)에는 작업할 수 없어요.",
    },
  },
  {
    match: (r) => /not found|enoent/i.test(r),
    byContext: {
      "trash-restore": "이미 영구 삭제됐거나 다른 사람이 복원한 항목이에요.",
      default: "파일을 찾을 수 없어요. 새로고침해보세요.",
    },
  },
  {
    match: (r) => /already exists|eexist|duplicate/i.test(r),
    byContext: {
      rename: "같은 이름이 이미 있어요. 다른 이름을 사용해주세요.",
      move: "대상 폴더에 같은 이름이 이미 있어요.",
      default: "같은 이름이 이미 존재해요.",
    },
  },
  {
    match: (r) => /invalid path|invalid name/i.test(r),
    byContext: {
      default: "사용할 수 없는 경로·이름이에요. /\\:*?\"<>| 같은 특수문자는 빼주세요.",
    },
  },
  {
    match: (r) => /chunk count mismatch/i.test(r),
    byContext: {
      upload: "업로드 청크가 누락됐어요. 다시 시도해주세요.",
      default: "파일 일부가 손상됐어요. 다시 업로드해주세요.",
    },
  },
  {
    match: (r) => /aborted/i.test(r),
    byContext: {
      upload: "업로드가 취소됐어요.",
      default: "작업이 중단됐어요.",
    },
  },
  {
    match: (r) => /too many duplicates/i.test(r),
    byContext: {
      default: "같은 이름의 파일이 너무 많아요. 일부 정리 후 다시 시도해주세요.",
    },
  },
  {
    match: (r) => /network|fetch|timeout/i.test(r),
    byContext: {
      default: "네트워크 오류가 발생했어요. 잠시 후 다시 시도해주세요.",
    },
  },
];

/**
 * 서버 에러 메시지(또는 throw 한 Error.message) + 컨텍스트 → 사용자 친화 한 줄.
 */
export function humanError(
  raw: string | undefined | null,
  ctx: ErrorContext = "general",
): string {
  const r = (raw ?? "").trim();
  if (!r) return "알 수 없는 오류가 발생했어요. 잠시 후 다시 시도해주세요.";
  for (const rule of RULES) {
    if (rule.match(r)) {
      return rule.byContext[ctx] ?? rule.byContext.default;
    }
  }
  // 한글 메시지면 그대로 (서버가 이미 친화적으로 보낸 거)
  if (/[가-힣]/.test(r)) return r;
  // 매칭 안 되는 영어 메시지는 일반 안내
  return `오류: ${r}`;
}

/**
 * fetch Response 또는 에러 응답에서 raw 문자열 추출 + humanError 적용 헬퍼.
 */
export async function humanFromResponse(
  res: Response,
  ctx: ErrorContext = "general",
): Promise<string> {
  let raw = res.statusText || `HTTP ${res.status}`;
  try {
    const body = await res.json();
    if (body && typeof body.error === "string") raw = body.error;
  } catch {}
  return humanError(raw, ctx);
}
