// api/billing-portal.js
// Creates a Stripe Customer Portal session so users can manage
// their subscription, update payment method, and cancel — all on Stripe's UI.
//
// POST /api/billing-portal
// Body: { userId }
// Returns: { url } — redirect browser here
//
// One-time setup: configure the portal at
// dashboard.stripe.com → Settings → Billing → Customer portal

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

  try {
    // Look up Stripe customer ID from our subscriptions table
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .single();

    if (!sub?.stripe_customer_id) {
      return res.status(404).json({ error: "No subscription found for this account." });
    }

    const origin = req.headers.origin || "https://www.litsense.app";

    const session = await stripe.billingPortal.sessions.create({
      customer:   sub.stripe_customer_id,
      return_url: `${origin}/`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("billing-portal error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
