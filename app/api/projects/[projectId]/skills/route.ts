// app/api/projects/[projectId]/skills/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, serverError, handleJsonError } from "@/lib/api/errors";
import { sanitizeString } from "@/lib/api/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const category = new URL(request.url).searchParams.get("category");
    const where: Record<string, unknown> = { projectId };
    if (category) where.category = category;
    const skills = await prisma.skill.findMany({ where, orderBy: { name: "asc" } });
    return NextResponse.json({ success: true, data: skills });
  } catch (error) {
    return serverError("获取技能列表失败", error, "SkillAPI");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch (error) { return handleJsonError(error); }
    const name = sanitizeString(body.name, 200, 1);
    if (!name) return badRequest("技能名称不能为空");
    const skill = await prisma.skill.create({
      data: { projectId, name, description: sanitizeString(body.description ?? "", 5000) ?? "", category: typeof body.category === "string" ? body.category : "general", prompt: sanitizeString(body.prompt ?? "", 50000) ?? "" },
    }).catch(e => e.code === "P2002" ? (() => { throw new Error("技能名称已存在"); })() : (() => { throw e; })());
    return NextResponse.json({ success: true, data: skill }, { status: 201 });
  } catch (error) {
    return serverError("创建技能失败", error, "SkillAPI");
  }
}
