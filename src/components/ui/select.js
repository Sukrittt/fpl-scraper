import * as React from 'react';
import { cn } from '../../lib/utils.js';

const Select = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
    <select
      ref={ref}
      className={cn(
        'flex h-8 w-full rounded-md border border-input/90 bg-[#121316] px-2.5 py-1.5 text-[12px] text-foreground shadow-inner ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
Select.displayName = 'Select';

export { Select };
