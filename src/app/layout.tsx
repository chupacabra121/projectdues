import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Display serif — warm old-style face for headings, the wordmark, and hero numerals.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "600"],
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
  // Light ("Collegiate Editorial", warm paper) is the default; the Header toggle
  // writes the cookie.
  const theme = (await cookies()).get("sd-theme")?.value === "dark" ? "dark" : "light";
  return (
    <html
      lang="en"
      className={`${theme} ${inter.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
