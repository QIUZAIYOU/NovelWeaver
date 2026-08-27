// app/projects/[projectId]/skills/page.tsx
// 技能管理 — 卡片网格布局

"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Edit3, Trash2, Loader2, Zap, Sparkles, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { useScrollPreservation } from "@/hooks/use-scroll-preservation";
import { SharedSubNav } from "@/components/shared-sub-nav";

interface SkillItem { id: string; name: string; description: string; category: string; prompt: string; }

const CATEGORIES: Record<string, { label: string; color: string }> = {
  general: { label: "通用", color: "bg-gray-100 dark:bg-gray-900/30 text-gray-600" },
  writing: { label: "写作", color: "bg-green-100 dark:bg-green-900/30 text-green-600" },
  research: { label: "调研", color: "bg-blue-100 dark:bg-blue-900/30 text-blue-600" },
  analysis: { label: "分析", color: "bg-purple-100 dark:bg-purple-900/30 text-purple-600" },
  technical: { label: "技术", color: "bg-orange-100 dark:bg-orange-900/30 text-orange-600" },
};

export default function SkillsPage() {
  const params = useParams(); const router = useRouter();
  const projectId = params.projectId as string;
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", category: "general", prompt: "" });
  const [saving, setSaving] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();
  useScrollPreservation(dialogOpen);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{ name: string; description: string; category: string; prompt: string }[]>([]);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { const r = await fetch(`/api/projects/${projectId}/skills`); const d = await r.json(); if (d.success) setSkills(d.data); }
    catch {} finally { setLoading(false); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditingId(null); setForm({ name: "", description: "", category: "general", prompt: "" }); setDialogOpen(true); };
  const openEdit = (s: SkillItem) => { setEditingId(s.id); setForm({ name: s.name, description: s.description, category: s.category, prompt: s.prompt }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return; setSaving(true);
    try {
      const url = editingId ? `/api/projects/${projectId}/skills/${editingId}` : `/api/projects/${projectId}/skills`;
      const r = await fetch(url, { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await r.json();
      if (d.success) { setDialogOpen(false); load(); toast({ title: editingId ? "已更新" : "已创建" }); }
      else toast({ title: d.error || "失败", variant: "destructive" });
    } catch (e: unknown) { toast({ title: "保存失败", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!await confirm({ title: "删除技能", description: "确定吗？" })) return;
    try { await fetch(`/api/projects/${projectId}/skills/${id}`, { method: "DELETE" }); load(); }
    catch { toast({ title: "删除失败", variant: "destructive" }); }
  };

  /** 解析 Markdown frontmatter（自动剥离代码块包装） */
  const parseMarkdown = (text: string): { name: string; description: string; category: string; prompt: string } | null => {
    let normalized = text.replace(/\r\n?/g, "\n").trim();
    
    // 剥离可能的代码块包装（```yaml  ...  ```）
    normalized = normalized.replace(/^```\w*\n?/, "").replace(/\n```\s*$/, "").trim();

    // 1. 尝试前注解析：查找 --- 之间的内容
    if (normalized.startsWith("---\n")) {
      const endIdx = normalized.indexOf("\n---\n", 4);
      if (endIdx > 0) {
        const yamlBlock = normalized.slice(4, endIdx);
        const body = normalized.slice(endIdx + 5).trim();
        const frontmatter: Record<string, string> = {};
        for (const line of yamlBlock.split("\n")) {
          const sep = line.indexOf(":");
          if (sep > 0) {
            const key = line.slice(0, sep).trim();
            const val = line.slice(sep + 1).trim();
            if (key) frontmatter[key] = val;
          }
        }
        const name = frontmatter.name || frontmatter.title || "";
        if (name) {
          return {
            name,
            description: frontmatter.description || "",
            category: ["writing","research","analysis","technical","general"].includes(frontmatter.category) ? frontmatter.category : "general",
            prompt: body,
          };
        }
      }
    }

    // 降级：从第一个 # 标题提取名称
    const headingMatch = normalized.match(/^#\s+(.+)/m);
    if (headingMatch) {
      const name = headingMatch[1].replace(/[：:].*$/, "").trim();
      if (name) {
        return { name, description: "", category: "general", prompt: normalized };
      }
    }

    return null;
  };

  /** 批量导入（支持 .md frontmatter 和 JSON） */
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      let items: { name: string; description: string; category: string; prompt: string }[] = [];

      // 尝试解析为 JSON
      try {
        const data = JSON.parse(text);
        const raw = Array.isArray(data) ? data : (data.skills || data.items || []);
        if (Array.isArray(raw)) items = raw.filter((i: unknown) => i && typeof i === "object").map((i: Record<string, unknown>) => ({
          name: String(i.name || ""), description: String(i.description || ""),
          category: ["writing", "research", "analysis", "technical", "general"].includes(String(i.category)) ? String(i.category) : "general",
          prompt: String(i.prompt || ""),
        })).filter(i => i.name);
      } catch {
        // 不是 JSON，尝试作为 .md frontmatter 解析
        const parsed = parseMarkdown(text);
        if (parsed) items = [parsed];
      }

      if (items.length === 0) { toast({ title: "未找到有效的技能数据", variant: "destructive" }); return; }

      // 预览对话框
      setImportPreview(items);
      setImportDialogOpen(true);
    } catch {
      toast({ title: "文件解析失败", variant: "destructive" });
    } finally { setImporting(false); }
  };

  /** 确认导入 */
  const handleImportConfirm = async () => {
    if (importPreview.length === 0) return;
    setImporting(true);
    let success = 0, fail = 0;
    for (const item of importPreview) {
      try {
        await fetch(`/api/projects/${projectId}/skills`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: item.name, description: item.description, category: item.category, prompt: item.prompt }),
        });
        success++;
      } catch { fail++; }
    }
    toast({ title: `导入完成：${success} 成功${fail > 0 ? `，${fail} 失败` : ""}` });
    setImportDialogOpen(false);
    setImportPreview([]);
    load();
    setImporting(false);
  };

  /** 下载导入模板 */
  const handleDownloadTemplate = () => {
    const template = [
      { name: "示例技能", description: "技能描述", category: "writing", prompt: "技能提示词内容…" },
      { name: "另一个技能", description: "描述", category: "analysis", prompt: "提示词…" },
    ];
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "技能导入模板.json";
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <>
      <SharedSubNav tabs={[
        { label: "智能体", href: `/projects/${projectId}/agents` },
        { label: "MCP", href: `/projects/${projectId}/mcp-servers` },
        { label: "技能", href: `/projects/${projectId}/skills` },
      ]} />
      <div className="flex-1 h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div><h2 className="text-lg font-bold">技能</h2><p className="text-sm text-muted-foreground">定义可复用的智能体能力</p></div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".json,.md" onChange={handleImport} className="hidden" />
          <Button variant="outline" size="sm" className="h-8 text-sm gap-1.5" onClick={handleDownloadTemplate}><Download className="h-3.5 w-3.5" /> 模板</Button>
          <Button variant="outline" size="sm" className="h-8 text-sm gap-1.5" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} 导入
          </Button>
          <Button size="sm" className="h-8 text-sm gap-1.5" onClick={openCreate}><Plus className="h-3.5 w-3.5" /> 新建</Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6 animate-fade-up">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : skills.length === 0 ? (
          <EmptyState icon={Zap} title="还没有技能" description="定义技能后可在智能体配置中选择引用" action={<Button onClick={openCreate} variant="outline" size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> 新建</Button>} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {skills.map(s => {
              const cat = CATEGORIES[s.category] || CATEGORIES.general;
              const catColors: Record<string, string> = {
                general: "bg-muted text-muted-foreground",
                writing: "bg-[#00cc66]/10 text-[#00cc66]",
                research: "bg-[#00aaff]/10 text-[#00aaff]",
                analysis: "bg-[#aa66ff]/10 text-[#aa66ff]",
                technical: "bg-[#ff8800]/10 text-[#ff8800]",
              };
              return (
                <Card key={s.id} className="group border border-border bg-card hover:border-border transition-colors">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {/* 分类标签 + 描述 */}
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[11px] font-mono whitespace-nowrap px-1.5 py-0.5 ${catColors[s.category] || catColors.general}`}>
                            {cat.label}
                          </span>
                          {s.description && (
                            <span className="flex-1 min-w-0 text-[12px] font-mono text-muted-foreground/60 truncate">{s.description}</span>
                          )}
                        </div>
                        {/* 名称 */}
                        <div className="flex items-center gap-1">
                          <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="text-[13px] font-mono text-foreground truncate">{s.name}</span>
                        </div>
                        {/* 提示词预览 */}
                        {s.prompt && (
                          <div className="mt-1 text-[12px] font-mono text-muted-foreground/70 leading-relaxed line-clamp-2 break-all overflow-hidden bg-background px-2 py-1 border border-border">
                            {s.prompt.slice(0, 200)}
                          </div>
                        )}
                      </div>
                      {/* 操作按钮 */}
                      <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
                        <button className="h-6 w-6 flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors" onClick={() => openEdit(s)} title="编辑" aria-label="编辑">
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button className="h-6 w-6 flex items-center justify-center text-muted-foreground/60 hover:text-[#ff4444] hover:bg-muted transition-colors" onClick={() => handleDelete(s.id)} title="删除" aria-label="删除">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "编辑" : "新建"}技能</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex gap-3 items-end">
              <div className="flex-1 space-y-1"><Label className="text-sm">名称</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-sm" /></div>
              <div className="w-28 space-y-1"><Label className="text-sm">分类</Label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="flex h-8 w-full border border-border bg-background px-2.5 text-[13px] font-mono text-foreground">
                  {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1"><Label className="text-sm">描述</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="text-sm" /></div>
            <div className="space-y-1"><Label className="text-sm">技能提示词</Label><Textarea value={form.prompt} onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))} rows={4} className="text-sm" /></div>
          </div>
          <DialogFooter><Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button><Button size="sm" onClick={handleSave} disabled={!form.name.trim() || saving}>{saving ? "保存中…" : "保存"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 导入预览 */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-md max-h-[70vh] overflow-y-auto">
          <DialogHeader><DialogTitle>导入技能（{importPreview.length} 条）</DialogTitle></DialogHeader>
          <div className="space-y-1.5 py-2 overflow-hidden">
            {importPreview.slice(0, 30).map((item, i) => {
              const catMeta = CATEGORIES[item.category] || CATEGORIES.general;
              return (
              <div key={i} className="flex items-center gap-2 p-2 rounded border border-border text-sm w-full">
                <span className={`text-sm font-medium px-1.5 py-0.5 rounded shrink-0 ${catMeta.color} ${catMeta.color.includes("dark:") ? "bg-opacity-20" : ""}`}
                  style={{ backgroundColor: item.category === "general" ? "#e5e7eb" : item.category === "writing" ? "#d1fae5" : item.category === "research" ? "#dbeafe" : item.category === "analysis" ? "#f3e8ff" : "#fed7aa" }}
                >{catMeta.label}</span>
                <span className="font-medium truncate shrink-0 max-w-[120px]">{item.name}</span>
                {item.description && <span className="text-muted-foreground truncate min-w-0 flex-1">{item.description}</span>}
              </div>
              );
            })}
            {importPreview.length > 30 && <p className="text-sm text-muted-foreground text-center py-1">…还有 {importPreview.length - 30} 条</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(false)}>取消</Button>
            <Button size="sm" onClick={handleImportConfirm} disabled={importing} className="min-w-[100px]">{importing ? "导入中…" : `导入 ${importPreview.length} 条`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {ConfirmDialog}
    </div></>
  );
}
