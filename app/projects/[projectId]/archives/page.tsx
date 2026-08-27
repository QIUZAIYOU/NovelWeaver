// app/projects/[projectId]/archives/page.tsx
// 档案工作台 — 卡片网格布局

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  BookMarked, FileText, Eye, EyeOff, CheckCircle2, XCircle, Loader2,
  Filter, Trash2, ChevronDown, ChevronRight, AlertCircle, Download, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/hooks/use-toast";
import { formatRelativeTime } from "@/lib/utils";
import { SharedSubNav } from "@/components/shared-sub-nav";

interface ArchiveItem {
  id: string; title: string; code: string; type: string;
  content: string; status: string; classification: string;
  writerId: string | null; reviewerId: string | null;
  reviewComment: string; createdAt: string; updatedAt: string;
}

const TYPE_MAP: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  mission: { label: "任务报告", color: "text-blue-500", icon: BookMarked },
  report: { label: "调查报告", color: "text-purple-500", icon: FileText },
  interview: { label: "访谈记录", color: "text-green-500", icon: FileText },
  log: { label: "行动日志", color: "text-orange-500", icon: FileText },
  assessment: { label: "评估报告", color: "text-red-500", icon: AlertCircle },
  item: { label: "物品描述", color: "text-cyan-500", icon: Tag },
  event: { label: "事件记录", color: "text-amber-500", icon: AlertCircle },
};

const CLASS_COLORS: Record<string, string> = {
  internal: "bg-gray-500", confidential: "bg-blue-500", secret: "bg-orange-500", cosmic: "bg-red-500",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "border-l-gray-300", review: "border-l-amber-400", archived: "border-l-green-400", sealed: "border-l-red-400",
};

export default function ArchivesPage() {
  const params = useParams(); const router = useRouter();
  const projectId = params.projectId as string;

  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const url = filterStatus ? `/api/projects/${projectId}/missions?status=${filterStatus}` : `/api/projects/${projectId}/missions`;
      const r = await fetch(url); const d = await r.json();
      if (d.success) setItems(d.data);
    } catch {} finally { setLoading(false); }
  }, [projectId, filterStatus]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleStatus = async (id: string, status: string) => {
    try { const r = await fetch(`/api/projects/${projectId}/missions/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); const d = await r.json(); if (d.success) { loadItems(); toast({ title: "状态已更新" }); } else toast({ title: d.error || "失败", variant: "destructive" }); }
    catch { toast({ title: "操作失败", variant: "destructive" }); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除？")) return;
    try { await fetch(`/api/projects/${projectId}/missions/${id}`, { method: "DELETE" }); loadItems(); toast({ title: "已删除" }); }
    catch { toast({ title: "删除失败", variant: "destructive" }); }
  };

  const getType = (t: string) => TYPE_MAP[t] || { label: t, color: "text-gray-500", icon: FileText };
  const STATUS_LABELS: Record<string, string> = { draft: "草稿", review: "待审核", archived: "已归档", sealed: "已封存" };

  return (
    <>
      <SharedSubNav tabs={[
        { label: "汇编", href: `/projects/${projectId}/compiler` },
        { label: "档案", href: `/projects/${projectId}/archives` },
      ]} />
      <div className="flex-1 h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div><h2 className="text-lg font-bold">档案工作台</h2><p className="text-sm text-muted-foreground">管理所有汇编完成的档案</p></div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-sm gap-1.5" onClick={() => router.push(`/projects/${projectId}/compiler`)}>
            <FileText className="h-3.5 w-3.5" /> 汇编器
          </Button>
        </div>
      </div>

      {/* 过滤器 */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-border shrink-0">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {["", "draft", "review", "archived", "sealed"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-2.5 py-1 text-sm rounded transition-smooth ${filterStatus === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          >{STATUS_LABELS[s] || "全部"}{s && items.filter(i => i.status === s).length > 0 ? ` (${items.filter(i => i.status === s).length})` : ""}</button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 animate-fade-up">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={BookMarked} title="还没有档案" description="在文档汇编器中整理对话并保存为档案"
            action={<Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.push(`/projects/${projectId}/compiler`)}><FileText className="h-4 w-4" /> 去汇编</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map(item => {
              const type = getType(item.type);
              const StatusIcon = type.icon;
              const isExpanded = expandedId === item.id;
              const statusColor = STATUS_COLORS[item.status] || "border-l-gray-300";
              return (
                <Card key={item.id} className={`group hover:shadow-sm transition-smooth ${statusColor}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-sm font-medium ${type.color}`}>{type.label}</span>
                          <Badge variant="outline" className="text-[7px] font-mono">{item.code}</Badge>
                          <span className={`text-[7px] text-white px-1 py-0.5 rounded ${CLASS_COLORS[item.classification] || "bg-gray-500"}`}>
                            {item.classification}
                          </span>
                          <Badge variant="outline" className="text-[7px]">{STATUS_LABELS[item.status] || item.status}</Badge>
                        </div>
                        <h4 className="text-sm font-semibold mt-1 truncate">{item.title}</h4>
                        {item.reviewComment && <p className="text-sm text-muted-foreground mt-0.5 italic">备注：{item.reviewComment}</p>}
                        <p className="text-sm text-muted-foreground/60 mt-1">{formatRelativeTime(item.updatedAt)}</p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground" onClick={() => setExpandedId(isExpanded ? null : item.id)} title="预览" aria-label="预览">
                          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </button>
                      </div>
                    </div>

                    {/* 审核操作 */}
                    {item.status === "review" && (
                      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border">
                        <button className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-sm text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20 transition-smooth" onClick={() => handleStatus(item.id, "archived")}>
                          <CheckCircle2 className="h-3 w-3" /> 通过
                        </button>
                        <button className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-smooth" onClick={() => {
                          const comment = prompt("打回原因：");
                          if (comment) fetch(`/api/projects/${projectId}/missions/${item.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "draft", reviewComment: comment }) }).then(() => loadItems());
                        }}>
                          <XCircle className="h-3 w-3" /> 打回
                        </button>
                        <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive" onClick={() => handleDelete(item.id)} title="删除" aria-label="删除">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}

                    {/* 已归档/封存的操作 */}
                    {(item.status === "archived" || item.status === "sealed") && (
                      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border">
                        <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground" onClick={() => { navigator.clipboard.writeText(item.content); toast({ title: "已复制" }); }} title="复制" aria-label="复制">
                          <Download className="h-3 w-3" />
                        </button>
                        <span className="text-sm text-muted-foreground/60">
                          {item.status === "sealed" ? "🔒 已封存" : "✅ 已归档"}
                        </span>
                        <button className="ml-auto h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive" onClick={() => handleDelete(item.id)} title="删除" aria-label="删除">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}

                    {/* 草稿操作 */}
                    {item.status === "draft" && (
                      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border">
                        <button className="flex-1 flex items-center justify-center gap-1 py-1 rounded text-sm text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-smooth" onClick={() => handleStatus(item.id, "review")}>
                          提交审核
                        </button>
                        <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive" onClick={() => handleDelete(item.id)} title="删除" aria-label="删除">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}

                    {/* 展开内容 */}
                    {isExpanded && (
                      <div className="mt-2 pt-2 border-t border-border">
                        <div className="bg-card p-2 max-h-48 overflow-y-auto">
                          <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{item.content}</pre>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div></>
  );
}
