import type { Metadata, Viewport } from "next";
import { Oswald, Inter } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-oswald",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "The Sic 'Em Sheet",
  description: "Weekly college football pick 'em, against the spread.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${oswald.variable} ${inter.variable} font-body min-h-screen`}>
        <Nav />
        <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-5 sm:pt-8">{children}</main>
      </body>
    </html>
  );
}
