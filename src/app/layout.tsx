import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alva — gestão de estúdio",
  description: "Sistema de gestão para negócios de beleza e estética.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
