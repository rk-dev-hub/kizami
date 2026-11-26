import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[color,background-color,box-shadow,filter,transform] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary brand-fill brand-glow hover:brightness-110 active:translate-y-px",
        destructive:
          "bg-destructive text-destructive-foreground bg-[linear-gradient(135deg,var(--danger),color-mix(in_oklch,var(--danger)_75%,var(--brand-3)))] shadow-[0_8px_20px_-10px_var(--danger)] hover:brightness-110",
        outline:
          "border border-border-strong bg-surface/80 hover:bg-surface hover:border-[color-mix(in_oklch,var(--brand-1)_45%,var(--border-strong))] text-foreground shadow-xs",
        secondary: "bg-surface-2 text-foreground hover:bg-border",
        ghost: "text-foreground hover:bg-surface-2",
        soft: "brand-soft-fill text-primary-soft-foreground hover:bg-primary-soft",
        kizami:
          "border border-kizami-border bg-kizami bg-[linear-gradient(135deg,var(--kizami),color-mix(in_oklch,var(--kizami)_80%,var(--kizami-mark)))] text-kizami-foreground hover:brightness-[0.97]",
        link: "text-primary underline-offset-4 hover:underline px-0",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-12 px-6 text-base",
        xl: "h-16 px-8 text-lg rounded-xl",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
