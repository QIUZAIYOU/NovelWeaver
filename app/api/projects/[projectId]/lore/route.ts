// app/api/projects/[projectId]/lore/route.ts
// 知识库词条 CRUD API - GET 列表 / POST 创建

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";
import {
  sanitizeString,
  sanitizeJsonArray,
  isValidLoreCategory,
  LIMITS,
} from "@/lib/api/validation";
import { autoCommit } from "@/lib/git/auto-commit";

/** GET - 获取知识库词条列表 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    const where: Record<string, string> = { projectId };
    if (category && isValidLoreCategory(category)) {
      where.category = category;
    }

    const entries = await prisma.loreEntry.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    // 如果请求了 mentions，统计每条词条在消息中的引用次数
    if (searchParams.get("mentions") === "true") {
      const messages = await prisma.message.findMany({
        where: { projectId },
        select: { content: true, createdAt: true },
        take: 200,
        orderBy: { createdAt: "desc" },
      });
      const messageTexts = messages.map(m => ({ content: m.content, time: m.createdAt }));
      const enriched = entries.map(entry => {
        let count = 0;
        const snippets: { text: string; time: Date }[] = [];
        let keywords: string[] = [];
        try { keywords = JSON.parse(entry.keywords || "[]"); } catch {}
        const searchTerms = [entry.title, ...keywords].filter(Boolean);
        for (const msg of messageTexts) {
          const lower = msg.content.toLowerCase();
          const matched = searchTerms.some(t => lower.includes(t.toLowerCase()));
          if (matched) {
            count++;
            if (snippets.length < 3) {
              const firstTerm = searchTerms.find(t => lower.includes(t.toLowerCase())) || "";
              const idx = msg.content.toLowerCase().indexOf(firstTerm.toLowerCase());
              snippets.push({ text: msg.content.slice(Math.max(0, idx - 20), idx + 60).trim(), time: msg.time });
            }
          }
        }
        return { ...entry, mentionCount: count, mentionSnippets: snippets.slice(0, 3) };
      });
      return NextResponse.json({ success: true, data: enriched });
    }

    return NextResponse.json({ success: true, data: entries });
  } catch (error) {
    return serverError("获取知识库列表失败", error, "LoreAPI");
  }
}

/** POST - 创建新词条 */
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

    const title = sanitizeString(body.title, LIMITS.LORE_TITLE.max, LIMITS.LORE_TITLE.min);
    if (title === null) {
      return badRequest("词条标题不能为空，且不能超过 " + LIMITS.LORE_TITLE.max + " 字符");
    }

    const content = sanitizeString(body.content ?? "", LIMITS.LORE_CONTENT.max) ?? "";
    const category = isValidLoreCategory(body.category) ? body.category : "general";

    const keywords = Array.isArray(body.keywords)
      ? sanitizeJsonArray(body.keywords, LIMITS.LORE_KEYWORDS.maxArrayLength, LIMITS.LORE_KEYWORDS.maxItemLength)
      : null;

    const entry = await prisma.loreEntry.create({
      data: {
        projectId,
        title,
        content,
        keywords: JSON.stringify(keywords || []),
        category,
      },
    });

    // 自动提交版本
    await autoCommit(project.name, "新增词条", entry.title);

    return NextResponse.json(
      { success: true, data: entry },
      { status: 201 }
    );
  } catch (error) {
    return serverError("创建词条失败", error, "LoreAPI");
  }
}
