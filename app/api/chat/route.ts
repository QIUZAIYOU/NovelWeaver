// app/api/chat/route.ts
// 流式对话 API - 使用 Vercel AI SDK，集成 DeepSeek 优化

import { NextRequest } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { prisma } from "@/lib/prisma";
import { badRequest, serverError, handleJsonError } from "@/lib/api/errors";
import { validateExternalUrl } from "@/lib/api/url-security";
import {
  sanitizeModelConfig,
  isValidMessageRole,
  LIMITS,
} from "@/lib/api/validation";

/** 最大生成时间（秒） */
export const maxDuration = 120;

/** DeepSeek 成本估算（每百万 tokens，美元） */
const DEEPSEEK_COST = {
  "deepseek-v4-flash": { inputCacheMiss: 0.14, inputCacheHit: 0.0028, output: 0.28 },
  "deepseek-v4-pro": { inputCacheMiss: 0.435, inputCacheHit: 0.003625, output: 0.87 },
} as const;
const DEFAULT_COST = { inputCacheMiss: 0.5, inputCacheHit: 0.0028, output: 1.5 };

function getPricing(modelName: string) {
  const base = modelName.toLowerCase();
  if (base.includes("v4-flash") || base.includes("flash")) return DEEPSEEK_COST["deepseek-v4-flash"];
  if (base.includes("v4-pro") || base.includes("pro")) return DEEPSEEK_COST["deepseek-v4-pro"];
  return DEFAULT_COST;
}

