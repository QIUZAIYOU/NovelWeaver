// app/api/projects/[projectId]/graph/route.ts
// 关系图谱 API - 分析项目数据并返回节点+边

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notFound, serverError } from "@/lib/api/errors";

interface GraphNode {
  id: string;
  label: string;
  type: "character" | "lore" | "memory" | "outline" | "worldstate";
  group: string;
  subtitle?: string;
  /** 跳转路径（相对于 /projects/[projectId]/） */
  link?: string;
  /** 实体真实 ID（从 id 中提取的后缀） */
  entityId?: string;
}

interface GraphLink {
  source: string;
  target: string;
  type: "tag" | "mention" | "hierarchy" | "keyword";
  strength: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  stats: {
    totalNodes: number;
    totalLinks: number;
    byType: Record<string, number>;
  };
}

/**
 * 从 JSON 字符串中安全解析数组
 */
function safeParse<T>(json: string, fallback: T[] = []): T[] {
  try {
    const p = JSON.parse(json);
    return Array.isArray(p) ? p : fallback;
  } catch {
    return fallback;
  }
}

/**
 * 构建全量文本片段用于匹配检测
 */
function buildTextFingerprint(name: string, content: string): string {
  return (name + " " + content).toLowerCase();
}

/**
 * 检测两个文本片段间的关键词/名称提及关系
 */
function hasMention(text: string, targetName: string): boolean {
  if (!targetName || targetName.length < 2) return false;
  return text.includes(targetName.toLowerCase());
}

