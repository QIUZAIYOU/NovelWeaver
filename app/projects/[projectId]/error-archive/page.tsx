// app/projects/[projectId]/error-archive/page.tsx
// 错误沉淀管理页

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Plus, AlertCircle, CheckCircle2, XCircle, Filter, Trash2,
  Bug, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/hooks/use-toast";
import { formatRelativeTime } from "@/lib/utils";

import { useConfirm } from "@/hooks/use-confirm";
import { SharedSubNav } from "@/components/shared-sub-nav";

interface ErrorItem {
  id: string; category: string; content: string; context: string;
  severity: string; resolved: boolean; createdAt: string;
}

const categories = [
  { value: "ooc", label: "角色 OOC", color: "text-red-500" },
  { value: "logic", label: "逻辑矛盾", color: "text-orange-500" },
  { value: "style", label: "风格问题", color: "text-yellow-500" },
  { value: "fact", label: "事实错误", color: "text-blue-500" },
  { value: "other", label: "其他", color: "text-gray-500" },
];

const severities = [
  { value: "minor", label: "轻微", color: "bg-gray-500" },
  { value: "major", label: "重要", color: "bg-orange-500" },
  { value: "critical", label: "严重", color: "bg-red-500" },
];

export default function ErrorArchivePage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [items, setItems] = useState<ErrorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ category: "other", content: "", context: "", severity: "minor" });
  const [saving, setSaving] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();

  const loadItems = useCallback(async () => {
    try {
      const url = filterCategory ? `/api/projects/${projectId}/error-archive?category=${filterCategory}` : `/api/projects/${projectId}/error-archive`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) setItems(data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [projectId, filterCategory]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleCreate = async () => {
    if (!form.content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/error-archive`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setDialogOpen(false);
        setForm({ category: "other", content: "", context: "", severity: "minor" });
        loadItems();
        toast({ title: "错误记录已创建", variant: "success" });
      }
    } catch { toast({ title: "创建失败", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleResolve = async (id: string, resolved: boolean) => {
    try {
      await fetch(`/api/projects/${projectId}/error-archive/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved }),
      });
      loadItems();
    } catch { toast({ title: "更新失败", variant: "destructive" }); }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "删除记录",
      description: "确定要删除这条记录吗？",
      confirmText: "删除",
    });
    if (!ok) return;
    try {
      await fetch(`/api/projects/${projectId}/error-archive/${id}`, { method: "DELETE" });
      loadItems();
    } catch { toast({ title: "删除失败", variant: "destructive" }); }
  };

  const getCategoryInfo = (val: string) => categories.find(c => c.value === val) || categories[4];
  const getSeverityInfo = (val: string) => severities.find(s => s.value === val) || severities[0];

  const unresolved = items.filter(i => !i.resolved).length;

  return (
    <>
      <SharedSubNav tabs={[
        { label: "角色", href: `/projects/${projectId}/characters` },
        { label: "世界观", href: `/projects/${projectId}/lore` },
        { label: "文风", href: `/projects/${projectId}/style` },
        { label: "记忆", href: `/projects/${projectId}/memory` },
        { label: "错误", href: `/projects/${projectId}/error-archive` },
      ]} />
      <div className="flex-1 space-y-6 p-6 md:p-8 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">错误沉淀</h2>
          <p className="text-muted-foreground mt-1">记录和跟踪创作中的问题，避免 AI 重复犯错</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> 新增记录
        </Button>
      </div>

      {/* 过滤器 */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
          className="border border-border bg-background px-3 py-2 text-[13px] font-mono text-foreground">
          <option value="">全部分类</option>
          {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {unresolved > 0 && <Badge variant="secondary">{unresolved} 未解决</Badge>}
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
        ) : items.length === 0 ? (
          <EmptyState icon={Bug} title="还没有错误记录" description="AI 审核或手动添加的问题会出现在这里" action={
            <Button onClick={() => setDialogOpen(true)} variant="outline" className="gap-2"><Plus className="h-4 w-4" /> 添加记录</Button>
          } />
        ) : items.map(item => {
          const cat = getCategoryInfo(item.category);
          const sev = getSeverityInfo(item.severity);
          return (
            <Card key={item.id} className={`border-l-4 ${item.resolved ? 'border-l-green-400 opacity-60' : `border-l-red-400`}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium ${cat.color}`}>{cat.label}</span>
                    <Badge variant="secondary" className={`text-sm text-white ${sev.color}`}>{sev.label}</Badge>
                    {item.resolved && <Badge variant="outline" className="text-sm text-green-600">已解决</Badge>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!item.resolved && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={() => handleResolve(item.id, true)} title="标记已解决">
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    )}
                    {item.resolved && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleResolve(item.id, false)} title="重新打开">
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(item.id)} title="删除">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm mt-1">{item.content}</p>
                {item.context && <p className="text-sm text-muted-foreground mt-1 italic bg-card p-2 rounded">引用：{item.context}</p>}
                <p className="text-sm text-muted-foreground/60 mt-1">{formatRelativeTime(item.createdAt)}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增错误记录</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>分类</Label>
                <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                  className="flex h-8 w-full border border-border bg-background px-3 py-2 text-[13px] font-mono text-foreground">
                  {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>严重程度</Label>
                <select value={form.severity} onChange={(e) => setForm(f => ({ ...f, severity: e.target.value }))}
                  className="flex h-8 w-full border border-border bg-background px-3 py-2 text-[13px] font-mono text-foreground">
                  {severities.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>问题描述 *</Label>
              <Textarea rows={3} value={form.content} onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))} placeholder="描述发现的问题…" />
            </div>
            <div className="space-y-2">
              <Label>上下文/引用原文</Label>
              <Textarea rows={3} value={form.context} onChange={(e) => setForm(f => ({ ...f, context: e.target.value }))} placeholder="引用相关原文以便参考…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={!form.content.trim() || saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {ConfirmDialog}
    </div></>
  );
}
