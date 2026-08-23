import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "tier/bench — community AI model rankings",
  description: "A community sentiment board for the AI models people actually use.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
