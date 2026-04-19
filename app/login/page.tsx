"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Lock, User } from "lucide-react";
import { loginAction, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface">
      <div className="w-full max-w-[380px]">
        <div className="text-center mb-10">
          <Link
            href="/"
            className="text-[26px] font-extrabold tracking-tight text-text inline-block"
          >
            vimo<span className="text-accent">.</span>cloud
          </Link>
          <p className="text-[13px] text-text-soft mt-2">
            VIMO 내부 팀 파일 공간
          </p>
        </div>

        <form
          action={formAction}
          className="bg-white border border-border rounded-lg p-7 space-y-4 shadow-sm"
        >
          {state.error && (
            <div className="text-[12.5px] text-danger bg-danger-soft border border-[#fee2e2] rounded-md px-3 py-2">
              {state.error}
            </div>
          )}

          <div>
            <label className="block text-[12px] font-semibold text-text-soft mb-1.5">
              아이디
            </label>
            <div className="relative">
              <User
                size={15}
                strokeWidth={2}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
              />
              <input
                name="username"
                type="text"
                autoComplete="username"
                required
                placeholder="username"
                className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[14px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-text-soft mb-1.5">
              비밀번호
            </label>
            <div className="relative">
              <Lock
                size={15}
                strokeWidth={2}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
              />
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 border border-border rounded-md text-[14px] outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-text text-white hover:bg-[#333] disabled:opacity-60 disabled:cursor-not-allowed transition-colors py-2.5 rounded-md text-[14px] font-semibold"
          >
            {pending ? "확인 중..." : "로그인"}
          </button>
        </form>

        <p className="text-center text-[12px] text-text-faint mt-6">
          계정이 필요하면 관리자에게 문의하세요
        </p>
      </div>
    </div>
  );
}
