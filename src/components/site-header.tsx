"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProgress } from "@/lib/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "전체 흐름" },
  { href: "/steps/source-stack", label: "단계별 실행", match: "/steps" },
  { href: "/prompts", label: "프롬프트 모음" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { overall, ready, reset } = useProgress();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-8 w-6 items-center justify-center rounded-md bg-primary text-[11px] font-black text-primary-foreground">
            9:16
          </span>
          <span className="hidden text-sm font-bold tracking-tight sm:block">쇼츠 공장</span>
        </Link>

        <nav className="ml-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {navItems.map((item) => {
            const active = item.match
              ? pathname.startsWith(item.match)
              : pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex" aria-live="polite">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: ready ? `${overall.percent}%` : "0%" }}
              />
            </div>
            <span className="w-10 text-right font-mono text-xs text-muted-foreground">
              {ready ? `${overall.percent}%` : "··"}
            </span>
          </div>
          {ready && overall.done > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={reset}
            >
              초기화
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
