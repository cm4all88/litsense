/**
 * FILE 1 of 2 — api/stripe-admin.js
 * Place at: [your project root]/api/stripe-admin.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SETUP:
 *  1. npm install stripe
 *
 *  2. Vercel → Settings → Environment Variables — add all three:
 *       STRIPE_SECRET_KEY   →  sk_live_...   (Stripe → Developers → API Keys)
 *       ADMIN_SECRET        →  make up any long random string, e.g. "xK9mP2qL8nR4wT7v"
 *       ALLOWED_ORIGIN      →  https://litsense.app
 *
 *  3. Your local .env.local file — add all four:
 *       STRIPE_SECRET_KEY=sk_test_...
 *       ADMIN_SECRET=same_string_as_above
 *       VITE_ADMIN_SECRET=same_string_as_above
 *       ALLOWED_ORIGIN=http://localhost:5173
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Stripe from "stripe";

const stripe        = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
const ADMIN_SECRET  = process.env.ADMIN_SECRET;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-token");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed" });

  if (ADMIN_SECRET && req.headers["x-admin-token"] !== ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { action, ...data } = req.body || {};

  try {
    switch (action) {

      // Called when you ADD a new plan in the admin panel
      case "create": {
        const product = await stripe.products.create({
          name:        data.name,
          description: data.description || undefined,
          metadata:    { source: "litsense_admin", interval: data.interval },
        });
        const priceParams = {
          product:     product.id,
          currency:    "usd",
          unit_amount: Math.round(parseFloat(data.price) * 100),
          metadata:    { source: "litsense_admin" },
        };
        if (data.interval !== "once") priceParams.recurring = { interval: data.interval };
        const price = await stripe.prices.create(priceParams);
        return res.status(200).json({ success: true, stripe_product_id: product.id, stripe_price_id: price.id });
      }

      // Called when you EDIT a plan — price changes automatically create a new Stripe price
      case "update": {
        if (!data.stripe_product_id) return res.status(400).json({ error: "Missing stripe_product_id" });
        await stripe.products.update(data.stripe_product_id, {
          name:        data.name,
          description: data.description || undefined,
        });
        let finalPriceId = data.stripe_price_id;
        if (data.price_changed) {
          if (data.stripe_price_id) await stripe.prices.update(data.stripe_price_id, { active: false });
          const p = { product: data.stripe_product_id, currency: "usd", unit_amount: Math.round(parseFloat(data.price) * 100), metadata: { source: "litsense_admin" } };
          if (data.interval !== "once") p.recurring = { interval: data.interval };
          finalPriceId = (await stripe.prices.create(p)).id;
        }
        return res.status(200).json({ success: true, stripe_price_id: finalPriceId });
      }

      // Called when you toggle a plan OFF — hides it from checkout, keeps existing subscribers
      case "archive": {
        if (!data.stripe_product_id) return res.status(200).json({ success: true });
        if (data.stripe_price_id) await stripe.prices.update(data.stripe_price_id, { active: false });
        await stripe.products.update(data.stripe_product_id, { active: false });
        return res.status(200).json({ success: true });
      }

      // Called when you toggle a plan back ON
      case "restore": {
        if (!data.stripe_product_id) return res.status(200).json({ success: true });
        await stripe.products.update(data.stripe_product_id, { active: true });
        if (data.stripe_price_id) await stripe.prices.update(data.stripe_price_id, { active: true });
        return res.status(200).json({ success: true });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error("[stripe-admin]", err.message);
    const friendly =
      err.type === "StripeAuthenticationError" ? "Stripe secret key is wrong. Check STRIPE_SECRET_KEY in Vercel." :
      err.type === "StripeInvalidRequestError"  ? `Stripe rejected the request: ${err.message}` :
      "Something went wrong talking to Stripe. Check Vercel function logs.";
    return res.status(500).json({ error: friendly, raw: err.message });
  }
}
