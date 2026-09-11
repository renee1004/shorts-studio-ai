import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/server/auth";
import { listMyWorkspaces } from "@/server/context";
import { env } from "@/server/env";
import { ProductSidebar } from "@/components/product/sidebar";
import { ProductMobileNav } from "@/components/product/mobile-nav";
import { SignOutButton } from "@/components/product/sign-out-button";

export default async function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const workspaces = await listMyWorkspaces();
  const active = workspaces[0];
  if (!active) redirect("/onboarding");

  return (
    <div className="flex min-h-full">
      <ProductSidebar
        workspaces={workspaces.map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          role: workspace.role,
        }))}
        activeWorkspaceId={active.id}
        appMode={env().APP_MODE}
        userEmail={user.email}
      />
      <div className="min-w-0 flex-1">
        {/* sticky 요소에 backdrop-filter를 걸면 소프트웨어 렌더링 환경에서 스크롤마다 블러를 다시 계산해 멈춘다. */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border/70 bg-background px-4 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{active.name}</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {env().APP_MODE === "demo" ? "체험 모드" : "나의 쇼츠 작업 공간"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <Link
              href="/playbook"
              className="text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
            >
              이용 안내
            </Link>
            <SignOutButton className="lg:hidden" />
          </div>
        </header>
        <ProductMobileNav />
        <div className="px-4 py-6 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
