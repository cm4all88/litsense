// api/validate-coupon.js
// Validates a coupon code against the Supabase coupon_codes table.
// Called by the upgrade modal before checkout to show the user their discount.
//
// POST /api/validate-coupon
// Body: { "code": "SUMMER25" }
// Returns: { valid, code, discount_type, discount_value, message }

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { code } = req.body || {};
  if (!code) return res.status(400).json({ valid: false, message: "No code provided." });

  try {
    const { data: coupon, error } = await supabase
      .from("coupon_codes")
      .select("*")
      .eq("code", code.toUpperCase().trim())
      .eq("active", true)
      .single();

    if (error || !coupon) {
      return res.json({ valid: false, message: "Code not found or inactive." });
    }

    // Check expiry
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return res.json({ valid: false, message: "This code has expired." });
    }

    // Check usage limit
    if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) {
      return res.json({ valid: false, message: "This code has reached its usage limit." });
    }

    const message = coupon.discount_type === "percent"
      ? `${coupon.discount_value}% off your first payment`
      : `$${coupon.discount_value} off your first payment`;

    return res.json({
      valid:          true,
      code:           coupon.code,
      id:             coupon.id,
      discount_type:  coupon.discount_type,
      discount_value: coupon.discount_value,
      message,
    });

  } catch (err) {
    console.error("[validate-coupon]", err.message);
    return res.status(500).json({ valid: false, message: "Validation error. Please try again." });
  }
}
