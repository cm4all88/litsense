// api/checkout.js — Vercel serverless function
// Creates a Stripe PaymentIntent for a marketplace purchase.
// Funds are held until buyer confirms delivery (escrow model).
//
// POST /api/checkout
// Body: { listing_id, buyer_email, amount_cents, postage_cents }
// Returns: { client_secret, payment_intent_id }

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLATFORM_FEE_PERCENT = 0.10; // 10%

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { listing_id, buyer_email, amount_cents, postage_cents = 0 } = req.body;

  if (!listing_id || !amount_cents || amount_cents < 100) {
    return res.status(400).json({ error: "Invalid request parameters" });
  }

  try {
    const total_cents      = amount_cents + postage_cents;
    const platform_fee     = Math.round(amount_cents * PLATFORM_FEE_PERCENT);
    const seller_payout    = amount_cents - platform_fee;

    // Create PaymentIntent — capture_method: manual means funds are
    // authorized but not captured until we explicitly call capture().
    // This is our escrow: authorized at purchase, captured on delivery.
    const paymentIntent = await stripe.paymentIntents.create({
      amount:          total_cents,
      currency:        "usd",
      capture_method:  "manual",   // holds funds without charging yet
      receipt_email:   buyer_email || undefined,
      metadata: {
        listing_id,
        platform_fee_cents:  String(platform_fee),
        seller_payout_cents: String(seller_payout),
        postage_cents:       String(postage_cents),
      },
      description: `LitSense marketplace purchase — listing ${listing_id}`,
    });

    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({
      client_secret:      paymentIntent.client_secret,
      payment_intent_id:  paymentIntent.id,
      total_cents,
      platform_fee_cents: platform_fee,
      seller_payout_cents: seller_payout,
    });

  } catch (err) {
    console.error("Stripe error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
