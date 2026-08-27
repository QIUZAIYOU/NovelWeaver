// lib/git/git-manager.ts
// 核心 Git 操作模块 - 基于 isomorphic-git + Node.js fs
// 使用独立的 Git 仓库 (prisma/.git) 追踪数据文件，与项目源码 Git 隔离

import fs from "node:fs";
import path from "node:path";
import * as git from "isomorphic-git";
import type { GitCommit, GitBranch, GitLogOptions } from "./types";

/** 数据库文件所在目录（相对于项目根目录） */
const DB_DIR = "prisma";
/** 数据库文件名 */
const DB_FILE = "novelweaver.db";
/** Git 仓库目录（独立于项目的 .git，避免冲突） */
const GIT_SUBDIR = path.join(DB_DIR, ".git");

/** 项目根目录 */
function getRootDir(): string {
  return process.cwd();
}

/** 数据文件目录（Git 工作树） */
function getWorkDir(): string {
  return path.join(getRootDir(), DB_DIR);
}

/** 数据文件绝对路径 */
function getDbPath(): string {
  return path.join(getRootDir(), DB_DIR, DB_FILE);
}

/** Git 仓库目录（数据专用，独立于项目源码 git） */
function getGitDir(): string {
  return path.join(getRootDir(), GIT_SUBDIR);
}

/**
 * 确保 Git 仓库已初始化
 * 在 prisma/.git 下创建独立的 Git 仓库
 */
export async function ensureRepo(): Promise<void> {
  const gitdir = getGitDir();
  const dir = getWorkDir();

  // 数据专用 git 已存在则跳过
  if (fs.existsSync(gitdir)) return;

  // 确保 prisma 目录存在
  const parentDir = path.dirname(gitdir);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  await git.init({ fs, dir, gitdir });

  // 检查数据文件是否存在，存在则创建初始提交
  if (fs.existsSync(getDbPath())) {
    await git.add({ fs, dir, gitdir, filepath: DB_FILE });
    await git.commit({
      fs,
      dir,
      gitdir,
      message: "🎬 初始提交 - NovelWeaver 数据仓库启动",
      author: { name: "NovelWeaver", email: "system@novelweaver.local" },
    });
  }
}

/**
 * 提交当前数据变更
 * @param message 提交消息
 * @returns 提交哈希
 */
export async function commitChange(message: string): Promise<string> {
  await ensureRepo();
  const dir = getWorkDir();
  const gitdir = getGitDir();

  if (!fs.existsSync(getDbPath())) {
    throw new Error("数据库文件不存在，无法提交");
  }

  // 暂存变更
  await git.add({ fs, dir, gitdir, filepath: DB_FILE });

  // 检查是否有变更需要提交
  const status = await git.status({ fs, dir, gitdir, filepath: DB_FILE });
  if (status === "unmodified") {
    // 无变更，返回当前 HEAD
    try {
      return await git.resolveRef({ fs, dir, gitdir, ref: "HEAD" });
    } catch {
      // 没有 HEAD（空仓库），做首次提交
    }
  }

  const oid = await git.commit({
    fs,
    dir,
    gitdir,
    message,
    author: { name: "NovelWeaver", email: "system@novelweaver.local" },
  });

  return oid;
}

/**
 * 获取提交历史
 */
export async function getHistory(options: GitLogOptions = {}): Promise<GitCommit[]> {
  await ensureRepo();
  const dir = getWorkDir();
  const gitdir = getGitDir();

  let commits;
  try {
    commits = await git.log({
      fs,
      dir,
      gitdir,
      ref: options.startOid || "HEAD",
      depth: options.maxCount ?? 50,
    });
  } catch {
    // 还没有任何提交（空仓库）
    return [];
  }

  return commits.map((c) => ({
    oid: c.oid,
    message: c.commit.message,
    author: {
      name: c.commit.author.name ?? "Unknown",
      email: c.commit.author.email ?? "",
      timestamp: c.commit.author.timestamp,
    },
    parentOids: c.commit.parent,
  }));
}

/**
 * 获取分支列表
 */
export async function getBranches(): Promise<GitBranch[]> {
  await ensureRepo();
  const dir = getWorkDir();
  const gitdir = getGitDir();

  let branches: string[];
  try {
    branches = await git.listBranches({ fs, dir, gitdir });
  } catch {
    return [];
  }

  let currentBranch: string;
  try {
    currentBranch = (await git.currentBranch({ fs, dir, gitdir })) ?? "main";
  } catch {
    currentBranch = "main";
  }

  const result: GitBranch[] = [];
  for (const name of branches) {
    try {
      const oid = await git.resolveRef({ fs, dir, gitdir, ref: name });
      result.push({
        name,
        isCurrent: name === currentBranch,
        commitOid: oid,
      });
    } catch {
      // 跳过无效分支
    }
  }

  return result;
}

/**
 * 回滚到指定提交
 * 会先自动创建当前状态的备份提交，再将数据文件恢复到目标版本
 */
export async function rollbackTo(targetOid: string): Promise<string> {
  await ensureRepo();
  const dir = getWorkDir();
  const gitdir = getGitDir();

  // 1. 先自动备份当前状态
  const backupMsg = `🔄 回滚前自动备份 - ${new Date().toLocaleString("zh-CN")}`;
  await commitChange(backupMsg);

  // 2. 读取目标提交中的数据文件
  const blob = await git.readBlob({
    fs,
    dir,
    gitdir,
    oid: targetOid,
    filepath: DB_FILE,
  });

  // 3. 覆盖当前数据文件
  fs.writeFileSync(getDbPath(), Buffer.from(blob.blob));

  // 4. 提交回滚操作（先把文件暂存，确保 commit 写入最新内容）
  await git.add({ fs, dir, gitdir, filepath: DB_FILE });
  const rollbackOid = await git.commit({
    fs,
    dir,
    gitdir,
    message: `⏪ 回滚到 ${targetOid.slice(0, 7)} - ${new Date().toLocaleString("zh-CN")}`,
    author: { name: "NovelWeaver", email: "system@novelweaver.local" },
  });

  return rollbackOid;
}

/**
 * 检查是否有未提交的变更
 */
export async function hasUncommittedChanges(): Promise<boolean> {
  if (!fs.existsSync(getDbPath()) || !fs.existsSync(getGitDir())) return false;

  const dir = getWorkDir();
  const gitdir = getGitDir();

  try {
    const status = await git.status({ fs, dir, gitdir, filepath: DB_FILE });
    return status !== "unmodified";
  } catch {
    return false;
  }
}

/**
 * 获取当前 HEAD 的提交哈希
 */
export async function getCurrentOid(): Promise<string | null> {
  if (!fs.existsSync(getGitDir())) return null;

  try {
    return await git.resolveRef({ fs, dir: getWorkDir(), gitdir: getGitDir(), ref: "HEAD" });
  } catch {
    return null;
  }
}
