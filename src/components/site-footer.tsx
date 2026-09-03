export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 py-8">
      <div className="mx-auto w-full max-w-6xl px-4 text-sm text-muted-foreground sm:px-6">
        <p className="text-balance-ko">
          이 가이드는 NotebookLM과 유튜브 정책이 자주 바뀐다는 점을 전제로 썼습니다. 화면에
          보이는 메뉴 이름이나 무료 플랜 한도가 다르면, 원문 도움말을 기준으로 삼으세요.
        </p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <a
            className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
            href="https://notebooklm.google.com"
            target="_blank"
            rel="noreferrer"
          >
            NotebookLM 열기
          </a>
          <a
            className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
            href="https://support.google.com/notebooklm"
            target="_blank"
            rel="noreferrer"
          >
            NotebookLM 도움말
          </a>
          <a
            className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
            href="https://support.google.com/youtube/answer/72851"
            target="_blank"
            rel="noreferrer"
          >
            유튜브 파트너 프로그램 조건
          </a>
        </p>
        <p className="mt-4 text-xs text-muted-foreground/70">
          진행 체크는 이 브라우저에만 저장됩니다. 서버로 전송되지 않습니다.
        </p>
      </div>
    </footer>
  );
}
