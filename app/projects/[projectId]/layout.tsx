// app/projects/[projectId]/layout.tsx
// 项目子页面布局 — 仅保留返回和版本历史，移除与侧边栏重复的横向导航

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { GitHistoryDialog } from "@/components/git-history-dialog";

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const projectId = params.projectId as string;
  const { setCurrentProjectId } = useAppStore();
  const [gitHistoryOpen, setGitHistoryOpen] = useState(false);

  useEffect(() => {
    setCurrentProjectId(projectId);
  }, [projectId, setCurrentProjectId]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 简洁顶部条：仅返回和版本 */}
      <div className="flex items-center h-9 px-3 border-b border-border bg-background shrink-0">
        <Link
          href="/"
          className="flex items-center gap-1 text-[12px] font-mono text-muted-foreground/60 hover:text-[#00cc66] transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          返回
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setGitHistoryOpen(true)}
            className="text-[11px] font-mono text-muted-foreground/60 hover:text-[#00aaff] transition-colors"
          >
            <History className="h-3 w-3 inline mr-1" />
            版本
          </button>
        </div>
      </div>

      {/* 子页面内容 */}
      <div className="flex-1 overflow-y-auto bg-background">{children}</div>

      {/* 版本历史对话框 */}
      <GitHistoryDialog
        open={gitHistoryOpen}
        onOpenChange={setGitHistoryOpen}
        projectId={projectId}
      />
    </div>
  );
}
