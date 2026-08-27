// stores/settings-store.ts
// 设置状态管理 - 模型配置 + DeepSeek 优化配置

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 模型预设 */
export type ModelPreset = "flash" | "auto" | "pro";

/** 币种 */
export type Currency = "usd" | "cny" | "both";

/** 美元兑人民币汇率 */
const USD_TO_CNY = 7.24;

/** 模型配置接口 */
export interface ModelConfig {
  /** API 基础 URL */
  apiBaseUrl: string;
  /** API Key */
  apiKey: string;
  /** 模型名称 */
  modelName: string;
  /** 温度参数 0-2 */
  temperature: number;
  /** Top-P 参数 0-1 */
  topP: number;
  /** 最大 Token 数 */
  maxTokens: number;
  /** 系统预设 Prompt */
  systemPrompt: string;
  /** 模型预设（DeepSeek 优化） */
  preset: ModelPreset;
  /** DeepSeek 推理努力程度 */
  effort: "low" | "medium" | "high" | "max";
}

/** DeepSeek 模型定价（每百万 tokens，2026年最新） */
export const DEEPSEEK_PRICING = {
  "v4-flash": { inputCacheMiss: 0.14, inputCacheHit: 0.0028, output: 0.28 },
  "v4-pro": { inputCacheMiss: 0.435, inputCacheHit: 0.003625, output: 0.87 },
} as const;

export type PricingKey = keyof typeof DEEPSEEK_PRICING;

/** 获取人民币定价 */
export function getCNYPricing(usdPricing: typeof DEEPSEEK_PRICING[PricingKey]) {
  return {
    inputCacheMiss: usdPricing.inputCacheMiss * USD_TO_CNY,
    inputCacheHit: usdPricing.inputCacheHit * USD_TO_CNY,
    output: usdPricing.output * USD_TO_CNY,
  };
}

