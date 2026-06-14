import type { Metadata } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  subsets: ["latin"],
});

// The fintech "instrument-grade" numeral face — tabular mono for every money figure.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SimpleDues",
  description:
    "Dues, budgets, and forecasts made simple for fraternities and student organizations — run by a team of agents.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Theme is resolved server-side from a cookie so the correct palette is in the
  // very first byte of HTML — no flash, no hydration mismatch, no client script.
  // Dark ("Obsidian Glass") is the default; the Header toggle writes the cookie.
  const theme = (await cookies()).get("sd-theme")?.value === "light" ? "light" : "dark";
  return (
    <html
      lang="en"
      className={`${theme} ${inter.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
