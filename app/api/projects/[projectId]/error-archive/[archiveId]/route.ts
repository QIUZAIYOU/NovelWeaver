// app/api/projects/[projectId]/error-archive/[archiveId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";
import { sanitizeBoolean } from "@/lib/api/validation";

async function getOrError(id: string, projectId: string) {
  const item = await prisma.errorArchive.findUnique({ where: { id } });
  if (!item || item.projectId !== projectId) return { error: notFound("记录不存在") };
  return { item };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; archiveId: string }> }
) {
  try {
    const { projectId, archiveId } = await params;
    const { error } = await getOrError(archiveId, projectId);
    if (error) return error;

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch (error) { return handleJsonError(error); }

    const data: Record<string, unknown> = {};
    if (body.resolved !== undefined) data.resolved = sanitizeBoolean(body.resolved, false);

    if (Object.keys(data).length === 0) return badRequest("没有要更新的字段");

    const updated = await prisma.errorArchive.update({ where: { id: archiveId }, data });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return serverError("更新错误记录失败", error, "ErrorArchiveItemAPI");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; archiveId: string }> }
) {
  try {
    const { projectId, archiveId } = await params;
    const { error } = await getOrError(archiveId, projectId);
    if (error) return error;

    await prisma.errorArchive.delete({ where: { id: archiveId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("删除错误记录失败", error, "ErrorArchiveItemAPI");
  }
}
