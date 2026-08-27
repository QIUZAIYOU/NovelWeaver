// app/api/projects/[projectId]/optimize-character/route.ts
// AI 优化角色信息 — 基于现有角色数据，AI 优化/补充各字段

import { NextRequest, NextResponse } from "next/server";
import { badRequest, serverError } from "@/lib/api/errors";
import { sanitizeModelConfig } from "@/lib/api/validation";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const character = body.character as Record<string, string> | undefined;
    if (!character || !character.name) return badRequest("缺少角色信息");

    const modelConfig = sanitizeModelConfig(body.modelConfig || undefined);
    const apiBaseUrl = modelConfig?.apiBaseUrl || "";
    const apiKey = modelConfig?.apiKey || "";
    const modelName = modelConfig?.modelName || "deepseek-v4-flash";
    if (!apiBaseUrl) return badRequest("请先在设置中配置 API Base URL");

    const openai = createOpenAI({ baseURL: apiBaseUrl, apiKey: apiKey || "ollama" });

    const systemPrompt = `你是一位角色优化专家。你的任务是在**不改变角色核心设定和已有信息**的前提下，优化和补充角色数据。

现有角色数据：
${JSON.stringify(character, null, 2)}

要求：
1. **保留所有已有信息**，不要删除或改变已有的设定
2. **优化表达**：让描述更生动、更具体、更有文学性
3. **补充合理细节**：如果某些字段较为单薄，可以在已有基础上补充合理细节，但不要编造与已有信息矛盾的内容
4. **时间线一致性**：如果背景故事中包含了时间点（如"1994年"），角色的年龄必须合理吻合
5. 输出 JSON 格式，字段与输入一致：name, age, appearance, personality, backstory, hiddenLore, persona
6. **只输出 JSON**，不要有其他文字`;

    const prompt = `请优化以下角色数据，保持核心设定不变，让描述更生动完整：\n\n${JSON.stringify(character, null, 2)}`;

    const { text } = await generateText({
      model: openai.chat(modelName),
      system: systemPrompt,
      prompt,
      temperature: 0.5,
    });

    let optimized: Record<string, string> = {};
    try {
      const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
      optimized = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ success: false, error: "AI 优化结果解析失败" });
    }

    return NextResponse.json({ success: true, data: optimized });
  } catch (error) {
    return serverError("优化角色失败", error, "OptimizeCharacterAPI");
  }
}
