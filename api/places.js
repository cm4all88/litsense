// api/places.js
// ─────────────────────────────────────────────────────────────────────────────
// Nearby places search for the Read Local feature.
// Returns bookstores, libraries, and reading cafés near the given coordinates.
//
// ENV VARS:
//   GOOGLE_PLACES_API_KEY — Google Cloud → enable Places API → create key
//   (Restrict key by domain to litsense.app in Google Cloud Console)
//
// GET /api/places?lat=XX&lng=XX&radius=5000
// ─────────────────────────────────────────────────────────────────────────────

const KEY = process.env.GOOGLE_PLACES_API_KEY;
const BASE = "https://maps.googleapis.com/maps/api/place";

async function nearbySearch(lat, lng, type, keyword, radius) {
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius,
    type,
    ...(keyword ? { keyword } : {}),
    key: KEY,
  });
  try {
    const res  = await fetch(`${BASE}/nearbysearch/json?${params}`);
    const data = await res.json();
    return data.results || [];
  } catch { return []; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!KEY) {
    // Return empty so the frontend falls back to demo data gracefully
    return res.status(200).json({ places: [], configured: false });
  }

  const { lat, lng, radius = 5000 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });

  // Parallel searches across relevant place types
  const [bookstores, libraries, usedBookstores, rareBooks] = await Promise.all([
    nearbySearch(lat, lng, "book_store", null,          radius),
    nearbySearch(lat, lng, "library",    null,          radius),
    nearbySearch(lat, lng, "store",      "used books",  Math.min(radius, 8000)),
    nearbySearch(lat, lng, "store",      "rare books",  Math.min(radius, 10000)),
  ]);

  // Combine, dedupe by place_id, shape response
  const seen = new Set();
  const places = [
    ...bookstores,
    ...libraries,
    ...usedBookstores,
    ...rareBooks,
  ]
    .filter(p => {
      if (seen.has(p.place_id)) return false;
      seen.add(p.place_id);
      return true;
    })
    .map(p => ({
      id:          p.place_id,
      name:        p.name,
      types:       p.types || [],
      lat:         p.geometry.location.lat,
      lng:         p.geometry.location.lng,
      address:     p.vicinity || null,
      rating:      p.rating || null,
      totalRatings: p.user_ratings_total || 0,
      openNow:     p.opening_hours?.open_now ?? null,
      // Note: We intentionally do NOT include photoUrl here to keep the API
      // key server-side. The component uses curated atmospheric photography.
      // To add real Google place photos, proxy them through a separate endpoint.
    }));

  res.setHeader("Cache-Control", "public, max-age=3600"); // cache 1 hour
  res.status(200).json({ places, configured: true });
}
