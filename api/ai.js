// api/ai.js — Vercel serverless function
// This is the proxy that keeps your ANTHROPIC_API_KEY safe on the server.
// The app calls /api/ai instead of Anthropic directly.
//
// Rate limiting: 15 requests per 60 seconds per IP (adjust as needed)

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reach AI service.' });
  }
}
