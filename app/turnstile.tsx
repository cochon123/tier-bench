"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export const turnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  function render() {
    if (!container.current || !window.turnstile || widget.current || !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return;
    widget.current = window.turnstile.render(container.current, {
      sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      theme: "auto",
      callback: (token: string) => onToken(token),
      "expired-callback": () => onToken(null),
      "error-callback": () => onToken(null),
    });
  }

  useEffect(() => () => {
    if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
  }, []);

  if (!turnstileEnabled) return null;
  return <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={render} /><div ref={container} className="turnstile" /></>;
}
