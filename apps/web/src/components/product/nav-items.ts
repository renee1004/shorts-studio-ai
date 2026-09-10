/**
 * 스펙 8.1의 메뉴. Phase에 포함되지 않은 메뉴는 가짜 화면 대신 활성화 조건을 보여준다.
 * 사이드바(데스크톱)와 상단 바(모바일)가 같은 목록을 쓴다.
 */
export const navItems = [
  { label: "새 영상 만들기", href: "/create", phase: 0 },
  { label: "Dashboard", href: "/dashboard", phase: 0 },
  { label: "Niche Radar", href: "/radar/niches", phase: 1 },
  { label: "Topic Radar", href: "/radar/topics", phase: 1 },
  { label: "Runs", href: "/runs", phase: 1 },
  { label: "Research", href: "/research", phase: 2 },
  { label: "DNA Library", href: "/dna", phase: 3 },
  { label: "내 작업함", href: "/studio", phase: 3 },
  { label: "Video Factory", href: "/factory", phase: 4 },
  { label: "Publish Queue", href: "/publish", phase: 5 },
  { label: "Analytics", href: "/analytics", phase: 6 },
  { label: "Learning", href: "/learning", phase: 6 },
  { label: "기본 설정", href: "/settings", phase: 0 },
] as const;

/** Content Studio(Phase 3)와 Video Factory(Phase 4)까지 열려 있다. */
export const CURRENT_PHASE = 4;

export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const primaryNavItems = navItems.filter((item) =>
  ["/create", "/studio", "/settings"].includes(item.href),
);
export const advancedNavItems = navItems.filter(
  (item) => !["/create", "/studio", "/settings"].includes(item.href),
);
