import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/ui/themes";
import "./globals.css";

export const metadata: Metadata = {
  title: "tier/bench — community AI model rankings",
  description: "A community sentiment board for the AI models people actually use.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ClerkProvider appearance={{ theme: dark }}><html lang="en"><body>{children}</body></html></ClerkProvider>;
}
