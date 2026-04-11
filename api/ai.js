// api/ai.js — Vercel Edge Function
// Proxies streaming requests to Anthropic.

export const config = {
  runtime: "edge",
  maxDuration: 60, // seconds — allow long responses
};

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response("API key not configured.", { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Remove stream from body if present — we always force it here
  const { stream: _stream, ...rest } = body;

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ ...rest, stream: true }),
  });

  if (!upstream.ok) {
    const err = await upstream.text();
    return new Response(err, { status: upstream.status });
  }

  // Pipe the SSE stream straight through to the browser
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type":                "text/event-stream; charset=utf-8",
      "Cache-Control":               "no-cache, no-transform",
      "X-Accel-Buffering":           "no",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
