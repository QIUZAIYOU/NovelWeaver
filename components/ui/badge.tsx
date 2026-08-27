// components/ui/badge.tsx
// 徽章组件 - 基于 shadcn/ui 规范

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center border px-2 py-0.5 text-[11px] font-mono transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default:
          "border-border text-foreground bg-card",
        secondary:
          "border-border text-muted-foreground bg-background",
        destructive:
          "border-[#ff4444] text-[#ff4444] bg-transparent",
        outline:
          "border-border text-muted-foreground bg-transparent hover:border-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
