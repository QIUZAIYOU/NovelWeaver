// app/layout.tsx
// 根布局 - Sidebar + Header + 主内容区

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/app/providers";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { SettingsDialog } from "@/components/settings-dialog";
import { NotificationDrawer } from "@/components/layout/notification-drawer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NovelWeaver 织文 - 本地化 AI 创作平台",
  description:
    "为小说家和跑团玩家打造的 AI 辅助创作环境，深度结合世界观、角色与记忆管理。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        {/* 主题防闪脚本 — 在 React  hydration 前同步应用深色/浅色 class */}
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(){try{var e=localStorage.getItem("novelweaver-theme");if(!e||e==="system"){var t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.classList.add(t)}else document.documentElement.classList.add(e)}catch(e){}}();`,
          }}
        />
      </head>
      <body className="bg-background h-full overflow-hidden">
        <Providers>
          <div className="flex h-full">
            {/* 桌面端侧边栏 */}
            <Sidebar />

            {/* 移动端侧边栏 */}
            <MobileSidebar />

            {/* 主内容区 */}
            <div className="flex-1 flex flex-col min-w-0 h-full bg-background">
              <Header />
              <main className="flex-1 overflow-y-auto bg-background">{children}</main>
            </div>
          </div>
          <SettingsDialog />
          <NotificationDrawer />
        </Providers>
      </body>
    </html>
  );
}
