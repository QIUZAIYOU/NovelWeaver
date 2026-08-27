// app/statistics/page.tsx
// 统计中心 — 汇总所有 AI 调用的 Token 消耗与费用，按来源拆分

"use client";

import React, { useState, useEffect } from "react";
import {
  BarChart3, DollarSign, Hash, Cpu, Repeat, RotateCcw,
  TrendingUp, Zap, Brain, MessageSquare, Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  useSettingsStore,
  type Currency, type SourceStats,
} from "@/stores/settings-store";

/** 来源标签映射 */
const SOURCE_LABELS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  chat: { label: "创作空间", icon: MessageSquare, color: "text-blue-500" },
  studio: { label: "智能协作", icon: Bot, color: "text-purple-500" },
};

/** 格式化 Token */
function t(v: number): string {
  if (v < 1000) return `${v}`;
  if (v < 1_000_000) return `${(v / 1000).toFixed(1)}K`;
  return `${(v / 1_000_000).toFixed(2)}M`;
}

/** 格式化费用 */
const FMT: Record<Currency, (c: number) => string> = {
  usd: (c) => `$${c < 0.001 ? (c * 1000).toFixed(2) + "m" : c < 1 ? c.toFixed(3) : c.toFixed(2)}`,
  cny: (c) => `¥${(c * 7.24).toFixed(2)}`,
  both: (c) => `$${c < 0.001 ? (c * 1000).toFixed(2) + "m" : c < 1 ? c.toFixed(3) : c.toFixed(2)} / ¥${(c * 7.24).toFixed(2)}`,
};

