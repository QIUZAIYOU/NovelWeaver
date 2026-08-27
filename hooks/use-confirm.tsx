// hooks/use-confirm.ts
// 确认弹窗 Hook - 替代浏览器默认 confirm()

"use client";

import React, { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface ConfirmOptions {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "destructive" | "default";
  icon?: React.ReactNode;
}

export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null);
  const [options, setOptions] = useState<ConfirmOptions>({});

  const confirm = useCallback((opts: ConfirmOptions = {}): Promise<boolean> => {
    setOptions({
      title: opts.title ?? "确认操作",
      description: opts.description ?? "确定要执行此操作吗？",
      confirmText: opts.confirmText ?? "确定",
      cancelText: opts.cancelText ?? "取消",
      variant: opts.variant ?? "destructive",
      icon: opts.icon,
    });
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setOpen(false);
    resolver?.(true);
  }, [resolver]);

  const handleCancel = useCallback(() => {
    setOpen(false);
    resolver?.(false);
  }, [resolver]);

  const ConfirmDialog = (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); resolver?.(false); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {options.icon ?? <AlertTriangle className="h-6 w-6 text-destructive shrink-0" />}
            <div>
              <DialogTitle>{options.title}</DialogTitle>
              <DialogDescription>{options.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" onClick={handleCancel} size="sm">
            {options.cancelText}
          </Button>
          <Button variant={options.variant} onClick={handleConfirm} size="sm">
            {options.confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirm, ConfirmDialog };
}
