// hooks/use-agent-groups.ts
// 协作分组数据 Hook

"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/** 分组内的成员信息 */
interface GroupMember {
  id: string;
  name: string;
  emoji: string;
}

/** 分组数据 */
export interface AgentGroup {
  id: string;
  name: string;
  description: string;
  memberIds: string;
  members: GroupMember[];
}

/** API 返回的原始分组 */
interface RawGroup {
  id: string;
  name: string;
  description: string;
  memberIds: string;
}

/** 可供选择的智能体引用 */
interface AgentRef {
  id: string;
  name: string;
  emoji: string;
}

/** 解析成员 ID 数组 */
function parseMemberIds(s: string): string[] {
  try {
    const p = JSON.parse(s);
    return Array.isArray(p) ? p.filter((x: unknown) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// ─── Hook ──────────────────────────────────────────────────

export function useAgentGroups(
  projectId: string,
  builtinRefs: AgentRef[],
  customRefs: AgentRef[],
) {
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // 用 ref 存储 refs 数组，避免每次渲染的引用变化导致 useCallback 重建
  const builtinRefsRef = useRef(builtinRefs);
  const customRefsRef = useRef(customRefs);
  builtinRefsRef.current = builtinRefs;
  customRefsRef.current = customRefs;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/agent-groups`);
      const d = await r.json();
      if (d.success) {
        const allRefs = [...builtinRefsRef.current, ...customRefsRef.current];
        const resolved: AgentGroup[] = d.data.map((raw: RawGroup) => {
          const ids = parseMemberIds(raw.memberIds);
          const members: GroupMember[] = ids.map((id) => {
            const ref = allRefs.find((r) => r.id === id);
            return ref
              ? { id: ref.id, name: ref.name, emoji: ref.emoji }
              : { id, name: id, emoji: "❓" };
          });
          return { ...raw, members };
        });
        setGroups(resolved);
      }
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, [projectId]); // 不再依赖 builtinRefs / customRefs 数组引用

  useEffect(() => {
    load();
  }, [load]);

  return { groups, loading, reload: load };
}
