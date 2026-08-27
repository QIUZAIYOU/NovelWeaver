// app/projects/[projectId]/workspace/page.tsx
// 创作空间 - 核心工作台（聊天界面 + 上下文面板）

"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Send,
  Loader2,
  PanelRightOpen,
  PanelRightClose,
  Pin,
  PinOff,
  Trash2,
  Sparkles,
  Square,
  Edit3,
  Check,
  X,
  History,
  FileText,
  CheckCircle2,
  Cpu,
  DollarSign,
  Hash,
  Repeat,
  Bug,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useSettingsStore, DEEPSEEK_PRICING, formatTokens, formatUSD } from "@/stores/settings-store";
import { toast } from "@/hooks/use-toast";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { GitHistoryDialog } from "@/components/git-history-dialog";
import { ProseDeliveryPanel } from "@/components/prose-delivery-panel";
import { SessionStatsPanel } from "@/components/session-stats-panel";
import { ChatSidebar } from "@/components/chat-sidebar";
import { GroupChatView } from "@/components/chat-group/group-chat-view";
import { useConfirm } from "@/hooks/use-confirm";

/** 消息类型 */
interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  isPinned: boolean;
  createdAt: string;
  /** 角色扮演时的角色名称 */
  characterName?: string;
}

/** 世界状态 */
interface WorldStateItem {
  id: string;
  key: string;
  value: string;
  description: string;
}

