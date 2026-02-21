import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md border text-[12px] font-medium tracking-[0.01em] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.99]',
  {
    variants: {
      variant: {
        default: 'border-white/[0.1] bg-white/[0.14] text-foreground hover:bg-white/[0.22]',
        secondary: 'border-white/[0.1] bg-[#1f2024] text-foreground hover:bg-[#27292f]',
        outline: 'border-white/[0.14] bg-transparent text-muted-foreground hover:bg-white/[0.1] hover:text-foreground',
        destructive: 'border-rose-400/[0.4] bg-rose-500/[0.18] text-rose-100 hover:bg-rose-500/[0.28]',
      },
      size: {
        default: 'h-8 px-3.5',
        sm: 'h-7 px-3 text-[11px]',
        lg: 'h-9 px-4 text-[12px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const Button = React.forwardRef(({ className, variant, size, ...props }, ref) => {
  return <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = 'Button';

export { Button, buttonVariants };
