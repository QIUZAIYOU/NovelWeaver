// components/agents/agent-edit-dialog.tsx
// 智能体创建/编辑对话框 — 含分页高级配置

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Zap, Server, BookOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { EmojiPicker } from "./emoji-picker";
import { cn } from "@/lib/utils";

// ─── 类型 ───────────────────────────────────────────────────

interface AgentFormData {
  name: string;
  emoji: string;
  type: "planner" | "writer" | "reviewer" | "editor" | "custom";
  systemPrompt: string;
  temperature: number;
  order: number;
  isActive: boolean;
  skills: string[];
  mcpTools: string[];
  loreIds: string[];
}

interface LoreItem {
  id: string;
  title: string;
  category: string;
}

interface AgentEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 编辑模式传入现有数据；创建模式传 null */
  initialData: AgentFormData | null;
  editingId: string | null;
  projectId: string;
  onSaved: () => void;
}

// ─── Tab 定义 ────────────────────────────────────────────────

const TABS = [
  { key: "basic", label: "基础配置", icon: null },
  { key: "tools", label: "技能 & 工具", icon: null },
  { key: "lore", label: "世界观绑定", icon: null },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// ─── 备忘录状态初始化 ─────────────────────────────────────

function emptyForm(): AgentFormData {
  return {
    name: "",
    emoji: "🤖",
    type: "custom" as const,
    systemPrompt: "",
    temperature: 0.7,
    order: 0,
    isActive: true,
    skills: [],
    mcpTools: [],
    loreIds: [],
  };
}

// ─── 解析 JSON 数组 ╱ 回退空数组 ──────────────────────────

function parseArr(s: string): string[] {
  try {
    const p = JSON.parse(s);
    return Array.isArray(p) ? p.filter((x: unknown) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// ─── 组件 ───────────────────────────────────────────────────

export function AgentEditDialog({
  open,
  onOpenChange,
  initialData,
  editingId,
  projectId,
  onSaved,
}: AgentEditDialogProps) {
  const [form, setForm] = useState<AgentFormData>(emptyForm());
  const [tab, setTab] = useState<TabKey>("basic");
  const [saving, setSaving] = useState(false);

  // 下拉选择状态
  const [skillSearch, setSkillSearch] = useState("");
  const [mcpSearch, setMcpSearch] = useState("");
  const [loreSearch, setLoreSearch] = useState("");

  // 辅助数据
  const [allLore, setAllLore] = useState<LoreItem[]>([]);
  const [allSkillNames, setAllSkillNames] = useState<string[]>([]);
  const [allMcpToolNames, setAllMcpToolNames] = useState<string[]>([]);

  // ── 打开时填充表单 & 加载辅助数据 ──

  useEffect(() => {
    if (!open) return;

    if (initialData) {
      setForm({ ...initialData });
    } else {
      setForm(emptyForm());
    }
    setTab("basic");
    setSaving(false);
    setSkillSearch("");
    setMcpSearch("");
    setLoreSearch("");

    // 并行加载辅助数据
    const loadAux = async () => {
      const [loreRes, skillRes, mcpRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/lore`).catch(() => null),
        fetch(`/api/projects/${projectId}/skills`).catch(() => null),
        fetch(`/api/projects/${projectId}/mcp-servers`).catch(() => null),
      ]);

      // 世界观
      if (loreRes) {
        try {
          const d = await loreRes.json();
          if (d.success) setAllLore(d.data);
        } catch { /* ignore */ }
      }

      // 技能名
      if (skillRes) {
        try {
          const d = await skillRes.json();
          if (d.success) setAllSkillNames(d.data.map((s: { name: string }) => s.name));
        } catch { /* ignore */ }
      }

      // MCP 工具名
      if (mcpRes) {
        try {
          const d = await mcpRes.json();
          const tools: string[] = [];
          for (const s of d.data) {
            try { const t = JSON.parse(s.tools || "[]"); if (Array.isArray(t)) tools.push(...t); } catch { /* ignore */ }
          }
          setAllMcpToolNames([...new Set(tools)]);
        } catch { /* ignore */ }
      }
    };

    loadAux();
  }, [open, initialData, projectId]);

  // ── 保存 ──

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const url = editingId
        ? `/api/projects/${projectId}/custom-agents/${editingId}`
        : `/api/projects/${projectId}/custom-agents`;
      const r = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (d.success) {
        onOpenChange(false);
        onSaved();
        toast({ title: editingId ? "智能体已更新" : "智能体已创建" });
      } else {
        toast({ title: d.error || "保存失败", variant: "destructive" });
      }
    } catch {
      toast({ title: "保存失败", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── 辅助渲染: 多选搜索框 ──

  const renderMultiSelect = (
    searchValue: string,
    setSearch: (v: string) => void,
    options: string[],
    selected: string[],
    onAdd: (item: string) => void,
    onRemove: (item: string) => void,
    placeholder: string,
    allowCustom: boolean,
  ) => (
    <div className="relative">
      <Input
        value={searchValue}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => { if (!searchValue) setSearch(" "); }}
        onBlur={() => setTimeout(() => setSearch(""), 200)}
        placeholder={placeholder}
        className="h-8 text-sm"
      />
      {searchValue && (
        <div className="absolute top-full mt-0.5 left-0 right-0 z-10 bg-card border border-border shadow-lg max-h-32 overflow-y-auto">
          {options
            .filter((n) => n.toLowerCase().includes(searchValue === " " ? "" : searchValue.toLowerCase()))
            .filter((n) => !selected.includes(n))
            .map((n) => (
              <button
                key={n}
                type="button"
                className="w-full text-left text-sm px-2 py-1 hover:bg-muted transition-smooth"
                onMouseDown={() => { onAdd(n); setSearch(""); }}
              >
                {n}
              </button>
            ))}
          {allowCustom && searchValue.trim() && searchValue !== " " && (
            <button
              type="button"
              className="w-full text-left text-sm px-2 py-1 border-[#00cc66] text-[#00cc66] hover:bg-muted transition-smooth"
              onMouseDown={() => { onAdd(searchValue.trim()); setSearch(""); }}
            >
              新建「{searchValue.trim()}」
            </button>
          )}
        </div>
      )}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map((item) => (
            <Badge key={item} variant="secondary" className="text-xs gap-1 px-2 py-0.5">
              {item}
              <button
                type="button"
                onClick={() => onRemove(item)}
                className="hover:text-destructive transition-colors"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );

  // ── 渲染 ───────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{editingId ? "编辑智能体" : "新建智能体"}</DialogTitle>
        </DialogHeader>

        {/* 内嵌 Tab 导航 */}
        <div className="flex gap-0 border-b border-border shrink-0 -mx-6 px-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "px-3 py-2 text-sm font-medium transition-smooth border-b-2 -mb-px",
                tab === t.key
                  ? "border-primary border-[#00cc66] text-[#00cc66]"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 表单内容 (可滚动) */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* ─── Tab: 基础配置 ─── */}
          {tab === "basic" && (
            <>
              <div className="flex gap-3 items-end">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-sm">名称</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="h-8 text-sm"
                    placeholder="给智能体取个名字…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">图标</Label>
                  <EmojiPicker
                    value={form.emoji}
                    onChange={(emoji) => setForm((f) => ({ ...f, emoji }))}
                  />
                </div>
                <div className="w-20 space-y-1.5">
                  <Label className="text-sm">温度</Label>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={form.temperature}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) || 0.7 }))
                    }
                    className="flex h-8 w-full border border-border bg-background px-2 py-1 text-[13px] font-mono text-foreground text-center"
                  />
                </div>
                <div className="w-20 space-y-1.5">
                  <Label className="text-sm">排序</Label>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    step="1"
                    value={form.order}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, order: parseInt(e.target.value) || 0 }))
                    }
                    className="flex h-8 w-full border border-border bg-background px-2 py-1 text-[13px] font-mono text-foreground text-center"
                  />
                </div>
                <div className="flex items-center gap-2 pb-1.5">
                  <input
                    type="checkbox"
                    id="agent-active"
                    checked={form.isActive}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    className="h-3.5 w-3.5 accent-[#00cc66]"
                  />
                  <Label htmlFor="agent-active" className="text-sm cursor-pointer">启用</Label>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">角色类型</Label>
                <div className="flex gap-2 flex-wrap">
                  {([
                    { value: "writer", label: "创作", desc: "负责生成故事正文" },
                    { value: "reviewer", label: "审查", desc: "负责审核和校验内容" },
                    { value: "editor", label: "润色", desc: "负责文字优化和修饰" },
                    { value: "planner", label: "调度", desc: "负责任务分发和调度" },
                    { value: "custom", label: "通用", desc: "不限定角色" },
                  ] as const).map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setForm(f => ({ ...f, type: opt.value as AgentFormData["type"] }))}
                      className={`px-2.5 py-1.5 text-xs font-mono border text-left transition-colors ${
                        form.type === opt.value
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className="font-medium">{opt.label}</div>
                      <div className="text-[10px] text-muted-foreground/60 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">系统提示词</Label>
                <Textarea
                  value={form.systemPrompt}
                  onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
                  rows={6}
                  className="text-sm font-mono leading-relaxed"
                  placeholder="定义这个智能体的角色和任务…"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {form.systemPrompt.length} 字符
                </p>
              </div>
            </>
          )}

          {/* ─── Tab: 技能 & 工具 ─── */}
          {tab === "tools" && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label className="text-sm flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-500" /> 技能
                </Label>
                {renderMultiSelect(
                  skillSearch, setSkillSearch,
                  allSkillNames, form.skills,
                  (item) => setForm((f) => ({ ...f, skills: [...f.skills, item] })),
                  (item) => setForm((f) => ({ ...f, skills: f.skills.filter((s) => s !== item) })),
                  "搜索或新建技能…",
                  true,
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm flex items-center gap-1.5">
                  <Server className="h-3.5 w-3.5 text-blue-500" /> MCP 工具
                </Label>
                {renderMultiSelect(
                  mcpSearch, setMcpSearch,
                  allMcpToolNames, form.mcpTools,
                  (item) => setForm((f) => ({ ...f, mcpTools: [...f.mcpTools, item] })),
                  (item) => setForm((f) => ({ ...f, mcpTools: f.mcpTools.filter((t) => t !== item) })),
                  "搜索或新建工具…",
                  true,
                )}
              </div>
            </div>
          )}

          {/* ─── Tab: 世界观绑定 ─── */}
          {tab === "lore" && (
            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-purple-500" /> 绑定世界观词条
              </Label>
              <Input
                value={loreSearch}
                onChange={(e) => setLoreSearch(e.target.value)}
                placeholder="搜索世界观词条…"
                className="h-8 text-sm"
              />
              <div className="max-h-48 overflow-y-auto space-y-0.5 border border-border p-1.5">
                {allLore.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">暂无世界观词条</p>
                ) : (
                  allLore
                    .filter((l) => !loreSearch || l.title.toLowerCase().includes(loreSearch.toLowerCase()))
                    .map((l) => {
                      const sel = form.loreIds.includes(l.id);
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              loreIds: sel
                                ? f.loreIds.filter((id) => id !== l.id)
                                : [...f.loreIds, l.id],
                            }))
                          }
                          className={cn(
                            "flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm transition-smooth",
                            sel ? "bg-primary/10 border-[#00cc66] text-[#00cc66]" : "hover:bg-muted",
                          )}
                        >
                          <div
                            className={cn(
                              "w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center transition-smooth",
                              sel
                                ? "bg-primary border-primary"
                                : "border-muted-foreground/30",
                            )}
                          >
                            {sel && <span className="text-[7px] border-[#00cc66] text-[#00cc66]-foreground">&#10003;</span>}
                          </div>
                          <span className="truncate">{l.title}</span>
                          {l.category && (
                            <span className="text-xs text-muted-foreground/50 ml-auto shrink-0">
                              {l.category}
                            </span>
                          )}
                        </button>
                      );
                    })
                )}
              </div>
              {form.loreIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {form.loreIds.map((id) => {
                    const item = allLore.find((l) => l.id === id);
                    return (
                      <Badge key={id} variant="outline" className="text-xs gap-1 px-2 py-0.5">
                        {item?.title || id}
                        <button
                          type="button"
                          onClick={() =>
                            setForm((f) => ({ ...f, loreIds: f.loreIds.filter((lid) => lid !== id) }))
                          }
                          className="hover:text-destructive"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border pt-4 -mx-6 px-6">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!form.name.trim() || saving}>
            {saving ? "保存中…" : editingId ? "更新" : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
