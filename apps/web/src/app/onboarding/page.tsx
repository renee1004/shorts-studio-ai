import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { listMyWorkspaces } from "@/server/context";
import { CreateWorkspaceForm } from "@/components/product/create-workspace-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  await requireUser();
  const workspaces = await listMyWorkspaces();
  if (workspaces.length > 0) redirect("/dashboard");

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-black">워크스페이스 만들기</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        모든 데이터는 워크스페이스 단위로 분리됩니다. 다른 워크스페이스의 데이터는 데이터베이스
        정책으로 차단됩니다.
      </p>
      <CreateWorkspaceForm />
    </div>
  );
}
