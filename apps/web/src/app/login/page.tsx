import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth";
import { env } from "@/server/env";
import { DemoLoginForm } from "@/components/product/demo-login-form";
import { EmailLoginForm } from "@/components/product/email-login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect("/dashboard");

  const mode = env().AUTH_PROVIDER;

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4">
      <h1 className="text-2xl font-black">Shorts Intelligence OS</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        주제 발굴부터 자료 조사, 대본 작성, 영상 합성까지 한곳에서 작업하세요.
      </p>

      {mode === "demo" ? (
        <DemoLoginForm />
      ) : (
        <EmailLoginForm />
      )}
    </div>
  );
}
