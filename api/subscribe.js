// api/subscribe.js — Vercel serverless function
// Creates a Stripe Checkout Session for LitSense Plus or Club.
// Redirects user to Stripe-hosted checkout with 7-day free trial.
//
// POST /api/subscribe
// Body: { priceId, userId, email }
// Returns: { url } — redirect browser to this URL

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { priceId, userId, email } = req.body || {};
  if (!priceId) return res.status(400).json({ error: "priceId required" });

  // Validate priceId is one of our known prices (security)
  const validPrices = [
    process.env.STRIPE_PRICE_MONTHLY,
    process.env.STRIPE_PRICE_YEARLY,
    process.env.VITE_STRIPE_PRICE_PLUS,
    process.env.VITE_STRIPE_PRICE_CLUB,
  ].filter(Boolean);

  if (validPrices.length > 0 && !validPrices.includes(priceId)) {
    return res.status(400).json({ error: "Invalid price ID" });
  }

  try {
    let customer;
    if (email) {
      const existing = await stripe.customers.list({ email, limit: 1 });
      customer = existing.data.length > 0
        ? existing.data[0]
        : await stripe.customers.create({ email, metadata: { userId: userId || "" } });
    }

    const origin = req.headers.origin || "https://www.litsense.app";

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
    console.error("Stripe subscribe error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