export default function WorkspacePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { modelConfig, sessionStats, recordUsage } = useSettingsStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [worldStates, setWorldStates] = useState<WorldStateItem[]>([]);
  const [gitHistoryOpen, setGitHistoryOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<"context" | "delivery" | "stats" | "outline">("context");
  const [saveAsDraft, setSaveAsDraft] = useState(false);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [activeChatLabel, setActiveChatLabel] = useState("");
  const [activeChatType, setActiveChatType] = useState<"char" | "group" | null>(null);
  const [chatGroupCreateOpen, setChatGroupCreateOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [createGroupChars, setCreateGroupChars] = useState<{ id: string; name: string }[]>([]);
  const [createGroupSelected, setCreateGroupSelected] = useState<Set<string>>(new Set());
  const [createGroupSearch, setCreateGroupSearch] = useState("");
  const [groupData, setGroupData] = useState<Record<string, unknown> | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();
  // 大纲数据
  const [outlineItems, setOutlineItems] = useState<{ id: string; title: string; level: string; status: string }[]>([]);
  // 多标签
  const [tabs, setTabs] = useState<{ id: string; label: string }[]>([{ id: "main", label: "对话" }]);
  const [activeTabId, setActiveTabId] = useState("main");

  // @提及状态
  const [characters, setCharacters] = useState<{ id: string; name: string }[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);
  const mentionFiltered = mentionQuery
    ? characters.filter((c) => c.name.toLowerCase().includes(mentionQuery.toLowerCase()))
    : characters;

  // 编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  /** 展开全文的消息 ID */
  const [expandedMsgIds, setExpandedMsgIds] = useState<Set<string>>(new Set());
  // 错误报告状态
  const [reportingMsgId, setReportingMsgId] = useState<string | null>(null);
  const [errorCategory, setErrorCategory] = useState("ooc");
  const [errorSeverity, setErrorSeverity] = useState("minor");
  const [errorContext, setErrorContext] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  /** 记录当前正在流式输出的 AI 消息 ID */
  const streamingMsgIdRef = useRef<string | null>(null);
  /** 标记是否正在删除消息（阻止 AbortError 处理器重新保存） */
  const isDeletingRef = useRef(false);
  /** Streamdown 容器 ref，用于注入光标 */
  const cursorContainerRef = useRef<HTMLDivElement | null>(null);
  /** 是否有光标在 DOM 中（防止 MutationObserver 自触发） */
  const hasCursorRef = useRef(false);

  /** 滚动到底部 */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // 自动保存草稿到 localStorage（每 30 秒）
  useEffect(() => {
    if (!activeChat || messages.length === 0) return;
    const interval = setInterval(() => {
      try {
        const key = `workspace-draft-${projectId}-${activeChat}`;
        sessionStorage.setItem(key, JSON.stringify({
          time: Date.now(),
          count: messages.length,
        }));
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [activeChat, messages.length, projectId]);

  // 页面关闭前保存
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (messages.length > 0 && activeChat) {
        try {
          const key = `workspace-draft-${projectId}-${activeChat}`;
          sessionStorage.setItem(key, JSON.stringify({
            time: Date.now(), count: messages.length,
          }));
        } catch {}
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [messages.length, activeChat, projectId]);

  /** 加载消息历史 */
  const loadMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/messages?limit=100`);
      const data = await res.json();
      if (data.success) {
        // 解析 metadata 中的 characterName
        const items = data.data.items.map((m: Record<string, unknown>) => {
          let characterName: string | undefined;
          if (typeof m.metadata === "string") {
            try {
              const meta = JSON.parse(m.metadata);
              if (meta.characterName) characterName = meta.characterName;
            } catch {}
          }
          return { ...m, characterName };
        });
        setMessages(items);
      }
    } catch (err) {
      console.error("加载消息失败:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  /** 加载世界状态 */
  const loadWorldStates = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/world-state`);
      const data = await res.json();
      if (data.success) {
        setWorldStates(data.data);
      }
    } catch (err) {
      console.error("加载世界状态失败:", err);
    }
  }, [projectId]);

  useEffect(() => {
    loadMessages();
    loadWorldStates();
    // 加载角色列表（用于 @ 提及）
    fetch(`/api/projects/${projectId}/characters`).then((r) => r.json()).then((d) => {
      if (d.success) setCharacters(d.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
    }).catch(() => {});
    // 加载大纲
    fetch(`/api/projects/${projectId}/outline`).then((r) => r.json()).then((d) => {
      if (d.success) setOutlineItems(d.data);
    }).catch(() => {});
    // 从 sessionStorage 获取智能协作回填内容（避免 URL 过长导致 431）
    const studioData = sessionStorage.getItem("studioResult");
    if (studioData) {
      setInput(studioData);
      toast({ title: "已从智能协作回填内容", description: "内容已填入输入框，可发送到对话中" });
      sessionStorage.removeItem("studioResult");
    }
  }, [loadMessages, loadWorldStates, projectId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  /**
   * 流式输出光标注入：
   * Streamdown 把内容渲染为多个 <p> block，CSS ::after 只能跟在所有 block 之后（新一行）。
   * 用 MutationObserver 把光标 <span> 注入到最后一个 block 的最后一个文本节点内，
   * 这样光标就紧跟在最后一个字后面，不会换行。
   */
  const cursorMsgId = isStreaming ? messages[messages.length - 1]?.id : null;
  const cursorIsStreaming = isStreaming;

  useEffect(() => {
    const container = cursorContainerRef.current;
    if (!cursorMsgId || !cursorIsStreaming || !container) return;

    const CURSOR_CLASS = "streamdown-cursor";

    function injectCursor() {
      if (!container) return;
      // 清理旧光标
      container.querySelectorAll(`.${CURSOR_CLASS}`).forEach((el) => el.remove());
      hasCursorRef.current = false;

      // 找到最后一个元素节点（Streamdown 渲染的 <p> 等）
      const children = Array.from(container.children);
      const lastEl = children[children.length - 1];
      if (!lastEl) return;

      // 创建光标元素
      const cursor = document.createElement("span");
      cursor.className = CURSOR_CLASS;
      cursor.textContent = "█";

      // 找到最后一个文本节点，在其末尾插入光标
      const walker = document.createTreeWalker(lastEl, NodeFilter.SHOW_TEXT);
      let lastTextNode: Text | null = null;
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        lastTextNode = node;
      }

      if (lastTextNode) {
        lastTextNode.parentNode?.insertBefore(cursor, lastTextNode.nextSibling);
      } else {
        lastEl.appendChild(cursor);
      }
      hasCursorRef.current = true;
    }

    injectCursor();

    // 监听 Streamdown 内容变化，重新注入光标
    const observer = new MutationObserver(() => {
      if (hasCursorRef.current) {
        hasCursorRef.current = false;
      }
      injectCursor();
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      container.querySelectorAll(`.${CURSOR_CLASS}`).forEach((el) => el.remove());
      hasCursorRef.current = false;
    };
  }, [cursorMsgId, cursorIsStreaming]);

  /** 停止生成 */
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  /** 删除消息 */
  const handleDelete = async (msgId: string) => {
    const ok = await confirm({
      title: "删除消息",
      description: "确定要删除这条消息吗？",
      confirmText: "删除",
    });
    if (!ok) return;

    // 如果正在流式输出且要删除的是当前流式消息，先标记再中止
    if (isStreaming && streamingMsgIdRef.current === msgId) {
      isDeletingRef.current = true;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // 等待流式输出完全结束
      await new Promise<void>((resolve) => {
        const check = () => {
          if (!isStreaming) resolve();
          else setTimeout(check, 50);
        };
        check();
      });
    }

    // 立即从 UI 移除
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    toast({ title: "消息已删除" });

    // 临时 ID（ai-xxx）不在数据库中，无需调 API
    if (msgId.startsWith("ai-")) return;

    // 静默尝试从数据库删除
    try {
      await fetch(`/api/projects/${projectId}/messages/${msgId}`, {
        method: "DELETE",
      });
    } catch {
      // 忽略错误，UI 已移除
    }
  };

  /** 开始编辑消息 */
  const startEdit = (msg: Message) => {
    setEditingId(msg.id);
    setEditContent(msg.content);
  };

  /** 取消编辑 */
  const cancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  /** 保存编辑 */
  const saveEdit = async () => {
    if (!editingId || !editContent.trim()) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/messages/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === editingId ? { ...m, content: editContent.trim() } : m
          )
        );
        setEditingId(null);
        setEditContent("");
        toast({ title: "消息已更新" });
      }
    } catch (err) {
      console.error("更新消息失败:", err);
      toast({ title: "更新失败", variant: "destructive" });
    }
  };

  /** 发送消息 */
  const handleSend = async () => {
    const content = input.trim();
    if (!content || isStreaming) return;

    setInput("");

    // 乐观添加用户消息
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content,
      isPinned: false,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // 保存用户消息到数据库
    try {
      await fetch(`/api/projects/${projectId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content }),
      });
    } catch (err) {
      console.error("保存用户消息失败:", err);
    }

    // 创建 AI 回复占位
    const aiMsgId = `ai-${Date.now()}`;
    streamingMsgIdRef.current = aiMsgId;
    const charName = extractMentionCharacterName(content);
    const aiMsg: Message = {
      id: aiMsgId,
      role: "assistant",
      content: "",
      isPinned: false,
      createdAt: new Date().toISOString(),
      characterName: charName,
    };
    setMessages((prev) => [...prev, aiMsg]);
    setIsStreaming(true);

    // 创建 AbortController
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // 流式请求
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          projectId,
          modelConfig,
          characterId: extractMentionCharacterId(content),
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "请求失败");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          fullContent += chunk;
          setMessages((prev) => {
            // 检查消息是否仍存在（可能已被删除）
            if (!prev.some((m) => m.id === aiMsgId)) return prev;
            return prev.map((m) =>
              m.id === aiMsgId ? { ...m, content: fullContent } : m
            );
          });
        }
      }

      // 保存到数据库
      if (fullContent) {
        const metadata: Record<string, unknown> = {};
        if (charName) metadata.characterName = charName;
        await fetch(`/api/projects/${projectId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "assistant", content: fullContent, isDraft: saveAsDraft, metadata }),
        });
      }

      // 记录 Token 用量（基于字符数估算）
      const estimatedInputTokens = Math.ceil(
        [...messages, userMsg].reduce((sum, m) => sum + m.content.length, 0) * 0.4
      );
      const estimatedOutputTokens = Math.ceil(fullContent.length * 0.4);
      const estimatedCachedTokens = Math.ceil(estimatedInputTokens * 0.9);
      const pricing = modelConfig.modelName.toLowerCase().includes("pro")
        ? DEEPSEEK_PRICING["v4-pro"]
        : DEEPSEEK_PRICING["v4-flash"];
      const cost =
        (estimatedInputTokens - estimatedCachedTokens) / 1_000_000 * pricing.inputCacheMiss +
        estimatedCachedTokens / 1_000_000 * pricing.inputCacheHit +
        estimatedOutputTokens / 1_000_000 * pricing.output;
      recordUsage(estimatedInputTokens, estimatedOutputTokens, estimatedCachedTokens, cost, "chat");
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // 如果是删除操作触发的中止，不保存内容（消息已被删除）
        if (isDeletingRef.current) {
          isDeletingRef.current = false;
        } else {
          // 用户手动停止生成，保存已生成的内容
          let savedContent = "";
          setMessages((prev) => {
            const msg = prev.find((m) => m.id === aiMsgId);
            savedContent = msg?.content || "";
            return prev;
          });
          if (savedContent) {
            await fetch(`/api/projects/${projectId}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ role: "assistant", content: savedContent, isDraft: saveAsDraft }),
            });
          }
        }
      } else {
        console.error("AI 回复失败:", err);
        const errorMsg = err instanceof Error ? err.message : "回复失败，请检查模型配置是否正确。";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId ? { ...m, content: `❌ ${errorMsg}` } : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
      streamingMsgIdRef.current = null;
      isDeletingRef.current = false;
    }
  };

  /** 切换消息置顶 */
  const togglePin = async (msg: Message) => {
    try {
      await fetch(`/api/projects/${projectId}/messages/${msg.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: !msg.isPinned }),
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, isPinned: !m.isPinned } : m
        )
      );
    } catch (err) {
      console.error("置顶失败:", err);
    }
  };

  /** 处理输入变化 - 检测 @ 触发提及 */
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    // 检测光标前的最后一个 @
    const cursorPos = e.target.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursorPos);
    const atIdx = textBefore.lastIndexOf("@");

    if (atIdx >= 0) {
      // @ 前面不能是字母/中文（防止误触邮箱等）
      const charBefore = atIdx > 0 ? textBefore[atIdx - 1] : "";
      if (/[\w\u4e00-\u9fff]/.test(charBefore)) {
        setMentionOpen(false);
        return;
      }
      const query = textBefore.slice(atIdx + 1);
      // 如果查询中有空格，关闭菜单
      if (/\s/.test(query)) {
        setMentionOpen(false);
        return;
      }
      setMentionQuery(query);
      setMentionIndex(0);
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  /** 选择 @ 提及的角色 */
  const selectMention = (charName: string) => {
    const cursorPos = textareaRef.current?.selectionStart ?? input.length;
    const textBefore = input.slice(0, cursorPos);
    const atIdx = textBefore.lastIndexOf("@");
    if (atIdx < 0) return;
    const before = input.slice(0, atIdx);
    const after = input.slice(cursorPos);
    const inserted = `${before}@${charName} ${after}`;
    setInput(inserted);
    setMentionOpen(false);
    // 聚焦回输入框
    setTimeout(() => {
      textareaRef.current?.focus();
      const pos = atIdx + charName.length + 2;
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  /** 键盘快捷键 */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, mentionFiltered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        if (mentionFiltered[mentionIndex]) {
          e.preventDefault();
          selectMention(mentionFiltered[mentionIndex].name);
          return;
        }
      }
      if (e.key === "Escape") {
        setMentionOpen(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /** 从输入中提取最后一个 @mention 的角色 ID */
  const extractMentionCharacterId = (text: string): string | undefined => {
    const matches = text.match(/@(\S+)/g);
    if (!matches) return undefined;
    const lastMention = matches[matches.length - 1].slice(1); // 去掉 @
    const char = characters.find(
      (c) => c.name === lastMention
    );
    return char?.id;
  };

  /** 从输入中提取 @mention 的角色名称 */
  const extractMentionCharacterName = (text: string): string | undefined => {
    const matches = text.match(/@(\S+)/g);
    if (!matches) return undefined;
    const lastMention = matches[matches.length - 1].slice(1);
    return characters.find((c) => c.name === lastMention)?.name;
  };

  /** 处理侧边栏选择聊天 */
  const handleSelectChat = async (id: string, type: "char" | "group", label: string) => {
    const chatKey = `${type}:${id}`;
    setActiveChat(chatKey);
    setActiveChatLabel(label);
    setActiveChatType(null); // 先不设置 type，等数据准备好

    if (type === "group") {
      try {
        const res = await fetch(`/api/projects/${projectId}/chat-groups/${id}`);
        const data = await res.json();
        if (data.success) {
          setGroupData(data.data);
          setActiveChatType("group"); // 数据就绪后设置 type
        }
      } catch {
        setGroupData({ id, name: label } as unknown as Record<string, unknown>);
        setActiveChatType("group");
      }
    } else if (type === "char") {
      setActiveChatType("char");
      if (id) {
        setInput(`@${label} `);
        setTimeout(() => textareaRef.current?.focus(), 100);
      } else {
        setInput("");
        setTimeout(() => textareaRef.current?.focus(), 100);
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 主内容区（三栏 WeChat 布局） */}
      <div className="flex flex-1 min-h-0">
        {/* 左侧聊天侧边栏（WeChat 风格） */}
        <ChatSidebar
          projectId={projectId}
          activeChat={activeChat}
          onSelectChat={handleSelectChat}
          onCreateGroup={() => setChatGroupCreateOpen(true)}
        />

        {/* 中间聊天主区域 - 群组模式 */}
        {activeChatType === "group" && groupData ? (
          <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
            {/* 多标签栏 */}
            <TabBar tabs={tabs} activeTabId={activeTabId} setActiveTabId={setActiveTabId} setTabs={setTabs} />
            <GroupChatView
              group={groupData as unknown as { id: string; name: string; members?: { id: string; characterId: string; role: string; character: { id: string; name: string } }[] }}
              projectId={projectId}
              onBack={() => { setActiveChat(null); setActiveChatType(null); setGroupData(null); }}
            />
          </div>
        ) : null}

        {/* 中间聊天主区域 - 角色私聊和空状态 */}
        {(!activeChatType || activeChatType === "char") && (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TabBar tabs={tabs} activeTabId={activeTabId} setActiveTabId={setActiveTabId} setTabs={setTabs} />
        {activeChatType === "char" ? (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Sparkles className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground mb-2">
                开始你的创作之旅
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                在下方输入框中输入文字，AI 将帮你续写故事、扮演角色或描述场景。
              </p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isUser = msg.role === "user";
              const isAssistant = msg.role === "assistant";
              const prevMsg = idx > 0 ? messages[idx - 1] : null;
              const isContinuation = prevMsg && prevMsg.role === msg.role && prevMsg.characterName === msg.characterName;
              // 是否显示头像（连续消息只显示第一个）
              const showAvatar = !isContinuation;
              const charAvatar = msg.characterName ? msg.characterName[0] : (isUser ? "我" : "AI");

              return (
              <div key={msg.id} className="group">
                {isAssistant && showAvatar && (
                  <div className="flex items-center gap-1.5 mb-1 ml-12">
                    <span className="text-sm font-medium text-muted-foreground">
                      {msg.characterName || "AI"}
                    </span>
                    {msg.characterName && (
                      <span className="text-sm text-muted-foreground/40 bg-card px-1 py-0.5 rounded">角色扮演</span>
                    )}
                    {msg.isPinned && (
                      <span className="text-sm text-primary/60">📌 已置顶</span>
                    )}
                  </div>
                )}

                <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
                  {/* AI 头像 */}
                  {isAssistant && (
                    <div className={cn("flex flex-col items-center shrink-0", showAvatar ? "" : "invisible")}>
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                        msg.characterName ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        {charAvatar}
                      </div>
                    </div>
                  )}

                  <div className={cn("max-w-[75%] flex flex-col", isUser ? "items-end" : "items-start")}>
                    {/* 编辑模式 */}
                    {editingId === msg.id ? (
                      <div className="space-y-2 w-full bg-background border border-border p-3">
                        <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={3} className="text-sm" autoFocus />
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7">取消</Button>
                          <Button size="sm" onClick={saveEdit} className="h-7 gap-1"><Check className="h-3 w-3" />保存</Button>
                        </div>
                      </div>
                    ) : (
                    <>
                      {/* 消息气泡 + 尾刺 */}
                      <div className={cn(
                        "relative text-base px-3 py-2 break-words",
                        "whitespace-pre-wrap",
                        // WeChat 风格：用户蓝色/绿色，AI 白色
                        isUser
                          ? "bg-primary text-primary-foreground   shadow-sm"
                          : "bg-card text-foreground border border-border/40   shadow-sm",
                        msg.isPinned && (isUser ? "ring-2 ring-primary/30" : "ring-2 ring-primary/20")
                      )}
                      >
                        {/* AI 内容 */}
                        {isAssistant ? (
                          msg.content ? (
                            <div ref={isStreaming && msg.id === messages[messages.length - 1]?.id ? cursorContainerRef : undefined}>
                              {msg.content.length > 500 && !expandedMsgIds.has(msg.id) && !isStreaming ? (
                                <Streamdown animated isAnimating={false}>{msg.content.slice(0, 500) + "…"}</Streamdown>
                              ) : (
                                <Streamdown animated isAnimating={isStreaming && msg.id === messages[messages.length - 1]?.id}>{msg.content}</Streamdown>
                              )}
                              {msg.content.length > 500 && !isStreaming && (
                                <button className="text-sm text-primary mt-0.5 hover:underline"
                                  onClick={() => setExpandedMsgIds(prev => { const n = new Set(prev); if(n.has(msg.id)) n.delete(msg.id); else n.add(msg.id); return n; })}
                                >
                                  {expandedMsgIds.has(msg.id) ? "收起" : `展开全文（共 ${msg.content.length} 字）…`}
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> 思考中…</span>
                          )
                        ) : (
                          <>
                            <p className={msg.content.length > 500 && !expandedMsgIds.has(msg.id) ? "line-clamp-6" : ""}>{msg.content}</p>
                            {msg.content.length > 500 && (
                              <button className="text-sm text-primary mt-0.5 hover:underline"
                                onClick={() => setExpandedMsgIds(prev => { const n = new Set(prev); if(n.has(msg.id)) n.delete(msg.id); else n.add(msg.id); return n; })}
                              >
                                {expandedMsgIds.has(msg.id) ? "收起" : `展开全文（共 ${msg.content.length} 字）…`}
                              </button>
                            )}
                          </>
                        )}

                        {/* WeChat 风格尾刺 */}
                        <div className={cn(
                          "absolute bottom-[6px] w-2 h-2",
                          isUser
                            ? "right-[-4px] bg-primary"
                            : "left-[-4px] bg-card border-border/50",
                          isUser
                            ? "[clip-path:polygon(0_0,100%_0,0_100%)]"
                            : "[clip-path:polygon(0_0,100%_0,100%_100%)]"
                        )} />
                      </div>

                      {/* 操作按钮（鼠标悬停显示） */}
                      {msg.content && !isStreaming && (
                        <div className={cn(
                          "flex items-center gap-0.5 mt-0.5 transition-opacity",
                          isUser ? "flex-row" : "flex-row-reverse",
                          "opacity-0 group-hover:opacity-100"
                        )}>
                          <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground" onClick={() => startEdit(msg)} title="编辑" aria-label="编辑">
                            <Edit3 className="h-3 w-3" />
                          </button>
                          <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground" onClick={() => togglePin(msg)} title={msg.isPinned ? "取消置顶" : "置顶"} aria-label={msg.isPinned ? "取消置顶" : "置顶"}>
                            {msg.isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                          </button>
                          <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive" onClick={() => {
                            const run = async () => {
                              const ok = await confirm({ title: "删除消息", description: "确定要删除这条消息吗？", confirmText: "删除" });
                              if (!ok) return;
                              try {
                                await fetch(`/api/projects/${projectId}/messages/${msg.id}`, { method: "DELETE" });
                                setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                              } catch { toast({ title: "删除失败", variant: "destructive" }); }
                            }; run();
                          }} title="删除" aria-label="删除">
                            <Trash2 className="h-3 w-3" />
                          </button>
                          {isAssistant && (
                            <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-500" onClick={() => { setReportingMsgId(msg.id); setErrorContext(msg.content.slice(0, 500)); }} title="报告问题" aria-label="报告问题">
                              <Bug className="h-3 w-3" />
                            </button>
                          )}
                          {isUser && (
                            <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-purple-100 dark:hover:bg-purple-900/30 text-purple-500" onClick={() => {
                              try { sessionStorage.setItem("studioPrompt", msg.content); } catch {}
                              window.location.href = `/projects/${projectId}/studio`;
                            }} title="发送到智能协作" aria-label="发送到智能协作">
                              <Sparkles className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </>
                    )}

                    {/* 时间戳 */}
                    <div className={cn("text-sm text-muted-foreground/40 mt-0.5 px-0.5", isUser ? "text-right" : "text-left")}>
                      {new Date(msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>

                  {/* 用户头像（始终在右侧） */}
                  {isUser && (
                    <div className={cn("flex flex-col items-center shrink-0", showAvatar ? "" : "invisible")}>
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground">
                        我
                      </div>
                    </div>
                  )}
                </div>
              </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
        ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Sparkles className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground mb-2">选择一个聊天</h3>
            <p className="text-sm text-muted-foreground max-w-md">从左侧选择一个角色开始对话，或创建群组让角色们自由交流</p>
          </div>
        </div>
        )}

        {activeChatType === "char" && (
        <div className="border-t border-border p-4 md:p-6">
          {/* 草稿模式切换 */}
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setSaveAsDraft(!saveAsDraft)}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-sm font-medium transition-smooth ${
                saveAsDraft
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              title={saveAsDraft ? "草稿模式：AI 回复将进入审核流程" : "直接模式：AI 回复立即生效"}
            >
              {saveAsDraft ? (
                <>
                  <FileText className="h-3.5 w-3.5" />
                  <span>草稿模式</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>直接输出</span>
                </>
              )}
            </button>
            {saveAsDraft && (
              <span className="text-sm text-amber-600 dark:text-amber-400">
                AI 回复将保存为草稿，可在交付台审核归档
              </span>
            )}
          </div>
          <div className="flex gap-3 items-end relative">
            {/* @提及下拉菜单 */}
            {mentionOpen && mentionFiltered.length > 0 && (
              <div
                ref={mentionDropdownRef}
                className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-card border border-border shadow-lg overflow-hidden"
              >
                <div className="px-3 py-1.5 text-sm text-muted-foreground border-b border-border flex items-center gap-2">
                  <span>@ 角色</span>
                  <span className="ml-auto text-sm">↑↓ 选择 · ↵ 确认 · Esc 取消</span>
                </div>
                <div className="max-h-36 overflow-y-auto">
                  {mentionFiltered.map((char, i) => (
                    <button
                      key={char.id}
                      className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-smooth ${
                        i === mentionIndex
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted text-foreground"
                      }`}
                      onClick={() => selectMention(char.name)}
                      onMouseEnter={() => setMentionIndex(i)}
                    >
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                        {char.name[0]}
                      </div>
                      <span>{char.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  handleInputChange(e);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 300) + "px";
                }}
                onKeyDown={handleKeyDown}
                placeholder="输入消息… @角色名 进行角色扮演"
                rows={1}
                className="resize-none pr-10 min-h-[44px] leading-relaxed"
                disabled={isStreaming}
              />
              {isStreaming ? (
                <Button
                  onClick={handleStop}
                  size="icon"
                  variant="destructive"
                  className="absolute right-1.5 top-1.5 h-8 w-8"
                  title="停止生成"
                  aria-label="停止生成"
                >
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  size="icon"
                  className="absolute right-1.5 top-1.5 h-8 w-8"
                  aria-label="发送"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
            {/* 字数统计与写作目标 */}
            <div className="flex items-center gap-3 px-1 pb-1">
              <div className="flex items-center gap-3 text-[11px] font-mono text-muted-foreground/50">
                <span>消息 {messages.length}</span>
                <span>·</span>
                <span>字数 {messages.reduce((s, m) => s + m.content.length, 0)}</span>
                <span>·</span>
                <span>约 {Math.max(1, Math.ceil(messages.reduce((s, m) => s + m.content.length, 0) / 500))} 章</span>
              </div>
              {(() => {
                const total = messages.reduce((s, m) => s + m.content.length, 0);
                if (total < 1000) return null;
                const targets = [10000, 25000, 50000, 100000];
                const nextTarget = targets.find(t => total < t) || targets[targets.length - 1];
                const pct = Math.min(100, Math.round(total / nextTarget * 100));
                return (
                  <div className="flex-1 flex items-center gap-2 max-w-[200px]">
                    <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary/60 rounded-full transition-[width]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground/50">{pct}%</span>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
        )}
        </div>
        )}

      {/* 右侧面板：上下文 / 交付台 / 统计 */}
      {panelOpen && (
        <aside className="hidden lg:block w-80 border-l border-border overflow-y-auto bg-card">
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-1 bg-card p-0.5">
              <button
                onClick={() => setPanelTab("context")}
                className={`flex-1 text-sm font-medium py-1.5 px-3 transition-smooth ${
                  panelTab === "context"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                上下文
              </button>
              <button
                onClick={() => setPanelTab("delivery")}
                className={`flex-1 text-sm font-medium py-1.5 px-3 transition-smooth ${
                  panelTab === "delivery"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                交付台
              </button>
              <button
                onClick={() => setPanelTab("stats")}
                className={`flex-1 text-sm font-medium py-1.5 px-3 transition-smooth ${
                  panelTab === "stats"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                统计
              </button>
              <button
                onClick={() => setPanelTab("outline")}
                className={`flex-1 text-sm font-medium py-1.5 px-3 transition-smooth ${
                  panelTab === "outline"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                大纲
              </button>
            </div>

            {panelTab === "context" ? (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">世界状态</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {worldStates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">暂无世界状态变量</p>
                    ) : (
                      <div className="space-y-2">
                        {worldStates.map((s) => (
                          <div key={s.id} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{s.key}</span>
                            <span className="font-medium">{s.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">置顶信息</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {messages.filter((m) => m.isPinned).length === 0 ? (
                      <p className="text-sm text-muted-foreground">悬停消息点击 📌 可置顶重要信息</p>
                    ) : (
                      <div className="space-y-2">
                        {messages.filter((m) => m.isPinned).map((m) => (
                          <p key={m.id} className="text-sm text-muted-foreground line-clamp-3">{m.content}</p>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">版本历史</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" size="sm" className="w-full gap-2 text-sm" onClick={() => setGitHistoryOpen(true)}>
                      <History className="h-3.5 w-3.5" /> 查看版本记录
                    </Button>
                    <p className="text-sm text-muted-foreground mt-2 text-center">自动记录每次数据变更，支持回滚</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">快捷指令</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p><code>/describe</code> - 让 AI 描写环境</p>
                      <p><code>/roll</code> - 掷骰子</p>
                      <p><code>/npc</code> - NPC 互动</p>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : panelTab === "stats" ? (
              <SessionStatsPanel />
            ) : panelTab === "outline" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">大纲进度</h3>
                  <span className="text-xs text-muted-foreground/60">
                    {outlineItems.filter(i => i.status === "completed").length}/{outlineItems.length} 完成
                  </span>
                </div>
                {outlineItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无大纲</p>
                ) : (
                  <div className="space-y-1">
                    {outlineItems
                      .filter(i => i.level === "chapter" || i.level === "arc")
                      .map(item => {
                        const statusColors: Record<string, string> = {
                          draft: "text-muted-foreground/50",
                          active: "text-blue-500",
                          completed: "text-green-500",
                          abandoned: "text-red-500/50",
                        };
                        const statusLabels: Record<string, string> = {
                          draft: "草稿", active: "进行中", completed: "完成", abandoned: "已废弃",
                        };
                        return (
                          <div key={item.id} className="flex items-center gap-2 text-sm py-1">
                            <div className={`w-1.5 h-1.5 rounded-full ${statusColors[item.status] || "bg-muted"}`} />
                            <span className="flex-1 truncate">{item.title}</span>
                            <span className={`text-[10px] shrink-0 ${statusColors[item.status] || ""}`}>
                              {statusLabels[item.status] || item.status}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            ) : (
              <ProseDeliveryPanel projectId={projectId} onDraftChange={() => loadMessages()} />
            )}
            <div className="flex justify-end">
              <button
                onClick={() => setPanelOpen(false)}
                className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-smooth"
                title="收起面板"
              >
                <PanelRightClose className="h-3.5 w-3.5" />
                收起
              </button>
            </div>
          </div>
        </aside>
      )}
      {!panelOpen && (
        <div className="flex justify-end px-4 py-1 border-b border-border">
          <button
            onClick={() => setPanelOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-smooth"
            title="展开面板"
          >
            <PanelRightOpen className="h-3.5 w-3.5" />
            面板
          </button>
        </div>
      )}
      </div>

      {/* 底部状态栏 */}
      <div className="border-t border-border bg-background/80 backdrop-blur-sm px-4 py-1.5 flex items-center gap-4 text-xs text-muted-foreground/70 shrink-0 overflow-x-auto">
        <StatusItem>
          <Cpu className="h-3 w-3" />
          <span className="font-medium">{modelConfig.modelName.includes("pro") ? "v4-Pro" : "v4-Flash"}</span>
        </StatusItem>
        <StatusSep />
        <StatusItem>
          <Hash className="h-3 w-3" />
          输入 <strong>{formatTokens(sessionStats.totalInputTokens)}</strong>
        </StatusItem>
        <StatusSep />
        <StatusItem>
          输出 <strong>{formatTokens(sessionStats.totalOutputTokens)}</strong>
        </StatusItem>
        <StatusSep />
        <StatusItem className="text-purple-500">
          缓存 <strong>{sessionStats.totalInputTokens > 0 ? ((sessionStats.totalCachedTokens / sessionStats.totalInputTokens) * 100).toFixed(0) : "—"}%</strong>
        </StatusItem>
        <StatusSep />
        <StatusItem className={sessionStats.totalCost < 0.05 ? "text-green-500" : sessionStats.totalCost < 0.2 ? "text-yellow-500" : "text-red-500"}>
          <DollarSign className="h-3 w-3" />
          <strong>{formatUSD(sessionStats.totalCost)}</strong>
        </StatusItem>
        {sessionStats.turnCount > 0 && (
          <>
            <StatusSep />
            <StatusItem>
              <Repeat className="h-3 w-3" />
              {sessionStats.turnCount} 轮
            </StatusItem>
          </>
        )}
        <span className="ml-auto hidden sm:block text-sm text-muted-foreground/40">
          {saveAsDraft ? "草稿模式" : "直接输出"}
        </span>
      </div>

      {/* 版本历史对话框 */}
      <GitHistoryDialog
        open={gitHistoryOpen}
        onOpenChange={setGitHistoryOpen}
        projectId={projectId}
      />

      {/* 新建群组对话框 */}
      <Dialog open={chatGroupCreateOpen} onOpenChange={(open) => {
        setChatGroupCreateOpen(open);
        if (open) {
          setCreateGroupSearch("");
          fetch(`/api/projects/${projectId}/characters`).then(r => r.json()).then(d => {
            if (d.success) setCreateGroupChars(d.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
          }).catch(() => {});
        }
      }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>新建群组</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">群组名称</Label>
              <Input
                placeholder="如：伽马队"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label className="text-sm">选择成员（可选）</Label>
              <input type="text" value={createGroupSearch} onChange={e => setCreateGroupSearch(e.target.value)}
                placeholder="搜索角色…"
                className="w-full h-7 border border-border bg-background px-2 text-[12px] font-mono text-foreground placeholder:text-muted-foreground/60 outline-none focus-visible:ring-1 focus-visible:ring-ring focus:border-[#00cc66] transition-colors"
              />
              <div className="max-h-40 overflow-y-auto space-y-0.5 border border-border p-1">
                {createGroupChars.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">加载中…</p>
                ) : (
                  createGroupChars.filter(c => !createGroupSearch || c.name.toLowerCase().includes(createGroupSearch.toLowerCase())).map((c) => {
                    const selected = createGroupSelected.has(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => setCreateGroupSelected(prev => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                          return next;
                        })}
                        className={`flex items-center gap-2 w-full p-1.5 rounded text-sm transition-smooth ${
                          selected ? "bg-primary/10 text-primary" : "hover:bg-muted"
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          selected ? "bg-primary border-primary" : "border-muted-foreground/30"
                        }`}>
                          {selected && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <span>{c.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setChatGroupCreateOpen(false)}>取消</Button>
              <Button size="sm" onClick={async () => {
                if (!newGroupName.trim()) return;
                try {
                  const res = await fetch(`/api/projects/${projectId}/chat-groups`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: newGroupName.trim(),
                      memberIds: Array.from(createGroupSelected),
                    }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    setNewGroupName("");
                    setCreateGroupSelected(new Set());
                    setChatGroupCreateOpen(false);
                    await handleSelectChat(data.data.id, "group", data.data.name);
                  }
                } catch (e) { console.error(e); }
              }} disabled={!newGroupName.trim()}>创建</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {ConfirmDialog}

      {/* 错误报告对话框 */}
      <Dialog open={reportingMsgId !== null} onOpenChange={(open) => { if (!open) setReportingMsgId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="h-4 w-4 text-amber-500" /> 报告内容问题
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-sm text-muted-foreground">问题类别</Label>
              <select
                value={errorCategory}
                onChange={(e) => setErrorCategory(e.target.value)}
                className="w-full mt-1 h-8 text-sm border border-input bg-background px-2"
              >
                <option value="ooc">OOC — 角色行为不符</option>
                <option value="logic">逻辑 — 前后矛盾/不合理</option>
                <option value="style">风格 — 文风不一致</option>
                <option value="fact">事实 — 与设定冲突</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">严重程度</Label>
              <select
                value={errorSeverity}
                onChange={(e) => setErrorSeverity(e.target.value)}
                className="w-full mt-1 h-8 text-sm border border-input bg-background px-2"
              >
                <option value="minor">轻微</option>
                <option value="major">主要</option>
                <option value="critical">严重</option>
              </select>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">补充说明（可选）</Label>
              <Textarea
                value={errorContext}
                onChange={(e) => setErrorContext(e.target.value)}
                rows={3}
                className="text-sm mt-1"
                placeholder="描述具体是什么问题…"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" variant="outline" className="flex-1 h-8 text-sm" onClick={() => setReportingMsgId(null)}>取消</Button>
              <Button size="sm" className="flex-1 h-8 text-sm gap-1" onClick={async () => {
                if (!reportingMsgId) return;
                try {
                  const res = await fetch(`/api/projects/${projectId}/error-archive`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      category: errorCategory,
                      severity: errorSeverity,
                      content: errorContext || "用户报告了问题",
                      context: `来自消息: ${reportingMsgId}`,
                    }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    toast({ title: "问题已记录", description: "AI 将在后续对话中参考此反馈" });
                    setReportingMsgId(null);
                  } else {
                    toast({ title: "记录失败", variant: "destructive" });
                  }
                } catch {
                  toast({ title: "记录失败", variant: "destructive" });
                }
              }}>
                <AlertTriangle className="h-3 w-3" /> 提交报告
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// 底部状态栏子组件
// ============================================================

function StatusItem({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`flex items-center gap-1 shrink-0 whitespace-nowrap ${className}`}>{children}</span>;
}

// ============================================================
// TabBar 子组件 — 多标签栏
// ============================================================

function TabBar({ tabs, activeTabId, setActiveTabId, setTabs }: {
  tabs: { id: string; label: string }[];
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  setTabs: (tabs: { id: string; label: string }[] | ((prev: { id: string; label: string }[]) => { id: string; label: string }[])) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 px-2 pt-1.5 pb-0 border-b border-border overflow-x-auto shrink-0">
      {tabs.map(tab => (
        <div key={tab.id}
          onClick={() => setActiveTabId(tab.id)}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-mono cursor-pointer border-b-2 transition-smooth shrink-0 ${
            activeTabId === tab.id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground/60 hover:text-foreground"
          }`}
        >
          <span>{tab.label}</span>
          {tabs.length > 1 && (
            <button onClick={(e) => { e.stopPropagation(); setTabs((prev: { id: string; label: string }[]) => prev.filter(t => t.id !== tab.id)); if (activeTabId === tab.id) setActiveTabId(tabs[0].id); }}
              className="h-3.5 w-3.5 flex items-center justify-center rounded-full text-muted-foreground/40 hover:text-foreground hover:bg-muted text-[8px]"
            >✕</button>
          )}
        </div>
      ))}
      {tabs.length < 5 && (
        <button onClick={() => { const id = `tab-${Date.now()}`; setTabs((prev: { id: string; label: string }[]) => [...prev, { id, label: `标签 ${prev.length}` }]); setActiveTabId(id); }}
          className="px-2 py-1 text-xs text-muted-foreground/50 hover:text-foreground shrink-0"
        >+</button>
      )}
    </div>
  );
}

function StatusSep() {
  return <span className="w-px h-3 bg-border shrink-0" />;
}
