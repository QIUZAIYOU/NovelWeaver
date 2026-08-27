// app/api/projects/[projectId]/missions/[missionId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";
import { sanitizeString, sanitizeJsonArray, LIMITS } from "@/lib/api/validation";
import { autoCommit } from "@/lib/git/auto-commit";

async function getOrError(id: string, projectId: string) {
  const item = await prisma.mission.findUnique({ where: { id } });
  if (!item || item.projectId !== projectId) return { error: notFound("档案不存在") };
  return { item };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; missionId: string }> }
) {
  try {
    const { projectId, missionId } = await params;
    const { error } = await getOrError(missionId, projectId);
    if (error) return error;

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch (err) { return handleJsonError(err); }

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const t = sanitizeString(body.title, LIMITS.MISSION_TITLE.max, LIMITS.MISSION_TITLE.min);
      if (!t) return badRequest("标题不能为空");
      data.title = t;
    }
    if (body.content !== undefined) data.content = sanitizeString(body.content ?? "", LIMITS.MISSION_CONTENT.max) ?? "";
    if (body.status !== undefined) data.status = body.status;
    if (body.classification !== undefined) data.classification = body.classification;
    if (body.reviewComment !== undefined) data.reviewComment = sanitizeString(body.reviewComment ?? "", 2000) ?? "";
    if (body.writerId !== undefined) data.writerId = body.writerId || null;
    if (body.reviewerId !== undefined) data.reviewerId = body.reviewerId || null;
    if (body.tags !== undefined) {
      if (Array.isArray(body.tags)) {
        const tags = sanitizeJsonArray(body.tags, LIMITS.MISSION_TAGS.maxArrayLength, LIMITS.MISSION_TAGS.maxItemLength);
        if (!tags) return badRequest("标签格式无效");
        data.tags = JSON.stringify(tags);
      }
    }

    if (Object.keys(data).length === 0) return badRequest("没有要更新的字段");

    const updated = await prisma.mission.update({ where: { id: missionId }, data });
    const proj = await prisma.project.findUnique({ where: { id: projectId } });
    await autoCommit(proj?.name ?? projectId, "更新档案", `${updated.code} ${updated.title}`);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return serverError("更新档案失败", error, "MissionItemAPI");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; missionId: string }> }
) {
  try {
    const { projectId, missionId } = await params;
    const { error } = await getOrError(missionId, projectId);
    if (error) return error;
    await prisma.mission.delete({ where: { id: missionId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("删除档案失败", error, "MissionItemAPI");
  }
}
