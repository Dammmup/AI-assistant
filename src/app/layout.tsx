import type { Metadata } from "next";
import "@fontsource-variable/golos-text";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "МедПротокол", template: "%s · МедПротокол" },
  description: "Транскрипция медицинских приёмов и подготовка документов",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
