import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProTrack - ProTrack",
  description: "Sistem za praćenje proizvodnje i prodaje",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bs">
      <body>{children}</body>
    </html>
  );
}
