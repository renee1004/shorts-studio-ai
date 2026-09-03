"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Prompt } from "@/lib/content";
import { steps } from "@/lib/content";
import { PromptCard } from "@/components/prompt-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LibraryPrompt = Prompt & { stepSlug: string; stepTitle: string; stepOrder: number };

export function PromptLibrary({ prompts }: { prompts: LibraryPrompt[] }) {
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return prompts.filter((prompt) => {
      const matchesStep = filter === "all" || prompt.stepSlug === filter;
      const matchesQuery =
        needle.length === 0 ||
        prompt.title.toLowerCase().includes(needle) ||
        prompt.purpose.toLowerCase().includes(needle) ||
        prompt.body.toLowerCase().includes(needle);
      return matchesStep && matchesQuery;
    });
  }, [prompts, filter, query]);

  return (
    <div>
      <div className="space-y-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="프롬프트 검색 (예: 대본, 니치, 후크)"
          aria-label="프롬프트 검색"
          className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/40"
        />

        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            전체 {prompts.length}
          </FilterChip>
          {steps.map((step) => (
            <FilterChip
              key={step.slug}
              active={filter === step.slug}
              onClick={() => setFilter(step.slug)}
            >
              {step.order}단계 {step.prompts.length}
            </FilterChip>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border py-16 text-center">
          <p className="text-base font-bold">검색 결과가 없습니다</p>
          <p className="mx-auto mt-2 max-w-sm text-balance-ko text-sm text-muted-foreground">
            &lsquo;{query}&rsquo; 와 일치하는 프롬프트를 찾지 못했습니다. 검색어를 지우거나 다른
            단계를 골라보세요.
          </p>
          <Button
            variant="outline"
            className="mt-5"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            조건 초기화
          </Button>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {visible.map((prompt) => (
            <li key={prompt.id}>
              <PromptCard
                prompt={prompt}
                stepLabel={`${prompt.stepOrder}단계 ${prompt.stepTitle}`}
              />
              <p className="mt-1.5 pl-1 text-xs text-muted-foreground">
                <Link
                  href={`/steps/${prompt.stepSlug}`}
                  className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
                >
                  이 프롬프트를 쓰는 단계로 이동
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "border-primary/45 bg-primary/15 text-primary"
          : "border-border/70 bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
