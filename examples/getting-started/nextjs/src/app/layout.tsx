import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SuperDoc + Next.js",
  description: "Document editor powered by SuperDoc",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
