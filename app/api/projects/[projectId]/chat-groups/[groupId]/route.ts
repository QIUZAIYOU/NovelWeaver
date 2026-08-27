// app/api/projects/[projectId]/chat-groups/[groupId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";
import { sanitizeString } from "@/lib/api/validation";
import { autoCommit } from "@/lib/git/auto-commit";

async function getGroupOrError(groupId: string, projectId: string) {
  const group = await prisma.chatGroup.findUnique({ where: { id: groupId } });
  if (!group || group.projectId !== projectId) return { error: notFound("群组不存在") };
  return { group };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; groupId: string }> }
) {
  try {
    const { projectId, groupId } = await params;
    const { group, error } = await getGroupOrError(groupId, projectId);
    if (error) return error;

    const members = await prisma.chatGroupMember.findMany({
      where: { groupId },
      include: { character: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ success: true, data: { ...group, members } });
  } catch (error) {
    return serverError("获取群组详情失败", error, "ChatGroupDetailAPI");
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; groupId: string }> }
) {
  try {
    const { projectId, groupId } = await params;
    const { error } = await getGroupOrError(groupId, projectId);
    if (error) return error;

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch (err) { return handleJsonError(err); }

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const n = sanitizeString(body.name, 200, 1);
      if (!n) return badRequest("名称不能为空");
      data.name = n;
    }
    if (body.description !== undefined) data.description = sanitizeString(body.description ?? "", 5000) ?? "";
    if (body.topic !== undefined) data.topic = sanitizeString(body.topic ?? "", 5000) ?? "";

    if (Object.keys(data).length === 0) return badRequest("没有要更新的字段");

    const updated = await prisma.chatGroup.update({ where: { id: groupId }, data });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return serverError("更新群组失败", error, "ChatGroupUpdateAPI");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; groupId: string }> }
) {
  try {
    const { projectId, groupId } = await params;
    const { error } = await getGroupOrError(groupId, projectId);
    if (error) return error;
    await prisma.chatGroup.delete({ where: { id: groupId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("删除群组失败", error, "ChatGroupDeleteAPI");
  }
}
