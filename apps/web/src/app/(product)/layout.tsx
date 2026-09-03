import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/server/auth";
import { listMyWorkspaces } from "@/server/context";
import { env } from "@/server/env";
import { ProductSidebar } from "@/components/product/sidebar";

export default async function ProductLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const workspaces = await listMyWorkspaces();
  if (workspaces.length === 0) redirect("/onboarding");

  const active = workspaces[0]!;

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
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{active.name}</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {active.role} · {active.timezone} · {env().APP_MODE === "demo" ? "Demo Mode" : "Live"}
            </p>
          </div>
          <Link
            href="/playbook"
            className="shrink-0 text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
          >
            Playbook
          </Link>
        </header>
        <div className="px-4 py-6 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
