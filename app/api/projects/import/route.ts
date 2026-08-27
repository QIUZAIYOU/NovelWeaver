// app/api/projects/import/route.ts
// 项目导入 API - 从 JSON 文件导入项目数据

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, serverError, handleJsonError } from "@/lib/api/errors";
import {
  sanitizeString,
  isValidProjectType,
  isValidMessageRole,
  isValidLoreCategory,
  sanitizeImportance,
  LIMITS,
} from "@/lib/api/validation";

/** 安全解析 JSON 字符串为数组 */
function safeParseJsonArray(value: unknown, fallback: string = "[]"): string {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return value;
      }
    } catch {
      // 不是合法 JSON
    }
  }
  return fallback;
}

/** POST /api/projects/import - 导入项目数据 */
export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch (error) {
      return handleJsonError(error);
    }

    // 验证顶层结构
    if (!body.project || typeof body.project !== "object") {
      return badRequest("无效的导入数据：缺少 project 字段");
    }

    const projectData = body.project as Record<string, unknown>;
    const projectName = sanitizeString(
      projectData.name,
      LIMITS.IMPORT_PROJECT_NAME.max,
      LIMITS.IMPORT_PROJECT_NAME.min
    );
    if (projectName === null) {
      return badRequest("无效的导入数据：项目名称无效");
    }

    // 限制导入数组大小
    const maxItems = LIMITS.IMPORT_ARRAY_MAX_LENGTH;
    const characters = Array.isArray(body.characters) ? body.characters.slice(0, maxItems) : [];
    const loreEntries = Array.isArray(body.loreEntries) ? body.loreEntries.slice(0, maxItems) : [];
    const memories = Array.isArray(body.memories) ? body.memories.slice(0, maxItems) : [];
    const messages = Array.isArray(body.messages) ? body.messages.slice(0, maxItems) : [];
    const worldStates = Array.isArray(body.worldStates) ? body.worldStates.slice(0, maxItems) : [];
    const outlines = Array.isArray(body.outlines) ? body.outlines.slice(0, maxItems) : [];
    const missions = Array.isArray(body.missions) ? body.missions.slice(0, maxItems) : [];
    const chatGroups = Array.isArray(body.chatGroups) ? body.chatGroups.slice(0, maxItems) : [];
    const customAgents = Array.isArray(body.customAgents) ? body.customAgents.slice(0, maxItems) : [];
    const mcpServers = Array.isArray(body.mcpServers) ? body.mcpServers.slice(0, maxItems) : [];
    const skills = Array.isArray(body.skills) ? body.skills.slice(0, maxItems) : [];
    const styleProfile = body.styleProfile && typeof body.styleProfile === "object" ? body.styleProfile as Record<string, unknown> : null;
    const errorArchives = Array.isArray(body.errorArchives) ? body.errorArchives.slice(0, maxItems) : [];

    // 在事务中执行所有导入操作
    const result = await prisma.$transaction(async (tx) => {
      // 1. 创建项目
      const project = await tx.project.create({
        data: {
          name: projectName,
          type: isValidProjectType(projectData.type) ? projectData.type : "novel",
          description: sanitizeString(projectData.description, LIMITS.IMPORT_FIELD.max) ?? "",
          systemPrompt: sanitizeString(projectData.systemPrompt, LIMITS.IMPORT_FIELD.max) ?? "",
        },
      });

      // 2. 导入角色
      for (const char of characters) {
        if (!char || typeof char !== "object") continue;
        const c = char as Record<string, unknown>;
        const charName = sanitizeString(c.name, LIMITS.CHARACTER_NAME.max, LIMITS.CHARACTER_NAME.min);
        if (!charName) continue;

        await tx.character.create({
          data: {
            projectId: project.id,
            name: charName,
            age: sanitizeString(c.age, LIMITS.CHARACTER_FIELD.max) ?? "",
            appearance: sanitizeString(c.appearance, LIMITS.CHARACTER_FIELD.max) ?? "",
            personality: sanitizeString(c.personality, LIMITS.CHARACTER_FIELD.max) ?? "",
            backstory: sanitizeString(c.backstory, LIMITS.CHARACTER_FIELD.max) ?? "",
            hiddenLore: sanitizeString(c.hiddenLore, LIMITS.CHARACTER_FIELD.max) ?? "",
            persona: sanitizeString(c.persona, LIMITS.CHARACTER_FIELD.max) ?? "",
            tags: safeParseJsonArray(c.tags),
          },
        });
      }

      // 3. 导入世界观词条
      for (const entry of loreEntries) {
        if (!entry || typeof entry !== "object") continue;
        const e = entry as Record<string, unknown>;
        const entryTitle = sanitizeString(e.title, LIMITS.LORE_TITLE.max, LIMITS.LORE_TITLE.min);
        if (!entryTitle) continue;

        await tx.loreEntry.create({
          data: {
            projectId: project.id,
            title: entryTitle,
            content: sanitizeString(e.content, LIMITS.LORE_CONTENT.max) ?? "",
            keywords: safeParseJsonArray(e.keywords),
            category: isValidLoreCategory(e.category) ? e.category : "general",
          },
        });
      }

      // 4. 导入记忆
      for (const mem of memories) {
        if (!mem || typeof mem !== "object") continue;
        const m = mem as Record<string, unknown>;
        const memContent = sanitizeString(m.content, LIMITS.MEMORY_CONTENT.max, LIMITS.MEMORY_CONTENT.min);
        if (!memContent) continue;

        await tx.memory.create({
          data: {
            projectId: project.id,
            content: memContent,
            tags: safeParseJsonArray(m.tags),
            importance: sanitizeImportance(m.importance),
          },
        });
      }

      // 5. 导入消息
      for (const msg of messages) {
        if (!msg || typeof msg !== "object") continue;
        const m = msg as Record<string, unknown>;

        const role = m.role as string;
        if (!isValidMessageRole(role)) continue;
        const msgContent = sanitizeString(m.content, LIMITS.MESSAGE_CONTENT.max, LIMITS.MESSAGE_CONTENT.min);
        if (!msgContent) continue;

        const createData: {
          projectId: string;
          role: string;
          content: string;
          isPinned: boolean;
          metadata?: string;
          createdAt?: Date;
        } = {
          projectId: project.id,
          role,
          content: msgContent,
          isPinned: typeof m.isPinned === "boolean" ? m.isPinned : false,
        };

        // metadata 必须是合法的 JSON 对象字符串
        if (typeof m.metadata === "string") {
          try {
            const parsed = JSON.parse(m.metadata);
            if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
              createData.metadata = m.metadata;
            }
          } catch {
            // 非法 metadata，使用默认值
          }
        }

        // createdAt 必须是合法的日期字符串
        if (typeof m.createdAt === "string") {
          const date = new Date(m.createdAt);
          if (!isNaN(date.getTime())) {
            createData.createdAt = date;
          }
        }

        await tx.message.create({ data: createData });
      }

      // 6. 导入世界状态
      for (const state of worldStates) {
        if (!state || typeof state !== "object") continue;
        const s = state as Record<string, unknown>;
        const stateKey = sanitizeString(s.key, LIMITS.WORLD_STATE_KEY.max, LIMITS.WORLD_STATE_KEY.min);
        if (!stateKey) continue;

        await tx.worldState.create({
          data: {
            projectId: project.id,
            key: stateKey,
            value: sanitizeString(s.value ?? "", LIMITS.WORLD_STATE_VALUE.max) ?? "",
            description: sanitizeString(s.description ?? "", LIMITS.WORLD_STATE_DESCRIPTION.max) ?? "",
          },
        });
      }

      // 7. 导入大纲
      for (const item of outlines) {
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        const title = sanitizeString(o.title, LIMITS.OUTLINE_TITLE.max, LIMITS.OUTLINE_TITLE.min);
        if (!title) continue;
        const validLevels = ["brainstorm", "master", "arc", "chapter"];
        const validStatuses = ["draft", "active", "completed", "abandoned"];
        await tx.outline.create({
          data: {
            projectId: project.id,
            level: typeof o.level === "string" && validLevels.includes(o.level) ? o.level : "chapter",
            title,
            content: sanitizeString(o.content ?? "", LIMITS.OUTLINE_CONTENT.max) ?? "",
            order: typeof o.order === "number" ? o.order : 0,
            status: typeof o.status === "string" && validStatuses.includes(o.status) ? o.status : "draft",
            tags: safeParseJsonArray(o.tags),
          },
        });
      }

      // 8. 导入档案
      for (const item of missions) {
        if (!item || typeof item !== "object") continue;
        const m = item as Record<string, unknown>;
        const title = sanitizeString(m.title, LIMITS.MISSION_TITLE.max, LIMITS.MISSION_TITLE.min);
        if (!title) continue;
        await tx.mission.create({
          data: {
            projectId: project.id,
            title,
            code: sanitizeString(m.code ?? "", LIMITS.MISSION_CODE.max) ?? "",
            type: typeof m.type === "string" ? m.type : "mission",
            content: sanitizeString(m.content ?? "", LIMITS.MISSION_CONTENT.max) ?? "",
            tags: safeParseJsonArray(m.tags),
          },
        });
      }

      // 9. 导入群组
      for (const item of chatGroups) {
        if (!item || typeof item !== "object") continue;
        const g = item as Record<string, unknown>;
        const name = sanitizeString(g.name, 200, 1);
        if (!name) continue;
        const group = await tx.chatGroup.create({
          data: {
            projectId: project.id,
            name,
            description: sanitizeString(g.description ?? "", 5000) ?? "",
            topic: sanitizeString(g.topic ?? "", 5000) ?? "",
          },
        });
        // 导入成员（通过角色名匹配）
        if (Array.isArray(g.members)) {
          for (const mem of g.members.slice(0, 20)) {
            if (!mem || typeof mem !== "object") continue;
            const mbr = mem as Record<string, unknown>;
            if (typeof mbr.characterName !== "string") continue;
            const char = await tx.character.findFirst({
              where: { projectId: project.id, name: mbr.characterName },
            });
            if (char) {
              await tx.chatGroupMember.create({
                data: {
                  groupId: group.id,
                  characterId: char.id,
                  role: typeof mbr.role === "string" ? mbr.role : "member",
                },
              }).catch(() => {});
            }
          }
        }
      }

      // 10. 导入自定义智能体
      for (const item of customAgents) {
        if (!item || typeof item !== "object") continue;
        const a = item as Record<string, unknown>;
        const name = sanitizeString(a.name, 200, 1);
        if (!name) continue;
        await tx.customAgent.create({
          data: {
            projectId: project.id,
            name,
            type: typeof a.type === "string" ? a.type : "custom",
            emoji: typeof a.emoji === "string" ? a.emoji : "🤖",
            systemPrompt: sanitizeString(a.systemPrompt ?? "", LIMITS.SYSTEM_PROMPT.max) ?? "",
            skills: safeParseJsonArray(a.skills),
            mcpTools: safeParseJsonArray(a.mcpTools),
            loreIds: safeParseJsonArray(a.loreIds),
            order: typeof a.order === "number" ? a.order : 0,
          },
        });
      }

      // 11. 导入 MCP 服务器
      for (const item of mcpServers) {
        if (!item || typeof item !== "object") continue;
        const s = item as Record<string, unknown>;
        const name = sanitizeString(s.name, 200, 1);
        if (!name) continue;
        await tx.mcpServer.create({
          data: {
            projectId: project.id,
            name,
            transport: typeof s.transport === "string" ? s.transport : "stdio",
            command: typeof s.command === "string" ? s.command : "",
            args: safeParseJsonArray(s.args),
            url: typeof s.url === "string" ? s.url : "",
            tools: safeParseJsonArray(s.tools),
          },
        });
      }

      // 12. 导入技能
      for (const item of skills) {
        if (!item || typeof item !== "object") continue;
        const s = item as Record<string, unknown>;
        const name = sanitizeString(s.name, 200, 1);
        if (!name) continue;
        await tx.skill.create({
          data: {
            projectId: project.id,
            name,
            description: sanitizeString(s.description ?? "", 5000) ?? "",
            category: typeof s.category === "string" ? s.category : "general",
            prompt: sanitizeString(s.prompt ?? "", LIMITS.SYSTEM_PROMPT.max) ?? "",
          },
        });
      }

      // 13. 导入文风档案
      if (styleProfile) {
        await tx.styleProfile.create({
          data: {
            projectId: project.id,
            fingerprint: typeof styleProfile.fingerprint === "string" ? styleProfile.fingerprint : "",
            constraints: typeof styleProfile.constraints === "string" ? styleProfile.constraints : "",
            styleGuide: typeof styleProfile.styleGuide === "string" ? styleProfile.styleGuide : "",
            sampleText: typeof styleProfile.sampleText === "string" ? styleProfile.sampleText : "",
          },
        }).catch(() => {}); // 项目已有一个文风档案时跳过
      }

      // 14. 导入错误沉淀
      for (const item of errorArchives) {
        if (!item || typeof item !== "object") continue;
        const e = item as Record<string, unknown>;
        if (typeof e.content !== "string" || !e.content.trim()) continue;
        const validCategories = ["ooc", "logic", "style", "fact", "other"];
        const validSeverities = ["minor", "major", "critical"];
        await tx.errorArchive.create({
          data: {
            projectId: project.id,
            category: typeof e.category === "string" && validCategories.includes(e.category) ? e.category : "other",
            content: sanitizeString(e.content, 10000) ?? "",
            context: typeof e.context === "string" ? e.context : "",
            severity: typeof e.severity === "string" && validSeverities.includes(e.severity) ? e.severity : "minor",
          },
        });
      }

      return project;
    });

    return NextResponse.json({
      success: true,
      data: { id: result.id, name: result.name },
      message: "项目导入成功",
    });
  } catch (error) {
    return serverError("导入项目失败", error, "ImportAPI");
  }
}
