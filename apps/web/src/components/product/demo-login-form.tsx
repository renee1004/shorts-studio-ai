"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** 시드가 만든 Demo 계정. 외부 인증 없이 Phase 0-1을 둘러보기 위한 경로다. */
const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
const DEMO_EMAIL = "demo@shorts-os.local";

export function DemoLoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/auth/demo-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: DEMO_EMAIL, userId: DEMO_USER_ID }),
      });
      const payload = (await response.json()) as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "로그인에 실패했습니다.");
      toast.success("Demo 세션으로 들어갑니다");
      router.push("/dashboard");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "로그인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 rounded-2xl border border-border/70 bg-card p-5">
      <p className="font-mono text-[11px] tracking-widest text-muted-foreground">DEMO MODE</p>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        외부 API Key 없이 시드 데이터로 전체 흐름을 확인할 수 있습니다. 실제 수집으로 바꿀 때도 같은
        코드가 돌아갑니다.
      </p>
      <Button className="mt-4 h-10 w-full font-bold" disabled={busy} onClick={() => void signIn()}>
        {busy ? "들어가는 중" : "Demo 워크스페이스로 들어가기"}
      </Button>
      {error && (
        <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/[0.07] px-3 py-2 text-[12px]">
          {error}
        </p>
      )}
      <p className="mt-3 font-mono text-[10px] text-muted-foreground">
        pnpm db:seed 를 실행하지 않았다면 워크스페이스가 비어 있습니다.
      </p>
    </div>
  );
}
