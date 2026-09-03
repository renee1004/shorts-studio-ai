"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * 스펙 8.1의 11개 메뉴.
 * Phase에 포함되지 않은 메뉴는 가짜 화면 대신 활성화 조건을 보여준다.
 */
const menu = [
  { label: "Dashboard", href: "/dashboard", phase: 0 },
  { label: "Niche Radar", href: "/radar/niches", phase: 1 },
  { label: "Topic Radar", href: "/radar/topics", phase: 1 },
  { label: "Research", href: "/research", phase: 2 },
  { label: "DNA Library", href: "/dna", phase: 3 },
  { label: "Content Studio", href: "/studio", phase: 3 },
  { label: "Video Factory", href: "/factory", phase: 4 },
  { label: "Publish Queue", href: "/publish", phase: 5 },
  { label: "Analytics", href: "/analytics", phase: 6 },
  { label: "Learning", href: "/learning", phase: 6 },
  { label: "Settings", href: "/settings", phase: 0 },
] as const;

const CURRENT_PHASE = 1;

export function ProductSidebar({
  workspaces,
  activeWorkspaceId,
  appMode,
  userEmail,
}: {
  workspaces: { id: string; name: string; role: string }[];
  activeWorkspaceId: string;
  appMode: "demo" | "live";
  userEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const active = workspaces.find((workspace) => workspace.id === activeWorkspaceId);

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border/70 bg-sidebar lg:flex">
      <div className="border-b border-border/70 px-4 py-4">
        <p className="font-mono text-[10px] tracking-widest text-muted-foreground">WORKSPACE</p>
        <p className="mt-1 truncate text-sm font-bold">{active?.name ?? "-"}</p>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {appMode === "demo" ? "DEMO MODE · 외부 키 없음" : "LIVE"}
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-0.5">
          {menu.map((item) => {
            const locked = item.phase > CURRENT_PHASE;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

            if (locked) {
              return (
                <li key={item.href}>
                  <div
                    className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground/50"
                    title={`Phase ${item.phase}에서 열립니다.`}
                  >
                    {item.label}
                    <span className="font-mono text-[10px]">P{item.phase}</span>
                  </div>
                </li>
              );
            }

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary/15 font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border/70 px-4 py-3">
        <p className="truncate text-[11px] text-muted-foreground">{userEmail}</p>
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/v1/auth/demo-session", { method: "DELETE" });
            router.push("/login");
            router.refresh();
          }}
          className="mt-1.5 text-[11px] text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
        >
          세션 종료
        </button>
      </div>
    </aside>
  );
}
