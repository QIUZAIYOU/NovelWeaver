// components/chat-group/group-chat-view.tsx
// 群组聊天视图 — 微信风格 + 真实对话节奏

"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Loader2, Square, Users, MessageSquare, Settings, Plus, X, Check, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useSettingsStore } from "@/stores/settings-store";

interface GroupMember {
  id: string;
  characterId: string;
  role: string;
  character: { id: string; name: string };
}

interface ChatGroup {
  id: string;
  name: string;
  description?: string;
  members?: GroupMember[];
}

interface DialogueLine {
  speaker: string;
  content: string;
  action?: string;
}

// 每个角色固定分配一个颜色
const MEMBER_COLORS = [
  { text: "text-[#00cc66]", bg: "bg-[#00cc66]/10", border: "border-[#00cc66]/30" },
  { text: "text-[#00aaff]", bg: "bg-[#00aaff]/10", border: "border-[#00aaff]/30" },
  { text: "text-[#ff8800]", bg: "bg-[#ff8800]/10", border: "border-[#ff8800]/30" },
  { text: "text-[#aa66ff]", bg: "bg-[#aa66ff]/10", border: "border-[#aa66ff]/30" },
  { text: "text-[#ff4488]", bg: "bg-[#ff4488]/10", border: "border-[#ff4488]/30" },
  { text: "text-[#44ccdd]", bg: "bg-[#44ccdd]/10", border: "border-[#44ccdd]/30" },
  { text: "text-[#ff6644]", bg: "bg-[#ff6644]/10", border: "border-[#ff6644]/30" },
  { text: "text-[#88cc44]", bg: "bg-[#88cc44]/10", border: "border-[#88cc44]/30" },
];

function getMemberColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return MEMBER_COLORS[Math.abs(hash) % MEMBER_COLORS.length];
}

