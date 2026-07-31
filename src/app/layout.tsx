import type { Metadata } from "next";
import { Inter, Noto_Serif_SC } from "next/font/google";
import { AppProviders } from "@/components/app-providers";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "网址收藏夹",
    template: "%s · 网址收藏夹",
  },
  description: "本地优先的网址收藏、正文提取与 Markdown 阅读工具",
};

// 在首次绘制前同步解析主题，避免浅色样式闪一帧后再切到深色。
const themeBootstrap = `(function(){try{var p=localStorage.getItem("bookmark-theme");var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="light";}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${sans.variable} ${serif.variable}`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          跳到主要内容
        </a>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
