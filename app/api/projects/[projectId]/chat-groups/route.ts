// app/api/projects/[projectId]/chat-groups/route.ts
// 群组 CRUD API

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";
import { sanitizeString, LIMITS } from "@/lib/api/validation";
import { autoCommit } from "@/lib/git/auto-commit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const groups = await prisma.chatGroup.findMany({
      where: { projectId },
      include: { _count: { select: { members: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ success: true, data: groups });
  } catch (error) {
    return serverError("获取群组列表失败", error, "ChatGroupsAPI");
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
    if (!name) return badRequest("群组名称不能为空");

    const group = await prisma.chatGroup.create({
      data: {
        projectId,
        name,
        description: sanitizeString(body.description ?? "", 5000) ?? "",
        topic: sanitizeString(body.topic ?? "", 5000) ?? "",
      },
    });

    // 如果指定了初始成员，添加
    if (Array.isArray(body.memberIds)) {
      for (const charId of body.memberIds.slice(0, 20)) {
        if (typeof charId === "string") {
          await prisma.chatGroupMember.create({
            data: { groupId: group.id, characterId: charId },
          }).catch(() => {}); // 跳过重复
        }
      }
    }

    await autoCommit(project.name, "新建群组", name);
    return NextResponse.json({ success: true, data: group }, { status: 201 });
  } catch (error) {
    return serverError("创建群组失败", error, "ChatGroupsAPI");
  }
}
