// components/git-history-dialog.tsx
// 版本历史对话框 - 显示 Git 提交历史并支持回滚

"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  History,
  GitBranch,
  RotateCcw,
  Clock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { formatRelativeTime } from "@/lib/utils";

import { useConfirm } from "@/hooks/use-confirm";

/** Git 提交记录类型 */
interface GitCommit {
  oid: string;
  message: string;
  author: {
    name: string;
    email: string;
    timestamp: number;
  };
  parentOids: string[];
}

/** Git 分支类型 */
interface GitBranchInfo {
  name: string;
  isCurrent: boolean;
  commitOid: string;
}

interface GitHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function GitHistoryDialog({
  open,
  onOpenChange,
  projectId,
}: GitHistoryDialogProps) {
  const [history, setHistory] = useState<GitCommit[]>([]);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [currentOid, setCurrentOid] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [confirmRollback, setConfirmRollback] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/git?maxCount=50`);
      const data = await res.json();
      if (data.success) {
        setHistory(data.data.history || []);
        setBranches(data.data.branches || []);
        setCurrentOid(data.data.currentOid);
        setProjectName(data.data.projectName);
      }
    } catch (err) {
      console.error("加载版本历史失败:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) loadHistory();
  }, [open, loadHistory]);

  /** 创建手动存档 */
  const handleCreateSavepoint = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/git`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "📌 手动存档" }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "存档已创建" });
        loadHistory();
      }
    } catch {
      toast({ title: "创建存档失败", variant: "destructive" });
    }
  };

  /** 回滚到指定版本 */
  const handleRollback = async (commitOid: string) => {
    setRollingBack(commitOid);
    try {
      const res = await fetch(`/api/projects/${projectId}/git/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commitOid }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: "回滚成功",
          description: data.data.message,
        });
        setConfirmRollback(null);
        loadHistory();
        // 提示用户刷新页面
        setTimeout(async () => {
          const shouldRefresh = await confirm({
            title: "回滚完成",
            description: "数据已回滚，是否刷新页面以加载最新状态？",
            confirmText: "刷新",
            cancelText: "稍后",
            variant: "default",
          });
          if (shouldRefresh) {
            window.location.reload();
          }
        }, 500);
      } else {
        toast({
          title: "回滚失败",
          description: data.error || "请稍后重试",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "回滚失败", variant: "destructive" });
    } finally {
      setRollingBack(null);
    }
  };

  /** 格式化时间戳 */
  const formatTimestamp = (ts: number): string => {
    const date = new Date(ts * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (hours < 24) {
      return `今天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
    }
    if (days < 7) {
      return `${days} 天前`;
    }
    return date.toLocaleDateString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  /** 提取提交消息类型 */
  const getCommitType = (msg: string): { label: string; color: string } => {
    if (msg.startsWith("🎬")) return { label: "初始", color: "bg-blue-500" };
    if (msg.startsWith("🔄") || msg.startsWith("⏪")) return { label: "回滚", color: "bg-amber-500" };
    if (msg.includes("📌")) return { label: "存档", color: "bg-green-500" };
    if (msg.includes("新增角色")) return { label: "角色", color: "bg-purple-500" };
    if (msg.includes("更新角色")) return { label: "角色", color: "bg-purple-500" };
    if (msg.includes("删除角色")) return { label: "角色", color: "bg-purple-500" };
    if (msg.includes("词条")) return { label: "知识库", color: "bg-teal-500" };
    if (msg.includes("记忆")) return { label: "记忆", color: "bg-orange-500" };
    if (msg.includes("消息") || msg.includes("回复")) return { label: "对话", color: "bg-indigo-500" };
    if (msg.includes("世界状态")) return { label: "状态", color: "bg-pink-500" };
    if (msg.includes("批量导入")) return { label: "导入", color: "bg-cyan-500" };
    return { label: "变更", color: "bg-gray-500" };
  };

  const currentCommit = history.find((c) => c.oid === currentOid);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            版本历史
          </DialogTitle>
          <DialogDescription>
            {projectName && `「${projectName}」的数据变更记录`}
          </DialogDescription>
        </DialogHeader>

        {/* 当前状态 + 操作栏 */}
        <div className="flex items-center justify-between py-2 px-3 bg-muted">
          <div className="flex items-center gap-2 text-sm">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {branches.filter((b) => b.isCurrent).map((b) => b.name).join(", ") || "main"}
            </span>
            {currentCommit && (
              <>
                <span className="text-muted-foreground/50 mx-1">|</span>
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  HEAD at {currentCommit.oid.slice(0, 7)}
                </span>
              </>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleCreateSavepoint} className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            创建存档点
          </Button>
        </div>

        <Separator />

        {/* 提交历史列表 */}
        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BookOpen className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">暂无版本历史</p>
              <p className="text-sm text-muted-foreground/60 mt-1">
                数据变更后会自动创建版本记录
              </p>
            </div>
          ) : (
            <div className="relative py-4">
              {/* 时间线竖线 */}
              <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border" />

              {history.map((commit, idx) => {
                const type = getCommitType(commit.message);
                const isHead = commit.oid === currentOid;
                const isConfirming = confirmRollback === commit.oid;
                const shortOid = commit.oid.slice(0, 7);

                return (
                  <div key={commit.oid} className="relative flex gap-4 pb-5 last:pb-0">
                    {/* 时间线圆点 */}
                    <div className="relative z-10 flex items-start pt-0.5">
                      <div
                        className={`w-[10px] h-[10px] mt-1.5 rounded-full border-2 ${
                          isHead
                            ? "border-primary bg-primary"
                            : "border-border bg-background"
                        }`}
                      />
                    </div>

                    {/* 提交内容卡片 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge
                            variant="secondary"
                            className={`text-sm px-1.5 py-0 leading-4 shrink-0 text-white ${type.color}`}
                          >
                            {type.label}
                          </Badge>
                          <span className="text-sm font-mono text-muted-foreground shrink-0">
                            {shortOid}
                          </span>
                          {isHead && (
                            <Badge variant="default" className="text-sm px-1.5 py-0 leading-4 shrink-0">
                              HEAD
                            </Badge>
                          )}
                        </div>
                        <span className="text-sm text-muted-foreground shrink-0 whitespace-nowrap">
                          {formatTimestamp(commit.author.timestamp)}
                        </span>
                      </div>

                      <p className="text-sm mt-1 break-words">{commit.message}</p>

                      {/* 回滚按钮（只在非当前版本显示） */}
                      {!isHead && !isConfirming && idx > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 mt-1 text-sm text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20 gap-1"
                          onClick={() => setConfirmRollback(commit.oid)}
                        >
                          <RotateCcw className="h-3 w-3" />
                          回滚到此版本
                        </Button>
                      )}

                      {/* 回滚确认 */}
                      {isConfirming && (
                        <div className="flex items-center gap-2 mt-2 p-2 border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
                          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span className="text-sm text-amber-700 dark:text-amber-400 flex-1">
                            将回滚到 <strong>{shortOid}</strong>，当前未保存的更改将丢失
                          </span>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-sm"
                              onClick={() => setConfirmRollback(null)}
                            >
                              取消
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-sm gap-1"
                              disabled={rollingBack === commit.oid}
                              onClick={() => handleRollback(commit.oid)}
                            >
                              {rollingBack === commit.oid ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3" />
                              )}
                              确认回滚
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border pt-3">
          <p className="text-sm text-muted-foreground">
            {history.length > 0
              ? `共 ${history.length} 个版本记录`
              : "版本记录会在您保存数据时自动创建"}
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      {ConfirmDialog}
    </>
  );
}
