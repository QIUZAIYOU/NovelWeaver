// app/api/projects/[projectId]/style-profile/route.ts
// 文风档案 API - GET 获取 / PUT 更新

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notFound, serverError, handleJsonError } from "@/lib/api/errors";
import { sanitizeString, LIMITS } from "@/lib/api/validation";
import { autoCommit } from "@/lib/git/auto-commit";

/** GET - 获取文风档案 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    let profile = await prisma.styleProfile.findUnique({ where: { projectId } });
    if (!profile) {
      profile = await prisma.styleProfile.create({ data: { projectId } });
    }
    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    return serverError("获取文风档案失败", error, "StyleProfileAPI");
  }
}

/** PUT - 更新文风档案 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return notFound("项目不存在");

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch (error) { return handleJsonError(error); }

    const data: Record<string, unknown> = {};
    const fields = ["fingerprint", "constraints", "styleGuide", "sampleText"] as const;
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = sanitizeString(body[f] ?? "", LIMITS.OUTLINE_CONTENT.max) ?? "";
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "没有要更新的字段" }, { status: 400 });
    }

    const profile = await prisma.styleProfile.upsert({
      where: { projectId },
      update: data,
      create: { projectId, ...data },
    });

    await autoCommit(project.name, "更新文风档案");
    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    return serverError("更新文风档案失败", error, "StyleProfileAPI");
  }
}
