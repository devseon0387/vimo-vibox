"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Trash2,
  KeyRound,
  Shield,
  ShieldOff,
  Users as UsersIcon,
} from "lucide-react";
import { Modal } from "./Modal";
import { useConfirm } from "./ConfirmDialog";
import { useToast } from "./Toast";
import { humanError } from "@/lib/human-error";

export type AdminUser = {
  id: string;
  username: string;
  name: string | null;
  email: string | null;
  role: "admin" | "member" | "partner";
  quotaGb: number;
  createdAt: number;
};

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
}

export function UsersAdmin({
  items,
  currentUserId,
}: {
  items: AdminUser[];
  currentUserId: string;
}) {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { success, error: toastError } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const toggleRole = async (user: AdminUser) => {
    const nextRole = user.role === "admin" ? "member" : "admin";
    const label = nextRole === "admin" ? "관리자로 승격" : "일반 멤버로 변경";
    const ok = await confirm({
      title: label,
      message: (
        <>
          <span className="font-semibold text-text">{user.username}</span>
          {" "}을(를) {label}할까요?
        </>
      ),
      confirmLabel: nextRole === "admin" ? "승격" : "변경",
      variant: "default",
    });
    if (!ok) return;
    setBusy(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toastError(humanError(body.error ?? res.statusText, "general"));
        return;
      }
      success(`${user.username} 역할 변경됨`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async (user: AdminUser) => {
    const ok = await confirm({
      title: "사용자 삭제",
      message: (
        <>
          <span className="font-semibold text-text">{user.username}</span> 계정을 삭제할까요?
          <br />이 사용자가 만든 공유 링크와 휴지통 항목도 함께 제거돼요.
          <br />(업로드한 파일은 그대로 남아요)
        </>
      ),
      confirmLabel: "삭제",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toastError(humanError(body.error ?? res.statusText, "general"));
        return;
      }
      success(`${user.username} 삭제됨`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">사용자 관리</h1>
          <p className="text-sm text-text-faint mt-1">
            팀 멤버를 추가하고 역할과 비밀번호를 관리해요
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="bg-text text-white hover:bg-[#333] transition-colors px-3.5 py-2 rounded-md text-base font-semibold flex items-center gap-1.5"
        >
          <UserPlus size={14} strokeWidth={2.5} />
          사용자 추가
        </button>
      </div>

      {items.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-12 text-center">
          <UsersIcon size={32} className="mx-auto text-text-faint mb-3" strokeWidth={1.5} />
          <div className="text-md text-text-muted">사용자가 없어요</div>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-x-auto bg-white">
          <table className="w-full min-w-[720px] text-base">
            <thead className="bg-surface border-b border-border">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-text-soft uppercase tracking-wider">
                  아이디
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-text-soft uppercase tracking-wider">
                  이름
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-text-soft uppercase tracking-wider w-[90px]">
                  역할
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-text-soft uppercase tracking-wider w-[100px]">
                  할당량
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-text-soft uppercase tracking-wider w-[110px]">
                  가입
                </th>
                <th className="text-left px-4 py-2.5 font-semibold text-xs text-text-soft uppercase tracking-wider w-[140px]">
                  작업
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((user) => {
                const isMe = user.id === currentUserId;
                return (
                  <tr
                    key={user.id}
                    className={`border-b border-[#f5f5f5] hover:bg-surface transition-colors ${
                      busy === user.id ? "opacity-40" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 font-medium text-text">
                      {user.username}
                      {isMe && (
                        <span className="ml-1.5 text-xs text-text-faint">(나)</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-text-soft">
                      {user.name ?? <span className="text-text-faint">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {user.role === "admin" ? (
                        <span className="inline-flex items-center gap-1 text-sm text-accent bg-accent-soft px-2 py-0.5 rounded whitespace-nowrap">
                          <Shield size={11} strokeWidth={2.2} /> 관리자
                        </span>
                      ) : (
                        <span className="text-sm text-text-soft">멤버</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <QuotaEditor
                        userId={user.id}
                        value={user.quotaGb}
                        disabled={busy === user.id}
                        onBusy={(b) => setBusy(b ? user.id : null)}
                        onSaved={() => {
                          success("할당량 변경됨");
                          router.refresh();
                        }}
                        onError={(m) => toastError(m)}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-text-faint text-sm">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-0.5 items-center">
                        <button
                          onClick={() => toggleRole(user)}
                          disabled={isMe || busy === user.id}
                          title={user.role === "admin" ? "관리자 해제" : "관리자로 승격"}
                          className="p-1.5 rounded hover:bg-hover text-text-soft hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {user.role === "admin" ? (
                            <ShieldOff size={14} strokeWidth={2} />
                          ) : (
                            <Shield size={14} strokeWidth={2} />
                          )}
                        </button>
                        <button
                          onClick={() => setResetUser(user)}
                          disabled={busy === user.id}
                          title="비밀번호 리셋"
                          className="p-1.5 rounded hover:bg-hover text-text-soft hover:text-accent disabled:opacity-50"
                        >
                          <KeyRound size={14} strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => onDelete(user)}
                          disabled={isMe || busy === user.id}
                          title="삭제"
                          className="p-1.5 rounded hover:bg-danger-soft text-text-soft hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Trash2 size={14} strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <AddUserModal
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false);
            router.refresh();
          }}
        />
      )}

      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onDone={() => {
            setResetUser(null);
            router.refresh();
          }}
        />
      )}

      {confirmDialog}
    </>
  );
}

function QuotaEditor({
  userId,
  value,
  disabled,
  onBusy,
  onSaved,
  onError,
}: {
  userId: string;
  value: number;
  disabled: boolean;
  onBusy: (b: boolean) => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const save = async () => {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n) || n < 0 || n > 100000) {
      onError("0~100000 GB 범위여야 해요");
      return;
    }
    if (n === value) {
      setEditing(false);
      return;
    }
    onBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotaGb: n }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        onError(humanError(body.error ?? res.statusText, "general"));
        return;
      }
      setEditing(false);
      onSaved();
    } finally {
      onBusy(false);
    }
  };

  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraft(String(value));
          setEditing(true);
        }}
        disabled={disabled}
        className="text-text-soft hover:text-accent hover:bg-hover px-1.5 py-0.5 rounded text-base tabular-nums disabled:opacity-40"
        title="클릭해서 수정"
      >
        {value} GB
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        autoFocus
        min={0}
        max={100000}
        className="w-20 px-1.5 py-0.5 border border-accent rounded text-base tabular-nums outline-none focus:ring-1 focus:ring-accent"
      />
      <span className="text-xs text-text-faint">GB</span>
      <button
        onClick={save}
        disabled={disabled}
        className="text-xs font-semibold text-white bg-accent hover:opacity-90 px-1.5 py-0.5 rounded disabled:opacity-40"
      >
        저장
      </button>
      <button
        onClick={() => setEditing(false)}
        className="text-xs text-text-faint hover:text-text px-1"
      >
        취소
      </button>
    </div>
  );
}

function AddUserModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          name: name || undefined,
          password,
          role,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toastError(humanError(body.error ?? res.statusText, "general"));
        return;
      }
      success(
        <>
          <span className="font-semibold">{username}</span> 사용자 추가됨
        </>,
      );
      onAdded();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="사용자 추가" maxWidth="max-w-[440px]">
      <form onSubmit={submit} className="space-y-3 p-5">
        <div>
          <label className="block text-sm font-semibold text-text-soft mb-1.5">
            아이디
          </label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
            placeholder="예: jin"
            pattern="[a-zA-Z0-9_\-]{2,30}"
            className="w-full px-3 py-2 border border-border rounded-md text-md outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
          />
          <div className="text-xs text-text-faint mt-1">
            영소문자/숫자/_/- 만, 2~30자
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-text-soft mb-1.5">
            이름 (선택)
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 진"
            className="w-full px-3 py-2 border border-border rounded-md text-md outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-text-soft mb-1.5">
            임시 비밀번호
          </label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            type="text"
            placeholder="최소 6자"
            className="w-full px-3 py-2 border border-border rounded-md text-md outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
          />
          <div className="text-xs text-text-faint mt-1">
            사용자에게 전달하고 로그인 후 변경하도록 안내하세요
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-text-soft mb-1.5">
            역할
          </label>
          <div className="flex gap-2">
            <label className="flex-1 flex items-center gap-2 border border-border rounded-md px-3 py-2 cursor-pointer hover:border-border-hover">
              <input
                type="radio"
                name="role"
                checked={role === "member"}
                onChange={() => setRole("member")}
              />
              <span className="text-base">멤버</span>
            </label>
            <label className="flex-1 flex items-center gap-2 border border-border rounded-md px-3 py-2 cursor-pointer hover:border-border-hover">
              <input
                type="radio"
                name="role"
                checked={role === "admin"}
                onChange={() => setRole("admin")}
              />
              <span className="text-base">관리자</span>
            </label>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-base font-medium text-text-muted hover:text-text hover:bg-hover rounded-md"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-base font-semibold bg-text text-white hover:bg-[#333] disabled:opacity-60 rounded-md"
          >
            {submitting ? "추가 중..." : "추가"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  user,
  onClose,
  onDone,
}: {
  user: AdminUser;
  onClose: () => void;
  onDone: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toastError(humanError(body.error ?? res.statusText, "general"));
        return;
      }
      success(
        <>
          <span className="font-semibold">{user.username}</span> 비밀번호 리셋됨
        </>,
      );
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`${user.username} 비밀번호 리셋`} maxWidth="max-w-[440px]">
      <form onSubmit={submit} className="space-y-3 p-5">
        <div>
          <label className="block text-sm font-semibold text-text-soft mb-1.5">
            새 임시 비밀번호
          </label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            type="text"
            autoFocus
            placeholder="최소 6자"
            className="w-full px-3 py-2 border border-border rounded-md text-md outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
          />
          <div className="text-xs text-text-faint mt-1">
            사용자에게 전달하고 로그인 후 변경하도록 안내하세요
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-base font-medium text-text-muted hover:text-text hover:bg-hover rounded-md"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-base font-semibold bg-text text-white hover:bg-[#333] disabled:opacity-60 rounded-md"
          >
            {submitting ? "변경 중..." : "리셋"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
