// app/api/projects/[projectId]/agents/route.ts
// 多智能体协作 API — SSE 流式输出，支持智能调度 + 实时状态查看 + 反馈循环

import { NextRequest } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { badRequest, serverError, handleJsonError } from "@/lib/api/errors";
import { validateExternalUrl } from "@/lib/api/url-security";
import { sanitizeModelConfig } from "@/lib/api/validation";
import { matchLoreEntries, formatLoreContext } from "@/lib/ai/lore-matcher";
import { retrieveRelevantMemories, formatMemoryContext } from "@/lib/ai/memory-retriever";
import { AgentHooks } from "@/lib/ai/agent-hooks";

export const maxDuration = 300;

// ============================================================
// 定价与 Token 估算
// ============================================================
const PRICING = {
  "v4-flash": { inputCacheMiss: 0.14, inputCacheHit: 0.0028, output: 0.28 },
  "v4-pro": { inputCacheMiss: 0.435, inputCacheHit: 0.003625, output: 0.87 },
} as const;

/** 估算 tokens 数（字符数 × 0.4 ≈ token 数） */
/** 计算费用 */
function calcCost(
  inputTokens: number, outputTokens: number,
  modelName: string,
): { inputTokens: number; outputTokens: number; cachedTokens: number; cost: number } {
  const pricing = modelName.toLowerCase().includes("pro")
    ? PRICING["v4-pro"] : PRICING["v4-flash"];
  // 假设缓存命中率约 80%
  const cachedTokens = Math.ceil(inputTokens * 0.8);
  const cost =
    (inputTokens - cachedTokens) / 1_000_000 * pricing.inputCacheMiss +
    cachedTokens / 1_000_000 * pricing.inputCacheHit +
    outputTokens / 1_000_000 * pricing.output;
  return { inputTokens, outputTokens, cachedTokens, cost };
}

// ============================================================
// 内置智能体定义
// ============================================================

