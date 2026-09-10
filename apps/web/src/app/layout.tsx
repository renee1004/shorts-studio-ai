import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: {
    default: "Shorts Intelligence OS",
    template: "%s · Shorts Intelligence OS",
  },
  description:
    "공개 시장 신호와 본인 채널 성과를 모아 제작 가치가 높은 Shorts 주제를 추천하고, 근거 기반 기획과 성과 학습을 연결하는 운영 도구입니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      className="dark h-full antialiased"
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
