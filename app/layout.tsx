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
          colorPrimary: "#d6f36a",
          colorPrimaryForeground: "#090c0a",
          colorForeground: "#f3f1e7",
          colorMutedForeground: "#9ba59b",
          colorBackground: "#121813",
          colorMuted: "#172019",
          colorInput: "#141a15",
          colorInputForeground: "#f3f1e7",
          colorBorder: "#2d392f",
          colorNeutral: "#253228",
          colorRing: "#d6f36a",
          colorModalBackdrop: "rgba(4, 8, 5, 0.78)",
          borderRadius: "7px",
          fontFamily: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
          fontFamilyButtons: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
        },
        elements: {
          socialButtonsBlockButton: {
            backgroundColor: "#172019",
            borderColor: "#40503f",
            color: "#f3f1e7",
            "&:hover": {
              backgroundColor: "#253228",
              borderColor: "#66755e",
            },
          },
          socialButtonsBlockButtonText: {
            color: "#f3f1e7",
          },
        },
      }}
    >
      <html lang="en"><body>{children}</body></html>
    </ClerkProvider>
  );
}
