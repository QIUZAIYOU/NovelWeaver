// hooks/use-scroll-preservation.ts
// 弹窗打开/关闭时保持页面滚动位置不变

"use client";

import { useEffect, useRef } from "react";

export function useScrollPreservation(active: boolean) {
  const scrollPosRef = useRef(0);

  useEffect(() => {
    const container = document.querySelector(".flex-1.overflow-y-auto");
    if (active && container) {
      scrollPosRef.current = container.scrollTop;
    } else if (!active && scrollPosRef.current > 0) {
      requestAnimationFrame(() => {
        const c = document.querySelector(".flex-1.overflow-y-auto");
        if (c) c.scrollTop = scrollPosRef.current;
      });
    }
  }, [active]);
}
