// components/session-stats-panel.tsx
// 会话统计面板 - 仿 Reasonix Desktop 的 Cost / Cache / Token 面板
// 支持美元、人民币、双币种显示

"use client";

import React from "react";
import {
  DollarSign, Zap, BarChart3, Hash, Repeat, Cpu, TrendingUp,
  RotateCcw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useSettingsStore, DEEPSEEK_PRICING,
  formatUSD, formatCNY, formatDualCurrency, type Currency,
} from "@/stores/settings-store";

/** 格式化 Token 数 */
function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

/** 成本颜色 */
function costColor(cost: number): string {
  if (cost < 0.05) return "text-green-500";
  if (cost < 0.2) return "text-yellow-500";
  return "text-red-500";
}

/** 币种格式化函数映射 */
const FORMATTERS: Record<Currency, (cost: number) => string> = {
  usd: formatUSD,
  cny: formatCNY,
  both: (c) => `${formatUSD(c)} / ${formatCNY(c)}`,
};

export function SessionStatsPanel() {
  const { modelConfig, sessionStats, currency, setCurrency, resetStats } = useSettingsStore();
  const { totalInputTokens, totalOutputTokens, totalCachedTokens, totalCost, turnCount } = sessionStats;

  const cacheHitRate = totalInputTokens > 0
    ? ((totalCachedTokens / totalInputTokens) * 100).toFixed(1)
    : "—";

  const avgCostPerTurn = turnCount > 0 ? totalCost / turnCount : 0;
  const formatCost = FORMATTERS[currency];

  const pricing = modelConfig.modelName.toLowerCase().includes("pro")
    ? DEEPSEEK_PRICING["v4-pro"]
    : DEEPSEEK_PRICING["v4-flash"];

  const presetLabels: Record<string, string> = {
    flash: "Flash", auto: "Auto", pro: "Pro",
  };

  const currencyOptions: { value: Currency; label: string }[] = [
    { value: "usd", label: "$ USD" },
    { value: "cny", label: "¥ CNY" },
    { value: "both", label: "$/¥" },
  ];

  return (
    <div className="space-y-3">
      {/* 标题 + 币种切换 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            会话统计
          </span>
        </div>
        <div className="flex items-center gap-1">
          {currencyOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setCurrency(opt.value)}
              className={`px-1.5 py-0.5 text-sm rounded transition-smooth ${
                currency === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <Badge variant="outline" className="text-sm gap-1 ml-1">
            <Zap className="h-3 w-3 text-amber-500" />
            {presetLabels[modelConfig.preset] || "Flash"}
          </Badge>
        </div>
      </div>

      {/* 模型信息 */}
      <div className="grid grid-cols-2 gap-1.5">
        <StatBox
          icon={Cpu}
          label="模型"
          value={modelConfig.modelName.includes("pro") ? "v4-Pro" : "v4-Flash"}
          sub={`温度 ${modelConfig.temperature}`}
        />
        <StatBox
          icon={Repeat}
          label="轮次"
          value={String(turnCount)}
          sub={`均费 ${formatCost(avgCostPerTurn)}`}
        />
      </div>

      {/* Token 统计 */}
      <Card>
        <CardHeader className="pb-1.5">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Hash className="h-3 w-3" />
            Token 用量
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-2.5">
          <div className="space-y-1.5">
            <TokenRow label="输入" value={totalInputTokens} color="text-blue-500" />
            <TokenRow label="输出" value={totalOutputTokens} color="text-green-500" />
            <TokenRow label="缓存命中" value={totalCachedTokens} color="text-purple-500" />
          </div>
        </CardContent>
      </Card>

      {/* 费用统计 */}
      <Card>
        <CardHeader className="pb-1.5">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <DollarSign className="h-3 w-3" />
            费用
            <button onClick={resetStats} className="ml-auto text-muted-foreground/50 hover:text-foreground" title="重置统计">
              <RotateCcw className="h-3 w-3" />
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-2.5">
          <div className="flex items-end justify-between">
            <div>
              <p className={`text-lg font-bold tabular-nums ${costColor(totalCost)}`}>
                {formatCost(totalCost)}
              </p>
              {currency === "both" && (
                <p className="text-sm text-muted-foreground/60">
                  ≈ {formatUSD(totalCost)} / {formatCNY(totalCost)}
                </p>
              )}
              <p className="text-sm text-muted-foreground mt-0.5">
                会话总计 · {turnCount} 轮
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <TrendingUp className="h-3 w-3" />
                缓存命中率
              </div>
              <p className="text-sm font-semibold tabular-nums text-purple-500">
                {cacheHitRate}%
              </p>
            </div>
          </div>

          {/* 进度条 */}
          {totalInputTokens + totalOutputTokens > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex h-1.5 rounded-full overflow-hidden bg-card">
                <div className="bg-purple-500 transition-[width]" style={{ width: `${(totalCachedTokens / Math.max(totalInputTokens + totalOutputTokens, 1)) * 100}%` }} />
                <div className="bg-blue-500 transition-[width]" style={{ width: `${((totalInputTokens - totalCachedTokens) / Math.max(totalInputTokens + totalOutputTokens, 1)) * 100}%` }} />
                <div className="bg-green-500 transition-[width]" style={{ width: `${(totalOutputTokens / Math.max(totalInputTokens + totalOutputTokens, 1)) * 100}%` }} />
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block" /> 缓存</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" /> 输入</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" /> 输出</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 定价参考 - 双币种 */}
      <div className="text-sm text-muted-foreground/60 leading-relaxed">
        <p>
          输入(未命中) <PriceDisplay usd={pricing.inputCacheMiss} currency={currency} />
          · 输入(缓存) <PriceDisplay usd={pricing.inputCacheHit} currency={currency} />
          · 输出 <PriceDisplay usd={pricing.output} currency={currency} />
        </p>
        {currency === "cny" && <p>按 1 USD = 7.24 CNY 换算 · 实际以 API 账单为准</p>}
        {currency === "usd" && <p>每次对话估算 · 实际以 API 账单为准</p>}
      </div>
    </div>
  );
}

function PriceDisplay({ usd, currency }: { usd: number; currency: Currency }) {
  if (currency === "usd") return <span>${usd}/M</span>;
  if (currency === "cny") return <span>¥{(usd * 7.24).toFixed(3)}/M</span>;
  return <span>${usd}/M (¥{(usd * 7.24).toFixed(3)})</span>;
}

function StatBox({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 p-2 border border-border bg-background/50">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold tabular-nums truncate">{value}</p>
        {sub && <p className="text-sm text-muted-foreground/60">{sub}</p>}
      </div>
    </div>
  );
}

function TokenRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono font-medium tabular-nums ${color}`}>{formatTokens(value)}</span>
    </div>
  );
}
