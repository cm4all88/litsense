// api/subscribe.js
// Handles both new subscriptions and upgrades.
// New users → Stripe Checkout Session (with optional trial)
// Existing subscribers → Stripe Subscription Update (prorated immediately)

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe   = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function isValidPrice(priceId) {
  const valid = [
    process.env.VITE_STRIPE_PRICE_PLUS_MONTHLY,
    process.env.VITE_STRIPE_PRICE_PLUS_ANNUAL,
    process.env.VITE_STRIPE_PRICE_CLUB_MONTHLY,
    process.env.VITE_STRIPE_PRICE_CLUB_ANNUAL,
    process.env.STRIPE_PRICE_MONTHLY,
    process.env.STRIPE_PRICE_YEARLY,
  ].filter(Boolean);
  return valid.length === 0 || valid.includes(priceId);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { priceId, userId, email } = req.body || {};
  if (!priceId) return res.status(400).json({ error: "priceId required" });
  if (!isValidPrice(priceId)) return res.status(400).json({ error: "Invalid price ID" });

  const origin = req.headers.origin || "https://www.litsense.app";

  try {
    // Look up existing subscription from our DB
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, stripe_sub_id, tier")
      .eq("user_id", userId)
      .single();

    // ── UPGRADE PATH: existing active subscription ────────────────────────────
    if (existingSub?.stripe_sub_id) {
      try {
        const stripeSub = await stripe.subscriptions.retrieve(existingSub.stripe_sub_id);

        if (stripeSub.status === "active" || stripeSub.status === "trialing") {
          // Update subscription item to new price — proration applied automatically
          const updated = await stripe.subscriptions.update(existingSub.stripe_sub_id, {
            items: [{
              id: stripeSub.items.data[0].id,
              price: priceId,
            }],
            proration_behavior: "create_prorations",
            trial_end: stripeSub.status === "trialing" ? "now" : undefined,
          });

          // Return success — webhook will sync the DB
          return res.status(200).json({
            upgraded: true,
            tier: updated.items.data[0].price.id,
            url: `${origin}/?checkout=success`,
          });
        }
      } catch (err) {
        // Subscription may have been deleted — fall through to new checkout
        console.warn("Upgrade attempt failed, falling back to checkout:", err.message);
      }
    }

    // ── NEW SUBSCRIPTION PATH ─────────────────────────────────────────────────
    let customer;
    if (email) {
      const existing = await stripe.customers.list({ email, limit: 1 });
      customer = existing.data.length > 0
        ? existing.data[0]
        : await stripe.customers.create({ email, metadata: { userId: userId || "" } });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer?.id,
      customer_email: customer ? undefined : (email || undefined),
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: { userId: userId || "" },
      },
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/?checkout=cancelled`,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      metadata: { userId: userId || "" },
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error("subscribe error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
