// app/api/projects/[projectId]/missions/route.ts
// 档案/任务 CRUD API

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";
import { sanitizeString, sanitizeJsonArray, LIMITS } from "@/lib/api/validation";
import { autoCommit } from "@/lib/git/auto-commit";

const VALID_TYPES = new Set(["mission", "report", "interview", "log", "assessment", "item", "event"]);
const VALID_STATUSES = new Set(["draft", "review", "archived", "sealed"]);
const VALID_CLASSIFICATIONS = new Set(["internal", "confidential", "secret", "cosmic"]);

const typeLabels: Record<string, string> = {
  mission: "任务报告", report: "调查报告", interview: "访谈记录",
  log: "行动日志", assessment: "评估报告", item: "物品描述", event: "事件记录",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const where: Record<string, unknown> = { projectId };
    if (status && VALID_STATUSES.has(status)) where.status = status;
    if (type && VALID_TYPES.has(type)) where.type = type;

    const missions = await prisma.mission.findMany({
      where, orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    });
    return NextResponse.json({ success: true, data: missions });
  } catch (error) {
    return serverError("获取档案列表失败", error, "MissionsAPI");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return notFound("项目不存在");

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch (error) { return handleJsonError(error); }

    const title = sanitizeString(body.title, LIMITS.MISSION_TITLE.max, LIMITS.MISSION_TITLE.min);
    if (!title) return badRequest("档案标题不能为空");

    const type = typeof body.type === "string" && VALID_TYPES.has(body.type) ? body.type : "mission";
    const content = sanitizeString(body.content ?? "", LIMITS.MISSION_CONTENT.max) ?? "";
    const status = typeof body.status === "string" && VALID_STATUSES.has(body.status) ? body.status : "draft";
    const classification = typeof body.classification === "string" && VALID_CLASSIFICATIONS.has(body.classification) ? body.classification : "internal";

    // 自动生成档案编号
    let code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code) {
      const count = await prisma.mission.count({ where: { projectId } });
      const prefix = { mission: "M", report: "RPT", interview: "INT", log: "LOG", assessment: "ASM", item: "OBJ", event: "EVT" };
      code = `${prefix[type as keyof typeof prefix] || "DOC"}-${String(count + 1).padStart(4, "0")}`;
    }

    const tags = Array.isArray(body.tags) ? sanitizeJsonArray(body.tags, LIMITS.MISSION_TAGS.maxArrayLength, LIMITS.MISSION_TAGS.maxItemLength) : [];
    const writerId = typeof body.writerId === "string" ? body.writerId : null;
    const reviewerId = typeof body.reviewerId === "string" ? body.reviewerId : null;
    const parentId = typeof body.parentId === "string" ? body.parentId : null;

    const mission = await prisma.mission.create({
      data: { projectId, title, code, type, content, status, classification, writerId, reviewerId, parentId, tags: JSON.stringify(tags) },
    });

    await autoCommit(project.name, `新建档案`, `${code} ${title}`);
    return NextResponse.json({ success: true, data: mission }, { status: 201 });
  } catch (error) {
    return serverError("创建档案失败", error, "MissionsAPI");
  }
}
