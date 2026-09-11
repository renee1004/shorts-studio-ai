"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  CURRENT_PHASE,
  isNavItemActive,
  primaryNavItems,
  advancedNavItems,
} from "@/components/product/nav-items";
import { SignOutButton } from "@/components/product/sign-out-button";

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
  const active = workspaces.find(
    (workspace) => workspace.id === activeWorkspaceId,
  );

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border/70 bg-sidebar lg:flex">
      <div className="border-b border-border/70 px-4 py-4">
        <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
          내 작업 공간
        </p>
        <p className="mt-1 truncate text-sm font-bold">{active?.name ?? "-"}</p>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {appMode === "demo" ? "체험 모드" : "영상 제작"}
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-0.5">
          {primaryNavItems.map((item) => {
            const locked = item.phase > CURRENT_PHASE;
            const isActive = isNavItemActive(pathname, item.href);

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
        <details
          className="mt-5"
          open={
            advancedNavItems.some((item) =>
              isNavItemActive(pathname, item.href),
            ) || undefined
          }
        >
          <summary className="cursor-pointer px-3 py-2 text-sm text-muted-foreground">
            고급 도구
          </summary>
          <ul>
            {advancedNavItems
              .filter((item) => item.phase <= CURRENT_PHASE)
              .map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"
                    aria-current={
                      isNavItemActive(pathname, item.href) ? "page" : undefined
                    }
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
          </ul>
        </details>
      </nav>

      <div className="border-t border-border/70 px-4 py-3">
        <p className="truncate text-[11px] text-muted-foreground">
          {userEmail}
        </p>
        <SignOutButton className="mt-1.5 block" />
      </div>
    </aside>
  );
}
