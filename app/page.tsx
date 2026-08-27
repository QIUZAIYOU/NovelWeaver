// app/page.tsx
// 首页 Dashboard — 项目列表与全局统计

"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Plus, BookOpen, Users, Globe, Brain, FileText,
  Sparkles, Swords, Upload, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAppStore } from "@/stores/app-store";
import { useConfirm } from "@/hooks/use-confirm";
import { ProjectCard } from "@/components/project-card";

// ─── 类型 ───────────────────────────────────────────────────

interface Project {
  id: string; name: string; type: string; description: string;
  createdAt: string; updatedAt: string;
  _count: { characters: number; loreEntries: number; memories: number; messages: number };
}

interface Stats {
  projects: number; characters: number; loreEntries: number; memories: number; messages: number;
}

// ─── 统计卡片配置 ──────────────────────────────────────────

const STAT_CONFIGS = [
  { label: "项目", key: "projects" as const, icon: BookOpen, color: "text-primary" },
  { label: "角色", key: "characters" as const, icon: Users, color: "text-emerald-500" },
  { label: "世界观", key: "loreEntries" as const, icon: Globe, color: "text-violet-500" },
  { label: "记忆", key: "memories" as const, icon: Brain, color: "text-amber-500" },
  { label: "消息", key: "messages" as const, icon: FileText, color: "text-rose-500" },
];