export default function StatisticsPage() {
  const { sessionStats, currency, setCurrency, resetStats } = useSettingsStore();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // 组件挂载时强制刷新数据
  useEffect(() => {
    setRefreshKey(prev => prev + 1);
    // 使用 useSettingsStore.getState() 确保读取最新持久化数据
    const state = useSettingsStore.getState();
    if (state.sessionStats) {
      // 触发重渲染
      setRefreshKey(prev => prev + 1);
    }
  }, []);

  const { totalInputTokens, totalOutputTokens, totalCachedTokens, totalCost, turnCount, bySource } = sessionStats;
  const cacheHitRate = totalInputTokens > 0 ? ((totalCachedTokens / totalInputTokens) * 100).toFixed(1) : "—";
  const avgCostPerTurn = turnCount > 0 ? totalCost / turnCount : 0;

  // 来源列表
  const sources = Object.entries(bySource || {}).map(([key, stats]) => ({
    key,
    ...stats,
    label: SOURCE_LABELS[key]?.label || key,
    icon: SOURCE_LABELS[key]?.icon || BarChart3,
    color: SOURCE_LABELS[key]?.color || "text-muted-foreground",
  })).sort((a, b) => b.cost - a.cost);

  // 圆环图数据
  const totalCostForChart = sources.reduce((s, src) => s + src.cost, 0) || 1;
  const COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];

  return (
    <div className="h-full flex flex-col animate-fade-up">
      {/* 头部 */}
      <div className="border-b border-border px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-lg font-semibold">统计中心</h1>
              <p className="text-sm text-muted-foreground/70 mt-0.5">
                所有 AI 调用的 Token 消耗与费用汇总
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* 币种切换 */}
            <div className="flex items-center gap-0.5 bg-card p-0.5">
              {(["usd", "cny", "both"] as Currency[]).map((c) => (
                <button key={c} onClick={() => setCurrency(c)}
                  className={cn("px-2 py-1 text-sm transition-smooth",
                    currency === c ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                  )}
                >{c === "usd" ? "$ USD" : c === "cny" ? "¥ CNY" : "$/¥"}</button>
              ))}
            </div>
            <Button variant="outline" size="sm" className="h-8 text-sm gap-1.5 text-destructive/70"
              onClick={async () => {
                if (!showResetConfirm) { setShowResetConfirm(true); setTimeout(() => setShowResetConfirm(false), 3000); return; }
                resetStats(); setShowResetConfirm(false);
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" /> {showResetConfirm ? "确认重置？" : "重置"}
            </Button>
          </div>
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* 总计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard icon={DollarSign} label="总费用" value={FMT[currency](totalCost)} sub={turnCount > 0 ? `均费 ${FMT[currency](avgCostPerTurn)}/次` : ""} color={totalCost < 0.05 ? "text-green-500" : totalCost < 0.2 ? "text-yellow-500" : "text-red-500"} />
          <SummaryCard icon={Hash} label="总 Token" value={t(totalInputTokens + totalOutputTokens)} sub={`输入 ${t(totalInputTokens)} / 输出 ${t(totalOutputTokens)}`} color="text-blue-500" />
          <SummaryCard icon={Cpu} label="缓存命中" value={`${cacheHitRate}%`} sub={`${t(totalCachedTokens)} tokens`} color="text-purple-500" />
          <SummaryCard icon={Repeat} label="调用次数" value={String(turnCount)} sub={`${sources.length} 个来源`} color="text-amber-500" />
        </div>

        {/* 图表 + 来源明细 */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* 费用来源分布 */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" /> 费用来源分布
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sources.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <DollarSign className="h-8 w-8 text-muted-foreground/20 mb-2" />
                  <p className="text-sm text-muted-foreground/50">暂无数据</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* 比例堆叠条 */}
                  <div className="h-8 overflow-hidden flex">
                    {sources.map((src, i) => {
                      const pct = (src.cost / totalCostForChart) * 100;
                      return (
                        <div key={src.key}
                          className="h-full transition-[width,background-color] duration-500 relative group"
                          style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                          title={`${src.label}: ${FMT[currency](src.cost)} (${pct.toFixed(1)}%)`}
                        >
                          <div className="absolute inset-0 opacity-0 group-hover:opacity-10 bg-white transition-opacity" />
                        </div>
                      );
                    })}
                  </div>
                  {/* 图例明细 */}
                  <div className="space-y-2">
                    {sources.map((src, i) => {
                      const pct = ((src.cost / totalCostForChart) * 100).toFixed(1);
                      const Icon = src.icon;
                      return (
                        <div key={src.key} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <Icon className={`h-3.5 w-3.5 ${src.color}`} />
                            <span className="text-muted-foreground">{src.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground/50 w-10 text-right tabular-nums">{pct}%</span>
                            <span className="font-medium tabular-nums w-20 text-right">{FMT[currency](src.cost)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* 合计 */}
                  <div className="flex items-center justify-between text-sm font-medium pt-1 border-t border-border/50">
                    <span>合计</span>
                    <span className="tabular-nums">{FMT[currency](totalCost)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 来源明细表 */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" /> 来源明细
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {sources.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <BarChart3 className="h-10 w-10 text-muted-foreground/20 mb-3" />
                  <p className="text-sm text-muted-foreground/70">暂无统计数据</p>
                  <p className="text-sm text-muted-foreground/40 mt-1">使用创作空间或智能协作后数据会出现在这里</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* 表头 */}
                  <div className="grid grid-cols-7 gap-2 text-sm text-muted-foreground/60 font-medium px-1 pb-1 border-b border-border/50">
                    <div className="col-span-2">来源</div>
                    <div className="text-right">调用</div>
                    <div className="text-right">输入</div>
                    <div className="text-right">输出</div>
                    <div className="text-right">缓存</div>
                    <div className="text-right">费用</div>
                  </div>
                  {sources.map((src) => {
                    const Icon = src.icon;
                    return (
                      <div key={src.key} className="grid grid-cols-7 gap-2 text-sm items-center px-1 py-1.5 rounded hover:bg-accent transition-colors">
                        <div className="col-span-2 flex items-center gap-2">
                          <Icon className={`h-3.5 w-3.5 ${src.color}`} />
                          <span className="font-medium truncate">{src.label}</span>
                        </div>
                        <div className="text-right tabular-nums text-muted-foreground">{src.count}</div>
                        <div className="text-right tabular-nums text-muted-foreground">{t(src.inputTokens)}</div>
                        <div className="text-right tabular-nums text-muted-foreground">{t(src.outputTokens)}</div>
                        <div className="text-right tabular-nums text-muted-foreground">{t(src.cachedTokens)}</div>
                        <div className="text-right tabular-nums font-medium">{FMT[currency](src.cost)}</div>
                      </div>
                    );
                  })}
                  {/* 合计行 */}
                  <Separator />
                  <div className="grid grid-cols-7 gap-2 text-sm font-medium items-center px-1 pt-1">
                    <div className="col-span-2 flex items-center gap-2">
                      <BarChart3 className="h-3.5 w-3.5 text-primary" />
                      <span>合计</span>
                    </div>
                    <div className="text-right tabular-nums">{turnCount}</div>
                    <div className="text-right tabular-nums">{t(totalInputTokens)}</div>
                    <div className="text-right tabular-nums">{t(totalOutputTokens)}</div>
                    <div className="text-right tabular-nums">{t(totalCachedTokens)}</div>
                    <div className="text-right tabular-nums text-primary">{FMT[currency](totalCost)}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Token 条形对比图 */}
        {sources.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5" /> Token 用量对比
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sources.map((src, i) => {
                  const total = src.inputTokens + src.outputTokens || 1;
                  return (
                    <div key={src.key}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <div className="flex items-center gap-1.5">
                          <src.icon className={`h-3.5 w-3.5 ${src.color}`} />
                          <span className="font-medium">{src.label}</span>
                        </div>
                        <span className="text-muted-foreground tabular-nums">{t(total)}</span>
                      </div>
                      <div className="h-5 overflow-hidden bg-card flex">
                        <div className="bg-blue-400 h-full transition-[width]" style={{ width: `${(src.inputTokens / total) * 100}%` }} title={`输入 ${t(src.inputTokens)}`} />
                        <div className="bg-green-400 h-full transition-[width]" style={{ width: `${(src.outputTokens / total) * 100}%` }} title={`输出 ${t(src.outputTokens)}`} />
                        <div className="bg-purple-300 h-full transition-[width]" style={{ width: `${(src.cachedTokens / total) * 100}%` }} title={`缓存 ${t(src.cachedTokens)}`} />
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground/60 mt-0.5">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded bg-blue-400" /> 输入 {t(src.inputTokens)}</span>
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded bg-green-400" /> 输出 {t(src.outputTokens)}</span>
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded bg-purple-300" /> 缓存 {t(src.cachedTokens)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 定价参考 */}
        <div className="text-sm text-muted-foreground/50 leading-relaxed text-center">
          <p>费用按 DeepSeek 官方定价估算 · 输入 $0.05/M · 输出 $0.25/M · 缓存 $0.005/M（Flash 模型）</p>
          <p className="mt-0.5">实际以 API 账单为准 · 1 USD = 7.24 CNY</p>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <span className="text-sm font-medium text-muted-foreground/70">{label}</span>
          <Icon className={`h-4 w-4 ${color || "text-muted-foreground/40"}`} />
        </div>
        <p className={`text-lg font-bold tabular-nums ${color || ""}`}>{value}</p>
        {sub && <p className="text-sm text-muted-foreground/50 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}
