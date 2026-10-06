import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Rencanain — dari ide ke rencana kerja",
  description: "Susun ide aplikasi menjadi PRD, diagram alur, dan tugas yang bisa dikerjakan.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="dark">
      <body className="antialiased">{children}<Toaster position="bottom-right" closeButton duration={7000} /></body>
    </html>
  );
}
