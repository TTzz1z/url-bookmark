import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "网址收藏夹",
    template: "%s · 网址收藏夹",
  },
  description: "本地优先的网址收藏、正文提取与 Markdown 阅读工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main">
          跳到主要内容
        </a>
        {children}
      </body>
    </html>
  );
}
