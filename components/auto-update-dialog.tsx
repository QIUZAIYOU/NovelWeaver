// components/auto-update-dialog.tsx
// 分析新增确认弹窗 — 预览 AI 分析出的角色/世界观变更，确认后写入数据库

"use client";

import React, { useState, useCallback } from "react";
import { Loader2, Sparkles, CheckCircle2, User, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

interface AnalysisItem {
  name: string;
  action: string;
  age?: string;
  personality?: string;
  appearance?: string;
  backstory?: string;
  persona?: string;
  title?: string;
  content?: string;
  category?: string;
}

interface AutoUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 预览数据（AI 分析结果） */
  previewData: { characters: AnalysisItem[]; lore: AnalysisItem[] } | null;
  /** 正在分析中 */
  analyzing: boolean;
  /** 确认应用 */
  onConfirm: () => void;
  /** AI 自动补全回调 */
  onAutoComplete?: (type: "character" | "lore", name: string, currentData: Record<string, string>) => Promise<Record<string, string> | null>;
}

export function AutoUpdateDialog({
  open,
  onOpenChange,
  previewData,
  analyzing,
  onConfirm,
  onAutoComplete,
}: AutoUpdateDialogProps) {
  const [applying, setApplying] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  // 本地编辑的数据（允许用户在确认前修改）
  const [editedChars, setEditedChars] = useState<Record<string, Record<string, string>>>({});
  const [editedLore, setEditedLore] = useState<Record<string, Record<string, string>>>({});

  // 重置编辑状态
  React.useEffect(() => {
    if (open) {
      setApplying(false);
      setCompleting(null);
      setEditedChars({});
      setEditedLore({});
    }
  }, [open]);

  const handleConfirm = async () => {
    setApplying(true);
    try {
      await onConfirm();
    } finally {
      setApplying(false);
    }
  };

  const getCharData = (name: string, field: string): string => {
    if (editedChars[name]?.[field] !== undefined) return editedChars[name][field];
    const item = previewData?.characters.find(c => c.name === name);
    if (!item) return "";
    // 安全访问 AnalysisItem 的任何字段
    const val = (item as any)?.[field];
    return typeof val === "string" ? val : "";
  };

  const getLoreData = (title: string, field: string): string => {
    if (editedLore[title]?.[field] !== undefined) return editedLore[title][field];
    const item = previewData?.lore.find(l => l.title === title);
    if (!item) return "";
    const val = (item as any)?.[field];
    return typeof val === "string" ? val : "";
  };

  const updateCharField = (name: string, field: string, value: string) => {
    setEditedChars(prev => ({
      ...prev,
      [name]: { ...prev[name], [field]: value },
    }));
  };

  const updateLoreField = (title: string, field: string, value: string) => {
    setEditedLore(prev => ({
      ...prev,
      [title]: { ...prev[title], [field]: value },
    }));
  };

  const handleAutoComplete = async (type: "character" | "lore", name: string) => {
    if (!onAutoComplete || completing) return;
    setCompleting(name);
    try {
      const currentData: Record<string, string> = type === "character"
        ? { age: getCharData(name, "age"), personality: getCharData(name, "personality"), appearance: getCharData(name, "appearance"), backstory: getCharData(name, "backstory"), persona: getCharData(name, "persona") }
        : { content: getLoreData(name, "content"), category: getLoreData(name, "category") };
      const result = await onAutoComplete(type, name, currentData);
      if (result) {
        if (type === "character") {
          setEditedChars(prev => ({ ...prev, [name]: { ...prev[name], ...result } }));
        } else {
          setEditedLore(prev => ({ ...prev, [name]: { ...prev[name], ...result } }));
        }
        toast({ title: "AI 补全完成" });
      }
    } catch {
      toast({ title: "AI 补全失败", variant: "destructive" });
    } finally {
      setCompleting(null);
    }
  };

  const hasData = previewData && (previewData.characters.length > 0 || previewData.lore.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0">
          <DialogTitle>分析新增内容</DialogTitle>
          <DialogDescription>AI 从故事正文中识别出以下待新增或更新的内容</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">
          {analyzing ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
              <p className="text-sm text-muted-foreground">AI 正在分析故事内容...</p>
            </div>
          ) : !hasData ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Sparkles className="h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">未发现需要新增或更新的内容</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
            </div>
          ) : (
            <>
              {/* 角色列表 */}
              {previewData.characters.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <User className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm font-medium">角色（{previewData.characters.length}）</span>
                  </div>
                  <div className="space-y-2">
                    {previewData.characters.map((char) => (
                      <div key={char.name} className="border border-border rounded p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant={char.action === "create" ? "default" : "secondary"} className="text-[10px]">
                              {char.action === "create" ? "新建" : "更新"}
                            </Badge>
                            <span className="text-sm font-medium">{char.name}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs gap-1"
                            disabled={completing === char.name}
                            onClick={() => handleAutoComplete("character", char.name)}
                          >
                            {completing === char.name ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Sparkles className="h-3 w-3" />
                            )}
                            AI 补全
                          </Button>
                        </div>
                        <div className="space-y-1.5">
                          {["age", "personality", "appearance", "backstory", "persona"].map((field) => {
                            const labels: Record<string, string> = { age: "年龄", personality: "性格", appearance: "外貌", backstory: "背景", persona: "说话风格" };
                            const val = getCharData(char.name, field);
                            return (
                              <div key={field} className="flex items-start gap-2">
                                <span className="text-xs text-muted-foreground/60 w-14 shrink-0 pt-1">{labels[field]}</span>
                                <input
                                  className="flex-1 bg-transparent border-b border-border/30 px-1 py-0.5 text-sm outline-none focus:border-primary transition-colors"
                                  value={val}
                                  onChange={(e) => updateCharField(char.name, field, e.target.value)}
                                  placeholder="（空）"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {previewData.characters.length > 0 && previewData.lore.length > 0 && <Separator />}

              {/* 世界观列表 */}
              {previewData.lore.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="h-4 w-4 text-violet-500" />
                    <span className="text-sm font-medium">世界观词条（{previewData.lore.length}）</span>
                  </div>
                  <div className="space-y-2">
                    {previewData.lore.map((entry) => (
                      <div key={entry.title} className="border border-border rounded p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant={(entry as any).action === "update" ? "secondary" : "default"} className="text-[10px]">
                              {(entry as any).action === "update" ? "更新" : "新增"}
                            </Badge>
                            <span className="text-sm font-medium">{entry.title}</span>
                            <span className="text-[10px] text-muted-foreground/60">{entry.category}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs gap-1"
                            disabled={completing === (entry.title || "")}
                            onClick={() => handleAutoComplete("lore", entry.title || "")}
                          >
                            {completing === entry.title ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Sparkles className="h-3 w-3" />
                            )}
                            AI 补全
                          </Button>
                        </div>
                        <Textarea
                          value={getLoreData(entry.title || "", "content")}
                          onChange={(e) => updateLoreField(entry.title || "", "content", e.target.value)}
                          rows={3}
                          className="text-sm"
                          placeholder="词条内容..."
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t border-border shrink-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={applying}>
            取消
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={analyzing || !hasData || applying} className="gap-1.5">
            {applying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {applying ? "更新中..." : "确认更新"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
