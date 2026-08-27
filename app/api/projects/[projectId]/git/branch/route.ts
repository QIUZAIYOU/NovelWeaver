// app/api/projects/[projectId]/git/branch/route.ts
// 剧情分支 API - 创建/切换/合并分支

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";
import { autoCommit } from "@/lib/git/auto-commit";

import fs from "node:fs";
import path from "node:path";
import * as git from "isomorphic-git";

const GITDIR = path.join(process.cwd(), "prisma", ".git");
const WORKDIR = path.join(process.cwd(), "prisma");

async function checkProject(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;
  return project;
}

/** POST - 创建/切换分支 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body: Record<string, unknown> = await request.json();
    const action = body.action as string;
    const branchName = body.branchName as string;

    if (!action || !branchName) return badRequest("缺少 action 或 branchName");

    const project = await checkProject(projectId);
    if (!project) return notFound("项目不存在");

    if (action === "create") {
      const branches = await git.listBranches({ fs, dir: WORKDIR, gitdir: GITDIR });
      if (branches.includes(branchName)) return badRequest("分支已存在");

      await git.branch({ fs, dir: WORKDIR, gitdir: GITDIR, ref: branchName, checkout: true });
      await autoCommit(project.name, "创建分支", branchName);
      return NextResponse.json({ success: true, data: { branch: branchName } });
    }

    if (action === "checkout") {
      const branches = await git.listBranches({ fs, dir: WORKDIR, gitdir: GITDIR });
      if (!branches.includes(branchName)) return badRequest("分支不存在");

      const currentBranch = await git.currentBranch({ fs, dir: WORKDIR, gitdir: GITDIR });
      if (currentBranch === branchName) return badRequest("已在此分支上");

      await git.checkout({ fs, dir: WORKDIR, gitdir: GITDIR, ref: branchName });
      await autoCommit(project.name, "切换分支", branchName);
      return NextResponse.json({ success: true, data: { branch: branchName } });
    }

    return badRequest("action 必须是 create 或 checkout");
  } catch (error) {
    return serverError("分支操作失败", error, "GitBranchAPI");
  }
}
