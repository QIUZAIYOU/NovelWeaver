// components/ui/skeleton.tsx
// 骨架屏组件 - 用于加载状态

import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
