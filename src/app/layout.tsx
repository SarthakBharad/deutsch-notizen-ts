import type { Metadata, Viewport } from "next";

import { THEME_SCRIPT } from "@/components/ThemeToggle";

import "./globals.css";

export const metadata: Metadata = {
  title: "Deutsch Notizen",
  description: "A reader for my German notes, built from the LibreOffice files themselves.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFF6DE" },
    { media: "(prefers-color-scheme: dark)", color: "#16201F" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
