import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kwen Gateway — One API, Eleven AI Providers",
  description:
    "Drop-in OpenAI-compatible AI gateway with automatic routing, failover, and session stickiness across 11 providers.",
  keywords: ["AI", "Gateway", "OpenAI", "API", "LLM", "Routing", "Failover"],
  authors: [{ name: "Kwen Gateway" }],
  openGraph: {
    title: "Kwen Gateway — One API, Eleven AI Providers",
    description:
      "Drop-in OpenAI-compatible AI gateway with automatic routing, failover, and session stickiness across 11 providers.",
    type: "website",
    siteName: "Kwen Gateway",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kwen Gateway — One API, Eleven AI Providers",
    description:
      "Drop-in OpenAI-compatible AI gateway with automatic routing, failover, and session stickiness across 11 providers.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="bg-[#0a0a0f] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