/** POST /api/chat - 流式对话 */
export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch (error) {
      return handleJsonError(error);
    }

    const rawMessages = body.messages;
    const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
    const targetCharacterId = typeof body.characterId === "string" ? body.characterId : undefined;

    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return badRequest("消息不能为空");
    }

    // 校验消息格式
    const messages: Array<{ role: string; content: string }> = [];
    for (const m of rawMessages) {
      if (!m || typeof m !== "object") continue;
      const msg = m as Record<string, unknown>;
      const role = msg.role;
      const content = msg.content;
      if (!isValidMessageRole(role)) continue;
      if (typeof content !== "string" || !content.trim()) continue;
      const validContent = content.slice(0, LIMITS.MESSAGE_CONTENT.max);
      messages.push({ role, content: validContent });
    }

    if (messages.length === 0) {
      return badRequest("没有有效的消息内容");
    }

    // 获取模型配置
    const modelConfig = sanitizeModelConfig(body.modelConfig);
    const apiBaseUrl = modelConfig?.apiBaseUrl || "";
    const apiKey = modelConfig?.apiKey || "";
    const modelName = modelConfig?.modelName || "deepseek-v4-flash";
    const temperature = modelConfig?.temperature ?? 0.7;
    const topP = modelConfig?.topP ?? 0.9;
    const rawConfig = body.modelConfig as Record<string, unknown> | undefined;
    const effort: "low" | "medium" | "high" | "max" =
      (typeof rawConfig?.effort === "string" &&
       ["low", "medium", "high", "max"].includes(rawConfig.effort))
        ? rawConfig.effort as "low" | "medium" | "high" | "max"
        : "max";

    // 检查 NEEDS_PRO 标记：如果用户消息包含该标记自动切换 pro 模型
    const lastMsg = messages[messages.length - 1];
    const needsPro = lastMsg?.content?.includes("<<<NEEDS_PRO>>>");
    const actualModel = needsPro ? "deepseek-v4-pro" : modelName;

    if (!apiBaseUrl) {
      return badRequest("请先在设置中配置 API Base URL");
    }

    const urlCheck = validateExternalUrl(apiBaseUrl);
    if (urlCheck !== true) {
      return badRequest(urlCheck);
    }

    const openai = createOpenAI({
      baseURL: apiBaseUrl,
      apiKey: apiKey || "ollama",
    });

    // ============================================================
    // DeepSeek 优化的 System Prompt 结构
    // 遵循 Cache-First 原则：
    //   IMMUTABLE PREFIX — 项目设定/角色信息（会话中不变）
    //   APPEND-ONLY LOG  — 历史消息（单调增长，保留前缀缓存）
    // ============================================================

    let systemPrompt = "";

    // === IMMUTABLE PREFIX 开始（会话中不再改变） ===

    // 1. 角色定义（DeepSeek 缓存友好格式）
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (project?.systemPrompt) {
        systemPrompt += `# 项目设定\n${project.systemPrompt}\n\n`;
      }

      // 2. 角色信息（作为不可变前缀的一部分）
      const characters = await prisma.character.findMany({
        where: { projectId },
        take: 10,
      });

      if (characters.length > 0) {
        systemPrompt += `# 角色信息\n`;
        for (const c of characters) {
          systemPrompt += `\n## ${c.name}\n`;
          if (c.personality) systemPrompt += `性格：${c.personality}\n`;
          if (c.appearance) systemPrompt += `外貌：${c.appearance}\n`;
          if (c.backstory) systemPrompt += `背景：${c.backstory}\n`;
          if (c.persona) systemPrompt += `说话风格：${c.persona}\n`;
          if (c.hiddenLore) systemPrompt += `[隐藏设定] ${c.hiddenLore}\n`;
        }
      }

      // 3. 世界状态
      const worldStates = await prisma.worldState.findMany({
        where: { projectId },
        take: 20,
      });

      if (worldStates.length > 0) {
        systemPrompt += `\n# 世界状态\n`;
        for (const s of worldStates) {
          systemPrompt += `- ${s.key}: ${s.value}${s.description ? ` (${s.description})` : ""}\n`;
        }
      }

      // 4. 文风约束
      const styleProfile = await prisma.styleProfile.findUnique({
        where: { projectId },
      });
      if (styleProfile && (styleProfile.fingerprint || styleProfile.constraints || styleProfile.styleGuide || styleProfile.sampleText)) {
        systemPrompt += `\n# 文风约束\n`;
        if (styleProfile.constraints) systemPrompt += `避免以下写法：\n${styleProfile.constraints}\n\n`;
        if (styleProfile.styleGuide) systemPrompt += `推荐以下风格：\n${styleProfile.styleGuide}\n\n`;
        if (styleProfile.sampleText) systemPrompt += `参考文本风格：\n${styleProfile.sampleText.slice(0, 1000)}\n`;
      }

      // 5. 未解决错误记录（作为改进约束）
      const unresolvedErrors = await prisma.errorArchive.findMany({
        where: { projectId, resolved: false },
        take: 5,
        orderBy: { createdAt: "desc" },
      });
      if (unresolvedErrors.length > 0) {
        systemPrompt += `\n# 需要避免的历史问题\n`;
        for (const err of unresolvedErrors) {
          systemPrompt += `- [${err.severity}] ${err.content.slice(0, 200)}`;
          if (err.context) systemPrompt += `（上下文：${err.context.slice(0, 100)}）`;
          systemPrompt += `\n`;
        }
      }

      // 6. 全局提示词
      const globalPrompt = modelConfig?.systemPrompt || "";
      if (globalPrompt) {
        systemPrompt += `\n# 创作指导\n${globalPrompt}\n`;
      }
    }

    // === IMMUTABLE PREFIX 结束 ===

    // 5. 角色扮演指令（相当于 APPEND-ONLY 的当前指令）
    if (targetCharacterId && projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });
      const allChars = await prisma.character.findMany({
        where: { projectId },
        take: 10,
      });
      const targetChar = allChars.find((c) => c.id === targetCharacterId);
      if (targetChar) {
        systemPrompt += `\n# 角色扮演指令\n`;
        systemPrompt += `你现在扮演「${targetChar.name}」。\n`;
        systemPrompt += `- 以第一人称「我」的身份回应用户\n`;
        systemPrompt += `- 严格遵循该角色的性格和说话风格\n`;
        systemPrompt += `- 不要跳出角色身份\n`;
        systemPrompt += `- 动作描写请用 *斜体*\n`;
        if (targetChar.persona) systemPrompt += `- 说话风格参考：${targetChar.persona}\n`;
        systemPrompt += `\n现在开始对话。\n`;
      }
    }

    // === APPEND-ONLY LOG 部分：由 Vercel AI SDK 的 messages 承载 ===

    // 6. 全局推理/输出规范
    systemPrompt += `\n# 输出规范\n`;
    systemPrompt += `- 回复使用中文\n`;
    systemPrompt += `- 如任务需要更强推理能力，回复时首行添加 <<<NEEDS_PRO>>> 标记\n`;
    systemPrompt += `- 保持创作连贯性，参考已有设定\n`;

    // 调用 AI — 传递 DeepSeek reasoning effort
    const result = streamText({
      model: openai.chat(actualModel),
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
      temperature,
      topP,
      providerOptions: {
        openai: {
          reasoningEffort: effort,
        },
      } as any,
    });

    // 获取原始流式响应
    const streamResponse = result.toTextStreamResponse();

    // 包装响应流，在流结束后追加 token 统计元数据供前端读取
    const wrappedStream = new ReadableStream({
      async start(controller) {
        const reader = streamResponse.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } finally {
          reader.releaseLock();
        }

        // 流结束后，附加 token 统计 JSON（HTML 注释形式，前端可安全解析）
        try {
          const usage = await result.usage;
          const pricing = getPricing(actualModel);
          const inp = usage?.inputTokens ?? 0;
          const outp = usage?.outputTokens ?? 0;
          const cached = (usage as unknown as Record<string, number> | undefined)?.cachedInputTokens ?? 0;
          const inputCost = (inp - cached) / 1_000_000 * pricing.inputCacheMiss;
          const outputCost = outp / 1_000_000 * pricing.output;
          const cachedCost = cached / 1_000_000 * pricing.inputCacheHit;
          const totalCost = inputCost + outputCost + cachedCost;
          const statsJson = JSON.stringify({
            model: actualModel,
            inputTokens: inp,
            outputTokens: outp,
            cachedInputTokens: cached,
            cost: Math.round(totalCost * 1_000_000) / 1_000_000,
          });
          controller.enqueue(
            new TextEncoder().encode(`\n<!--__STORYFORGE_STATS__${statsJson}__-->\n`)
          );
        } catch {
          // usage 不可用时静默跳过
        }
        controller.close();
      },
    });

    return new Response(wrappedStream, {
      headers: streamResponse.headers,
    });
  } catch (error) {
    return serverError("对话请求失败，请检查模型配置", error, "ChatAPI");
  }
}
