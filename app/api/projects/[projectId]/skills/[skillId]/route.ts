// app/api/projects/[projectId]/skills/[skillId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notFound, serverError, handleJsonError } from "@/lib/api/errors";
import { sanitizeString } from "@/lib/api/validation";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; skillId: string }> }
) {
  try {
    const { projectId, skillId } = await params;
    const s = await prisma.skill.findUnique({ where: { id: skillId } });
    if (!s || s.projectId !== projectId) return notFound("技能不存在");
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch (err) { return handleJsonError(err); }
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = sanitizeString(body.name, 200, 1) ?? "";
    if (body.description !== undefined) data.description = sanitizeString(body.description ?? "", 5000) ?? "";
    if (body.category !== undefined) data.category = body.category;
    if (body.prompt !== undefined) data.prompt = sanitizeString(body.prompt ?? "", 50000) ?? "";
    const updated = await prisma.skill.update({ where: { id: skillId }, data });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return serverError("更新技能失败", error, "SkillItemAPI");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; skillId: string }> }
) {
  try {
    const { projectId, skillId } = await params;
    const s = await prisma.skill.findUnique({ where: { id: skillId } });
    if (!s || s.projectId !== projectId) return notFound("技能不存在");
    await prisma.skill.delete({ where: { id: skillId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("删除技能失败", error, "SkillItemAPI");
  }
}
