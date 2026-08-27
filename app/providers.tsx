// app/providers.tsx
// 全局 Provider 组合

"use client";

import React, { useEffect } from "react";
import { ThemeProvider } from "@/lib/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";

/** 迁移旧的 localStorage key 到新的命名空间 */
const LOCALSTORAGE_MIGRATIONS: [string, string][] = [
  ["storyforge-settings", "novelweaver-settings"],
  ["storyforge-app", "novelweaver-app"],
  ["storyforge-theme", "novelweaver-theme"],
];

export function Providers({ children }: { children: React.ReactNode }) {
  // 客户端启动时迁移旧 localStorage key
  useEffect(() => {
    try {
      for (const [oldKey, newKey] of LOCALSTORAGE_MIGRATIONS) {
        const val = localStorage.getItem(oldKey);
        if (val !== null && localStorage.getItem(newKey) === null) {
          localStorage.setItem(newKey, val);
          localStorage.removeItem(oldKey);
        }
      }
    } catch {}
  }, []);

  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
