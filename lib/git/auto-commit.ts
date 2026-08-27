// lib/git/auto-commit.ts
// 自动提交辅助函数 - 在数据变更 API 中调用

import { commitChange } from "./git-manager";

/** 确保环境变量启用版本控制（默认为 true） */
function isVersionControlEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DISABLE_GIT !== "true";
}

/**
 * 在数据变更后触发自动提交
 * @param projectName 项目名称（用于提交消息标识）
 * @param action 变更描述（如 "新增角色"、"更新词条"、"发送消息"）
 * @param detail 变更详情（如 "亚瑟·晨锋"）
 */
export async function autoCommit(
  projectName: string,
  action: string,
  detail?: string
): Promise<void> {
  if (!isVersionControlEnabled()) return;

  try {
    const message = detail
      ? `[${projectName}] ${action}: ${detail}`
      : `[${projectName}] ${action}`;
    await commitChange(message);
  } catch (error) {
    // 静默失败 — 不影响主流程
    if (process.env.NODE_ENV === "development") {
      console.warn("[Git AutoCommit]", (error as Error).message);
    }
  }
}
