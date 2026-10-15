import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "МедПротокол — ИИ-документация приёма",
  description: "Транскрипция медицинских приёмов и автоматическое заполнение документов",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
