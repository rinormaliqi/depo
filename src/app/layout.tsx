import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartDepo",
  description: "Digitize your storage. Find anything in seconds.",
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
