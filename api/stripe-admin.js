// api/stripe-admin.js — Vercel serverless function
// ─────────────────────────────────────────────────────────────────────────────
// Handles all Stripe operations needed by the LitSense admin dashboard.
// Gated by x-admin-token header checked against ADMIN_SECRET env var.
//
// ENV VARS REQUIRED:
//   STRIPE_SECRET_KEY   — Your Stripe secret key (already in Vercel)
//   ADMIN_SECRET        — A strong secret string; same value as VITE_ADMIN_SECRET
// ─────────────────────────────────────────────────────────────────────────────

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  // ── CORS + method ─────────────────────────────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-token");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ── Auth gate ─────────────────────────────────────────────────────────────
  const token = req.headers["x-admin-token"];
  if (!token || token !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { action, ...payload } = req.body || {};
  if (!action) return res.status(400).json({ error: "action is required" });

  try {
    switch (action) {

      // ── Connectivity check ────────────────────────────────────────────────
      case "ping": {
        await stripe.balance.retrieve();
        return res.json({ ok: true });
      }

      // ── Create product + price in Stripe ──────────────────────────────────
      case "create": {
        const product = await stripe.products.create({
          name: payload.name,
          description: payload.description || undefined,
        });
        const priceParams = {
          product: product.id,
          unit_amount: Math.round(parseFloat(payload.price) * 100),
          currency: "usd",
        };
        if (payload.interval && payload.interval !== "once") {
          priceParams.recurring = { interval: payload.interval };
        }
        const price = await stripe.prices.create(priceParams);
        return res.json({ stripe_product_id: product.id, stripe_price_id: price.id });
      }

      // ── Update product; create new price if amount/interval changed ───────
      case "update": {
        await stripe.products.update(payload.stripe_product_id, {
          name: payload.name,
          description: payload.description || undefined,
        });

        let price_id = payload.stripe_price_id;

        if (payload.price_changed) {
          // Archive old price
          if (payload.stripe_price_id) {
            await stripe.prices.update(payload.stripe_price_id, { active: false }).catch(() => {});
          }
          // Create new price
          const priceParams = {
            product: payload.stripe_product_id,
            unit_amount: Math.round(parseFloat(payload.price) * 100),
            currency: "usd",
          };
          if (payload.interval && payload.interval !== "once") {
            priceParams.recurring = { interval: payload.interval };
          }
          const newPrice = await stripe.prices.create(priceParams);
          price_id = newPrice.id;
        }

        return res.json({ stripe_product_id: payload.stripe_product_id, stripe_price_id: price_id });
      }

      // ── Archive (hide/deactivate) product and price ───────────────────────
      case "archive": {
        if (payload.stripe_price_id) {
          await stripe.prices.update(payload.stripe_price_id, { active: false }).catch(() => {});
        }
        if (payload.stripe_product_id) {
          await stripe.products.update(payload.stripe_product_id, { active: false }).catch(() => {});
        }
        return res.json({ ok: true });
      }

      // ── Restore (reactivate) product and price ────────────────────────────
      case "restore": {
        if (payload.stripe_product_id) {
          await stripe.products.update(payload.stripe_product_id, { active: true }).catch(() => {});
        }
        if (payload.stripe_price_id) {
          await stripe.prices.update(payload.stripe_price_id, { active: true }).catch(() => {});
        }
        return res.json({ ok: true });
      }

      // ── Revenue stats: MRR, ARR, subscriber counts, recent charges ────────
      case "stats": {
        // Fetch all subscription statuses in parallel
        const [activeRes, trialingRes, pastDueRes, canceledRes, chargesRes] = await Promise.all([
          stripe.subscriptions.list({ status: "active",    limit: 100, expand: ["data.items.data.price"] }),
          stripe.subscriptions.list({ status: "trialing",  limit: 100, expand: ["data.items.data.price"] }),
          stripe.subscriptions.list({ status: "past_due",  limit: 100 }),
          stripe.subscriptions.list({ status: "canceled",  limit: 100 }),
          stripe.charges.list({ limit: 20 }),
        ]);

        // Calculate MRR from a list of subscriptions
        const calcMRR = (subs) =>
          subs.reduce((sum, sub) => {
            const item = sub.items?.data?.[0];
            if (!item?.price) return sum;
            const amount = (item.price.unit_amount || 0) / 100;
            const interval = item.price.recurring?.interval;
            return sum + (interval === "year" ? amount / 12 : amount);
          }, 0);

        const mrr = calcMRR(activeRes.data) + calcMRR(trialingRes.data);
        const arr = mrr * 12;

        // Format charges
        const recent_charges = chargesRes.data.map(c => ({
          id:          c.id,
          amount:      c.amount / 100,
          currency:    c.currency,
          status:      c.status,
          created:     c.created,
          email:       c.billing_details?.email || c.receipt_email || null,
          description: c.description || null,
          refunded:    c.refunded,
        }));

        return res.json({
          mrr:            Math.round(mrr * 100) / 100,
          arr:            Math.round(arr * 100) / 100,
          active:         activeRes.data.length,
          trialing:       trialingRes.data.length,
          past_due:       pastDueRes.data.length,
          canceled:       canceledRes.data.length,
          recent_charges,
        });
      }

      // ── Look up a customer by email + their subscriptions + charges ───────
      case "customer_lookup": {
        if (!payload.email) return res.status(400).json({ error: "email required" });

        const customers = await stripe.customers.list({ email: payload.email, limit: 1 });
        if (!customers.data.length) return res.json({ customer: null, subscriptions: [], charges: [] });

        const customer = customers.data[0];

        const [subsRes, chargesRes] = await Promise.all([
          stripe.subscriptions.list({
            customer: customer.id,
            limit: 10,
            expand: ["data.items.data.price"],
          }),
          stripe.charges.list({ customer: customer.id, limit: 5 }),
        ]);

        return res.json({
          customer: {
            id:      customer.id,
            email:   customer.email,
            name:    customer.name || null,
            created: customer.created,
          },
          subscriptions: subsRes.data.map(s => ({
            id:                  s.id,
            status:              s.status,
            current_period_end:  s.current_period_end,
            cancel_at_period_end: s.cancel_at_period_end,
            trial_end:           s.trial_end || null,
            plan:                s.items.data[0]?.price?.nickname || s.items.data[0]?.price?.id || null,
            amount:              (s.items.data[0]?.price?.unit_amount || 0) / 100,
            interval:            s.items.data[0]?.price?.recurring?.interval || null,
          })),
          charges: chargesRes.data.map(c => ({
            id:       c.id,
            amount:   c.amount / 100,
            status:   c.status,
            created:  c.created,
            refunded: c.refunded,
          })),
        });
      }

      // ── Cancel a subscription (at period end) ─────────────────────────────
      case "cancel": {
        if (!payload.subscription_id) return res.status(400).json({ error: "subscription_id required" });
        const sub = await stripe.subscriptions.update(payload.subscription_id, {
          cancel_at_period_end: true,
        });
        return res.json({ ok: true, cancel_at_period_end: sub.cancel_at_period_end });
      }

      // ── Issue a refund on a charge ────────────────────────────────────────
      case "refund": {
        if (!payload.charge_id) return res.status(400).json({ error: "charge_id required" });
        const refundParams = { charge: payload.charge_id };
        // Optional partial refund amount (in dollars)
        if (payload.amount) refundParams.amount = Math.round(payload.amount * 100);
        const refund = await stripe.refunds.create(refundParams);
        return res.json({ ok: true, refund_id: refund.id, status: refund.status });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

  } catch (err) {
    console.error("[stripe-admin]", action, err.message);
    return res.status(500).json({ error: err.message });
  }
}
