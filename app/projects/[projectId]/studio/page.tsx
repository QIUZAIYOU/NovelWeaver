// app/projects/[projectId]/studio/page.tsx
// 多智能体写作工作台 — 基于 CrewAI Studio + Multica 模式优化

"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Sparkles, Loader2, CheckCircle2, AlertCircle, AlertTriangle, Users,
  Eye, EyeOff, Copy, Bot, Plus, Trash2, Settings, X, Play, Square,
  Clock, ChevronDown, ChevronRight, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { usePrompt } from "@/hooks/use-prompt";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// ============================================================
// 配置定义
// ============================================================

const BUILTIN: Record<string, { name: string; emoji: string; color: string; desc: string }> = {
  dispatcher: { name: "调度统领", emoji: "🤖", color: "text-purple-500", desc: "分析任务并调度智能体" },
  writer: { name: "主笔", emoji: "📝", color: "text-green-500", desc: "生成故事正文" },
  loreKeeper: { name: "设定监理", emoji: "🔍", color: "text-purple-500", desc: "检查设定一致性" },
  characterAgent: { name: "角色监理", emoji: "🎭", color: "text-orange-500", desc: "验证角色表现" },
  editor: { name: "润色师", emoji: "✏️", color: "text-pink-500", desc: "文字润色优化" },
};

interface AgentSlot {
  key: string; name: string; emoji: string; color: string; isDispatcher?: boolean; type?: string;
}

interface AgentResult {
  agent: string; name: string; emoji: string; output: string; time: number; status: string; iteration: number;
}

interface AgentItem {
  id: string; name: string; emoji: string;
}

// 历史记录
interface PipelineHistory {
  id: string;
  timestamp: string;
  prompt: string;
  slots: { key: string; name: string; emoji: string }[];
  results: AgentResult[];
  totalTime: number;
  iterations: number;
  /** 关联的交付台消息 ID，用于同步删除 */
  deliveryMessageId?: string;
  /** 协作分组名称 */
  groupName?: string;
}

// ============================================================
// 历史记录管理
// ============================================================

const HISTORY_KEY = (pid: string) => `studio-history-${pid}`;
const MAX_HISTORY = 50;

function loadHistory(projectId: string): PipelineHistory[] {
  try {
    const saved = localStorage.getItem(HISTORY_KEY(projectId));
    if (saved) { const p = JSON.parse(saved); if (Array.isArray(p)) return p; }
  } catch {}
  return [];
}

function saveHistoryRecord(projectId: string, record: PipelineHistory) {
  const list = loadHistory(projectId);
  list.unshift(record);
  if (list.length > MAX_HISTORY) list.length = MAX_HISTORY;
  try { localStorage.setItem(HISTORY_KEY(projectId), JSON.stringify(list)); } catch {}
}

function clearHistory(projectId: string) {
  try { localStorage.removeItem(HISTORY_KEY(projectId)); } catch {}
}

// ============================================================
// 主页面
// ============================================================

