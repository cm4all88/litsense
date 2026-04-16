// api/validate.js — Vercel serverless function
// Checks whether an Amazon product URL resolves to a real product page.
// Called by SafeAmazonLink on hover/click to prevent dead links.
// Falls back: if the product page redirects to homepage or search, returns valid: false.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const { url } = req.body || {};

  // Only validate Amazon product URLs — anything else is treated as valid
  if (!url || typeof url !== "string") return res.json({ valid: false });
  if (!url.startsWith("https://www.amazon.com/")) return res.json({ valid: true });

  // Search URLs are always valid (Amazon's search never 404s)
  if (url.includes("/s?") || url.includes("/s/")) return res.json({ valid: true });

  try {
    const r = await fetch(url, {
      method: "GET",
      headers: {
        // Realistic browser UA — reduces bot-detection blocks
        "User-Agent":      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept":          "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(5500),
    });

    const finalUrl = r.url || url;

    // Valid product page: still contains /dp/ after all redirects
    const onProductPage = /\/dp\/[A-Z0-9]{10}/i.test(finalUrl);

    // Dead-link signals: redirected to homepage, search, or a non-product path
    const redirectedHome   = /amazon\.com\/?(\?|#|$)/.test(finalUrl);
    const redirectedSearch = finalUrl.includes("/s?") || finalUrl.includes("/s/");
    const notFound         = r.status === 404 || r.status === 410;

    const valid = onProductPage && !redirectedHome && !redirectedSearch && !notFound;

    return res.json({ valid, finalUrl, status: r.status });
  } catch (err) {
    // Network error, timeout, or bot-block — fail safe: use search fallback
    return res.json({ valid: false, error: err.message });
  }
}