/** 用实际值替换模板中的 ${var} 占位符 */
function applyTemplate(template: string | undefined, vars: Record<string, string>, fallback: () => string): string {
  if (!template) return fallback();
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\$\\{${key}\\}`, "g"), val);
  }
  return result;
}

/** 生成调度统领提示词 — 动态可用智能体列表 */
function buildDispatcherSystem(ctx: string, pipelineAgents: { key: string; name: string; role?: string }[], groupInfo?: string, template?: string): string {
  const agentList = pipelineAgents
    .map(a => `- key="${a.key}" → 名称: ${a.name}${a.role ? `（角色：${a.role === "writer" ? "创作" : a.role === "reviewer" ? "审查" : a.role === "editor" ? "润色" : a.role === "planner" ? "调度" : "自定义"}）` : ""}`)
    .join("\n");

  // 找第一个非 dispatcher 的 agent 作为示例
  const firstAgent = pipelineAgents.find(a => !a.key.includes("dispatcher") && !a.name.includes("调度"));
  const exampleKey = firstAgent?.key || pipelineAgents[0]?.key || "agent";
  const exampleName = firstAgent?.name || "第一步执行的智能体";

  // 使用自定义模板（如果提供），否则使用硬编码默认值
  if (template) {
    return applyTemplate(template, {
      ctx, agentList, groupInfo: groupInfo || "",
      exampleKey, exampleName,
    }, () => "");
  }

  return `你是一位任务调度统领（Dispatcher）。当前项目设定：${ctx}

你的职责是分析用户的任务需求，只给**第一步需要执行的智能体**分配任务，后续智能体会通过 @名称 链式调用自主协作完成全部流程。

可用智能体（**必须使用 key 字段的值**）：
${agentList}

${groupInfo ? `协作分组信息：
${groupInfo}\n` : ""}核心规则（必须严格遵守）：
1. **只输出一行 JSON，不要有任何其他文字**。不要写故事、不要写说明、不要写问候语、不要写 markdown 代码块。你的全部输出必须是合法的 JSON。
2. 如果用户需求明确、可以直接调度，使用 **"plan"** 类型：
   {"type":"plan","plan":[{"agent":"${exampleKey}","subTask":"写给${exampleName}的详细创作指令"}]}
3. 如果用户需求模糊、需要用户先做选择，使用 **"ask"** 类型输出一个问题：
   {"type":"ask","question":"你的问题","options":["选项1","选项2"]}
4. **agent 字段的值必须完全等于可用智能体列表中的 key**（例如 "${exampleKey}" 而不是 "writer"）。使用错误的 key 会导致该 agent 被跳过！
5. **只给第一步需要执行的智能体分配子任务**，不要一次性给所有智能体发任务——后续智能体会通过 @名称 链式调用自主协作完成
6. 分析哪些智能体适合第一步执行（通常是创作类），哪些适合后续步骤（审查/审核类）
7. 在给创作类智能体分配任务时，提醒其：**不得让已有角色死亡，不能编造编号/代号系统，不要使用档案模板格式**
8. **subTask 内容中绝对不允许出现 @名称**——subTask 是指令，不是输出正文。subTask 不应包含任何 @mention。如果用户要求后续审查，在 subTask 末尾注明"完成后请 @通知流水线中已有的审查智能体"即可（但不要指定名称，因为你不确定哪些名称在流水线中存在）。
9. **可用的协作对象只有上面列表中的智能体**——不存在"新增内容审查专员""审核与逻辑校验专员"之类的角色。subTask 中不要提及这些不存在的角色。只有列表中列出的智能体才是有效的。

典型协作流程（供参考）：
- 第一步：${exampleName} 创作内容 → 完成后 @流水线中其他智能体的名称
- 第二步：审查智能体分析内容 → 将分析结果 + 原文传给 @下一审核智能体
- 第三步：审核智能体审核 → 不通过则 @${exampleName} 修改 → 循环

示例（只给第一步的 agent 发任务）：
{"type":"plan","plan":[{"agent":"${exampleKey}","subTask":"创作一篇故事正文，完成后 @流水线中已有的其他智能体进行后续分析"}]}

示例（ask 类型）：
{"type":"ask","question":"请选择叙事视角","options":["第一人称","第三人称"]}`;
}

const BUILTIN_AGENTS: Record<string, { name: string; emoji: string; color: string; desc: string; systemPrompt: (ctx: string) => string }> = {
  dispatcher: {
    name: "调度统领", emoji: "🤖", color: "text-purple-500", desc: "分析任务并调度智能体",
    // systemPrompt 在运行前动态传入 pipelineAgents
    systemPrompt: () => "调度统领提示词由运行时动态生成",
  },
  writer: {
    name: "主笔", emoji: "📝", color: "text-green-500", desc: "生成故事正文",
    systemPrompt: (ctx) => `你是一位擅长文学创作的主笔（Writer）。当前设定：${ctx}

创作要求：
- 根据规划创作生动的故事正文，使用叙述语言，保持角色一致性
- 输出完整的故事内容，不要留空
- 可以创作全新角色，但已有角色（设定中列出的角色）不得被杀或永久消失——他们可以面临危险、受伤或陷入困境
- 可以合理新增次要角色、地点和事件来丰富故事，只要不与已有设定冲突
- 不要编造编号、代号、分类体系。直接用自然语言讲故事即可

协作规则：
- 创作完成后，请在末尾添加 @角色监理 或 @设定监理 来通知其分析你的作品
- 如果收到审核打回的修改要求，请根据反馈意见修改并重新输出完整版本
- 修改完成后再次 @角色监理 或 @设定监理 进行复查`,
  },
  loreKeeper: {
    name: "设定监理", emoji: "🔍", color: "text-purple-500", desc: "检查设定一致性",
    systemPrompt: (ctx) => `你是一位世界观设定监理（LoreKeeper）。当前设定：${ctx}

审查要求：
- 严格检查作品与设定的吻合度
- 如发现设定矛盾、逻辑漏洞或与世界观不符之处，用 @主笔 或 @writer 标记需要修改的地方，并详细说明问题
- 如果一切正常，输出【设定一致通过】
- 检查作品中是否出现了编造的编号、代号或分类体系——如果有，指出并要求修改

协作规则：
- 分析完成后，请在末尾添加 @角色监理 来通知其进行角色一致性审查
- **如发现不合格问题，必须在输出末尾使用 @主笔 或 @writer 通知写手修改**，并附上具体的修改要求和原因。系统不会自动打回，需要你主动通知写手。`,
  },
  characterAgent: {
    name: "角色监理", emoji: "🎭", color: "text-orange-500", desc: "验证角色表现",
    systemPrompt: (ctx) => `你是一位角色监理（CharacterAgent）。设定：${ctx}

审查要求：
- 验证角色言行与角色卡的一致性
- 如发现角色行为不符、性格偏差或对话风格异常，用 @主笔 或 @writer 标记需要修改的地方
- 检查是否有已有角色被杀害或永久消失——如果是，要求主笔修改，已有角色只能面临危险，不能被杀
- 如果一切正常，输出【角色表现一致】

协作规则：
- 分析完成后，请在末尾添加 @设定监理 来通知其进行设定一致性审查`,
  },
  editor: {
    name: "润色师", emoji: "✏️", color: "text-pink-500", desc: "文字润色优化",
    systemPrompt: (ctx) => `你是一位文字润色师（Editor）。在保持原意和风格的前提下优化文本。

协作规则：
- 润色完成后，请在末尾添加 @设定监理 来通知其复查一致性
- 如果收到打回要求，根据反馈重新润色`,
  },
};

/** 最大迭代次数（防止死循环） */
const MAX_ITERATIONS = 10;

/** Pipeline 状态 — crewAI 风格的受管状态 */
interface PipelineState {
  /** 用户原始 prompt */
  prompt: string;
  /** 项目上下文 */
  context: string;
  /** 各 agent 的产出历史 */
  agentOutputs: { agentId: string; name: string; emoji: string; output: string; status: string; iteration: number; }[];
  /** 审核反馈列表 */
  feedback: { reviewerId: string; reviewerName: string; issues: { severity: "info" | "warning" | "fatal"; description: string; location?: string }[]; verdict: "pass" | "fail"; }[];
  /** 当前步骤索引 */
  currentStep: number;
  /** 修订次数 */
  revisionCount: number;
}

/** Task 定义 — 类似 crewAI 的 Task 对象 */
interface AgentTask {
  agentId: string;
  description: string;
  expectedOutput: string;
  context: string;
  output: string;
  status: "pending" | "running" | "done" | "failed";
}

/** SSE 事件推送 */
const encoder = new TextEncoder();

function sseEvent(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** agent 状态快照 */
interface AgentSnapshot {
  agent: string; name: string; emoji: string;
  output: string; time: number; status: string; iteration: number;
}

/** 内部步骤 */
interface AgentStep {
  agentId: string; name: string; emoji: string;
  systemPrompt: string; output: string; time: number;
  status: "pending" | "running" | "done" | "failed";
  iteration: number;
  role?: "planner" | "writer" | "reviewer" | "editor" | "custom";
  tools?: Record<string, { description: string; parameters: { type: string; properties: Record<string, unknown> } }>;
}

/** dispatcher 调度计划条目 — 升级为类似 crewAI 的 Task 对象 */
interface DispatchItem {
  agent: string;
  subTask: string;
  /** 预期输出描述，用于结构化校验 */
  expectedOutput?: string;
  /** 上下文过滤 — 指定需要参考的之前的 agent 产出 */
  contextFrom?: string[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return badRequest("项目不存在");

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch (error) { return handleJsonError(error); }

    const pipeline = body.pipeline as string[] | undefined;
    const dispatcherAgent = typeof body.dispatcherAgent === "string" ? body.dispatcherAgent : undefined;
    const userPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const promptTemplates = body.promptTemplates as Record<string, string> | undefined;

    if (!Array.isArray(pipeline) || pipeline.length === 0) return badRequest("请指定智能体");
    if (!userPrompt) return badRequest("请输入写作任务");

    // 加载 MCP 服务器工具定义（供 tool calling 使用）
    let allMcpServerTools: Record<string, { description: string }> = {};
    try {
      const mcpServers = await prisma.mcpServer.findMany({ where: { projectId } });
      for (const srv of mcpServers) {
        const tools = JSON.parse(srv.tools || "[]") as string[];
        for (const t of tools) {
          allMcpServerTools[t] = { description: `MCP 工具：${t}，来自服务器 ${srv.name}` };
        }
      }
    } catch {}

    // 读取项目全面上下文
    // 读取角色信息 — 随机抽样 8 个来增加多样性
    const allChars = await prisma.character.findMany({ where: { projectId }, take: 50 });
    // 从记忆中读取最近使用过的角色名，降低其被选中的概率
    let recentCharNames: string[] = [];
    try {
      const recentMemories = await prisma.memory.findMany({
        where: { projectId, tags: { contains: "auto-extracted" } },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      for (const m of recentMemories) {
        if (m.content.includes("完成")) {
          const nameMatch = m.content.match(/\]\s*(.+?) 完成/);
          if (nameMatch) recentCharNames.push(nameMatch[1]);
        }
      }
    } catch {}
    // 将角色排序：最近使用过的排在后面，从未使用过的排在前面
    const sortedChars = [...allChars].sort((a, b) => {
      const aUsed = recentCharNames.includes(a.name);
      const bUsed = recentCharNames.includes(b.name);
      if (aUsed && !bUsed) return 1;
      if (!aUsed && bUsed) return -1;
      return Math.random() - 0.5; // 同组内随机
    });
    const characters = sortedChars.slice(0, 8);
    // 在 context 末尾添加探索引导
    const unusedCount = allChars.length - characters.length;
    const hasUnused = unusedCount > 0;

    let context = "";
    if (project?.systemPrompt) context += `# 项目设定\n${project.systemPrompt}\n\n`;
    if (characters.length > 0) {
      context += "## 角色信息\n";
      for (const c of characters) {
        context += `### ${c.name}\n`;
        if (c.age) context += `年龄：${c.age}\n`;
        if (c.appearance) context += `外貌：${c.appearance}\n`;
        if (c.personality) context += `性格：${c.personality}\n`;
        if (c.backstory) context += `背景：${c.backstory}\n`;
        if (c.persona) context += `说话风格：${c.persona}\n`;
        if (c.hiddenLore) context += `[仅 AI 可见] ${c.hiddenLore}\n`;
      }
      context += "\n";
    }

    // 读取大纲、世界状态、置顶消息
    const [outlines, worldStates, recentMessages] = await Promise.all([
      prisma.outline.findMany({ where: { projectId, status: { in: ["draft", "active"] } }, take: 10 }),
      prisma.worldState.findMany({ where: { projectId }, take: 30 }),
      prisma.message.findMany({ where: { projectId, isPinned: true }, take: 5 }),
    ]);

    // 智能匹配世界观（基于用户 prompt 相关度，而非全部加载）
    try {
      const matchedLore = await matchLoreEntries(projectId, userPrompt, 10);
      const loreText = formatLoreContext(matchedLore);
      if (loreText) context += loreText + "\n\n";
    } catch {}
    if (outlines.length > 0) {
      context += "## 当前大纲\n";
      for (const o of outlines) context += `### ${o.title}\n${o.content.slice(0, 500)}\n\n`;
    }
    if (worldStates.length > 0) {
      context += "## 世界状态\n";
      for (const w of worldStates) context += `- ${w.key}：${w.value}${w.description ? `（${w.description}）` : ""}\n`;
      context += "\n";
    }

    // 智能检索相关记忆
    try {
      const relevantMemories = await retrieveRelevantMemories(projectId, userPrompt, 10);
      const memoryText = formatMemoryContext(relevantMemories);
      if (memoryText) context += memoryText + "\n\n";
    } catch {}

    if (recentMessages.length > 0) {
      context += "## 已置顶的重要信息\n";
      for (const m of recentMessages) context += `- ${m.content.slice(0, 300)}\n`;
      context += "\n";
    }

    // 创作指引（鼓励型）: 减少否定句式，增加许可指引
    const constraintsText = promptTemplates?.contextConstraints || `## 创作指引
1. **素材范围**：优先使用以上给出的设定信息。引入全新元素时确保不与已有设定矛盾即可。
2. **编号系统**：直接用自然语言描述即可，不需要创建编号或代号体系。如果项目已有编号规则则按规则执行。
3. **角色安全**：已有角色可面临危险或困境，但不能被杀或永久消失。可自由引入全新配角，新角色可以承担包括死亡在内的任何剧情需要。
4. **创作身份**：直接以 AI 助手身份创作内容即可，不需要扮演故事中的角色。
5. **积极探索**：鼓励探索项目中较少使用的角色和设定元素。每次创作可尝试不同视角、角色组合和叙事风格。
6. **内容格式**：直接输出故事正文或分析结论，不需要套用报告模板或档案格式。`;
    context += constraintsText + "\n\n";

    const customAgents = await prisma.customAgent.findMany({
      where: { projectId, isActive: true },
      orderBy: { order: "asc" },
    });

    const modelConfig = sanitizeModelConfig(body.modelConfig);
    const apiBaseUrl = modelConfig?.apiBaseUrl || "";
    const apiKey = modelConfig?.apiKey || "";
    const modelName = modelConfig?.modelName || "deepseek-v4-flash";

    if (!apiBaseUrl) return badRequest("请先在设置中配置 API Base URL");
    const urlCheck = validateExternalUrl(apiBaseUrl);
    if (urlCheck !== true) return badRequest(urlCheck);

    // 检查是否配置了调度统领
    const hasDispatcher = pipeline.some(k => {
      if (k.startsWith("custom:")) {
        const ca = customAgents.find(a => a.id === k.replace("custom:", ""));
        return ca && (dispatcherAgent === k || ca.name.includes("调度") || ca.name.includes("统领") || ca.name.includes("发令"));
      }
      return dispatcherAgent === k || k === "dispatcher";
    });
    if (!hasDispatcher) {
      return badRequest("智能协作模式需要配置「调度统领」作为第一步。请添加调度统领智能体并标记，或使用模板。");
    }

    const openai = createOpenAI({ baseURL: apiBaseUrl, apiKey: apiKey || "ollama" });

    // ============================================================
    // 智能体配置获取
    // ============================================================
    const getAgentConfig = async (agentKey: string, isExplicitDispatcher?: boolean) => {
      if (agentKey.startsWith("custom:")) {
        const ca = customAgents.find(a => a.id === agentKey.replace("custom:", ""));
        if (ca) {
          let prompt = ca.systemPrompt;
          // 注入项目上下文（含重要约束），确保自定义智能体也遵守规则
          prompt += `\n\n## 项目设定\n${context}`;

          // 注入技能
          const skills = JSON.parse(ca.skills || "[]") as string[];
          if (skills.length > 0) {
            prompt += `\n\n## 专业技能\n你拥有以下技能：\n${skills.map(s => `- ${s}`).join("\n")}\n`;
          }

          // 注入 MCP 工具 — 转换为 AI SDK tool 定义
          const mcpToolNames = JSON.parse(ca.mcpTools || "[]") as string[];
          const agentTools: Record<string, unknown> = {};
          if (mcpToolNames.length > 0) {
            prompt += `\n\n## 可用工具\n你可以使用以下 MCP 工具（通过函数调用协议）：\n${mcpToolNames.map(t => `- ${t}`).join("\n")}\n当你需要使用某个工具时，AI 会自动生成工具调用。`;
            // 从项目 MCP 服务器配置中查找工具定义
            if (allMcpServerTools) {
              for (const tName of mcpToolNames) {
                const toolDef = (allMcpServerTools as Record<string, { description: string }>)[tName];
                if (toolDef) {
                  (agentTools as Record<string, { description: string; parameters: { type: string; properties: Record<string, unknown> } }>)[tName] = {
                    description: toolDef.description || `使用 ${tName} 工具`,
                    parameters: { type: "object", properties: {} },
                  };
                }
              }
            }
          }

          // 注入绑定的世界观词条
          const loreIds = JSON.parse(ca.loreIds || "[]") as string[];
          if (loreIds.length > 0) {
            const entries = await prisma.loreEntry.findMany({ where: { id: { in: loreIds }, projectId } });
            if (entries.length > 0) {
              prompt += "\n\n## 必须遵守的世界观设定\n";
              for (const l of entries) prompt += `\n### ${l.title}\n${l.content.slice(0, 1000)}\n`;
            }
          }
          const customType = ca.type || "custom";
          // 根据 type + name 综合判断角色
          let role = customType as AgentStep["role"];
          if (role === "custom" || !role) {
            if (ca.name.includes("审查") || ca.name.includes("审核") || ca.name.includes("校验") || ca.name.includes("监理"))
              role = "reviewer";
            else if (ca.name.includes("写") || ca.name.includes("创作") || ca.name.includes("起草") || ca.name.includes("叙事"))
              role = "writer";
            else if (ca.name.includes("调度") || ca.name.includes("统领"))
              role = "planner";
            else if (ca.name.includes("润色") || ca.name.includes("修饰"))
              role = "editor";
          }
          return {
            name: ca.name, emoji: ca.emoji, systemPrompt: prompt, role,
            isDispatcher: isExplicitDispatcher || ca.name.includes("调度") || ca.name.includes("统领") || ca.name.includes("发令"),
            tools: agentTools,
          };
        }
      }
      const builtin = BUILTIN_AGENTS[agentKey];
      if (builtin) {
        // 内置智能体角色通过 key 确定
        const builtinRole: AgentStep["role"] =
          agentKey === "writer" ? "writer" :
          agentKey === "loreKeeper" ? "reviewer" :
          agentKey === "characterAgent" ? "reviewer" :
          agentKey === "editor" ? "editor" :
          agentKey === "dispatcher" ? "planner" : undefined;
        // 优先使用用户自定义的提示词模板
        const templateKey = agentKey === "dispatcher" ? "dispatcher" :
          agentKey === "writer" ? "writer" :
          agentKey === "loreKeeper" ? "loreKeeper" :
          agentKey === "characterAgent" ? "characterAgent" :
          agentKey === "editor" ? "editor" : null;
        const userTemplate = templateKey ? promptTemplates?.[templateKey] : undefined;
        let sysPrompt: string;
        if (userTemplate) {
          sysPrompt = applyTemplate(userTemplate, { ctx: context }, () => builtin.systemPrompt(context));
        } else {
          sysPrompt = builtin.systemPrompt(context);
        }
        return {
          name: builtin.name, emoji: builtin.emoji, systemPrompt: sysPrompt, role: builtinRole,
          isDispatcher: isExplicitDispatcher || agentKey === "dispatcher",
          tools: {},
        };
      }
      return { name: agentKey, emoji: "🤖", systemPrompt: `你是一位 AI 助手。当前设定：${context}`, role: "custom" as AgentStep["role"], isDispatcher: !!isExplicitDispatcher, tools: {} };
    };

    // ============================================================
    // SSE 流式执行引擎
    // ============================================================

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          try { controller.enqueue(sseEvent(event, data)); } catch { /* 流已关闭 */ }
        };

        // 初始化 Hook 系统
        const hooks = new AgentHooks();
        if (promptTemplates?.webhookUrl) {
          try {
            const whUrl = promptTemplates.webhookUrl;
            if (whUrl.startsWith("http")) {
              hooks.addWebhook(whUrl, ["flow-done", "flow-error"]);
            }
          } catch {}
        }

        const snapshot = (step: AgentStep): AgentSnapshot => ({
          agent: step.agentId, name: step.name, emoji: step.emoji,
          output: step.output, time: step.time, status: step.status, iteration: step.iteration,
        });

        /** 运行单个智能体并返回 token 统计 */
        const runAgent = async (
          step: AgentStep,
          input: string,
          systemPromptOverride?: string,
          /** 流水线中所有可用的 agent 名称列表（用于 @mention 合规校验） */
          pipelineAgentNames?: string[],
        ): Promise<{ text: string; inputTokens: number; outputTokens: number }> => {
          step.status = "running";
          step.iteration = (step.iteration || 0) + 1;
          send("step-start", snapshot(step));

          const startTime = Date.now();
          let sysPrompt = systemPromptOverride || step.systemPrompt;

          // 注入合规规则（优先使用用户自定义模板）
          const agentList = pipelineAgentNames?.map(n => `"${n}"`).join("、") || step.name;
          const defaultCompliance = `\n\n## 合规规则（必须遵守）
1. **可用的 @mention 对象**：只有 ${agentList} 是有效的协作对象。输出中不得使用 @名称 引用不在以上列表中的角色或部门——不存在所谓的"审查专员""新增内容审查专员""审核与逻辑校验专员"之类的虚构协作方。
2. **禁止扮演虚构角色**：不要以"叙事起草专员""档案管理员""审查专员"等虚构身份自居。你只是 AI 助手，直接输出内容即可。
3. **不要生成元评论**：不要输出像"报告创作完毕。请 @XXX 进行审查"之类的流程性语句——这些不是故事正文。
4. **避免"不是...而是"句式**：不要使用"不是...而是..."、"并非...恰恰是..."、"与其说...不如说..."这类否定-肯定对比结构。直接描述事实即可，不需要先否定再肯定。`;
          const complianceText = promptTemplates?.complianceRules
            ? `\n\n${applyTemplate(promptTemplates.complianceRules, { agentList }, () => defaultCompliance)}`
            : defaultCompliance;
          sysPrompt += complianceText;

          // 注入写作风格指南（降低 AI 腔调）
          if (promptTemplates?.writingStyle) {
            sysPrompt += `\n\n${promptTemplates.writingStyle}`;
          }

          const promptText = input;

          // 流式输出
          let fullText = "";
          const { textStream, usage } = await streamText({
            model: openai.chat(modelName),
            system: sysPrompt,
            prompt: promptText,
            temperature: 0.7,
            tools: step.tools && Object.keys(step.tools).length > 0
              ? Object.fromEntries(
                  Object.entries(step.tools).map(([name, def]) => [
                    name,
                    {
                      description: def.description,
                      inputSchema: z.object({}),
                    },
                  ])
                )
              : undefined,
          });

          for await (const chunk of textStream) {
            fullText += chunk;
            step.output = fullText;
            // 每收到一个 chunk 就发送流式更新
            send("step-stream", {
              agent: step.agentId,
              name: step.name,
              output: fullText,
              time: Date.now() - startTime,
              status: "running",
            });
          }

          step.output = fullText;
          step.time = Date.now() - startTime;

          // 确保每个步骤至少有 2 秒的展示时间
          const elapsed = Date.now() - startTime;
          const minStepTime = 2000;
          if (elapsed < minStepTime) {
            await new Promise(r => setTimeout(r, minStepTime - elapsed));
          }

          // 获取 token 统计
          let inputTokens = 0;
          let outputTokens = 0;
          try {
            const u = await usage;
            inputTokens = u.inputTokens || 0;
            outputTokens = u.outputTokens || 0;
          } catch {}

          step.status = "done";
          send("step-done", snapshot(step));

          // 执行期间自动写入记忆
          if (fullText && fullText.length > 50) {
            const memoryContent = `[${step.role || "agent"}] ${step.name} 完成：${fullText.slice(0, 200)}...`;
            prisma.memory.create({
              data: {
                projectId,
                content: memoryContent,
                tags: JSON.stringify([step.name, step.role || "agent", "auto-extracted"]),
                importance: step.role === "reviewer" ? 5 : 3,
              },
            }).catch(() => {});
          }

          return { text: fullText, inputTokens: inputTokens as number, outputTokens: outputTokens as number };
        };

        /** 检查客户端是否断开 */
        const isAborted = () => request.signal.aborted;

        // 聚合统计
        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        try {
          // 第一步：解析 pipeline，判断是否有调度统领
          const agentConfigs = await Promise.all(pipeline.map(k => getAgentConfig(k, dispatcherAgent ? k === dispatcherAgent : undefined)));
          const dispatcherIndex = agentConfigs.findIndex(c => c.isDispatcher);

          // 初始化步骤列表
          const steps: AgentStep[] = [];
          for (let i = 0; i < pipeline.length; i++) {
            const config = agentConfigs[i];
            steps.push({
              agentId: pipeline[i], name: config.name, emoji: config.emoji,
              systemPrompt: config.systemPrompt, output: "", time: 0,
              status: "pending", iteration: 0, role: config.role, tools: (config as any).tools,
            });
          }

          // 推送初始状态
          send("step-update", {
            results: steps.map(snapshot), steps: steps.length,
            iterations: 0, isComplete: false,
            dispatcherMode: dispatcherIndex >= 0,
          });

          // === 为所有智能体注入管线信息（内置 + 自定义） ===
          const pipelineInfoStr = steps
            .filter(s => s.agentId !== pipeline[dispatcherIndex])
            .map((s, i) => `${i + 1}. ${s.emoji} ${s.name}${s.role ? `（${s.role === "writer" ? "创作" : s.role === "reviewer" ? "审查" : s.role === "editor" ? "润色" : s.role === "planner" ? "调度" : "自定义"}）` : ""}`)
            .join("\n");
          const dispatcherInfo = dispatcherIndex >= 0
            ? steps[dispatcherIndex]
            : null;
          for (const step of steps) {
            step.systemPrompt += `\n\n## 管线信息\n当前流水线共有 ${steps.length} 个智能体，按以下顺序执行：\n${pipelineInfoStr}\n${dispatcherInfo ? `调度统领：${dispatcherInfo.emoji} ${dispatcherInfo.name}\n` : ""}协作说明：每个智能体完成后可以通过 @名称 通知下一个智能体继续执行。审查智能体发现不合格时，请 @通知对应的创作智能体修改。`;
          }

          // === 为所有自定义智能体注入协作规则 ===
          for (const step of steps) {
            // 跳过 dispatcher 和内置 agent（它们已有完整的协作规则）
            const isBuiltin = Object.keys(BUILTIN_AGENTS).includes(step.agentId);
            if (isBuiltin) continue;

            // 构建其他 agent 的名称列表（用于 @mention）
            const otherAgents = steps
              .filter(s => s.agentId !== step.agentId)
              .map(s => `@${s.name}`)
              .join("、");

            if (otherAgents) {
              const firstOther = steps.find(s => s.agentId !== step.agentId);
              const collaborationRules = promptTemplates?.customAgentCollaborationRules
                ? `\n\n${applyTemplate(promptTemplates.customAgentCollaborationRules, {
                    otherAgents,
                    firstOther: firstOther ? `@${firstOther.name}` : "下一个智能体",
                  }, () => "")}`
                : `\n\n## 协作规则\n- 你的任务完成后，请在末尾使用 @名称 的形式通知下一个需要处理的智能体\n- 可用的协作对象：${otherAgents}\n- 例如：如果内容已创作完成，通知 ${firstOther ? `@${firstOther.name}` : "下一个智能体"} 进行下一步处理\n- 如果收到其他智能体的 @提及 和修改要求，请根据反馈修改内容\n- 当你发现问题需要打回修改时，请在末尾 @对方名称 并说明问题`;
              step.systemPrompt += collaborationRules;
            }
          }

          let iterationCount = 0;
          let workflowDone = false;
          let finalOutput = "";
          // Pipeline 状态 — 结构化跟踪
          const pipelineState: PipelineState = {
            prompt: userPrompt,
            context,
            agentOutputs: [],
            feedback: [],
            currentStep: 0,
            revisionCount: 0,
          };

          if (dispatcherIndex >= 0) {
            // ================================================================
            // 【智能调度模式】— 调度统领先输出计划，再按计划调度
            // ================================================================
            const dispatcherStep = steps[dispatcherIndex];

            // 0. 动态构建调度统领的系统提示词（包含可用 agent 列表 + 分组信息）
            const pipelineAgentInfo = pipeline.map(k => {
              const s = steps.find(st => st.agentId === k);
              return { key: k, name: s?.name || k, role: s?.role };
            });
            // 加载协作分组信息，注入到调度统领提示词
            let groupInfoStr = "";
            try {
              const agentGroups = await prisma.agentGroup.findMany({ where: { projectId }, take: 10 });
              if (agentGroups.length > 0) {
                groupInfoStr = agentGroups.map(g => {
                  const members = (JSON.parse(g.memberIds || "[]") as string[]).map(id => {
                    const s = steps.find(st => st.agentId === id || st.name === id);
                    return s?.name || id;
                  }).filter(Boolean).join("、");
                  return `【${g.name}】${g.description ? `(${g.description})` : ""} 成员：${members || "无"}`;
                }).join("\n");
              }
            } catch {}
            dispatcherStep.systemPrompt = buildDispatcherSystem(context, pipelineAgentInfo, groupInfoStr || undefined, promptTemplates?.dispatcher);

            // 1. 运行调度统领
            send("dispatcher-start", { agent: dispatcherStep.agentId });
            const pipelineNames = pipeline.map(k => {
              const s = steps.find(st => st.agentId === k);
              return s?.name || k;
            }).filter(Boolean);
            const dispatchResult = await runAgent(dispatcherStep, userPrompt, undefined, pipelineNames);
            totalInputTokens += dispatchResult.inputTokens;
            totalOutputTokens += dispatchResult.outputTokens;

            // 2. 解析调度计划 JSON（支持 type=plan 和 type=ask）
            let dispatchType: "plan" | "ask" = "plan";
            let dispatchPlan: DispatchItem[] = [];
            let askQuestion = "";
            let askOptions: string[] = [];
            let parseOk = false;

            try {
              const cleaned = dispatcherStep.output
                .replace(/```(?:json)?\s*/gi, "")
                .replace(/```/g, "")
                .trim();
              const parsed = JSON.parse(cleaned);
              if (parsed.type === "ask" && parsed.question) {
                dispatchType = "ask";
                askQuestion = parsed.question;
                askOptions = Array.isArray(parsed.options) ? parsed.options : [];
                parseOk = true;
              } else if (parsed.plan && Array.isArray(parsed.plan)) {
                // 支持 mode 字段: "sequential" | "hierarchical"（默认 sequential）
                const processMode = parsed.mode || "sequential";
                dispatchPlan = parsed.plan.map((item: Record<string, unknown>) => ({
                  agent: item.agent || item.key,
                  subTask: item.subTask || item.description || `执行你的任务`,
                }));
                parseOk = true;
                // 发送 mode 信息给前端（仅日志）
                if (processMode === "hierarchical") {
                  console.log(`[Agent] 分层调度模式 (hierarchical)，共 ${dispatchPlan.length} 个子任务`);
                }
              }
            } catch {
              // 再尝试从文本中提取 {...} JSON 块
              try {
                const jsonMatch = dispatcherStep.output.match(/\{[\s\S]*"(?:plan|type|question)"[\s\S]*\}/);
                if (jsonMatch) {
                  const fp = JSON.parse(jsonMatch[0]);
                  if (fp.type === "ask" && fp.question) {
                    dispatchType = "ask";
                    askQuestion = fp.question;
                    askOptions = Array.isArray(fp.options) ? fp.options : [];
                    parseOk = true;
                  } else if (fp.plan && Array.isArray(fp.plan)) {
                    dispatchPlan = fp.plan;
                    parseOk = true;
                  }
                }
              } catch {}
            }

            if (dispatchType === "ask" && parseOk) {
              // 向用户提问，暂停流程
              send("dispatcher-ask", { question: askQuestion, options: askOptions, raw: dispatcherStep.output });
              send("flow-paused", { reason: "dispatcher-ask" });
              workflowDone = true; // 流结束，等待用户重新提交
            } else if (dispatchPlan.length === 0) {
              // 没有有效的调度计划检查 dispatcher 是否直接输出了创作内容
              if (dispatcherStep.output.length > 100 && !dispatcherStep.output.includes('"type":"plan"')) {
                // dispatcher 直接创作了内容 → 将其视为写手产出，继续流转
                send("dispatcher-done", { plan: [], raw: dispatcherStep.output, directContent: true });
                finalOutput = dispatcherStep.output;
                // 构建一个虚拟的写手步骤，让流程可以继续
                const writerLikeSteps = steps.filter(s => s.agentId !== pipeline[dispatcherIndex]);
                if (writerLikeSteps.length > 0) {
                  const firstWriter = writerLikeSteps[0];
                  firstWriter.output = dispatcherStep.output;
                  firstWriter.status = "done";
                  firstWriter.time = dispatcherStep.time;
                  // 进入 while 循环自动流转
                  while (!workflowDone) {
                    let progressMade = false;
                    for (const item of dispatchPlan) {
                      // dispatchPlan 为空，循环结束
                    }
                    workflowDone = steps.every(s => s.status === "done" || s.agentId === pipeline[dispatcherIndex]);
                    if (!workflowDone) {
                      const nextPending = steps.find(s =>
                        s.agentId !== pipeline[dispatcherIndex] &&
                        s.status === "pending" &&
                        !dispatchPlan.find(d => d.agent === s.agentId)
                      );
                      if (nextPending) {
                        dispatchPlan.unshift({
                          agent: nextPending.agentId,
                          subTask: nextPending.systemPrompt.slice(0, 300) || `执行你的任务（${nextPending.name}）`,
                        });
                        progressMade = true;
                      }
                    }
                    if (!progressMade) {
                      const anyPending = steps.some(s =>
                        s.agentId !== pipeline[dispatcherIndex] && s.status === "pending"
                      );
                      if (!anyPending) break;
                    }
                  }
                }
              } else {
                // 真的没有有效的调度计划
                const errorDetail = dispatcherStep.output.length > 300
                  ? dispatcherStep.output.slice(0, 300) + "..."
                  : dispatcherStep.output;
                send("flow-error", {
                  error: "调度统领未输出有效的调度计划，已终止本轮协作。",
                  details: `调度统领原始输出（摘要）：\n${errorDetail}\n\n可能的原因：\n1. 调度统领提示词需要更精确地描述任务\n2. 自定义智能体的提示词没有包含明确的写作指令\n3. AI 模型未能正确理解需要输出 JSON 格式的调度计划\n\n请调整提示词后重试。`,
                });
                workflowDone = true;
              }
            } else {
              send("dispatcher-done", { plan: dispatchPlan, raw: dispatcherStep.output });

              // 3. 按调度计划执行，支持 @mention 反馈循环
              let iterationsLeft = MAX_ITERATIONS;
              let accumulatedChain = "";

              while (!workflowDone && iterationsLeft > 0) {
                if (isAborted()) break;
                iterationsLeft--;
                let progressMade = false;

                for (const item of dispatchPlan) {
                  if (isAborted()) break;
                  iterationCount++;

                  // 寻找匹配的 agent：先精确匹配 key，再按名称模糊匹配
                  let step = steps.find(s => s.agentId === item.agent);
                  if (!step) {
                    // 尝试按名称匹配（处理 dispatcher 用了 "writer" 但实际 key 是 "custom:xxx" 的情况）
                    step = steps.find(s =>
                      s.name.includes(item.agent) || item.agent.includes(s.agentId)
                    );
                  }
                  if (!step) {
                    // 完全找不到匹配的 agent，输出详细错误
                    const validKeys = steps.map(s => `"${s.agentId}"（${s.name}）`).join(", ");
                    send("flow-error", {
                      error: `调度计划中的 agent "${item.agent}" 在流水线中不存在，已终止。`,
                      details: `调度统领使用了 key "${item.agent}"，但流水线中的可用 agent 为：${validKeys}\n\n请检查调度统领的输出是否正确使用了 agent 的 key 而非名称。`,
                    });
                    workflowDone = true;
                    break;
                  }
                  if (step.status === "done") continue;

                  const subPrompt = item.subTask;
                  const input = finalOutput
                    ? `${subPrompt}${item.expectedOutput ? `\n\n预期输出格式：${item.expectedOutput}` : ""}${item.contextFrom?.length ? `\n\n参考以下智能体的产出：\n${item.contextFrom.map(id => {
                      const src = steps.find(s => s.agentId === id);
                      return src ? `--- ${src.name} 的产出 ---\n${src.output}` : "";
                    }).filter(Boolean).join("\n\n")}` : `\n\n当前已有产出：\n${finalOutput}`}`
                    : subPrompt;

                  try {
                    const result = await runAgent(step, input, undefined, pipelineNames);
                    totalInputTokens += result.inputTokens;
                    totalOutputTokens += result.outputTokens;
                    // 保存上一步输出用于修订反馈
                    const prevOutput = finalOutput;
                    finalOutput = step.output;
                    // 累加完整产出链（用于修订循环中的上下文恢复）
                    accumulatedChain = accumulatedChain
                      ? `${accumulatedChain}\n\n---\n\n${step.output}`
                      : step.output;

                    // ── 结构化输出校验 (Zod) ──
                    let validationError: string | null = null;
                    if (item.expectedOutput) {
                      try {
                        // 如果预期输出看起来像 JSON，尝试解析并校验
                        if (item.expectedOutput.includes("JSON") || item.expectedOutput.includes("json")) {
                          JSON.parse(step.output);
                        }
                        // 检查基础完成标记（审查类智能体）
                        if (step.role === "reviewer") {
                          const passMarkers = ["通过", "一致", "正常", "合格", "无问题"];
                          const failMarkers = ["不合格", "不通过", "不一致", "错误", "问题"];
                          const hasPass = passMarkers.some(m => step.output.includes(m));
                          const hasFail = failMarkers.some(m => step.output.includes(m));
                          if (!hasPass && !hasFail) {
                            validationError = `输出未包含明确的通过/不通过判定标记`;
                          }
                        }
                      } catch (e) {
                        validationError = `输出格式校验失败：${(e as Error).message}`;
                      }
                      if (validationError) {
                        send("step-update", {
                          results: steps.map(snapshot), steps: steps.length,
                          iterations: iterationCount, isComplete: false,
                          dispatcherMode: dispatcherIndex >= 0,
                          validationError,
                          agentName: step.name,
                        });
                      }
                    }

                    // ── 显式委派检测 ──
                    const delegateMatch = step.output.match(/\{type:"delegate",target:"([^"]+)",task:"([^"]*)"\}/);
                    if (delegateMatch) {
                      const delegateTargetName = delegateMatch[1];
                      const delegateTask = delegateMatch[2] || "请继续处理";
                      const delegateTarget = steps.find(s =>
                        s.name === delegateTargetName || s.agentId === delegateTargetName
                      );
                      if (delegateTarget && delegateTarget.agentId !== step.agentId) {
                        if (!dispatchPlan.find(d => d.agent === delegateTarget.agentId)) {
                          dispatchPlan.unshift({
                            agent: delegateTarget.agentId,
                            subTask: `${step.name} 委派任务：${delegateTask}\n\n上下文：\n${step.output.replace(/\{type:"delegate",[^}]+\}/g, "").trim()}`,
                            expectedOutput: `处理被委派的任务`,
                            contextFrom: [step.agentId],
                          });
                        }
                        if (delegateTarget.status === "done") {
                          delegateTarget.status = "pending";
                          delegateTarget.output = "";
                          delegateTarget.time = 0;
                        }
                        progressMade = true;
                      }
                    }

                    // ── 显式提问检测 ──
                    const askMatch = step.output.match(/\{type:"ask",question:"([^"]+)",options:\[([^\]]*)\]\}/);
                    if (askMatch) {
                      const askQuestion = askMatch[1];
                      const askOptions = askMatch[2] ? askMatch[2].split(",").map((o: string) => o.trim().replace(/^"|"$/g, "")) : [];
                      send("flow-paused", {
                        reason: "agent-ask",
                        message: `${step.name} 提问：${askQuestion}`,
                        agentName: step.name,
                        question: askQuestion,
                        options: askOptions,
                      });
                      // 暂停流程等待用户回答
                      workflowDone = true;
                      break;
                    }
                    // 更新结构化状态
                    pipelineState.agentOutputs = pipelineState.agentOutputs.filter(a => a.agentId !== step.agentId);
                    pipelineState.agentOutputs.push({
                      agentId: step.agentId, name: step.name, emoji: step.emoji,
                      output: step.output, status: "done", iteration: step.iteration || 1,
                    });
                    pipelineState.currentStep++;
                    progressMade = true;

                    send("step-update", {
                      results: steps.map(snapshot), steps: steps.length,
                      iterations: iterationCount, isComplete: false,
                      dispatcherMode: true,
                    });

                    // 检测审核/审查类智能体的输出是否包含不合格判定
                    if (step.role === "reviewer") {
                      const rejectionKeywords = ["不合格", "不通过", "未能通过", "未通过", "建议修正", "需要修改", "错误"];
                      const isRejected = rejectionKeywords.some(k => step.output.includes(k));
                      if (isRejected) {
                        // 找到上一个写手类智能体
                        const lastWriter = [...steps].reverse().find(s =>
                          (s.role === "writer" || s.name.includes("写") || s.name.includes("创作") || s.name.includes("起草") || s.name.includes("叙事")) &&
                          s.agentId !== step.agentId
                        );
                        if (lastWriter && lastWriter.status !== "running") {
                          if (lastWriter.status === "done") {
                            lastWriter.status = "pending";
                            lastWriter.output = "";
                            lastWriter.time = 0;
                          }
                          if (!dispatchPlan.find(d => d.agent === lastWriter.agentId)) {
                            dispatchPlan.unshift({
                              agent: lastWriter.agentId,
                              subTask: `${step.name} 指出了以下问题需要修改：\n${step.output.slice(0, 500)}\n\n请根据以上反馈修改你的创作内容，修改完成后重新提交给审核智能体审查。`,
                              expectedOutput: `修正后的完整故事版本，需解决审核指出的所有问题`,
                              contextFrom: [lastWriter.agentId, step.agentId],
                            });
                          }
                          finalOutput = `【${step.name} 驳回】\n${step.output}\n\n【需要修改的原内容】\n${accumulatedChain || "(无原内容)"}`;
                          progressMade = true;
                          send("step-update", {
                            results: steps.map(snapshot), steps: steps.length,
                            iterations: iterationCount, isComplete: false,
                            dispatcherMode: true, autoRouted: true, routedAgent: lastWriter.name,
                            revisionLoop: true, reason: "reviewer-rejected",
                          });
                          // 记录结构化反馈到 pipelineState
                          pipelineState.feedback.push({
                            reviewerId: step.agentId, reviewerName: step.name,
                            issues: [{ severity: "fatal", description: (step.output.match(/错误\d*[:：]\s*([^*\n]+)/)?.[1] || "内容不符合设定要求").trim() }],
                            verdict: "fail",
                          });
                          pipelineState.revisionCount++;
                        hooks.emitRevisionLoop(step.name, lastWriter!.name, step.output.slice(0, 200));
                        }
                      }
                    }

                    // === @mention 反馈循环（调度模式下同样支持） ===
                    const mentionMatches = step.output.match(/@(\S+?)(?=[（(]|\s|$)/g);
                    if (mentionMatches) {
                      for (const mention of mentionMatches) {
                        const mentionedName = mention.slice(1);
                        // 同时匹配 name 和 agentId
                        const target = steps.find(s =>
                          (s.name === mentionedName || s.agentId === mentionedName) &&
                          s.agentId !== step.agentId
                        );
                        if (target && target.status !== "running" && target.agentId !== step.agentId) {
                          // 如果目标 agent 是调度统领，暂停流程等待重新评估
                          const isTargetDispatcher = dispatcherIndex >= 0 && target.agentId === pipeline[dispatcherIndex];
                          if (isTargetDispatcher) {
                            send("flow-paused", {
                              reason: "dispatcher-review",
                              message: `${step.name} 请求调度统领重新评估：${step.output.slice(0, 200)}`,
                            });
                            workflowDone = true;
                            break;
                          }
                          // 将目标 agent 插入 dispatchPlan 头部（优先执行）
                          // 根据角色关系确定 @mention 的语义
                          const currentRole = step.role;
                          const targetRole = target.role;
                          const isReviewBack = currentRole === "reviewer" && (targetRole === "writer" || targetRole === "custom" || !targetRole);
                          const actionLabel = isReviewBack ? "要求修改" : "请求处理";
                          const needsAddToPlan = !dispatchPlan.find(d => d.agent === target.agentId);
                          if (needsAddToPlan) {
                            dispatchPlan.unshift({
                              agent: target.agentId,
                              subTask: isReviewBack
                                ? `${step.name} 指出了以下问题需要修改：\n${step.output.slice(0, 300)}\n\n请根据以上反馈修改你的创作内容，修改完成后重新提交给审核智能体审查。`
                                : `${step.name} 请求你处理：\n${step.output.slice(0, 300)}`,
                              expectedOutput: isReviewBack ? `修正后的版本` : undefined,
                              contextFrom: isReviewBack ? [step.agentId] : undefined,
                            });
                          }
                          // 如果之前已完成，重置为 pending 重新执行
                          if (target.status === "done") {
                            target.status = "pending";
                            target.output = "";
                            target.time = 0;
                          }
                          send("step-reset", {
                            agent: step.agentId,
                            resetAgent: target.agentId,
                            resetName: target.name,
                            feedback: step.output.slice(0, 300),
                          });
                          // 只有尚未被驳回检测设置过时才覆盖 finalOutput（避免双重覆盖）
                          if (!finalOutput.includes("驳回】") && !finalOutput.includes("要求修改】")) {
                            finalOutput = `【${step.name} ${actionLabel}】\n${step.output}\n\n【${isReviewBack ? "需要修改的原内容" : "相关上下文"}】\n${accumulatedChain || "(无原内容)"}`;
                          }
                          progressMade = true;
                          send("step-update", {
                            results: steps.map(snapshot),
                            steps: steps.length,
                            iterations: iterationCount,
                            isComplete: false,
                            dispatcherMode: true,
                            revisionLoop: true,
                            resetAgent: target.name,
                            currentStatuses: steps.map(s => `${s.name}:${s.status}`),
                          });
                        } else if (!target) {
                          // @mention 指向流水线中不存在的智能体 → 截断输出
                          const mentionPos = step.output.indexOf(mention);
                          if (mentionPos >= 0) {
                            const lineStart = step.output.lastIndexOf("\n", mentionPos);
                            step.output = step.output.slice(0, lineStart >= 0 ? lineStart : mentionPos).trim();
                          }
                          finalOutput = step.output;
                        }
                      }
                      // 如果有未知 @mention 且存在调度统领，让调度统领重新评估
                      const unknownMentions = mentionMatches
                        .map(m => m.slice(1))
                        .filter(name => {
                          // 不是 dispatcher 自己 @ 自己
                          if (name === step.name || name === step.agentId) return false;
                          // 不在流水线中
                          return !steps.some(s => s.name === name || s.agentId === name);
                        });
                      if (unknownMentions.length > 0 && dispatcherIndex >= 0) {
                        send("flow-paused", {
                          reason: "dispatcher-review",
                          message: `${step.name} 尝试通知 ${unknownMentions.join("、")}，但这些智能体不在流水线中。请调度统领重新评估并安排可用的审查智能体。当前输出摘要：${step.output.slice(0, 200)}`,
                        });
                        workflowDone = true;
                        break;
                      }
                    }
                    // 立即自动流转：按角色优先级安排下一个待执行智能体（写手 → 审核 → 润色）
                    const roleOrder = { writer: 0, planner: 0, reviewer: 1, editor: 2, custom: 0 };
                    const nextPending = [...steps]
                      .filter(s =>
                        s.agentId !== step.agentId &&
                        s.agentId !== pipeline[dispatcherIndex] &&
                        s.status === "pending" &&
                        !dispatchPlan.find(d => d.agent === s.agentId)
                      )
                      .sort((a, b) => (roleOrder[a.role || "custom"] || 0) - (roleOrder[b.role || "custom"] || 0))[0];
                    if (nextPending) {
                      dispatchPlan.push({
                        agent: nextPending.agentId,
                        subTask: nextPending.systemPrompt.slice(0, 300) || `执行你的任务（${nextPending.name}）`,
                        expectedOutput: `输出你的任务结果`,
                      });
                      progressMade = true;
                      send("step-update", {
                        results: steps.map(snapshot), steps: steps.length,
                        iterations: iterationCount, isComplete: false,
                        dispatcherMode: true, autoRouted: true, routedAgent: nextPending.name,
                      });
                    }
                  } catch (err) {
                    step.output = `[错误] ${(err as Error).message}`;
                    step.time = 0;
                    step.status = "failed";
                    send("step-failed", snapshot(step));
                    send("step-update", {
                      results: steps.map(snapshot), steps: steps.length,
                      iterations: iterationCount, isComplete: false,
                    });
                  }
                }

                workflowDone = steps.every(s => s.status === "done" || s.agentId === pipeline[dispatcherIndex]);
                // 自动流转：如果还有待执行智能体不在计划中，添加到队列
                if (!workflowDone) {
                  // 按角色优先级：写手 → 审核 → 润色
                  const roleOrder = { writer: 0, planner: 0, reviewer: 1, editor: 2, custom: 0 };
                  const nextPending = [...steps]
                    .filter(s =>
                      s.agentId !== pipeline[dispatcherIndex] &&
                      s.status === "pending" &&
                      !dispatchPlan.find(d => d.agent === s.agentId)
                    )
                    .sort((a, b) => (roleOrder[a.role || "custom"] || 0) - (roleOrder[b.role || "custom"] || 0))[0];
                  if (nextPending) {
                    dispatchPlan.unshift({
                      agent: nextPending.agentId,
                      subTask: nextPending.systemPrompt.slice(0, 300) || `执行你的任务（${nextPending.name}）`,
                      expectedOutput: `输出你的任务结果`,
                    });
                    progressMade = true;
                    send("step-update", {
                      results: steps.map(snapshot),
                      steps: steps.length,
                      iterations: iterationCount,
                      isComplete: false,
                      dispatcherMode: true,
                      autoRouted: true,
                      routedAgent: nextPending.name,
                    });
                  }
                }
                if (!progressMade) {
                  // 安全检查：如果还有待执行智能体，不允许退出
                  const anyPending = steps.some(s =>
                    s.agentId !== pipeline[dispatcherIndex] && s.status === "pending"
                  );
                  if (anyPending) {
                    progressMade = true;
                  } else {
                    break;
                  }
                }
              }
            }

          } else {
            // 没有调度统领 → 智能协作模式必须配置调度统领
            send("flow-error", {
              error: "智能协作模式需要配置「调度统领」作为第一步。请在流水线中添加调度统领智能体，或将其标记为调度统领。",
              details: "无调度统领的流水线已不再支持，请使用模板或手动添加 dispatcher。",
            });
            workflowDone = true;
          }

          // 计算费用
          const usage = calcCost(totalInputTokens, totalOutputTokens, modelName);

          // 完成
          if (isAborted()) {
            send("flow-done", {
              results: steps.map(snapshot),
              steps: steps.length,
              iterations: iterationCount,
              isComplete: false,
              aborted: true,
              usage,
            });
            hooks.emitFlowDone({
              steps: steps.map(s => ({
                agentId: s.agentId, name: s.name, emoji: s.emoji,
                role: s.role, output: s.output, time: s.time,
                iteration: s.iteration, status: s.status,
              })),
              iterations: iterationCount,
              totalTime: steps.reduce((sum, s) => sum + s.time, 0),
              isComplete: false,
              usage,
              projectId,
            });
          } else {
            send("flow-done", {
              results: steps.map(snapshot),
              steps: steps.length,
              iterations: iterationCount,
              isComplete: workflowDone,
              totalTime: steps.reduce((sum, s) => sum + s.time, 0),
              usage,
            });
            hooks.emitFlowDone({
              steps: steps.map(s => ({
                agentId: s.agentId, name: s.name, emoji: s.emoji,
                role: s.role, output: s.output, time: s.time,
                iteration: s.iteration, status: s.status,
              })),
              iterations: iterationCount,
              totalTime: steps.reduce((sum, s) => sum + s.time, 0),
              isComplete: workflowDone,
              usage,
              projectId,
            });
          }
        } catch (err) {
          send("flow-error", { error: (err as Error).message });
        hooks.emitFlowError({ error: (err as Error).message, projectId });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return serverError("智能体协作失败", error, "AgentAPI");
  }
}
