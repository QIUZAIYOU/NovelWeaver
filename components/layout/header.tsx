// components/layout/header.tsx
// 顶部栏 — 面包屑 + 项目类型标识 + 全局操作

"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Bell, Sparkles, Swords, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/app-store";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/** 从路径中提取项目 ID */
function getProjectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match ? match[1] : null;
}

/** 页面名映射（用于面包屑） */
const PAGE_NAMES: Record<string, string> = {
  projects: "项目",
  workspace: "创作空间",
  outline: "大纲",
  timeline: "时间线",
  characters: "角色",
  lore: "世界观",
  style: "文风",
  memory: "记忆",
  "error-archive": "错误归档",
  compiler: "汇编",
  archives: "档案",
  studio: "智能协作",
  agents: "智能体",
  "mcp-servers": "MCP 服务器",
  skills: "技能",
  delivery: "交付台",
  "agent-workshop": "智能体工坊",
  "archive-workshop": "档案工作台",
  "settings-console": "设定控制台",
  settings: "设置",
  statistics: "统计",
};

export function Header() {
  const pathname = usePathname();
  const {
    setMobileSidebarOpen,
    currentProjectType,
    currentProjectName,
    setCurrentProjectType,
    setCurrentProjectName,
    notifications,
    setNotificationOpen,
  } = useAppStore();
  const projectId = getProjectIdFromPath(pathname);
  const [projectName, setProjectNameLocal] = useState<string | null>(currentProjectName);
  const unreadCount = notifications.filter((n) => !n.read).length;

  // ── 面包屑 ──

  const breadcrumbSegments = (() => {
    if (pathname === "/") return [{ label: "首页" }];
    const segments = pathname.split("/").filter(Boolean);
    const crumbs: { label: string; isProject?: boolean }[] = [];

    for (const s of segments) {
      if (s === projectId && projectName) {
        crumbs.push({ label: projectName, isProject: true });
      } else if (s !== projectId) {
        crumbs.push({ label: PAGE_NAMES[s] || s });
      }
    }
    return crumbs;
  })();

  // ── 加载项目信息 ──

  useEffect(() => {
    if (!projectId) {
      setCurrentProjectType(null);
      setCurrentProjectName(null);
      return;
    }

    const fetchProjectType = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        const data = await res.json();
        if (data.success) {
          setCurrentProjectType(data.data.type);
          setCurrentProjectName(data.data.name);
          setProjectNameLocal(data.data.name);
        }
      } catch {
        // 静默
      }
    };

    fetchProjectType();
  }, [projectId, setCurrentProjectType, setCurrentProjectName]);

  return (
    <header className="flex items-center h-10 px-3 border-b border-border bg-background">
      {/* 移动端菜单按钮 */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden mr-2 h-7 w-7 text-muted-foreground"
        onClick={() => setMobileSidebarOpen(true)}
        aria-label="打开菜单"
      >
        <Menu className="h-3.5 w-3.5" />
      </Button>

      {/* 面包屑 */}
      <nav className="flex items-center gap-1 text-[12px] font-mono min-w-0">
        {breadcrumbSegments.map((crumb, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <span className="text-muted-foreground/50">/</span>
            )}
            <span
              className={cn(
                "truncate max-w-[160px]",
                i === breadcrumbSegments.length - 1
                  ? "text-foreground"
                  : "text-muted-foreground/70",
                crumb.isProject && "text-[#00cc66]",
              )}
            >
              {crumb.label}
            </span>
          </React.Fragment>
        ))}

        {/* 项目类型标签 */}
        {projectId && currentProjectType && (
          <span className="ml-2 text-[10px] font-mono text-muted-foreground/60 border border-border px-1">
            {currentProjectType === "trpg" ? "跑团" : "小说"}
          </span>
        )}
      </nav>

      {/* 右侧操作区 */}
      <div className="ml-auto flex items-center gap-1">
        <button
          className="h-6 w-6 flex items-center justify-center text-muted-foreground/60 hover:text-[#00cc66] transition-colors relative"
          onClick={() => setNotificationOpen(true)}
          aria-label="通知"
        >
          <Bell className="h-3.5 w-3.5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-3.5 min-w-[14px] flex items-center justify-center bg-[#00cc66] text-[#0a0a0a] text-[8px] font-bold rounded-full px-0.5">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
