// api/club-claim.js
// POST /api/club-claim
// Body: { userId, dropId }
// Claims the current monthly drop for a user if they are eligible.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { userId, dropId } = req.body || {};
  if (!userId || !dropId) return res.status(400).json({ error: "userId and dropId required" });

  try {
    // Fetch the drop
    const { data: drop, error: dropErr } = await supabase
      .from("monthly_drops")
      .select("*")
      .eq("id", dropId)
      .eq("is_active", true)
      .single();

    if (dropErr || !drop) return res.status(404).json({ error: "Drop not found" });

    // Check reveal date
    if (new Date(drop.reveal_date) > new Date()) {
      return res.status(403).json({ error: "Drop not yet revealed" });
    }

    // Check user's tier
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("tier")
      .eq("user_id", userId)
      .single();

    const tier = sub?.tier || "free";
    if (!drop.eligible_tiers?.includes(tier)) {
      return res.status(403).json({ error: "Your membership tier is not eligible for this drop", tier });
    }

    // Check already claimed
    const { data: existing } = await supabase
      .from("drop_claims")
      .select("id")
      .eq("user_id", userId)
      .eq("drop_id", dropId)
      .single();

    if (existing) return res.status(409).json({ error: "Already claimed", claimed: true });

    // Insert claim
    const { error: claimErr } = await supabase
      .from("drop_claims")
      .insert({ user_id: userId, drop_id: dropId });

    if (claimErr) throw claimErr;

    return res.status(200).json({ success: true, claimed: true, drop_id: dropId });
  } catch (err) {
    console.error("club-claim error:", err);
    return res.status(500).json({ error: "Failed to claim drop" });
  }
}
