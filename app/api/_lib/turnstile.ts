import { NextResponse } from "next/server";

type TurnstileResult = { success?: boolean };

export async function verifyTurnstile(request: Request, token: unknown) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (typeof token !== "string" || !token) return false;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const form = new URLSearchParams({ secret, response: token });
  if (forwarded) form.set("remoteip", forwarded);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      cache: "no-store",
    });
    const result = await response.json() as TurnstileResult;
    return response.ok && result.success === true;
  } catch (error) {
    console.error("Turnstile verification failed", error);
    return false;
  }
}

export function turnstileResponse() {
  return NextResponse.json({ error: "Bot verification failed. Please retry the challenge." }, { status: 403 });
}
