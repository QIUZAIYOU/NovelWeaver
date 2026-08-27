// app/projects/[projectId]/lore/page.tsx
// 知识库管理页 - Wiki 式词条管理

"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Plus,
  Globe,
  Edit3,
  Trash2,
  Search,
  Tag,
  Filter,
  Sparkles,
  Upload,
  Download,
  FileText,
  CheckCircle2,
  AlertCircle,
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
import { EmptyState } from "@/components/ui/empty-state";
import { useDebounce } from "@/hooks/use-debounce";
import { useScrollToHighlight } from "@/hooks/use-scroll-to-highlight";
import { useConfirm } from "@/hooks/use-confirm";
import { useSettingsStore } from "@/stores/settings-store";
import { toast } from "@/hooks/use-toast";
import { parseJsonArray } from "@/lib/utils";
import { AIGenerateDialog } from "@/components/ai-generate-dialog";
import { SharedSubNav } from "@/components/shared-sub-nav";

/** 词条类型 */
interface LoreEntry {
  id: string;
  title: string;
  content: string;
  keywords: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

/** 词条表单 */
interface LoreForm {
  title: string;
  content: string;
  keywords: string;
  category: string;
}

const emptyForm: LoreForm = {
  title: "",
  content: "",
  keywords: "",
  category: "general",
};

/** 分类选项 */
const categories = [
  { value: "general", label: "通用" },
  { value: "geography", label: "地理" },
  { value: "history", label: "历史" },
  { value: "magic", label: "魔法/科技" },
  { value: "character", label: "人物" },
  { value: "event", label: "事件" },
  { value: "faction", label: "阵营" },
  { value: "item", label: "物品" },
];

export default function LorePage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [entries, setEntries] = useState<LoreEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LoreForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [keywordsGenerating, setKeywordsGenerating] = useState(false);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();
  useScrollToHighlight();

