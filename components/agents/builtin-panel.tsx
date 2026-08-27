// components/agents/builtin-panel.tsx
// 内置智能体 & 模板快速创建面板

"use client";

import React from "react";
import { Bot, Sparkles, Plus, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ─── 常量 ───────────────────────────────────────────────────

const BUILTIN_LIST = [
  { id: "planner", name: "规划师", emoji: "📋", color: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400", desc: "拆解任务制定大纲" },
  { id: "writer", name: "主笔", emoji: "📝", color: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400", desc: "生成故事正文" },
  { id: "loreKeeper", name: "设定监理", emoji: "🔍", color: "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400", desc: "检查设定一致性" },
  { id: "characterAgent", name: "角色监理", emoji: "🎭", color: "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400", desc: "验证角色表现" },
  { id: "editor", name: "润色师", emoji: "✏️", color: "bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400", desc: "文字润色优化" },
];

const PRESET_TEMPLATES = [
  { name: "大纲规划师", emoji: "📋", systemPrompt: "你是一位资深写作规划师。你的任务是将写作需求拆解为结构化的章节大纲，包含核心冲突、关键场景和角色发展弧线。输出格式：清晰的 Markdown 大纲。" },
  { name: "情节设计师", emoji: "🎪", systemPrompt: "你是一位情节设计专家。你擅长设计故事的起承转合、悬念设置和节奏控制。请分析当前故事走向，提出 3-5 个可能的情节发展方向。" },
  { name: "对话写手", emoji: "💬", systemPrompt: "你是一位对话写作专家。你擅长根据角色设定撰写自然生动的对话。注意每个角色的说话风格、潜台词和情感层次。" },
  { name: "风格模仿师", emoji: "🎨", systemPrompt: "你是一位风格模仿专家。你会仔细分析参考文本的句式、用词、节奏和语气，然后以完全一致的风格创作新内容。" },
  { name: "情节校验官", emoji: "🔎", systemPrompt: "你是一位情节逻辑校验官。严格检查情节中的逻辑漏洞、时间线矛盾和角色行为不一致。发现问题用 @writer 标记需要修改的部分。" },
  { name: "世界构建师", emoji: "🌍", systemPrompt: "你是一位世界构建专家。你擅长创建详细的世界观设定，包括地理、历史、文化、政治和魔法体系。输出格式：结构化的设定文档。" },
];

// ─── 类型 ───────────────────────────────────────────────────

interface BuiltinPanelProps {
  onAddBuiltin: (name: string) => void;
  onUseTemplate: (template: { name: string; emoji: string; systemPrompt: string }) => void;
}

// ─── 组件 ───────────────────────────────────────────────────

export function BuiltinPanel({ onAddBuiltin, onUseTemplate }: BuiltinPanelProps) {
  return (
    <div className="space-y-4">
      {/* ── 内置智能体（水平滚动） ── */}
      <div>
        <div className="flex items-center gap-2 mb-2.5">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            内置智能体
          </span>
          <span className="text-xs text-muted-foreground/50">（{BUILTIN_LIST.length}）</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 items-stretch scrollbar-thin">
          {BUILTIN_LIST.map((b) => (
            <Card
              key={b.id}
              className="hover:shadow-sm transition-smooth min-w-[140px] flex-shrink-0 h-full group"
            >
              <CardContent className="p-3 text-center flex flex-col items-center justify-between h-full">
                <div>
                  <div
                    className={`w-9 h-9 ${b.color} flex items-center justify-center text-base mx-auto mb-1.5`}
                  >
                    {b.emoji}
                  </div>
                  <p className="text-sm font-medium">{b.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{b.desc}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs mt-2 gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => onAddBuiltin(b.name)}
                >
                  <Plus className="h-3 w-3" /> 添加
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── 分隔 ── */}
      <div className="flex items-center gap-2 pt-1">
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground">从模板快速创建</span>
        <div className="flex-1 border-t border-border/30" />
      </div>

      {/* ── 模板网格（水平滚动） ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {PRESET_TEMPLATES.map((t) => (
          <button
            key={t.name}
            type="button"
            onClick={() => onUseTemplate(t)}
            className="flex flex-col items-center justify-center gap-1 p-2.5 border border-border hover:border-primary/40 hover:bg-muted transition-smooth text-center min-w-[100px] flex-shrink-0 h-[90px] group"
          >
            <span className="text-xl group-hover:scale-110 transition-transform">{t.emoji}</span>
            <span className="text-xs font-medium">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
