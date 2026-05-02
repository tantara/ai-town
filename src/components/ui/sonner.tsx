'use client';

import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-brown-800 group-[.toaster]:text-white group-[.toaster]:border-brown-900 group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-brown-200',
          actionButton:
            'group-[.toast]:bg-clay-700 group-[.toast]:text-white',
          cancelButton:
            'group-[.toast]:bg-brown-700 group-[.toast]:text-white',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
