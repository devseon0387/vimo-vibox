import { marked } from "marked";

// 마크다운을 네이버 스마트에디터에 붙여넣기 잘 되는 HTML로 변환.
// 이미지는 [img-N] 텍스트 자리표시자로 치환 (네이버는 외부 이미지 URL 차단).
// 코드 블록·표는 제거하거나 평문화 (네이버 호환 X).

export type NaverExport = {
  html: string;
  text: string;
  imageCount: number;
};

export function markdownToNaver(markdown: string): NaverExport {
  // 1) 이미지 마크다운(![alt](url))을 번호 매긴 자리표시자로 치환
  let imageCount = 0;
  const withPlaceholders = markdown.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_, alt: string) => {
      imageCount += 1;
      const label = alt.trim() || "이미지";
      return `\n\n[img-${imageCount}] ${label}\n\n`;
    },
  );

  // 2) marked로 HTML 변환 (GFM, 줄바꿈 보존)
  marked.setOptions({ gfm: true, breaks: true });
  const rawHtml = marked.parse(withPlaceholders, { async: false }) as string;

  // 3) 네이버 호환을 위한 정리
  let html = rawHtml;

  // 표 제거 (네이버 자체 표 위젯 사용 필요 — 붙여넣어도 깨짐)
  html = html.replace(/<table[\s\S]*?<\/table>/g, "");

  // 코드블록 → <p>로 평문화 (서식 유지하려고 시도하지 말고 그냥 텍스트로)
  html = html.replace(
    /<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/g,
    (_, code: string) => `<p>${code.trim()}</p>`,
  );

  // 인라인 코드 → 평문
  html = html.replace(/<code>([^<]*)<\/code>/g, "$1");

  // 취소선 → 평문 (네이버 붙여넣기에서 자주 깨짐)
  html = html.replace(/<del>([\s\S]*?)<\/del>/g, "$1");

  // 4) 평문 fallback — 클립보드 plain/text 채널용
  const text = withPlaceholders;

  return { html, text, imageCount };
}

// 클립보드에 HTML + 텍스트 둘 다 쓰기 (네이버는 HTML 인식해서 서식 유지)
export async function copyNaverHtml(payload: NaverExport): Promise<void> {
  const item = new ClipboardItem({
    "text/html": new Blob([payload.html], { type: "text/html" }),
    "text/plain": new Blob([payload.text], { type: "text/plain" }),
  });
  await navigator.clipboard.write([item]);
}
