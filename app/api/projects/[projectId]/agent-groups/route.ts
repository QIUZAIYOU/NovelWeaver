// app/api/projects/[projectId]/agent-groups/route.ts
// 智能体协作分组 API - CRUD

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";

/** GET - 获取所有协作分组 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const groups = await prisma.agentGroup.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ success: true, data: groups });
  } catch (error) {
    return serverError("获取分组失败", error, "AgentGroupAPI");
  }
}

/** POST - 创建新分组 */
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

    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
    if (!name) return badRequest("分组名称不能为空");

    const group = await prisma.agentGroup.create({
      data: {
        projectId,
        name,
        description: typeof body.description === "string" ? body.description : "",
        memberIds: Array.isArray(body.memberIds) ? JSON.stringify(body.memberIds) : "[]",
      },
    });

    return NextResponse.json({ success: true, data: group }, { status: 201 });
  } catch (error) {
    return serverError("创建分组失败", error, "AgentGroupAPI");
  }
}