// ─── 页面组件 ─────────────────────────────────────────────

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<Stats>({ projects: 0, characters: 0, loreEntries: 0, memories: 0, messages: 0 });
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", type: "novel", description: "" });
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setCurrentProjectId } = useAppStore();
  const { confirm, ConfirmDialog } = useConfirm();

  useEffect(() => { setCurrentProjectId(null); }, [setCurrentProjectId]);

  const loadProjects = useCallback(async () => {
    try {
      const r = await fetch("/api/projects");
      const d = await r.json();
      if (!d.success) return;
      setProjects(d.data);
      const s: Stats = { projects: d.data.length, characters: 0, loreEntries: 0, memories: 0, messages: 0 };
      for (const p of d.data) {
        s.characters += p._count.characters;
        s.loreEntries += p._count.loreEntries;
        s.memories += p._count.memories;
        s.messages += p._count.messages;
      }
      setStats(s);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const handleCreate = async () => {
    if (!newProject.name.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProject),
      });
      const d = await r.json();
      if (d.success) {
        setDialogOpen(false);
        setNewProject({ name: "", type: "novel", description: "" });
        loadProjects();
        toast({ title: "项目已创建", description: `「${d.data.name}」创建成功` });
      } else {
        toast({ title: d.error || "创建失败", variant: "destructive" });
      }
    } catch {
      toast({ title: "创建失败", variant: "destructive" });
    } finally { setCreating(false); }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const r = await fetch("/api/projects/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const d = await r.json();
      if (d.success) { loadProjects(); toast({ title: "导入成功", description: `「${d.data.name}」已导入` }); }
      else { toast({ title: "导入失败", description: d.error || "请检查文件格式", variant: "destructive" }); }
    } catch {
      toast({ title: "导入失败", description: "请确保文件是有效的 JSON 格式", variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({ title: "删除项目", description: "确定要删除这个项目吗？所有相关数据将被永久删除。", confirmText: "删除" });
    if (!ok) return;
    try { await fetch(`/api/projects/${id}`, { method: "DELETE" }); loadProjects(); toast({ title: "项目已删除" }); }
    catch { toast({ title: "删除失败", variant: "destructive" }); }
  };

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8 max-w-7xl mx-auto w-full bg-background">
      {/* ── 欢迎区域 ── */}
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">欢迎回来</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? "加载中…" : `${stats.projects} 个项目，${stats.characters + stats.loreEntries + stats.memories} 条内容`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={async () => {
            if (projects.length === 0) { toast({ title: "没有可导出的项目" }); return; }
            try {
              const all: Record<string, unknown>[] = [];
              for (const p of projects) {
                const r = await fetch(`/api/projects/${p.id}/export`);
                const d = await r.json();
                if (d.success) all.push(d.data);
              }
              const blob = new Blob([JSON.stringify({ projects: all, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = `novelweaver-export-${Date.now()}.json`;
              a.click(); URL.revokeObjectURL(url);
              toast({ title: `已导出 ${all.length} 个项目` });
            } catch { toast({ title: "导出失败", variant: "destructive" }); }
          }} disabled={loading} className="gap-1.5 h-9 text-xs">
            <Download className="h-3.5 w-3.5" />
            批量导出
          </Button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing} className="gap-1.5 h-9 text-xs">
            <Upload className="h-3.5 w-3.5" />
            {importing ? "导入中…" : "导入"}
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1.5 h-9 text-xs">
            <Plus className="h-3.5 w-3.5" />
            新建项目
          </Button>
        </div>
      </div>

      {/* ── 统计卡片 ── */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5 animate-fade-up" style={{ animationDelay: "60ms" }}>
        {STAT_CONFIGS.map((stat) => (
          <Card key={stat.key} className="hover:shadow-sm transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 pt-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {loading ? (
                <Skeleton className="h-7 w-12" />
              ) : (
                <div className="text-xl font-bold tracking-tight">{stats[stat.key]}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── 项目列表 ── */}
      <div className="animate-fade-up" style={{ animationDelay: "120ms" }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold">我的项目</h3>
          {projects.length > 0 && (
            <span className="text-xs text-muted-foreground">{projects.length} 个</span>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <div className="h-1 bg-card rounded-t-lg" />
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="h-9 w-9" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                  <div className="flex gap-3">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : projects.length === 0 ? (
            <div className="col-span-full">
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 px-6">
                  <div className="w-14 h-14 bg-card flex items-center justify-center mb-4">
                    <BookOpen className="h-7 w-7 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm text-muted-foreground font-medium">还没有项目</p>
                  <p className="text-xs text-muted-foreground/60 mt-1 mb-5">
                    创建你的第一个故事或跑团项目吧
                  </p>
                  <Button onClick={() => setDialogOpen(true)} className="gap-1.5 h-9 text-xs">
                    <Plus className="h-3.5 w-3.5" />
                    创建第一个项目
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : (
            projects.map((project, i) => (
              <ProjectCard
                key={project.id}
                project={project}
                onDelete={handleDelete}
                animationDelay={i * 60}
              />
            ))
          )}
        </div>
      </div>

      {/* ── 新建项目弹窗 ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
            <DialogDescription>创建一个新的小说或跑团项目</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="projectName">项目名称</Label>
              <Input id="projectName" placeholder="如：《星辰大海》或《龙与地下城》" value={newProject.name}
                onChange={(e) => setNewProject((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>项目类型</Label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { type: "novel", label: "小说创作", icon: Sparkles, color: "text-primary" },
                  { type: "trpg", label: "跑团 (TRPG)", icon: Swords, color: "text-orange-500" },
                ].map((opt) => (
                  <button key={opt.type} type="button"
                    onClick={() => setNewProject((p) => ({ ...p, type: opt.type }))}
                    className={`flex flex-col items-center gap-2 border-2 p-4 transition-colors duration-200 ${
                      newProject.type === opt.type
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/30 hover:bg-accent"
                    }`}
                  >
                    <opt.icon className={`h-6 w-6 ${opt.color}`} />
                    <span className="text-xs font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="projectDesc">项目简介（可选）</Label>
              <Textarea id="projectDesc" rows={3} placeholder="简要描述你的故事背景…" value={newProject.description}
                onChange={(e) => setNewProject((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button size="sm" onClick={handleCreate} disabled={!newProject.name.trim() || creating}>
              {creating ? "创建中…" : "创建项目"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {ConfirmDialog}
    </div>
  );
}
