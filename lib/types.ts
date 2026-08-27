// lib/types.ts
// 全局 TypeScript 类型定义

// ============================================================
// 项目相关
// ============================================================

/** 项目类型 */
export type ProjectType = "novel" | "trpg";

/** 项目 */
export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  description: string;
  systemPrompt: string;
  coverImage: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 创建项目的输入 */
export interface CreateProjectInput {
  name: string;
  type: ProjectType;
  description?: string;
  systemPrompt?: string;
}

// ============================================================
// 角色相关
// ============================================================

/** 角色 */
export interface Character {
  id: string;
  projectId: string;
  name: string;
  age: string;
  appearance: string;
  personality: string;
  backstory: string;
  hiddenLore: string;
  persona: string;
  avatarUrl: string | null;
  tags: string[]; // JSON 解析后
  createdAt: string;
  updatedAt: string;
}

/** 创建/更新角色的输入 */
export interface CharacterInput {
  name: string;
  age?: string;
  appearance?: string;
  personality?: string;
  backstory?: string;
  hiddenLore?: string;
  persona?: string;
  avatarUrl?: string;
  tags?: string[];
}

// ============================================================
// 知识库相关
// ============================================================

/** 知识库词条分类 */
export type LoreCategory =
  | "general"
  | "geography"
  | "history"
  | "magic"
  | "character"
  | "event"
  | "faction"
  | "item"
  | "other";

/** 知识库词条 */
export interface LoreEntry {
  id: string;
  projectId: string;
  title: string;
  content: string;
  keywords: string[]; // JSON 解析后
  category: LoreCategory;
  createdAt: string;
  updatedAt: string;
}

/** 创建/更新词条的输入 */
export interface LoreEntryInput {
  title: string;
  content?: string;
  keywords?: string[];
  category?: LoreCategory;
}

// ============================================================
// 记忆相关
// ============================================================

/** 核心记忆 */
export interface Memory {
  id: string;
  projectId: string;
  content: string;
  sourceMessageId: string | null;
  tags: string[]; // JSON 解析后
  importance: number; // 1-10
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// 消息相关
// ============================================================

/** 消息角色 */
export type MessageRole = "user" | "assistant" | "system";

/** 审核状态 */
export type ReviewStatus = "none" | "pending" | "approved" | "rejected";

/** 对话消息 */
export interface Message {
  id: string;
  projectId: string;
  role: MessageRole;
  content: string;
  isPinned: boolean;
  isDraft: boolean;
  reviewStatus: ReviewStatus;
  reviewComment: string;
  metadata: Record<string, unknown>; // JSON 解析后
  createdAt: string;
}

// ============================================================
// 世界状态相关
// ============================================================

/** 世界状态变量 */
export interface WorldState {
  id: string;
  projectId: string;
  key: string;
  value: string;
  description: string;
  updatedAt: string;
}

/** 创建/更新世界状态的输入 */
export interface WorldStateInput {
  key: string;
  value: string;
  description?: string;
}

// ============================================================
// API 响应相关
// ============================================================

/** 统一 API 响应格式 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/** 分页响应 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ============================================================
// 统计相关
// ============================================================

/** 项目统计数据 */
export interface ProjectStats {
  totalCharacters: number;
  totalLoreEntries: number;
  totalMemories: number;
  totalMessages: number;
  totalWords: number;
}

// ============================================================
// 大纲相关
// ============================================================

/** 大纲层级 */
export type OutlineLevel = "brainstorm" | "master" | "arc" | "chapter";

/** 大纲状态 */
export type OutlineStatus = "draft" | "active" | "completed" | "abandoned";

/** 大纲 */
export interface Outline {
  id: string;
  projectId: string;
  level: OutlineLevel;
  title: string;
  content: string;       // Markdown
  order: number;
  parentId: string | null;
  status: OutlineStatus;
  tags: string[];        // JSON 解析后
  createdAt: string;
  updatedAt: string;
}

/** 创建/更新大纲的输入 */
export interface OutlineInput {
  level: OutlineLevel;
  title: string;
  content?: string;
  order?: number;
  parentId?: string | null;
  status?: OutlineStatus;
  tags?: string[];
}

// ============================================================
// 档案/任务相关
// ============================================================

/** 档案类型 */
export type MissionType = "mission" | "report" | "interview" | "log" | "assessment" | "item" | "event";
/** 档案状态 */
export type MissionStatus = "draft" | "review" | "archived" | "sealed";
/** 安全等级 */
export type Classification = "internal" | "confidential" | "secret" | "cosmic";

/** 档案/任务 */
export interface Mission {
  id: string;
  projectId: string;
  title: string;
  code: string;
  type: MissionType;
  content: string;
  status: MissionStatus;
  classification: Classification;
  writerId: string | null;
  reviewerId: string | null;
  reviewComment: string;
  parentId: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** 创建/更新档案的输入 */
export interface MissionInput {
  title: string;
  code?: string;
  type?: MissionType;
  content?: string;
  status?: MissionStatus;
  classification?: Classification;
  writerId?: string | null;
  reviewerId?: string | null;
  reviewComment?: string;
  parentId?: string | null;
  tags?: string[];
}

// ============================================================
// 群组聊天相关
// ============================================================

/** 聊天群组 */
export interface ChatGroup {
  id: string;
  projectId: string;
  name: string;
  avatar: string;
  description: string;
  topic: string;
  createdAt: string;
  updatedAt: string;
  members?: ChatGroupMember[];
  _count?: { members: number };
}

/** 群组成员 */
export interface ChatGroupMember {
  id: string;
  groupId: string;
  characterId: string;
  role: "leader" | "member" | "observer";
  joinedAt: string;
  character?: { id: string; name: string };
}

// ============================================================
// 文风档案相关
// ============================================================

/** 文风档案 */
export interface StyleProfile {
  id: string;
  projectId: string;
  fingerprint: string;
  constraints: string;
  styleGuide: string;
  sampleText: string;
  updatedAt: string;
}

/** 更新文风档案的输入 */
export interface StyleProfileInput {
  fingerprint?: string;
  constraints?: string;
  styleGuide?: string;
  sampleText?: string;
}

// ============================================================
// 错误沉淀相关
// ============================================================

/** 错误分类 */
export type ErrorCategory = "ooc" | "logic" | "style" | "fact" | "other";
/** 错误严重程度 */
export type ErrorSeverity = "minor" | "major" | "critical";

/** 错误沉淀记录 */
export interface ErrorArchive {
  id: string;
  projectId: string;
  category: ErrorCategory;
  content: string;
  context: string;
  severity: ErrorSeverity;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 创建错误记录的输入 */
export interface ErrorArchiveInput {
  category: ErrorCategory;
  content: string;
  context?: string;
  severity?: ErrorSeverity;
}
