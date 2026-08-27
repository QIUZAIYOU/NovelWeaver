// hooks/use-context-menu.tsx
// 右键菜单 Hook — 支持位置自适应、子菜单

"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

export interface ContextMenuItem {
  label: string;
  icon?: React.ElementType;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
  children?: ContextMenuItem[];
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const show = useCallback((e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, []);

  const hide = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!menu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        hide();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [menu, hide]);

  const ContextMenuComponent = menu ? (
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[160px] bg-popover border border-border rounded-lg shadow-xl py-1"
      style={{
        left: Math.min(menu.x, window.innerWidth - 180),
        top: Math.min(menu.y, window.innerHeight - menu.items.length * 32 - 16),
      }}
    >
      {menu.items.map((item, i) => (
        item.divider ? (
          <div key={i} className="my-1 border-t border-border" />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => { item.onClick(); hide(); }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-smooth ${
              item.danger
                ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                : "text-foreground hover:bg-muted"
            } ${item.disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
          >
            {item.icon && <item.icon className="h-3.5 w-3.5 shrink-0" />}
            {item.label}
          </button>
        )
      ))}
    </div>
  ) : null;

  return { show, hide, ContextMenu: ContextMenuComponent };
}
