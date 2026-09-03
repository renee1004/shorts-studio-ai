import Link from "next/link";
import type { ComponentProps } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const sizeClasses = {
  sm: "h-8 px-3 text-[13px]",
  default: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
} as const;

type LinkButtonProps = ComponentProps<typeof Link> & {
  variant?: "default" | "outline" | "secondary" | "ghost" | "link";
  size?: keyof typeof sizeClasses;
};

export function LinkButton({
  variant = "default",
  size = "default",
  className,
  ...props
}: LinkButtonProps) {
  return (
    <Link
      className={cn(buttonVariants({ variant }), sizeClasses[size], className)}
      {...props}
    />
  );
}
