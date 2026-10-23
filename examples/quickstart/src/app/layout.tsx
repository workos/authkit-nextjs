import type { Metadata } from 'next';
import { AuthKitProvider } from '@workos-inc/authkit-nextjs/components';

export const metadata: Metadata = {
  title: 'AuthKit Next.js Quickstart',
  description: 'A minimal Next.js application demonstrating how to use AuthKit.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthKitProvider>{children}</AuthKitProvider>
      </body>
    </html>
  );
}
