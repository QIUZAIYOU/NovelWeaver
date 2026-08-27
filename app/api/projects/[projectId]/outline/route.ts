// app/api/projects/[projectId]/outline/route.ts
// 大纲 API - GET 列表 / POST 创建

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";
import {
  sanitizeString,
  sanitizeJsonArray,
  isValidOutlineLevel,
  isValidOutlineStatus,
  LIMITS,
} from "@/lib/api/validation";
import { autoCommit } from "@/lib/git/auto-commit";

/** 层级显示名映射 */
const levelLabel: Record<string, string> = {
  brainstorm: "灵感",
  master: "总纲",
  arc: "篇章",
  chapter: "章节",
};

/** GET /api/projects/[projectId]/outline - 获取大纲列表 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { searchParams } = new URL(request.url);
    const level = searchParams.get("level");
    const parentId = searchParams.get("parentId");

    const where: Record<string, unknown> = { projectId };
    if (level && isValidOutlineLevel(level)) where.level = level;
    if (parentId) where.parentId = parentId;

    const outlines = await prisma.outline.findMany({
      where,
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ success: true, data: outlines });
  } catch (error) {
    return serverError("获取大纲列表失败", error, "OutlineAPI");
  }
}

/** POST /api/projects/[projectId]/outline - 创建大纲条目 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return notFound("项目不存在");

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch (error) {
      return handleJsonError(error);
    }

    const level = body.level;
    if (!isValidOutlineLevel(level)) {
      return badRequest("无效的大纲层级，必须是 brainstorm/master/arc/chapter");
    }

    const title = sanitizeString(body.title, LIMITS.OUTLINE_TITLE.max, LIMITS.OUTLINE_TITLE.min);
    if (title === null) {
      return badRequest("大纲标题不能为空，且不能超过 " + LIMITS.OUTLINE_TITLE.max + " 字符");
    }

    const content = sanitizeString(body.content ?? "", LIMITS.OUTLINE_CONTENT.max) ?? "";
    const status = isValidOutlineStatus(body.status) ? body.status : "draft";

    const tags = Array.isArray(body.tags)
      ? sanitizeJsonArray(body.tags, LIMITS.OUTLINE_TAGS.maxArrayLength, LIMITS.OUTLINE_TAGS.maxItemLength)
      : [];

    // 如果未指定 order，自动计算
    let order = 0;
    if (typeof body.order === "number") {
      order = body.order;
    } else {
      const last = await prisma.outline.findFirst({
        where: { projectId, level },
        orderBy: { order: "desc" },
      });
      order = (last?.order ?? -1) + 1;
    }

    const parentId =
      typeof body.parentId === "string" && body.parentId.trim()
        ? body.parentId.trim()
        : null;

    const outline = await prisma.outline.create({
      data: {
        projectId,
        level,
        title,
        content,
        order,
        parentId,
        status,
        tags: JSON.stringify(tags),
      },
    });

    await autoCommit(project.name, "新增大纲", `[${levelLabel[level] || level}] ${title}`);

    return NextResponse.json({ success: true, data: outline }, { status: 201 });
  } catch (error) {
    return serverError("创建大纲失败", error, "OutlineAPI");
  }
}
