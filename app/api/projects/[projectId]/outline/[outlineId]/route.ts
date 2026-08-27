// app/api/projects/[projectId]/outline/[outlineId]/route.ts
// 单个大纲 CRUD - GET / PUT / DELETE

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

/** 验证大纲是否属于指定项目 */
async function getOutlineOrError(outlineId: string, projectId: string) {
  const outline = await prisma.outline.findUnique({ where: { id: outlineId } });
  if (!outline) return { error: notFound("大纲条目不存在") };
  if (outline.projectId !== projectId) return { error: notFound("大纲条目不存在") };
  return { outline };
}

/** GET - 获取大纲详情 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; outlineId: string }> }
) {
  try {
    const { projectId, outlineId } = await params;
    const { outline, error } = await getOutlineOrError(outlineId, projectId);
    if (error) return error;

    return NextResponse.json({ success: true, data: outline });
  } catch (error) {
    return serverError("获取大纲详情失败", error, "OutlineItemAPI");
  }
}

/** PUT - 更新大纲 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; outlineId: string }> }
) {
  try {
    const { projectId, outlineId } = await params;
    const { outline: existing, error } = await getOutlineOrError(outlineId, projectId);
    if (error) return error;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch (err) {
      return handleJsonError(err);
    }

    const data: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const title = sanitizeString(body.title, LIMITS.OUTLINE_TITLE.max, LIMITS.OUTLINE_TITLE.min);
      if (title === null) return badRequest("大纲标题不能为空");
      data.title = title;
    }

    if (body.content !== undefined) {
      data.content = sanitizeString(body.content ?? "", LIMITS.OUTLINE_CONTENT.max) ?? "";
    }

    if (body.level !== undefined) {
      if (!isValidOutlineLevel(body.level)) return badRequest("无效的大纲层级");
      data.level = body.level;
    }

    if (body.status !== undefined) {
      if (!isValidOutlineStatus(body.status)) return badRequest("无效的大纲状态");
      data.status = body.status;
    }

    if (body.order !== undefined && typeof body.order === "number") {
      data.order = body.order;
    }

    if (body.parentId !== undefined) {
      data.parentId = typeof body.parentId === "string" && body.parentId.trim()
        ? body.parentId.trim()
        : null;
    }

    if (body.tags !== undefined) {
      if (Array.isArray(body.tags)) {
        const tags = sanitizeJsonArray(body.tags, LIMITS.OUTLINE_TAGS.maxArrayLength, LIMITS.OUTLINE_TAGS.maxItemLength);
        if (tags === null) return badRequest("标签格式无效");
        data.tags = JSON.stringify(tags);
      } else {
        return badRequest("标签必须是数组");
      }
    }

    if (Object.keys(data).length === 0) {
      return badRequest("没有要更新的字段");
    }

    const updated = await prisma.outline.update({
      where: { id: outlineId },
      data,
    });

    const proj = await prisma.project.findUnique({ where: { id: projectId } });
    await autoCommit(proj?.name ?? projectId, "更新大纲", `[${levelLabel[updated.level] || updated.level}] ${updated.title}`);

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return serverError("更新大纲失败", error, "OutlineItemAPI");
  }
}

/** DELETE - 删除大纲 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; outlineId: string }> }
) {
  try {
    const { projectId, outlineId } = await params;
    const { outline: existing, error } = await getOutlineOrError(outlineId, projectId);
    if (error) return error;

    // 级联删除子条目（chapter 的 parentId 指向 arc）
    await prisma.outline.deleteMany({
      where: { parentId: outlineId },
    });

    await prisma.outline.delete({ where: { id: outlineId } });

    const proj = await prisma.project.findUnique({ where: { id: projectId } });
    await autoCommit(proj?.name ?? projectId, "删除大纲", `[${levelLabel[existing.level] || existing.level}] ${existing.title}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("删除大纲失败", error, "OutlineItemAPI");
  }
}
