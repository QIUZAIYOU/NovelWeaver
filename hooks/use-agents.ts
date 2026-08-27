// hooks/use-agents.ts
// 智能体数据 Hook — 封装 fetch 逻辑和 loading / error 状态

"use client";

import { useState, useEffect, useCallback } from "react";
import { AgentCardItem } from "@/components/agents/agent-card";

/** 从 API 行解出技能/工具/世界观 ID 数组 */
function parseArr(s: string): string[] {
  try {
    const p = JSON.parse(s);
    return Array.isArray(p) ? p.filter((x: unknown) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** API 返回的原始智能体对象 */
interface RawAgent {
  id: string;
  name: string;
  type: string;
  emoji: string;
  systemPrompt: string;
  temperature: number;
  order: number;
  isActive: boolean;
  skills: string;
  mcpTools: string;
  loreIds: string;
}

/** 将 API 数据映射为 AgentCardItem */
function toCardItem(raw: RawAgent): AgentCardItem {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    emoji: raw.emoji,
    systemPrompt: raw.systemPrompt,
    temperature: raw.temperature,
    order: raw.order,
    isActive: raw.isActive,
    skills: parseArr(raw.skills),
    mcpTools: parseArr(raw.mcpTools),
    loreIds: parseArr(raw.loreIds),
  };
}

// ─── Hook: useAgents ──────────────────────────────────────

export function useAgents(projectId: string) {
  const [agents, setAgents] = useState<AgentCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/custom-agents`);
      const d = await r.json();
      if (d.success) {
        setAgents(d.data.map(toCardItem));
      } else {
        setError(d.error || "加载失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  return { agents, loading, error, reload: load };
}

// ─── Helper: agent ref 列表（供协作分组使用） ─────────────

export function toAgentRef(agent: AgentCardItem) {
  return { id: agent.id, name: agent.name, emoji: agent.emoji };
}
