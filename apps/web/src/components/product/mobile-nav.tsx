"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CURRENT_PHASE, isNavItemActive, navItems } from "@/components/product/nav-items";

/** 사이드바는 lg 이상에서만 보이므로 작은 화면에는 가로 스크롤 메뉴를 준다. */
export function ProductMobileNav() {
  const pathname = usePathname();
  const available = navItems.filter((item) => item.phase <= CURRENT_PHASE);

  return (
    <nav
      aria-label="주요 메뉴"
      className="overflow-x-auto border-b border-border/70 bg-background/85 backdrop-blur-xl lg:hidden"
    >
      <ul className="flex w-max gap-1 px-3 py-2">
        {available.map((item) => {
          const isActive = isNavItemActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "block whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] transition-colors",
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
  );
}
