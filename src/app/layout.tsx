import type { Metadata, Viewport } from "next";

import { THEME_SCRIPT } from "@/components/ThemeToggle";

import "./globals.css";

export const metadata: Metadata = {
  title: "Deutsch Notizen",
  description:
    "My German notes — vocabulary, verb tables and grammar, read straight from the LibreOffice files I write them in.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFF6DE" },
    { media: "(prefers-color-scheme: dark)", color: "#14211F" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}