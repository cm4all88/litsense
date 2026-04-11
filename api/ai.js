// api/ai.js — Vercel Edge Function
// Proxies streaming requests to Anthropic.
// Edge runtime streams the response directly — no buffering.

export const config = { runtime: "edge" };

const RATE_LIMIT = 15;
const WINDOW_MS  = 60 * 1000;
const ipMap      = new Map();

function checkRateLimit(ip) {
  const now  = Date.now();
  const data = ipMap.get(ip) || { count: 0, start: now };
  if (now - data.start > WINDOW_MS) { data.count = 0; data.start = now; }
  data.count++;
  ipMap.set(ip, data);
  return data.count <= RATE_LIMIT;
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (!checkRateLimit(ip)) {
    return new Response("Too many requests. Please wait a moment.", { status: 429 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response("API key not configured.", { status: 500 });
  }

  const body = await req.json();

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!upstream.ok) {
    const err = await upstream.text();
    return new Response(err, { status: upstream.status });
  }

  // Stream straight through to the browser
  return new Response(upstream.body, {
    headers: {
      "Content-Type":                "text/event-stream",
      "Cache-Control":               "no-cache",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
