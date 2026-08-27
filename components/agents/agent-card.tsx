// components/agents/agent-card.tsx
// 智能体卡片 — 暗色终端风格，无圆角，无装饰色条

"use client";

import React from "react";
import {
  Edit3, Trash2, Power, PowerOff, Sparkles,
  Zap, Server, BookOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── 类型 ───────────────────────────────────────────────────

export interface AgentCardItem {
  id: string;
  name: string;
  type: string;
  emoji: string;
  systemPrompt: string;
  temperature: number;
  order: number;
  isActive: boolean;
  skills: string[];
  mcpTools: string[];
  loreIds: string[];
}

interface AgentCardProps {
  agent: AgentCardItem;
  onEdit: (agent: AgentCardItem) => void;
  onDelete: (id: string) => void;
  onToggleActive: (agent: AgentCardItem) => void;
  onUse: (agent: AgentCardItem) => void;
}

const TYPE_LABEL: Record<string, string> = {
  planner: "调度",
  writer: "创作",
  reviewer: "审查",
  editor: "润色",
  custom: "通用",
};

// ─── 组件 ───────────────────────────────────────────────────

export function AgentCard({
  agent,
  onEdit,
  onDelete,
  onToggleActive,
  onUse,
}: AgentCardProps) {
  return (
    <div
      className={cn(
        "group border border-border bg-card",
        "hover:border-border transition-colors",
        !agent.isActive && "opacity-40",
      )}
    >
      <div className="p-3">
        {/* ── 头部行 ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <span className="text-xl shrink-0 mt-0.5">{agent.emoji}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[13px] font-mono text-foreground truncate">{agent.name}</span>
                {agent.isActive ? (
                  <span className="text-[10px] font-mono text-[#00cc66] border border-[#00cc66]/30 px-1">在线</span>
                ) : (
                  <span className="text-[10px] font-mono text-muted-foreground/60 border border-border px-1">离线</span>
                )}
                {agent.type && agent.type !== "custom" && (
                  <span className="text-[10px] font-mono text-amber-500/80 border border-amber-500/30 px-1">{TYPE_LABEL[agent.type] || agent.type}</span>
                )}
              </div>
              <p className="text-[12px] font-mono text-muted-foreground/70 mt-0.5 line-clamp-2 leading-relaxed">
                {agent.systemPrompt}
              </p>
            </div>
          </div>

          {/* 悬停操作按钮 */}
          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              className="h-6 w-6 flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
              onClick={() => onToggleActive(agent)}
              aria-label={agent.isActive ? "停用智能体" : "启用智能体"}
              title={agent.isActive ? "停用" : "启用"}
            >
              {agent.isActive ? <PowerOff className="h-3 w-3" /> : <Power className="h-3 w-3" />}
            </button>
            <button
              className="h-6 w-6 flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
              onClick={() => onEdit(agent)}
              aria-label="编辑智能体"
              title="编辑"
            >
              <Edit3 className="h-3 w-3" />
            </button>
            <button
              className="h-6 w-6 flex items-center justify-center text-muted-foreground/60 hover:text-[#ff4444] hover:bg-muted transition-colors"
              onClick={() => onDelete(agent.id)}
              aria-label="删除智能体"
              title="删除"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* ── 属性指示条 ── */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {agent.temperature !== undefined && (
            <span className="text-[11px] font-mono text-muted-foreground/60">温度 {agent.temperature}</span>
          )}
          {agent.skills.length > 0 && (
            <span className="text-[11px] font-mono text-muted-foreground/60">技能 {agent.skills.length}</span>
          )}
          {agent.mcpTools.length > 0 && (
            <span className="text-[11px] font-mono text-muted-foreground/60">工具 {agent.mcpTools.length}</span>
          )}
          {agent.loreIds.length > 0 && (
            <span className="text-[11px] font-mono text-muted-foreground/60">世界观 {agent.loreIds.length}</span>
          )}
        </div>

        {/* ── 底部操作 ── */}
        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border">
          <button
            className="flex-1 h-7 text-[11px] font-mono text-muted-foreground/60 hover:text-foreground transition-colors bg-transparent"
            onClick={() => onEdit(agent)}
          >
            编辑
          </button>
          <button
            className="flex-1 h-7 text-[11px] font-mono text-[#00cc66] hover:text-[#00e676] transition-colors bg-transparent"
            onClick={() => onUse(agent)}
          >
            使用
          </button>
        </div>
      </div>
    </div>
  );
}
