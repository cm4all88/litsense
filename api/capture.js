// api/capture.js — Vercel serverless function
// Captures a previously authorized PaymentIntent.
// Called when buyer confirms delivery — releases escrow to seller.
//
// POST /api/capture
// Body: { payment_intent_id }
// Returns: { success, status }

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { payment_intent_id } = req.body;

  if (!payment_intent_id) {
    return res.status(400).json({ error: "payment_intent_id required" });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.capture(payment_intent_id);

    return res.status(200).json({
      success: true,
      status:  paymentIntent.status,
    });

  } catch (err) {
    console.error("Stripe capture error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
