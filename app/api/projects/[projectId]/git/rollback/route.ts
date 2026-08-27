// app/api/projects/[projectId]/git/rollback/route.ts
// 版本回滚 API - POST 回滚到指定版本

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rollbackTo, getHistory } from "@/lib/git";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";

/** POST /api/projects/[projectId]/git/rollback - 回滚到指定版本 */
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

    const targetOid = typeof body.commitOid === "string" ? body.commitOid.trim() : "";
    if (!targetOid) {
      return badRequest("缺少 commitOid 参数");
    }

    // 验证提交是否存在
    const history = await getHistory({ maxCount: 200 });
    const target = history.find((c) => c.oid.startsWith(targetOid));
    if (!target) {
      return badRequest("指定的版本不存在");
    }

    // 执行回滚
    const newOid = await rollbackTo(target.oid);

    return NextResponse.json({
      success: true,
      data: {
        rolledBackTo: target.oid,
        newHeadOid: newOid,
        message: `已回滚到版本 ${target.oid.slice(0, 7)}：${target.message}`,
      },
    });
  } catch (error) {
    return serverError("回滚失败", error, "GitRollbackAPI");
  }
}
