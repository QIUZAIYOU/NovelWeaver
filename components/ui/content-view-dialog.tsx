// components/ui/content-view-dialog.tsx
// 通用内容查看弹窗 — 居中显示内容，右侧可悬浮操作按钮

"use client";

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface ContentViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 标题行内容（可包含图标、徽章等） */
  title: React.ReactNode;
  /** 主体内容（可滚动） */
  children: React.ReactNode;
  /** 悬浮在弹窗右侧外部的操作按钮 */
  actions?: React.ReactNode;
}

export function ContentViewDialog({
  open,
  onOpenChange,
  title,
  children,
  actions,
}: ContentViewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <div className="relative flex flex-col flex-1 min-h-0">
          <DialogHeader className="px-6 pt-5 pb-3 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              {title}
            </DialogTitle>
            <DialogDescription className="sr-only">内容查看弹窗</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
            {children}
          </div>

          {/* 悬浮操作按钮 — 弹窗右侧外部 */}
          {actions && (
            <div className="hidden lg:flex flex-col absolute left-full top-0 ml-3 gap-1.5">
              {actions}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