  // 导入相关状态
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importEntries, setImportEntries] = useState<LoreForm[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importRawFileName, setImportRawFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 加载词条列表 */
  const loadEntries = useCallback(async () => {
    try {
      const url = filterCategory
        ? `/api/projects/${projectId}/lore?category=${filterCategory}&mentions=true`
        : `/api/projects/${projectId}/lore?mentions=true`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) setEntries(data.data);
    } catch (err) {
      console.error("加载知识库失败:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, filterCategory]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  /** 过滤词条 */
  const filteredEntries = entries.filter(
    (e) =>
      !debouncedSearch ||
      e.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      e.content.toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  /** 打开新建弹窗 */
  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  /** 处理 AI 生成的结果 */
  const handleAIGenerate = (data: Record<string, unknown>) => {
    setEditingId(null);
    const keywords = Array.isArray(data.keywords)
      ? (data.keywords as string[]).join(", ")
      : (data.keywords as string) || "";
    setForm({
      title: (data.title as string) || "",
      content: (data.content as string) || "",
      keywords,
      category: (data.category as string) || "general",
    });
    setDialogOpen(true);
  };

  /** AI 自动生成触发关键词 */
  const handleGenerateKeywords = async () => {
    if (!form.title && !form.content) return;
    setKeywordsGenerating(true);
    const { modelConfig } = useSettingsStore.getState();
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-keywords`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `标题：${form.title}\n\n内容：${form.content}`,
          targetType: "lore",
          modelConfig,
        }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        // 清空现有内容，使用 AI 生成的全新关键词
        setForm(f => ({ ...f, keywords: data.data.join(", ") }));
      }
    } catch {}
    finally { setKeywordsGenerating(false); }
  };

  /** 一键为所有空关键词词条生成关键词 */
  const handleBatchGenerateKeywords = async () => {
    const empty = entries.filter((e: LoreEntry) => {
      try { const k = JSON.parse(e.keywords); return !Array.isArray(k) || k.length === 0; } catch { return true; }
    });
    if (empty.length === 0) {
      toast({ title: "所有词条已有触发关键词" });
      return;
    }
    setBatchGenerating(true);
    const { modelConfig } = useSettingsStore.getState();
    let success = 0;
    for (const entry of empty) {
      try {
        const res = await fetch(`/api/projects/${projectId}/generate-keywords`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `标题：${entry.title}\n\n内容：${entry.content}`,
            targetType: "lore",
            modelConfig,
          }),
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          await fetch(`/api/projects/${projectId}/lore/${entry.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: entry.title,
              content: entry.content,
              category: entry.category,
              keywords: data.data,
            }),
          });
          success++;
        }
      } catch {}
    }
    toast({ title: `已为 ${success}/${empty.length} 个词条生成关键词` });
    loadEntries();
    setBatchGenerating(false);
  };

  /** 打开编辑弹窗 */
  const openEdit = (entry: LoreEntry) => {
    setEditingId(entry.id);
    // 将数据库中的 JSON 关键词数组解析为逗号分隔的文本供编辑
    const parsed = parseJsonArray<string>(entry.keywords);
    setForm({
      title: entry.title,
      content: entry.content,
      keywords: parsed.length > 0 ? parsed.join(", ") : "",
      category: entry.category,
    });
    setDialogOpen(true);
  };

  /** 保存词条 */
  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      // 将关键词文本转为数组：先尝试 JSON 解析（处理用户粘贴 JSON 数组），再回退到逗号分割
      let keywordsArray: string[];
      try {
        const parsed = JSON.parse(form.keywords);
        if (Array.isArray(parsed) && parsed.every((k: unknown) => typeof k === "string")) {
          keywordsArray = parsed;
        } else {
          throw new Error("not a string array");
        }
      } catch {
        keywordsArray = form.keywords
          .split(/[,，、]/)
          .map((k) => k.trim())
          .filter(Boolean);
      }

      const url = editingId
        ? `/api/projects/${projectId}/lore/${editingId}`
        : `/api/projects/${projectId}/lore`;
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          keywords: keywordsArray,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDialogOpen(false);
        loadEntries();
      }
    } catch (err) {
      console.error("保存词条失败:", err);
    } finally {
      setSaving(false);
    }
  };

  /** 删除词条 */
  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "删除词条",
      description: "确定要删除这个词条吗？",
      confirmText: "删除",
    });
    if (!ok) return;
    try {
      await fetch(`/api/projects/${projectId}/lore/${id}`, {
        method: "DELETE",
      });
      loadEntries();
    } catch (err) {
      console.error("删除词条失败:", err);
    }
  };

  /** 解析关键词 */
  const parseKeywords = (kw: string): string[] => {
    try {
      return JSON.parse(kw);
    } catch {
      return [];
    }
  };

  /** 获取分类标签颜色 */
  const getCategoryColor = (cat: string) => {
    const map: Record<string, string> = {
      general: "bg-gray-500",
      geography: "bg-green-500",
      history: "bg-amber-500",
      magic: "bg-purple-500",
      character: "bg-blue-500",
      event: "bg-red-500",
      faction: "bg-orange-500",
      item: "bg-cyan-500",
    };
    return map[cat] || "bg-gray-500";
  };

  /** 下载导入模板 */
  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/lore/import`);
      const data = await res.json();
      if (data.success && data.data.sample) {
        const blob = new Blob([JSON.stringify(data.data.sample, null, 2)], {
          type: "application/json;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "世界观词条导入模板.json";
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
    setImportEntries([]);

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

      let items: unknown[];
      if (Array.isArray(parsed)) {
        items = parsed;
      } else if (
        typeof parsed === "object" &&
        parsed !== null &&
        Array.isArray((parsed as Record<string, unknown>).entries)
      ) {
        items = (parsed as Record<string, unknown>).entries as unknown[];
      } else {
        setImportErrors([
          "无法识别的 JSON 格式，请提供词条数组（[...]）或 { entries: [...] }",
        ]);
        setImportDialogOpen(true);
        return;
      }

      if (items.length === 0) {
        setImportErrors(["文件中没有词条数据"]);
        setImportDialogOpen(true);
        return;
      }

      const categoryList = [
        { value: "general", label: "通用" },
        { value: "geography", label: "地理" },
        { value: "history", label: "历史" },
        { value: "magic", label: "魔法/科技" },
        { value: "character", label: "人物" },
        { value: "event", label: "事件" },
        { value: "faction", label: "阵营" },
        { value: "item", label: "物品" },
      ];
      const validCategories = categoryList.map((c) => c.value);

      const parsedEntries: LoreForm[] = [];
      const parseErrors: string[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || typeof item !== "object") {
          parseErrors.push(`第 ${i + 1} 条：不是有效的对象`);
          continue;
        }
        const e = item as Record<string, unknown>;
        const title = typeof e.title === "string" ? e.title.trim() : "";
        if (!title) {
          parseErrors.push(`第 ${i + 1} 条：缺少词条标题`);
          continue;
        }

        const category =
          typeof e.category === "string" && validCategories.includes(e.category)
            ? e.category
            : "general";
        const keywords = Array.isArray(e.keywords)
          ? (e.keywords as string[]).join(", ")
          : "";

        parsedEntries.push({
          title,
          content: typeof e.content === "string" ? e.content : "",
          keywords,
          category,
        });
      }

      setImportEntries(parsedEntries);
      setImportErrors(parseErrors);
      setImportDialogOpen(true);
    } catch {
      setImportErrors(["读取文件失败，请确保文件是有效的 JSON 格式"]);
      setImportDialogOpen(true);
    }
  };

  /** 执行批量导入 */
  const handleImportConfirm = async () => {
    if (importEntries.length === 0) return;
    setImporting(true);

    try {
      const payload = importEntries.map((e) => ({
        title: e.title,
        content: e.content,
        keywords: e.keywords
          .split(/[,，、]/)
          .map((k) => k.trim())
          .filter(Boolean),
        category: e.category,
      }));

      const res = await fetch(`/api/projects/${projectId}/lore/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: payload }),
      });
      const result = await res.json();

      if (result.success) {
        setImportDialogOpen(false);
        setImportEntries([]);
        setImportErrors([]);
        loadEntries();
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
    setImportEntries([]);
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
      <div className="flex-1 space-y-6 p-6 md:p-8 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">世界观 & 知识库</h2>
          <p className="text-muted-foreground mt-1">
            管理世界观设定，AI 会在对话中自动引用相关词条
          </p>
        </div>
        <div className="flex items-center gap-2">
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
            title="下载导入模板"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">模板</span>
          </Button>
          <Button
            variant="outline"
            onClick={handleBatchGenerateKeywords}
            disabled={batchGenerating}
            className="gap-2"
            title="为所有空关键词词条自动生成触发关键词"
          >
            {batchGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">补充关键词</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            导入词条
          </Button>
          <Button
            variant="outline"
            onClick={() => setAiDialogOpen(true)}
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            AI 生成
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            新建词条
          </Button>
        </div>
      </div>

      {/* 搜索和过滤 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索词条…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="border border-border bg-background px-3 py-2 text-[13px] font-mono text-foreground"
          >
            <option value="">全部分类</option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 词条列表 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6 space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))
        ) : filteredEntries.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              icon={Globe}
              title={searchQuery ? "没有找到匹配的词条" : "还没有词条"}
              description={
                searchQuery
                  ? "尝试其他关键词搜索"
                  : "创建世界观词条，AI 会在对话中自动引用"
              }
              action={
                !searchQuery && (
                  <Button
                    onClick={openCreate}
                    variant="outline"
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    创建词条
                  </Button>
                )
              }
            />
          </div>
        ) : (
          filteredEntries.map((entry, i) => (
            <Card
              key={entry.id}
              data-entity-id={entry.id}
              className="hover:shadow-md transition-smooth group cursor-pointer animate-fade-up"
              style={{ animationDelay: `${(i % 9) * 60}ms` }}
              onClick={() => openEdit(entry)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${getCategoryColor(entry.category)}`}
                    />
                    <CardTitle className="text-base">{entry.title}</CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(entry.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
                <Badge variant="outline" className="w-fit text-sm">
                  {categories.find((c) => c.value === entry.category)?.label ||
                    entry.category}
                </Badge>
              </CardHeader>
              <CardContent className="pt-0">
                {entry.content && (
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                    {entry.content}
                  </p>
                )}
                {parseKeywords(entry.keywords).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {parseKeywords(entry.keywords)
                      .slice(0, 5)
                      .map((kw, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="text-sm"
                        >
                          <Tag className="h-2 w-2 mr-1" />
                          {kw}
                        </Badge>
                      ))}
                  </div>
                )}
                {/* 引用计数 */}
                {(entry as any).mentionCount > 0 && (
                  <div className="mt-1.5 text-[10px] font-mono text-muted-foreground/50 flex items-center gap-1">
                    <span>引用 {(entry as any).mentionCount} 次</span>
                    {(entry as any).mentionSnippets?.length > 0 && (
                      <span className="text-[10px] text-muted-foreground/40">·</span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 新建/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "编辑词条" : "新建词条"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="loreTitle">词条标题 *</Label>
                <Input
                  id="loreTitle"
                  placeholder="凛冬城"
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loreCategory">分类</Label>
                <select
                  id="loreCategory"
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value }))
                  }
                  className="flex h-8 w-full border border-border bg-background px-2 py-1 text-[13px] font-mono text-foreground"
                >
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="loreContent">词条内容</Label>
              <Textarea
                id="loreContent"
                rows={6}
                placeholder="描述这个世界观元素的详细信息…（支持 Markdown）"
                value={form.content}
                onChange={(e) =>
                  setForm((f) => ({ ...f, content: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loreKeywords">
                触发关键词（逗号分隔，对话中出现时自动注入）
              </Label>
              <div className="flex gap-2">
                <Input
                  id="loreKeywords"
                  placeholder="凛冬, 北境, 长城, 史塔克"
                  value={form.keywords}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, keywords: e.target.value }))
                  }
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs shrink-0"
                  disabled={keywordsGenerating || (!form.title && !form.content)}
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
                当用户消息包含这些关键词时，AI 会自动参考此词条
              </p>
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

      {/* 导入预览对话框 */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { if (!open) handleImportClose(); else setImportDialogOpen(true); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              导入世界观词条
            </DialogTitle>
          </DialogHeader>

          {importErrors.length > 0 && importEntries.length === 0 ? (
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
              <div className="flex items-center gap-3 py-3 px-4 bg-card">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{importRawFileName || "未命名文件"}</p>
                  <p className="text-sm text-muted-foreground">
                    共解析出 <strong>{importEntries.length}</strong> 个词条
                    {importErrors.length > 0 && `（${importErrors.length} 条警告）`}
                  </p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
                <div className="space-y-2 py-2">
                  {importEntries.map((entry, i) => {
                    const catLabel =
                      categories.find((c) => c.value === entry.category)?.label ||
                      entry.category;
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 border hover:bg-accent/30 transition-smooth"
                      >
                        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-purple-500/10 text-purple-500 text-sm font-bold shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{entry.title}</p>
                            <Badge variant="outline" className="text-sm shrink-0">{catLabel}</Badge>
                          </div>
                          {entry.content && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {entry.content}
                            </p>
                          )}
                          {entry.keywords && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {entry.keywords.split(/[,，、]/).filter(Boolean).slice(0, 4).map((kw, ki) => (
                                <Badge key={ki} variant="secondary" className="text-sm">
                                  {kw.trim()}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

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
              {importEntries.length > 0 ? "取消" : "关闭"}
            </Button>
            {importEntries.length > 0 && (
              <Button onClick={handleImportConfirm} disabled={importing} className="gap-2">
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    导入中…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    导入 {importEntries.length} 个词条
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
        type="lore"
        projectId={projectId}
        onGenerate={handleAIGenerate}
      />

      {ConfirmDialog}
    </div></>
  );
}
