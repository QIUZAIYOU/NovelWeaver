// components/layout/theme-toggle.tsx
// 主题切换组件 - 支持浅色/深色/跟随系统

"use client";

import React, { useEffect, useState } from "react";
import { useTheme } from "@/lib/theme-provider";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  /** 是否折叠状态（只显示图标） */
  collapsed?: boolean;
}

export function ThemeToggle({ collapsed = false }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const getIcon = () => {
    if (!mounted) return <Sun className="h-4 w-4" />;
    if (theme === "light") return <Sun className="h-4 w-4" />;
    if (theme === "dark") return <Moon className="h-4 w-4" />;
    return <Monitor className="h-4 w-4" />;
  };

  const getLabel = () => {
    if (!mounted) return "主题";
    if (theme === "light") return "浅色";
    if (theme === "dark") return "深色";
    return "跟随系统";
  };

  return (
    <button
      onClick={cycleTheme}
      className={cn(
        "flex items-center gap-3 text-[13px] font-mono transition-colors duration-200",
        "text-muted-foreground/60 hover:text-foreground hover:bg-accent",
        collapsed ? "justify-center p-2" : "px-3 py-2 w-full",
      )}
      title={getLabel()}
      suppressHydrationWarning
    >
      <span className="shrink-0 text-muted-foreground/60">{getIcon()}</span>
      {!collapsed && <span suppressHydrationWarning>{getLabel()}</span>}
    </button>
  );
}
