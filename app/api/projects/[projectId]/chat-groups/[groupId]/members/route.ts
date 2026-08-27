// app/api/projects/[projectId]/chat-groups/[groupId]/members/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, serverError } from "@/lib/api/errors";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; groupId: string }> }
) {
  try {
    const { groupId } = await params;
    const members = await prisma.chatGroupMember.findMany({
      where: { groupId },
      include: { character: { select: { id: true, name: true } } },
    });
    return NextResponse.json({ success: true, data: members });
  } catch (error) {
    return serverError("获取成员列表失败", error, "GroupMembersAPI");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; groupId: string }> }
) {
  try {
    const { groupId } = await params;
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { body = {}; }

    const characterIds = Array.isArray(body.characterIds) ? body.characterIds.slice(0, 20) : [body.characterId].filter(Boolean);
    if (characterIds.length === 0) return badRequest("请指定角色");

    const results = [];
    for (const cid of characterIds) {
      if (typeof cid !== "string") continue;
      const created = await prisma.chatGroupMember.create({
        data: { groupId, characterId: cid },
        include: { character: { select: { id: true, name: true } } },
      }).catch(() => null);
      if (created) results.push(created);
    }

    return NextResponse.json({ success: true, data: results }, { status: 201 });
  } catch (error) {
    return serverError("添加成员失败", error, "GroupMembersAPI");
  }
}
