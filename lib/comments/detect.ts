export type Category = "txt" | "cut" | "col" | "aud" | "mtn" | "etc";
export type Kind = "feedback" | "praise";

const KEYWORDS: Record<Exclude<Category, "etc">, string[]> = {
  txt: ["자막", "오타", "텍스트", "철자", "줄바꿈", "글자", "타이포", "맞춤법", "문구"],
  cut: [
    "컷",
    "타이밍",
    "편집",
    "전환",
    "붙여",
    "길이",
    "템포",
    "빨라",
    "느려",
    "싱크",
    "짧게",
    "길게",
    "잘라",
    "스킵",
  ],
  col: [
    "색",
    "톤",
    "채도",
    "밝기",
    "컬러",
    "그레이딩",
    "노출",
    "lut",
    "따뜻",
    "차갑",
    "화이트밸런스",
    "대비",
    "콘트라스트",
  ],
  aud: [
    "bgm",
    "음악",
    "볼륨",
    "소리",
    "음량",
    "내레이션",
    "노이즈",
    "오디오",
    "잡음",
    "음질",
    "에코",
    "마이크",
  ],
  mtn: [
    "로고",
    "모션",
    "그래픽",
    "애니메이션",
    "트랜지션",
    "이펙트",
    "애니",
    "인트로",
    "아웃트로",
  ],
};

export function detectCategory(text: string): Category {
  const lower = text.toLowerCase();
  const scores: Record<string, number> = {};
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    scores[cat] = words.filter((w) => lower.includes(w.toLowerCase())).length;
  }
  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const [best, n] = sorted[0];
  return n > 0 ? (best as Category) : "etc";
}

export const CATEGORIES: {
  key: Category;
  label: string;
  color: string;
  bgSoft: string;
}[] = [
  { key: "txt", label: "자막", color: "#ef4444", bgSoft: "#fef2f2" },
  { key: "cut", label: "컷", color: "#8b5cf6", bgSoft: "#f5f3ff" },
  { key: "col", label: "색감", color: "#f97316", bgSoft: "#fff7ed" },
  { key: "aud", label: "오디오", color: "#06b6d4", bgSoft: "#ecfeff" },
  { key: "mtn", label: "모션", color: "#16a34a", bgSoft: "#f0fdf4" },
  { key: "etc", label: "기타", color: "#71717a", bgSoft: "#f4f4f5" },
];

export function getCategoryMeta(key: Category) {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[5];
}

// ========== Kind (수정 요청 vs 좋아요) ==========

const PRAISE_WORDS = [
  "최고",
  "완벽",
  "깔끔",
  "멋지",
  "멋져",
  "멋있",
  "훌륭",
  "대박",
  "좋아",
  "좋다",
  "좋네",
  "좋음",
  "좋고",
  "감동",
  "인상적",
  "끝내",
  "예쁘",
  "예쁨",
  "신기",
  "센스",
  "쩐다",
  "죽인다",
];

const NEGATION_WORDS = ["안 좋", "별로", "아쉽", "부족", "이상"];

// 강한 피드백 신호: 이게 있으면 좋아요 키워드가 있어도 feedback으로 판정
const FEEDBACK_STRONG_WORDS = [
  "오타",
  "수정",
  "고쳐",
  "고치",
  "애매",
  "어색",
  "틀렸",
  "잘못",
  "바꿔",
  "문제",
  "이슈",
  "낮춰",
  "높여",
  "다시",
  "필요",
];

export function detectKind(text: string): Kind {
  const lower = text.toLowerCase();

  // 강한 피드백 키워드는 최우선
  for (const w of FEEDBACK_STRONG_WORDS) {
    if (lower.includes(w)) return "feedback";
  }

  // 부정 표현 검사
  for (const w of NEGATION_WORDS) {
    if (lower.includes(w)) return "feedback";
  }

  // 좋아요 키워드
  for (const w of PRAISE_WORDS) {
    if (lower.includes(w)) return "praise";
  }

  return "feedback";
}

export const PRAISE_COLOR = "#16a34a"; // 녹색
export const PRAISE_BG = "#f0fdf4";

