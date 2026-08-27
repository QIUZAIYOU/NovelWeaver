// components/agents/collaboration-groups.tsx
// 协作分组管理 — 列表 + 创建/编辑对话框

"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  Plus, Users, Edit3, Trash2, MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { cn } from "@/lib/utils";

// ─── 类型 ───────────────────────────────────────────────────

interface GroupMember {
  id: string;
  name: string;
  emoji: string;
}

interface GroupItem {
  id: string;
  name: string;
  description: string;
  memberIds: string;
  members: GroupMember[];
}

interface AgentRef {
  id: string;
  name: string;
  emoji: string;
}

interface CollaborationGroupsProps {
  groups: GroupItem[];
  allBuiltinAgents: AgentRef[];
  allCustomAgents: AgentRef[];
  onGroupsChanged: () => void;
}

// ─── 组件 ───────────────────────────────────────────────────

export function CollaborationGroups({
  groups,
  allBuiltinAgents,
  allCustomAgents,
  onGroupsChanged,
}: CollaborationGroupsProps) {
  const params = useParams();
  const projectId = params.projectId as string;
  const { confirm, ConfirmDialog } = useConfirm();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [groupForm, setGroupForm] = useState<{
    id?: string;
    name: string;
    description: string;
    memberIds: string[];
  }>({ name: "", description: "", memberIds: [] });
  const [memberSearch, setMemberSearch] = useState("");

  // ── 打开创建 ──

  const openCreate = () => {
    setGroupForm({ name: "", description: "", memberIds: [] });
    setDialogOpen(true);
  };

  // ── 打开编辑 ──

  const openEdit = (g: GroupItem) => {
    setGroupForm({
      id: g.id,
      name: g.name,
      description: g.description || "",
      memberIds: parseMemberIds(g.memberIds),
    });
    setDialogOpen(true);
  };

  // ── 保存 ──

  const handleSave = async () => {
    if (!groupForm.name.trim()) {
      toast({ title: "请输入分组名称", variant: "destructive" });
      return;
    }
    try {
      const url = groupForm.id
        ? `/api/projects/${projectId}/agent-groups/${groupForm.id}`
        : `/api/projects/${projectId}/agent-groups`;
      const method = groupForm.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(groupForm),
      });
      const d = await res.json();
      if (d.success) {
        toast({ title: groupForm.id ? "分组已更新" : "分组已创建" });
        onGroupsChanged();
        setDialogOpen(false);
      } else {
        toast({ title: "操作失败", description: d.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "操作失败", variant: "destructive" });
    }
  };

  // ── 删除 ──

  const handleDelete = async (g: GroupItem) => {
    const ok = await confirm({
      title: "删除分组",
      description: `确定删除「${g.name}」吗？`,
      confirmText: "删除",
    });
    if (!ok) return;
    try {
      await fetch(`/api/projects/${projectId}/agent-groups/${g.id}`, {
        method: "DELETE",
      });
      onGroupsChanged();
      toast({ title: "分组已删除" });
    } catch {
      toast({ title: "删除失败", variant: "destructive" });
    }
  };

  // ── 渲染成员选择列表 ──

  const renderMemberSelector = () => {
    const allOptions = [...allBuiltinAgents, ...allCustomAgents];
    const filteredOptions = memberSearch
      ? allOptions.filter(a => a.name.toLowerCase().includes(memberSearch.toLowerCase()) || a.id.toLowerCase().includes(memberSearch.toLowerCase()))
      : allOptions;
    return (
      <div>
        <input
          type="text"
          value={memberSearch}
          onChange={e => setMemberSearch(e.target.value)}
          placeholder="搜索智能体…"
          aria-label="搜索智能体成员"
          className="w-full h-7 mb-1.5 border border-border bg-background px-2 text-[12px] font-mono text-foreground placeholder:text-muted-foreground/60 outline-none focus-visible:ring-1 focus-visible:ring-ring focus:border-[#00cc66] transition-colors"
        />
        <div className="max-h-40 overflow-y-auto space-y-0.5 border border-border p-1.5">
        {filteredOptions.length === 0 ? (
          <p className="text-[13px] font-mono text-muted-foreground/60 text-center py-2">{memberSearch ? "无匹配结果" : "暂无可用智能体"}</p>
        ) : (
          filteredOptions.map((a) => {
            const sel = groupForm.memberIds.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                role="checkbox"
                aria-checked={sel}
                onClick={() =>
                  setGroupForm((f) => ({
                    ...f,
                    memberIds: sel
                      ? f.memberIds.filter((id) => id !== a.id)
                      : [...f.memberIds, a.id],
                  }))
                }
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm transition-smooth",
                  sel ? "bg-[#00cc66]/10 text-[#00cc66]" : "hover:bg-accent",
                )}
              >
                <div
                  className={cn(
                    "w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center transition-smooth",
                    sel ? "bg-[#00cc66] border-[#00cc66]" : "border-[#555]/30",
                  )}
                >
                  {sel && <span className="text-[7px] text-[#0a0a0a]">&#10003;</span>}
                </div>
                <span className="text-base">{a.emoji}</span>
                <span>{a.name}</span>
              </button>
            );
          })
        )}
      </div>
      </div>
    );
  };

  // ── 无分组空状态 ──

  const showEmptyState = groups.length === 0;

  // ── 渲染 ───────────────────────────────────────────────────

  return (
    <>
      <Separator className="my-4" />
      <div className="px-6 pb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Users className="h-4 w-4" /> 协作分组
            </h3>
            <p className="text-xs text-muted-foreground/60">
              将智能体组织为协作组，调度统领据此了解各组能力和职责
            </p>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={openCreate}
          >
            <Plus className="h-3.5 w-3.5" /> 新建分组
          </Button>
        </div>

        {showEmptyState ? (
          <div className="border border-dashed border-border bg-card p-8 text-center">
            <Users className="h-8 w-8 text-muted-foreground/60/20 mx-auto mb-2" />
            <p className="text-[13px] font-mono text-muted-foreground/60">暂无协作分组</p>
            <p className="text-xs text-muted-foreground/60/50 mt-1">
              创建分组后，调度统领可以了解各组的能力和职责
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div
              key={g.id}
              className="border border-border bg-card p-4 group hover:border-border transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold truncate flex items-center gap-1.5">
                  {g.name}
                  {g.members.length > 0 && (
                    <span className="text-[11px] font-mono text-muted-foreground/60 font-normal">
                      ({g.members.length})
                    </span>
                  )}
                </h4>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(g)}>
                      <Edit3 className="h-3.5 w-3.5 mr-2" /> 编辑分组
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => handleDelete(g)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> 删除分组
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {g.description && (
                <p className="text-xs text-muted-foreground/60/70 mb-2.5 line-clamp-2">
                  {g.description}
                </p>
              )}
              {/* 成员头像堆叠 */}
              <div className="flex items-center gap-1">
                {g.members.length > 0 ? (
                  <div className="flex -space-x-1.5">
                    {g.members.slice(0, 5).map((m) => (
                      <span
                        key={m.id}
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-card border-2 border-[#0a0a0a] text-xs"
                        title={m.name}
                      >
                        {m.emoji}
                      </span>
                    ))}
                    {g.members.length > 5 && (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-card border-2 border-[#0a0a0a] text-[10px] text-muted-foreground font-medium">
                        +{g.members.length - 5}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground/60/40">暂无成员</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      {/* 分组编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{groupForm.id ? "编辑分组" : "新建分组"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">分组名称</Label>
              <input
                className="w-full h-9 text-sm border border-border bg-background px-2.5"
                value={groupForm.name}
                onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="如：创作组、审核组"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">分组介绍</Label>
              <textarea
                className="w-full text-sm border border-border bg-background p-2 resize-none"
                rows={2}
                value={groupForm.description}
                onChange={(e) => setGroupForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="描述该组的协作目标和职责…"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">组成员</Label>
              {renderMemberSelector()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!groupForm.name.trim()}
            >
              {groupForm.id ? "更新" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </>
  );
}

// ─── 工具 ───────────────────────────────────────────────────

function parseMemberIds(s: string): string[] {
  try {
    const p = JSON.parse(s);
    return Array.isArray(p) ? p.filter((x: unknown) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
