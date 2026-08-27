// components/ui/button.tsx
// 按钮组件 - 基于 shadcn/ui 规范

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-[12px] font-mono transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-30 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 border-0",
        destructive: "border border-destructive text-destructive bg-transparent hover:bg-destructive/10",
        outline: "border border-border text-muted-foreground bg-transparent hover:border-border hover:text-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border-0",
        ghost: "text-muted-foreground hover:text-foreground hover:bg-accent border-0",
        link: "text-[#00aaff] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3 py-1.5",
        sm: "h-7 px-2 py-1",
        lg: "h-9 px-4 py-2",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
