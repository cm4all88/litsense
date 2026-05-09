// api/delete-account.js
// Permanently deletes a user's account:
//   1. Cancels any active Stripe subscription immediately
//   2. Deletes all Supabase data for the user
//   3. Returns success — Clerk user deletion is handled client-side
//
// POST /api/delete-account
// Body: { userId }

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe   = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId required" });

  const errors = [];

  try {
    // 1. Cancel active Stripe subscription
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_sub_id, stripe_customer_id")
      .eq("user_id", userId)
      .single();

    if (sub?.stripe_sub_id) {
      try {
        await stripe.subscriptions.cancel(sub.stripe_sub_id);
      } catch (err) {
        // Subscription may already be cancelled — not a fatal error
        errors.push(`Stripe cancel: ${err.message}`);
      }
    }

    // 2. Delete all Supabase data for user
    const tables = [
      "challenge_progress",
      "drop_claims",
      "reward_entries",
      "membership_entitlements",
      "subscriptions",
      "user_book_state",
    ];

    for (const table of tables) {
      const { error } = await supabase.from(table).delete().eq("user_id", userId);
      if (error) errors.push(`${table}: ${error.message}`);
    }

    if (errors.length > 0) {
      console.warn("delete-account partial errors:", errors);
    }

    return res.status(200).json({ success: true, errors });

  } catch (err) {
    console.error("delete-account fatal error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
