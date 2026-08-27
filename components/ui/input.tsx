// components/ui/input.tsx
// 输入框组件 — 暗色终端风格

import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-8 w-full border border-border bg-background px-2 py-1 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/60 outline-none focus-visible:ring-1 focus-visible:ring-ring focus:border-primary transition-colors disabled:cursor-not-allowed disabled:opacity-30",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