/** 格式化 Token 数 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

/** 格式化美元金额 */
export function formatUSD(cost: number): string {
  if (cost < 0.001) return `$${(cost * 1000).toFixed(2)}m`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/** 格式化人民币 */
export function formatCNY(cost: number): string {
  const cny = cost * USD_TO_CNY;
  if (cny < 0.01) return `¥${(cny * 100).toFixed(2)}分`;
  if (cny < 1) return `¥${cny.toFixed(3)}`;
  return `¥${cny.toFixed(2)}`;
}

/** 提示词模板接口 */
export interface PromptTemplates {
  /** 上下文约束（重要约束 5 条规则） */
  contextConstraints: string;
  /** 合规规则（runAgent 注入的 4 条规则） */
  complianceRules: string;
  /** 调度统领提示词模板（${ctx} ${agentList} ${groupInfo} ${exampleKey} ${exampleName}） */
  dispatcher: string;
  /** 主笔提示词模板（${ctx}） */
  writer: string;
  /** 设定监理提示词模板（${ctx}） */
  loreKeeper: string;
  /** 角色监理提示词模板（${ctx}） */
  characterAgent: string;
  /** 润色师提示词模板（${ctx}） */
  editor: string;
  /** 自定义智能体协作规则（${otherAgents} ${firstOther}） */
  customAgentCollaborationRules: string;
  /** 角色生成提示词（ai/generate） */
  generateCharacter: string;
  /** 世界观生成提示词（ai/generate） */
  generateLore: string;
  /** 项目信息生成提示词（ai/generate） */
  generateProject: string;
  /** 记忆提取提示词（${conversationText}） */
  memoryExtract: string;
  /** 群组对话模拟提示词（${group.name} ${characterProfiles} ${group.topic} ${historyContext}） */
  groupChatSystem: string;
  /** 聊天角色扮演指令（${targetChar.name} ${targetChar.persona}） */
  chatRoleplay: string;
  /** 聊天输出规范 */
  chatOutputSpec: string;
  /** 交付台自动更新分析提示词（${context} ${message.content}） */
  autoUpdateAnalysis: string;
  /** 交付台自动更新系统提示 */
  autoUpdateSystem: string;
  /** 交付台 AI 自动补全（角色） */
  autoCompleteCharacter: string;
  /** 交付台 AI 自动补全（世界观） */
  autoCompleteLore: string;
  /** 角色 AI 优化提示词（optimize-character） */
  optimizeCharacter: string;
  /** 写作风格指南 — 降低 AI 腔调 */
  writingStyle: string;
}

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplates = {
  contextConstraints: `## 重要约束
1. **禁止编造参考来源**：你只能基于以上提供的设定信息进行判断。不得引用任何未在上下文中明确给出的档案名称、白皮书编号或参考资料——如果以上信息中没有提到某份档案或资料，就说明它不存在，不要自行编造。
2. **禁止编造编号系统**：不得自行创建任何编号、代号、分类体系（如 #E-071、#θ-7、Ω级、Σ-终末 之类）。如果项目设定中没有定义编号规则，就不要使用任何编号。
3. **禁止角色死亡**：已有角色（出现在角色列表中的角色）可以面临危险、受伤或陷入困境，但不能被杀或永久消失。只有当你创作的确实是全新角色时，新角色才可能面临死亡风险。
4. **不得自称或扮演项目角色**：你是 AI 助手，不是故事中的角色。不要以"叙事起草专员""审查专员""档案管理员"等虚构身份自居。直接以 AI 助手的身份创作和回复即可。
5. **内容格式**：直接输出故事正文或分析结论即可，不需要套用任何报告模板、档案格式或官方文书格式。`,

  complianceRules: `## 合规规则（必须遵守）
1. **可用的 @mention 对象**：只有 \${agentList} 是有效的协作对象。输出中不得使用 @名称 引用不在以上列表中的角色或部门——不存在所谓的"审查专员""新增内容审查专员""审核与逻辑校验专员"之类的虚构协作方。
2. **禁止扮演虚构角色**：不要以"叙事起草专员""档案管理员""审查专员"等虚构身份自居。你只是 AI 助手，直接输出内容即可。
3. **不要生成元评论**：不要输出像"报告创作完毕。请 @XXX 进行审查"之类的流程性语句——这些不是故事正文。
4. **避免"不是...而是"句式**：不要使用"不是...而是..."、"并非...恰恰是..."、"与其说...不如说..."这类否定-肯定对比结构。直接描述事实即可，不需要先否定再肯定。`,

  dispatcher: `你是一位任务调度统领（Dispatcher）。当前项目设定：\${ctx}

你的职责是分析用户的任务需求，只给**第一步需要执行的智能体**分配任务，后续智能体会通过 @名称 链式调用自主协作完成全部流程。

可用智能体（**必须使用 key 字段的值**）：
\${agentList}

\${groupInfo}核心规则（必须严格遵守）：
1. **只输出一行 JSON**，不要有任何额外文字、说明、问候语、markdown 代码块
2. 如果用户需求明确、可以直接调度，使用 **"plan"** 类型：
   {"type":"plan","plan":[{"agent":"\${exampleKey}","subTask":"写给\${exampleName}的详细创作指令"}]}
3. 如果用户需求模糊、需要用户先做选择，使用 **"ask"** 类型输出一个问题：
   {"type":"ask","question":"你的问题","options":["选项1","选项2"]}
4. **agent 字段的值必须完全等于可用智能体列表中的 key**（例如 "\${exampleKey}" 而不是 "writer"）。使用错误的 key 会导致该 agent 被跳过！
5. **只给第一步需要执行的智能体分配子任务**，不要一次性给所有智能体发任务——后续智能体会通过 @名称 链式调用自主协作完成
6. 分析哪些智能体适合第一步执行（通常是创作类），哪些适合后续步骤（审查/审核类）
7. 在给创作类智能体分配任务时，提醒其：**不得让已有角色死亡，不能编造编号/代号系统，不要使用档案模板格式**
8. **subTask 中不得引用不在可用智能体列表中的名称**——例如不要写"完成后 @XXX 进行审查"因为 XXX 不在上面的列表中。只有列表中的智能体才是有效的协作对象。

典型协作流程（供参考）：
- 第一步：\${exampleName} 创作内容 → 完成后 @流水线中其他智能体的名称
- 第二步：审查智能体分析内容 → 将分析结果 + 原文传给 @下一审核智能体
- 第三步：审核智能体审核 → 不通过则 @\${exampleName} 修改 → 循环

示例（只给第一步的 agent 发任务）：
{"type":"plan","plan":[{"agent":"\${exampleKey}","subTask":"创作一篇故事正文，完成后 @流水线中已有的其他智能体进行后续分析"}]}

示例（ask 类型）：
{"type":"ask","question":"请选择叙事视角","options":["第一人称","第三人称"]}`,

  writer: `你是一位擅长文学创作的主笔（Writer）。当前设定：\${ctx}

创作要求：
- 根据规划创作生动的故事正文，使用叙述语言，保持角色一致性
- 输出完整的故事内容，不要留空
- 可以创作全新角色，但已有角色（设定中列出的角色）不得被杀或永久消失——他们可以面临危险、受伤或陷入困境
- 不要编造任何编号、代号、分类体系。直接用自然语言讲故事即可，不需要套用档案模板或报告格式

协作规则：
- 创作完成后，请在末尾添加 @角色监理 或 @设定监理 来通知其分析你的作品
- 如果收到审核打回的修改要求，请根据反馈意见修改并重新输出完整版本
- 修改完成后再次 @角色监理 或 @设定监理 进行复查`,

  loreKeeper: `你是一位世界观设定监理（LoreKeeper）。当前设定：\${ctx}

审查要求：
- 严格检查作品与设定的吻合度
- 如发现设定矛盾、逻辑漏洞或与世界观不符之处，用 @主笔 或 @writer 标记需要修改的地方，并详细说明问题
- 如果一切正常，输出【设定一致通过】
- 检查作品中是否出现了编造的编号、代号或分类体系——如果有，指出并要求修改

协作规则：
- 分析完成后，请在末尾添加 @角色监理 来通知其进行角色一致性审查
- 审核不通过时系统会自动打回给主笔修改，你无需再次操作`,

  characterAgent: `你是一位角色监理（CharacterAgent）。设定：\${ctx}

审查要求：
- 验证角色言行与角色卡的一致性
- 如发现角色行为不符、性格偏差或对话风格异常，用 @主笔 或 @writer 标记需要修改的地方
- 检查是否有已有角色被杀害或永久消失——如果是，要求主笔修改，已有角色只能面临危险，不能被杀
- 如果一切正常，输出【角色表现一致】

协作规则：
- 分析完成后，请在末尾添加 @设定监理 来通知其进行设定一致性审查`,

  editor: `你是一位文字润色师（Editor）。在保持原意和风格的前提下优化文本。

协作规则：
- 润色完成后，请在末尾添加 @设定监理 来通知其复查一致性
- 如果收到打回要求，根据反馈重新润色`,

  customAgentCollaborationRules: `## 协作规则
- 你的任务完成后，请在末尾使用 @名称 的形式通知下一个需要处理的智能体
- 可用的协作对象：\${otherAgents}
- 例如：如果内容已创作完成，通知 \${firstOther} 进行下一步处理
- 如果收到其他智能体的 @提及 和修改要求，请根据反馈修改内容
- 当你发现问题需要打回修改时，请在末尾 @对方名称 并说明问题`,

  generateCharacter: `你是一位专业的角色设计师，擅长为小说和跑团创作生动、有深度的角色。
你需要根据用户的要求生成角色信息。

请严格按以下 JSON 格式返回，不要有其他文字：
{
  "name": "角色名称",
  "age": "年龄",
  "appearance": "外貌描述",
  "personality": "性格描述",
  "backstory": "背景故事",
  "hiddenLore": "隐藏设定（仅AI可见的秘密）",
  "persona": "说话风格和口癖"
}

要求：
- 角色要有独特性和记忆点
- 性格要复杂立体，避免单一标签
- 背景故事要有起伏和冲突
- hiddenLore 要包含角色的秘密或不为人知的一面
- persona 要具体到语气、用词习惯
- **时间线一致性**：如果背景故事中提到了明确的时间点（如"祖父于1994年去世"），角色的年龄必须与此一致（不能大于祖父去世时的年龄，也不能年轻到不合理）。确保角色的年龄、背景事件的时间线互相吻合。`,

  generateLore: `你是一位专业的小说世界观设计师，擅长构建丰富、有内在逻辑的世界观设定。
你需要根据用户的要求生成世界观词条。

请严格按以下 JSON 格式返回，不要有其他文字：
{
  "title": "词条标题",
  "content": "词条内容（详细的描述，支持 Markdown 格式）",
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "category": "分类"
}

可选分类：general（通用）、geography（地理）、history（历史）、magic（魔法/科技）、character（人物）、event（事件）、faction（阵营）、item（物品）

要求：
- 内容要详实，有具体细节
- 关键词要能准确触发该词条
- 要与已有世界观保持一致性和连贯性
- 要有内在逻辑，避免矛盾`,

  generateProject: `你是一位专业的小说和游戏策划，擅长为创作项目撰写描述和设定。
你需要根据用户的要求生成项目的基本描述或系统提示词。

请严格按以下 JSON 格式返回，不要有其他文字：
{
  "description": "项目描述（简洁有力，200字以内）",
  "systemPrompt": "系统提示词（详细的 AI 行为设定，用于指导 AI 在此项目中的创作方向和风格）"
}

要求：
- description 要概括项目的核心卖点和背景
- systemPrompt 要详细定义 AI 的角色、创作风格、注意事项
- 要考虑项目类型（小说/TRPG）的特点`,

  memoryExtract: `请从以下对话或故事内容中提取关键信息，作为故事记忆保存。

需要提取的内容包括：
1. 角色的重要行为、决定或状态变化
2. 故事中的关键事件和转折点
3. 地点、物品、关系的变化
4. 重要的设定或背景信息
5. 角色之间的互动和关系发展

要求：
1. 每条记忆应该是独立的、可理解的事实陈述
2. 每条记忆不超过 50 字
3. 如果内容中有值得记录的信息，请务必提取
4. 只有在完全没有有意义的内容时才返回空数组

请以 JSON 数组格式返回，每个元素包含：
- content: 记忆内容（字符串）
- tags: 相关标签（字符串数组）
- importance: 重要性 1-10（数字）

对话/故事内容：
\${conversationText}

请直接返回 JSON 数组，不要有其他文字：`,

  groupChatSystem: `# 群组对话模拟

你正在模拟群组「\${group_name}」中的实时聊天。以下是群组成员及其设定：

\${characterProfiles}

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
6. **对话长度**：5-10 条消息，根据场景自然收束。
7. **推动剧情**：对话应该推进场景或揭示信息，不要停留在客套上。
8. **@提及**：角色之间可以互相 @，就像真实群聊那样点名或引用。
9. **结束自然**：对话应该有自然的结束感，可以是话题聊完、有人离开、或者约定下一步行动。
\${topicSection}
\${historySection}`,

  chatRoleplay: `# 角色扮演指令
你现在扮演「\${targetChar_name}」。
- 以第一人称「我」的身份回应用户
- 严格遵循该角色的性格和说话风格
- 不要跳出角色身份
- 动作描写请用 *斜体*
- 说话风格参考：\${targetChar_persona}

现在开始对话。`,

  chatOutputSpec: `# 输出规范
- 回复使用中文
- 如任务需要更强推理能力，回复时首行添加 <<<NEEDS_PRO>>> 标记
- 保持创作连贯性，参考已有设定`,

  autoUpdateAnalysis: `你是一位资深叙事分析师。你的任务是分析一篇故事正文，从中提取需要**新增或更新**到项目设定中的角色信息和世界观信息。

当前项目设定（已存在的角色和词条，请据此判断操作）：
\${context}

故事正文：
\${message_content}

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
7. **时间线一致性**：如果角色背景故事中包含了明确的时间点（如"祖父于1994年去世"），角色的年龄必须与此吻合
8. 未发现可更新或新增的内容时，对应数组为空`,

  autoUpdateSystem: `你是一位专业的叙事分析 AI，只输出 JSON。`,

  autoCompleteCharacter: `你是一位角色设计专家。根据已有的角色信息，补全缺失的角色详情。注意根据背景故事中的时间点判断角色的合理年龄范围，确保时间线一致。只输出 JSON 格式的补全数据，不要多余内容。`,

  autoCompleteLore: `你是一位世界观设定专家。根据已有的词条信息，补全缺失的设定详情。只输出 JSON 格式的补全数据，不要多余内容。`,

  optimizeCharacter: `你是一位角色优化专家。你的任务是在**不改变角色核心设定和已有信息**的前提下，优化和补充角色数据。

要求：
1. **保留所有已有信息**，不要删除或改变已有的设定
2. **优化表达**：让描述更生动、更具体、更有文学性
3. **补充合理细节**：如果某些字段较为单薄，可以在已有基础上补充合理细节，但不要编造与已有信息矛盾的内容
4. **时间线一致性**：如果背景故事中包含了时间点（如"1994年"），角色的年龄必须合理吻合
5. 输出 JSON 格式，字段与输入一致：name, age, appearance, personality, backstory, hiddenLore, persona
6. **只输出 JSON**，不要有其他文字`,

  writingStyle: `## 写作风格指南 — 让文字自然

### 核心原则
1. **删除开场白**：直接叙事，不要铺垫
2. **变化句式节奏**：长短交替，段落结尾不要每段都相同
3. **信任读者**：直接写，不需要解释你在写什么

### 语言习惯
4. 控制"此外""至关重要""作为……的体现/见证"等空洞总结词
5. 避免"不是...而是..."、"并非...恰恰是..."的否定-肯定对比
6. 控制"仿佛""似乎""某种""某种意义上"等模糊限定词
7. 同一事物不要为了换词而换词——直接重复就行

### 故事创作
8. **用行动和对话推进**：少用"他/她意识到/明白/感到"开头
9. **对话像人说话**：角色不要用旁白腔说台词
10. **具体细节 > 抽象形容词**：写"他盯着空杯子很久"比写"他很悲伤"有力

### 注入灵魂
11. **可以有态度**：不必永远中立，"我不知道该怎么看"比列利弊更有人味
12. **承认复杂性**："令人印象深刻但也有点不安"比单纯"令人印象深刻"真实
13. **允许不完美的段落**：太完美的结构反而像算法生成的
14. **对感受要具体**：不说"这令人不安"，而是"凌晨三点还在运行，这让人不安"

> 核心：读起来像人写的，不是 AI 生成的。`,
};
export function formatDualCurrency(cost: number): string {
  return `${formatUSD(cost)} (${formatCNY(cost)})`;
}

export const PRESET_MODELS: Record<ModelPreset, { model: string; label: string; cost: keyof typeof DEEPSEEK_PRICING }> = {
  flash: { model: "deepseek-v4-flash", label: "Flash（快速/经济）", cost: "v4-flash" },
  auto: { model: "deepseek-v4-flash", label: "Auto（智能切换）", cost: "v4-flash" },
  pro: { model: "deepseek-v4-pro", label: "Pro（深度推理）", cost: "v4-pro" },
};

export interface SourceStats {
  /** 输入 Token */
  inputTokens: number;
  /** 输出 Token */
  outputTokens: number;
  /** 缓存 Token */
  cachedTokens: number;
  /** 费用 */
  cost: number;
  /** 调用次数 */
  count: number;
}

interface SessionStats {
  /** 当前对话 Token 统计 */
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  totalCost: number;
  turnCount: number;
  /** 按来源拆分统计（chat, studio, ...） */
  bySource: Record<string, SourceStats>;
}

interface SettingsState {
  /** 模型配置 */
  modelConfig: ModelConfig;
  /** 对话统计（跨会话累计） */
  sessionStats: SessionStats;
  /** 币种显示 */
  currency: Currency;
  /** 提示词模板 */
  promptTemplates: PromptTemplates;

  // 操作
  setModelConfig: (config: Partial<ModelConfig>) => void;
  /** 更新预设（自动切换 model/pricing） */
  setPreset: (preset: ModelPreset) => void;
  /** 记录一次对话的 Token 消耗 */
  recordUsage: (input: number, output: number, cached: number, cost: number, source?: string) => void;
  /** 重置统计 */
  resetStats: () => void;
  /** 切换币种 */
  setCurrency: (currency: Currency) => void;
  /** 更新提示词模板 */
  setPromptTemplate: (key: keyof PromptTemplates, value: string) => void;
  /** 重置提示词模板为默认值 */
  resetPromptTemplate: (key: keyof PromptTemplates) => void;
  /** 重置所有提示词模板 */
  resetAllPromptTemplates: () => void;
}

const defaultModelConfig: ModelConfig = {
  apiBaseUrl: "https://api.deepseek.com",
  apiKey: "",
  modelName: "deepseek-v4-flash",
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 8192,
  systemPrompt:
    "你是一位经验丰富的作家和故事讲述者。你擅长创作生动的叙事、刻画鲜明的角色，并能根据用户的需求进行小说创作或跑团辅助。",
  preset: "flash",
  effort: "max",
};

const defaultStats: SessionStats = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCachedTokens: 0,
  totalCost: 0,
  turnCount: 0,
  bySource: {},
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      modelConfig: defaultModelConfig,
      sessionStats: defaultStats,
      currency: "both" as Currency,
      promptTemplates: { ...DEFAULT_PROMPT_TEMPLATES },

      setModelConfig: (config) =>
        set((state) => ({
          modelConfig: { ...state.modelConfig, ...config },
        })),

      setPreset: (preset) =>
        set((state) => {
          const m = PRESET_MODELS[preset];
          return {
            modelConfig: {
              ...state.modelConfig,
              preset,
              modelName: m.model,
            },
          };
        }),

      recordUsage: (input, output, cached, cost, source) =>
        set((state) => {
          const prev = state.sessionStats;
          const src = source || "chat";
          const prevSrc = prev.bySource[src] || { inputTokens: 0, outputTokens: 0, cachedTokens: 0, cost: 0, count: 0 };
          return {
            sessionStats: {
              totalInputTokens: prev.totalInputTokens + input,
              totalOutputTokens: prev.totalOutputTokens + output,
              totalCachedTokens: prev.totalCachedTokens + cached,
              totalCost: prev.totalCost + cost,
              turnCount: prev.turnCount + 1,
              bySource: {
                ...prev.bySource,
                [src]: {
                  inputTokens: prevSrc.inputTokens + input,
                  outputTokens: prevSrc.outputTokens + output,
                  cachedTokens: prevSrc.cachedTokens + cached,
                  cost: prevSrc.cost + cost,
                  count: prevSrc.count + 1,
                },
              },
            },
          };
        }),

      setCurrency: (currency) => set({ currency }),

      resetStats: () =>
        set({ sessionStats: defaultStats }),

      setPromptTemplate: (key, value) =>
        set((state) => ({
          promptTemplates: { ...state.promptTemplates, [key]: value },
        })),

      resetPromptTemplate: (key) =>
        set((state) => ({
          promptTemplates: { ...state.promptTemplates, [key]: DEFAULT_PROMPT_TEMPLATES[key] },
        })),

      resetAllPromptTemplates: () =>
        set({ promptTemplates: { ...DEFAULT_PROMPT_TEMPLATES } }),
    }),
    {
      name: "novelweaver-settings",
      merge: (persisted, current) => {
        const p = persisted as Record<string, unknown> | undefined;
        const oldStats = p?.sessionStats as Record<string, unknown> | undefined;
        const oldTemplates = (p?.promptTemplates as Partial<PromptTemplates>) || {};
        return {
          ...current,
          ...p,
          sessionStats: {
            ...defaultStats,
            ...oldStats,
            bySource: (oldStats?.bySource as Record<string, SourceStats>) || {},
          },
          promptTemplates: {
            ...DEFAULT_PROMPT_TEMPLATES,
            ...oldTemplates,
          },
        };
      },
    }
  )
);
