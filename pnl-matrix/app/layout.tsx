import '@/app/globals.css';
import { ReactNode } from 'react';
import AuthProvider from '@/components/AuthProvider';

export const metadata = { title: 'P&L Matrix' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
      <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
