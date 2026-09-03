"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/v1/auth/demo-session", { method: "DELETE" });
        router.push("/login");
        router.refresh();
      }}
      className={cn(
        "text-[11px] text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground",
        className,
      )}
    >
      세션 종료
    </button>
  );
}
