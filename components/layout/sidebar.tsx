// components/layout/sidebar.tsx
// 左侧导航栏 — 可折叠，支持响应式，带图标色彩标识

"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, PenTool, BookMarked, Share2, Globe, Bot, Sparkles,
  FileText, Archive, BarChart3, Settings, ChevronLeft, ChevronRight, Clock,
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
  /** 导航项图标色彩 (Tailwind text class) */
  accent?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// ─── 导航数据 ───────────────────────────────────────────────

const navGroups: NavGroup[] = [
  {
    label: "创作",
    items: [
      { label: "创作空间", href: "/workspace", icon: PenTool, matchPrefix: true, needProject: true, accent: "text-emerald-500" },
      { label: "大纲", href: "/outline", icon: BookMarked, matchPrefix: true, needProject: true, accent: "text-amber-500" },
      { label: "时间线", href: "/timeline", icon: Clock, matchPrefix: true, needProject: true, accent: "text-rose-500" },
      { label: "图谱", href: "/graph", icon: Share2, matchPrefix: true, needProject: true, accent: "text-violet-500" },
    ],
  },
  {
    label: "设定",
    items: [
      { label: "设定控制台", href: "/settings-console", icon: Globe, matchPrefix: true, needProject: true, accent: "text-sky-500" },
    ],
  },
  {
    label: "智能体",
    items: [
      { label: "智能协作", href: "/studio", icon: Bot, matchPrefix: true, needProject: true, accent: "text-indigo-500" },
      { label: "交付台", href: "/delivery", icon: FileText, matchPrefix: true, needProject: true, accent: "text-rose-500" },
      { label: "智能体工坊", href: "/agent-workshop", icon: Sparkles, matchPrefix: true, needProject: true, accent: "text-yellow-500" },
    ],
  },
  {
    label: "文档",
    items: [
      { label: "档案工作台", href: "/archive-workshop", icon: Archive, matchPrefix: true, needProject: true, accent: "text-cyan-500" },
    ],
  },
];

const bottomNavItems: NavItem[] = [
  { label: "统计", href: "/statistics", icon: BarChart3 },
  { label: "设置", href: "/settings", icon: Settings },
];

// ─── 工具 ───────────────────────────────────────────────────

function useProjectId(): string | null {
  const pathname = usePathname();
  const { currentProjectId } = useAppStore();
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match ? match[1] : currentProjectId;
}

// ─── NavLink 组件 ────────────────────────────────────────────

function NavLink({
  item, collapsed, projectId,
}: {
  item: NavItem; collapsed: boolean; projectId: string | null;
}) {
  const pathname = usePathname();

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

  // ── 禁用态 ──
  if (disabled) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2 text-[13px] font-mono",
          "text-muted-foreground/60 cursor-not-allowed",
          collapsed && "justify-center px-2",
        )}
        title={collapsed ? `${item.label}（请先选择项目）` : undefined}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </div>
    );
  }

  return (
    <Link
      href={fullHref}
      className={cn(
        "group flex items-center gap-3 px-3 py-2 text-[13px] font-mono transition-colors duration-200",
        "hover:bg-accent",
        isActive
          ? "bg-card text-[#00cc66] border-l-2 border-[#00cc66]"
          : "text-muted-foreground hover:text-foreground",
        collapsed && "justify-center px-2 border-l-0",
      )}
      title={collapsed ? item.label : undefined}
    >
      <span className={cn(
        "shrink-0 transition-colors duration-200",
        item.accent,
        isActive && item.accent,
        !item.accent && "text-muted-foreground/60",
      )}>
        <item.icon className="h-4 w-4" />
      </span>
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

// ─── Sidebar 主组件 ─────────────────────────────────────────

export function Sidebar() {
  const { sidebarOpen, toggleSidebar, setSettingsOpen } = useAppStore();
  const projectId = useProjectId();

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-screen border-r border-border bg-background transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        sidebarOpen ? "w-60" : "w-16",
      )}
    >
      {/* ── Logo 区域 ── */}
      <div className={cn(
        "flex items-center h-14 border-b border-border",
        sidebarOpen ? "px-4" : "px-0 justify-center",
      )}>
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 bg-background border border-border text-[#00cc66]">
            <Sparkles className="h-4 w-4" />
          </div>
          {sidebarOpen && (
            <span className="text-[13px] font-mono text-foreground tracking-tight">
              NovelWeaver
            </span>
          )}
        </Link>
      </div>

      {/* ── 导航分组 ── */}
      <nav className="flex-1 flex flex-col p-2 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-1.5">
            {sidebarOpen && (
              <p className="px-3 py-1 text-[10px] font-mono text-muted-foreground/60 uppercase tracking-[0.12em] select-none">
                {group.label}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} collapsed={!sidebarOpen} projectId={projectId} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── 底部 ── */}
      <div className="flex flex-col gap-0.5 p-2 border-t border-border">
        {bottomNavItems.map((item) =>
          item.label === "设置" ? (
            <button
              key={item.href}
              onClick={() => setSettingsOpen(true)}
              className={cn(
                "group flex items-center gap-3 px-3 py-2 text-[13px] font-mono transition-colors duration-200",
                "hover:bg-accent text-muted-foreground hover:text-foreground",
                !sidebarOpen && "justify-center px-2",
              )}
              title={!sidebarOpen ? item.label : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          ) : (
            <NavLink key={item.href} item={item} collapsed={!sidebarOpen} projectId={projectId} />
          )
        )}
        <ThemeToggle collapsed={!sidebarOpen} />
      </div>

      <Separator className="bg-sidebar-border/50" />

      {/* ── 折叠按钮 ── */}
      <div className="flex items-center justify-center p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className="h-7 w-full flex items-center justify-center text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all duration-200"
          aria-label={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
        >
          {sidebarOpen ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </div>
    </aside>
  );
}
