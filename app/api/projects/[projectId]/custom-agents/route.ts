// app/api/projects/[projectId]/custom-agents/route.ts
// 自定义智能体 CRUD

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";
import { sanitizeString } from "@/lib/api/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const agents = await prisma.customAgent.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
    });
    return NextResponse.json({ success: true, data: agents });
  } catch (error) {
    return serverError("获取智能体列表失败", error, "CustomAgentsAPI");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return notFound("项目不存在");

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch (error) { return handleJsonError(error); }

    const name = sanitizeString(body.name, 200, 1);
    if (!name) return badRequest("智能体名称不能为空");

    const agent = await prisma.customAgent.create({
      data: {
        projectId,
        name,
        type: typeof body.type === "string" ? body.type : "custom",
        emoji: typeof body.emoji === "string" ? body.emoji : "🤖",
        systemPrompt: sanitizeString(body.systemPrompt ?? "", 50000) ?? "",
        temperature: typeof body.temperature === "number" ? body.temperature : 0.7,
        skills: Array.isArray(body.skills) ? JSON.stringify(body.skills) : "[]",
        mcpTools: Array.isArray(body.mcpTools) ? JSON.stringify(body.mcpTools) : "[]",
        loreIds: Array.isArray(body.loreIds) ? JSON.stringify(body.loreIds) : "[]",
        order: typeof body.order === "number" ? body.order : 0,
        isActive: body.isActive !== false,
      },
    });

    return NextResponse.json({ success: true, data: agent }, { status: 201 });
  } catch (error) {
    return serverError("创建智能体失败", error, "CustomAgentsAPI");
  }
}