export default function StudioPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const { modelConfig, recordUsage } = useSettingsStore();
  const { prompt: showPrompt, PromptDialog } = usePrompt();

  const abortRef = useRef<AbortController | null>(null);
  const pendingPromptRef = useRef<string | null>(null);
  const pendingSlotsRef = useRef<AgentSlot[] | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // 恢复上次协作结果（sessionStorage，临时）
  const setResultsToStorage = (r: AgentResult[]) => {
    try { sessionStorage.setItem(`studio-results-${projectId}`, JSON.stringify(r)); } catch {}
  };

  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  // 以下 3 个状态依赖 localStorage/sessionStorage，初始值必须 SSR 安全（服务端/客户端一致）
  // 实际存储值在 useEffect 中加载（hydration 后执行）
  const [results, setResults] = useState<AgentResult[]>([]);
  const totalTimeRef = useRef(0);
  const iterationsRef = useRef(0);

  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [customAgents, setCustomAgents] = useState<AgentItem[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [currentGroupName, setCurrentGroupName] = useState<string | null>(null);
  // 分组成员选择弹窗
  const [groupMemberDialog, setGroupMemberDialog] = useState<{ group: any; selectedIds: string[] } | null>(null);
  const [groupMemberSearch, setGroupMemberSearch] = useState("");
  const [showAgentLib, setShowAgentLib] = useState(true);
  // dispatcher 决断交互
  const [askDialog, setAskDialog] = useState<{ question: string; options: string[] } | null>(null);
  const [paused, setPaused] = useState(false);
  // 历史记录 — SSR 安全初始值
  const [historyRecords, setHistoryRecords] = useState<PipelineHistory[]>([]);
  // 右面板 tab
  const [rightTab, setRightTab] = useState<"results" | "history">("results");

  // 流水线 — SSR 安全初始值（仅在客户端从 localStorage 恢复）
  const DEFAULT_SLOTS: AgentSlot[] = [
    { key: "planner", name: "规划师", emoji: "📋", color: "text-blue-500", type: "planner" },
    { key: "writer", name: "主笔", emoji: "📝", color: "text-green-500", type: "writer" },
    { key: "editor", name: "润色师", emoji: "✏️", color: "text-pink-500", type: "editor" },
  ];
  const [slots, setSlotsInternal] = useState<AgentSlot[]>(DEFAULT_SLOTS);

  // 页面切换/关闭时保存状态 + 中止流水线
  useEffect(() => {
    return () => {
      setResultsToStorage(results);
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydration：在客户端从 localStorage/sessionStorage 恢复数据
  useEffect(() => {
    // 恢复 slots
    try {
      const savedSlots = localStorage.getItem(`studio-pipeline-${projectId}`);
      if (savedSlots) {
        const p = JSON.parse(savedSlots);
        if (Array.isArray(p) && p.length > 0) {
          setSlotsInternal(p);
        }
      }
    } catch {}
    // 恢复 results
    try {
      const savedResults = sessionStorage.getItem(`studio-results-${projectId}`);
      if (savedResults) {
        const p = JSON.parse(savedResults);
        if (Array.isArray(p) && p.length > 0) {
          setResults(p);
        }
      }
    } catch {}
    // 恢复历史记录
    setHistoryRecords(loadHistory(projectId));
    // 从 sessionStorage 读取智能协作 prompt（避免 URL 过长导致 431）
    const promptData = sessionStorage.getItem("studioPrompt");
    if (promptData) {
      setPrompt(promptData);
      sessionStorage.removeItem("studioPrompt");
    }
    setHydrated(true);
  }, [projectId]);

  // 包装 setter 实现持久化
  const setSlots = (update: AgentSlot[] | ((prev: AgentSlot[]) => AgentSlot[])) => {
    setSlotsInternal(prev => {
      const next = typeof update === "function" ? (update as (p: AgentSlot[]) => AgentSlot[])(prev) : update;
      try { localStorage.setItem(`studio-pipeline-${projectId}`, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // ============================================================
  // 加载自定义智能体
  // ============================================================

  useEffect(() => {
    fetch(`/api/projects/${projectId}/custom-agents`).then(r => r.json()).then(d => {
      if (d.success) setCustomAgents(d.data);
    }).catch(() => {});
    // 加载协作分组
    fetch(`/api/projects/${projectId}/agent-groups`).then(r => r.json()).then(d => {
      if (d.success) setGroups(d.data);
    }).catch(() => {});
  }, [projectId]);

  // ============================================================
  // 流水线操作
  // ============================================================

  const addAgent = (key: string, name: string, emoji: string, agentType?: string) => {
    if (slots.some(s => s.key === key)) return;
    const color = Object.entries(BUILTIN).find(([k]) => k === key)?.[1]?.color || "text-gray-500";
    const type = agentType || Object.entries(BUILTIN).find(([k]) => k === key)?.[0] || "custom";
    setSlots(prev => [...prev, { key, name, emoji, color, type }]);
  };

  /** 加载协作分组到流水线 — 打开弹窗选择成员 */
  const loadGroupToPipeline = (g: any) => {
    const ids: string[] = JSON.parse(g.memberIds || "[]");
    setGroupMemberDialog({ group: g, selectedIds: [...ids] });
    setGroupMemberSearch("");
  };

  /** 确认加载选中的分组成员 */
  const confirmGroupMembers = () => {
    if (!groupMemberDialog) return;
    const { group, selectedIds } = groupMemberDialog;
    const newSlots: AgentSlot[] = [];
    for (const id of selectedIds) {
      const builtin = Object.entries(BUILTIN).find(([k]) => k === id);
      if (builtin) {
        newSlots.push({ key: id, name: builtin[1].name, emoji: builtin[1].emoji, color: builtin[1].color, isDispatcher: id === "dispatcher" });
        continue;
      }
      const custom = customAgents.find(a => a.id === id);
      if (custom) {
        newSlots.push({ key: `custom:${custom.id}`, name: custom.name, emoji: custom.emoji, color: "text-gray-500", type: (custom as any).type || "custom" });
      }
    }
    if (newSlots.length > 0) {
      setSlots(newSlots);
      setCurrentGroupName(group.name);
    }
    setGroupMemberDialog(null);
  };

  const removeSlot = (idx: number) => {
    setSlots(prev => prev.filter((_, i) => i !== idx));
  };

  const moveSlot = (idx: number, dir: number) => {
    const target = idx + dir;
    if (target < 0 || target >= slots.length) return;
    setSlots(prev => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  // ============================================================
  // 执行
  // ============================================================

  const handleRun = async () => {
    const effectivePrompt = pendingPromptRef.current || prompt;
    pendingPromptRef.current = null;
    const effectiveSlots = pendingSlotsRef.current || slots;
    pendingSlotsRef.current = null;
    if (!effectivePrompt.trim() || effectiveSlots.length === 0) return;
    setRunning(true);
    setResults([]);
    setExpandedResults(new Set());
    setRightTab("results");

    const controller = new AbortController();
    abortRef.current = controller;

    const initResults: AgentResult[] = effectiveSlots.map((s) => ({
      agent: s.key, name: s.name, emoji: s.emoji,
      output: "", time: 0, status: "pending", iteration: 0,
    }));
    setResults(initResults);
    setResultsToStorage(initResults);

    try {
      const dispatcherSlot = effectiveSlots.find(s => s.isDispatcher);
      const res = await fetch(`/api/projects/${projectId}/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: effectivePrompt,
          pipeline: effectiveSlots.map(s => s.key),
          dispatcherAgent: dispatcherSlot?.key,
          modelConfig,
          promptTemplates: useSettingsStore.getState().promptTemplates,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "执行失败", description: err.error || "", variant: "destructive" });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("无响应流");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const lines = block.split("\n");
          let eventType = "", dataStr = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7);
            if (line.startsWith("data: ")) dataStr = line.slice(6);
          }
          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            switch (eventType) {
              case "step-update":
                if (Array.isArray(data.results)) {
                  const newResults = data.results.map((r: Record<string, unknown>) => ({
                    agent: r.agent, name: r.name, emoji: r.emoji,
                    output: r.output, time: r.time, status: r.status, iteration: r.iteration,
                  }));
                  setResults(newResults);
                  setResultsToStorage(newResults);
                  if (data.iterations) iterationsRef.current = data.iterations;
                }
                break;

              case "flow-done":
                setPaused(false);
                // 1. 更新结果状态
                if (Array.isArray(data.results)) {
                  const finalResults = data.results.map((r: Record<string, unknown>) => ({
                    agent: r.agent, name: r.name, emoji: r.emoji,
                    output: r.output, time: r.time, status: r.status, iteration: r.iteration,
                  }));
                  setResults(finalResults);
                  setResultsToStorage(finalResults);

                  // 2. 保存历史记录到 localStorage
                  // 3. 自动保存到交付台 + 获取 messageId
                  let deliveryMessageId: string | undefined;
                  const combinedOutput = finalResults
                    .filter((r: AgentResult) => r.output && r.status === "done")
                    .map((r: AgentResult) => `## ${r.emoji} ${r.name}\n\n${r.output}`)
                    .join("\n\n---\n\n");
                  if (combinedOutput) {
                    const meta = {
                      source: "studio",
                      pipeline: slots.map(s => ({ key: s.key, name: s.name })),
                      agents: finalResults
                        .filter((r: AgentResult) => r.output && r.status === "done")
                        .map((r: AgentResult) => ({
                          name: r.name,
                          emoji: r.emoji,
                          output: r.output,
                        })),
                    };
                    try {
                      const msgRes = await fetch(`/api/projects/${projectId}/messages`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          role: "assistant",
                          content: combinedOutput,
                          isDraft: true,
                          metadata: meta,
                        }),
                      });
                      const msgData = await msgRes.json();
                      if (msgData.success && msgData.data?.id) {
                        deliveryMessageId = msgData.data.id;
                      }
                    } catch {}
                  }

                  // 保存历史记录（含 deliveryMessageId）
                  const record: PipelineHistory = {
                    id: Date.now().toString(36),
                    timestamp: new Date().toLocaleString("zh-CN"),
                    prompt: prompt.trim(),
                    slots: slots.map(s => ({ key: s.key, name: s.name, emoji: s.emoji })),
                    results: finalResults,
                    totalTime: finalResults.reduce((s: number, r: AgentResult) => s + r.time, 0),
                    iterations: data.iterations || 1,
                    deliveryMessageId,
                    groupName: currentGroupName || undefined,
                  };
                  saveHistoryRecord(projectId, record);
                  setHistoryRecords(loadHistory(projectId));
                }
                // 4. 记录 Token 用量
                if (data.usage) {
                  const { inputTokens, outputTokens, cachedTokens, cost } = data.usage;
                  recordUsage(inputTokens || 0, outputTokens || 0, cachedTokens || 0, cost || 0, "studio");
                }
                break;

              case "step-start":
                setResults(prev => {
                  const next = prev.map(r =>
                    r.agent === data.agent ? { ...r, status: "running", iteration: data.iteration ?? r.iteration } : r
                  );
                  setResultsToStorage(next);
                  return next;
                });
                break;

              case "step-done":
                totalTimeRef.current = (totalTimeRef.current || 0) + (data.time || 0);
                setResults(prev => {
                  const next = prev.map(r =>
                    r.agent === data.agent ? { ...r, status: "done", output: data.output, time: data.time } : r
                  );
                  setResultsToStorage(next);
                  return next;
                });
                setExpandedResults(prev => new Set(prev).add(data.agent));
                break;

              case "step-failed":
                setResults(prev => {
                  const next = prev.map(r =>
                    r.agent === data.agent ? { ...r, status: "failed", output: data.output } : r
                  );
                  setResultsToStorage(next);
                  return next;
                });
                setExpandedResults(prev => new Set(prev).add(data.agent));
                break;

              case "step-stream":
                setResults(prev => {
                  const next = prev.map((r: AgentResult) =>
                    r.agent === data.agent ? { ...r, output: data.output || "", time: data.time || 0 } : r
                  );
                  setResultsToStorage(next);
                  return next;
                });
                break;

              case "step-reset":
                setResults(prev => {
                  const next = prev.map(r =>
                    r.agent === data.resetAgent ? { ...r, status: "pending", output: "", time: 0 } : r
                  );
                  setResultsToStorage(next);
                  return next;
                });
                toast({ title: `✏️ ${data.resetName || data.resetAgent} 需要修改`, description: data.feedback?.slice(0, 100) });
                break;

              case "dispatcher-start":
                toast({ title: "🤖 调度统领正在分析任务…" });
                break;

              case "dispatcher-done":
                if (data.plan && Array.isArray(data.plan)) {
                  toast({ title: `✅ 调度完成，计划 ${data.plan.length} 步` });
                }
                break;

              case "dispatcher-ask":
                setAskDialog({ question: data.question, options: data.options || [] });
                break;

              case "flow-paused":
                setPaused(true);
                setRunning(false);
                break;

              case "flow-error":
                setPaused(false);
                toast({
                  title: "协作错误",
                  description: data.details ? `${data.error}\n\n${data.details}` : data.error,
                  variant: "destructive",
                });
                break;
            }
          } catch { /* 跳过解析失败 */ }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        toast({ title: "协作已中止" });
      } else {
        toast({ title: "执行失败", variant: "destructive" });
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setRunning(false);
    setResultsToStorage(results);
  };

  const copyAll = () => {
    const lines: string[] = [];
    lines.push("# 🤖 智能体协作完整流程");
    lines.push("");
    lines.push(`**日期**: ${new Date().toLocaleString("zh-CN")}`);
    lines.push(`**协作**: ${slots.map(s => `${s.emoji} ${s.name}`).join(" → ")}`);
    lines.push(`**流水线**: ${slots.map(s => s.name).join(" → ")}`);
    lines.push(`**任务**: ${prompt.slice(0, 200)}`);
    lines.push("");
    lines.push("---");
    lines.push("");
    for (const r of results) {
      const statusLabel = r.status === "done" ? "✅ 完成" : r.status === "failed" ? "❌ 失败" : r.status === "running" ? "⏳ 运行中" : "⏸️ 待执行";
      lines.push(`## ${r.emoji} ${r.name}`);
      lines.push("");
      lines.push(`- 状态: ${statusLabel}`);
      lines.push(`- 耗时: ${(r.time / 1000).toFixed(1)}s`);
      if (r.iteration > 0) lines.push(`- 轮次: #${r.iteration}`);
      lines.push("");
      lines.push(r.output || "（无输出）");
      lines.push("");
      lines.push("---");
      lines.push("");
    }
    const text = lines.join("\n");
    navigator.clipboard.writeText(text);
    toast({ title: "已复制完整流程" });
  };

  const [detailOpen, setDetailOpen] = useState(false);

  /** 导出为 Markdown 报告 */
  const exportMarkdown = (r?: AgentResult[], p?: string, s?: { key: string; name: string; emoji: string }[]) => {
    const data = r || results;
    const pr = p || prompt;
    const sl = s || slots;
    const lines: string[] = [];
    lines.push("# 🤖 智能体协作报告");
    lines.push("");
    lines.push(`**日期**: ${new Date().toLocaleString("zh-CN")}`);
    lines.push(`**协作**: ${sl.map(slot => `${slot.emoji} ${slot.name}`).join(" → ")}`);
    lines.push("");
    if (pr) {
      lines.push("## 📝 写作任务");
      lines.push(""); lines.push(pr); lines.push("");
    }
    lines.push("## 🔄 执行结果"); lines.push("");
    for (const ag of data) {
      const icon = ag.status === "done" ? "✅" : ag.status === "failed" ? "❌" : ag.status === "running" ? "⏳" : "⏸️";
      lines.push(`### ${icon} ${ag.emoji} ${ag.name}`);
      lines.push("");
      lines.push(`- **状态**: ${ag.status}`);
      lines.push(`- **用时**: ${(ag.time / 1000).toFixed(1)}s`);
      if (ag.iteration > 0) lines.push(`- **轮次**: 第 ${ag.iteration} 轮`);
      lines.push(""); lines.push(ag.output || "（无输出）"); lines.push("");
      lines.push("---"); lines.push("");
    }
    const total = data.reduce((s, ag) => s + ag.time, 0);
    lines.push(`**总计**: ${data.length} 步 · ${(total / 1000).toFixed(1)}s`);

    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `pipeline-report-${projectId.slice(0, 8)}.md`;
    a.click(); URL.revokeObjectURL(url);
    toast({ title: "已导出 Markdown" });
  };

  const exportJSON = (r?: AgentResult[]) => {
    const data = r || results;
    const json = {
      exportedAt: new Date().toISOString(), projectId, prompt,
      pipeline: slots.map(s => ({ key: s.key, name: s.name, emoji: s.emoji })),
      results: data.map(ag => ({
        agent: ag.agent, name: ag.name, emoji: ag.emoji,
        status: ag.status, time: ag.time, iteration: ag.iteration, output: ag.output,
      })),
      summary: {
        totalSteps: data.length,
        doneSteps: data.filter(ag => ag.status === "done").length,
        failedSteps: data.filter(ag => ag.status === "failed").length,
        totalTime: data.reduce((s, ag) => s + ag.time, 0),
      },
    };
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `pipeline-report-${projectId.slice(0, 8)}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast({ title: "已导出 JSON" });
  };

  const usedKeys = new Set(slots.map(s => s.key));

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <>
    <div className="flex-1 h-full flex flex-col bg-background dark:bg-background">
      {/* 顶部工具栏 — 极简暗色风格 */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border shrink-0 bg-background">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1">
            <span className="text-sm font-mono font-medium text-foreground tracking-tight">智能协作</span>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground/60">/</span>
          <span className="text-[11px] font-mono text-[#00cc66]">{slots.length}</span>
          <span className="text-[11px] font-mono text-muted-foreground/60">agents</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button className="h-6 px-2 text-[11px] font-mono text-muted-foreground/70 border border-border hover:border-[#00cc66] hover:text-[#00cc66] transition-colors bg-transparent" onClick={() => router.push(`/projects/${projectId}/agents`)}>
            管理
          </button>
          <button className="h-6 px-2 text-[11px] font-mono text-muted-foreground/70 border border-border hover:border-[#00cc66] hover:text-[#00cc66] transition-colors bg-transparent" onClick={() => setShowAgentLib(!showAgentLib)}>
            {showAgentLib ? "收起" : "添加"}
          </button>
          {results.length > 0 && (
            <>
              <span className="text-muted-foreground/60 text-[11px]">|</span>
              <button className="h-6 px-2 text-[11px] font-mono text-muted-foreground/70 border border-border hover:border-[#00aaff] hover:text-[#00aaff] transition-colors bg-transparent" onClick={() => exportMarkdown()}>
                MD
              </button>
              <button className="h-6 px-2 text-[11px] font-mono text-muted-foreground/70 border border-border hover:border-[#00aaff] hover:text-[#00aaff] transition-colors bg-transparent" onClick={() => exportJSON()}>
                JSON
              </button>
              <button className="h-6 px-2 text-[11px] font-mono text-muted-foreground/70 border border-border hover:border-[#00cc66] hover:text-[#00cc66] transition-colors bg-transparent" onClick={() => {
                const content = results
                  .filter(r => r.output && r.status === "done")
                  .map(r => `## ${r.emoji} ${r.name}\n\n${r.output}`)
                  .join("\n\n---\n\n");
                try { sessionStorage.setItem("studioResult", content); } catch {}
                window.location.href = `/projects/${projectId}/workspace`;
              }}>
                回填
              </button>
            </>
          )}
        </div>
      </div>

      {/* 主体：两栏布局 */}
      <div className="flex-1 flex min-h-0 bg-background">
        {/* 左侧：智能体库 */}
        {showAgentLib && (
          <div className="w-56 lg:w-64 border-r border-border overflow-y-auto shrink-0 bg-background">
            <div className="p-3 space-y-5">
              {customAgents.length > 0 && (
                <div>
                  <p className="text-[11px] font-mono text-primary/70 mb-2 tracking-wide flex items-center gap-1">
                    <span>●</span> 自定义智能体 <span className="text-muted-foreground/40">（推荐）</span>
                  </p>
                  <div className="space-y-0.5">
                    {customAgents.map(a => {
                      const ak = `custom:${a.id}`;
                      return (
                        <button key={a.id} disabled={usedKeys.has(ak) || running}
                          onClick={() => addAgent(ak, a.name, a.emoji)}
                          className={`flex items-center gap-2 w-full px-2 py-1.5 text-left text-[13px] font-mono transition-colors ${
                            usedKeys.has(ak) || running
                              ? "text-muted-foreground/60 cursor-not-allowed"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent"
                          }`}
                        >
                          <span className="text-sm shrink-0">{a.emoji}</span>
                          <span className="truncate flex-1">{a.name}</span>
                          {!usedKeys.has(ak) && !running && <span className="text-[10px] text-[#00cc66]">+添加</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* 内置智能体（默认折叠，优先使用自定义智能体） */}
              <details className="group">
                <summary className="text-[11px] font-mono text-muted-foreground/60 mb-2 tracking-wide cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1">
                  内置智能体
                  <span className="text-[10px] text-muted-foreground/40 ml-auto group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="space-y-0.5 mt-2">
                  {Object.entries(BUILTIN).map(([key, b]) => (
                    <button key={key} disabled={usedKeys.has(key) || running}
                      onClick={() => addAgent(key, b.name, b.emoji)}
                      className={`flex items-center gap-2 w-full px-2 py-1.5 text-left text-[13px] font-mono transition-colors ${
                        usedKeys.has(key) || running
                          ? "text-muted-foreground/60 cursor-not-allowed"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      }`}
                    >
                      <span className="text-sm shrink-0">{b.emoji}</span>
                      <span className="truncate flex-1">{b.name}</span>
                      <span className="text-[10px] text-muted-foreground/60">{b.desc}</span>
                      {!usedKeys.has(key) && !running && <span className="text-[10px] text-[#00cc66]">+添加</span>}
                    </button>
                  ))}
                </div>
              </details>
              <div className="border-t border-border" />
              <div>
                <p className="text-[11px] font-mono text-muted-foreground/60 mb-2 tracking-wide">协作分组</p>
                <div className="space-y-1">
                  {groups.map(g => {
                    const members = (JSON.parse(g.memberIds || "[]") as string[]).map(id => {
                      const s = [...customAgents, ...Object.entries(BUILTIN).map(([k, v]) => ({ id: k, name: v.name, emoji: v.emoji }))].find(x => x.id === id);
                      return s || { id, name: id, emoji: "❓" };
                    });
                    return (
                      <div key={g.id} onClick={() => loadGroupToPipeline(g)}
                        className={`px-2 py-1.5 border cursor-pointer text-[13px] font-mono transition-colors ${
                          currentGroupName === g.name
                            ? "border-l-[#00cc66] border-border bg-card text-foreground"
                            : "border-border text-muted-foreground hover:border-border hover:text-foreground/80"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{g.name}</span>
                          <span className="text-[10px] text-muted-foreground/60">({members.length})</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                          {members.map(m => m.emoji).join(" ")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="border-t border-border" />
              <button onClick={() => router.push(`/projects/${projectId}/agents`)}
                className="w-full text-left text-[12px] font-mono text-muted-foreground/60 hover:text-[#00cc66] py-1 transition-colors">
                管理智能体
              </button>
            </div>
          </div>
        )}

        {/* 中间：流水线配置 + 观战区 */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <div className="flex-1 p-4 space-y-4">
            {/* 协作管线 — 极简风格 */}
            <div className="border-t border-[#00aaff] bg-card">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-mono text-muted-foreground">管线</span>
                  {slots.length > 0 && (
                    <span className="text-[11px] font-mono text-muted-foreground/60">({slots.length} 个智能体)</span>
                  )}
                </div>
                {slots.length > 0 && (
                  <div className="flex items-center gap-1">
                    <button onClick={async () => {
                      const name = await showPrompt({
                        title: "保存流水线模板",
                        description: "为当前流水线配置命名，保存后可在左侧「协作分组」中加载",
                        defaultValue: `${slots.map(s => s.name).join("+")} 模板`,
                        placeholder: "模板名称",
                        confirmText: "保存",
                      });
                      if (!name) return;
                      try {
                        const memberIds = slots.map(s => s.key);
                        await fetch(`/api/projects/${projectId}/agent-groups`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ name, description: `从当前流水线保存`, memberIds }),
                        });
                        toast({ title: "模板已保存" });
                        // 刷新分组列表
                        const gRes = await fetch(`/api/projects/${projectId}/agent-groups`);
                        const gData = await gRes.json();
                        if (gData.success) setGroups(gData.data);
                      } catch { toast({ title: "保存失败", variant: "destructive" }); }
                    }} className="text-[11px] font-mono text-muted-foreground/60 hover:text-[#00cc66] transition-colors" title="保存当前管线为模板">
                      保存模板
                    </button>
                    <button onClick={() => setSlots([])} className="text-[11px] font-mono text-muted-foreground/60 hover:text-[#ff4444] transition-colors">清空</button>
                  </div>
                )}
              </div>
              <div className="p-3">
                {slots.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-[13px] font-mono text-muted-foreground/60">管线为空</p>
                    <p className="text-[11px] font-mono text-muted-foreground/50 mt-1">从左侧选择智能体加入管线</p>
                  </div>
                ) : (
                  <div className="flex items-center flex-wrap gap-1">
                    {slots.map((slot, i) => {
                      const agResult = results.find(r => r.agent === slot.key);
                      const agStatus = agResult?.status || "idle";
                      const isRunning = agStatus === "running";
                      const isDone = agStatus === "done";
                      const isFailed = agStatus === "failed";
                      return (
                        <React.Fragment key={i}>
                          <div
                            onClick={() => { if (!running) setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, isDispatcher: !s.isDispatcher } : s)); }}
                            title={slot.isDispatcher ? "取消调度标记" : "标记为调度统领"}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 border text-[12px] font-mono cursor-pointer select-none transition-colors ${
                              slot.isDispatcher ? "border-[#00aaff] bg-[#00aaff]/10 text-[#00aaff]" :
                              isRunning ? "border-[#00cc66] text-[#00cc66]" :
                              isDone ? "border-[#00cc66]/50 text-[#00cc66]" :
                              isFailed ? "border-[#ff4444] text-[#ff4444]" :
                              "border-border text-muted-foreground hover:border-border hover:text-foreground"
                            }`}
                          >
                            <span>{slot.emoji}</span>
                            <span>{slot.name}</span>
                            {slot.isDispatcher && <span className="text-[10px] text-[#00aaff]">调度</span>}
                            {slot.type && slot.type !== "custom" && !slot.isDispatcher && (
                              <span className="text-[10px] text-xs text-muted-foreground/60 border border-border px-1 ml-0.5">{{"planner":"规划","writer":"创作","reviewer":"审查","editor":"润色"}[slot.type] || slot.type}</span>
                            )}
                            {isRunning && <span className="text-[10px] text-[#00cc66]">运行中</span>}
                            {isDone && <span className="text-[10px] text-[#00cc66]">完成</span>}
                            {isFailed && <span className="text-[10px] text-[#ff4444]">失败</span>}
                          </div>
                          {i < slots.length - 1 && (
                            <span className={`text-[12px] font-mono ${
                              isRunning ? "text-[#00cc66] animate-pulse" : "text-muted-foreground/50"
                            }`}>→</span>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* 输入区 */}
            <div className="border-t border-[#00cc66] bg-card">
              <div className="px-3 py-2 border-b border-border">
                <span className="text-[12px] font-mono text-muted-foreground">任务输入</span>
              </div>
              <div className="p-3 space-y-3">
                <textarea
                  placeholder="描述要写的场景或章节…"
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  aria-label="写作任务描述"
                  className="w-full bg-background border border-border text-[13px] font-mono text-foreground px-3 py-2 resize-none outline-none focus-visible:ring-1 focus-visible:ring-ring focus:border-[#00cc66] transition-colors placeholder:text-muted-foreground/50"
                />
                <div className="flex gap-2">
                  {running ? (
                    <button onClick={handleStop} className="flex-1 h-8 border border-[#ff4444] text-[#ff4444] text-[12px] font-mono bg-transparent hover:bg-[#ff4444]/10 transition-colors">
                      stop
                    </button>
                  ) : (
                    <button onClick={handleRun} disabled={!prompt.trim() || slots.length === 0} className={`flex-1 h-8 border text-[12px] font-mono transition-colors bg-transparent ${
                      !prompt.trim() || slots.length === 0
                        ? "border-border text-muted-foreground/50 cursor-not-allowed"
                        : "border-[#00cc66] text-[#00cc66] hover:bg-[#00cc66]/10"
                    }`}>
                      run ({slots.length} 个智能体)
                    </button>
                  )}
                </div>
                {/* 暂停状态提示 */}
                {paused && (
                  <div className="flex items-center justify-between px-3 py-2 bg-amber-500/10 border border-amber-500/30 mt-2">
                    <span className="text-[12px] font-mono text-amber-500">⏸ 流程已暂停 — 调度统领等待重新评估</span>
                    <button onClick={() => setPaused(false)}
                      className="text-[11px] font-mono text-amber-500/70 hover:text-amber-500 underline"
                    >关闭</button>
                  </div>
                )}
              </div>
            </div>

            {/* 实时预览 */}
            {running && (
              <div className="space-y-3">
                {/* 流水线状态条 */}
                <div className="flex items-center gap-0 border border-border bg-card overflow-x-auto py-1.5 px-2">
                  {results.map((r, i) => (
                    <React.Fragment key={r.agent}>
                      <div className={`flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono whitespace-nowrap shrink-0 ${
                        r.status === "running" ? "text-[#00cc66]" :
                        r.status === "done" ? "text-[#00cc66]/70" :
                        r.status === "failed" ? "text-[#ff4444]" :
                        "text-muted-foreground/50"
                      }`}>
                        <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                          r.status === "running" ? "bg-[#00cc66] animate-pulse" :
                          r.status === "done" ? "bg-[#00cc66]" :
                          r.status === "failed" ? "bg-[#ff4444]" :
                          "bg-muted-foreground/30"
                        }`} />
                        <span className="hidden sm:inline">{r.emoji}</span>
                        <span className="truncate max-w-[60px]">{r.name.split("").slice(0, 4).join("")}..</span>
                      </div>
                      {i < results.length - 1 && (
                        <span className={`text-[10px] shrink-0 ${
                          r.status === "done" ? "text-[#00cc66]/50" : "text-muted-foreground/20"
                        }`}>→</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>

                {/* Agent 执行卡片流 */}
                <div className="space-y-2">
                  {results.map((r, i) => {
                    const isExpanded = expandedResults.has(r.agent);
                    const isReRun = r.iteration > 1 && (r.status === "running" || r.status === "done");
                    // 自动展开运行中的 agent
                    const autoExpand = r.status === "running" || (r.status === "done" && r.output);
                    const showContent = isExpanded || autoExpand;
                    return (
                      <div key={r.agent} className={`border transition-[border-color,box-shadow] ${
                        r.status === "running" ? "border-[#00cc66] shadow-sm shadow-[#00cc66]/5" :
                        r.status === "done" ? "border-border" :
                        r.status === "failed" ? "border-[#ff4444]/60" :
                        "border-border/50 border-dashed"
                      }`}>
                        {/* 卡片头部 */}
                        <div className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer select-none border-l-[3px] transition-colors ${
                          r.status === "running" ? "border-l-[#00cc66]" :
                          r.status === "done" ? "border-l-[#00cc66]/50" :
                          r.status === "failed" ? "border-l-[#ff4444]" :
                          "border-l-transparent"
                        }`}
                          onClick={() => {
                            if (r.output) {
                              setExpandedResults(prev => {
                                const next = new Set(prev);
                                if (next.has(r.agent)) next.delete(r.agent); else next.add(r.agent);
                                return next;
                              });
                            }
                          }}
                        >
                          <span className={`text-base shrink-0 ${r.status === "pending" ? "opacity-40" : ""}`}>{r.emoji || "🤖"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[13px] font-mono ${r.status === "pending" ? "text-muted-foreground/50" : "text-foreground"}`}>{r.name}</span>
                              {r.iteration > 1 && (
                                <span className={`text-[10px] font-mono border px-1 ${
                                  r.status === "running" ? "border-amber-500 text-amber-500" : "border-amber-500/50 text-amber-500/70"
                                }`}>#{r.iteration} 修订</span>
                              )}
                              {r.time > 0 && <span className="text-[11px] font-mono text-muted-foreground/50">{((r.time / 1000)).toFixed(1)}s</span>}
                            </div>
                            {r.status === "done" && r.output && !showContent && (
                              <div className="text-[11px] text-muted-foreground/60 font-mono truncate mt-0.5 max-w-[300px]">{r.output.slice(0, 80)}</div>
                            )}
                          </div>
                          {/* 状态 */}
                          <div className="shrink-0 flex items-center gap-2">
                            {r.status === "running" && (
                              <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#00cc66]">
                                <span className="inline-block w-1.5 h-1.5 bg-[#00cc66] rounded-full animate-pulse" />
                                运行中
                              </div>
                            )}
                            {r.status === "done" && (
                              <span className="text-[11px] font-mono text-[#00cc66]/70">✓ 完成</span>
                            )}
                            {r.status === "failed" && (
                              <span className="text-[11px] font-mono text-[#ff4444]">✗ 失败</span>
                            )}
                            {r.status === "pending" && (
                              <span className="text-[11px] font-mono text-muted-foreground/40">▶ 等待</span>
                            )}
                            {isReRun && (
                              <span className="text-[10px] font-mono text-amber-500 border border-amber-500/30 px-1">修订</span>
                            )}
                            {r.output && (
                              <span className={`text-[11px] font-mono transition-colors ${showContent ? "text-[#00cc66]" : "text-muted-foreground/40"}`}>
                                {showContent ? "▼" : "▶"}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 输出内容 */}
                        {showContent && r.output && (
                          <div className="border-t border-border bg-background">
                            <div className="max-h-[60vh] overflow-y-auto p-3">
                              <pre className="text-[13px] font-mono text-foreground/90 whitespace-pre-wrap leading-relaxed">{r.output}</pre>
                            </div>
                          </div>
                        )}
                        {r.status === "running" && !r.output && (
                          <div className="border-t border-border bg-background px-3 py-2.5">
                            <div className="flex items-center gap-2 text-[12px] font-mono text-muted-foreground/60">
                              <span className="inline-block w-1.5 h-1.5 bg-[#00cc66] animate-pulse-soft" />
                              生成中…
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右侧：结果/历史 面板 */}
        <div className="w-80 lg:w-96 border-l border-border flex flex-col bg-background shrink-0">
          {/* Tab 切换 */}
          <div className="flex border-b border-border shrink-0">
            <button onClick={() => setRightTab("results")}
              className={`flex-1 text-[12px] font-mono py-2.5 transition-colors ${
                rightTab === "results" ? "text-[#00cc66] border-b border-[#00cc66]" : "text-muted-foreground/60 hover:text-muted-foreground"
              }`}
            >结果</button>
            <button onClick={() => setRightTab("history")}
              className={`flex-1 text-[12px] font-mono py-2.5 transition-colors ${
                rightTab === "history" ? "text-[#00cc66] border-b border-[#00cc66]" : "text-muted-foreground/60 hover:text-muted-foreground"
              }`}
            >历史 ({historyRecords.length})</button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {/* Tab: results */}
            {rightTab === "results" && (
              <>
                {results.length > 0 && (
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-mono text-muted-foreground/60">输出</span>
                    <div className="flex items-center gap-0.5">
                      <button className="h-5 px-1.5 text-[10px] font-mono text-muted-foreground/60 border border-border hover:border-[#00cc66] hover:text-[#00cc66] transition-colors bg-transparent" onClick={() => exportJSON()}>JSON</button>
                      <button className="h-5 px-1.5 text-[10px] font-mono text-muted-foreground/60 border border-border hover:border-[#00cc66] hover:text-[#00cc66] transition-colors bg-transparent" onClick={copyAll}>复制</button>
                      <button className="h-5 px-1.5 text-[10px] font-mono text-muted-foreground/60 border border-border hover:border-[#00cc66] hover:text-[#00cc66] transition-colors bg-transparent" onClick={() => setExpandedResults(new Set(results.map(r => r.agent)))}>展开</button>
                    </div>
                  </div>
                )}

                {running && results.every(r => r.status === "pending") && (
                  <div className="flex flex-col items-center py-8 text-center">
                    <div className="text-[12px] font-mono text-muted-foreground/60 mb-1">processing</div>
                    <div className="text-[11px] font-mono text-muted-foreground/50">{results.filter(r => r.status === "done").length}/{results.length} 步</div>
                  </div>
                )}

                {results.map((r, i) => {
                  const isExpanded = expandedResults.has(r.agent);
                  const isError = r.status === "failed";
                  return (
                    <div key={r.agent} className={`border ${isError ? "border-[#ff4444]/30" : "border-border"} bg-card`}>
                      <button onClick={() => setExpandedResults(prev => {
                        const next = new Set(prev);
                        if (next.has(r.agent)) next.delete(r.agent); else next.add(r.agent);
                        return next;
                      })}
                        className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-accent transition-colors"
                      >
                        <span className="text-base shrink-0">{r.emoji || "🤖"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-mono text-foreground">{r.name}</span>
                            {isError ? <span className="text-[10px] text-[#ff4444]">!</span>
                              : <span className="text-[10px] text-[#00cc66]">完成</span>}
                          </div>
                          <div className="text-[11px] font-mono text-muted-foreground/60">步骤 {i + 1}/{results.length} · {(r.time / 1000).toFixed(1)}s</div>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground/60">{isExpanded ? "[-]" : "[+]"}</span>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-border bg-background">
                          <div className="max-h-60 overflow-y-auto p-2.5">
                            <pre className="text-[12px] font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">{r.output}</pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {results.length === 0 && !running && (
                  <div className="flex flex-col items-center py-12 text-center">
                    <p className="text-[12px] font-mono text-muted-foreground/60">暂无结果</p>
                    <p className="text-[11px] font-mono text-muted-foreground/50 mt-1">运行管线后可查看输出</p>
                  </div>
                )}
              </>
            )}

            {/* Tab: history */}
            {rightTab === "history" && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-muted-foreground/60">历史</span>
                  {historyRecords.length > 0 && (
                    <button onClick={() => {
                      const records = loadHistory(projectId);
                      for (const rec of records) {
                        if (rec.deliveryMessageId) {
                          fetch(`/api/projects/${projectId}/messages/${rec.deliveryMessageId}`, { method: "DELETE" }).catch(() => {});
                        }
                      }
                      clearHistory(projectId);
                      setHistoryRecords([]);
                      toast({ title: "历史已清空" });
                    }}
                      className="text-[10px] font-mono text-[#ff4444] hover:text-[#ff4444]/80"
                    >清空</button>
                  )}
                </div>

                {historyRecords.length === 0 ? (
                  <div className="flex flex-col items-center py-12 text-center">
                    <p className="text-[12px] font-mono text-muted-foreground/60">暂无历史</p>
                    <p className="text-[11px] font-mono text-muted-foreground/50 mt-1">完成的任务会出现在这里</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {historyRecords.map((rec) => (
                      <div key={rec.id} className="border border-border bg-card cursor-pointer hover:bg-accent transition-colors group"
                        onClick={() => {
                          setResults(rec.results);
                          setRightTab("results");
                          setExpandedResults(new Set());
                          setPrompt(rec.prompt);
                          toast({ title: `已加载 ${rec.timestamp}` });
                        }}
                      >
                        <div className="p-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-mono text-muted-foreground/60">{rec.timestamp}</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-mono text-muted-foreground/60 border border-border px-1">{rec.slots.length} 步</span>
                              <button className="h-4 w-4 flex items-center justify-center text-muted-foreground/60 hover:text-[#ff4444] opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const run = async () => {
                                    if (rec.deliveryMessageId) {
                                      try { await fetch(`/api/projects/${projectId}/messages/${rec.deliveryMessageId}`, { method: "DELETE" }); } catch {}
                                    }
                                    const list = loadHistory(projectId).filter(r => r.id !== rec.id);
                                    try { localStorage.setItem(HISTORY_KEY(projectId), JSON.stringify(list)); } catch {}
                                    setHistoryRecords(list);
                                    toast({ title: "记录已删除" });
                                  };
                                  run();
                                }}
                                aria-label="删除历史记录"
                                title="删除"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 text-sm">
                            {rec.slots.map((s, i) => (
                              <React.Fragment key={i}>
                                {i > 0 && <span className="text-[10px] text-muted-foreground/60 font-mono">{">"}</span>}
                                <span className="text-[13px]">{s.emoji}</span>
                              </React.Fragment>
                            ))}
                          </div>
                          {rec.groupName && (
                            <div className="text-[11px] font-mono text-[#00aaff]/60 mt-0.5 truncate">{rec.groupName}</div>
                          )}
                          <p className="text-[11px] font-mono text-muted-foreground/60 mt-1 truncate">{rec.prompt}</p>
                          <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-muted-foreground/60">
                            <span>{(rec.totalTime / 1000).toFixed(1)}s</span>
                            <span>{rec.iterations} 轮</span>
                            <span className="text-[#00cc66]">{rec.results.filter(r => r.status === "done").length} 完成</span>
                            {rec.results.some(r => r.status === "failed") && (
                              <span className="text-[#ff4444]">{rec.results.filter(r => r.status === "failed").length} 失败</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <button className="text-[10px] font-mono text-muted-foreground/60 hover:text-[#00cc66]"
                              onClick={(e) => {
                                e.stopPropagation();
                                const text = rec.results.map(r => `## ${r.emoji} ${r.name}\n\n${r.output}`).join("\n\n---\n\n");
                                navigator.clipboard.writeText(text);
                                toast({ title: "已复制" });
                              }}
                            >
                              copy
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>

      {/* 详情对话框 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>🔍 协作详情</DialogTitle>
            <DialogDescription>
              协作: {slots.map(s => `${s.emoji}${s.name}`).join(" → ")}
              {results.length > 0 && ` · ${results.length} 步 · ${(results.reduce((s,r) => s + r.time, 0) / 1000).toFixed(1)}s`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 px-1">
            {prompt && (
              <div className="bg-card p-3">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">写作任务</p>
                <p className="text-base whitespace-pre-wrap">{prompt}</p>
              </div>
            )}
            {results.map((r, i) => {
              const si = r.status === "done" ? "✅" : r.status === "failed" ? "❌" : r.status === "running" ? "⏳" : "⏸️";
              return (
                <div key={r.agent} className="border border-border overflow-hidden">
                  <div className="flex items-center gap-2 p-3 bg-card border-b border-border">
                    <span className="text-lg">{r.emoji || "🤖"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{r.name}</span>
                        <span className="text-sm px-1.5 py-0.5 rounded bg-card text-muted-foreground">{si} {r.status}</span>
                        <span className="text-sm text-muted-foreground">{i + 1}/{results.length} · {(r.time / 1000).toFixed(1)}s</span>
                        {r.iteration > 0 && <span className="text-sm text-muted-foreground">轮次#{r.iteration}</span>}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 text-sm gap-1"
                      onClick={() => { navigator.clipboard.writeText(r.output); toast({ title: "已复制" }); }}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="p-3 max-h-80 overflow-y-auto">
                    <pre className="text-base whitespace-pre-wrap font-sans leading-relaxed">{r.output || "（无输出）"}</pre>
                  </div>
                </div>
              );
            })}
            {results.length > 0 && (
              <div className="flex justify-end gap-2 pb-2">
                <Button variant="outline" size="sm" className="h-8 text-sm gap-1.5" onClick={() => exportMarkdown()}>📄 导出 Markdown</Button>
                <Button variant="outline" size="sm" className="h-8 text-sm gap-1.5" onClick={() => exportJSON()}>📋 导出 JSON</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 调度统领决断对话框 */}
      <Dialog open={askDialog !== null} onOpenChange={(open) => { if (!open) setAskDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>🤖 调度统领需要确认</DialogTitle>
            <DialogDescription>{askDialog?.question}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            {askDialog?.options.map((opt, i) => (
              <Button key={i} variant="outline" className="justify-start h-auto py-3 text-sm whitespace-normal text-left"
                onClick={() => {
                  const newPrompt = (prompt + `\n\n【调度统领提问】${askDialog?.question}\n【用户选择】${opt}`).trim();
                  setPrompt(newPrompt);
                  pendingPromptRef.current = newPrompt;
                  setAskDialog(null);
                  setPaused(false);
                  setTimeout(() => handleRun(), 50);
                }}
              >
                {opt}
              </Button>
            ))}
          </div>
          {(!askDialog?.options || askDialog.options.length === 0) && (
            <div className="flex flex-col gap-2 py-2">
              <input
                className="w-full h-8 border border-border bg-background px-2.5 text-[13px] font-mono text-foreground"
                placeholder="输入你的回答…"
                aria-label="回答调度统领的问题"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.currentTarget.value.trim()) {
                    const answer = e.currentTarget.value.trim();
                    const newPrompt = (prompt + `\n\n【调度统领提问】${askDialog?.question}\n【用户回答】${answer}`).trim();
                    setPrompt(newPrompt);
                    pendingPromptRef.current = newPrompt;
                    setAskDialog(null);
                    setPaused(false);
                    setTimeout(() => handleRun(), 50);
                  }
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 分组成员选择弹窗 */}
      <Dialog open={groupMemberDialog !== null} onOpenChange={(open) => { if (!open) setGroupMemberDialog(null); }}>
        <DialogContent className="max-w-md max-h-[70vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
            <DialogTitle className="text-sm font-mono text-foreground">
              {groupMemberDialog?.group?.name || "选择成员"}
            </DialogTitle>
          </DialogHeader>
          {groupMemberDialog && (
            <>
              <div className="px-4 pb-2 shrink-0">
                <input type="text" value={groupMemberSearch} onChange={e => setGroupMemberSearch(e.target.value)}
                  placeholder="搜索成员…"
                  aria-label="搜索协作成员"
                  className="w-full h-7 border border-border bg-background px-2 text-[12px] font-mono text-foreground placeholder:text-muted-foreground/60 outline-none focus-visible:ring-1 focus-visible:ring-ring focus:border-[#00cc66] transition-colors"
                />
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-0.5">
                {(() => {
                  const ids: string[] = JSON.parse(groupMemberDialog.group.memberIds || "[]");
                  const allMembers = ids.map((id: string) => {
                    const builtin = Object.entries(BUILTIN).find(([k]) => k === id);
                    if (builtin) return { id, name: builtin[1].name, emoji: builtin[1].emoji };
                    const custom = customAgents.find(a => a.id === id);
                    return custom ? { id, name: custom.name, emoji: custom.emoji } : { id, name: id, emoji: "❓" };
                  });
                  const filtered = groupMemberSearch
                    ? allMembers.filter((m: { id: string; name: string; emoji: string }) =>
                        m.name.toLowerCase().includes(groupMemberSearch.toLowerCase()))
                    : allMembers;
                  return filtered.length === 0 ? (
                    <p className="text-[12px] font-mono text-muted-foreground/60 text-center py-4">无匹配成员</p>
                  ) : (
                    filtered.map((m: { id: string; name: string; emoji: string }) => {
                      const sel = groupMemberDialog.selectedIds.includes(m.id);
                      return (
                        <button key={m.id} type="button"
                          role="checkbox"
                          aria-checked={sel}
                          onClick={() => setGroupMemberDialog(d => ({
                            ...d!,
                            selectedIds: sel
                              ? d!.selectedIds.filter(id => id !== m.id)
                              : [...d!.selectedIds, m.id]
                          }))}
                          className={`flex items-center gap-2 w-full px-2 py-1.5 text-[13px] font-mono transition-colors ${
                            sel ? "bg-[#00cc66]/10 text-[#00cc66]" : "text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          <div className={`w-3.5 h-3.5 border shrink-0 flex items-center justify-center transition-colors ${
                            sel ? "bg-[#00cc66] border-[#00cc66]" : "border-[#555]/30"
                          }`}>
                            {sel && <span className="text-[7px] text-[#0a0a0a]">✓</span>}
                          </div>
                          <span className="text-base">{m.emoji}</span>
                          <span className="truncate">{m.name}</span>
                        </button>
                      );
                    })
                  );
                })()}
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-border shrink-0">
                <span className="text-[11px] font-mono text-muted-foreground/60">
                  已选 {groupMemberDialog.selectedIds.length}/{JSON.parse(groupMemberDialog.group.memberIds || "[]").length} 个
                </span>
                <div className="flex gap-2">
                  <button className="h-7 px-3 text-[12px] font-mono text-muted-foreground/60 border border-border hover:border-border transition-colors bg-transparent"
                    onClick={() => setGroupMemberDialog(null)}>取消</button>
                  <button className="h-7 px-3 text-[12px] font-mono text-[#0a0a0a] bg-[#00cc66] hover:bg-[#00e676] transition-colors border-0"
                    onClick={confirmGroupMembers}>加载 ({groupMemberDialog.selectedIds.length})</button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      {PromptDialog}
    </>
  );
}