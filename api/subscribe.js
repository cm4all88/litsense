// api/subscribe.js
// Handles both new subscriptions and upgrades.
// New users → Stripe Checkout Session (with optional trial + coupon)
// Existing subscribers → Stripe Subscription Update (prorated immediately)
//
// Price ID validation now reads from the subscription_tiers Supabase table,
// so the admin panel's Subscription Tiers tab fully controls what's purchasable.
// Env var price IDs are kept as a fallback during the live mode transition.

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe   = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Validate a price ID against the subscription_tiers table, with env var fallback
async function isValidPrice(priceId) {
  if (!priceId) return false;

  // Check Supabase tiers first (admin-managed)
  const { data } = await supabase
    .from("subscription_tiers")
    .select("id")
    .eq("stripe_price_id", priceId)
    .eq("active", true)
    .single();

  if (data) return true;

  // Env var fallback — valid during transition before tiers are created in admin
  const envPrices = [
    process.env.VITE_STRIPE_PRICE_PLUS_MONTHLY,
    process.env.VITE_STRIPE_PRICE_PLUS_ANNUAL,
    process.env.VITE_STRIPE_PRICE_CLUB_MONTHLY,
    process.env.VITE_STRIPE_PRICE_CLUB_ANNUAL,
    process.env.STRIPE_PRICE_MONTHLY,
    process.env.STRIPE_PRICE_YEARLY,
  ].filter(Boolean);

  return envPrices.length === 0 || envPrices.includes(priceId);
}

// Validate a coupon code and return its data, or null if invalid
async function validateCoupon(code) {
  if (!code) return null;
  const { data } = await supabase
    .from("coupon_codes")
    .select("*")
    .eq("code", code.toUpperCase().trim())
    .eq("active", true)
    .single();

  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
  if (data.max_uses !== null && data.uses_count >= data.max_uses) return null;
  return data;
}

// Get or create a Stripe coupon object for our coupon code
async function getOrCreateStripeCoupon(coupon) {
  const couponId = `LS_${coupon.code}`;
  try {
    return await stripe.coupons.retrieve(couponId);
  } catch {
    const params = {
      id:       couponId,
      name:     coupon.code,
      duration: "once",
    };
    if (coupon.discount_type === "percent") {
      params.percent_off = coupon.discount_value;
    } else {
      params.amount_off = Math.round(coupon.discount_value * 100);
      params.currency   = "usd";
    }
    return stripe.coupons.create(params);
  }
}

// Increment the uses_count for a coupon after successful checkout
async function incrementCouponUse(couponId) {
  const { data: current } = await supabase
    .from("coupon_codes")
    .select("uses_count")
    .eq("id", couponId)
    .single();

  if (current) {
    await supabase
      .from("coupon_codes")
      .update({ uses_count: (current.uses_count || 0) + 1 })
      .eq("id", couponId);
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { priceId, userId, email, couponCode } = req.body || {};
  if (!priceId) return res.status(400).json({ error: "priceId required" });

  const valid = await isValidPrice(priceId);
  if (!valid) return res.status(400).json({ error: "Invalid price ID" });

  const origin = req.headers.origin || "https://litsense.app";

  try {
    // ── Validate coupon if provided ───────────────────────────────────────────
    let couponData   = null;
    let stripeCoupon = null;
    if (couponCode) {
      couponData = await validateCoupon(couponCode);
      if (couponData) {
        stripeCoupon = await getOrCreateStripeCoupon(couponData);
      }
    }

    // ── Look up existing subscription ─────────────────────────────────────────
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
          const updateParams = {
            items: [{ id: stripeSub.items.data[0].id, price: priceId }],
            proration_behavior: "create_prorations",
            trial_end: stripeSub.status === "trialing" ? "now" : undefined,
          };
          // Apply coupon to upgrade if provided
          if (stripeCoupon) {
            updateParams.discounts = [{ coupon: stripeCoupon.id }];
          }

          const updated = await stripe.subscriptions.update(existingSub.stripe_sub_id, updateParams);

          if (couponData) await incrementCouponUse(couponData.id);

          return res.status(200).json({
            upgraded: true,
            tier:     updated.items.data[0].price.id,
            url:      `${origin}/?checkout=success`,
          });
        }
      } catch (err) {
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

    const sessionParams = {
      mode:          "subscription",
      customer:      customer?.id,
      customer_email: customer ? undefined : (email || undefined),
      line_items:    [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata:          { userId: userId || "" },
      },
      success_url:               `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:                `${origin}/?checkout=cancelled`,
      allow_promotion_codes:     !stripeCoupon, // disable native promo codes if we're applying one
      billing_address_collection: "auto",
      metadata:                  { userId: userId || "", couponCode: couponCode || "" },
    };

    // Apply our coupon discount to the session
    if (stripeCoupon) {
      sessionParams.discounts = [{ coupon: stripeCoupon.id }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Increment coupon use when session is created
    // (webhook will also fire on completion — only count once, this is the safer moment)
    if (couponData) await incrementCouponUse(couponData.id);

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error("subscribe error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
