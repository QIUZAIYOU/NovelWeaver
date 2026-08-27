// app/api/projects/[projectId]/git/route.ts
// 版本历史 API - GET 获取历史 / POST 手动创建存档点

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHistory, commitChange, getBranches, getCurrentOid } from "@/lib/git";
import { notFound, serverError } from "@/lib/api/errors";

/** GET /api/projects/[projectId]/git - 获取版本历史 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return notFound("项目不存在");

    const { searchParams } = new URL(request.url);
    const maxCount = Math.min(parseInt(searchParams.get("maxCount") || "50", 10), 200);

    const [history, branches, currentOid] = await Promise.all([
      getHistory({ maxCount }),
      getBranches(),
      getCurrentOid(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        projectName: project.name,
        history,
        branches,
        currentOid,
      },
    });
  } catch (error) {
    return serverError("获取版本历史失败", error, "GitAPI");
  }
}

/** POST /api/projects/[projectId]/git - 手动创建存档点 */
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
    } catch {
      body = {};
    }

    const message = (body.message as string) || `📌 手动存档 - ${new Date().toLocaleString("zh-CN")}`;
    const fullMessage = `[${project.name}] ${message}`;
    const oid = await commitChange(fullMessage);

    return NextResponse.json({
      success: true,
      data: { oid, message: fullMessage },
    });
  } catch (error) {
    return serverError("创建存档点失败", error, "GitAPI");
  }
}
