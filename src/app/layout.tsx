import type { Metadata } from "next";
import { Noto_Sans_KR, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ProgressProvider } from "@/lib/progress";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Toaster } from "@/components/ui/sonner";

const sans = Noto_Sans_KR({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "쇼츠 공장 · NotebookLM으로 무료 쇼츠 파이프라인 만들기",
    template: "%s · 쇼츠 공장",
  },
  description:
    "리서치부터 대본, 영상 생성까지 NotebookLM 하나로 끝내는 5단계 실행 가이드. 각 단계의 할 일과 복사해서 쓰는 프롬프트, 그리고 무료 플랜의 실제 제약까지 정리했습니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`dark ${sans.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ProgressProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          <Toaster position="bottom-center" />
        </ProgressProvider>
      </body>
    </html>
  );
}
