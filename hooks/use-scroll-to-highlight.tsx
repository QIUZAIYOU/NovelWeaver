// hooks/use-scroll-to-highlight.tsx
// 滚动定位并高亮指定元素 — 配合图谱「前往查看」使用

"use client";

import { useEffect, useState } from "react";

/**
 * 从当前 URL 的 `?highlight=entityId` 参数中提取目标 ID，
 * 找到页面上 `data-entity-id={entityId}` 的元素并滚动到可视区域。
 *
 * @param containerRef 可选滚动容器 ref，不传则用 window.scrollTo
 * @returns 当前高亮的实体 ID
 */
export function useScrollToHighlight(
  containerRef?: React.RefObject<HTMLElement | null>
): string | null {
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    // 直接从 window.location 读取，避免 useSearchParams 的 Suspense 要求
    const params = new URLSearchParams(window.location.search);
    const id = params.get("highlight");
    if (!id) {
      setHighlightId(null);
      return;
    }

    setHighlightId(id);

    // 等待 DOM 渲染完成后查找元素
    const timeout = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-entity-id="${id}"]`);
      if (el) {
        // 添加高亮类
        el.classList.add("ring-2", "ring-primary", "ring-offset-2", "rounded-lg", "animate-pulse");
        // 滚动到可视区域
        if (containerRef?.current) {
          containerRef.current.scrollTo({
            top: el.offsetTop - containerRef.current.offsetTop - 80,
            behavior: "smooth",
          });
        } else {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        // 3 秒后移除高亮
        setTimeout(() => {
          el.classList.remove("ring-2", "ring-primary", "ring-offset-2", "rounded-lg", "animate-pulse");
        }, 3000);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [containerRef]);

  return highlightId;
}
