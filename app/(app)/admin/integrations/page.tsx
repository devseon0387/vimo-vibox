import { redirect } from "next/navigation";
import { Plug, ExternalLink } from "lucide-react";
import { getCurrentSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminIntegrationsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  return (
    <div className="px-8 py-6 max-w-[900px]">
      <h1 className="text-[22px] font-extrabold mb-1">SEON Hub 연동</h1>
      <p className="text-[13px] text-text-soft mb-6">
        SEON Hub와 비박스 사이의 노트 동기화 상태를 확인하고 설정합니다.
      </p>

      <div className="border border-border rounded-xl bg-white">
        <div className="px-6 py-5 border-b border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent-soft text-accent grid place-items-center">
            <Plug size={18} strokeWidth={2} />
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-bold text-text">SEON Hub</div>
            <div className="text-[12px] text-text-faint">
              MD 노트 리더기 — 비박스가 storage backend
            </div>
          </div>
          {process.env.NEXT_PUBLIC_SEON_HUB_URL ? (
            <a
              href={`${process.env.NEXT_PUBLIC_SEON_HUB_URL}/notes`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 h-9 rounded-md border border-border text-[12.5px] text-text-soft hover:bg-surface flex items-center gap-1.5"
            >
              <ExternalLink size={12} strokeWidth={2.2} /> 열기
            </a>
          ) : (
            <span className="px-3 h-9 rounded-md border border-border text-[12.5px] text-text-faint flex items-center gap-1.5 italic">
              URL 미설정
            </span>
          )}
        </div>

        <div className="px-6 py-5 grid grid-cols-2 gap-x-6 gap-y-4">
          <Field label="상태" value="연동 미구성" muted />
          <Field
            label="storage zone"
            value="/Volumes/Vibox Storage A/Notes/"
            mono
          />
          <Field label="마지막 동기화" value="—" muted />
          <Field label="발급된 토큰" value="0개" muted />
        </div>
      </div>

      <div className="mt-6 border border-border rounded-xl bg-surface px-6 py-5">
        <div className="text-[13px] font-semibold text-text mb-2">
          연동 활성화에 필요한 작업
        </div>
        <ol className="text-[12.5px] text-text-soft leading-relaxed list-decimal pl-5 space-y-1">
          <li>
            서비스 계정 JWT 발급 흐름 구현 (`/api/integration/upload`, `/file`,
            `/files`, `/shares` 등 6개 엔드포인트)
          </li>
          <li>SEON Hub 측 클라이언트가 위 엔드포인트로 노트 push</li>
          <li>토큰 관리 UI (이 페이지에서 발급/회수)</li>
        </ol>
        <div className="text-[11.5px] text-text-faint mt-3">
          현재는 비박스 자체 admin 세션으로만 노트 작업 가능. SEON Hub 작업 시작 시 구현 예정.
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  muted,
}: {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-widest text-text-faint font-semibold mb-1">
        {label}
      </div>
      <div
        className={`text-[13px] ${mono ? "font-mono" : ""} ${
          muted ? "text-text-faint" : "text-text"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
