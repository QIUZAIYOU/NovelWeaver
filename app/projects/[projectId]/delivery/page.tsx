// app/projects/[projectId]/delivery/page.tsx
// 交付台 — AI 生成内容（对话/智能协作等）的集中审核与发布页面
// 审批通过后可自动更新角色和世界观

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  MessageSquare,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Send,
  Eye,
  EyeOff,
  RefreshCw,
  Sparkles,
  Bot,
  User,
  Search,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { useSettingsStore } from "@/stores/settings-store";
import { ContentViewDialog } from "@/components/ui/content-view-dialog";
import { AutoUpdateDialog } from "@/components/auto-update-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/** 草稿消息类型 */
interface DraftMessage {
  id: string;
  role: string;
  content: string;
  reviewStatus: "none" | "pending" | "approved" | "rejected";
  reviewComment: string;
  createdAt: string;
  metadata?: string;
}

type FilterStatus = "all" | "pending" | "approved" | "rejected";
type FilterSource = "all" | "chat" | "studio";

export default function DeliveryPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [drafts, setDrafts] = useState<DraftMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // 审核
  const [reviewTarget, setReviewTarget] = useState<DraftMessage | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected">("approved");

  // 查看全文弹窗
  const [viewDraft, setViewDraft] = useState<DraftMessage | null>(null);
  // 智能协作 agent tab
  const [agentTab, setAgentTab] = useState(0);
  // 编辑草稿状态
  const [editingDraft, setEditingDraft] = useState(false);
  const [editContent, setEditContent] = useState("");
  // 自动更新确认弹窗
  const [autoUpdateDialogOpen, setAutoUpdateDialogOpen] = useState(false);
  const [autoUpdatePreview, setAutoUpdatePreview] = useState<{ characters: any[]; lore: any[] } | null>(null);
  const [autoUpdateAnalyzing, setAutoUpdateAnalyzing] = useState(false);
  const [autoUpdateTargetId, setAutoUpdateTargetId] = useState<string | null>(null);
  // 已分析的草稿（防止重复分析）
  const [analyzedDrafts, setAnalyzedDrafts] = useState<Set<string>>(new Set());

  // 打开新弹窗时重置 tab
  useEffect(() => {
    if (viewDraft) setAgentTab(0);
  }, [viewDraft]);

  // 打开弹窗时重置编辑状态
  useEffect(() => {
    if (viewDraft) {
      setEditingDraft(false);
      setEditContent(viewDraft.content);
    }
  }, [viewDraft]);

  // 筛选
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("pending");
  const [searchQuery, setSearchQuery] = useState("");

  // 自动更新
  const [autoUpdating, setAutoUpdating] = useState<string | null>(null);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true);

  const loadDrafts = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/draft`);
      const data = await res.json();
      if (data.success) setDrafts(data.data);
    } catch (err) {
      console.error("加载草稿失败:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  const { confirm, ConfirmDialog } = useConfirm();

  /** 删除草稿 */
  const handleDelete = async (messageId: string) => {
    const ok = await confirm({ title: "删除草稿", description: "确定要删除这条草稿吗？此操作不可撤销。" });
    if (!ok) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/draft?messageId=${messageId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast({ title: "草稿已删除" });
        if (viewDraft?.id === messageId) setViewDraft(null);
        loadDrafts();
      } else {
        toast({ title: "删除失败", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "删除失败", variant: "destructive" });
    }
  };

  /** 确认发布 */
  const handleConfirm = async (messageId: string) => {
    setConfirmingId(messageId);
    try {
      const res = await fetch(`/api/projects/${projectId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", messageId }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "草稿已发布" });
        loadDrafts();
      } else {
        toast({ title: "发布失败", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "发布失败", variant: "destructive" });
    } finally {
      setConfirmingId(null);
    }
  };

  /** 撤回发布 — 恢复待审状态 */
  const handleRetract = async (messageId: string) => {
    const ok = await confirm({ title: "撤回发布", description: "确定要撤回此草稿吗？撤回后将恢复为待审状态，需要重新审核才能发布。", confirmText: "撤回" });
    if (!ok) return;
    setConfirmingId(messageId);
    try {
      const res = await fetch(`/api/projects/${projectId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retract", messageId }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "草稿已撤回，恢复为待审状态" });
        loadDrafts();
      } else {
        toast({ title: "撤回失败", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "撤回失败", variant: "destructive" });
    } finally {
      setConfirmingId(null);
    }
  };

  /** 提交审核（通过/打回），通过后可选自动更新角色和世界观 */
  const handleReview = async (autoUpdate?: boolean) => {
    const target = reviewTarget;
    if (!target) return;
    if (reviewAction === "rejected" && !reviewComment.trim()) {
      toast({ title: "请填写打回原因", variant: "destructive" });
      return;
    }
    setConfirmingId(target.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review",
          messageId: target.id,
          reviewStatus: reviewAction,
          comment: reviewComment.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: reviewAction === "approved" ? "草稿已通过" : "草稿已打回",
          description: reviewAction === "rejected" ? reviewComment.trim() : undefined,
        });
        setReviewTarget(null);
        setReviewComment("");
        loadDrafts();

        // 审核通过后自动更新角色和世界观
        if (reviewAction === "approved" && (autoUpdate ?? autoUpdateEnabled)) {
          handleAutoUpdate(target.id);
        }
      } else {
        toast({ title: "审核失败", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "审核失败", variant: "destructive" });
    } finally {
      setConfirmingId(null);
    }
  };

  /** 自动更新角色和世界观（预览模式 — 打开确认弹窗） */
  const handleAutoUpdate = async (messageId: string) => {
    setAutoUpdateTargetId(messageId);
    setAutoUpdateAnalyzing(true);
    setAutoUpdateDialogOpen(true);
    setAutoUpdatePreview(null);
    const { modelConfig } = useSettingsStore.getState();
    try {
      const res = await fetch(`/api/projects/${projectId}/delivery/auto-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, modelConfig, mode: "preview" }),
      });
      const data = await res.json();
      if (data.success && data.analysis) {
        setAutoUpdatePreview(data.analysis);
      } else {
        toast({ title: "分析失败", description: data.error || "无法解析故事内容", variant: "destructive" });
        setAutoUpdateDialogOpen(false);
      }
    } catch {
      toast({ title: "分析请求失败", variant: "destructive" });
      setAutoUpdateDialogOpen(false);
    } finally {
      setAutoUpdateAnalyzing(false);
    }
  };

  /** 确认应用分析结果到数据库 */
  const handleApplyAutoUpdate = async () => {
    if (!autoUpdateTargetId || !autoUpdatePreview) return;
    const { modelConfig } = useSettingsStore.getState();
    try {
      const res = await fetch(`/api/projects/${projectId}/delivery/auto-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: autoUpdateTargetId,
          modelConfig,
          mode: "apply",
          previewData: autoUpdatePreview,
        }),
      });
      const data = await res.json();
      if (data.success && data.updates) {
        const charUpdates = data.updates.characters || [];
        const loreUpdates = data.updates.lore || [];
        if (charUpdates.length > 0 || loreUpdates.length > 0) {
          toast({
            title: "更新完成",
            description: [
              charUpdates.length > 0 ? `角色：${charUpdates.join("、")}` : "",
              loreUpdates.length > 0 ? `世界观：${loreUpdates.join("、")}` : "",
            ].filter(Boolean).join("；"),
          });
        } else {
          toast({ title: "未发现需要更新的内容" });
        }
        // 标记为已分析
        setAnalyzedDrafts(prev => new Set(prev).add(autoUpdateTargetId));
        setAutoUpdateDialogOpen(false);
        loadDrafts();
      } else if (data.error) {
        toast({ title: "更新失败", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "更新请求失败", variant: "destructive" });
    }
  };

  /** AI 自动补全角色/词条详细信息 */
  const handleAutoComplete = async (type: "character" | "lore", name: string, currentData: Record<string, string>): Promise<Record<string, string> | null> => {
    const { modelConfig } = useSettingsStore.getState();
    try {
      const res = await fetch(`/api/projects/${projectId}/delivery/auto-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelConfig, mode: "autocomplete",
          targetType: type, targetName: name, existingData: currentData,
        }),
      });
      const data = await res.json();
      if (data.success && data.data) return data.data;
    } catch {}
    return null;
  };

  /** 保存编辑后的草稿内容 */
  const handleSaveEdit = async () => {
    if (!viewDraft || !editContent.trim()) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/messages/${viewDraft.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "内容已更新" });
        viewDraft.content = editContent.trim();
        setEditingDraft(false);
        loadDrafts();
      } else {
        toast({ title: "保存失败", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "保存失败", variant: "destructive" });
    }
  };

  // === 筛选逻辑 ===
  const filteredDrafts = drafts.filter((d) => {
    if (filterStatus !== "all" && d.reviewStatus !== filterStatus) return false;
    if (searchQuery && !d.content.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const pendingCount = drafts.filter((d) => d.reviewStatus === "pending").length;
  const approvedCount = drafts.filter((d) => d.reviewStatus === "approved").length;
  const rejectedCount = drafts.filter((d) => d.reviewStatus === "rejected").length;

  // 判定草稿来源
  const guessSource = (draft: DraftMessage): "chat" | "studio" => {
    try {
      if (draft.metadata) {
        const m = JSON.parse(draft.metadata);
        if (m.source === "studio") return "studio";
      }
    } catch {}
    return draft.role === "user" ? "chat" : "studio";
  };

  /** 从 metadata 中提取智能协作各智能体的输出列表 */
  const getStudioAgents = (draft: DraftMessage): { name: string; emoji: string; output: string }[] => {
    try {
      if (draft.metadata) {
        const m = JSON.parse(draft.metadata);
        if (m.agents && Array.isArray(m.agents)) return m.agents;
      }
    } catch {}
    return [];
  };

  /** 从智能体列表中找出主笔 */
  const getWriterFromAgents = (agents: { name: string; emoji: string; output: string }[]) => {
    return agents.find(
      a => a.emoji === "📝" || a.name.includes("主笔") || a.name.includes("Writer") || a.name.includes("writer")
    );
  };

  /** 净化已通过的 studio 内容：只保留主笔故事正文，去除 agent 头部标记 */
  const cleanApprovedStudioContent = (draft: DraftMessage): string => {
    if (guessSource(draft) !== "studio") return draft.content;
    const agents = getStudioAgents(draft);
    const writer = getWriterFromAgents(agents);
    if (!writer) return draft.content;
    // 移除主笔输出中的 ## emoji name 头部标记（如果有的话）
    return writer.output.replace(/^##\s+\S+\s+.*$/m, "").trim();
  };

  return (
    <div className="h-full flex flex-col">
      {/* 页面头部 */}
      <div className="border-b border-border px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-lg font-semibold">交付台</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                集中审核所有 AI 生成内容，发布或自动更新到角色与世界观
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-sm gap-1.5" onClick={loadDrafts}>
              <RefreshCw className="h-3.5 w-3.5" /> 刷新
            </Button>
          </div>
        </div>

        {/* 统计栏 */}
        <div className="flex items-center gap-3 mt-3">
          <FilterBadge
            label="待审核"
            count={pendingCount}
            active={filterStatus === "pending"}
            onClick={() => setFilterStatus("pending")}
            color="amber"
          />
          <FilterBadge
            label="已通过"
            count={approvedCount}
            active={filterStatus === "approved"}
            onClick={() => setFilterStatus("approved")}
            color="green"
          />
          <FilterBadge
            label="已打回"
            count={rejectedCount}
            active={filterStatus === "rejected"}
            onClick={() => setFilterStatus("rejected")}
            color="red"
          />
          <FilterBadge
            label="全部"
            count={drafts.length}
            active={filterStatus === "all"}
            onClick={() => setFilterStatus("all")}
            color="default"
          />
          <div className="flex-1" />
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索草稿内容…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 h-8 text-sm"
            />
          </div>
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={autoUpdateEnabled}
              onChange={(e) => setAutoUpdateEnabled(e.target.checked)}
              className="rounded"
            />
            通过时自动更新角色与世界观
          </label>
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto p-6 animate-fade-up">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : filteredDrafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <MessageSquare className="h-16 w-16 text-muted-foreground/20 mb-4" />
            <p className="text-base font-medium text-muted-foreground">暂无草稿</p>
            <p className="text-sm text-muted-foreground/60 mt-1 max-w-xs">
              {filterStatus === "pending"
                ? "所有 AI 生成的内容都会在这里等待你的审核"
                : "没有符合当前筛选条件的草稿"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {filteredDrafts.map((draft) => {
              const isPending = draft.reviewStatus === "pending";
              const isRejected = draft.reviewStatus === "rejected";
              const source = guessSource(draft);

              return (
                <Card
                  key={draft.id}
                  className={cn(
                    "border-l-4 transition-smooth",
                    isRejected && "border-l-red-400",
                    isPending && "border-l-amber-400",
                    draft.reviewStatus === "approved" && "border-l-green-400",
                  )}
                >
                  <CardContent className="p-3">
                    {/* 头部信息 */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          {isPending && (
                            <Badge variant="default" className="text-sm bg-amber-500 hover:bg-amber-600 text-white border-0">
                              <Clock className="h-2.5 w-2.5 mr-0.5" /> 待审
                            </Badge>
                          )}
                          {isRejected && (
                            <Badge variant="default" className="text-sm bg-red-500 hover:bg-red-600 text-white border-0">
                              <XCircle className="h-2.5 w-2.5 mr-0.5" /> 已打回
                            </Badge>
                          )}
                          {draft.reviewStatus === "approved" && (
                            <Badge variant="default" className="text-sm bg-green-500 hover:bg-green-600 text-white border-0">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> 已通过
                            </Badge>
                          )}
                        </div>
                        <Badge
                          variant="secondary"
                          className="text-sm px-1.5 py-0 gap-1"
                        >
                          {draft.role === "assistant" ? (
                            <><Bot className="h-3 w-3" /> AI</>
                          ) : (
                            <><User className="h-3 w-3" /> 用户</>
                          )}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="text-sm px-1.5 py-0"
                        >
                          {source === "studio" ? "智能协作" : "对话"}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatRelativeTime(draft.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* 内容区域：显示摘要，点击查看全文弹窗 */}
                    <div>
                      {source === "studio" ? (
                        <>
                          {(() => {
                            const agents = getStudioAgents(draft);
                            const writer = getWriterFromAgents(agents);
                            const display = writer?.output || draft.content;
                            return (
                              <div className="rounded border border-border/50 bg-muted/30 p-2 mb-1.5">
                                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground/60 mb-1">
                                  <span>{writer?.emoji || "📝"}</span>
                                  <span>{writer ? `叙事起草专员 · ${writer.name}` : "智能协作"}</span>
                                </div>
                                <div className="text-sm leading-relaxed line-clamp-4">
                                  <Streamdown animated isAnimating={false}>
                                    {display.length > 300 ? display.slice(0, 300) + "…" : display}
                                  </Streamdown>
                                </div>
                              </div>
                            );
                          })()}
                          <button
                            className="text-sm text-primary mt-1 hover:underline"
                            onClick={() => setViewDraft(draft)}
                          >
                            查看完整协作记录
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="text-sm text-muted-foreground/70 whitespace-pre-wrap leading-relaxed line-clamp-4">
                            {draft.content}
                          </div>
                          {draft.content.length > 150 && (
                            <button
                              className="text-sm text-primary mt-1 hover:underline"
                              onClick={() => setViewDraft(draft)}
                            >
                              查看全文…
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {/* 打回原因 */}
                    {isRejected && draft.reviewComment && (
                      <div className="mt-3 p-2.5 rounded bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50">
                        <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-0.5">
                          打回原因：
                        </p>
                        <p className="text-sm text-red-600/80 dark:text-red-400/80">
                          {draft.reviewComment}
                        </p>
                      </div>
                    )}

                    <Separator className="my-2" />

                    {/* 操作区 */}
                    <div className="flex items-center gap-2">
                      {isPending && (
                        <>
                          <Button
                            size="default"
                            variant="default"
                            className="h-10 text-base gap-2 font-semibold"
                            disabled={confirmingId === draft.id}
                            onClick={() => handleConfirm(draft.id)}
                          >
                            {confirmingId === draft.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                            确认发布
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-10 text-sm gap-1"
                              >
                                <MoreHorizontal className="h-4 w-4" /> 更多操作
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem onClick={() => {
                                setReviewTarget(draft);
                                setReviewAction("approved");
                                setReviewComment("");
                              }}>
                                <Eye className="h-4 w-4 mr-2" /> 审核
                              </DropdownMenuItem>
                              {autoUpdateEnabled && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    disabled={analyzedDrafts.has(draft.id)}
                                    onClick={() => handleAutoUpdate(draft.id)}
                                  >
                                    {analyzedDrafts.has(draft.id) ? (
                                      <span className="text-muted-foreground/50">已分析</span>
                                    ) : (
                                      <>
                                        <Sparkles className="h-4 w-4 mr-2" />
                                        分析更新
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-10 text-base gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={async () => {
                              const ok = await confirm({ title: "删除草稿", description: "确定要永久删除此草稿吗？此操作不可撤销。", confirmText: "删除" });
                              if (ok) handleDelete(draft.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                            删除
                          </Button>
                        </>
                      )}
                      {!isPending && draft.reviewStatus !== "none" && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-sm text-muted-foreground"
                            onClick={() => handleConfirm(draft.id)}
                          >
                            {draft.reviewStatus === "rejected" ? "重新发布" : "已发布"}
                          </Button>
                          {draft.reviewStatus === "approved" && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-sm gap-1 ml-auto"
                                disabled={analyzedDrafts.has(draft.id)}
                                onClick={() => handleAutoUpdate(draft.id)}
                              >
                                {analyzedDrafts.has(draft.id) ? (
                                  <span className="text-muted-foreground/50 text-xs">已分析</span>
                                ) : (
                                  <><Sparkles className="h-3.5 w-3.5" />分析新增</>
                                )}
                              </Button>
                            </>
                          )}
                          {draft.reviewStatus === "rejected" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-sm text-destructive hover:text-destructive"
                              onClick={() => handleDelete(draft.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>

                    {/* 审核弹窗 */}
                    <Dialog open={reviewTarget !== null} onOpenChange={(open) => { if (!open) setReviewTarget(null); }}>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>审核草稿</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant={reviewAction === "approved" ? "default" : "outline"}
                              className="h-8 text-sm gap-1.5 flex-1"
                              onClick={() => setReviewAction("approved")}
                            >
                              <ThumbsUp className="h-4 w-4" /> 通过
                            </Button>
                            <Button
                              size="sm"
                              variant={reviewAction === "rejected" ? "destructive" : "outline"}
                              className="h-8 text-sm gap-1.5 flex-1"
                              onClick={() => setReviewAction("rejected")}
                            >
                              <ThumbsDown className="h-4 w-4" /> 打回
                            </Button>
                          </div>
                          {reviewAction === "rejected" && (
                            <Textarea
                              placeholder="请填写打回原因…"
                              rows={3}
                              className="text-sm"
                              value={reviewComment}
                              onChange={(e) => setReviewComment(e.target.value)}
                            />
                          )}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 text-sm flex-1"
                              onClick={() => setReviewTarget(null)}
                            >
                              取消
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 text-sm gap-1.5 flex-1"
                              disabled={confirmingId === reviewTarget?.id}
                              onClick={() => handleReview(true)}
                            >
                              {confirmingId === reviewTarget?.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                              提交{autoUpdateEnabled ? "并自动更新" : ""}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* 查看全文弹窗 */}
      <ContentViewDialog
        open={viewDraft !== null}
        onOpenChange={(open) => { if (!open) setViewDraft(null); }}
        title={
          viewDraft && (
            <>
              {viewDraft.role === "assistant" ? (
                <><Bot className="h-4 w-4 text-primary" /> AI 消息</>
              ) : (
                <><User className="h-4 w-4" /> 用户消息</>
              )}
              <Badge variant="secondary" className="text-xs ml-1">
                {guessSource(viewDraft) === "studio" ? "智能协作" : "对话"}
              </Badge>
              {viewDraft.reviewStatus === "approved" && (
                <Badge variant="default" className="text-xs bg-green-500">已通过</Badge>
              )}
              {viewDraft.reviewStatus === "pending" && (
                <Badge variant="default" className="text-xs bg-amber-500">待审</Badge>
              )}
              {viewDraft.reviewStatus === "rejected" && (
                <Badge variant="default" className="text-xs bg-red-500">已打回</Badge>
              )}
            </>
          )
        }
        actions={
          viewDraft && (
            <>
              {viewDraft.reviewStatus === "pending" && (
                <>
                  <Button size="sm" variant="default" className="w-full gap-1.5 text-xs"
                    disabled={confirmingId === viewDraft.id}
                    onClick={() => { handleConfirm(viewDraft.id); setViewDraft(null); }}
                  >
                    {confirmingId === viewDraft.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    确认发布
                  </Button>
                  <Button size="sm" variant="outline"
                    className="w-full gap-1.5 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950/30"
                    onClick={() => {
                      setReviewAction("approved"); setReviewTarget(viewDraft); setViewDraft(null);
                    }}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" /> 审核通过
                  </Button>
                  <Button size="sm" variant="outline"
                    className="w-full gap-1.5 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950/30"
                    onClick={() => {
                      setReviewAction("rejected"); setReviewTarget(viewDraft);
                      setReviewComment(""); setViewDraft(null);
                    }}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" /> 打回
                  </Button>
                </>
              )}
              {viewDraft.reviewStatus === "rejected" && (
                <>
                  <Button size="sm" variant="default" className="w-full gap-1.5 text-xs"
                    onClick={() => { handleConfirm(viewDraft.id); setViewDraft(null); }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> 重新发布
                  </Button>
                  <Button size="sm" variant="destructive" className="w-full gap-1.5 text-xs"
                    onClick={() => { const id = viewDraft.id; setViewDraft(null); handleDelete(id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> 删除草稿
                  </Button>
                </>
              )}
              {viewDraft.reviewStatus === "approved" && (
                <>
                  {editingDraft ? (
                    <Button size="sm" variant="default" className="w-full gap-1.5 text-xs"
                      onClick={handleSaveEdit}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> 保存修改
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="destructive" className="w-full gap-1.5 text-xs"
                        onClick={() => { handleRetract(viewDraft.id); setViewDraft(null); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> 撤回发布
                      </Button>
                      <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs"
                        onClick={() => { navigator.clipboard.writeText(viewDraft.content); toast({ title: "已复制到剪贴板" }); }}
                      >
                        <FileText className="h-3.5 w-3.5" /> 复制全文
                      </Button>
                      <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs"
                        onClick={() => { setEditingDraft(true); setEditContent(viewDraft.content); }}
                      >
                        <FileText className="h-3.5 w-3.5" /> 编辑内容
                      </Button>
                      <Button size="sm" variant="outline"
                        className="w-full gap-1.5 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950/30"
                        disabled={analyzedDrafts.has(viewDraft.id)}
                        onClick={() => { handleAutoUpdate(viewDraft.id); }}
                      >
                        {analyzedDrafts.has(viewDraft.id) ? (
                          <span className="text-xs">已分析</span>
                        ) : (
                          <><Sparkles className="h-3.5 w-3.5" />分析新增</>
                        )}
                      </Button>
                    </>
                  )}
                </>
              )}
            </>
          )
        }
      >
        {viewDraft && (
          <>
            {editingDraft ? (
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={20}
                className="text-sm font-mono leading-relaxed resize-y min-h-[300px]"
              />
            ) : viewDraft.reviewStatus === "approved" && guessSource(viewDraft) === "studio" ? (
              /* 已通过的 studio 草稿：只显示主笔故事正文，去除所有智能体标记 */
              <div className="text-sm leading-relaxed">
                <Streamdown animated isAnimating={false}>{cleanApprovedStudioContent(viewDraft)}</Streamdown>
              </div>
            ) : (
            <>
            {guessSource(viewDraft) === "studio" ? (
              <>
                {(() => {
                  const agents = getStudioAgents(viewDraft);
                  // 将主笔移到第一位，使其 tab 始终在第一个位置
                  const writerIdx = agents.findIndex(
                    a => a.emoji === "📝" || a.name.includes("主笔") || a.name.includes("Writer") || a.name.includes("writer")
                  );
                  if (writerIdx > 0) {
                    const writer = agents.splice(writerIdx, 1)[0];
                    agents.unshift(writer);
                  }
                  const defaultIdx = 0;
                  const activeIdx = agentTab < agents.length ? agentTab : defaultIdx;
                  const activeAgent = agents[activeIdx];
                  return (
                    <>
                      {/* Tab 导航 */}
                      <div className="flex gap-0.5 border-b border-border -mx-6 px-6 shrink-0 flex-wrap">
                        {agents.map((agent, i) => (
                          <button
                            key={i}
                            onClick={() => setAgentTab(i)}
                            className={`px-3 py-2 text-xs font-mono border-b-2 transition-smooth ${
                              activeIdx === i
                                ? "border-primary text-foreground"
                                : "border-transparent text-muted-foreground/60 hover:text-foreground"
                            }`}
                          >
                            {agent.emoji} {agent.name}
                          </button>
                        ))}
                      </div>

                      {/* Tab 内容 */}
                      {activeAgent ? (
                        <div className="rounded border border-border/50 bg-card p-4">
                          <div className="flex items-center gap-2 mb-3 text-sm font-medium text-foreground">
                            <span>{activeAgent.emoji}</span>
                            <span>{activeAgent.name}</span>
                            {activeIdx === defaultIdx && (
                              <span className="text-[10px] font-mono text-primary/70 border border-primary/30 px-1.5">创作内容</span>
                            )}
                          </div>
                          <div className="text-sm leading-relaxed">
                            <Streamdown animated isAnimating={false}>{activeAgent.output}</Streamdown>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded border border-border/50 bg-card p-4">
                          <div className="text-sm leading-relaxed">
                            <Streamdown animated isAnimating={false}>{viewDraft.content}</Streamdown>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            ) : (
              <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                {viewDraft.content}
              </div>
            )}
            {viewDraft.reviewComment && (
              <div className="p-3 rounded bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50">
                <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-0.5">打回原因：</p>
                <p className="text-sm text-red-600/80 dark:text-red-400/80">{viewDraft.reviewComment}</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {formatRelativeTime(viewDraft.createdAt)}
            </p>
            </>
            )}
          </>
        )}
      </ContentViewDialog>
      {ConfirmDialog}
      <AutoUpdateDialog
        open={autoUpdateDialogOpen}
        onOpenChange={setAutoUpdateDialogOpen}
        previewData={autoUpdatePreview}
        analyzing={autoUpdateAnalyzing}
        onConfirm={handleApplyAutoUpdate}
        onAutoComplete={handleAutoComplete}
      />
    </div>
  );
}

/** 筛选标签组件 */
function FilterBadge({
  label,
  count,
  active,
  onClick,
  color,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  color: "amber" | "green" | "red" | "default";
}) {
  const colorClasses = {
    amber: "text-amber-600 bg-amber-100 dark:bg-amber-950/30 border-amber-600",
    green: "text-green-600 bg-green-100 dark:bg-green-950/30 border-green-600",
    red: "text-red-600 bg-red-100 dark:bg-red-950/30 border-red-600",
    default: "text-muted-foreground bg-muted border-border",
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border transition-smooth",
        active
          ? colorClasses[color]
          : "text-muted-foreground/60 border-transparent hover:text-foreground hover:bg-muted",
      )}
    >
      {active && (
        <span className={cn(
          "w-2 h-2 rounded-full",
          color === "amber" && "bg-amber-500",
          color === "green" && "bg-green-500",
          color === "red" && "bg-red-500",
          color === "default" && "bg-muted-foreground",
        )} />
      )}
      {label}
      <span className={cn(
        "text-sm tabular-nums",
        active
          ? color === "amber" && "text-amber-600 font-semibold" ||
            color === "green" && "text-green-600 font-semibold" ||
            color === "red" && "text-red-600 font-semibold" ||
            "text-muted-foreground font-semibold"
          : "opacity-60",
      )}>
        {count}
      </span>
    </button>
  );
}
