// app/api/projects/[projectId]/chat-groups/[groupId]/members/[memberId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notFound, serverError } from "@/lib/api/errors";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; groupId: string; memberId: string }> }
) {
  try {
    const { groupId, memberId } = await params;
    const member = await prisma.chatGroupMember.findUnique({ where: { id: memberId } });
    if (!member || member.groupId !== groupId) return notFound("成员不存在");
    await prisma.chatGroupMember.delete({ where: { id: memberId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("移除成员失败", error, "GroupMemberDeleteAPI");
  }
}
