// app/api/projects/[projectId]/draft/route.ts
// 草稿管理 API - 获取待审核草稿 / 确认归档 / 审核

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";
import { sanitizeString, LIMITS } from "@/lib/api/validation";
import { autoCommit } from "@/lib/git/auto-commit";

/** GET /api/projects/[projectId]/draft - 获取待审核草稿列表 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const drafts = await prisma.message.findMany({
      where: {
        projectId,
        OR: [
          { isDraft: true },
          { reviewStatus: { in: ["pending", "approved", "rejected"] } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ success: true, data: drafts });
  } catch (error) {
    return serverError("获取草稿列表失败", error, "DraftAPI");
  }
}

/** POST /api/projects/[projectId]/draft - 批量操作：confirm / review */
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

    const action = body.action as string | undefined;
    const messageId = body.messageId as string | undefined;
    const comment = body.comment as string | undefined;

    if (!messageId || typeof messageId !== "string") {
      return badRequest("缺少 messageId");
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId, projectId },
    });
    if (!message) return notFound("消息不存在");
    if (!message.isDraft && action !== "retract") return badRequest("该消息不是草稿");

    if (action === "confirm") {
      // 确认发布：标记为非草稿，审核通过
      const updated = await prisma.message.update({
        where: { id: messageId },
        data: {
          isDraft: false,
          reviewStatus: "approved",
          reviewComment: "",
        },
      });

      await autoCommit(project.name, "确认草稿", message.content.slice(0, 80));

      return NextResponse.json({
        success: true,
        data: updated,
        message: "草稿已确认发布",
      });
    }

    if (action === "retract") {
      // 撤回发布：恢复为待审草稿
      const updated = await prisma.message.update({
        where: { id: messageId },
        data: {
          isDraft: true,
          reviewStatus: "pending",
          reviewComment: "",
        },
      });

      return NextResponse.json({
        success: true,
        data: updated,
        message: "草稿已撤回，恢复为待审状态",
      });
    }

    if (action === "review") {
      // 审核操作：approve 或 reject
      const reviewStatus = body.reviewStatus as string | undefined;
      if (!reviewStatus || !["approved", "rejected"].includes(reviewStatus)) {
        return badRequest("审核状态必须是 approved 或 rejected");
      }

      const validComment = comment
        ? (sanitizeString(comment, LIMITS.REVIEW_COMMENT.max) ?? "")
        : "";

      const updated = await prisma.message.update({
        where: { id: messageId },
        data: {
          reviewStatus,
          reviewComment: validComment,
          // rejected 时保持 isDraft=true 以便重新编辑；approved 时标记为非草稿
          ...(reviewStatus === "approved" ? { isDraft: false } : {}),
        },
      });

      const actionLabel = reviewStatus === "approved" ? "通过审核" : "打回重写";
      await autoCommit(project.name, actionLabel, message.content.slice(0, 80));

      return NextResponse.json({
        success: true,
        data: updated,
        message: reviewStatus === "approved" ? "草稿已通过审核" : "草稿已打回",
      });
    }

    return badRequest("无效的操作类型，必须是 confirm 或 review");
  } catch (error) {
    return serverError("草稿操作失败", error, "DraftAPI");
  }
}

/** DELETE /api/projects/[projectId]/draft - 删除草稿 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const url = new URL(_request.url);
    const messageId = url.searchParams.get("messageId");

    if (!messageId) return badRequest("缺少 messageId");

    const message = await prisma.message.findUnique({
      where: { id: messageId, projectId },
    });
    if (!message) return notFound("消息不存在");

    await prisma.message.delete({ where: { id: messageId } });

    return NextResponse.json({ success: true, message: "草稿已删除" });
  } catch (error) {
    return serverError("删除草稿失败", error, "DraftAPI");
  }
}
