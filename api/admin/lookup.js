// api/admin/lookup.js — Vercel serverless function
// ─────────────────────────────────────────────────────────────────────────────
// Looks up a user by email address, returning their Supabase auth profile
// and reading shelf breakdown (total, read, reading, want to read).
//
// Called by the Users tab in AdminDashboard.jsx.
// Stripe subscription data is fetched separately via /api/stripe-admin.
//
// POST /api/admin/lookup
// Headers: { "x-admin-token": ADMIN_SECRET }
// Body: { "email": "user@example.com" }
//
// ENV VARS REQUIRED:
//   ADMIN_SECRET              — Same value as VITE_ADMIN_SECRET (no VITE_ prefix)
//   SUPABASE_SERVICE_ROLE_KEY — Service role key (never expose to frontend)
//   VITE_SUPABASE_URL         — Already in Vercel; also read here without VITE_
//   SUPABASE_URL              — Optional: non-VITE alias for the URL above
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

// Support both VITE_ and bare env var names for the Supabase URL
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;

// Admin client — bypasses RLS, never exposed to the browser
const supabaseAdmin = createClient(
  SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

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

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "email is required" });

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // ── 1. Find user in Supabase auth.users by email ──────────────────────
    // The admin API's listUsers doesn't filter by email directly, so we
    // paginate and match. Fine for any realistic LitSense user base.
    let supaUser = null;
    let page = 1;
    const perPage = 1000;

    outer: while (page <= 20) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(`Supabase listUsers error: ${error.message}`);
      const users = data?.users || [];
      for (const u of users) {
        if ((u.email || "").toLowerCase() === normalizedEmail) {
          supaUser = u;
          break outer;
        }
      }
      // Stop if we've exhausted results
      if (users.length < perPage) break;
      page++;
    }

    if (!supaUser) {
      return res.json({ user: null, shelf: null });
    }

    // ── 2. Fetch reading shelf breakdown ──────────────────────────────────
    const { data: bookStates, error: shelfError } = await supabaseAdmin
      .from("user_book_state")
      .select("status")
      .eq("user_id", supaUser.id);

    if (shelfError) {
      console.error("[admin/lookup] shelf error:", shelfError.message);
    }

    const states = bookStates || [];
    const shelf = {
      total:   states.length,
      read:    states.filter(b => b.status === "read"    || b.status === "finished").length,
      reading: states.filter(b => b.status === "reading" || b.status === "current").length,
      want:    states.filter(b => b.status === "want"    || b.status === "want_to_read").length,
    };

    // ── 3. Return sanitized user profile ─────────────────────────────────
    return res.json({
      user: {
        id:                 supaUser.id,
        email:              supaUser.email,
        created_at:         supaUser.created_at,
        last_sign_in_at:    supaUser.last_sign_in_at,
        email_confirmed_at: supaUser.email_confirmed_at,
      },
      shelf,
    });

  } catch (err) {
    console.error("[admin/lookup]", err.message);
    return res.status(500).json({ error: err.message });
  }
}
