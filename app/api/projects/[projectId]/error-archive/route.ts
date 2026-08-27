// app/api/projects/[projectId]/error-archive/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";
import { sanitizeString, LIMITS } from "@/lib/api/validation";
import { autoCommit } from "@/lib/git/auto-commit";

const VALID_CATEGORIES = new Set(["ooc", "logic", "style", "fact", "other"]);
const VALID_SEVERITIES = new Set(["minor", "major", "critical"]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const resolved = searchParams.get("resolved");

    const where: Record<string, unknown> = { projectId };
    if (category && VALID_CATEGORIES.has(category)) where.category = category;
    if (resolved === "true") where.resolved = true;
    if (resolved === "false") where.resolved = false;

    const archives = await prisma.errorArchive.findMany({
      where, orderBy: [{ resolved: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ success: true, data: archives });
  } catch (error) {
    return serverError("获取错误记录失败", error, "ErrorArchiveAPI");
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

    const content = sanitizeString(body.content, 2000, 1);
    if (!content) return badRequest("错误内容不能为空");

    const category = typeof body.category === "string" && VALID_CATEGORIES.has(body.category) ? body.category : "other";
    const severity = typeof body.severity === "string" && VALID_SEVERITIES.has(body.severity) ? body.severity : "minor";
    const context = sanitizeString(body.context ?? "", 5000) ?? "";

    const archive = await prisma.errorArchive.create({
      data: { projectId, category, content, context, severity },
    });

    await autoCommit(project.name, "新增错误记录", `[${category}] ${content.slice(0, 60)}`);
    return NextResponse.json({ success: true, data: archive }, { status: 201 });
  } catch (error) {
    return serverError("创建错误记录失败", error, "ErrorArchiveAPI");
  }
}
