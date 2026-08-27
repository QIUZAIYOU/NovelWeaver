// app/api/projects/[projectId]/characters/route.ts
// 角色 CRUD API - GET 列表 / POST 创建

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";
import { sanitizeString, sanitizeJsonArray, LIMITS } from "@/lib/api/validation";
import { autoCommit } from "@/lib/git/auto-commit";

/** 根据角色文本信息自动检测生存状态 */
const DEATH_KEYWORDS = ["死亡", "阵亡", "牺牲", "战死", "被杀", "遇害", "去世", "逝世", "die", "dead", "killed", "sacrificed", "deceased"];
const MISSING_KEYWORDS = ["失踪", "下落不明", "失踪人口", "消失", "失踪中", "missing", "disappeared", "lost"];
const UNKNOWN_KEYWORDS = ["未知", "不明", "不详", "unknown", "uncertain"];

function autoDetectStatus(body: Record<string, unknown>, preferExisting: boolean): string {
  if (preferExisting && typeof body.status === "string" && ["alive", "dead", "missing", "unknown"].includes(body.status)) {
    return body.status;
  }
  const searchText = [
    body.name, body.appearance, body.personality,
    body.backstory, body.hiddenLore, body.persona,
    ...(Array.isArray(body.tags) ? body.tags : []),
  ].filter(Boolean).join(" ").toLowerCase();

  // 按优先级检测：死亡 > 失踪 > 未知
  if (DEATH_KEYWORDS.some(kw => searchText.includes(kw))) return "dead";
  if (MISSING_KEYWORDS.some(kw => searchText.includes(kw))) return "missing";
  if (UNKNOWN_KEYWORDS.some(kw => searchText.includes(kw))) return "unknown";

  return "alive";
}

/** GET - 获取项目下的角色列表（支持 take 参数分页） */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { searchParams } = new URL(request.url);
    const take = Math.min(Math.max(1, parseInt(searchParams.get("take") || "200", 10) || 200), 500);

    const characters = await prisma.character.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
      take,
    });

    return NextResponse.json({ success: true, data: characters });
  } catch (error) {
    return serverError("获取角色列表失败", error, "CharactersAPI");
  }
}

/** POST - 创建新角色 */
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

    const name = sanitizeString(body.name, LIMITS.CHARACTER_NAME.max, LIMITS.CHARACTER_NAME.min);
    if (name === null) {
      return badRequest("角色名称不能为空，且不能超过 " + LIMITS.CHARACTER_NAME.max + " 字符");
    }

    const tags = Array.isArray(body.tags)
      ? sanitizeJsonArray(body.tags, LIMITS.CHARACTER_TAGS.maxArrayLength, LIMITS.CHARACTER_TAGS.maxItemLength)
      : null;

    // 自动检测生存状态
    const userStatus = typeof body.status === "string" && ["alive", "dead", "missing", "unknown"].includes(body.status) ? body.status : null;
    const status = userStatus || autoDetectStatus(body, false);

    const character = await prisma.character.create({
      data: {
        projectId,
        name,
        age: sanitizeString(body.age ?? "", LIMITS.CHARACTER_FIELD.max) ?? "",
        appearance: sanitizeString(body.appearance ?? "", LIMITS.CHARACTER_FIELD.max) ?? "",
        personality: sanitizeString(body.personality ?? "", LIMITS.CHARACTER_FIELD.max) ?? "",
        backstory: sanitizeString(body.backstory ?? "", LIMITS.CHARACTER_FIELD.max) ?? "",
        hiddenLore: sanitizeString(body.hiddenLore ?? "", LIMITS.CHARACTER_FIELD.max) ?? "",
        persona: sanitizeString(body.persona ?? "", LIMITS.CHARACTER_FIELD.max) ?? "",
        tags: JSON.stringify(tags || []),
        status,
      },
    });

    // 自动提交版本
    await autoCommit(project.name, "新增角色", character.name);

    return NextResponse.json(
      { success: true, data: character },
      { status: 201 }
    );
  } catch (error) {
    return serverError("创建角色失败", error, "CharactersAPI");
  }
}
