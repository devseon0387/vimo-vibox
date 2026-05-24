/**
 * claude CLI 래퍼 — 글쓰기 보조용 순수 텍스트 생성.
 *
 * 보안:
 * - --disallowed-tools 로 모든 도구 차단 (파일·실행·웹 일체 금지)
 * - --permission-mode bypassPermissions 로 권한 프롬프트 hang 방지
 * - CLAUDECODE* / CLAUDE_CODE* env 제거 (중첩 세션 방지)
 *
 * 모델: claude 기본값 (사용자 CLI 로그인 기준)
 */
import { spawn } from "node:child_process";

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";

const DISALLOWED_TOOLS = [
  "Bash", "Edit", "Write", "Read", "Glob", "Grep", "Task",
  "WebSearch", "WebFetch", "NotebookEdit", "TodoWrite", "MultiEdit",
];

const DEFAULT_SYSTEM = `당신은 한국어 글쓰기를 돕는 전문 조력자입니다.

[엄격한 규칙]
- 절대 도구를 사용하지 마세요 (파일 읽기·쓰기·실행·웹 검색 등 일체 금지).
- 사용자에게 권한을 묻지 마세요.
- 사족·메타 설명·머리말·맺음말 없이 요청한 결과물만 출력합니다.
- "도와드릴까요?" 같은 질문은 금지. 곧바로 결과만.`;

export async function runClaude(opts: {
  prompt: string;
  system?: string;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.startsWith("CLAUDECODE") || key.startsWith("CLAUDE_CODE")) {
        delete env[key];
      }
    }

    const system = opts.system ?? DEFAULT_SYSTEM;
    const fullPrompt = `${system}\n\n---\n\n${opts.prompt}`;
    const args = [
      "-p", fullPrompt,
      "--output-format", "text",
      "--permission-mode", "bypassPermissions",
      "--disallowed-tools", DISALLOWED_TOOLS.join(" "),
      "--no-session-persistence",
    ];

    const child = spawn(CLAUDE_BIN, args, { env });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(`claude CLI exit ${code}: ${(err || out).trim()}`));
    });
  });
}
