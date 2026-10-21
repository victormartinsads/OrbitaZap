import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-[#00bcfe] text-white hover:bg-[#00ab94] shadow-sm",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
        outline:
          "border border-border bg-white text-foreground hover:bg-slate-50 hover:text-foreground shadow-xs",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-slate-200/70",
        ghost:
          "hover:bg-slate-100 text-slate-700 hover:text-foreground",
        link: "text-[#00bcfe] underline-offset-4 hover:underline",
        glass: "bg-white/80 backdrop-blur-md border border-slate-200 text-foreground hover:bg-white shadow-xs",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3 text-xs sm:text-sm",
        sm: "h-8 rounded-full gap-1.5 px-3 text-xs has-[>svg]:px-2.5",
        lg: "h-11 rounded-full px-6 text-sm has-[>svg]:px-4 font-bold",
        icon: "size-9 rounded-full",
        "icon-sm": "size-7 rounded-full",
        "icon-lg": "size-11 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ComponentProps<"button">,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
