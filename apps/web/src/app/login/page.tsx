import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { env } from "@/server/env";
import { DemoLoginForm } from "@/components/product/demo-login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect("/dashboard");

  const mode = env().AUTH_PROVIDER;

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-black">Shorts Intelligence OS</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        공개 시장 신호와 본인 채널 성과로 제작 우선순위를 정하는 운영 도구입니다. 지금은 Phase 1까지
        열려 있습니다.
      </p>

      {mode === "demo" ? (
        <DemoLoginForm />
      ) : (
        <p className="mt-6 rounded-xl border border-destructive/30 bg-destructive/[0.07] p-4 text-[13px] leading-relaxed">
          AUTH_PROVIDER=supabase로 설정돼 있습니다. SUPABASE_URL과 SUPABASE_ANON_KEY를 넣어야
          로그인할 수 있습니다. 키 없이 살펴보려면 AUTH_PROVIDER=demo로 두세요.
        </p>
      )}
    </div>
  );
}
