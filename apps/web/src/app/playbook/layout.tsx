import { ProgressProvider } from "@/lib/progress";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

/**
 * Playbook은 Phase 0 이전에 만든 수동 실행 가이드다.
 * 새 제품 IA와 섞이지 않도록 별도 레이아웃으로 분리해 두었고,
 * 렌더 파이프라인은 Phase 4 Video Factory에서 재사용한다.
 */
export default function PlaybookLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProgressProvider>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </ProgressProvider>
  );
}
