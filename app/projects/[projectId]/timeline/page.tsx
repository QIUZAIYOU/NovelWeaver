// app/projects/[projectId]/timeline/page.tsx
// 时间线可视化 — 故事事件的时间线视图（改版）

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Clock, BookMarked, FileText, MessageSquare, Loader2, Filter, CheckCircle2, Target, PenTool, ChevronDown, ChevronRight } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface TimelineEvent {
  id: string;
  type: "chapter" | "arc" | "message";
  title: string;
  date: string;
  description?: string;
  status?: string;
  wordCount?: number;
}

type FilterType = "all" | "chapter" | "arc" | "message";
type GroupMode = "day" | "week" | "month";

export default function TimelinePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [groupMode, setGroupMode] = useState<GroupMode>("week");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  const loadTimeline = useCallback(async () => {
    try {
      const [outlineRes, msgRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/outline`),
        fetch(`/api/projects/${projectId}/messages?limit=50`),
      ]);
      const outlineData = await outlineRes.json();
      const msgData = await msgRes.json();

      const items: TimelineEvent[] = [];

      if (outlineData.success) {
        for (const o of outlineData.data) {
          items.push({
            id: `outline-${o.id}`,
            type: o.level === "chapter" ? "chapter" : "arc",
            title: o.title,
            date: o.createdAt,
            description: o.content?.slice(0, 100),
            status: o.status,
            wordCount: o.content?.length || 0,
          });
        }
      }

      if (msgData.success) {
        const assistantMsgs = msgData.data.items.filter((m: { role: string }) => m.role === "assistant");
        for (const m of assistantMsgs.slice(0, 50)) {
          items.push({
            id: `msg-${m.id}`,
            type: "message",
            title: m.content.slice(0, 60) + (m.content.length > 60 ? "…" : ""),
            date: m.createdAt,
            wordCount: m.content.length,
          });
        }
      }

      items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setEvents(items);
    } catch {}
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { loadTimeline(); }, [loadTimeline]);

  const filtered = filter === "all" ? events : events.filter(e => e.type === filter);

  // 按时间分组
  const groupEvents = (items: TimelineEvent[]): { label: string; key: string; events: TimelineEvent[] }[] => {
    const groups = new Map<string, TimelineEvent[]>();
    for (const e of items) {
      const d = new Date(e.date);
      let key: string;
      let label: string;
      if (groupMode === "day") {
        key = d.toISOString().slice(0, 10);
        label = `${d.getMonth() + 1}月${d.getDate()}日`;
      } else if (groupMode === "week") {
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        key = weekStart.toISOString().slice(0, 10);
        const ws = weekStart.getDate();
        label = `${weekStart.getMonth() + 1}月第${Math.ceil(ws / 7)}周`;
      } else {
        key = d.toISOString().slice(0, 7);
        label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, evts]) => ({ label: key, key, events: evts }));
  };

  const groups = groupEvents(filtered);

  // 默认展开前 3 组
  useEffect(() => {
    if (groups.length > 0 && expandedGroups.size === 0) {
      setExpandedGroups(new Set(groups.slice(0, 3).map(g => g.key)));
    }
  }, [groups, expandedGroups.size]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const typeIcons: Record<string, React.ElementType> = {
    arc: BookMarked, chapter: FileText, message: MessageSquare,
  };
  const typeColors: Record<string, string> = {
    arc: "border-purple-500 bg-purple-500/10 text-purple-500",
    chapter: "border-green-500 bg-green-500/10 text-green-500",
    message: "border-blue-500 bg-blue-500/10 text-blue-500",
  };
  const typeBg: Record<string, string> = {
    arc: "bg-purple-500/5", chapter: "bg-green-500/5", message: "bg-blue-500/5",
  };
  const statusLabels: Record<string, string> = {
    completed: "完成", active: "进行中", draft: "草稿", abandoned: "废弃",
  };
  const statusColors: Record<string, string> = {
    completed: "bg-green-500/10 text-green-500 border-green-500/30",
    active: "bg-blue-500/10 text-blue-500 border-blue-500/30",
    draft: "bg-muted text-muted-foreground/60 border-border",
    abandoned: "bg-red-500/10 text-red-500 border-red-500/30",
  };

  const totalWords = events.reduce((s, e) => s + (e.wordCount || 0), 0);
  const completedChapters = events.filter(e => e.type === "chapter" && e.status === "completed").length;
  const totalChapters = events.filter(e => e.type === "chapter").length;

  return (
    <div className="flex-1 h-full flex flex-col animate-fade-up">
      {/* 头部 */}
      <div className="border-b border-border px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-lg font-semibold">时间线</h1>
              <p className="text-sm text-muted-foreground mt-0.5">故事事件的时间线视图，与大纲联动</p>
            </div>
          </div>
        </div>

        {/* 统计条 */}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{totalChapters} 章节</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" />{completedChapters}/{totalChapters} 完成</span>
          <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{events.filter(e => e.type === "message").length} 消息</span>
          <span className="flex items-center gap-1"><Target className="h-3 w-3" />{totalWords.toLocaleString()} 字</span>
          {/* 进度条 */}
          {totalChapters > 0 && (
            <div className="flex-1 max-w-[120px] h-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary/60 rounded-full transition-[width]" style={{ width: `${(completedChapters / totalChapters * 100)}%` }} />
            </div>
          )}
        </div>

        {/* 筛选栏 */}
        <div className="flex items-center gap-2 mt-3">
          {(["all", "chapter", "arc", "message"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs font-mono border transition-colors ${
                filter === f ? "border-primary text-foreground bg-primary/5" : "border-border text-muted-foreground/60 hover:text-foreground"
              }`}
            >
              {f === "all" ? "全部" : f === "chapter" ? "章节" : f === "arc" ? "篇章" : "消息"}
            </button>
          ))}
          <div className="flex-1" />
          {["week", "month", "day"].map(g => (
            <button key={g} onClick={() => setGroupMode(g as GroupMode)}
              className={`text-xs font-mono px-1.5 ${groupMode === g ? "text-foreground" : "text-muted-foreground/50 hover:text-foreground"}`}
            >{g === "week" ? "按周" : g === "month" ? "按月" : "按日"}</button>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" /></div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Clock className="h-16 w-16 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">暂无事件</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-6 px-6">
            {groups.map((group) => {
              const isExpanded = expandedGroups.has(group.key);
              const completed = group.events.filter(e => e.status === "completed").length;
              return (
                <div key={group.key} className="mb-4">
                  {/* 时间分组标题 */}
                  <div className="flex items-center gap-2 mb-2">
                    <button onClick={() => toggleGroup(group.key)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground/70 hover:text-foreground transition-colors">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {group.label}
                    </button>
                    <div className="flex-1 border-t border-border/30" />
                    <span className="text-[10px] text-muted-foreground/40">{group.events.length} 项</span>
                    {completed > 0 && (
                      <span className="text-[10px] text-muted-foreground/40">{completed} 完成</span>
                    )}
                  </div>

                  {/* 事件列表 */}
                  {isExpanded && (
                    <div className="relative ml-4">
                      {/* 竖线 */}
                      <div className="absolute left-[11px] top-0 bottom-0 w-px bg-border/40" />
                      <div className="space-y-2">
                        {group.events.map((event) => {
                          const Icon = typeIcons[event.type];
                          const color = typeColors[event.type];
                          const bg = typeBg[event.type];
                          const isSelected = selectedEvent?.id === event.id;
                          return (
                            <div key={event.id}
                              onClick={() => setSelectedEvent(isSelected ? null : event)}
                              className={`relative flex items-start gap-3 pl-0 cursor-pointer group transition-colors ${
                                isSelected ? "scale-[1.01]" : ""
                              }`}
                            >
                              {/* 节点 */}
                              <div className="relative z-10 flex items-center justify-center w-[23px] shrink-0">
                                <div className={`w-[13px] h-[13px] rounded-full border-2 transition-colors ${
                                  isSelected ? "border-primary bg-primary/20" :
                                  event.status === "completed" ? "border-green-500 bg-green-500/20" :
                                  event.type === "arc" ? "border-purple-500/60" :
                                  event.type === "chapter" ? "border-green-500/60" :
                                  "border-blue-500/60"
                                }`} />
                              </div>
                              {/* 卡片 */}
                              <div className={`flex-1 min-w-0 rounded border transition-colors ${
                                isSelected
                                  ? "border-primary/50 bg-card shadow-md"
                                  : "border-border/50 bg-card/50 hover:border-border hover:shadow-sm"
                              }`}>
                                <div className="px-3 py-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <Icon className={`h-3 w-3 shrink-0 ${
                                        event.type === "arc" ? "text-purple-500" :
                                        event.type === "chapter" ? "text-green-500" :
                                        "text-blue-500"
                                      }`} />
                                      <span className="text-xs font-medium truncate">{event.title}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {event.status && statusColors[event.status] && (
                                        <span className={`text-[9px] font-mono px-1.5 border ${statusColors[event.status]}`}>
                                          {statusLabels[event.status] || event.status}
                                        </span>
                                      )}
                                      <span className="text-[9px] text-muted-foreground/40 font-mono">{formatRelativeTime(new Date(event.date))}</span>
                                    </div>
                                  </div>
                                  {isSelected && event.description && (
                                    <p className="text-xs text-muted-foreground/70 mt-1.5 line-clamp-3 border-t border-border/30 pt-1.5">
                                      {event.description}
                                    </p>
                                  )}
                                  {isSelected && event.wordCount !== undefined && event.wordCount > 0 && (
                                    <p className="text-[10px] text-muted-foreground/50 mt-1">字数：{event.wordCount}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
