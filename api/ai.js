// api/ai.js — Vercel serverless function
// Returns full JSON response. Typewriter effect is handled client-side.
// This is more reliable on Safari iOS than true streaming.
//
// PERFORMANCE NOTES (v2):
//   • Forces claude-haiku-4-5 for all recommendation requests (5-8s vs 25-35s)
//   • Caps max_tokens at 900 — enough for 4-5 rich recs, prevents runaway generation
//   • Applies typo correction to author/title names before forwarding
//   • Overrides temperature to 0.85 for confident, varied responses

const RATE_LIMIT = 15;
const WINDOW_MS  = 60 * 1000;
const ipMap      = new Map();

// ─── TYPO CORRECTION ──────────────────────────────────────────────────────────
// Common misspellings of popular authors/titles. Silent correction when confidence
// is high (Levenshtein distance ≤ 2 on a known name). Extend this list freely.
const KNOWN_AUTHORS = [
  "Colleen Hoover", "Brandon Sanderson", "Stephen King", "Toni Morrison",
  "Chimamanda Ngozi Adichie", "Kazuo Ishiguro", "Donna Tartt", "Elena Ferrante",
  "Sally Rooney", "Zadie Smith", "Celeste Ng", "Jesmyn Ward", "Min Jin Lee",
  "Amor Towles", "Anthony Doerr", "Gabrielle Zevin", "Emily Henry",
  "Taylor Jenkins Reid", "Kristin Hannah", "Lisa Jewell", "Haruki Murakami",
  "Madeline Miller", "Patrick Rothfuss", "Robin Hobb", "N.K. Jemisin",
  "Andy Weir", "Pierce Brown", "V.E. Schwab", "Sarah J. Maas"
];

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function correctTypos(text) {
  if (!text || typeof text !== "string") return text;
  let corrected = text;
  for (const known of KNOWN_AUTHORS) {
    // Check each word-group in text against known name (case-insensitive)
    const knownLower = known.toLowerCase();
    // Simple word-window: slide a window of known.split(" ").length words
    const knownWords = known.split(" ");
    const textWords  = corrected.split(/\s+/);
    for (let i = 0; i <= textWords.length - knownWords.length; i++) {
      const candidate = textWords.slice(i, i + knownWords.length).join(" ");
      const dist = levenshtein(candidate.toLowerCase(), knownLower);
      // Correct silently if distance ≤ 2 and candidate is meaningfully different
      if (dist > 0 && dist <= 2 && candidate.toLowerCase() !== knownLower) {
        corrected = corrected.replace(candidate, known);
        break;
      }
    }
  }
  return corrected;
}

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
function checkRateLimit(ip) {
  const now  = Date.now();
  const data = ipMap.get(ip) || { count: 0, start: now };
  if (now - data.start > WINDOW_MS) { data.count = 0; data.start = now; }
  data.count++;
  ipMap.set(ip, data);
  return data.count <= RATE_LIMIT;
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────
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
    // Strip stream flag (we always use full JSON for Safari iOS compat)
    const { stream: _stream, messages, system, ...rest } = req.body;

    // Apply typo correction to the last user message
    let correctedMessages = messages;
    if (Array.isArray(messages) && messages.length > 0) {
      correctedMessages = messages.map((msg, idx) => {
        if (idx === messages.length - 1 && msg.role === "user") {
          const content = typeof msg.content === "string"
            ? correctTypos(msg.content)
            : msg.content;
          return { ...msg, content };
        }
        return msg;
      });
    }

    // Build the optimized payload:
    //   - Always use Haiku for speed (4-6s vs 25-35s on Sonnet)
    //   - Cap tokens at 900 — enough for 4-5 rich recommendations
    //   - Temperature 0.85 for confident, varied responses
    const payload = {
      ...rest,
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 900,
      temperature: 0.85,
      stream:     false,
      messages:   correctedMessages,
      ...(system ? { system } : {}),
    };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(response.status).json(data);

  } catch (err) {
    return res.status(500).json({ error: "Failed to reach service." });
  }
}
