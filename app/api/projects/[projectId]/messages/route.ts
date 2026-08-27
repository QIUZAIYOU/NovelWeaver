// app/api/projects/[projectId]/messages/route.ts
// 对话消息 API - GET 列表 / POST 创建

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";
import { sanitizeString, isValidMessageRole, sanitizeBoolean, sanitizePagination, LIMITS } from "@/lib/api/validation";
import { autoCommit } from "@/lib/git/auto-commit";

/** GET - 获取对话历史 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { limit, offset } = sanitizePagination(new URL(request.url).searchParams);

    const messages = await prisma.message.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      take: limit,
      skip: offset,
    });

    const total = await prisma.message.count({
      where: { projectId },
    });

    return NextResponse.json({
      success: true,
      data: { items: messages, total },
    });
  } catch (error) {
    return serverError("获取对话历史失败", error, "MessagesAPI");
  }
}

/** DELETE - 批量删除消息（支持按 groupId 过滤） */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const url = new URL(request.url);
    const groupId = url.searchParams.get("groupId");

    if (!groupId) {
      return badRequest("缺少 groupId 参数");
    }

    // 查找所有该群组的消息（metadata 中包含 groupId）
    const messages = await prisma.message.findMany({
      where: { projectId },
    });

    const groupMessageIds = messages
      .filter((m) => {
        try {
          const meta = JSON.parse(m.metadata || "{}");
          return meta.groupId === groupId;
        } catch {
          return false;
        }
      })
      .map((m) => m.id);

    if (groupMessageIds.length > 0) {
      await prisma.message.deleteMany({
        where: { id: { in: groupMessageIds } },
      });
    }

    return NextResponse.json({ success: true, deletedCount: groupMessageIds.length });
  } catch (error) {
    return serverError("批量删除消息失败", error, "MessagesAPI");
  }
}

/** POST - 创建新消息 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    // 验证项目存在
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return notFound("项目不存在");
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch (error) {
      return handleJsonError(error);
    }

    const role = body.role;
    const content = body.content;

    if (!isValidMessageRole(role)) {
      return badRequest("无效的消息角色，必须是 user、assistant 或 system");
    }

    const validContent = sanitizeString(content, LIMITS.MESSAGE_CONTENT.max, LIMITS.MESSAGE_CONTENT.min);
    if (validContent === null) {
      return badRequest("消息内容不能为空，且不能超过 " + LIMITS.MESSAGE_CONTENT.max + " 字符");
    }

    const isPinned = sanitizeBoolean(body.isPinned, false);
    const isDraft = sanitizeBoolean(body.isDraft, false);
    const reviewStatus = isDraft ? "pending" : "none";

    // metadata 只接受合法的 JSON 对象
    let metadataStr = "{}";
    let characterName: string | undefined;
    if (body.metadata) {
      // 兼容字符串 metadata（旧版调用可能传了 JSON.stringify 后的字符串）
      let metaObj: unknown = body.metadata;
      if (typeof metaObj === "string") {
        try { metaObj = JSON.parse(metaObj); } catch { metaObj = null; }
      }
      if (metaObj && typeof metaObj === "object" && !Array.isArray(metaObj)) {
        try {
          metadataStr = JSON.stringify(metaObj);
          if (typeof (metaObj as Record<string, unknown>).characterName === "string") {
            characterName = (metaObj as Record<string, unknown>).characterName as string;
          }
        } catch {
          metadataStr = "{}";
        }
      }
    }

    const message = await prisma.message.create({
      data: {
        projectId,
        role,
        content: validContent,
        isPinned,
        isDraft,
        reviewStatus,
        metadata: metadataStr,
      },
    });

    // 自动提交版本
    let actionLabel: string;
    if (characterName) {
      actionLabel = `${characterName} 角色扮演`;
    } else {
      actionLabel = role === "user" ? "用户消息" : role === "assistant" ? "AI 回复" : "系统消息";
    }
    await autoCommit(project.name, actionLabel, validContent.slice(0, 80));

    return NextResponse.json(
      { success: true, data: message },
      { status: 201 }
    );
  } catch (error) {
    return serverError("创建消息失败", error, "MessagesAPI");
  }
}
