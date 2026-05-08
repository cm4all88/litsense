// api/club-drop.js
// GET /api/club-drop?userId=xxx
// Returns the current active monthly drop with user's claim status and tier eligibility.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function monthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { userId } = req.query;
  const key = monthKey();

  try {
    // Get current active drop
    const { data: drop, error: dropErr } = await supabase
      .from("monthly_drops")
      .select("*")
      .eq("month_key", key)
      .eq("is_active", true)
      .single();

    if (dropErr && dropErr.code !== "PGRST116") throw dropErr;
    if (!drop) return res.status(200).json({ drop: null, claimed: false, tier: "free", entries: 0 });

    let claimed = false;
    let tier = "free";
    let entries = 0;

    if (userId) {
      // Get user's tier
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("tier")
        .eq("user_id", userId)
        .single();
      tier = sub?.tier || "free";

      // Check if claimed
      const { data: claim } = await supabase
        .from("drop_claims")
        .select("id")
        .eq("user_id", userId)
        .eq("drop_id", drop.id)
        .single();
      claimed = !!claim;

      // Get reward entries this month
      const { data: entriesData } = await supabase
        .from("reward_entries")
        .select("entries")
        .eq("user_id", userId)
        .eq("month_key", key);
      entries = (entriesData || []).reduce((sum, r) => sum + r.entries, 0);
    }

    // Determine what the user can see
    const now = new Date();
    const revealed = new Date(drop.reveal_date) <= now;
    const eligible = drop.eligible_tiers?.includes(tier);

    // Scrub full content if not yet revealed or user not eligible
    const response = {
      drop: {
        id: drop.id,
        month_key: drop.month_key,
        title: drop.title,
        teaser_text: drop.teaser_text,
        reveal_date: drop.reveal_date,
        image_url: drop.image_url,
        reward_type: drop.reward_type,
        eligible_tiers: drop.eligible_tiers,
        // Only include full details if revealed AND eligible
        ...(revealed && eligible ? {
          description: drop.description,
          claim_url: drop.claim_url,
          claim_label: drop.claim_label || "Claim",
        } : {}),
      },
      revealed,
      eligible,
      claimed,
      tier,
      entries,
      month_key: key,
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error("club-drop error:", err);
    return res.status(500).json({ error: "Failed to fetch drop" });
  }
}
