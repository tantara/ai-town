import * as React from 'react';

import { cn } from '@/lib/utils';

type MessageBubbleProps = React.HTMLAttributes<HTMLDivElement> & {
  mine?: boolean;
};

export const MessageBubble = React.forwardRef<HTMLDivElement, MessageBubbleProps>(
  ({ className, mine = false, children, ...props }, ref) => (
    <div ref={ref} className={cn('bubble', mine && 'bubble-mine', className)} {...props}>
      <p className="bg-white -mx-3 -my-1">{children}</p>
    </div>
  ),
);
MessageBubble.displayName = 'MessageBubble';

type MessageRowProps = React.HTMLAttributes<HTMLDivElement> & {
  authorName: React.ReactNode;
  timestamp?: number;
};

export function MessageRow({
  authorName,
  timestamp,
  className,
  children,
  ...props
}: MessageRowProps) {
  return (
    <div className={cn('leading-tight mb-6', className)} {...props}>
      <div className="flex gap-4">
        <span className="uppercase flex-grow">{authorName}</span>
        {timestamp !== undefined && (
          <time dateTime={timestamp.toString()}>{new Date(timestamp).toLocaleString()}</time>
        )}
      </div>
      {children}
    </div>
  );
}
