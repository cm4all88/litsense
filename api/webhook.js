// api/webhook.js — Stripe webhook handler
//
// Listens for Stripe subscription lifecycle events and keeps
// the Supabase `subscriptions` table in sync with Stripe's state.
//
// Events handled:
//   checkout.session.completed       → new subscriber, set tier active
//   customer.subscription.updated    → plan change, trial end, renewal
//   customer.subscription.deleted    → cancellation, downgrade to free
//   invoice.payment_failed           → mark as past_due
//   invoice.payment_succeeded        → confirm active after renewal
//
// Setup in Stripe Dashboard:
//   Developers → Webhooks → Add endpoint
//   URL: https://www.litsense.app/api/webhook
//   Events: select all 5 above
//   Copy the signing secret → add as STRIPE_WEBHOOK_SECRET in Vercel

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Send transactional email via our own endpoint
async function sendEmail(type, to, data = {}) {
  if (!to) return;
  try {
    await fetch(`${process.env.VITE_APP_URL || "https://www.litsense.app"}/api/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, to, data }),
    });
  } catch (err) {
    console.error("sendEmail error:", err.message);
  }
}

// Map Stripe price IDs → our tier names
function tierFromPriceId(priceId) {
  const PLUS = [
    process.env.VITE_STRIPE_PRICE_PLUS_MONTHLY,
    process.env.VITE_STRIPE_PRICE_PLUS_ANNUAL,
    process.env.STRIPE_PRICE_MONTHLY,
    process.env.STRIPE_PRICE_YEARLY,
  ];
  const CLUB = [
    process.env.VITE_STRIPE_PRICE_CLUB_MONTHLY,
    process.env.VITE_STRIPE_PRICE_CLUB_ANNUAL,
  ];
  if (CLUB.includes(priceId)) return "club";
  if (PLUS.includes(priceId)) return "plus";
  return "plus"; // safe default for any unknown paid price
}

// Extract userId from Stripe metadata (set during checkout)
function userIdFromMeta(obj) {
  return obj?.metadata?.userId || obj?.subscription_data?.metadata?.userId || null;
}

// Upsert subscription row + entitlements for a user
async function upsertSubscription(userId, {
  stripeCustomerId,
  stripeSubId,
  tier,
  status,
  currentPeriodEnd,
  cancelAtPeriodEnd = false,
}) {
  if (!userId) {
    console.error("webhook: no userId — cannot upsert subscription");
    return;
  }

  // Upsert subscription record
  const { error: subErr } = await supabase
    .from("subscriptions")
    .upsert({
      user_id:              userId,
      stripe_customer_id:   stripeCustomerId,
      stripe_sub_id:        stripeSubId,
      tier,
      status,
      current_period_end:   currentPeriodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      updated_at:           new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (subErr) console.error("webhook: subscription upsert error", subErr.message);

  // Upsert entitlements derived from tier
  const isPro   = tier === "plus" || tier === "club";
  const isClub  = tier === "club";
  const isActive = status === "active" || status === "trialing";

  const { error: entErr } = await supabase
    .from("membership_entitlements")
    .upsert({
      user_id:              userId,
      tier:                 isActive ? tier : "free",
      unlimited_sage:       isPro && isActive,
      full_shelves:         isPro && isActive,
      taste_memory:         isPro && isActive,
      reading_reports:      isPro && isActive,
      monthly_entries:      isActive ? (isClub ? 15 : isPro ? 5 : 1) : 1,
      drop_access:          isActive ? (isClub ? "premium" : "standard") : "none",
      challenge_access:     isClub && isActive,
      grand_prize_eligible: isClub && isActive,
      early_access:         isClub && isActive,
      updated_at:           new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (entErr) console.error("webhook: entitlements upsert error", entErr.message);

  console.log(`webhook: synced user ${userId} → tier=${isActive ? tier : "free"} status=${status}`);
}

// ── HANDLER ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const sig     = req.headers["stripe-signature"];
  const secret  = process.env.STRIPE_WEBHOOK_SECRET;
  const rawBody = req.body; // Vercel provides raw body for webhook routes

  // Verify Stripe signature
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error("webhook: signature verification failed:", err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  console.log(`webhook: received ${event.type}`);

  try {
    switch (event.type) {

      // ── New checkout completed ──────────────────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode !== "subscription") break;

        const userId = userIdFromMeta(session);
        const subId  = session.subscription;

        // Fetch full subscription to get price and period
        const sub = await stripe.subscriptions.retrieve(subId);
        const priceId = sub.items.data[0]?.price?.id;
        const tier    = tierFromPriceId(priceId);

        await upsertSubscription(userId, {
          stripeCustomerId:   session.customer,
          stripeSubId:        subId,
          tier,
          status:             sub.status,
          currentPeriodEnd:   new Date(sub.current_period_end * 1000).toISOString(),
          cancelAtPeriodEnd:  sub.cancel_at_period_end,
        });
        // Send welcome email
        if (session.customer_email || session.customer_details?.email) {
          await sendEmail("welcome", session.customer_email || session.customer_details?.email, {});
        }
        // Seed initial reward entries for this month
        if (userId) {
          const monthKey = new Date().toISOString().slice(0, 7);
          const entryCount = tier === "club" ? 15 : 5;
          await supabase.from("reward_entries").upsert({
            user_id: userId, month_key: monthKey,
            source: "subscription", entries: entryCount,
            note: `${tier} subscription`,
          }, { onConflict: "user_id,month_key,source" });
        }
        break;
      }

      // ── Subscription changed (upgrade, downgrade, trial end, renewal) ───────
      case "customer.subscription.updated": {
        const sub     = event.data.object;
        const priceId = sub.items.data[0]?.price?.id;
        const tier    = tierFromPriceId(priceId);
        const userId  = userIdFromMeta(sub);

        // Try to find userId from our DB if not in metadata
        let resolvedUserId = userId;
        if (!resolvedUserId && sub.customer) {
          const { data } = await supabase
            .from("subscriptions")
            .select("user_id")
            .eq("stripe_customer_id", sub.customer)
            .single();
          resolvedUserId = data?.user_id;
        }

        await upsertSubscription(resolvedUserId, {
          stripeCustomerId:   sub.customer,
          stripeSubId:        sub.id,
          tier,
          status:             sub.status,
          currentPeriodEnd:   new Date(sub.current_period_end * 1000).toISOString(),
          cancelAtPeriodEnd:  sub.cancel_at_period_end,
        });
        break;
      }

      // ── Subscription cancelled / expired ────────────────────────────────────
      case "customer.subscription.deleted": {
        const sub    = event.data.object;
        let userId   = userIdFromMeta(sub);

        if (!userId && sub.customer) {
          const { data } = await supabase
            .from("subscriptions")
            .select("user_id")
            .eq("stripe_customer_id", sub.customer)
            .single();
          userId = data?.user_id;
        }

        await upsertSubscription(userId, {
          stripeCustomerId:  sub.customer,
          stripeSubId:       sub.id,
          tier:              "free",
          status:            "cancelled",
          currentPeriodEnd:  new Date(sub.current_period_end * 1000).toISOString(),
          cancelAtPeriodEnd: false,
        });
        break;
      }

      // ── Payment failed ──────────────────────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subId   = invoice.subscription;
        if (!subId) break;

        const { data } = await supabase
          .from("subscriptions")
          .select("user_id, tier")
          .eq("stripe_sub_id", subId)
          .single();

        if (data?.user_id) {
          await upsertSubscription(data.user_id, {
            stripeCustomerId:  invoice.customer,
            stripeSubId:       subId,
            tier:              data.tier,
            status:            "past_due",
            currentPeriodEnd:  null,
            cancelAtPeriodEnd: false,
          });
          // Send payment failed email
          if (invoice.customer_email) {
            await sendEmail("payment_failed", invoice.customer_email, {});
          }
        }
        break;
      }

      // ── Payment succeeded (renewal) ─────────────────────────────────────────
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const subId   = invoice.subscription;
        if (!subId || invoice.billing_reason === "subscription_create") break;
        // subscription_create is handled by checkout.session.completed

        const sub = await stripe.subscriptions.retrieve(subId);
        const { data } = await supabase
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_sub_id", subId)
          .single();

        if (data?.user_id) {
          const priceId = sub.items.data[0]?.price?.id;
          await upsertSubscription(data.user_id, {
            stripeCustomerId:  invoice.customer,
            stripeSubId:       subId,
            tier:              tierFromPriceId(priceId),
            status:            "active",
            currentPeriodEnd:  new Date(sub.current_period_end * 1000).toISOString(),
            cancelAtPeriodEnd: sub.cancel_at_period_end,
          });
        }
        break;
      }

      // ── Trial ending warning (day 6) ────────────────────────────────────────────
      case "customer.subscription.trial_will_end": {
        const sub = event.data.object;
        if (sub.customer_email || sub.default_source) {
          const customer = await stripe.customers.retrieve(sub.customer);
          const daysLeft = Math.ceil((sub.trial_end - Date.now()/1000) / 86400);
          if (customer.email) {
            await sendEmail("trial_ending", customer.email, { daysLeft });
          }
        }
        break;
      }

      default:
        // Unhandled event — ignore
        break;
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error("webhook: handler error:", err.message);
    return res.status(500).json({ error: "Webhook handler failed" });
  }
}
