// app/api/projects/[projectId]/compile/route.ts
// 文档汇编 API — 将创作空间中的 AI 产出自动整理为规范档案格式

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError, handleJsonError } from "@/lib/api/errors";

const DOC_TEMPLATES: Record<string, string> = {
  mission: `# 任务报告\n\n**档案编号**: {{code}}\n**任务名称**: {{title}}\n**日期**: {{date}}\n**撰写人**: {{writer}}\n\n## 任务概要\n\n{{content}}\n\n## 参与人员\n\n{{personnel}}\n\n## 任务经过\n\n{{detail}}\n\n## 发现与结论\n\n{{conclusion}}\n\n## 附件\n\n{{attachments}}`,

  report: `# 调查报告\n\n**档案编号**: {{code}}\n**调查主题**: {{title}}\n**调查日期**: {{date}}\n**调查人**: {{writer}}\n\n## 背景\n\n{{content}}\n\n## 调查过程\n\n{{detail}}\n\n## 证据\n\n{{evidence}}\n\n## 结论与建议\n\n{{conclusion}}`,

  interview: `# 访谈记录\n\n**档案编号**: {{code}}\n**受访者**: {{title}}\n**访谈人**: {{writer}}\n**日期**: {{date}}\n\n## 访谈背景\n\n{{content}}\n\n## 访谈记录\n\n{{detail}}\n\n## 访谈人备注\n\n{{conclusion}}`,

  log: `# 行动日志\n\n**日志编号**: {{code}}\n**行动名称**: {{title}}\n**日期**: {{date}}\n**记录人**: {{writer}}\n\n## 日志正文\n\n{{content}}\n\n{{detail}}`,

  assessment: `# 评估报告\n\n**档案编号**: {{code}}\n**评估对象**: {{title}}\n**评估人**: {{writer}}\n**日期**: {{date}}\n\n## 评估目的\n\n{{content}}\n\n## 评估结果\n\n{{detail}}\n\n## 建议\n\n{{conclusion}}`,

  item: `# 物品记录\n\n**物品编号**: {{code}}\n**物品名称**: {{title}}\n**记录人**: {{writer}}\n**安全等级**: {{classification}}\n\n## 描述\n\n{{content}}\n\n## 异常特性\n\n{{detail}}\n\n## 收容措施\n\n{{conclusion}}`,

  event: `# 事件记录\n\n**事件编号**: {{code}}\n**事件名称**: {{title}}\n**记录日期**: {{date}}\n**记录人**: {{writer}}\n\n## 事件概述\n\n{{content}}\n\n## 详细经过\n\n{{detail}}\n\n## 影响评估\n\n{{conclusion}}\n\n## 后续措施\n\n{{attachments}}`,
};

const TYPE_LABELS: Record<string, string> = {
  mission: "任务报告", report: "调查报告", interview: "访谈记录",
  log: "行动日志", assessment: "评估报告", item: "物品描述", event: "事件记录",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return notFound("项目不存在");

    let body: Record<string, unknown>;
    try { body = await request.json(); } catch (error) { return handleJsonError(error); }

    const messageIds = body.messageIds as string[] | undefined;
    const docType = (body.docType as string) || "mission";
    const title = (body.title as string) || "未命名档案";
    const writerId = (body.writerId as string) || null;
    const classification = (body.classification as string) || "internal";

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return badRequest("请选择要汇编的消息");
    }

    // 获取选中的消息
    const messages = await prisma.message.findMany({
      where: { id: { in: messageIds }, projectId },
      orderBy: { createdAt: "asc" },
    });

    if (messages.length === 0) return badRequest("未找到指定的消息");

    // 提取角色名
    const getCharacterName = (msg: { role: string; metadata: string; content: string }) => {
      if (msg.role === "user") {
        const match = msg.content.match(/@(\S+)/);
        if (match) return match[1];
      }
      if (msg.role === "assistant") {
        try { const meta = JSON.parse(msg.metadata); if (meta.characterName) return meta.characterName; } catch {}
      }
      return msg.role === "assistant" ? "AI" : "用户";
    };

    // 构建原始对话记录
    const dialogue = messages.map((m) => {
      const speaker = getCharacterName(m);
      return `【${speaker}】\n${m.content}`;
    }).join("\n\n---\n\n");

    // 提取参与者
    const participants = new Set<string>();
    for (const m of messages) {
      const name = getCharacterName(m);
      if (name !== "用户" && name !== "AI") participants.add(name);
    }
    const personnelStr = participants.size > 0 ? Array.from(participants).map((n) => `- ${n}`).join("\n") : "（无）";

    // 尝试提取关键信息
    const extractSection = (content: string, keyword: string): string => {
      const lines = content.split("\n");
      const idx = lines.findIndex((l) => l.includes(keyword));
      if (idx >= 0) return lines.slice(idx, idx + 5).join("\n");
      return "";
    };

    const template = DOC_TEMPLATES[docType] || DOC_TEMPLATES.mission;
    const detail = `## 原始对话\n\n${dialogue}`;

    // 生成档案编号
    const count = await prisma.mission.count({ where: { projectId } });
    const prefix = { mission: "M", report: "RPT", interview: "INT", log: "LOG", assessment: "ASM", item: "OBJ", event: "EVT" };
    const code = `${prefix[docType as keyof typeof prefix] || "DOC"}-${String(count + 1).padStart(4, "0")}`;

    const now = new Date().toISOString().split("T")[0];

    // 获取撰写人姓名
    let writerName = "（未指定）";
    if (writerId) {
      const char = await prisma.character.findUnique({ where: { id: writerId } });
      if (char) writerName = char.name;
    }

    const compiled = template
      .replace(/\{\{code\}\}/g, code)
      .replace(/\{\{title\}\}/g, title)
      .replace(/\{\{date\}\}/g, now)
      .replace(/\{\{writer\}\}/g, writerName)
      .replace(/\{\{classification\}\}/g, classification)
      .replace(/\{\{content\}\}/g, messages.map(m => m.content).join("\n\n").slice(0, 500))
      .replace(/\{\{detail\}\}/g, detail)
      .replace(/\{\{personnel\}\}/g, personnelStr)
      .replace(/\{\{conclusion\}\}/g, "（待补充）")
      .replace(/\{\{evidence\}\}/g, "（待补充）")
      .replace(/\{\{attachments\}\}/g, "（无）");

    return NextResponse.json({
      success: true,
      data: {
        code,
        title,
        type: docType,
        content: compiled,
        writerId,
        classification,
      },
      message: `已汇编为${TYPE_LABELS[docType] || "档案"}文档`,
    });
  } catch (error) {
    return serverError("文档汇编失败", error, "CompileAPI");
  }
}