/** 获取所有关键词/标签的联合列表，用于匹配 */
function collectKeywords(tags: string[], keywords: string[]): string[] {
  const set = new Set<string>();
  for (const t of tags) if (t.length >= 2) set.add(t.toLowerCase());
  for (const k of keywords) if (k.length >= 2) set.add(k.toLowerCase());
  return Array.from(set);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return notFound("项目不存在");

    // 并行查询所有实体
    const [characters, loreEntries, memories, outlines, worldStates] = await Promise.all([
      prisma.character.findMany({ where: { projectId }, orderBy: { name: "asc" } }),
      prisma.loreEntry.findMany({ where: { projectId }, orderBy: { title: "asc" } }),
      prisma.memory.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.outline.findMany({ where: { projectId }, orderBy: { order: "asc" } }),
      prisma.worldState.findMany({ where: { projectId }, orderBy: { key: "asc" } }),
    ]);

    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const added = new Set<string>();

    // --- 构建节点 ---

    // 角色节点
    for (const c of characters) {
      nodes.push({
        id: `char:${c.id}`, label: c.name, type: "character", group: "角色",
        subtitle: c.age ? `${c.age}岁` : undefined,
        link: "characters",
        entityId: c.id,
      });
    }

    // 知识库词条节点
    for (const l of loreEntries) {
      nodes.push({
        id: `lore:${l.id}`, label: l.title, type: "lore", group: `知识库·${l.category}`,
        subtitle: l.category,
        link: "lore",
        entityId: l.id,
      });
    }

    // 记忆节点
    for (const m of memories) {
      nodes.push({
        id: `mem:${m.id}`, label: m.content.slice(0, 40) + (m.content.length > 40 ? "..." : ""),
        type: "memory", group: "记忆",
        subtitle: `重要度:${m.importance}`,
        link: "memory",
        entityId: m.id,
      });
    }

    // 大纲节点
    const levelLabels: Record<string, string> = {
      brainstorm: "灵感", master: "总纲", arc: "篇章", chapter: "章节",
    };
    for (const o of outlines) {
      nodes.push({
        id: `out:${o.id}`, label: o.title, type: "outline",
        group: `大纲·${levelLabels[o.level] || o.level}`,
        subtitle: levelLabels[o.level] || o.level,
        link: "outline",
        entityId: o.id,
      });
    }

    // 世界状态节点
    for (const w of worldStates) {
      nodes.push({
        id: `ws:${w.key}`, label: w.key, type: "worldstate",
        group: "世界状态", subtitle: w.value,
        link: "workspace",
      });
    }

    // --- 自动发现边 ---

    // 1. 构建标签/关键词索引
    interface TagIndex {
      entityId: string;
      keywords: string[];
      textFingerprint: string;
      name: string;
    }

    const charIndex: TagIndex[] = characters.map((c) => ({
      entityId: `char:${c.id}`, name: c.name.toLowerCase(),
      keywords: collectKeywords(safeParse<string>(c.tags), []),
      textFingerprint: buildTextFingerprint(c.name, c.personality + " " + c.backstory + " " + c.appearance),
    }));

    const loreIndex: TagIndex[] = loreEntries.map((l) => ({
      entityId: `lore:${l.id}`, name: l.title.toLowerCase(),
      keywords: collectKeywords([], safeParse<string>(l.keywords)),
      textFingerprint: buildTextFingerprint(l.title, l.content),
    }));

    const memIndex: TagIndex[] = memories.map((m) => ({
      entityId: `mem:${m.id}`, name: m.content.slice(0, 20).toLowerCase(),
      keywords: collectKeywords(safeParse<string>(m.tags), []),
      textFingerprint: buildTextFingerprint("", m.content),
    }));

    const outlineIndex: TagIndex[] = outlines.map((o) => ({
      entityId: `out:${o.id}`, name: o.title.toLowerCase(),
      keywords: [],
      textFingerprint: buildTextFingerprint(o.title, o.content),
    }));

    const wsIndex: TagIndex[] = worldStates.map((w) => ({
      entityId: `ws:${w.key}`, name: w.key.toLowerCase(),
      keywords: collectKeywords([], [w.key, w.value]),
      textFingerprint: buildTextFingerprint(w.key, w.value),
    }));

    const allIndexes = [...charIndex, ...loreIndex, ...memIndex, ...outlineIndex, ...wsIndex];

    function addLink(source: string, target: string, type: GraphLink["type"], strength: number) {
      const key = [source, target].sort().join("::");
      if (added.has(key)) return;
      added.add(key);
      links.push({ source, target, type, strength });
    }

    // 2. 关键词/标签匹配
    const MAX_LINKS = 300;
    for (const idx of allIndexes) {
      if (links.length > MAX_LINKS) break;
      for (const other of allIndexes) {
        if (idx.entityId >= other.entityId) continue;
        if (links.length > MAX_LINKS) break;

        // 检查关键词交集
        const matchedKws = idx.keywords.filter((kw) => other.keywords.includes(kw));
        if (matchedKws.length > 0) {
          addLink(idx.entityId, other.entityId, "tag", Math.min(matchedKws.length * 3, 10));
        }

        // 检查名称提及（名称出现在对方内容中）
        if (idx.name.length >= 2 && hasMention(other.textFingerprint, idx.name)) {
          addLink(idx.entityId, other.entityId, "mention", 5);
        }
        if (other.name.length >= 2 && hasMention(idx.textFingerprint, other.name)) {
          addLink(idx.entityId, other.entityId, "mention", 5);
        }
      }
    }

    // 3. 大纲层级关系
    for (const o of outlines) {
      if (o.parentId) {
        addLink(`out:${o.parentId}`, `out:${o.id}`, "hierarchy", 8);
      }
    }

    // 4. 世界状态与角色/词条的弱关联（key/value 出现在标签中）
    for (const ws of worldStates) {
      for (const ci of charIndex) {
        if (ci.keywords.includes(ws.key.toLowerCase()) || ci.keywords.includes(ws.value.toLowerCase())) {
          addLink(`ws:${ws.key}`, ci.entityId, "keyword", 3);
        }
      }
    }

    const byType: Record<string, number> = {};
    for (const n of nodes) {
      byType[n.group] = (byType[n.group] || 0) + 1;
    }

    const data: GraphData = {
      nodes,
      links,
      stats: {
        totalNodes: nodes.length,
        totalLinks: links.length,
        byType,
      },
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return serverError("构建关系图谱失败", error, "GraphAPI");
  }
}
