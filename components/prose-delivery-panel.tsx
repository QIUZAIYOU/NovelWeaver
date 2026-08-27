// components/prose-delivery-panel.tsx
// 正文交付台 - 草稿审核/确认/打回面板

"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  MessageSquare,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Send,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { formatRelativeTime } from "@/lib/utils";

/** 草稿消息类型 */
interface DraftMessage {
  id: string;
  role: string;
  content: string;
  reviewStatus: string;
  reviewComment: string;
  createdAt: string;
}

interface ProseDeliveryPanelProps {
  projectId: string;
  /** 有新草稿时回调刷新父级消息列表 */
  onDraftChange?: () => void;
}

export function ProseDeliveryPanel({
  projectId,
  onDraftChange,
}: ProseDeliveryPanelProps) {
  const [drafts, setDrafts] = useState<DraftMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected">("approved");
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  /** 确认归档 */
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
        toast({ title: "草稿已归档" });
        loadDrafts();
        onDraftChange?.();
      } else {
        toast({ title: "归档失败", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "归档失败", variant: "destructive" });
    } finally {
      setConfirmingId(null);
    }
  };

  /** 提交审核 */
  const handleReview = async (messageId: string) => {
    if (reviewAction === "rejected" && !reviewComment.trim()) {
      toast({ title: "请填写打回原因", variant: "destructive" });
      return;
    }
    setConfirmingId(messageId);
    try {
      const res = await fetch(`/api/projects/${projectId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review",
          messageId,
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
        setReviewingId(null);
        setReviewComment("");
        loadDrafts();
        onDraftChange?.();
      } else {
        toast({ title: "审核失败", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "审核失败", variant: "destructive" });
    } finally {
      setConfirmingId(null);
    }
  };

  const pendingCount = drafts.filter((d) => d.reviewStatus === "pending").length;

  return (
    <div className="space-y-3">
      {/* 面板标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            正文交付台
          </span>
        </div>
        {pendingCount > 0 && (
          <Badge variant="secondary" className="text-sm">
            {pendingCount} 待审核
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : drafts.length === 0 ? (
        <Card>
          <CardContent className="p-4 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">暂无待审核草稿</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              AI 生成的内容可保存为草稿，在这里审核归档
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {drafts.map((draft) => {
            const isExpanded = expandedId === draft.id;
            const isPending = draft.reviewStatus === "pending";
            const isRejected = draft.reviewStatus === "rejected";

            return (
              <Card
                key={draft.id}
                className={`border-l-2 ${
                  isRejected
                    ? "border-l-red-400"
                    : isPending
                      ? "border-l-amber-400"
                      : "border-l-green-400"
                }`}
              >
                <CardContent className="p-3">
                  {/* 头部 */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="secondary"
                        className="text-sm px-1 py-0"
                      >
                        {draft.role === "assistant" ? "AI" : "用户"}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatRelativeTime(draft.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {isPending && (
                        <Badge
                          variant="outline"
                          className="text-sm text-amber-600 border-amber-300"
                        >
                          <Clock className="h-2.5 w-2.5 mr-0.5" />
                          待审
                        </Badge>
                      )}
                      {isRejected && (
                        <Badge
                          variant="outline"
                          className="text-sm text-red-600 border-red-300"
                        >
                          <XCircle className="h-2.5 w-2.5 mr-0.5" />
                          已打回
                        </Badge>
                      )}
                      {draft.reviewStatus === "approved" && (
                        <Badge
                          variant="outline"
                          className="text-sm text-green-600 border-green-300"
                        >
                          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                          已通过
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* 内容 */}
                  <div className="relative">
                    <p
                      className={`text-sm text-foreground/90 whitespace-pre-wrap ${
                        isExpanded ? "" : "line-clamp-3"
                      }`}
                    >
                      {draft.content}
                    </p>
                    {draft.content.length > 150 && (
                      <button
                        className="text-sm text-primary mt-0.5 hover:underline"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : draft.id)
                        }
                      >
                        {isExpanded ? "收起" : "展开全文"}
                      </button>
                    )}
                  </div>

                  {/* 打回原因 */}
                  {isRejected && draft.reviewComment && (
                    <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50">
                      <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-0.5">
                        打回原因：
                      </p>
                      <p className="text-sm text-red-600/80 dark:text-red-400/80">
                        {draft.reviewComment}
                      </p>
                    </div>
                  )}

                  <Separator className="my-2" />

                  {/* 操作按钮 */}
                  {isPending && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-sm gap-1 flex-1"
                        disabled={confirmingId === draft.id}
                        onClick={() => handleConfirm(draft.id)}
                      >
                        {confirmingId === draft.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        确认归档
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-sm gap-1 flex-1"
                        onClick={() => {
                          setReviewingId(
                            reviewingId === draft.id ? null : draft.id
                          );
                          setReviewAction("approved");
                          setReviewComment("");
                        }}
                      >
                        {reviewingId === draft.id ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                        审核
                      </Button>
                    </div>
                  )}

                  {/* 审核表单 */}
                  {reviewingId === draft.id && (
                    <div className="mt-2 space-y-2 p-2 rounded bg-muted">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={
                            reviewAction === "approved" ? "default" : "outline"
                          }
                          className="h-7 text-sm gap-1 flex-1"
                          onClick={() => setReviewAction("approved")}
                        >
                          <ThumbsUp className="h-3 w-3" />
                          通过
                        </Button>
                        <Button
                          size="sm"
                          variant={
                            reviewAction === "rejected" ? "destructive" : "outline"
                          }
                          className="h-7 text-sm gap-1 flex-1"
                          onClick={() => setReviewAction("rejected")}
                        >
                          <ThumbsDown className="h-3 w-3" />
                          打回
                        </Button>
                      </div>

                      {reviewAction === "rejected" && (
                        <Textarea
                          placeholder="请输入打回原因..."
                          rows={2}
                          className="text-sm min-h-[50px]"
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                        />
                      )}

                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-sm flex-1"
                          onClick={() => setReviewingId(null)}
                        >
                          取消
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-sm gap-1 flex-1"
                          disabled={confirmingId === draft.id}
                          onClick={() => handleReview(draft.id)}
                        >
                          {confirmingId === draft.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Send className="h-3 w-3" />
                          )}
                          提交
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* 已审核的显示审核人意见 */}
                  {!isPending && draft.reviewStatus !== "none" && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-sm text-muted-foreground gap-1"
                        onClick={() => handleConfirm(draft.id)}
                      >
                        {draft.reviewStatus === "rejected" || draft.reviewStatus === "pending" ? "重新归档" : "已归档"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
