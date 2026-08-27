// components/layout/mobile-sidebar.tsx
// 移动端侧边栏 — 抽屉式，带滑动手势

"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, PenTool, BookMarked, Share2, Globe, Bot, Sparkles,
  FileText, Archive, BarChart3, Settings, X, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAppStore } from "@/stores/app-store";

// ─── 类型 ───────────────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  matchPrefix?: boolean;
  needProject?: boolean;
  accent?: string;
}

// ─── 导航数据 ───────────────────────────────────────────────

const mainNavItems: NavItem[] = [
  { label: "首页", href: "/", icon: Home },
  { label: "创作空间", href: "/workspace", icon: PenTool, matchPrefix: true, needProject: true, accent: "text-emerald-500" },
  { label: "大纲", href: "/outline", icon: BookMarked, matchPrefix: true, needProject: true, accent: "text-amber-500" },
  { label: "时间线", href: "/timeline", icon: Clock, matchPrefix: true, needProject: true, accent: "text-rose-500" },
  { label: "图谱", href: "/graph", icon: Share2, matchPrefix: true, needProject: true, accent: "text-violet-500" },
  { label: "设定控制台", href: "/settings-console", icon: Globe, matchPrefix: true, needProject: true, accent: "text-sky-500" },
  { label: "智能协作", href: "/studio", icon: Bot, matchPrefix: true, needProject: true, accent: "text-indigo-500" },
  { label: "交付台", href: "/delivery", icon: FileText, matchPrefix: true, needProject: true, accent: "text-rose-500" },
  { label: "智能体工坊", href: "/agent-workshop", icon: Sparkles, matchPrefix: true, needProject: true, accent: "text-yellow-500" },
  { label: "档案工作台", href: "/archive-workshop", icon: Archive, matchPrefix: true, needProject: true, accent: "text-cyan-500" },
];

const bottomNavItems: NavItem[] = [
  { label: "统计", href: "/statistics", icon: BarChart3 },
  { label: "设置", href: "/settings", icon: Settings },
];

// ─── 组件 ───────────────────────────────────────────────────

export function MobileSidebar() {
  const pathname = usePathname();
  const {
    mobileSidebarOpen,
    setMobileSidebarOpen,
    currentProjectId,
    setSettingsOpen,
  } = useAppStore();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);

  const urlMatch = pathname.match(/^\/projects\/([^/]+)/);
  const projectId = urlMatch ? urlMatch[1] : currentProjectId;

  if (!mobileSidebarOpen) return null;

  const renderNavLink = (item: NavItem) => {
    let fullHref = item.href;
    let disabled = false;

    if (item.needProject) {
      if (projectId) {
        fullHref = `/projects/${projectId}${item.href}`;
      } else {
        disabled = true;
        fullHref = "#";
      }
    }

    const isActive = !disabled && (item.matchPrefix
      ? pathname.startsWith(fullHref)
      : pathname === fullHref);

    if (disabled) {
      return (
        <div
          key={item.href}
          className="flex items-center gap-3 px-3 py-2 text-[13px] font-mono text-muted-foreground/60 cursor-not-allowed"
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span>{item.label}</span>
        </div>
      );
    }

    return (
      <Link
        key={item.href}
        href={fullHref}
        onClick={() => setMobileSidebarOpen(false)}
        className={cn(
          "flex items-center gap-3 px-3 py-2 text-[13px] font-mono transition-colors",
          "hover:bg-accent",
          isActive
            ? "bg-card text-[#00cc66] border-l-2 border-[#00cc66]"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span className={cn(
          "shrink-0",
          item.accent,
          isActive && item.accent,
          !item.accent && "text-muted-foreground/60",
        )}>
          <item.icon className="h-4 w-4" />
        </span>
        <span>{item.label}</span>
      </Link>
    );
  };

  // 触摸滑动处理
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (delta < -80) {
      setMobileSidebarOpen(false);
    }
  };

  return (
    <>
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 z-40 bg-black/40 md:hidden animate-in fade-in-0 backdrop-blur-sm"
        onClick={() => setMobileSidebarOpen(false)}
      />

      {/* 侧边栏面板 */}
      <aside
        ref={sidebarRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="fixed inset-y-0 left-0 z-50 w-72 bg-background border-r border-border md:hidden animate-in slide-in-from-left duration-300"
      >
        <div className="flex flex-col h-full">
          {/* Logo + 关闭按钮 */}
          <div className="flex items-center justify-between h-14 px-4 border-b border-border">
            <Link
              href="/"
              className="flex items-center gap-2.5"
              onClick={() => setMobileSidebarOpen(false)}
            >
              <div className="flex items-center justify-center w-8 h-8 border border-border text-[#00cc66]">
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="text-[13px] font-mono text-foreground tracking-tight">
                NovelWeaver
              </span>
            </Link>
            <button
              className="h-7 w-7 flex items-center justify-center text-muted-foreground/60 hover:text-foreground"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="关闭菜单"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 主导航 */}
          <nav className="flex-1 flex flex-col gap-0.5 p-3 overflow-y-auto">
            {mainNavItems.map(renderNavLink)}
          </nav>

          <div className="border-t border-border" />

          {/* 底部导航 */}
          <div className="flex flex-col gap-0.5 p-3">
            {bottomNavItems.map((item) =>
              item.label === "设置" ? (
                <button
                  key={item.href}
                  onClick={() => { setMobileSidebarOpen(false); setSettingsOpen(true); }}
                  className="flex items-center gap-3 px-3 py-2 text-[13px] font-mono transition-colors hover:bg-accent text-muted-foreground hover:text-foreground"
                >
                  <item.icon className="h-4 w-4 shrink-0 text-[#555]" />
                  <span>{item.label}</span>
                </button>
              ) : (
                renderNavLink(item)
              )
            )}
            <div className="flex items-center gap-3 px-3 py-2">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
