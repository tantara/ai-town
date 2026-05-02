import type { Metadata } from 'next';
import './globals.css';
import 'uplot/dist/uPlot.min.css';
import Providers from '@/components/Providers';

export const metadata: Metadata = {
  title: 'AI Zoo',
  description: 'A virtual zoo where AI animals live, chat and socialize.',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
