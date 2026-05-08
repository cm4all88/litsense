// api/ai.js — Vercel serverless function
// Returns full JSON response. Typewriter effect is handled client-side.
// This is more reliable on Safari iOS than true streaming.

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

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || "unknown";
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "Too many requests. Please wait a moment." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured." });
  }

  try {
    // Remove stream:true — we want the full response as JSON
    const { stream: _stream, ...body } = req.body;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ ...body, stream: false }),
    });

    const data = await response.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: "Failed to reach service." });
  }
}
