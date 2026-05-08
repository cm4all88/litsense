// api/club-admin.js
// Admin CRUD for monthly drops. Password-gated same as admin/stats.js.
// GET    /api/club-admin?action=list
// GET    /api/club-admin?action=get&id=xxx
// POST   /api/club-admin  { action: 'create', ...fields }
// POST   /api/club-admin  { action: 'update', id, ...fields }
// POST   /api/club-admin  { action: 'delete', id }
// POST   /api/club-admin  { action: 'toggle', id, is_active }
// GET    /api/club-admin?action=claims&drop_id=xxx

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function auth(req) {
  const pw = req.headers["x-admin-password"] || req.query.password || req.body?.password;
  return pw === process.env.ADMIN_PASSWORD;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-password");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!auth(req)) return res.status(401).json({ error: "Unauthorized" });

  const action = req.query.action || req.body?.action;

  try {
    // ── LIST ─────────────────────────────────────────────────────────────────
    if (action === "list") {
      const { data, error } = await supabase
        .from("monthly_drops")
        .select("*")
        .order("month_key", { ascending: false });
      if (error) throw error;
      return res.status(200).json({ drops: data });
    }

    // ── GET ──────────────────────────────────────────────────────────────────
    if (action === "get") {
      const { id } = req.query;
      const { data, error } = await supabase
        .from("monthly_drops").select("*").eq("id", id).single();
      if (error) throw error;
      return res.status(200).json({ drop: data });
    }

    // ── CLAIMS ───────────────────────────────────────────────────────────────
    if (action === "claims") {
      const { drop_id } = req.query;
      const { data, error } = await supabase
        .from("drop_claims")
        .select("*")
        .eq("drop_id", drop_id)
        .order("claimed_at", { ascending: false });
      if (error) throw error;
      return res.status(200).json({ claims: data, count: data.length });
    }

    // ── CREATE ───────────────────────────────────────────────────────────────
    if (action === "create") {
      const { password, action: _a, ...fields } = req.body;
      const { data, error } = await supabase
        .from("monthly_drops")
        .insert(fields)
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json({ drop: data });
    }

    // ── UPDATE ───────────────────────────────────────────────────────────────
    if (action === "update") {
      const { id, password, action: _a, ...fields } = req.body;
      const { data, error } = await supabase
        .from("monthly_drops")
        .update(fields)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ drop: data });
    }

    // ── TOGGLE active ─────────────────────────────────────────────────────────
    if (action === "toggle") {
      const { id, is_active } = req.body;
      const { data, error } = await supabase
        .from("monthly_drops")
        .update({ is_active })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ drop: data });
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (action === "delete") {
      const { id } = req.body;
      const { error } = await supabase.from("monthly_drops").delete().eq("id", id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    console.error("club-admin error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
