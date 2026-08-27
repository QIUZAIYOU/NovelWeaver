// app/projects/[projectId]/mcp-servers/page.tsx
// MCP 服务器管理 — 卡片网格布局

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Edit3, Trash2, Loader2, Server, Wifi, Terminal, Globe, Power, PowerOff, Wrench } from "lucide-react";
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
import { SharedSubNav } from "@/components/shared-sub-nav";

interface McpServerItem { id: string; name: string; transport: string; command: string; args: string; url: string; apiKey: string; tools: string; isActive: boolean; }

const TRANSPORT_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  stdio: { label: "Stdio", icon: Terminal, color: "bg-blue-100 dark:bg-blue-900/30 text-blue-600" },
  http: { label: "HTTP", icon: Globe, color: "bg-green-100 dark:bg-green-900/30 text-green-600" },
  sse: { label: "SSE", icon: Wifi, color: "bg-purple-100 dark:bg-purple-900/30 text-purple-600" },
};

export default function McpServersPage() {
  const params = useParams(); const router = useRouter();
  const projectId = params.projectId as string;
  const [servers, setServers] = useState<McpServerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", transport: "stdio", command: "", args: "", url: "", apiKey: "", toolsStr: "" });
  const [saving, setSaving] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();

  const load = useCallback(async () => {
    try { const r = await fetch(`/api/projects/${projectId}/mcp-servers`); const d = await r.json(); if (d.success) setServers(d.data); }
    catch {} finally { setLoading(false); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditingId(null); setForm({ name: "", transport: "stdio", command: "", args: "", url: "", apiKey: "", toolsStr: "" }); setDialogOpen(true); };
  const openEdit = (s: McpServerItem) => { setEditingId(s.id); const tools = JSON.parse(s.tools || "[]"); setForm({ name: s.name, transport: s.transport, command: s.command, args: s.args, url: s.url, apiKey: s.apiKey, toolsStr: tools.join("\n") }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return; setSaving(true);
    const payload = { ...form, tools: form.toolsStr.split("\n").map(s => s.trim()).filter(Boolean), args: form.args.split(" ").filter(Boolean) };
    try {
      const url = editingId ? `/api/projects/${projectId}/mcp-servers/${editingId}` : `/api/projects/${projectId}/mcp-servers`;
      const r = await fetch(url, { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (d.success) { setDialogOpen(false); load(); toast({ title: editingId ? "已更新" : "已创建" }); }
      else toast({ title: d.error || "失败", variant: "destructive" });
    } catch { toast({ title: "保存失败", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!await confirm({ title: "删除服务器", description: "确定删除吗？" })) return;
    try { await fetch(`/api/projects/${projectId}/mcp-servers/${id}`, { method: "DELETE" }); load(); }
    catch { toast({ title: "删除失败", variant: "destructive" }); }
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
        <div><h2 className="text-lg font-bold">MCP 服务器</h2><p className="text-sm text-muted-foreground">管理智能体可调用的外部工具端点</p></div>
        <Button size="sm" className="h-8 text-sm gap-1.5" onClick={openCreate}><Plus className="h-3.5 w-3.5" /> 添加</Button>
      </div>
      <div className="flex-1 overflow-y-auto p-6 animate-fade-up">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : servers.length === 0 ? (
          <EmptyState icon={Server} title="还没有 MCP 服务器" description="添加 MCP 服务器让智能体调用外部工具" action={<Button onClick={openCreate} variant="outline" size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> 添加</Button>} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {servers.map(s => {
              const meta = TRANSPORT_META[s.transport] || { label: s.transport, icon: Terminal, color: "bg-gray-100 text-gray-600" };
              const tools = JSON.parse(s.tools || "[]") as string[];
              const Icon = meta.icon;
              return (
                <Card key={s.id} className={`group hover:shadow-sm transition-smooth ${!s.isActive ? "opacity-60" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <div className={`w-10 h-10 ${meta.color} flex items-center justify-center shrink-0`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold truncate">{s.name}</span>
                            {s.isActive ? <Badge variant="secondary" className="text-sm bg-green-100 text-green-700">在线</Badge> : <Badge variant="secondary" className="text-sm">离线</Badge>}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Badge variant="outline" className="text-sm">{meta.label}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5 font-mono truncate">
                            {s.transport === "stdio" ? `${s.command} ${s.args}` : s.url}
                          </p>
                          {tools.length > 0 && (
                            <div className="flex flex-wrap gap-0.5 mt-1">
                              {tools.slice(0, 4).map(t => <Badge key={t} variant="secondary" className="text-[7px] gap-0.5"><Wrench className="h-2 w-2" />{t}</Badge>)}
                              {tools.length > 4 && <Badge variant="secondary" className="text-[7px]">+{tools.length - 4}</Badge>}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground" onClick={() => openEdit(s)} aria-label="编辑"><Edit3 className="h-3.5 w-3.5" /></button>
                        <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(s.id)} aria-label="删除"><Trash2 className="h-3.5 w-3.5" /></button>
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
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "编辑" : "添加"} MCP 服务器</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label className="text-sm">名称</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-sm" /></div>
            <div className="flex gap-2">{[["stdio","🧰 Stdio"],["http","🌐 HTTP"],["sse","📡 SSE"]].map(([v, label]) => (
              <button key={v} onClick={() => setForm(f => ({ ...f, transport: v }))} className={`flex-1 py-1.5 text-sm rounded border transition-smooth ${form.transport === v ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}>{label}</button>
            ))}</div>
            {form.transport === "stdio" ? (<>
              <div className="space-y-1"><Label className="text-sm">执行命令</Label><Input value={form.command} onChange={e => setForm(f => ({ ...f, command: e.target.value }))} className="h-8 text-sm font-mono" /></div>
              <div className="space-y-1"><Label className="text-sm">启动参数</Label><Input value={form.args} onChange={e => setForm(f => ({ ...f, args: e.target.value }))} className="h-8 text-sm font-mono" /></div>
            </>) : (<div className="space-y-1"><Label className="text-sm">端点 URL</Label><Input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} className="h-8 text-sm font-mono" /></div>)}
            <div className="space-y-1"><Label className="text-sm">API Key</Label><Input type="password" value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-sm">可用工具（每行一个）</Label><Textarea value={form.toolsStr} onChange={e => setForm(f => ({ ...f, toolsStr: e.target.value }))} rows={3} className="text-sm font-mono" /></div>
          </div>
          <DialogFooter><Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button><Button size="sm" onClick={handleSave} disabled={!form.name.trim() || saving}>{saving ? "保存中…" : "保存"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </div></>
  );
}
