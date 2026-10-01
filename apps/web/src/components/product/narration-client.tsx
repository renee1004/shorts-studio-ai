"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function NarrationClient({
  workspaceId,
  projectId,
  enabled,
  canWrite,
  initialAssetId,
}: {
  workspaceId: string;
  projectId: string;
  enabled: boolean;
  canWrite: boolean;
  initialAssetId: string | null;
}) {
  const [assetId, setAssetId] = useState(initialAssetId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function generate() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/projects/${projectId}/narration`,
        { method: "POST" },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload.error?.message ?? "음성을 생성하지 못했습니다.",
        );
      setAssetId(payload.data.assetId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "음성 생성 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5">
      <h2 className="font-bold">내레이션 미리 듣기</h2>
      <p className="text-sm text-muted-foreground">
        현재 대본의 장면 시간에 맞춰 음성을 만듭니다. 발음과 숫자를 들어보고
        검토한 뒤 영상 합성을 시작해 주세요.
      </p>
      {assetId && (
        <audio
          aria-label="생성된 내레이션"
          controls
          preload="none"
          src={`/api/v1/workspaces/${workspaceId}/assets/${assetId}/file`}
        />
      )}
      <Button disabled={!enabled || !canWrite || busy} onClick={generate}>
        {busy ? "음성 생성 중…" : assetId ? "현재 대본 음성 확인" : "음성 생성"}
      </Button>
      {!enabled && (
        <p className="text-sm text-muted-foreground">
          실제 음성 생성은 Live 모드와 Gemini 음성 모델 연결 후 사용할 수
          있습니다.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
