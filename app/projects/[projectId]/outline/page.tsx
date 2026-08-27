// app/projects/[projectId]/outline/page.tsx
// 四级大纲编辑器 - brainstorm → master → arc → chapter

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Plus,
  Lightbulb,
  BookMarked,
  Layers,
  FileText,
  Edit3,
  Trash2,
  GripVertical,
  CheckCircle2,
  Clock,
  XCircle,
  Sparkles,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";

// ============================================================
// 类型定义
// ============================================================

interface OutlineItem {
  id: string;
  projectId: string;
  level: OutlineLevel;
  title: string;
  content: string;
  order: number;
  parentId: string | null;
  status: string;
  tags: string;
  createdAt: string;
  updatedAt: string;
}

type OutlineLevel = "brainstorm" | "master" | "arc" | "chapter";

interface OutlineForm {
  title: string;
  content: string;
  level: OutlineLevel;
  status: string;
  parentId: string;
}

const emptyForm: OutlineForm = {
  title: "",
  content: "",
  level: "brainstorm",
  status: "draft",
  parentId: "",
};

/** 层级定义 */
const levelDefs: {
  key: OutlineLevel;
  label: string;
  icon: React.ElementType;
  color: string;
  description: string;
  parentLevel: OutlineLevel | null;
}[] = [
  { key: "brainstorm", label: "灵感池", icon: Lightbulb, color: "text-yellow-500", description: "发散创意、主题、卖点、路线候选", parentLevel: null },
  { key: "master", label: "总纲", icon: BookMarked, color: "text-blue-500", description: "全书主线、终局、长期伏笔", parentLevel: null },
  { key: "arc", label: "篇章", icon: Layers, color: "text-purple-500", description: "卷/篇/阶段目标", parentLevel: null },
  { key: "chapter", label: "章节", icon: FileText, color: "text-green-500", description: "可执行的章节大纲", parentLevel: "arc" },
];

/** 状态选项 */
const statusOptions: { value: string; label: string; icon: React.ElementType; color: string }[] = [
  { value: "draft", label: "草稿", icon: Clock, color: "text-gray-500" },
  { value: "active", label: "进行中", icon: Loader2, color: "text-blue-500" },
  { value: "completed", label: "已完成", icon: CheckCircle2, color: "text-green-500" },
  { value: "abandoned", label: "已废弃", icon: XCircle, color: "text-red-500" },
];

// ============================================================
// 页面组件
// ============================================================

