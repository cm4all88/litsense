// api/checkout.js — Marketplace purchase checkout
// ─────────────────────────────────────────────────────────────────────────────
// Creates a Stripe Checkout Session for a marketplace listing purchase.
// Uses capture_method: "manual" so funds are held in escrow until the buyer
// confirms delivery, at which point the admin captures via api/capture.js.
//
// POST /api/checkout
// Body: { listing_id, buyer_email, buyer_user_id }
// Returns: { url } — redirect the buyer to this Stripe-hosted checkout page
//
// After successful payment, Stripe webhook (checkout.session.completed)
// updates the listing status to "sold" automatically.
// ─────────────────────────────────────────────────────────────────────────────

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PLATFORM_FEE_PERCENT = 0.10; // 10% platform fee
const POSTAGE_CENTS        = 450;  // $4.50 USPS Media Mail estimate

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { listing_id, buyer_email, buyer_user_id } = req.body || {};
  if (!listing_id) return res.status(400).json({ error: "listing_id required" });

  // ── Fetch and validate the listing ────────────────────────────────────────
  const { data: listing, error: listingErr } = await supabase
    .from("marketplace_listings")
    .select("*")
    .eq("id", listing_id)
    .eq("status", "active")
    .single();

  if (listingErr || !listing) {
    return res.status(404).json({ error: "This listing is no longer available." });
  }

  // Prevent sellers from buying their own listing
  if (listing.seller_user_id && buyer_user_id && listing.seller_user_id === buyer_user_id) {
    return res.status(400).json({ error: "You can't buy your own listing." });
  }

  const origin            = req.headers.origin || "https://litsense.app";
  const amount_cents      = Math.round(listing.price * 100);
  const total_cents       = amount_cents + POSTAGE_CENTS;
  const platform_fee      = Math.round(amount_cents * PLATFORM_FEE_PERCENT);
  const seller_payout     = amount_cents - platform_fee;

  const productName = `${listing.title}${listing.author ? ` by ${listing.author}` : ""}`;
  const productDesc = [
    `Condition: ${listing.condition}`,
    "Includes USPS Media Mail shipping",
    "Sold by a LitSense Club member",
  ].join(" · ");

  try {
    const session = await stripe.checkout.sessions.create({
      mode:           "payment",
      customer_email: buyer_email || undefined,

      line_items: [{
        price_data: {
          currency:     "usd",
          product_data: { name: productName, description: productDesc },
          unit_amount:  total_cents,
        },
        quantity: 1,
      }],

      // capture_method: manual = escrow
      // Funds are authorized (held) but not captured until buyer confirms delivery.
      // Admin releases via api/capture.js or Stripe dashboard.
      payment_intent_data: {
        capture_method: "manual",
        description:    `LitSense marketplace — ${productName}`,
        metadata: {
          listing_id,
          type:                "marketplace",
          platform_fee_cents:  String(platform_fee),
          seller_payout_cents: String(seller_payout),
          postage_cents:       String(POSTAGE_CENTS),
          seller_user_id:      listing.seller_user_id || "",
          seller_email:        listing.seller_email || "",
          buyer_user_id:       buyer_user_id || "",
          buyer_email:         buyer_email || "",
        },
      },

      success_url: `${origin}/?market_checkout=success`,
      cancel_url:  `${origin}/?market_checkout=cancelled`,

      metadata: {
        type:          "marketplace",
        listing_id,
        buyer_user_id: buyer_user_id || "",
        buyer_email:   buyer_email || "",
      },
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error("[checkout] Stripe error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
