// components/shared-sub-nav.tsx
// 子导航栏 — 暗色终端风格

"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface SubNavTab {
  label: string;
  href: string;
}

export function SharedSubNav({ tabs }: { tabs: SubNavTab[] }) {
  const pathname = usePathname();

  return (
    <div className="flex border-b border-border bg-background shrink-0">
      {tabs.map((tab) => {
        const isActive = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-3 py-1.5 text-[12px] font-mono transition-colors border-b border-transparent",
              isActive
                ? "text-[#00cc66] border-[#00cc66]"
                : "text-muted-foreground/60 hover:text-muted-foreground border-transparent",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
