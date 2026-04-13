// api/refund.js — Vercel serverless function
// Cancels or refunds a PaymentIntent.
// Called when a dispute is raised or seller cancels after payment.
//
// POST /api/refund
// Body: { payment_intent_id, reason }
// Returns: { success, refund_id }

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { payment_intent_id, reason = "requested_by_customer" } = req.body;

  if (!payment_intent_id) {
    return res.status(400).json({ error: "payment_intent_id required" });
  }

  try {
    // Try to cancel first (if not yet captured) — no charge at all
    try {
      const cancelled = await stripe.paymentIntents.cancel(payment_intent_id);
      return res.status(200).json({ success: true, status: cancelled.status });
    } catch {
      // Already captured — issue a refund instead
      const refund = await stripe.refunds.create({
        payment_intent: payment_intent_id,
        reason,
      });
      return res.status(200).json({
        success:   true,
        refund_id: refund.id,
        status:    refund.status,
      });
    }

  } catch (err) {
    console.error("Stripe refund error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
