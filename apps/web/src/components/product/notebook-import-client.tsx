"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { NotebookDocument } from "@shorts-os/contracts";
import { Button } from "@/components/ui/button";

type Item = { id: string; title: string; kind: "note" | "report" };
type Preview = NotebookDocument & { contentHash: string };
type Saved = { id: string; title: string; kind: string; importedAt: string };
type Stored = Saved & {
  notebookId: string;
  itemId: string;
  originalText: string;
  contentHash: string;
};

export function NotebookImportClient({
  workspaceId,
  canWrite,
}: {
  workspaceId: string;
  canWrite: boolean;
}) {
  const base = `/api/v1/workspaces/${workspaceId}/notebooklm`;
  const [notebooks, setNotebooks] = useState<{ id: string; title: string }[]>(
    [],
  );
  const [notebookId, setNotebookId] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const previewPanel = useRef<HTMLElement | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [connection, setConnection] = useState<{
    configured: boolean;
    userId: string;
    reason?: string;
  } | null>(null);
  const running = useRef(false);
  useEffect(() => {
    if (preview)
      previewPanel.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  }, [preview]);
  async function request<T>(query: string, body?: unknown): Promise<T> {
    const response = await fetch(`${base}${query}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(60000),
      ...(body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload.error?.message ?? "불러오지 못했습니다.");
    return payload.data;
  }
  async function perform(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "연결 상태를 확인해 주세요.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    fetch(`${base}?action=saved`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(
            payload.error?.message ?? "저장한 원문 목록을 불러오지 못했습니다.",
          );
        if (!cancelled) setSaved(payload.data);
      })
      .catch(() => {
        if (!cancelled)
          setError("저장한 원문 목록을 불러오지 못했습니다. 다시 열어 주세요.");
      });
    return () => {
      cancelled = true;
    };
  }, [base]);
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">NotebookLM에서 가져오기</h1>
        <p className="mt-2 text-muted-foreground">
          노트·대본 선택 → 원문 확인 → 원문 그대로 저장
        </p>
      </div>
      <section className="space-y-4 rounded-2xl border p-6">
        <p className="text-sm">
          NotebookLM에 저장한 노트와 완성된 보고서를 가져옵니다. 대본은 저장해
          둔 노트 또는 보고서에서 선택해 주세요.
        </p>
        <Button
          disabled={busy || !canWrite}
          onClick={() =>
            perform(async () => {
              const status = await request<{
                configured: boolean;
                userId: string;
                reason?: string;
              }>("?action=status");
              setConnection(status);
              if (!status.configured) return;
              const list =
                await request<{ id: string; title: string }[]>(
                  "?action=notebooks",
                );
              setNotebooks(list);
              setNotebookId("");
              setItems([]);
              setSelectedItem(null);
              setPreview(null);
              setSavedId(null);
              if (!list.length)
                setMessage("이 계정에 표시할 노트북이 없습니다.");
            })
          }
        >
          노트북 불러오기
        </Button>
        {!canWrite && <p>가져오기 권한이 있는 멤버만 사용할 수 있습니다.</p>}
        {connection && !connection.configured && (
          <div className="space-y-2 rounded-lg bg-muted p-4 text-sm">
            <p>
              {connection.reason === "verified-login-required"
                ? "개인 NotebookLM 자료를 가져오려면 체험 계정 대신 이메일로 로그인해 주세요."
                : "최초 한 번 Google 계정 연결이 필요합니다. 서버의 NotebookLM 연결을 설정한 뒤 다시 불러와 주세요."}
            </p>
            <p>
              연결할 앱 사용자 ID:{" "}
              <code className="break-all">{connection.userId}</code>
            </p>
          </div>
        )}
        {notebooks.length > 0 && (
          <label className="block text-sm font-semibold">
            노트북 선택
            <select
              className="mt-2 w-full rounded-lg border bg-background p-3"
              value={notebookId}
              disabled={busy}
              onChange={(event) => {
                const id = event.target.value;
                setNotebookId(id);
                setItems([]);
                setSelectedItem(null);
                setPreview(null);
                setSavedId(null);
                if (id)
                  void perform(async () => {
                    const list = await request<Item[]>(
                      `?action=items&notebookId=${encodeURIComponent(id)}`,
                    );
                    setItems(list);
                    if (!list.length)
                      setMessage("저장된 노트나 완성된 보고서가 없습니다.");
                  });
              }}
            >
              <option value="">노트북을 선택해 주세요</option>
              {notebooks.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title || "제목 없음"}
                </option>
              ))}
            </select>
          </label>
        )}
        {items.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-semibold">노트·대본 선택</h2>
            <p className="text-sm text-muted-foreground">
              한 항목을 선택한 뒤 ‘선택한 원문 열기’를 눌러 주세요.
            </p>
            <div
              className="max-h-80 space-y-2 overflow-y-auto pr-1"
              role="group"
              aria-label="가져올 노트 또는 대본 한 개 선택"
            >
              {items.map((item) => (
                <button
                  key={`${item.kind}:${item.id}`}
                  type="button"
                  disabled={busy}
                  aria-pressed={
                    selectedItem?.id === item.id &&
                    selectedItem.kind === item.kind
                  }
                  className={`block w-full rounded-lg border p-3 text-left focus-visible:outline-2 focus-visible:outline-primary ${selectedItem?.id === item.id && selectedItem.kind === item.kind ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:bg-muted"}`}
                  onClick={() => {
                    setSelectedItem(item);
                    setPreview(null);
                    setSavedId(null);
                    setError("");
                    setMessage("");
                  }}
                >
                  {selectedItem?.id === item.id &&
                    selectedItem.kind === item.kind && (
                      <span className="mr-2 font-semibold text-primary">
                        ✓ 선택됨
                      </span>
                    )}
                  {item.title || "제목 없음"}{" "}
                  <span className="text-sm text-muted-foreground">
                    · {item.kind === "note" ? "노트" : "보고서"}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-sm" aria-live="polite">
              {selectedItem
                ? `선택한 항목: ${selectedItem.title || "제목 없음"}`
                : "아직 선택한 항목이 없습니다."}
            </p>
            <Button
              disabled={busy || !selectedItem}
              onClick={() =>
                perform(async () => {
                  if (!selectedItem) return;
                  setPreview(null);
                  setSavedId(null);
                  const query = new URLSearchParams({
                    action: "item",
                    notebookId,
                    itemId: selectedItem.id,
                    kind: selectedItem.kind,
                  });
                  setPreview(await request<Preview>(`?${query}`));
                })
              }
            >
              {busy ? "처리 중…" : "선택한 원문 열기"}
            </Button>
          </div>
        )}
      </section>
      {busy && <p role="status">불러오는 중…</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {preview && (
        <section
          ref={previewPanel}
          className="scroll-mt-6 space-y-4 rounded-2xl border p-6"
        >
          <h2 className="text-lg font-semibold">
            {preview.title || "제목 없음"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {preview.kind === "report"
              ? "NotebookLM이 내보낸 Markdown 원문입니다."
              : "NotebookLM 노트의 텍스트 원문입니다."}{" "}
            공백·줄바꿈을 포함해 저장합니다.
          </p>
          <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 font-sans text-sm">
            {preview.text}
          </pre>
          {!savedId && (
            <Button
              disabled={busy || !canWrite}
              onClick={() =>
                perform(async () => {
                  const result = await request<{
                    document: Stored;
                    reused: boolean;
                  }>("", {
                    notebookId: preview.notebookId,
                    itemId: preview.itemId,
                    kind: preview.kind,
                    contentHash: preview.contentHash,
                  });
                  setSavedId(result.document.id);
                  setSaved((current) =>
                    [
                      result.document,
                      ...current.filter(
                        (item) => item.id !== result.document.id,
                      ),
                    ].slice(0, 100),
                  );
                  setMessage(
                    result.reused
                      ? "같은 원문이 이미 저장되어 있어 기존 저장본을 열었습니다."
                      : "원문 그대로 저장했습니다.",
                  );
                })
              }
            >
              원문 그대로 저장
            </Button>
          )}
          {savedId && (
            <div className="space-y-2">
              <p className="text-sm">
                저장된 원문입니다. 제작 화면에서는 별도의 대본 사본을
                편집합니다.
              </p>
              <Link
                className="inline-block underline"
                href={`/create?import=${savedId}`}
              >
                이 원문으로 제작용 대본 준비
              </Link>
            </div>
          )}
        </section>
      )}
      <section className="space-y-3 rounded-2xl border p-6">
        <h2 className="font-semibold">저장한 원문</h2>
        {saved.length === 0 && (
          <p className="text-sm text-muted-foreground">
            아직 저장한 원문이 없습니다.
          </p>
        )}
        {saved.map((item) => (
          <button
            key={item.id}
            className="block w-full text-left underline disabled:opacity-50"
            disabled={busy}
            onClick={() =>
              perform(async () => {
                setSelectedItem(null);
                setPreview(null);
                setSavedId(null);
                const document = await request<Stored>(
                  `?action=saved&id=${item.id}`,
                );
                setPreview({
                  notebookId: document.notebookId,
                  itemId: document.itemId,
                  kind: document.kind as "note" | "report",
                  title: document.title,
                  text: document.originalText,
                  contentHash: document.contentHash,
                });
                setSavedId(document.id);
              })
            }
          >
            {item.title || "제목 없음"} ·{" "}
            {new Date(item.importedAt).toLocaleString("ko-KR")}
          </button>
        ))}
      </section>
      <Link href="/create" className="inline-block underline">
        제작 화면으로
      </Link>
    </main>
  );
}
