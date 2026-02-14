// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

import { forwardRef, type HTMLAttributes, type UIEvent, type RefObject, useCallback, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'vertical' | 'horizontal' | 'both';
  hideScrollbar?: boolean;
  fadeEdges?: boolean;
  onScrollEnd?: () => void;
  scrollEndThreshold?: number;
}

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
  (
    {
      orientation = 'vertical',
      hideScrollbar = false,
      fadeEdges = false,
      onScrollEnd,
      scrollEndThreshold = 50,
      className,
      children,
      onScroll,
      ...props
    },
    ref
  ) => {
    const [isAtTop, setIsAtTop] = useState(true);
    const [isAtBottom, setIsAtBottom] = useState(false);
    const internalRef = useRef<HTMLDivElement>(null);
    const scrollRef = (ref as RefObject<HTMLDivElement>) || internalRef;

    const handleScroll = useCallback(
      (e: UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        const { scrollTop, scrollHeight, clientHeight } = target;

        setIsAtTop(scrollTop === 0);
        setIsAtBottom(scrollTop + clientHeight >= scrollHeight - scrollEndThreshold);

        if (
          onScrollEnd &&
          scrollTop + clientHeight >= scrollHeight - scrollEndThreshold
        ) {
          onScrollEnd();
        }

        onScroll?.(e);
      },
      [onScroll, onScrollEnd, scrollEndThreshold]
    );

    const overflowClass = {
      vertical: 'overflow-y-auto overflow-x-hidden',
      horizontal: 'overflow-x-auto overflow-y-hidden',
      both: 'overflow-auto',
    };

    return (
      <div className={cn('relative', className)}>
        {fadeEdges && !isAtTop && orientation !== 'horizontal' && (
          <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-[#0D0D0F] to-transparent z-10 pointer-events-none" />
        )}

        <div
          ref={scrollRef}
          className={cn(
            'h-full',
            overflowClass[orientation],
            hideScrollbar && 'scrollbar-hide',
            !hideScrollbar && [
              'scrollbar-thin',
              'scrollbar-track-transparent',
              'scrollbar-thumb-white/10',
              'hover:scrollbar-thumb-white/20',
            ]
          )}
          onScroll={handleScroll}
          {...props}
        >
          {children}
        </div>

        {fadeEdges && !isAtBottom && orientation !== 'horizontal' && (
          <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[#0D0D0F] to-transparent z-10 pointer-events-none" />
        )}
      </div>
    );
  }
);

ScrollArea.displayName = 'ScrollArea';
