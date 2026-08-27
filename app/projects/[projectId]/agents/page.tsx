// app/projects/[projectId]/agents/page.tsx
// 智能体管理 — 卡片式智能体配置中心

"use client";

import React, { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Sparkles, Bot, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { useScrollPreservation } from "@/hooks/use-scroll-preservation";
import { useAgents, toAgentRef } from "@/hooks/use-agents";
import { useAgentGroups } from "@/hooks/use-agent-groups";
import { AgentCard, AgentCardItem } from "@/components/agents/agent-card";
import { AgentEditDialog } from "@/components/agents/agent-edit-dialog";
import { BuiltinPanel } from "@/components/agents/builtin-panel";
import { CollaborationGroups } from "@/components/agents/collaboration-groups";
import { SharedSubNav } from "@/components/shared-sub-nav";

// ─── 内置智能体引用（供协作分组使用） ────────────────────

const BUILTIN_AGENT_REFS = [
  { id: "planner", name: "规划师", emoji: "📋" },
  { id: "writer", name: "主笔", emoji: "📝" },
  { id: "loreKeeper", name: "设定监理", emoji: "🔍" },
  { id: "characterAgent", name: "角色监理", emoji: "🎭" },
  { id: "editor", name: "润色师", emoji: "✏️" },
];

// ─── 页面 ──────────────────────────────────────────────────

export default function AgentsConfigPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const { confirm, ConfirmDialog } = useConfirm();

  // ── 数据 ──

  const { agents, loading, reload: reloadAgents } = useAgents(projectId);
  const customRefs = agents.map(toAgentRef);
  const { groups, reload: reloadGroups } = useAgentGroups(projectId, BUILTIN_AGENT_REFS, customRefs);

  // ── 搜索 ──

  const [search, setSearch] = useState("");

  // ── 编辑对话框 ──

  const [dialogOpen, setDialogOpen] = useState(false);
  useScrollPreservation(dialogOpen);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInitialData, setEditInitialData] = useState<{
    name: string; emoji: string; type: "planner" | "writer" | "reviewer" | "editor" | "custom"; systemPrompt: string;
    temperature: number; order: number; isActive: boolean; skills: string[]; mcpTools: string[]; loreIds: string[];
  } | null>(null);

  const openCreate = useCallback(
    (template?: {
      name: string; emoji: string; type?: string; systemPrompt: string;
    }) => {
      setEditingId(null);
      setEditInitialData(
        template
          ? { ...template, type: (template.type || "custom") as "planner" | "writer" | "reviewer" | "editor" | "custom", temperature: 0.7, order: 0, isActive: true, skills: [], mcpTools: [], loreIds: [] }
          : { name: "", emoji: "🤖", type: "custom" as const, systemPrompt: "", temperature: 0.7, order: 0, isActive: true, skills: [], mcpTools: [], loreIds: [] },
      );
      setDialogOpen(true);
    },
    [],
  );

  const openEdit = useCallback((agent: AgentCardItem) => {
    setEditingId(agent.id);
    setEditInitialData({
      name: agent.name,
      emoji: agent.emoji,
      type: ((agent as any).type || "custom") as "planner" | "writer" | "reviewer" | "editor" | "custom",
      systemPrompt: agent.systemPrompt,
      temperature: agent.temperature,
      order: (agent as any).order ?? 0,
      isActive: (agent as any).isActive ?? true,
      skills: agent.skills,
      mcpTools: agent.mcpTools,
      loreIds: agent.loreIds,
    });
    setDialogOpen(true);
  }, []);

  // ── 启用/停用 ──

  const toggleActive = useCallback(
    async (agent: AgentCardItem) => {
      try {
        await fetch(`/api/projects/${projectId}/custom-agents/${agent.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !agent.isActive }),
        });
        reloadAgents();
      } catch {
        toast({ title: "操作失败", variant: "destructive" });
      }
    },
    [projectId, reloadAgents],
  );

  // ── 删除 ──

  const handleDelete = useCallback(
    async (id: string) => {
      if (!(await confirm({ title: "删除智能体", description: "确定要删除这个智能体吗？" })))
        return;
      try {
        await fetch(`/api/projects/${projectId}/custom-agents/${id}`, {
          method: "DELETE",
        });
        reloadAgents();
      } catch {
        toast({ title: "删除失败", variant: "destructive" });
      }
    },
    [projectId, reloadAgents, confirm],
  );

  // ── 使用（跳转工作室） ──

  const handleUse = useCallback(
    (_agent: AgentCardItem) => {
      router.push(`/projects/${projectId}/studio`);
    },
    [projectId, router],
  );

  // ── 搜索过滤 ──

  const filtered = search.trim()
    ? agents.filter(
        (a) =>
          a.name.toLowerCase().includes(search.toLowerCase()) ||
          a.systemPrompt.toLowerCase().includes(search.toLowerCase()),
      )
    : agents;

  const activeCount = agents.filter((a) => a.isActive).length;

  // ── 渲染 ──

  return (
    <>
      <SharedSubNav
        tabs={[
          { label: "智能体", href: `/projects/${projectId}/agents` },
          { label: "MCP", href: `/projects/${projectId}/mcp-servers` },
          { label: "技能", href: `/projects/${projectId}/skills` },
        ]}
      />
      <div className="flex-1 h-full flex flex-col">
        {/* ── 顶部栏 ── */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-lg font-bold tracking-tight">智能体</h2>
              <p className="text-xs text-muted-foreground">
                共 {agents.length} 个智能体，{activeCount} 个在线
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs gap-1.5"
              onClick={() => router.push(`/projects/${projectId}/studio`)}
            >
              <Sparkles className="h-3.5 w-3.5" /> 工作室
            </Button>
            <Button
              size="sm"
              className="h-9 text-xs gap-1.5"
              onClick={() => openCreate()}
            >
              <Plus className="h-3.5 w-3.5" /> 新建智能体
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── 自定义智能体区域 ── */}
          <div className="px-6 pt-5 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  自定义智能体
                </span>
                {agents.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {agents.length}
                  </Badge>
                )}
              </div>
            </div>

            {/* 搜索栏 */}
            {agents.length > 0 && (
              <div className="relative mb-4 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索智能体…"
                  className="pl-8 h-8 text-sm"
                  aria-label="搜索智能体"
                />
              </div>
            )}
          </div>

          {/* ── 智能体网格 / 加载 / 空状态 ── */}
          <div className="px-6">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 && !search ? (
              <EmptyState
                icon={Bot}
                title="还没有自定义智能体"
                description="从下方模板创建或点击右上角新建"
                action={
                  <Button
                    onClick={() => openCreate()}
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                  >
                    <Plus className="h-4 w-4" /> 新建
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((a) => (
                  <AgentCard
                    key={a.id}
                    agent={a}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onToggleActive={toggleActive}
                    onUse={handleUse}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── 协作分组 ── */}
          <CollaborationGroups
            groups={groups}
            allBuiltinAgents={BUILTIN_AGENT_REFS}
            allCustomAgents={customRefs}
            onGroupsChanged={reloadGroups}
          />

          {/* ── 内置智能体 & 模板 ── */}
          <div className="px-6 pt-6 pb-4">
            <BuiltinPanel
              onAddBuiltin={(name) => {
                router.push(`/projects/${projectId}/studio`);
              }}
              onUseTemplate={(t) => openCreate(t)}
            />
          </div>
        </div>
      </div>

      {/* ── 编辑对话框 ── */}
      <AgentEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialData={editInitialData}
        editingId={editingId}
        projectId={projectId}
        onSaved={reloadAgents}
      />

      {ConfirmDialog}
    </>
  );
}
