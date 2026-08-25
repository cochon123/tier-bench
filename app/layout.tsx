import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "tier/bench — community AI model rankings",
  description: "A community sentiment board for the AI models people actually use.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#d8ff55",
          colorPrimaryForeground: "#090909",
          colorForeground: "#f5f3ed",
          colorMutedForeground: "#999994",
          colorBackground: "#111111",
          colorMuted: "#191919",
          colorInput: "#151515",
          colorInputForeground: "#f5f3ed",
          colorBorder: "#2b2b29",
          colorNeutral: "#242422",
          colorRing: "#d8ff55",
          colorModalBackdrop: "rgba(0, 0, 0, 0.75)",
          borderRadius: "7px",
          fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
          fontFamilyButtons: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
        },
      }}
    >
      <html lang="en"><body>{children}</body></html>
    </ClerkProvider>
  );
}
