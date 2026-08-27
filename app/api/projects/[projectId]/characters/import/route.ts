// app/api/projects/[projectId]/characters/import/route.ts
// 角色批量导入 API - 从 JSON 数组批量创建角色

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";
import { sanitizeString, sanitizeJsonArray, LIMITS } from "@/lib/api/validation";
import { autoCommit } from "@/lib/git/auto-commit";

/** 单次导入最大数量 */
const MAX_IMPORT_COUNT = 100;

/** 安全的 JSON 数组序列化兜底 */
function safeStringifyArray(value: unknown): string {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return "[]";
}

/** POST /api/projects/[projectId]/characters/import - 批量导入角色 */
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

    // 支持两种格式：顶层数组 或 { characters: [...] }
    const rawCharacters = Array.isArray(body)
      ? body
      : Array.isArray(body.characters)
        ? body.characters
        : null;

    if (!rawCharacters || rawCharacters.length === 0) {
      return badRequest("导入数据为空，请提供角色数组");
    }

    if (rawCharacters.length > MAX_IMPORT_COUNT) {
      return badRequest(`单次导入不能超过 ${MAX_IMPORT_COUNT} 个角色`);
    }

    // 校验并转换每一条角色数据
    const validCharacters: Array<{
      name: string;
      age: string;
      appearance: string;
      personality: string;
      backstory: string;
      hiddenLore: string;
      persona: string;
      tags: string;
    }> = [];

    const errors: Array<{ index: number; name: string; reason: string }> = [];

    for (let i = 0; i < rawCharacters.length; i++) {
      const item = rawCharacters[i];
      if (!item || typeof item !== "object") {
        errors.push({ index: i, name: "(无效条目)", reason: "不是有效的对象" });
        continue;
      }

      const c = item as Record<string, unknown>;
      const name = sanitizeString(c.name, LIMITS.CHARACTER_NAME.max, LIMITS.CHARACTER_NAME.min);

      if (name === null) {
        errors.push({
          index: i,
          name: typeof c.name === "string" ? c.name : "(空名称)",
          reason: "角色名称不能为空且不能超过 " + LIMITS.CHARACTER_NAME.max + " 字符",
        });
        continue;
      }

      const tags = Array.isArray(c.tags)
        ? sanitizeJsonArray(c.tags, LIMITS.CHARACTER_TAGS.maxArrayLength, LIMITS.CHARACTER_TAGS.maxItemLength)
        : [];

      validCharacters.push({
        name,
        age: sanitizeString(c.age, LIMITS.CHARACTER_FIELD.max) ?? "",
        appearance: sanitizeString(c.appearance, LIMITS.CHARACTER_FIELD.max) ?? "",
        personality: sanitizeString(c.personality, LIMITS.CHARACTER_FIELD.max) ?? "",
        backstory: sanitizeString(c.backstory, LIMITS.CHARACTER_FIELD.max) ?? "",
        hiddenLore: sanitizeString(c.hiddenLore, LIMITS.CHARACTER_FIELD.max) ?? "",
        persona: sanitizeString(c.persona, LIMITS.CHARACTER_FIELD.max) ?? "",
        tags: safeStringifyArray(tags),
      });
    }

    if (validCharacters.length === 0) {
      return badRequest(
        `没有有效的角色数据可导入${errors.length > 0 ? "（" + errors.length + " 条无效记录）" : ""}`
      );
    }

    // 事务批量创建
    const created = await prisma.$transaction(
      validCharacters.map((char) =>
        prisma.character.create({
          data: {
            projectId,
            ...char,
          },
        })
      )
    );

    // 自动提交版本
    await autoCommit(project.name, "批量导入角色", `${created.length} 个`);

    return NextResponse.json({
      success: true,
      data: {
        imported: created.length,
        total: rawCharacters.length,
        skipped: errors.length,
        characters: created,
        errors: errors.length > 0 ? errors : undefined,
      },
      message: `成功导入 ${created.length} 个角色${errors.length > 0 ? `，${errors.length} 条跳过` : ""}`,
    });
  } catch (error) {
    return serverError("导入角色失败", error, "CharactersImportAPI");
  }
}

/**
 * GET - 返回角色导入的 JSON Schema / 模板说明
 * 用于让用户了解导入文件的格式
 */
export async function GET() {
  const sample = [
    {
      name: "亚瑟·晨锋",
      age: "28",
      appearance: "高大英俊，金色短发，蓝色眼眸，左脸有一道细长的疤痕。常穿银白色铠甲。",
      personality: "勇敢正义，重视荣誉，但有时过于固执。对朋友忠诚，对敌人毫不留情。",
      backstory: "出身于骑士世家，幼年时目睹父亲战死沙场，立志成为最强的骑士。经过十年苦练，终于获得\"晨锋\"之称号。",
      hiddenLore: "实际上他的亲生父亲是邻国的叛军首领，他一直隐瞒着这个秘密。",
      persona: "说话铿锵有力，喜欢用骑士誓言。语气坚定自信，偶尔会流露出温柔的一面。",
      tags: ["骑士", "人类", "光明阵营", "主角"],
    },
  ];

  return NextResponse.json({
    success: true,
    data: {
      description: "角色导入 JSON 格式说明",
      format: "顶层数组 或 { characters: [...] }",
      maxImportCount: MAX_IMPORT_COUNT,
      fields: {
        name: { type: "string", required: true, maxLength: LIMITS.CHARACTER_NAME.max, description: "角色名称" },
        age: { type: "string", required: false, maxLength: LIMITS.CHARACTER_FIELD.max, description: "年龄" },
        appearance: { type: "string", required: false, maxLength: LIMITS.CHARACTER_FIELD.max, description: "外貌描述" },
        personality: { type: "string", required: false, maxLength: LIMITS.CHARACTER_FIELD.max, description: "性格描述" },
        backstory: { type: "string", required: false, maxLength: LIMITS.CHARACTER_FIELD.max, description: "背景故事" },
        hiddenLore: { type: "string", required: false, maxLength: LIMITS.CHARACTER_FIELD.max, description: "隐藏设定（仅 AI 可见）" },
        persona: { type: "string", required: false, maxLength: LIMITS.CHARACTER_FIELD.max, description: "角色专属 Prompt（语气/口癖）" },
        tags: { type: "string[]", required: false, maxItems: LIMITS.CHARACTER_TAGS.maxArrayLength, description: "角色标签数组" },
      },
      sample,
    },
  });
}
