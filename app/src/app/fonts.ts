import { Jost, Manrope, JetBrains_Mono } from "next/font/google";

// The site's fonts, shared by the two root layouts (the public site and the admin area): Jost for headings, numbers
// and prices, Manrope for UI and body text, JetBrains Mono only for the slide counter and small numerals.

const jost = Jost({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["300", "400", "500"],
  variable: "--font-jost",
});

const manrope = Manrope({
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-manrope",
});

const jbmono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-jbmono",
});

/** className for <html>: defines --font-jost, --font-manrope and --font-jbmono (tokens.css maps them to --font-display / --font-body / --font-mono). */
export const fontVariables = `${jost.variable} ${manrope.variable} ${jbmono.variable}`;
