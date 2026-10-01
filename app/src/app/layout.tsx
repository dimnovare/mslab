import type { Metadata } from "next";
import { Jost, Manrope, JetBrains_Mono } from "next/font/google";
import "@/styles/tokens.css";
import "@/styles/globals.css";

const jost = Jost({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["300", "400", "500"],
  variable: "--font-jost",
});

const manrope = Manrope({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-manrope",
});

const jbmono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-jbmono",
});

export const metadata: Metadata = {
  title: "MS LAB",
  description: "MS LAB Koolituskeskus",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="et" className={`${jost.variable} ${manrope.variable} ${jbmono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