export default function OutlinePage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [outlines, setOutlines] = useState<OutlineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLevel, setActiveLevel] = useState<OutlineLevel>("brainstorm");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<OutlineForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [expandedArcs, setExpandedArcs] = useState<Set<string>>(new Set());
  const { confirm, ConfirmDialog } = useConfirm();

  /** 加载大纲列表 */
  const loadOutlines = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/outline`);
      const data = await res.json();
      if (data.success) setOutlines(data.data);
    } catch (err) {
      console.error("加载大纲失败:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadOutlines();
  }, [loadOutlines]);

  /** 按层级过滤 */
  const levelItems = outlines.filter((o) => o.level === activeLevel);

  /** 获取层级子条目（用于 chapter 显示 arc 分组） */
  const getChildren = (parentId: string) =>
    outlines.filter((o) => o.parentId === parentId).sort((a, b) => a.order - b.order);

  /** 获取父条目列表（用于 form 的 parentId 选择） */
  const getParentOptions = (): OutlineItem[] => {
    const def = levelDefs.find((d) => d.key === activeLevel);
    if (!def?.parentLevel) return [];
    return outlines.filter((o) => o.level === def.parentLevel).sort((a, b) => a.order - b.order);
  };

  /** 打开新建弹窗 */
  const openCreate = () => {
    setEditingId(null);
    const parentOptions = getParentOptions();
    const def = levelDefs.find((d) => d.key === activeLevel)!;
    setForm({
      title: "",
      content: "",
      level: activeLevel,
      status: "draft",
      parentId: parentOptions.length === 1 ? parentOptions[0].id : "",
    });
    setDialogOpen(true);
  };

  /** 打开编辑弹窗 */
  const openEdit = (item: OutlineItem) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      content: item.content,
      level: item.level as OutlineLevel,
      status: item.status,
      parentId: item.parentId || "",
    });
    setDialogOpen(true);
  };

  /** 保存大纲 */
  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const url = editingId
        ? `/api/projects/${projectId}/outline/${editingId}`
        : `/api/projects/${projectId}/outline`;
      const method = editingId ? "PUT" : "POST";

      const body: Record<string, unknown> = {
        title: form.title.trim(),
        content: form.content,
        level: form.level,
        status: form.status,
      };
      if (form.level === "chapter" && form.parentId) {
        body.parentId = form.parentId;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setDialogOpen(false);
        loadOutlines();
        toast({
          title: editingId ? "大纲已更新" : "大纲已创建",
          variant: "success",
        });
      } else {
        toast({ title: "保存失败", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "保存失败", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  /** 删除大纲 */
  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "删除大纲",
      description: "确定要删除该项及其子项吗？",
      confirmText: "删除",
    });
    if (!ok) return;
    try {
      await fetch(`/api/projects/${projectId}/outline/${id}`, { method: "DELETE" });
      loadOutlines();
      toast({ title: "已删除" });
    } catch {
      toast({ title: "删除失败", variant: "destructive" });
    }
  };

  /** 调整顺序 */
  const handleMove = async (item: OutlineItem, direction: "up" | "down") => {
    const siblings = levelItems.sort((a, b) => a.order - b.order);
    const idx = siblings.findIndex((s) => s.id === item.id);
    if (idx < 0) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= siblings.length) return;

    const target = siblings[targetIdx];
    try {
      await Promise.all([
        fetch(`/api/projects/${projectId}/outline/${item.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: target.order }),
        }),
        fetch(`/api/projects/${projectId}/outline/${target.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: item.order }),
        }),
      ]);
      loadOutlines();
    } catch {
      toast({ title: "排序失败", variant: "destructive" });
    }
  };

  /** 更新状态快捷操作 */
  const handleStatusChange = async (item: OutlineItem, newStatus: string) => {
    try {
      await fetch(`/api/projects/${projectId}/outline/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      loadOutlines();
    } catch {
      toast({ title: "状态更新失败", variant: "destructive" });
    }
  };

  /** 获取状态 Badge */
  const getStatusBadge = (status: string) => {
    const opt = statusOptions.find((s) => s.value === status);
    if (!opt) return null;
    return (
      <Badge variant="outline" className={`text-sm gap-1 ${opt.color}`}>
        <opt.icon className="h-3 w-3" />
        {opt.label}
      </Badge>
    );
  };

  /** 切换 arc 折叠 */
  const toggleArc = (arcId: string) => {
    setExpandedArcs((prev) => {
      const next = new Set(prev);
      if (next.has(arcId)) next.delete(arcId);
      else next.add(arcId);
      return next;
    });
  };

  const parentOptions = getParentOptions();
  const currentLevelDef = levelDefs.find((d) => d.key === activeLevel)!;

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">故事大纲</h2>
          <p className="text-muted-foreground mt-1">
            从灵感到章节，逐层规划你的故事
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2" disabled={loading}>
          <Plus className="h-4 w-4" />
          新建
        </Button>
      </div>

      {/* 层级标签页 */}
      <div className="flex gap-1 border-b border-border">
        {levelDefs.map((def) => {
          const count = outlines.filter((o) => o.level === def.key).length;
          return (
            <button
              key={def.key}
              onClick={() => setActiveLevel(def.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-smooth ${
                activeLevel === def.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <def.icon className={`h-4 w-4 ${def.color}`} />
              {def.label}
              {count > 0 && (
                <Badge variant="secondary" className="text-sm px-1.5 py-0 leading-4">
                  {count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* 当前层级说明 */}
      <p className="text-sm text-muted-foreground -mt-3">
        {currentLevelDef.description}
      </p>

      {/* 大纲条目列表 */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-5 w-2/3 mb-2" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))
        ) : levelItems.length === 0 && activeLevel !== "chapter" ? (
          <EmptyState
            icon={currentLevelDef.icon}
            title={`还没有${currentLevelDef.label}`}
            description={currentLevelDef.description}
            action={
              <Button onClick={openCreate} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                创建第一条
              </Button>
            }
          />
        ) : activeLevel === "chapter" ? (
          /* 章节视图：按 arc 分组 */
          <>
            {/* 无 arc 的独立章节 */}
            {getChildren("").filter((c) => c.level === "chapter").length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-muted-foreground mb-2 px-1">
                  未分组章节
                </p>
                {getChildren("").filter((c) => c.level === "chapter").map((ch) => (
                  <OutlineCard
                    key={ch.id}
                    item={ch}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onMove={handleMove}
                    onStatusChange={handleStatusChange}
                    getStatusBadge={getStatusBadge}
                    showArcGroup={false}
                  />
                ))}
              </div>
            )}

            {/* 按 arc 分组 */}
            {outlines
              .filter((o) => o.level === "arc")
              .sort((a, b) => a.order - b.order)
              .map((arc) => {
                const chapters = getChildren(arc.id);
                const isExpanded = expandedArcs.has(arc.id);

                return (
                  <Card key={arc.id} className="overflow-hidden">
                    <button
                      className="flex items-center gap-3 w-full p-4 hover:bg-accent/30 transition-smooth text-left"
                      onClick={() => toggleArc(arc.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{arc.title}</span>
                        <span className="text-sm text-muted-foreground ml-2">
                          {chapters.length} 章
                        </span>
                      </div>
                      {getStatusBadge(arc.status)}
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border px-4 pb-3 pt-2 space-y-2">
                        {chapters.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-3">
                            此篇章下还没有章节大纲
                          </p>
                        ) : (
                          chapters.map((ch) => (
                            <OutlineCard
                              key={ch.id}
                              item={ch}
                              onEdit={openEdit}
                              onDelete={handleDelete}
                              onMove={handleMove}
                              onStatusChange={handleStatusChange}
                              getStatusBadge={getStatusBadge}
                              showArcGroup={true}
                            />
                          ))
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-sm text-muted-foreground gap-1"
                          onClick={() => {
                            setActiveLevel("chapter");
                            setForm({
                              title: "",
                              content: "",
                              level: "chapter",
                              status: "draft",
                              parentId: arc.id,
                            });
                            setEditingId(null);
                            setDialogOpen(true);
                          }}
                        >
                          <Plus className="h-3 w-3" />
                          在此篇章下添加章节
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}

            {levelItems.length === 0 && (
              <EmptyState
                icon={FileText}
                title="还没有章节大纲"
                description="先在「篇章」层级规划好卷/篇结构，再回来添加详细章节"
                action={
                  <Button
                    onClick={() => setActiveLevel("arc")}
                    variant="outline"
                    className="gap-2"
                  >
                    <Layers className="h-4 w-4" />
                    先去规划篇章
                  </Button>
                }
              />
            )}
          </>
        ) : (
          /* 非 chapter 层级的普通列表 */
          levelItems
            .sort((a, b) => a.order - b.order)
            .map((item) => (
              <OutlineCard
                key={item.id}
                item={item}
                onEdit={openEdit}
                onDelete={handleDelete}
                onMove={handleMove}
                onStatusChange={handleStatusChange}
                getStatusBadge={getStatusBadge}
                showArcGroup={false}
              />
            ))
        )}
      </div>

      {/* 新建/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "编辑" : "新建"}
              {currentLevelDef.label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="outlineTitle">标题 *</Label>
              <Input
                id="outlineTitle"
                placeholder={
                  activeLevel === "brainstorm"
                    ? "如：一个关于背叛与救赎的故事…"
                    : activeLevel === "master"
                      ? "如：主角从平凡到伟大的完整弧光"
                      : activeLevel === "arc"
                        ? "如：第一卷·迷雾之城"
                        : "如：第一章·意外的访客"
                }
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            {activeLevel === "chapter" && parentOptions.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="outlineParent">所属篇章</Label>
                <select
                  id="outlineParent"
                  value={form.parentId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, parentId: e.target.value }))
                  }
                  className="flex h-8 w-full border border-border bg-background px-3 py-2 text-[13px] font-mono text-foreground"
                >
                  <option value="">无（独立章节）</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="outlineContent">
                内容
                {activeLevel === "chapter" && "（可直接作为续写参考）"}
              </Label>
              <Textarea
                id="outlineContent"
                rows={8}
                placeholder={
                  activeLevel === "brainstorm"
                    ? "记录你的灵感和想法…"
                    : activeLevel === "master"
                      ? "描述故事的主线脉络和最终走向…"
                      : activeLevel === "arc"
                        ? "描述这一卷/篇的核心冲突和关键事件…"
                        : "描述本章要写的内容：场景、对话要点、关键事件…"
                }
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="outlineStatus">状态</Label>
              <select
                id="outlineStatus"
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value }))
                }
                className="flex h-8 w-full border border-border bg-background px-3 py-2 text-[13px] font-mono text-foreground"
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={!form.title.trim() || saving}
            >
              {saving ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {ConfirmDialog}
    </div>
  );
}

// ============================================================
// 大纲卡片子组件
// ============================================================

function OutlineCard({
  item,
  onEdit,
  onDelete,
  onMove,
  onStatusChange,
  getStatusBadge,
  showArcGroup,
}: {
  item: OutlineItem;
  onEdit: (item: OutlineItem) => void;
  onDelete: (id: string) => void;
  onMove: (item: OutlineItem, direction: "up" | "down") => void;
  onStatusChange: (item: OutlineItem, status: string) => void;
  getStatusBadge: (status: string) => React.ReactNode;
  showArcGroup: boolean;
}) {
  const [showQuickStatus, setShowQuickStatus] = useState(false);

  return (
    <Card
      key={item.id}
      className="hover:shadow-sm transition-smooth group relative"
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* 排序按钮 */}
          <div className="flex flex-col gap-0.5 pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              className="h-4 w-4 flex items-center justify-center rounded hover:bg-accent text-muted-foreground"
              onClick={() => onMove(item, "up")}
              title="上移"
            >
              <ArrowUp className="h-3 w-3" />
            </button>
            <button
              className="h-4 w-4 flex items-center justify-center rounded hover:bg-accent text-muted-foreground"
              onClick={() => onMove(item, "down")}
              title="下移"
            >
              <ArrowDown className="h-3 w-3" />
            </button>
          </div>

          {/* 内容 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <h4 className="text-sm font-medium truncate">{item.title}</h4>
                {item.status !== "draft" && (
                  <span className="shrink-0">{getStatusBadge(item.status)}</span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onEdit(item)}
                  title="编辑"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => onDelete(item.id)}
                  title="删除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* 内容预览 */}
            {item.content && (
              <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2 whitespace-pre-wrap">
                {item.content}
              </p>
            )}

            {/* 底部操作栏 */}
            <div className="flex items-center gap-2 mt-2">
              {/* 快速状态切换 */}
              <div className="relative">
                <button
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                  onClick={() => setShowQuickStatus(!showQuickStatus)}
                >
                  {getStatusBadge(item.status)}
                </button>
                {showQuickStatus && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowQuickStatus(false)}
                    />
                    <div className="absolute left-0 top-full mt-1 z-20 bg-card border border-border shadow-md p-1 min-w-[100px]">
                      {statusOptions.map((opt) => (
                        <button
                          key={opt.value}
                          className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent ${
                            item.status === opt.value ? "bg-card" : ""
                          }`}
                          onClick={() => {
                            onStatusChange(item, opt.value);
                            setShowQuickStatus(false);
                          }}
                        >
                          <opt.icon className={`h-3 w-3 ${opt.color}`} />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {item.level === "chapter" && item.parentId && showArcGroup && (
                <span className="text-sm text-muted-foreground/60">
                  编号 #{String(item.order).padStart(3, "0")}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
