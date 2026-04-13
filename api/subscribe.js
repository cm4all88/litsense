// api/subscribe.js — Vercel serverless function
// Creates a Stripe subscription for LitSense Pro.
// Uses a 7-day free trial before charging.
//
// POST /api/subscribe
// Body: { email, plan } — plan: "monthly" | "yearly"
// Returns: { client_secret, subscription_id }

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Create these in your Stripe dashboard → Products
// Then paste the price IDs here
const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_MONTHLY, // e.g. price_xxx
  yearly:  process.env.STRIPE_PRICE_YEARLY,  // e.g. price_xxx
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, plan = "monthly" } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email required" });
  }

  const priceId = PRICE_IDS[plan];
  if (!priceId) {
    return res.status(400).json({ error: `Unknown plan: ${plan}` });
  }

  try {
    // Find or create Stripe customer
    const existing = await stripe.customers.list({ email, limit: 1 });
    let customer;
    if (existing.data.length > 0) {
      customer = existing.data[0];
    } else {
      customer = await stripe.customers.create({ email });
    }

    // Create subscription with 7-day trial
    const subscription = await stripe.subscriptions.create({
      customer:         customer.id,
      items:            [{ price: priceId }],
      trial_period_days: 7,
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand:           ["latest_invoice.payment_intent"],
    });

    const paymentIntent = subscription.latest_invoice?.payment_intent;

    return res.status(200).json({
      client_secret:   paymentIntent?.client_secret || null,
      subscription_id: subscription.id,
      trial_end:       subscription.trial_end,
      status:          subscription.status,
    });

  } catch (err) {
    console.error("Stripe subscribe error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
