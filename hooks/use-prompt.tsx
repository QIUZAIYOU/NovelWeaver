// hooks/use-prompt.tsx
// 模态输入弹窗 Hook — 替代浏览器原生 prompt()

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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PromptOptions {
  title?: string;
  description?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  placeholder?: string;
}

export function usePrompt() {
  const [open, setOpen] = useState(false);
  const [resolver, setResolver] = useState<((value: string | null) => void) | null>(null);
  const [options, setOptions] = useState<PromptOptions>({});
  const [value, setValue] = useState("");

  const prompt = useCallback((opts: PromptOptions = {}): Promise<string | null> => {
    setOptions(opts);
    setValue(opts.defaultValue ?? "");
    setOpen(true);
    return new Promise<string | null>((resolve) => {
      setResolver(() => resolve);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setOpen(false);
    resolver?.(value);
  }, [resolver, value]);

  const handleCancel = useCallback(() => {
    setOpen(false);
    resolver?.(null);
  }, [resolver]);

  const PromptDialog = (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); resolver?.(null); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{options.title ?? "输入"}</DialogTitle>
          {options.description && <DialogDescription>{options.description}</DialogDescription>}
        </DialogHeader>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={options.placeholder}
          className="h-9 text-sm"
          onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
          autoFocus
        />
        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={handleCancel}>
            {options.cancelText ?? "取消"}
          </Button>
          <Button size="sm" onClick={handleConfirm}>
            {options.confirmText ?? "确定"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { prompt, PromptDialog };
}
