// app/projects/[projectId]/characters/page.tsx
// 角色管理页 - 卡片展示 + CRUD

"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { SharedSubNav } from "@/components/shared-sub-nav";
import type { SubNavTab } from "@/components/shared-sub-nav";
import {
  Plus,
  Users,
  Edit3,
  Trash2,
  Eye,
  EyeOff,
  Tag,
  Sparkles,
  Upload,
  Download,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
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
import { EmptyState } from "@/components/ui/empty-state";
import { useDebounce } from "@/hooks/use-debounce";
import { useScrollToHighlight } from "@/hooks/use-scroll-to-highlight";
import { useScrollPreservation } from "@/hooks/use-scroll-preservation";
import { useConfirm } from "@/hooks/use-confirm";
import { toast } from "@/hooks/use-toast";
import { useSettingsStore } from "@/stores/settings-store";
import { AIGenerateDialog } from "@/components/ai-generate-dialog";

/** 角色类型 */
interface Character {
  id: string;
  name: string;
  age: string;
  appearance: string;
  personality: string;
  backstory: string;
  hiddenLore: string;
  persona: string;
  tags: string;
  status: string;
  createdAt: string;
}

/** 角色表单 */
interface CharacterForm {
  name: string;
  age: string;
  appearance: string;
  personality: string;
  backstory: string;
  hiddenLore: string;
  persona: string;
  status: string;
  tags: string;
}

const STATUS_OPTIONS = [
  { value: "alive", label: "存活", color: "text-[#00cc66] border-[#00cc66]/30" },
  { value: "dead", label: "阵亡", color: "text-[#ff4444] border-[#ff4444]/30" },
  { value: "missing", label: "失踪", color: "text-[#ffaa00] border-[#ffaa00]/30" },
  { value: "unknown", label: "未知", color: "text-muted-foreground border-border" },
];

const emptyForm: CharacterForm = {
  name: "",
  age: "",
  appearance: "",
  personality: "",
  backstory: "",
  hiddenLore: "",
  persona: "",
  status: "alive",
  tags: "",
};

export default function CharactersPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CharacterForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showHidden, setShowHidden] = useState<Record<string, boolean>>({});
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [keywordsGenerating, setKeywordsGenerating] = useState(false);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [optimizingId, setOptimizingId] = useState<string | null>(null);

  // 导入相关状态
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importCharacters, setImportCharacters] = useState<CharacterForm[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importRawFileName, setImportRawFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { confirm, ConfirmDialog } = useConfirm();
  const highlightId = useScrollToHighlight();
  useScrollPreservation(dialogOpen);

  // 搜索相关状态
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  /** 解析标签 */
  const parseTags = (tagsStr: string): string[] => {
    try {
      return JSON.parse(tagsStr);
    } catch {
      return [];
    }
  };

  /** 搜索过滤后的角色列表 */
  const filteredCharacters = characters.filter((char) => {
    if (!debouncedSearch) return true;
    const q = debouncedSearch.toLowerCase();
    return (
      char.name.toLowerCase().includes(q) ||
      char.age.toLowerCase().includes(q) ||
      char.personality.toLowerCase().includes(q) ||
      char.appearance.toLowerCase().includes(q) ||
      char.backstory.toLowerCase().includes(q) ||
      char.persona.toLowerCase().includes(q) ||
      parseTags(char.tags).some((tag) => tag.toLowerCase().includes(q))
    );
  });

  /** 加载角色列表 */
  const loadCharacters = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/characters`);
      const data = await res.json();
      if (data.success) setCharacters(data.data);
    } catch (err) {
      console.error("加载角色失败:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  /** 打开新建弹窗 */
  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  /** 处理 AI 生成的结果 */
  const handleAIGenerate = (data: Record<string, unknown>) => {
    setEditingId(null);
    setForm({
      name: (data.name as string) || "",
      age: (data.age as string) || "",
      appearance: (data.appearance as string) || "",
      personality: (data.personality as string) || "",
      backstory: (data.backstory as string) || "",
      hiddenLore: (data.hiddenLore as string) || "",
      persona: (data.persona as string) || "",
      status: (data.status as string) || "alive",
      tags: "",
    });
    setDialogOpen(true);
  };

  /** AI 自动生成角色标签 */
  const handleGenerateKeywords = async () => {
    if (!form.name && !form.backstory) return;
    setKeywordsGenerating(true);
    const { modelConfig } = useSettingsStore.getState();
    try {
      const content = `姓名：${form.name}\n年龄：${form.age}\n外貌：${form.appearance}\n性格：${form.personality}\n背景：${form.backstory}\n说话风格：${form.persona}`;
      const res = await fetch(`/api/projects/${projectId}/generate-keywords`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, targetType: "character", modelConfig }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        // 清空现有内容，使用 AI 生成的全新标签
        setForm(f => ({ ...f, tags: data.data.join(", ") }));
      }
    } catch {}
    finally { setKeywordsGenerating(false); }
  };

  /** 一键为所有空标签角色生成标签 */
  const handleBatchGenerateTags = async () => {
    const empty = characters.filter(c => {
      try { const t = JSON.parse(c.tags); return !Array.isArray(t) || t.length === 0; } catch { return true; }
    });
    if (empty.length === 0) {
      toast({ title: "所有角色已有标签" });
      return;
    }
    setBatchGenerating(true);
    const { modelConfig } = useSettingsStore.getState();
    let success = 0;
    for (const char of empty) {
      try {
        const content = `姓名：${char.name}\n年龄：${char.age}\n外貌：${char.appearance}\n性格：${char.personality}\n背景：${char.backstory}\n说话风格：${char.persona}`;
        const res = await fetch(`/api/projects/${projectId}/generate-keywords`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, targetType: "character", modelConfig }),
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          await fetch(`/api/projects/${projectId}/characters/${char.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: char.name, age: char.age, appearance: char.appearance,
              personality: char.personality, backstory: char.backstory,
              hiddenLore: char.hiddenLore, persona: char.persona, status: char.status,
              tags: data.data,
            }),
          });
          success++;
        }
      } catch {}
    }
    toast({ title: `已为 ${success}/${empty.length} 个角色生成标签` });
    loadCharacters();
    setBatchGenerating(false);
  };

  /** AI 优化角色信息 */
  const handleOptimize = async (char: Character) => {
    setOptimizingId(char.id);
    const { modelConfig } = useSettingsStore.getState();
    try {
      const res = await fetch(`/api/projects/${projectId}/optimize-character`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character: {
            name: char.name, age: char.age, appearance: char.appearance,
            personality: char.personality, backstory: char.backstory,
            hiddenLore: char.hiddenLore, persona: char.persona,
          },
          modelConfig,
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setEditingId(char.id);
        setForm({
          name: data.data.name || char.name,
          age: data.data.age || char.age,
          appearance: data.data.appearance || char.appearance,
          personality: data.data.personality || char.personality,
          backstory: data.data.backstory || char.backstory,
          hiddenLore: data.data.hiddenLore || char.hiddenLore,
          persona: data.data.persona || char.persona,
          status: char.status,
          tags: char.tags,
        });
        setDialogOpen(true);
        toast({ title: "AI 优化完成，请预览后保存" });
      } else {
        toast({ title: "优化失败", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "优化请求失败", variant: "destructive" });
    } finally { setOptimizingId(null); }
  };

  /** 打开编辑弹窗 */
  const openEdit = (char: Character) => {
    setEditingId(char.id);
    setForm({
      name: char.name,
      age: char.age,
      appearance: char.appearance,
      personality: char.personality,
      backstory: char.backstory,
      hiddenLore: char.hiddenLore,
      persona: char.persona,
      status: char.status || "alive",
      tags: char.tags || "",
    });
    setDialogOpen(true);
  };

  /** 保存角色 */
  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const url = editingId
        ? `/api/projects/${projectId}/characters/${editingId}`
        : `/api/projects/${projectId}/characters`;
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tags: (() => {
            const t = form.tags.trim();
            if (!t) return [];
            // 尝试 JSON 解析（处理 ["a","b"] 格式）
            try { const p = JSON.parse(t); if (Array.isArray(p)) return p.map((s: unknown) => String(s).trim()).filter(Boolean); } catch {}
            // 回退到逗号分隔
            return t.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
          })(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDialogOpen(false);
        loadCharacters();
      }
    } catch (err) {
      console.error("保存角色失败:", err);
    } finally {
      setSaving(false);
    }
  };

  /** 删除角色 */
  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "删除角色",
      description: "确定要删除这个角色吗？",
      confirmText: "删除",
    });
    if (!ok) return;
    try {
      await fetch(`/api/projects/${projectId}/characters/${id}`, {
        method: "DELETE",
      });
      loadCharacters();
    } catch (err) {
      console.error("删除角色失败:", err);
    }
  };

  /** 下载角色导入模板 */
  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/characters/import`);
      const data = await res.json();
      if (data.success && data.data.sample) {
        const blob = new Blob([JSON.stringify(data.data.sample, null, 2)], {
          type: "application/json;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "角色导入模板.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("下载模板失败:", err);
    }
  };

  /** 选择导入文件 */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportRawFileName(file.name);
    setImportErrors([]);
    setImportCharacters([]);

    try {
      const text = await file.text();
      let parsed: unknown;

      try {
        parsed = JSON.parse(text);
      } catch {
        setImportErrors(["文件不是有效的 JSON 格式"]);
        setImportDialogOpen(true);
        return;
      }

      // 支持顶层数组 或 { characters: [...] }
      let items: unknown[];
      if (Array.isArray(parsed)) {
        items = parsed;
      } else if (
        typeof parsed === "object" &&
        parsed !== null &&
        Array.isArray((parsed as Record<string, unknown>).characters)
      ) {
        items = (parsed as Record<string, unknown>).characters as unknown[];
      } else {
        setImportErrors([
          "无法识别的 JSON 格式，请提供角色数组（[...]）或 { characters: [...] }",
        ]);
        setImportDialogOpen(true);
        return;
      }

      if (items.length === 0) {
        setImportErrors(["文件中没有角色数据"]);
        setImportDialogOpen(true);
        return;
      }

      // 解析为表单格式
      const parsedChars: CharacterForm[] = [];
      const parseErrors: string[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || typeof item !== "object") {
          parseErrors.push(`第 ${i + 1} 条：不是有效的对象`);
          continue;
        }
        const c = item as Record<string, unknown>;
        const name = typeof c.name === "string" ? c.name.trim() : "";
        if (!name) {
          parseErrors.push(`第 ${i + 1} 条：缺少角色名称`);
          continue;
        }
        parsedChars.push({
          name,
          age: typeof c.age === "string" ? c.age : "",
          appearance: typeof c.appearance === "string" ? c.appearance : "",
          personality: typeof c.personality === "string" ? c.personality : "",
          backstory: typeof c.backstory === "string" ? c.backstory : "",
          hiddenLore: typeof c.hiddenLore === "string" ? c.hiddenLore : "",
          persona: typeof c.persona === "string" ? c.persona : "",
          status: typeof c.status === "string" && ["alive", "dead", "missing", "unknown"].includes(c.status) ? c.status : "alive",
          tags: Array.isArray(c.tags) ? c.tags.join(", ") : (typeof c.tags === "string" ? c.tags : ""),
        });
      }

      setImportCharacters(parsedChars);
      setImportErrors(parseErrors);
      setImportDialogOpen(true);
    } catch {
      setImportErrors(["读取文件失败，请确保文件是有效的 JSON 格式"]);
      setImportDialogOpen(true);
    }
  };

  /** 执行批量导入 */
  const handleImportConfirm = async () => {
    if (importCharacters.length === 0) return;
    setImporting(true);

    try {
      // 从原始文件重新读取 tags
      const file = fileInputRef.current?.files?.[0];
      let tagsList: string[][] = [];

      if (file) {
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          const items: unknown[] = Array.isArray(parsed)
            ? parsed
            : Array.isArray((parsed as Record<string, unknown>).characters)
              ? (parsed as Record<string, unknown>).characters as unknown[]
              : [];

          tagsList = items
            .filter(
              (item: unknown): item is Record<string, unknown> =>
                typeof item === "object" && item !== null
            )
            .map((item: Record<string, unknown>) => {
              if (Array.isArray(item.tags)) {
                return item.tags.filter(
                  (t: unknown) => typeof t === "string"
                );
              }
              return [];
            });
        } catch {
          tagsList = importCharacters.map(() => []);
        }
      }

      // 用 tags 增强角色数据
      const payload = importCharacters.map((ch, i) => ({
        ...ch,
        tags: tagsList[i] || [],
      }));

      const res = await fetch(
        `/api/projects/${projectId}/characters/import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characters: payload }),
        }
      );
      const result = await res.json();

      if (result.success) {
        setImportDialogOpen(false);
        setImportCharacters([]);
        setImportErrors([]);
        loadCharacters();
        // 清空文件输入
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        setImportErrors([result.error || "导入失败"]);
      }
    } catch {
      setImportErrors(["导入请求失败，请稍后重试"]);
    } finally {
      setImporting(false);
    }
  };

  /** 关闭导入对话框 */
  const handleImportClose = () => {
    if (importing) return;
    setImportDialogOpen(false);
    setImportCharacters([]);
    setImportErrors([]);
    setImportRawFileName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <SharedSubNav tabs={[
        { label: "角色", href: `/projects/${projectId}/characters` },
        { label: "世界观", href: `/projects/${projectId}/lore` },
        { label: "文风", href: `/projects/${projectId}/style` },
        { label: "记忆", href: `/projects/${projectId}/memory` },
        { label: "错误", href: `/projects/${projectId}/error-archive` },
      ]} />
      <div className="flex-1 space-y-6 p-6 md:p-8">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">角色管理</h2>
          <p className="text-muted-foreground mt-1">
            管理故事中的角色，定义他们的性格和背景
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* 隐藏的文件选择器 */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={handleDownloadTemplate}
            className="gap-2"
            title="下载角色导入模板"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">模板</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            导入角色
          </Button>
          <Button
            variant="outline"
            onClick={() => setAiDialogOpen(true)}
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            AI 生成
          </Button>
          <Button variant="outline" onClick={async () => {
            if (!await confirm({ title: "自动检测状态", description: "将根据每个角色的信息（背景故事、性格等）自动更新生存状态，确定吗？", confirmText: "检测" })) return;
            let updated = 0;
            for (const char of characters) {
              let tags: string[] = [];
              try { tags = JSON.parse(char.tags || "[]"); if (!Array.isArray(tags)) tags = []; } catch { tags = []; }
              const res = await fetch(`/api/projects/${projectId}/characters/${char.id}`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: char.name, backstory: char.backstory, personality: char.personality, appearance: char.appearance, hiddenLore: char.hiddenLore, persona: char.persona, tags }),
              });
              const d = await res.json();
              if (d.success) updated++;
            }
            toast({ title: `已更新 ${updated}/${characters.length} 个角色的生存状态` });
            loadCharacters();
          }} className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            检测状态
          </Button>
          <Button
            variant="outline"
            onClick={handleBatchGenerateTags}
            disabled={batchGenerating}
            className="gap-2"
          >
            {batchGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            补充标签
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            新建角色
          </Button>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜索角色名称、性格、背景、标签…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* 角色列表 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6 space-y-3">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))
        ) : filteredCharacters.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              icon={Users}
              title={searchQuery ? "没有找到匹配的角色" : "还没有角色"}
              description={
                searchQuery
                  ? "尝试其他关键词搜索"
                  : "创建你的第一个角色，让故事更加生动"
              }
              action={
                !searchQuery && (
                  <Button onClick={openCreate} variant="outline" className="gap-2">
                    <Plus className="h-4 w-4" />
                    创建角色
                  </Button>
                )
              }
            />
          </div>
        ) : (
          filteredCharacters.map((char, i) => (
            <div
              key={char.id}
              data-entity-id={char.id}
              className="group border border-border bg-card hover:border-border transition-colors animate-fade-up"
              style={{ animationDelay: `${(i % 9) * 60}ms` }}
            >
              {/* 角色姓名首字母头像 */}
              <div className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center justify-center w-9 h-9 bg-muted text-muted-foreground font-mono text-sm shrink-0">
                      {char.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-mono text-foreground truncate">{char.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {char.age && (
                          <p className="text-[11px] font-mono text-muted-foreground/60">{char.age}岁</p>
                        )}
                        {char.status && char.status !== "alive" && (
                          <span className={`text-[10px] font-mono px-1 border ${STATUS_OPTIONS.find(s => s.value === char.status)?.color || "text-muted-foreground border-border"}`}>
                            {STATUS_OPTIONS.find(s => s.value === char.status)?.label || char.status}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button className="h-6 w-6 flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors" onClick={() => openEdit(char)} title="编辑" aria-label="编辑">
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button className="h-6 w-6 flex items-center justify-center text-muted-foreground/60 hover:text-[#00cc66] hover:bg-muted transition-colors" onClick={() => handleOptimize(char)} disabled={optimizingId === char.id} title="AI 优化" aria-label="AI 优化">
                      {optimizingId === char.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button className="h-6 w-6 flex items-center justify-center text-muted-foreground/60 hover:text-[#ff4444] hover:bg-muted transition-colors" onClick={() => handleDelete(char.id)} title="删除" aria-label="删除">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="px-3 pb-3 space-y-3">
                {char.personality && (
                  <div>
                    <p className="text-[11px] font-mono text-muted-foreground/60 mb-0.5">
                      性格
                    </p>
                    <p className="text-[12px] font-mono text-muted-foreground line-clamp-2">{char.personality}</p>
                  </div>
                )}
                {char.appearance && (
                  <div>
                    <p className="text-[11px] font-mono text-muted-foreground/60 mb-0.5">
                      外貌
                    </p>
                    <p className="text-[12px] font-mono text-muted-foreground line-clamp-2">{char.appearance}</p>
                  </div>
                )}
                {/* 隐藏设定 */}
                {char.hiddenLore && (
                  <div>
                    <button
                      className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground/60 hover:text-muted-foreground mb-0.5"
                      onClick={() =>
                        setShowHidden((prev) => ({
                          ...prev,
                          [char.id]: !prev[char.id],
                        }))
                      }
                    >
                      {showHidden[char.id] ? (
                        <Eye className="h-3 w-3" />
                      ) : (
                        <EyeOff className="h-3 w-3" />
                      )}
                      隐藏设定（仅 AI 可见）
                    </button>
                    {showHidden[char.id] && (
                      <p className="text-sm text-orange-600 dark:text-orange-400 line-clamp-3">
                        {char.hiddenLore}
                      </p>
                    )}
                  </div>
                )}
                {/* 标签 */}
                {parseTags(char.tags).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {parseTags(char.tags).map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-sm">
                        <Tag className="h-2 w-2 mr-1" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                {/* 关联角色（基于共享标签） */}
                {(() => {
                  const charTags = parseTags(char.tags);
                  if (charTags.length === 0) return null;
                  const related = filteredCharacters.filter(c =>
                    c.id !== char.id &&
                    parseTags(c.tags).some(t => charTags.includes(t))
                  );
                  if (related.length === 0) return null;
                  return (
                    <div className="mt-1.5 text-[10px] font-mono text-muted-foreground/50 flex items-center gap-1">
                      <Users className="h-2.5 w-2.5" />
                      <span>关联 {related.length} 个角色</span>
                      <div className="flex -space-x-1 ml-0.5">
                        {related.slice(0, 3).map(r => (
                          <div key={r.id} className="w-4 h-4 rounded-full bg-muted border border-background flex items-center justify-center text-[6px] font-bold text-muted-foreground" title={r.name}>
                            {r.name[0]}
                          </div>
                        ))}
                        {related.length > 3 && (
                          <span className="text-[8px] text-muted-foreground/50 ml-1">+{related.length - 3}</span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 新建/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "编辑角色" : "新建角色"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="charName">角色名称 *</Label>
                <Input
                  id="charName"
                  placeholder="亚瑟"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="charAge">年龄</Label>
                <Input
                  id="charAge"
                  placeholder="25"
                  value={form.age}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, age: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="charAppearance">外貌描述</Label>
              <Textarea
                id="charAppearance"
                rows={2}
                placeholder="高大英俊，金色短发，蓝色眼眸…"
                value={form.appearance}
                onChange={(e) =>
                  setForm((f) => ({ ...f, appearance: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="charPersonality">性格描述</Label>
              <Textarea
                id="charPersonality"
                rows={2}
                placeholder="勇敢正义，但有时过于冲动…"
                value={form.personality}
                onChange={(e) =>
                  setForm((f) => ({ ...f, personality: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="charBackstory">背景故事</Label>
              <Textarea
                id="charBackstory"
                rows={3}
                placeholder="出生于骑士世家，年幼时…"
                value={form.backstory}
                onChange={(e) =>
                  setForm((f) => ({ ...f, backstory: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="charPersona">
                角色专属 Prompt（AI 扮演时的语气和口癖）
              </Label>
              <Textarea
                id="charPersona"
                rows={2}
                placeholder="说话古风文雅，喜欢引用诗句…"
                value={form.persona}
                onChange={(e) =>
                  setForm((f) => ({ ...f, persona: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="charHidden"
                className="flex items-center gap-2"
              >
                <EyeOff className="h-4 w-4" />
                隐藏设定（仅 AI 可见，玩家不可见）
              </Label>
              <Textarea
                id="charHidden"
                rows={2}
                placeholder="实际上是叛军首领的间谍…"
                value={form.hiddenLore}
                onChange={(e) =>
                  setForm((f) => ({ ...f, hiddenLore: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>生存状态</Label>
              <div className="flex gap-2 flex-wrap">
                {STATUS_OPTIONS.map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setForm(f => ({ ...f, status: opt.value }))}
                    className={`px-2.5 py-1 text-[12px] font-mono border transition-colors ${
                      form.status === opt.value
                        ? opt.color + " bg-card"
                        : "border-border text-muted-foreground/60 hover:border-border"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 标签/Tags */}
            <div className="space-y-2">
              <Label htmlFor="charTags">
                标签（逗号分隔，用于对话中自动匹配）
              </Label>
              <div className="flex gap-2">
                <Input
                  id="charTags"
                  placeholder="战士, 冷峻, 北方军团, 火焰魔法"
                  value={form.tags}
                  onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs shrink-0"
                  disabled={keywordsGenerating || (!form.name && !form.backstory)}
                  onClick={handleGenerateKeywords}
                >
                  {keywordsGenerating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  AI 生成
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                当用户消息包含这些关键词时，AI 会自动参考该角色的设定
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={!form.name.trim() || saving}
            >
              {saving ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 导入预览对话框 */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { if (!open) handleImportClose(); else setImportDialogOpen(true); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              导入角色
            </DialogTitle>
          </DialogHeader>

          {importErrors.length > 0 && importCharacters.length === 0 ? (
            /* 纯错误状态 */
            <div className="py-8 space-y-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <AlertCircle className="h-12 w-12 text-destructive" />
                <p className="text-lg font-medium text-destructive">导入失败</p>
              </div>
              <div className="space-y-2">
                {importErrors.map((err, i) => (
                  <p key={i} className="text-sm text-destructive flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    {err}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* 导入概览 */}
              <div className="flex items-center gap-3 py-3 px-4 bg-card">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{importRawFileName || "未命名文件"}</p>
                  <p className="text-sm text-muted-foreground">
                    共解析出 <strong>{importCharacters.length}</strong> 个角色
                    {importErrors.length > 0 && `（${importErrors.length} 条警告）`}
                  </p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
              </div>

              {/* 角色列表预览 */}
              <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
                <div className="space-y-2 py-2">
                  {importCharacters.map((ch, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3 border hover:bg-accent/30 transition-smooth"
                    >
                      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{ch.name}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                          {ch.age && <span>年龄：{ch.age}</span>}
                          {ch.personality && <span className="line-clamp-1">性格：{ch.personality}</span>}
                          {ch.persona && <span className="line-clamp-1">口癖：{ch.persona}</span>}
                        </div>
                        {(ch.appearance || ch.backstory || ch.hiddenLore) && (
                          <div className="mt-1 flex gap-2">
                            {ch.appearance && <Badge variant="secondary" className="text-sm">外貌</Badge>}
                            {ch.backstory && <Badge variant="secondary" className="text-sm">背景</Badge>}
                            {ch.hiddenLore && <Badge variant="secondary" className="text-sm border-orange-300 text-orange-600 dark:text-orange-400">隐藏</Badge>}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 错误警告 */}
              {importErrors.length > 0 && (
                <div className="border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">
                    以下记录将被跳过：
                  </p>
                  <div className="space-y-1">
                    {importErrors.map((err, i) => (
                      <p key={i} className="text-sm text-amber-600 dark:text-amber-500">
                        {err}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleImportClose} disabled={importing}>
              {importCharacters.length > 0 ? "取消" : "关闭"}
            </Button>
            {importCharacters.length > 0 && (
              <Button onClick={handleImportConfirm} disabled={importing} className="gap-2">
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    导入中…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    导入 {importCharacters.length} 个角色
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI 生成对话框 */}
      <AIGenerateDialog
        open={aiDialogOpen}
        onOpenChange={setAiDialogOpen}
        type="character"
        projectId={projectId}
        onGenerate={handleAIGenerate}
      />

      {ConfirmDialog}
    </div></>
  );
}
