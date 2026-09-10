"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function EmailLoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error?.message ?? "로그인에 실패했습니다.");
      router.push("/create");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "로그인에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="mt-8 space-y-4 rounded-2xl border bg-card p-5"
    >
      <label className="block text-sm">
        이메일
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={254}
          className="mt-2 block w-full rounded-md border bg-background p-2"
        />
      </label>
      <label className="block text-sm">
        비밀번호
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={1024}
          className="mt-2 block w-full rounded-md border bg-background p-2"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "로그인 중…" : "로그인"}
      </Button>
      <p className="text-xs text-muted-foreground">
        등록된 계정으로 로그인하세요. 계정 생성이나 비밀번호 변경은 관리자에게
        요청해 주세요.
      </p>
    </form>
  );
}
