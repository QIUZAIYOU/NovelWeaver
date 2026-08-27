// lib/git/types.ts
// 版本管理相关类型定义

/** Git 提交记录 */
export interface GitCommit {
  /** 提交哈希 */
  oid: string;
  /** 提交消息 */
  message: string;
  /** 作者 */
  author: {
    name: string;
    email: string;
    timestamp: number;
  };
  /** 父提交哈希（首次提交为空） */
  parentOids: string[];
}

/** Git 分支信息 */
export interface GitBranch {
  /** 分支名 */
  name: string;
  /** 当前是否检出 */
  isCurrent: boolean;
  /** 最新提交哈希 */
  commitOid: string;
}

/** 文件变更 */
export interface GitFileDiff {
  /** 文件路径 */
  filePath: string;
  /** 变更类型：新增/修改/删除 */
  changeType: "add" | "modify" | "delete";
  /** 旧文件内容（Base64 编码） */
  oldContent: string;
  /** 新文件内容（Base64 编码） */
  newContent: string;
}

/** 版本历史查询参数 */
export interface GitLogOptions {
  /** 最大返回条数 */
  maxCount?: number;
  /** 起始提交（不填从 HEAD 开始） */
  startOid?: string;
}

/** Git 操作结果 */
export interface GitResult {
  success: boolean;
  error?: string;
}
