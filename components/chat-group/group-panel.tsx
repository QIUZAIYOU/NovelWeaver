// components/chat-group/group-panel.tsx
// 群组管理面板 — 创建/选择群组

"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  MessageSquare, Plus, Users, Settings, Trash2, X, Loader2, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";

interface GroupMember {
  id: string;
  characterId: string;
  role: string;
  character: { id: string; name: string };
}

interface ChatGroupInfo {
  id: string;
  name: string;
  description: string;
  _count?: { members: number };
  members?: GroupMember[];
}

interface CharacterBrief {
  id: string;
  name: string;
}

export function GroupPanel({
  projectId,
  onSelectGroup,
  dialogOpen: externalOpen,
  onDialogOpenChange,
}: {
  projectId: string;
  onSelectGroup: (group: ChatGroupInfo) => void;
  dialogOpen?: boolean;
  onDialogOpenChange?: (open: boolean) => void;
}) {
  const [groups, setGroups] = useState<ChatGroupInfo[]>([]);
  const [allCharacters, setAllCharacters] = useState<CharacterBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [localDialogOpen, setLocalDialogOpen] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: "", description: "", topic: "" });
  const [selectedCharIds, setSelectedCharIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  // 支持外部控制对话框
  const isOpen = externalOpen !== undefined ? externalOpen : localDialogOpen;
  const setIsOpen = onDialogOpenChange || setLocalDialogOpen;

  const loadGroups = useCallback(async () => {
    try {
      const [gRes, cRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/chat-groups`),
        fetch(`/api/projects/${projectId}/characters`),
      ]);
      const gData = await gRes.json();
      const cData = await cRes.json();
      if (gData.success) setGroups(gData.data);
      if (cData.success) {
        setAllCharacters(cData.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      }
    } catch (err) {
      console.error("加载群组失败:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const openCreate = () => {
    setNewGroup({ name: "", description: "", topic: "" });
    setSelectedCharIds(new Set());
    setIsOpen(true);
  };

  const toggleChar = (id: string) => {
    setSelectedCharIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!newGroup.name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/chat-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newGroup,
          memberIds: Array.from(selectedCharIds),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "群组已创建", variant: "success" });
        setIsOpen(false);
        loadGroups();
      } else {
        toast({ title: "创建失败", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "创建失败", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* 标题 */}
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          群组对话
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={openCreate} title="新建群组">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* 群组列表 */}
      <div className="space-y-1 max-h-[300px] overflow-y-auto">
        {groups.length === 0 ? (
          <div className="text-center py-4">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-1" />
            <p className="text-sm text-muted-foreground">暂无群组</p>
            <button onClick={openCreate} className="text-sm text-primary mt-1 hover:underline">
              创建群组
            </button>
          </div>
        ) : (
          groups.map((g) => (
            <button
              key={g.id}
              onClick={() => onSelectGroup(g)}
              className="flex items-center gap-2.5 w-full p-2 hover:bg-muted transition-smooth text-left"
            >
              <div className="w-8 h-8 bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                {g.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{g.name}</p>
                <p className="text-sm text-muted-foreground">
                  {g._count?.members || 0} 名成员
                </p>
              </div>
            </button>
          ))
        )}
      </div>

      {/* 创建群组对话框 */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              新建群组
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label className="text-sm">群组名称 *</Label>
              <Input
                placeholder="如：伽马队"
                value={newGroup.name}
                onChange={(e) => setNewGroup((f) => ({ ...f, name: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">描述</Label>
              <Input
                placeholder="群组的职责或背景"
                value={newGroup.description}
                onChange={(e) => setNewGroup((f) => ({ ...f, description: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">讨论主题（可选）</Label>
              <Textarea
                placeholder="群组当前的讨论焦点，如：调查新发现的阈界连接点"
                rows={2}
                value={newGroup.topic}
                onChange={(e) => setNewGroup((f) => ({ ...f, topic: e.target.value }))}
                className="text-sm"
              />
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label className="text-sm">选择成员（可选，可后续添加）</Label>
              <div className="max-h-40 overflow-y-auto space-y-0.5 border border-border p-1">
                {allCharacters.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">还没有角色，先去创建角色</p>
                ) : (
                  allCharacters.map((c) => {
                    const isSelected = selectedCharIds.has(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleChar(c.id)}
                        className={`flex items-center gap-2 w-full p-1.5 rounded text-sm transition-smooth ${
                          isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted"
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                        }`}>
                          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <span>{c.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsOpen(false)}>取消</Button>
            <Button size="sm" onClick={handleCreate} disabled={!newGroup.name.trim() || creating}>
              {creating ? "创建中..." : "创建群组"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
