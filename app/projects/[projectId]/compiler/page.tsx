// app/projects/[projectId]/compiler/page.tsx
// 文档汇编器 — 优化布局

"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  FileText, CheckSquare, Square, Loader2, Sparkles,
  BookMarked, User, Tag, Download, Eye, EyeOff, AlertCircle,
  CheckCircle2, ChevronDown, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { SharedSubNav } from "@/components/shared-sub-nav";

interface MessageItem { id: string; role: string; content: string; characterName?: string; createdAt: string; }

const DOC_TYPES = [
  { value: "mission", label: "任务报告", icon: BookMarked, color: "text-blue-500" },
  { value: "report", label: "调查报告", icon: FileText, color: "text-purple-500" },
  { value: "interview", label: "访谈记录", icon: User, color: "text-green-500" },
  { value: "log", label: "行动日志", icon: FileText, color: "text-orange-500" },
  { value: "assessment", label: "评估报告", icon: AlertCircle, color: "text-red-500" },
  { value: "item", label: "物品描述", icon: Tag, color: "text-cyan-500" },
  { value: "event", label: "事件记录", icon: Sparkles, color: "text-amber-500" },
];

export default function CompilerPage() {
  const params = useParams(); const router = useRouter();
  const projectId = params.projectId as string;

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [characters, setCharacters] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [docType, setDocType] = useState("mission");
  const [title, setTitle] = useState("");
  const [writerId, setWriterId] = useState("");
  const [compiling, setCompiling] = useState(false);
  const [compiledContent, setCompiledContent] = useState("");
  const [compiledCode, setCompiledCode] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [showMsgPanel, setShowMsgPanel] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}/messages?limit=200`).then(r => r.json()),
      fetch(`/api/projects/${projectId}/characters`).then(r => r.json()),
    ]).then(([msgData, charData]) => {
      if (msgData.success) {
        const items = msgData.data.items.map((m: Record<string, unknown>) => {
          let characterName: string | undefined;
          if (typeof m.metadata === "string") { try { const meta = JSON.parse(m.metadata); if (meta.characterName) characterName = meta.characterName; } catch {} }
          return { ...m, characterName };
        });
        setMessages(items);
      }
      if (charData.success) setCharacters(charData.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, [projectId]);

  const toggleSelect = (id: string) => setSelectedIds(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleSelectAll = () => { if (selectAll) { setSelectedIds(new Set()); setSelectAll(false); } else { setSelectedIds(new Set(messages.map(m => m.id))); setSelectAll(true); } };

  const handleCompile = async () => {
    if (selectedIds.size === 0 || !title.trim()) return;
    setCompiling(true); setCompiledContent(""); setShowPreview(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/compile`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageIds: Array.from(selectedIds), docType, title: title.trim(), writerId: writerId || undefined }),
      });
      const data = await res.json();
      if (data.success) { setCompiledContent(data.data.content); setCompiledCode(data.data.code); toast({ title: "汇编完成", description: data.message }); }
      else toast({ title: "失败", description: data.error, variant: "destructive" });
    } catch { toast({ title: "失败", variant: "destructive" }); }
    finally { setCompiling(false); }
  };

  const handleSaveArchive = async () => {
    if (!compiledContent) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/missions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), code: compiledCode, type: docType, content: compiledContent, writerId: writerId || null, status: "review" }),
      });
      const data = await res.json();
      if (data.success) { toast({ title: "档案已创建", description: `编号：${compiledCode}` }); setCompiledContent(""); setCompiledCode(""); setSelectedIds(new Set()); setShowPreview(false); }
      else toast({ title: "存档失败", description: data.error, variant: "destructive" });
    } catch { toast({ title: "存档失败", variant: "destructive" }); }
  };

  const getMsgPreview = (c: string) => c.replace(/@(\S+)/g, "$1").replace(/\n/g, " ").trim().slice(0, 80);

  const selectedMsgs = messages.filter(m => selectedIds.has(m.id));
  const totalChars = selectedMsgs.reduce((s, m) => s + m.content.length, 0);

  return (
    <>
      <SharedSubNav tabs={[
        { label: "汇编", href: `/projects/${projectId}/compiler` },
        { label: "档案", href: `/projects/${projectId}/archives` },
      ]} />
      <div className="flex-1 h-full flex flex-col animate-fade-up">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div><h2 className="text-lg font-bold">文档汇编器</h2><p className="text-sm text-muted-foreground">将对话产出自动汇编为规范档案</p></div>
        <Button variant="outline" size="sm" className="h-7 text-sm gap-1.5" onClick={() => router.push(`/projects/${projectId}/archives`)}>
          <BookMarked className="h-3.5 w-3.5" /> 档案工作台
        </Button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* 左侧：消息选择 */}
        <div className={`flex flex-col border-r border-border ${showMsgPanel ? "w-72" : "w-0 overflow-hidden"}`}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
            <span className="text-sm font-medium text-muted-foreground">对话记录</span>
            <button onClick={toggleSelectAll} className="text-sm text-primary hover:underline">{selectAll ? "取消全选" : "全选"}</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">暂无消息</p>
            ) : messages.map(m => {
              const sel = selectedIds.has(m.id);
              return (
                <button key={m.id} onClick={() => toggleSelect(m.id)}
                  className={`w-full text-left p-2 border text-sm transition-smooth flex items-start gap-1.5 ${sel ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                >
                  <span className="mt-0.5 shrink-0">{sel ? <CheckSquare className="h-3 w-3 text-primary" /> : <Square className="h-3 w-3 text-muted-foreground" />}</span>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-muted-foreground">{m.role === "assistant" ? (m.characterName || "AI") : "用户"}</span>
                    <p className="text-muted-foreground/80 truncate mt-0.5">{getMsgPreview(m.content)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 中间：配置 + 预览 */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto p-4 space-y-4">
          {/* 档案类型 */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">档案类型</CardTitle></CardHeader>
            <CardContent><div className="flex flex-wrap gap-1.5">
              {DOC_TYPES.map(dt => (
                <button key={dt.value} onClick={() => setDocType(dt.value)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 border text-sm transition-smooth ${docType === dt.value ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                ><dt.icon className={`h-3 w-3 ${dt.color}`} />{dt.label}</button>
              ))}
            </div></CardContent>
          </Card>

          {/* 元数据 */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">元数据</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1 space-y-1"><Label className="text-sm">档案标题</Label><Input value={title} onChange={e => setTitle(e.target.value)} className="h-8 text-sm" placeholder="如：明知山低语效应调查" /></div>
                <div className="w-40 space-y-1"><Label className="text-sm">撰写人</Label>
                  <select value={writerId} onChange={e => setWriterId(e.target.value)} className="flex h-8 w-full border border-input bg-background px-2 text-sm">
                    <option value="">未指定</option>
                    {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <CheckSquare className="h-3 w-3" /> 已选 <strong>{selectedIds.size}</strong> 条 · {totalChars.toLocaleString()} 字
                </div>
                <Button onClick={handleCompile} disabled={compiling || selectedIds.size === 0 || !title.trim()} size="sm" className="h-8 text-sm gap-1.5 ml-auto">
                  {compiling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {compiling ? "汇编中…" : "汇编为档案"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 汇编预览 */}
          {compiledContent && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    汇编结果
                    {compiledCode && <Badge variant="secondary" className="text-sm">{compiledCode}</Badge>}
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-6 text-sm gap-1" onClick={() => { navigator.clipboard.writeText(compiledContent); toast({ title: "已复制" }); }}>
                      <Download className="h-3 w-3" /> 复制
                    </Button>
                    <Button size="sm" className="h-6 text-sm gap-1" onClick={handleSaveArchive}>
                      <BookMarked className="h-3 w-3" /> 保存为档案
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-card p-3 border border-border max-h-96 overflow-y-auto">
                  <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{compiledContent}</pre>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div></>
  );
}
