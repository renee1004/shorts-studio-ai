"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useProgress } from "@/lib/progress";
import { decodeProgress, encodeProgress } from "@/lib/progress-code";
import { Button } from "@/components/ui/button";

export function ProgressTransfer() {
  const { doneIds, replace, ready, overall } = useProgress();
  const params = useSearchParams();
  const [input, setInput] = useState("");
  const [invalid, setInvalid] = useState(false);

  const incoming = params.get("p");
  const code = ready ? encodeProgress(doneIds) : null;

  function apply(rawCode: string) {
    const ids = decodeProgress(rawCode);
    if (!ids) {
      setInvalid(true);
      return;
    }
    replace(ids);
    setInput("");
    setInvalid(false);
    toast.success("진행 상황을 불러왔습니다", {
      description: `체크된 항목 ${ids.length}개를 이 기기에 적용했습니다.`,
    });
  }

  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.error("복사가 차단됐습니다. 코드를 직접 선택해 복사하세요.");
    }
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6">
      <h2 className="text-lg font-bold">기기 바꿔서 이어 하기</h2>
      <p className="mt-2 text-balance-ko text-sm leading-relaxed text-muted-foreground">
        체크는 기기별로 따로 저장됩니다. 이 코드를 다른 기기에 붙여넣으면 진행 상황이 그대로
        넘어갑니다. 계정도, 서버 저장도 없습니다.
      </p>

      {incoming && (
        <div className="mt-4 rounded-xl border border-primary/35 bg-primary/[0.08] p-4">
          <p className="text-balance-ko text-[13px] leading-relaxed">
            이 링크에 진행 상황 코드가 담겨 있습니다. 지금 기기의 체크를 링크 내용으로 바꿉니다.
          </p>
          <Button className="mt-3 h-8 px-3 text-xs" onClick={() => apply(incoming)}>
            링크에서 불러오기
          </Button>
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <span className="font-mono text-[11px] tracking-widest text-muted-foreground">
            이 기기의 코드
          </span>
          <p className="mt-2 rounded-xl border border-border/70 bg-secondary/30 px-3.5 py-2.5 font-mono text-sm break-all select-all">
            {code ?? "불러오는 중"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs"
              disabled={!code}
              onClick={() => code && copy(code, "코드를 복사했습니다")}
            >
              코드 복사
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-3 text-xs"
              disabled={!code}
              onClick={() =>
                code &&
                copy(
                  `${window.location.origin}/?p=${code}`,
                  "링크를 복사했습니다. 다른 기기에서 열면 됩니다.",
                )
              }
            >
              링크로 복사
            </Button>
          </div>
          {ready && overall.done === 0 && (
            <p className="mt-2 text-[12px] text-muted-foreground">
              아직 체크한 항목이 없어서 빈 코드입니다.
            </p>
          )}
        </div>

        <div>
          <label className="block">
            <span className="font-mono text-[11px] tracking-widest text-muted-foreground">
              다른 기기의 코드 붙여넣기
            </span>
            <input
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setInvalid(false);
              }}
              placeholder="SF1..."
              spellCheck={false}
              aria-invalid={invalid}
              className="mt-2 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 font-mono text-sm outline-none transition-colors focus-visible:border-primary/60 aria-invalid:border-destructive/60"
            />
          </label>
          <Button
            size="sm"
            className="mt-2 h-8 px-3 text-xs"
            disabled={input.trim() === ""}
            onClick={() => apply(input)}
          >
            불러오기
          </Button>
          {invalid && (
            <p className="mt-2 text-balance-ko text-[12px] text-destructive">
              코드를 읽을 수 없습니다. SF1로 시작하는 코드 전체를 붙여넣었는지 확인해 주세요.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
