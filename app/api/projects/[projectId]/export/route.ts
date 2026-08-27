// app/api/projects/[projectId]/export/route.ts
// 项目导出 API - 导出项目完整数据为 JSON

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { notFound, serverError } from "@/lib/api/errors";

/** GET /api/projects/[projectId]/export - 导出项目数据 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    // 查询项目基本信息
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return notFound("项目不存在");
    }

    // 并行查询所有关联数据
    const [
      characters, loreEntries, memories, messages, worldStates,
      outlines, missions, chatGroups, customAgents, mcpServers, skills, styleProfile, errorArchives,
    ] =
      await Promise.all([
        prisma.character.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
        prisma.loreEntry.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
        prisma.memory.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
        prisma.message.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
        prisma.worldState.findMany({ where: { projectId }, orderBy: { key: "asc" } }),
        prisma.outline.findMany({ where: { projectId }, orderBy: [{ level: "asc" }, { order: "asc" }] }),
        prisma.mission.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
        prisma.chatGroup.findMany({ where: { projectId }, include: { members: { include: { character: { select: { name: true } } } } }, orderBy: { createdAt: "asc" } }),
        prisma.customAgent.findMany({ where: { projectId }, orderBy: { order: "asc" } }),
        prisma.mcpServer.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
        prisma.skill.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
        prisma.styleProfile.findUnique({ where: { projectId } }),
        prisma.errorArchive.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
      ]);

    // 组装导出数据（不包含内部 ID、不泄露敏感信息）
    const exportData = {
      version: "2.0",
      exportedAt: new Date().toISOString(),
      project: {
        name: project.name,
        type: project.type,
        description: project.description,
        systemPrompt: project.systemPrompt,
      },
      characters: characters.map((c) => ({
        name: c.name,
        age: c.age,
        appearance: c.appearance,
        personality: c.personality,
        backstory: c.backstory,
        hiddenLore: c.hiddenLore,
        persona: c.persona,
        tags: c.tags,
      })),
      loreEntries: loreEntries.map((l) => ({
        title: l.title,
        content: l.content,
        keywords: l.keywords,
        category: l.category,
      })),
      memories: memories.map((m) => ({
        content: m.content,
        tags: m.tags,
        importance: m.importance,
      })),
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        isPinned: m.isPinned,
        createdAt: m.createdAt.toISOString(),
      })),
      worldStates: worldStates.map((w) => ({
        key: w.key,
        value: w.value,
        description: w.description,
      })),
      outlines: outlines.map((o) => ({
        level: o.level,
        title: o.title,
        content: o.content,
        order: o.order,
        parentId: o.parentId,
        status: o.status,
        tags: o.tags,
      })),
      missions: missions.map((m) => ({
        title: m.title,
        code: m.code,
        type: m.type,
        content: m.content,
        status: m.status,
        classification: m.classification,
        writerId: m.writerId,
        reviewerId: m.reviewerId,
        parentId: m.parentId,
        tags: m.tags,
      })),
      chatGroups: chatGroups.map((g) => ({
        name: g.name,
        description: g.description,
        topic: g.topic,
        members: g.members.map((m) => ({
          characterName: m.character.name,
          role: m.role,
        })),
      })),
      customAgents: customAgents.map((a) => ({
        name: a.name,
        type: a.type,
        emoji: a.emoji,
        systemPrompt: a.systemPrompt,
        temperature: a.temperature,
        skills: a.skills,
        mcpTools: a.mcpTools,
        loreIds: a.loreIds,
        order: a.order,
      })),
      mcpServers: mcpServers.map((s) => ({
        name: s.name,
        transport: s.transport,
        command: s.command,
        args: s.args,
        url: s.url,
        tools: s.tools,
      })),
      skills: skills.map((s) => ({
        name: s.name,
        description: s.description,
        category: s.category,
        prompt: s.prompt,
      })),
      styleProfile: styleProfile ? {
        fingerprint: styleProfile.fingerprint,
        constraints: styleProfile.constraints,
        styleGuide: styleProfile.styleGuide,
        sampleText: styleProfile.sampleText,
      } : null,
      errorArchives: errorArchives.map((e) => ({
        category: e.category,
        content: e.content,
        context: e.context,
        severity: e.severity,
      })),
    };

    // 返回 JSON 文件下载
    const safeName = project.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 100);
    const fileName = `${safeName}_${new Date().toISOString().slice(0, 10)}.json`;

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    return serverError("导出项目失败", error, "ExportAPI");
  }
}
