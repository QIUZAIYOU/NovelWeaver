// app/api/projects/[projectId]/generate-keywords/route.ts
// 根据角色或世界观内容，AI 自动生成触发关键词/标签

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
    const content = body.content as string | undefined;
    const targetType = body.targetType as string; // "character" | "lore"
    const existingKeywords = body.existingKeywords as string[] | undefined;

    if (!content) return badRequest("缺少 content");
    if (!targetType) return badRequest("缺少 targetType");

    const modelConfig = sanitizeModelConfig(body.modelConfig || undefined);
    const apiBaseUrl = modelConfig?.apiBaseUrl || "";
    const apiKey = modelConfig?.apiKey || "";
    const modelName = modelConfig?.modelName || "deepseek-v4-flash";
    if (!apiBaseUrl) return badRequest("请先在设置中配置 API Base URL");

    const openai = createOpenAI({ baseURL: apiBaseUrl, apiKey: apiKey || "ollama" });

    const existingStr = existingKeywords && existingKeywords.length > 0
      ? `\n已有标签：${existingKeywords.join("、")}\n请补充新的标签，不要重复已有标签。`
      : "";

    const systemPrompt = targetType === "character"
      ? "你是一位标签分类专家。根据角色信息生成 3-8 个关键词标签，用于在对话中自动匹配该角色。标签应当是能代表角色特征的名词或短语（如：战士、冷峻、北方军团、火焰魔法）。注意根据背景故事中的时间点判断角色的合理年龄范围，不要生成与时间线矛盾的标签。只输出 JSON 数组，不要其他文字。"
      : "你是一位标签分类专家。根据世界观词条内容生成 3-8 个关键词标签，用于在对话中自动匹配该词条。标签应当是能代表词条核心内容的名词或短语（如：帝都、魔法议会、千年战争）。只输出 JSON 数组，不要其他文字。";

    const prompt = `请为以下${targetType === "character" ? "角色" : "世界观词条"}生成关键词标签：\n\n${content}${existingStr}\n\n输出格式：["标签1", "标签2", "标签3"]`;

    const { text } = await generateText({
      model: openai.chat(modelName),
      system: systemPrompt,
      prompt,
      temperature: 0.3,
    });

    let keywords: string[] = [];
    try {
      const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
      keywords = JSON.parse(cleaned);
      if (!Array.isArray(keywords)) keywords = [];
    } catch {
      // 尝试从文本中提取 [...]
      const match = text.match(/\[[\s\S]*?\]/);
      if (match) {
        try { keywords = JSON.parse(match[0]); } catch { keywords = []; }
      }
    }

    // 去重+过滤
    keywords = [...new Set(keywords)]
      .filter(k => typeof k === "string" && k.trim().length > 0)
      .map(k => k.trim())
      .slice(0, 20);

    return NextResponse.json({ success: true, data: keywords });
  } catch (error) {
    return serverError("生成关键词失败", error, "GenerateKeywordsAPI");
  }
}
