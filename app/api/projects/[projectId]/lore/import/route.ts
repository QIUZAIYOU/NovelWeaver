// app/api/projects/[projectId]/lore/import/route.ts
// 知识库词条批量导入 API

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

const MAX_IMPORT_COUNT = 100;

function safeStringifyArray(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value);
  return "[]";
}

/** POST /api/projects/[projectId]/lore/import - 批量导入词条 */
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

    const rawEntries = Array.isArray(body)
      ? body
      : Array.isArray(body.entries)
        ? body.entries
        : null;

    if (!rawEntries || rawEntries.length === 0) {
      return badRequest("导入数据为空，请提供词条数组");
    }
    if (rawEntries.length > MAX_IMPORT_COUNT) {
      return badRequest(`单次导入不能超过 ${MAX_IMPORT_COUNT} 个词条`);
    }

    interface ValidEntry {
      title: string;
      content: string;
      keywords: string;
      category: string;
    }

    const validEntries: ValidEntry[] = [];
    const errors: Array<{ index: number; title: string; reason: string }> = [];

    for (let i = 0; i < rawEntries.length; i++) {
      const item = rawEntries[i];
      if (!item || typeof item !== "object") {
        errors.push({ index: i, title: "(无效条目)", reason: "不是有效的对象" });
        continue;
      }

      const e = item as Record<string, unknown>;
      const title = sanitizeString(e.title, LIMITS.LORE_TITLE.max, LIMITS.LORE_TITLE.min);

      if (title === null) {
        errors.push({
          index: i,
          title: typeof e.title === "string" ? e.title : "(空标题)",
          reason: "词条标题不能为空且不能超过 " + LIMITS.LORE_TITLE.max + " 字符",
        });
        continue;
      }

      const category = isValidLoreCategory(e.category) ? e.category : "general";
      const keywords = Array.isArray(e.keywords)
        ? sanitizeJsonArray(e.keywords, LIMITS.LORE_KEYWORDS.maxArrayLength, LIMITS.LORE_KEYWORDS.maxItemLength)
        : [];

      validEntries.push({
        title,
        content: sanitizeString(e.content ?? "", LIMITS.LORE_CONTENT.max) ?? "",
        keywords: safeStringifyArray(keywords),
        category,
      });
    }

    if (validEntries.length === 0) {
      return badRequest(
        `没有有效的词条数据可导入${errors.length > 0 ? "（" + errors.length + " 条无效记录）" : ""}`
      );
    }

    const created = await prisma.$transaction(
      validEntries.map((entry) =>
        prisma.loreEntry.create({
          data: { projectId, ...entry },
        })
      )
    );

    // 自动提交版本
    await autoCommit(project.name, "批量导入词条", `${created.length} 个`);

    return NextResponse.json({
      success: true,
      data: {
        imported: created.length,
        total: rawEntries.length,
        skipped: errors.length,
        entries: created,
        errors: errors.length > 0 ? errors : undefined,
      },
      message: `成功导入 ${created.length} 个词条${errors.length > 0 ? `，${errors.length} 条跳过` : ""}`,
    });
  } catch (error) {
    return serverError("导入词条失败", error, "LoreImportAPI");
  }
}

/** GET - 返回词条导入的 JSON 模板说明 */
export async function GET() {
  const sample = [
    {
      title: "凛冬城",
      content: "北境最大的城市，建于千年之前的古代要塞之上。城墙由黑色巨石砌成，高耸入云。城内分为上城和下城，上城是贵族和议会的所在地，下城则是平民和商贩的聚居地。",
      keywords: ["凛冬", "北境", "要塞", "黑色城墙"],
      category: "geography",
    },
    {
      title: "星辰议会",
      content: "由七位大法师组成的最高魔法权威机构，负责监管大陆上的所有魔法活动。议会总部位于浮空城「苍穹之顶」。",
      keywords: ["星辰议会", "大法师", "魔法", "苍穹之顶"],
      category: "faction",
    },
  ];

  return NextResponse.json({
    success: true,
    data: {
      description: "知识库词条导入 JSON 格式说明",
      format: "顶层数组 [...] 或 { entries: [...] }",
      maxImportCount: MAX_IMPORT_COUNT,
      fields: {
        title: { type: "string", required: true, maxLength: LIMITS.LORE_TITLE.max, description: "词条标题" },
        content: { type: "string", required: false, maxLength: LIMITS.LORE_CONTENT.max, description: "词条内容（支持 Markdown）" },
        keywords: { type: "string[]", required: false, maxItems: LIMITS.LORE_KEYWORDS.maxArrayLength, description: "触发关键词数组" },
        category: {
          type: "enum",
          required: false,
          default: "general",
          options: [
            "general（通用）", "geography（地理）", "history（历史）",
            "magic（魔法/科技）", "character（人物）", "event（事件）",
            "faction（阵营）", "item（物品）",
          ],
          description: "词条分类",
        },
      },
      sample,
    },
  });
}
