// app/api/projects/[projectId]/agent-groups/[groupId]/route.ts
// 智能体协作分组 - 单个分组更新/删除

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";

/** PUT - 更新分组 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; groupId: string }> }
) {
  try {
    const { projectId, groupId } = await params;
    const group = await prisma.agentGroup.findUnique({ where: { id: groupId, projectId } });
    if (!group) return notFound("分组不存在");

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch (error) { return handleJsonError(error); }

    const updateData: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) updateData.name = body.name.trim();
    if (typeof body.description === "string") updateData.description = body.description;
    if (Array.isArray(body.memberIds)) updateData.memberIds = JSON.stringify(body.memberIds);

    const updated = await prisma.agentGroup.update({
      where: { id: groupId },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return serverError("更新分组失败", error, "AgentGroupAPI");
  }
}

/** DELETE - 删除分组 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; groupId: string }> }
) {
  try {
    const { projectId, groupId } = await params;
    const group = await prisma.agentGroup.findUnique({ where: { id: groupId, projectId } });
    if (!group) return notFound("分组不存在");

    await prisma.agentGroup.delete({ where: { id: groupId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("删除分组失败", error, "AgentGroupAPI");
  }
}
