// components/ui/textarea.tsx
// 多行文本框组件 — 暗色终端风格

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex w-full border border-border bg-background px-2 py-1.5 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/60 outline-none focus-visible:ring-1 focus-visible:ring-ring focus:border-primary transition-colors disabled:cursor-not-allowed disabled:opacity-30 resize-none min-h-[60px]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
