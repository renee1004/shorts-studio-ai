"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-24 text-center sm:px-6">
      <span className="font-mono text-sm tracking-widest text-destructive">ERROR</span>
      <h1 className="mt-4 text-balance-ko text-2xl font-black sm:text-3xl">
        화면을 그리다가 문제가 생겼습니다
      </h1>
      <p className="mt-3 text-balance-ko text-sm leading-relaxed text-muted-foreground">
        진행 체크는 브라우저에 저장되어 있으니 사라지지 않습니다. 다시 시도해 보세요.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-xs text-muted-foreground/70">
          digest: {error.digest}
        </p>
      )}
      <Button className="mt-7" onClick={reset}>
        다시 시도
      </Button>
    </div>
  );
}
