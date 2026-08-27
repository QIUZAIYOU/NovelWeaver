// app/api/projects/[projectId]/chat-groups/[groupId]/chat/route.ts
// 群组对话 API — AI 自动生成多角色对话流

import { NextRequest } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { prisma } from "@/lib/prisma";
import { badRequest, serverError, handleJsonError } from "@/lib/api/errors";
import { validateExternalUrl } from "@/lib/api/url-security";
import { sanitizeModelConfig } from "@/lib/api/validation";

export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; groupId: string }> }
) {
  try {
    const { projectId, groupId } = await params;

    // 获取群组信息
    const group = await prisma.chatGroup.findUnique({
      where: { id: groupId, projectId },
    });
    if (!group) return badRequest("群组不存在");

    // 获取群组成员及其角色卡
    const members = await prisma.chatGroupMember.findMany({
      where: { groupId },
      include: {
        character: {
          select: {
            id: true, name: true, age: true,
            personality: true, appearance: true,
            backstory: true, persona: true, hiddenLore: true,
          },
        },
      },
    });

    if (members.length < 2) return badRequest("群组至少需要 2 个角色才能对话");

    // 解析请求体
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch (error) { return handleJsonError(error); }

    const userPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!userPrompt) return badRequest("请输入场景或话题");

    const modelConfig = sanitizeModelConfig(body.modelConfig);
    const apiBaseUrl = modelConfig?.apiBaseUrl || "";
    const apiKey = modelConfig?.apiKey || "";
    const modelName = modelConfig?.modelName || "deepseek-v4-flash";

    if (!apiBaseUrl) return badRequest("请先在设置中配置 API Base URL");
    const urlCheck = validateExternalUrl(apiBaseUrl);
    if (urlCheck !== true) return badRequest(urlCheck);

    const openai = createOpenAI({ baseURL: apiBaseUrl, apiKey: apiKey || "ollama" });

    // === 构建角色档案 ===
    let characterProfiles = "";
    for (const m of members) {
      const c = m.character;
      characterProfiles += `## ${c.name}\n`;
      if (c.age) characterProfiles += `年龄：${c.age}\n`;
      if (c.personality) characterProfiles += `性格：${c.personality}\n`;
      if (c.appearance) characterProfiles += `外貌：${c.appearance}\n`;
      if (c.backstory) characterProfiles += `背景：${c.backstory}\n`;
      if (c.persona) characterProfiles += `说话风格：${c.persona}\n`;
      characterProfiles += "\n";
    }

    // 获取群组历史消息（最近 10 条消息，用于上下文）
    const recentMessages = await prisma.message.findMany({
      where: { projectId, isPinned: false, role: "assistant" },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    let historyContext = "";
    if (recentMessages.length > 0) {
      historyContext = "\n最近的对话上下文：\n" +
        recentMessages.reverse().map((m) => {
          let name = "AI";
          try {
            const meta = JSON.parse(m.metadata || "{}");
            if (meta.characterName) name = meta.characterName;
          } catch {}
          return `[${name}] ${m.content.slice(0, 200)}`;
        }).join("\n");
    }

    // === 构建 System Prompt ===
    const systemPrompt = `# 群组对话模拟

你正在模拟群组「${group.name}」中的实时聊天。以下是群组成员及其设定：

${characterProfiles}

# 对话规则

1. **真实感**：模拟真人聊天，不要每个角色"依次发言"。对话应该像真实群聊一样——有人先说话，其他人回应、插话、提问、反驳或沉默。不是一次说一轮。
2. **互动模式**：
   - 有人提出观点 → 其他人回应（同意/反对/补充）
   - 可以有人直接**@角色名** 点名提问
   - 可以有两个人同时打字，但最终只有一人发出
   - 可以有人沉默不参与某段讨论
   - 可以有侧边对话（两人私聊穿插在群聊中）
3. **角色性格**：严格按性格设定发言。急性子抢先说，沉默者只在必要时开口。
4. **不要旁白**：不要写"他笑了笑说"，直接写对话内容。
5. **输出格式**：
   【角色名】对话内容

   示例（自然的群聊）：
   【伊利亚】@索菲亚 昨天那份报告你看完了吗？
   【索菲亚】刚看完，数据有问题。
   【伊利亚】什么问题？
   【哈维尔】等等，你们说的是哪份报告？
   【索菲亚】@哈维尔 TMS-L0234的分析报告。第三页的趋势线不对。
   【伊利亚】我重新算了一遍，结论是一样的。
   【索菲亚】那就是我多虑了。不过建议再测一次。
   【哈维尔】交给我吧。

6. **对话长度**：5-10 条消息，根据场景自然收束。
7. **推动剧情**：对话应该推进场景或揭示信息，不要停留在客套上。
8. **@提及**：角色之间可以互相 @，就像真实群聊那样点名或引用。
9. **结束自然**：对话应该有自然的结束感，可以是话题聊完、有人离开、或者约定下一步行动。
${group.topic ? `\n# 当前主题\n${group.topic}` : ""}
${historyContext}`;

    // 流式输出
    const result = streamText({
      model: openai.chat(modelName),
      system: systemPrompt,
      messages: [
        { role: "user", content: `场景/话题：${userPrompt}\n\n请让群组成员围绕这个话题展开对话。` },
      ],
      temperature: 0.8,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    return serverError("群组对话失败，请检查模型配置", error, "GroupChatAPI");
  }
}
