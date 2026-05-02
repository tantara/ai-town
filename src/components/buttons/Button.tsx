'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import { Button as UIButton } from '@/components/ui/button';

type GameButtonProps = {
  imgUrl: string;
  href?: string;
  title?: string;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>;
  children: React.ReactNode;
};

export default function Button({
  className,
  href,
  imgUrl,
  onClick,
  title,
  children,
}: GameButtonProps) {
  const inner = (
    <span className="inline-block bg-clay-700">
      <span className="inline-flex h-full items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="w-4 h-4 sm:w-[30px] sm:h-[30px]" src={imgUrl} alt="" />
        {children}
      </span>
    </span>
  );

  if (href) {
    return (
      <UIButton
        asChild
        variant="game"
        size="game"
        className={cn('text-xl', className)}
        title={title}
      >
        <a href={href} onClick={onClick as React.MouseEventHandler<HTMLAnchorElement>}>
          {inner}
        </a>
      </UIButton>
    );
  }

  return (
    <UIButton
      type="button"
      variant="game"
      size="game"
      className={cn('text-xl', className)}
      title={title}
      onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}
    >
      {inner}
    </UIButton>
  );
}
