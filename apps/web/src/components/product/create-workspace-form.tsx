"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function slugify(value: string): string {
    const slug = value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug.length >= 2 ? slug : `ws-${Date.now().toString(36)}`;
  }

  async function submit() {
    if (name.trim().length === 0) {
      setError("이름을 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slugify(name),
          timezone: "Asia/Seoul",
          defaultLocale: "ko-KR",
        }),
      });
      const payload = (await response.json()) as { error?: { message: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "생성에 실패했습니다.");
      toast.success("워크스페이스를 만들었습니다");
      router.push("/dashboard");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-3 rounded-2xl border border-border/70 bg-card p-5">
      <label className="block">
        <span className="font-mono text-[11px] tracking-widest text-muted-foreground">이름</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="내 채널 운영실"
          className="mt-2 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus-visible:border-primary/60"
        />
      </label>
      <Button className="h-10 w-full font-bold" disabled={busy} onClick={() => void submit()}>
        {busy ? "만드는 중" : "만들기"}
      </Button>
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/[0.07] px-3 py-2 text-[12px]">
          {error}
        </p>
      )}
    </div>
  );
}