export function GroupChatView({
  group, projectId, onBack,
}: {
  group: ChatGroup; projectId: string; onBack: () => void;
}) {
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [dialogue, setDialogue] = useState<DialogueLine[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [allChars, setAllChars] = useState<{ id: string; name: string; selected: boolean }[]>([]);
  const { modelConfig } = useSettingsStore();
  const recordUsage = useSettingsStore(s => s.recordUsage);

  // 加载群组对话历史
  useEffect(() => {
    const msgId = `group:${group.id}`;
    const saved = sessionStorage.getItem(msgId);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setDialogue(prev => {
            const existing = prev.filter(d => d.speaker === "我");
            return [...existing, ...parsed];
          });
          return;
        }
        if (parsed.lines && Array.isArray(parsed.lines)) {
          const userLines = (parsed.userLines && Array.isArray(parsed.userLines)) ? parsed.userLines : [];
          const restored = [...userLines, ...parsed.lines];
          setDialogue(restored);
          setVisibleCount(parsed.lines.length);
          return;
        }
      } catch {}
    }
    // 从 API 加载历史
    fetch(`/api/projects/${projectId}/messages?limit=100`)
      .then(r => r.json())
      .then(d => {
        if (!d.success) return;
        const groupMsgs = d.data.items.filter((m: { metadata?: string }) => {
          try { const meta = JSON.parse(m.metadata || "{}"); return meta.groupId === group.id; } catch { return false; }
        });
        if (groupMsgs.length > 0) {
          const last = groupMsgs[groupMsgs.length - 1];
          try {
            const meta = JSON.parse(last.metadata || "{}");
            if (Array.isArray(meta.dialogue)) {
              const userLines = (meta.userLines && Array.isArray(meta.userLines)) ? meta.userLines : [];
              setDialogue([...userLines, ...meta.dialogue]);
              setVisibleCount(meta.dialogue.length);
            }
          } catch {}
        }
      })
      .catch(() => {});
  }, [group.id, projectId]);

  /** 保存群组对话 */
  const saveDialogue = useCallback(async (lines: DialogueLine[], prompt?: string) => {
    if (lines.length === 0) return;
    const memberLines = lines.filter(l => l.speaker !== "我");
    if (memberLines.length === 0) return;
    // 收集用户消息
    const userLines = lines.filter(l => l.speaker === "我");
    const msgId = `group:${group.id}`;
    try {
      sessionStorage.setItem(msgId, JSON.stringify({ lines: memberLines, prompt, userLines }));
    } catch {}
    try {
      await fetch(`/api/projects/${projectId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "assistant",
          content: memberLines.map(l => `【${l.speaker}】${l.content}`).join("\n"),
          metadata: { groupId: group.id, dialogue: memberLines, prompt, userLines },
          isDraft: false,
        }),
      });
    } catch {}
  }, [group.id, projectId]);
  const visibleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleCount, dialogue]);

  // 逐条显示对话（带延迟）
  useEffect(() => {
    if (dialogue.length === 0) return;
    if (visibleCount >= dialogue.length) return;

    const timer = setTimeout(() => {
      setVisibleCount(prev => Math.min(prev + 1, dialogue.length));
    }, 800 + Math.random() * 1200);

    return () => clearTimeout(timer);
  }, [visibleCount, dialogue]);

  const parseStream = (text: string) => {
    const lines: DialogueLine[] = [];
    const regex = /【([^】]+)】([\s\S]*?)(?=【|$)/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const speaker = match[1].trim();
      let content = match[2].trim();
      let action = "";
      // 提取开头或结尾的括号动作描述，如 (推眼镜) (冷笑)
      const actionRegex = /^[（(][^）)]*[）)]\s*|[\s]*[（(][^）)]*[）)]$/;
      const actionMatch = content.match(actionRegex);
      if (actionMatch) {
        action = actionMatch[0].replace(/^[\s]+|[\s]+$/g, "");
        content = content.replace(actionRegex, "").trim();
      }
      if (speaker && content) lines.push({ speaker, content, action });
    }
    return lines;
  };

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || isStreaming) return;
    setInput("");
    // 追加用户消息到对话
    setDialogue(prev => [...prev, { speaker: "我", content: prompt }]);
    setLastPrompt(prompt);
    setIsStreaming(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/chat-groups/${group.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, modelConfig }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "请求失败");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
          const parsed = parseStream(fullText);
          setDialogue(prev => {
            const userMsgs = prev.filter(d => d.speaker === "我");
            return [...userMsgs, ...parsed];
          });
          // 首次设置时立即显示第一条
          if (parsed.length > 0 && visibleCount === 0) {
            setVisibleCount(1);
          }
        }
        // 流完成，保存对话（只保存角色消息）
        const allMemberLines = parseStream(fullText);
        if (allMemberLines.length > 0) {
          // 合并之前的角色消息
          const prevMemberLines = dialogue.filter(d => d.speaker !== "我");
          const combined = [...prevMemberLines, ...allMemberLines];
          saveDialogue(combined, lastPrompt || "");
        }
        // 记录 Token 消耗（估算）
        const estimatedInput = Math.ceil((lastPrompt || "").length / 2);
        const estimatedOutput = Math.ceil(fullText.length / 2);
        const estimatedCost = (estimatedInput + estimatedOutput) * 0.000002; // 约 $0.002/1K tokens
        recordUsage(estimatedInput, estimatedOutput, 0, estimatedCost, "chat");
      }
    } catch (err) {
      toast({
        title: "群组对话失败",
        description: err instanceof Error ? err.message : "请检查模型配置",
        variant: "destructive",
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /** 清除群组对话 */
  const handleClear = async () => {
    try {
      // 调用 API 删除该群组的所有消息
      await fetch(`/api/projects/${projectId}/messages?groupId=${group.id}`, {
        method: "DELETE",
      });
    } catch {}
    // 清除本地状态
    setDialogue([]);
    setVisibleCount(0);
    setLastPrompt(null);
    const msgId = `group:${group.id}`;
    try { sessionStorage.removeItem(msgId); } catch {}
    setClearDialogOpen(false);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 群组头部 */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0 bg-background">
        <button className="h-7 w-7 flex items-center justify-center text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
          onClick={onBack} title="返回">
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center justify-center w-7 h-7 bg-card text-muted-foreground font-mono text-xs border border-border">
          {group.name[0]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-mono text-foreground truncate">{group.name}</p>
          <p className="text-[11px] font-mono text-muted-foreground/60">{group.members?.length || 0} 名成员</p>
        </div>
        <div className="flex -space-x-1">
          {group.members?.slice(0, 4).map((m) => (
            <div key={m.id}
              className="w-5 h-5 border border-background bg-muted flex items-center justify-center text-[10px] font-mono text-muted-foreground"
              title={m.character.name}>
              {m.character.name[0]}
            </div>
          ))}
        </div>
        <button className="h-6 w-6 flex items-center justify-center text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
          onClick={() => {
            Promise.all([
              fetch(`/api/projects/${projectId}/characters`).then(r => r.json()),
              fetch(`/api/projects/${projectId}/chat-groups/${group.id}`).then(r => r.json()),
            ]).then(([cData, gData]) => {
              if (cData.success && gData.success) {
                const memberIds = new Set((gData.data.members || []).map((m: { characterId: string }) => m.characterId));
                setAllChars(cData.data.map((c: { id: string; name: string }) => ({
                  id: c.id, name: c.name, selected: memberIds.has(c.id),
                })));
                setMemberDialogOpen(true);
              }
            }).catch(() => {});
          }} title="管理成员">
          <Settings className="h-3.5 w-3.5" />
        </button>
        <button className="h-6 w-6 flex items-center justify-center text-muted-foreground/60 hover:text-red-400 transition-colors shrink-0"
          onClick={() => setClearDialogOpen(true)} title="清除对话">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 对话内容 — 微信风格 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-background">
        {dialogue.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/60/30 mb-3" />
            <p className="text-[13px] font-mono text-muted-foreground/60">群组对话</p>
            <p className="text-[12px] font-mono text-muted-foreground/60/60 mt-1 max-w-sm">
              输入一个场景或话题，群组成员将自动围绕它展开对话
            </p>
            <div className="mt-4 text-[12px] font-mono text-muted-foreground/60/50 bg-card p-3 max-w-sm border border-border">
              <p className="mb-1">示例：</p>
              <p>"伽马队接到一个新任务，要去调查一个未知阈界"</p>
            </div>
          </div>
        )}

        {/* 对话列表 */}
        {dialogue.slice(0, visibleCount || dialogue.length).map((line, i) => {
          const isUser = line.speaker === "我";
          const prev = i > 0 ? dialogue[i - 1] : null;
          const isSameSpeaker = prev?.speaker === line.speaker;
          const color = getMemberColor(line.speaker);

          if (isUser) {
            // 用户消息 — 右对齐，绿色气泡，右侧小三角
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[55%] flex gap-3 flex-row-reverse">
                  {!isSameSpeaker ? (
                    <div className="w-8 h-8 shrink-0 flex items-center justify-center text-[12px] font-mono bg-[#00cc66] text-[#0a0a0a] border border-[#00cc66]">
                      我
                    </div>
                  ) : null}
                  <div>
                    {!isSameSpeaker && (
                      <p className="text-[11px] font-mono mb-0.5 text-right text-muted-foreground">我</p>
                    )}
                    <div className="relative">
                      <div className="text-[13px] font-mono whitespace-pre-wrap break-words bg-[#00cc66] text-[#0a0a0a] px-3 py-2 leading-relaxed">
                        {line.content}
                      </div>
                      {/* 右侧小三角 — 指向头像左侧 */}
                      {!isSameSpeaker && (
                        <div className="absolute top-1.5 -right-[5px] w-0 h-0 border-t-[5px] border-b-[5px] border-l-[5px] border-t-transparent border-b-transparent border-l-[#00cc66]" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          // 成员消息 — 左对齐，深色气泡，左侧小三角
          return (
            <div key={i} className="flex gap-3" style={{ marginLeft: isSameSpeaker ? 38 : undefined }}>
              {!isSameSpeaker ? (
                <div className={`w-8 h-8 shrink-0 flex items-center justify-center text-[12px] font-mono ${color.bg} ${color.text} border ${color.border}`}>
                  {line.speaker[0]}
                </div>
              ) : null}
              <div className="min-w-0 max-w-[55%]">
                {!isSameSpeaker && (
                  <p className={`text-[11px] font-mono mb-0.5 ${color.text}`}>
                    {line.speaker}
                    {line.action && (
                      <span className="text-[10px] font-mono text-muted-foreground/60 ml-1">{line.action}</span>
                    )}
                  </p>
                )}
                <div className="relative">
                  <div className="text-[13px] font-mono whitespace-pre-wrap break-words bg-muted px-3 py-2 leading-relaxed text-foreground">
                    {line.content}
                  </div>
                  {/* 左侧小三角 — 指向头像右侧 */}
                  {!isSameSpeaker && (
                    <div className="absolute top-1.5 -left-[5px] w-0 h-0 border-t-[5px] border-b-[5px] border-r-[5px] border-t-transparent border-b-transparent border-r-muted" />
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {isStreaming && dialogue.filter(d => d.speaker !== "我").length === 0 && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
            <span className="text-[12px] font-mono text-muted-foreground/60 ml-2">正在输入...</span>
          </div>
        )}
        {isStreaming && dialogue.filter(d => d.speaker !== "我").length > 0 && visibleCount > 0 && visibleCount < dialogue.filter(d => d.speaker !== "我").length && (
          <div className="flex items-center gap-1.5 py-1 ml-9">
            <span className="w-1.5 h-1.5 bg-[#555] animate-pulse-soft" />
            <span className="w-1.5 h-1.5 bg-[#555] animate-pulse-soft" style={{ animationDelay: "300ms" }} />
            <span className="w-1.5 h-1.5 bg-[#555] animate-pulse-soft" style={{ animationDelay: "600ms" }} />
            <span className="text-[11px] font-mono text-muted-foreground/60 ml-1">正在输入...</span>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* 输入区 */}
      <div className="border-t border-border p-3 bg-background">
        <div className="flex gap-2 items-end relative">
          <Textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
            }}
            onKeyDown={handleKeyDown}
            placeholder="输入场景或话题，群组成员将自动对话..."
            rows={1}
            className="resize-none text-[13px] font-mono pr-10 min-h-[34px] bg-background border-border"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button onClick={handleStop}
              className="absolute right-1 top-1 h-6 w-6 flex items-center justify-center border border-[#ff4444] text-[#ff4444] hover:bg-[#ff4444]/10 transition-colors bg-transparent">
              <Square className="h-3 w-3" />
            </button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim()}
              className="absolute right-1 top-1 h-6 w-6 flex items-center justify-center border border-[#00cc66] text-[#00cc66] hover:bg-[#00cc66]/10 transition-colors bg-transparent disabled:border-border disabled:text-muted-foreground/50">
              <Send className="h-3 w-3" />
            </button>
          )}
        </div>
        <p className="text-[11px] font-mono text-muted-foreground/60/50 mt-1">@角色名 可点名提问</p>
      </div>

      {/* 管理成员对话框 */}
      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>管理成员 — {group.name}</DialogTitle></DialogHeader>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {allChars.map((c) => (
              <button key={c.id}
                onClick={() => setAllChars(prev => prev.map(p => p.id === c.id ? { ...p, selected: !p.selected } : p))}
                className={`flex items-center gap-2 w-full p-2 text-[13px] font-mono transition-colors ${
                  c.selected ? "bg-[#00cc66]/10 text-[#00cc66]" : "text-muted-foreground hover:bg-accent"
                }`}
              >
                <div className={`w-3.5 h-3.5 border flex items-center justify-center shrink-0 ${
                  c.selected ? "bg-[#00cc66] border-[#00cc66]" : "border-[#555]/30"
                }`}>
                  {c.selected && <Check className="h-2.5 w-2.5 text-[#0a0a0a]" />}
                </div>
                <span>{c.name}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setMemberDialogOpen(false)}>取消</Button>
            <Button size="sm" onClick={async () => {
              const gData = await fetch(`/api/projects/${projectId}/chat-groups/${group.id}`).then(r => r.json());
              const currentIds = new Set((gData.data.members || []).map((m: { characterId: string }) => m.characterId));
              const newIds = new Set(allChars.filter(c => c.selected).map(c => c.id));
              const toAdd = [...newIds].filter(id => !currentIds.has(id));
              if (toAdd.length > 0) {
                await fetch(`/api/projects/${projectId}/chat-groups/${group.id}/members`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ characterIds: toAdd }),
                });
              }
              const toRemove = allChars.filter(c => currentIds.has(c.id) && !c.selected);
              for (const c of toRemove) {
                const member = gData.data.members.find((m: { characterId: string }) => m.characterId === c.id);
                if (member) {
                  await fetch(`/api/projects/${projectId}/chat-groups/${group.id}/members/${member.id}`, { method: "DELETE" });
                }
              }
              toast({ title: "成员已更新" });
              setMemberDialogOpen(false);
            }}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 清除对话确认对话框 */}
      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>清除群组对话</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] font-mono text-muted-foreground">
            确定要清除「{group.name}」的所有对话记录吗？此操作不可撤销。
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setClearDialogOpen(false)}>取消</Button>
            <Button variant="destructive" size="sm" onClick={handleClear}>确认清除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
