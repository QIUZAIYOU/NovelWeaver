// app/api/projects/[projectId]/delivery/auto-update/route.ts
// 交付台自动更新 API — 分析草稿内容，预览或应用角色/世界观更新

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError } from "@/lib/api/errors";
import { sanitizeModelConfig } from "@/lib/api/validation";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return notFound("项目不存在");

    const body = await request.json();
    const mode = (body.mode as string) || "preview";
    const messageId = body.messageId as string | undefined;

    // 读取模型配置
    const modelConfig = sanitizeModelConfig(body.modelConfig || undefined);
    const apiBaseUrl = modelConfig?.apiBaseUrl || "";
    const apiKey = modelConfig?.apiKey || "";
    const modelName = modelConfig?.modelName || "deepseek-v4-flash";

    if (!apiBaseUrl) return badRequest("请先在设置中配置 API Base URL");
    const openai = createOpenAI({ baseURL: apiBaseUrl, apiKey: apiKey || "ollama" });

    // ============================================================
    // auto-complete 模式：对指定条目调用 AI 补全详细信息
    // ============================================================
    if (mode === "autocomplete") {
      const targetType = body.targetType as string; // "character" | "lore"
      const targetName = body.targetName as string;
      const existingData = body.existingData as Record<string, string> | undefined;
      if (!targetType || !targetName) return badRequest("缺少 targetType 或 targetName");

      const systemPrompt = targetType === "character"
        ? `你是一位角色设计专家。根据已有的角色信息，补全缺失的角色详情。只输出 JSON 格式的补全数据，不要多余内容。`
        : `你是一位世界观设定专家。根据已有的词条信息，补全缺失的设定详情。只输出 JSON 格式的补全数据，不要多余内容。`;

      const prompt = targetType === "character"
        ? `角色名称：${targetName}\n已有信息：${JSON.stringify(existingData || {})}\n\n请补全角色信息中的空缺字段（年龄、外貌、性格、背景故事、说话风格），输出 JSON 对象：{"age":"...","appearance":"...","personality":"...","backstory":"...","persona":"..."}`
        : `词条标题：${targetName}\n已有内容：${JSON.stringify(existingData || {})}\n\n请补全词条内容，输出 JSON 对象：{"content":"...","category":"general|faction|location|event|item|magic|history|character"}`;

      const { text } = await generateText({
        model: openai.chat(modelName),
        system: systemPrompt,
        prompt,
        temperature: 0.3,
      });

      let completion: Record<string, string> = {};
      try {
        const cleaned = text.replace(/\x60{3}json\s*/gi, "").replace(/\x60{3}/g, "").trim();
        completion = JSON.parse(cleaned);
      } catch {
        return NextResponse.json({ success: false, error: "AI 补全结果解析失败" });
      }

      return NextResponse.json({ success: true, data: completion });
    }

    // ============================================================
    // 读取草稿 + 项目上下文
    // ============================================================
    if (!messageId || typeof messageId !== "string") return badRequest("缺少 messageId");

    const message = await prisma.message.findUnique({ where: { id: messageId, projectId } });
    if (!message) return notFound("消息不存在");
    if (message.reviewStatus !== "approved") return badRequest("只有已通过的草稿才能自动更新");

    const [characters, loreEntries] = await Promise.all([
      prisma.character.findMany({ where: { projectId }, take: 50 }),
      prisma.loreEntry.findMany({ where: { projectId }, take: 50 }),
    ]);

    let context = "";
    if (project.systemPrompt) context += `# 项目设定\n${project.systemPrompt}\n\n`;
    if (characters.length > 0) {
      context += "## 现有角色\n";
      for (const c of characters) {
        context += `- ${c.name}`;
        if (c.age) context += `（${c.age}）`;
        if (c.personality) context += `：${c.personality.slice(0, 100)}`;
        context += "\n";
      }
      context += "\n";
    }
    if (loreEntries.length > 0) {
      context += "## 现有世界观（以下词条已存在，请据此判断是需要更新还是新增）\n";
      for (const l of loreEntries) {
        context += `- 【${l.title}】（${l.category}）：${l.content.slice(0, 300)}\n`;
      }
      context += "\n";
    }

    // ============================================================
    // AI 分析
    // ============================================================
    const analysisPrompt = `你是一位资深叙事分析师。你的任务是分析一篇故事正文，从中提取需要**新增或更新**到项目设定中的角色信息和世界观信息。

当前项目设定（已存在的角色和词条，请据此判断操作）：
${context}

故事正文：
${message.content}

请严格按照以下 JSON 格式输出分析结果（只输出 JSON，不要其他内容）：

{
  "characters": [
    {
      "name": "角色名称",
      "action": "create" | "update",
      "age": "年龄信息（如果文中提到）",
      "personality": "性格描述",
      "appearance": "外貌描述",
      "backstory": "背景故事",
      "persona": "说话风格"
    }
  ],
  "lore": [
    {
      "title": "词条标题",
      "action": "create" | "update",
      "content": "词条内容",
      "category": "general" | "faction" | "location" | "event" | "item" | "magic" | "history" | "character"
    }
  ]
}

判断规则：
1. 如果故事正文中提到了与现有角色名称相同或明显是同一角色的新信息 → action 设为 "update"，输出需要补充/更新的字段
2. 如果故事正文中出现了全新的角色（不在现有列表中）→ action 设为 "create"
3. 如果故事正文中提到了与现有词条标题相关或同主题的信息 → action 设为 "update"，输出需要补充的新内容
4. 如果故事正文中出现了全新的世界观设定 → action 设为 "create"
5. **更新时只输出需要新增/补充的信息**，不要重复已有内容，系统会自动将新旧内容合并
6. **更新内容必须与已有设定一致**：如果故事正文中的描述与现有设定冲突，以现有设定为准，不要输出冲突信息
7. **时间线一致性**：如果角色背景故事中包含了明确的时间点（如"祖父于1994年去世"），角色的年龄必须与此吻合。不能忽略时间线信息生成不合理的年龄或背景
8. 未发现可更新或新增的内容时，对应数组为空
`;

    const { text } = await generateText({
      model: openai.chat(modelName),
      system: "你是一位专业的叙事分析 AI，只输出 JSON。",
      prompt: analysisPrompt,
      temperature: 0.1,
    });

    // 解析 JSON
    let analysis: { characters?: Array<Record<string, unknown>>; lore?: Array<Record<string, unknown>> };
    try {
      const cleaned = text.replace(/\x60{3}json\s*/gi, "").replace(/\x60{3}/g, "").trim();
      analysis = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({
        success: false,
        error: "AI 分析结果解析失败",
        raw: text,
      });
    }

    // ============================================================
    // preview 模式：只返回分析结果，不写数据库
    // ============================================================
    if (mode === "preview") {
      return NextResponse.json({
        success: true,
        analysis: {
          characters: (analysis.characters || []).map((c: Record<string, unknown>) => ({
            name: c.name,
            action: c.action,
            age: c.age || "",
            personality: c.personality || "",
            appearance: c.appearance || "",
            backstory: c.backstory || "",
            persona: c.persona || "",
          })),
          lore: (analysis.lore || []).map((l: Record<string, unknown>) => ({
            title: l.title,
            action: l.action || "create",
            content: l.content || "",
            category: l.category || "general",
          })),
        },
      });
    }

    // ============================================================
    // apply 模式：将前端传入的分析结果写入数据库
    // ============================================================
    if (mode === "apply") {
      const previewData = body.previewData as { characters?: Array<Record<string, unknown>>; lore?: Array<Record<string, unknown>> } | undefined;
      if (!previewData) return badRequest("缺少 previewData");

      const updateResults: { characters: string[]; lore: string[] } = {
        characters: [],
        lore: [],
      };

      // 更新角色
      if (previewData.characters && previewData.characters.length > 0) {
        for (const char of previewData.characters) {
          const name = char.name as string;
          if (!name) continue;
          const existing = await prisma.character.findFirst({ where: { projectId, name } });
          if (char.action === "update" && existing) {
            // 智能合并：将已有内容和新信息交由 AI 融合重写
            const updateData: Record<string, string> = {};
            const textFields = ["personality", "appearance", "backstory", "persona"] as const;
            for (const field of textFields) {
              const newVal = char[field] as string | undefined;
              if (newVal) {
                const existingVal = existing[field as keyof typeof existing] as string || "";
                if (existingVal && !existingVal.includes(newVal)) {
                  // 调用 AI 融合新旧内容
                  try {
                    const mergePrompt = `你是一位角色设定编辑。请将以下两段关于角色「${name}」的「${field}」描述合并为一段连贯、自然的文字。保留已有信息，将新信息自然地融入其中，不改变原意，不遗漏重要细节。

已有内容：
${existingVal}

新信息：
${newVal}

请直接输出合并后的完整内容，不要多余文字。`;
                    const mergeResult = await generateText({
                      model: openai.chat(modelName),
                      system: "你是一位专业的角色设定编辑助手，擅长合并文本。只输出合并结果，不要多余文字。",
                      prompt: mergePrompt,
                      temperature: 0.3,
                    });
                    updateData[field] = mergeResult.text.trim();
                  } catch {
                    // AI 合并失败时回退到追加
                    updateData[field] = `${existingVal}\n\n---\n\n${newVal}`;
                  }
                } else if (!existingVal) {
                  updateData[field] = newVal;
                }
              }
            }
            // 年龄直接覆盖
            if (char.age) updateData.age = String(char.age);
            if (Object.keys(updateData).length > 0) {
              await prisma.character.update({ where: { id: existing.id }, data: updateData });
              updateResults.characters.push(`更新角色：${name}`);
            }
          } else if (!existing) {
            await prisma.character.create({
              data: {
                projectId, name,
                age: String(char.age ?? ""),
                personality: String(char.personality ?? ""),
                appearance: String(char.appearance ?? ""),
                backstory: String(char.backstory ?? ""),
                persona: String(char.persona ?? ""),
                hiddenLore: "", tags: "[]",
              },
            });
            updateResults.characters.push(`创建角色：${name}`);
          }
        }
      }

      // 更新世界观
      if (previewData.lore && previewData.lore.length > 0) {
        for (const entry of previewData.lore) {
          const title = entry.title as string;
          if (!title) continue;
          const action = (entry.action as string) || "create";
          const existing = await prisma.loreEntry.findFirst({ where: { projectId, title } });
          if (action === "update" && existing) {
            // 智能合并词条内容
            const updateData: Record<string, string> = {};
            const newContent = entry.content as string | undefined;
            if (newContent) {
              const existingContent = existing.content || "";
              if (!existingContent.includes(newContent)) {
                try {
                  const mergePrompt = `你是一位世界观设定编辑。请将以下两段关于「${title}」的描述合并为一段连贯、自然的文字。保留已有信息，将新信息自然地融入其中，不改变原意，不遗漏重要细节。

已有内容：
${existingContent}

新信息：
${newContent}

请直接输出合并后的完整内容，不要多余文字。`;
                  const mergeResult = await generateText({
                    model: openai.chat(modelName),
                    system: "你是一位专业的设定编辑助手，擅长合并文本。只输出合并结果，不要多余文字。",
                    prompt: mergePrompt,
                    temperature: 0.3,
                  });
                  updateData.content = mergeResult.text.trim();
                } catch {
                  updateData.content = `${existingContent}\n\n---\n\n${newContent}`;
                }
              }
            }
            if (entry.category) updateData.category = String(entry.category);
            if (Object.keys(updateData).length > 0) {
              await prisma.loreEntry.update({ where: { id: existing.id }, data: updateData });
              updateResults.lore.push(`更新词条：${title}`);
            }
          } else if (!existing) {
            await prisma.loreEntry.create({
              data: {
                projectId, title,
                content: String(entry.content ?? ""),
                category: String(entry.category ?? "general"),
                keywords: "[]",
              },
            });
            updateResults.lore.push(`创建词条：${title}`);
          }
        }
      }

      return NextResponse.json({ success: true, updates: updateResults });
    }

    return badRequest("无效的 mode，必须是 preview、apply 或 autocomplete");
  } catch (error) {
    return serverError("自动更新失败", error, "DeliveryAutoUpdate");
  }
}
