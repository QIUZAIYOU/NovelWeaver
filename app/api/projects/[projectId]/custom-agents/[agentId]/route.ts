// app/api/projects/[projectId]/custom-agents/[agentId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";
import { sanitizeString } from "@/lib/api/validation";

async function getOrError(id: string, projectId: string) {
  const agent = await prisma.customAgent.findUnique({ where: { id } });
  if (!agent || agent.projectId !== projectId) return { error: notFound("智能体不存在") };
  return { agent };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; agentId: string }> }
) {
  try {
    const { projectId, agentId } = await params;
    const { error } = await getOrError(agentId, projectId);
    if (error) return error;

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch (err) { return handleJsonError(err); }

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const n = sanitizeString(body.name, 200, 1);
      if (!n) return badRequest("名称不能为空");
      data.name = n;
    }
    if (body.type !== undefined) data.type = body.type;
    if (body.emoji !== undefined) data.emoji = body.emoji;
    if (body.systemPrompt !== undefined) data.systemPrompt = sanitizeString(body.systemPrompt ?? "", 50000) ?? "";
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.temperature !== undefined && typeof body.temperature === "number") data.temperature = body.temperature;
    if (body.order !== undefined && typeof body.order === "number") data.order = body.order;
    if (body.skills !== undefined) {
      if (Array.isArray(body.skills)) data.skills = JSON.stringify(body.skills);
    }
    if (body.mcpTools !== undefined) {
      if (Array.isArray(body.mcpTools)) data.mcpTools = JSON.stringify(body.mcpTools);
    }
    if (body.loreIds !== undefined) {
      if (Array.isArray(body.loreIds)) data.loreIds = JSON.stringify(body.loreIds);
    }

    if (Object.keys(data).length === 0) return badRequest("没有要更新的字段");

    const updated = await prisma.customAgent.update({ where: { id: agentId }, data });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return serverError("更新智能体失败", error, "CustomAgentItemAPI");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; agentId: string }> }
) {
  try {
    const { projectId, agentId } = await params;
    const { error } = await getOrError(agentId, projectId);
    if (error) return error;
    await prisma.customAgent.delete({ where: { id: agentId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("删除智能体失败", error, "CustomAgentDeleteAPI");
  }
}
