// components/chat-sidebar.tsx
// WeChat 风格聊天侧边栏 — 联系人列表 + 群组列表

"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Search, MessageSquare, Users, Plus, ChevronDown,
  ChevronRight, Loader2, MessageCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useContextMenu } from "@/hooks/use-context-menu";

interface CharacterBrief {
  id: string;
  name: string;
  lastMessage?: string;
  lastTime?: string;
}

interface GroupBrief {
  id: string;
  name: string;
  _count?: { members: number };
  lastMessage?: string;
  lastTime?: string;
}

interface ChatSidebarProps {
  projectId: string;
  /** 当前选中的聊天标识: "char:角色ID" 或 "group:群组ID" */
  activeChat: string | null;
  onSelectChat: (id: string, type: "char" | "group", label: string) => void;
  onCreateGroup: () => void;
}

export function ChatSidebar({
  projectId,
  activeChat,
  onSelectChat,
  onCreateGroup,
}: ChatSidebarProps) {
  const [characters, setCharacters] = useState<CharacterBrief[]>([]);
  const [groups, setGroups] = useState<GroupBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showGroups, setShowGroups] = useState(true);
  const [showChars, setShowChars] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [cRes, gRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/characters`),
        fetch(`/api/projects/${projectId}/chat-groups`),
      ]);
      const cData = await cRes.json();
      const gData = await gRes.json();
      if (cData.success) setCharacters(cData.data);
      if (gData.success) setGroups(gData.data);
    } catch (err) {
      console.error("加载聊天列表失败:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  const charCtxMenu = useContextMenu();
  const groupCtxMenu = useContextMenu();

  // 搜索过滤
  const q = searchQuery.toLowerCase();
  const filteredChars = characters.filter((c) => c.name.toLowerCase().includes(q));
  const filteredGroups = groups.filter((g) => g.name.toLowerCase().includes(q));

  return (
    <div className="w-60 lg:w-72 border-r border-border bg-background flex flex-col h-full">
      {/* 标题区 */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          消息
        </h2>
      </div>

      {/* 搜索框 */}
      <div className="px-3 py-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索角色或群组..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      {/* 列表区 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* 群组列表 */}
            <div className="px-2">
              <div className="flex items-center gap-1 w-full px-2 py-1.5">
                <button
                  onClick={() => setShowGroups(!showGroups)}
                  className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-smooth"
                >
                  {showGroups ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  群组
                  {groups.length > 0 && (
                    <span className="text-sm text-muted-foreground/60 ml-1">({groups.length})</span>
                  )}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onCreateGroup(); }}
                  className="ml-auto hover:text-foreground text-muted-foreground"
                  title="新建群组"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              {showGroups && (
                <div className="space-y-0.5">
                  {filteredGroups.length === 0 && searchQuery && (
                    <p className="text-sm text-muted-foreground text-center py-2">无匹配群组</p>
                  )}
                  {filteredGroups.map((g) => {
                    const isActive = activeChat === `group:${g.id}`;
                    return (
                      <button
                        key={g.id}
                        onClick={() => onSelectChat(g.id, "group", g.name)}
                        onContextMenu={(e) => groupCtxMenu.show(e, [
                          { label: "打开群组", icon: MessageCircle, onClick: () => onSelectChat(g.id, "group", g.name) },
                        ])}
                        className={cn(
                          "flex items-center gap-2.5 w-full p-2 text-left transition-smooth",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted text-foreground"
                        )}
                      >
                        <div className="w-9 h-9 bg-primary/15 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                          <Users className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium truncate">{g.name}</p>
                            <span className="text-sm text-muted-foreground shrink-0 ml-1">
                              {g._count?.members || 0}人
                            </span>
                          </div>
                          {g.lastMessage && (
                            <p className="text-sm text-muted-foreground truncate mt-0.5">{g.lastMessage}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                  {filteredGroups.length === 0 && !searchQuery && (
                    <button
                      onClick={onCreateGroup}
                      className="flex items-center gap-2.5 w-full p-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-smooth"
                    >
                      <div className="w-9 h-9 border-2 border-dashed border-muted-foreground/30 flex items-center justify-center shrink-0">
                        <Plus className="h-4 w-4" />
                      </div>
                      <span>创建群组</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 分割线 */}
            <div className="mx-3 my-1.5 border-t border-border" />

            {/* 角色列表（联系人） */}
            <div className="px-2">
              <button
                onClick={() => setShowChars(!showChars)}
                className="flex items-center gap-1 w-full px-2 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-smooth"
              >
                {showChars ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                联系人
                <span className="text-sm text-muted-foreground/60 ml-1">({characters.length})</span>
              </button>
              {showChars && (
                <div className="space-y-0.5">
                  {/* 普通对话入口 */}
                  <button
                    onClick={() => onSelectChat("", "char", "普通对话")}
                    className={cn(
                      "flex items-center gap-2.5 w-full p-2 text-left transition-smooth",
                      activeChat === "char:"
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted text-foreground"
                    )}
                  >
                    <div className="w-9 h-9 rounded-full bg-card flex items-center justify-center text-muted-foreground text-sm shrink-0">
                      💬
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">普通对话</p>
                      <p className="text-sm text-muted-foreground/60">自由创作 · @角色名 /命令</p>
                    </div>
                  </button>
                  <div className="mx-2 my-1 border-t border-border" />
                  {filteredChars.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      {searchQuery ? "无匹配联系人" : "暂无角色，先去创建"}
                    </p>
                  )}
                  {filteredChars.map((c) => {
                    const isActive = activeChat === `char:${c.id}`;
                    const initial = c.name[0] || "?";
                    return (
                      <button
                        key={c.id}
                        onClick={() => onSelectChat(c.id, "char", c.name)}
                        onContextMenu={(e) => charCtxMenu.show(e, [
                          { label: "对话", icon: MessageCircle, onClick: () => onSelectChat(c.id, "char", c.name) },
                        ])}
                        className={cn(
                          "flex items-center gap-2.5 w-full p-2 text-left transition-smooth",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted text-foreground"
                        )}
                      >
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                          {initial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {charCtxMenu.ContextMenu}
      {groupCtxMenu.ContextMenu}
    </div>
  );
}
