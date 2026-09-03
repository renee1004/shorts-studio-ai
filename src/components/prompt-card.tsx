"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Prompt } from "@/lib/content";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type CopyState = "idle" | "copied" | "error";

export function PromptCard({
  prompt,
  stepLabel,
  defaultOpen = false,
}: {
  prompt: Prompt;
  stepLabel?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt.body);
      setCopyState("copied");
      toast.success("프롬프트를 복사했습니다", {
        description: "NotebookLM 채팅창에 붙여넣으세요.",
      });
    } catch {
      setCopyState("error");
      setOpen(true);
      toast.error("복사가 차단됐습니다", {
        description: "아래 본문을 직접 선택해 복사하세요.",
      });
    } finally {
      setTimeout(() => setCopyState("idle"), 2000);
    }
  }

  return (
    <Card className="gap-0 overflow-hidden border-border/70 py-0">
      <CardHeader className="gap-2 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-mono text-[10px] tracking-wide">
            PROMPT
          </Badge>
          <h3 className="text-base font-bold">{prompt.title}</h3>
          {stepLabel && (
            <span className="text-xs text-muted-foreground">· {stepLabel}</span>
          )}
        </div>
        <p className="text-balance-ko text-sm text-muted-foreground">{prompt.purpose}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <Button size="sm" onClick={copy} className="font-semibold">
            {copyState === "copied" ? "복사됨" : copyState === "error" ? "복사 실패" : "복사하기"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? "본문 접기" : "본문 보기"}
          </Button>
        </div>
      </CardHeader>

      <CardContent
        className={cn(
          "border-t border-border/70 bg-secondary/25 px-0 py-0",
          open ? "block" : "hidden",
        )}
      >
        <pre className="max-h-96 overflow-auto px-5 py-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-foreground/90 select-all">
          {prompt.body}
        </pre>
      </CardContent>
    </Card>
  );
}
