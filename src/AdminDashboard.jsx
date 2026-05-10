/**
 * FILE 2 of 2 — src/pages/AdminDashboard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * SETUP — run this SQL once in Supabase → SQL Editor → New Query → paste → Run:
 *
 * create table if not exists feature_flags (
 *   id uuid primary key default gen_random_uuid(),
 *   key text unique not null,
 *   label text not null,
 *   description text,
 *   enabled boolean default false,
 *   category text default 'general',
 *   updated_at timestamptz default now()
 * );
 * create table if not exists subscription_tiers (
 *   id uuid primary key default gen_random_uuid(),
 *   name text not null,
 *   price numeric not null default 0,
 *   interval text default 'month',
 *   description text,
 *   features jsonb default '[]',
 *   active boolean default true,
 *   badge text,
 *   sort_order int default 0,
 *   stripe_price_id text,
 *   stripe_product_id text,
 *   updated_at timestamptz default now()
 * );
 * create table if not exists coupon_codes (
 *   id uuid primary key default gen_random_uuid(),
 *   code text unique not null,
 *   discount_type text default 'percent',
 *   discount_value numeric not null,
 *   max_uses int,
 *   uses_count int default 0,
 *   expires_at timestamptz,
 *   active boolean default true,
 *   description text,
 *   created_at timestamptz default now()
 * );
 * create table if not exists app_secrets (
 *   id uuid primary key default gen_random_uuid(),
 *   name text not null,
 *   encrypted_value text not null,
 *   category text default 'api_keys',
 *   description text,
 *   hint text,
 *   updated_at timestamptz default now()
 * );
 * create table if not exists app_content (
 *   id uuid primary key default gen_random_uuid(),
 *   key text unique not null,
 *   label text not null,
 *   value text,
 *   type text default 'text',
 *   section text default 'general',
 *   description text,
 *   updated_at timestamptz default now()
 * );
 * create table if not exists app_settings (
 *   id uuid primary key default gen_random_uuid(),
 *   key text unique not null,
 *   label text not null,
 *   value text,
 *   type text default 'text',
 *   section text default 'general',
 *   description text,
 *   updated_at timestamptz default now()
 * );
 * insert into feature_flags (key,label,description,enabled,category) values
 *   ('999_club','$999 Club Membership','Ultra-premium one-time membership — toggle on when ready to launch',false,'monetization'),
 *   ('affiliate_links','Amazon Affiliate Links','Show Amazon buy buttons on book recommendations',true,'monetization'),
 *   ('book_drops','Book Drops','Weekly curated book drop section on the homepage',false,'features'),
 *   ('waitlist_mode','Waitlist Mode','Replace signup with a waitlist capture page',false,'access'),
 *   ('social_sharing','Social Sharing Buttons','Let users share their reading lists',true,'features'),
 *   ('email_digest','Weekly Email Digest','Send users a personalized weekly book recommendation email',false,'features'),
 *   ('new_user_promo','New User Promo Banner','Show a discount banner to brand-new signups',false,'marketing'),
 *   ('maintenance_mode','Maintenance Mode','Show a maintenance page — turns off the site for regular users',false,'system'),
 *   ('ratings','Book Ratings','Allow users to rate books they have read',true,'features'),
 *   ('reviews','Written Reviews','Allow users to write text reviews on books',false,'features')
 * on conflict (key) do nothing;
 * insert into app_content (key,label,value,type,section,description) values
 *   ('hero_headline','Homepage Headline','Find your next great read.','text','homepage','Main headline at the top of the homepage'),
 *   ('hero_subtext','Homepage Subtext','AI-powered book recommendations tailored to you.','text','homepage','Smaller text under the headline'),
 *   ('announcement','Announcement Banner Text','','text','homepage','Banner at top of site — leave blank to hide'),
 *   ('footer_tagline','Footer Tagline','Built for readers. Powered by AI.','text','footer','Small text in the footer'),
 *   ('maintenance_msg','Maintenance Message','We are doing some updates. Back soon!','text','system','Message shown when Maintenance Mode is ON'),
 *   ('about_text','About Page Text','','textarea','pages','Main paragraph on the About page'),
 *   ('seo_description','SEO Meta Description','LitSense — AI-powered book recommendations for every kind of reader.','text','seo','Shows in Google search results under your site title')
 * on conflict (key) do nothing;
 * insert into app_settings (key,label,value,type,section,description) values
 *   ('app_name','App Name','LitSense','text','branding','Shown in browser tab and emails'),
 *   ('support_email','Support Email','','text','contact','Where users send help requests'),
 *   ('twitter_handle','Twitter / X Handle','','text','social','Without the @ symbol'),
 *   ('instagram_handle','Instagram Handle','','text','social','Without the @ symbol'),
 *   ('books_per_page','Books Per Page','12','number','display','How many book results show at once'),
 *   ('default_currency','Currency Symbol','$','text','display','Symbol shown next to prices'),
 *   ('affiliate_tag','Amazon Affiliate Tag','','text','affiliate','Your Amazon Associates tracking ID (e.g. litsense-20)'),
 *   ('contact_page_url','Contact Page URL','','text','contact','Link to your contact or help page')
 * on conflict (key) do nothing;
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ROUTING — add to your router file:
 *   import AdminDashboard from "./pages/AdminDashboard";
 *   <Route path="/admin" element={<AdminDashboard />} />
 *
 * LOCK IT DOWN — find useIsAdmin() below and replace with your Clerk check:
 *   import { useUser } from "@clerk/clerk-react";
 *   function useIsAdmin() { const { user } = useUser(); return user?.publicMetadata?.role === "admin"; }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from "react";

// ── ENV ───────────────────────────────────────────────────────────────────────
const SB_URL       = import.meta.env.VITE_SUPABASE_URL       || "";
const SB_KEY       = import.meta.env.VITE_SUPABASE_ANON_KEY  || "";
const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET        || "";

// ── SUPABASE ──────────────────────────────────────────────────────────────────
const H = () => ({ apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" });
const db = {
  get:    async (t, x = "")  => (await fetch(`${SB_URL}/rest/v1/${t}?select=*${x}`, { headers: H() })).json(),
  insert: async (t, row)     => (await fetch(`${SB_URL}/rest/v1/${t}`, { method: "POST",  headers: H(), body: JSON.stringify(row) })).json(),
  update: async (t, id, row) => (await fetch(`${SB_URL}/rest/v1/${t}?id=eq.${id}`, { method: "PATCH", headers: H(), body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }) })).ok,
  upsert: async (t, row, on = "key") => (await fetch(`${SB_URL}/rest/v1/${t}?on_conflict=${on}`, { method: "POST", headers: { ...H(), Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(row) })).json(),
  del:    async (t, id)      => (await fetch(`${SB_URL}/rest/v1/${t}?id=eq.${id}`, { method: "DELETE", headers: H() })).ok,
};

// ── STRIPE HELPER ─────────────────────────────────────────────────────────────
async function stripeAdmin(action, payload) {
  const res = await fetch("/api/stripe-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-token": ADMIN_SECRET },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "Stripe error");
  return data;
}

// ── VAULT CRYPTO ──────────────────────────────────────────────────────────────
const SALT_KEY = "ls_vault_salt", HASH_KEY = "ls_vault_hash";
async function deriveKey(pw, salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function encrypt(plain, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  const buf = new Uint8Array(iv.byteLength + enc.byteLength); buf.set(iv); buf.set(new Uint8Array(enc), iv.byteLength);
  return btoa(String.fromCharCode(...buf));
}
async function decrypt(cipher, key) {
  try {
    const buf = Uint8Array.from(atob(cipher), c => c.charCodeAt(0));
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12)));
  } catch { return null; }
}
function getSalt() {
  let s = localStorage.getItem(SALT_KEY);
  if (!s) { s = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))); localStorage.setItem(SALT_KEY, s); }
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
async function hashPw(pw) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw + "litsense_v1"));
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

// ── ADMIN GATE ────────────────────────────────────────────────────────────────
// Replace with Clerk: const { user } = useUser(); return user?.publicMetadata?.role === "admin";
function useIsAdmin() { return true; }

// ── THEME ─────────────────────────────────────────────────────────────────────
const T = { bg:"#09080a", surface:"#111018", card:"#18161f", border:"#252330", borderHi:"#342f42", text:"#ede8f5", mid:"#8a80a0", low:"#4a4460", amber:"#c8a96e", amberDim:"#8a6f3e", green:"#6ec894", red:"#c86e6e", blue:"#6ea8c8", purple:"#a86ec8" };

// ── UI PRIMITIVES ─────────────────────────────────────────────────────────────
const inp = { width:"100%", boxSizing:"border-box", background:"#0d0c14", border:`1px solid ${T.border}`, borderRadius:7, padding:"9px 12px", color:T.text, fontSize:13, outline:"none", fontFamily:"inherit" };

function Ic({ d, size=16, col="currentColor" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>;
}
const P = {
  home:"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  flag:"M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7",
  layers:"M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5",
  tag:"M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01",
  lock:"M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M17 11V7a5 5 0 0 0-10 0v4",
  edit:"M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z",
  settings:"M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  plus:"M12 5v14 M5 12h14", trash:"M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  x:"M18 6L6 18 M6 6l12 12", check:"M20 6L9 17l-5-5", eye:"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  eyeOff:"M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94 M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19 M1 1l22 22",
  copy:"M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  refresh:"M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  file:"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  shield:"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
};

function Toggle({ on, onChange, disabled }) {
  return (
    <button onClick={() => !disabled && onChange(!on)} style={{ position:"relative", display:"inline-flex", alignItems:"center", width:40, height:22, borderRadius:11, border:"none", cursor:disabled?"not-allowed":"pointer", background:on?T.amber:T.border, transition:"background 0.18s", flexShrink:0, padding:0, opacity:disabled?0.5:1 }}>
      <span style={{ position:"absolute", left:on?20:2, width:18, height:18, borderRadius:"50%", background:on?T.bg:T.low, transition:"left 0.18s", boxShadow:"0 1px 4px rgba(0,0,0,.5)" }} />
    </button>
  );
}
function Badge({ label, color=T.amber }) {
  return <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase", padding:"2px 7px", borderRadius:4, background:color+"22", color, border:`1px solid ${color}33` }}>{label}</span>;
}
function Dot({ color }) {
  return <span style={{ display:"inline-block", width:7, height:7, borderRadius:"50%", background:color, boxShadow:`0 0 6px ${color}88`, flexShrink:0 }} />;
}
function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:"block", fontSize:11, fontWeight:600, letterSpacing:"0.07em", textTransform:"uppercase", color:T.mid, marginBottom:6 }}>{label}</label>
      {children}
      {hint && <p style={{ margin:"4px 0 0", fontSize:11, color:T.low, lineHeight:1.5 }}>{hint}</p>}
    </div>
  );
}
function Modal({ title, subtitle, onClose, children }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20 }}>
      <div style={{ background:T.surface, border:`1px solid ${T.borderHi}`, borderRadius:12, width:"100%", maxWidth:500, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 32px 80px rgba(0,0,0,.7)" }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", padding:"20px 24px 16px", borderBottom:`1px solid ${T.border}` }}>
          <div>
            <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:T.text, fontFamily:"'Fraunces',Georgia,serif" }}>{title}</h3>
            {subtitle && <p style={{ margin:"3px 0 0", fontSize:12, color:T.mid }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:T.low, padding:4, marginLeft:12 }}><Ic d={P.x} size={17}/></button>
        </div>
        <div style={{ padding:"20px 24px" }}>{children}</div>
      </div>
    </div>
  );
}
function Btn({ children, onClick, variant="primary", small, icon, disabled }) {
  const v = { primary:{bg:T.amber,fg:T.bg}, secondary:{bg:T.border,fg:T.mid}, ghost:{bg:"transparent",fg:T.mid} };
  const { bg, fg } = v[variant] || v.primary;
  return (
    <button onClick={onClick} disabled={disabled} style={{ background:bg, border:variant==="ghost"?`1px solid ${T.border}`:"none", borderRadius:7, padding:small?"6px 12px":"9px 16px", color:fg, fontSize:small?11:13, fontWeight:600, cursor:disabled?"not-allowed":"pointer", display:"inline-flex", alignItems:"center", gap:5, opacity:disabled?0.5:1 }}>
      {icon && <Ic d={icon} size={small?12:14} col={fg}/>}{children}
    </button>
  );
}
function ErrBox({ msg }) {
  if (!msg) return null;
  return <div style={{ background:T.red+"18", border:`1px solid ${T.red}40`, borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:13, color:T.red }}>⚠ {msg}</div>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════════
function Overview({ onNav }) {
  const [stats, setStats] = useState({ flags:0, flagsOn:0, tiers:0, tiersOn:0, coupons:0, couponsOn:0, secrets:0 });
  useEffect(() => {
    Promise.all([db.get("feature_flags"), db.get("subscription_tiers"), db.get("coupon_codes"), db.get("app_secrets")]).then(([f,t,c,s]) => {
      setStats({ flags:f?.length||0, flagsOn:f?.filter(x=>x.enabled).length||0, tiers:t?.length||0, tiersOn:t?.filter(x=>x.active).length||0, coupons:c?.length||0, couponsOn:c?.filter(x=>x.active).length||0, secrets:s?.length||0 });
    });
  }, []);
  const cards = [
    { label:"Feature Flags",  value:`${stats.flagsOn}/${stats.flags}`,  sub:"active",        color:T.amber,  icon:P.flag    },
    { label:"Active Plans",   value:stats.tiersOn,                       sub:"visible to users",color:T.blue, icon:P.layers  },
    { label:"Promo Codes",    value:stats.couponsOn,                     sub:"live codes",    color:T.green,  icon:P.tag     },
    { label:"Vault Secrets",  value:stats.secrets,                       sub:"stored safely", color:T.purple, icon:P.lock    },
  ];
  const quick = [
    { label:"Turn features on/off",     desc:"Toggle $999 Club, Book Drops, Waitlist Mode and more", tab:"flags",    icon:P.flag,    color:T.amber  },
    { label:"Manage subscription plans",desc:"Add, edit, or hide pricing plans — syncs to Stripe",   tab:"tiers",    icon:P.layers,  color:T.blue   },
    { label:"Create a promo code",      desc:"Discount codes for users — set %, $, limits & expiry", tab:"coupons",  icon:P.tag,     color:T.green  },
    { label:"API keys & passwords",     desc:"Encrypted vault — requires your master password",       tab:"vault",    icon:P.lock,    color:T.purple },
    { label:"Edit site text & banners", desc:"Headlines, announcements, footer, SEO description",    tab:"content",  icon:P.file,    color:T.amber  },
    { label:"App settings",             desc:"Name, email, social links, affiliate tag",             tab:"settings", icon:P.settings,color:T.mid    },
  ];
  return (
    <div>
      <div style={{ marginBottom:28 }}>
        <h2 style={{ margin:"0 0 4px", fontFamily:"'Fraunces',Georgia,serif", fontSize:22, color:T.text, fontWeight:700 }}>Command Center</h2>
        <p style={{ margin:0, color:T.mid, fontSize:13 }}>Everything you need to run LitSense — no code required.</p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10, marginBottom:28 }}>
        {cards.map(c => (
          <div key={c.label} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:"16px 18px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <span style={{ fontSize:10, fontWeight:600, letterSpacing:"0.07em", textTransform:"uppercase", color:T.mid }}>{c.label}</span>
              <div style={{ width:30, height:30, borderRadius:7, background:c.color+"18", display:"flex", alignItems:"center", justifyContent:"center" }}><Ic d={c.icon} size={14} col={c.color}/></div>
            </div>
            <div style={{ fontSize:26, fontWeight:800, color:c.color, fontFamily:"'Fraunces',Georgia,serif", lineHeight:1 }}>{c.value}</div>
            <div style={{ fontSize:11, color:T.low, marginTop:4 }}>{c.sub}</div>
          </div>
        ))}
      </div>
      <h3 style={{ margin:"0 0 12px", fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:T.low }}>What do you want to do?</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:8 }}>
        {quick.map(q => (
          <button key={q.tab} onClick={() => onNav(q.tab)} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:"14px 16px", cursor:"pointer", textAlign:"left", display:"flex", alignItems:"flex-start", gap:12 }}
            onMouseEnter={e=>e.currentTarget.style.borderColor=T.borderHi} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
            <div style={{ width:34, height:34, borderRadius:8, background:q.color+"18", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}><Ic d={q.icon} size={16} col={q.color}/></div>
            <div><div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:2 }}>{q.label}</div><div style={{ fontSize:11, color:T.mid, lineHeight:1.5 }}>{q.desc}</div></div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. FEATURE FLAGS
// ═══════════════════════════════════════════════════════════════════════════════
function FeatureFlags() {
  const [flags, setFlags] = useState([]);
  const [saving, setSaving] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const blank = { key:"", label:"", description:"", category:"general", enabled:false };
  const [form, setForm] = useState(blank);
  const cats = ["general","monetization","features","access","marketing","system"];
  const cc = { monetization:T.amber, features:T.blue, access:T.red, marketing:T.green, system:T.purple, general:T.mid };

  useEffect(() => { db.get("feature_flags","&order=category.asc,label.asc").then(d=>Array.isArray(d)&&setFlags(d)); }, []);

  const toggle = async (flag) => {
    setSaving(flag.id);
    await db.update("feature_flags", flag.id, { enabled:!flag.enabled });
    setFlags(f=>f.map(x=>x.id===flag.id?{...x,enabled:!x.enabled}:x));
    setSaving(null);
  };
  const add = async () => {
    if (!form.key||!form.label) return;
    const r = await db.insert("feature_flags",{...form,key:form.key.toLowerCase().replace(/\s+/g,"_")});
    if (Array.isArray(r)) setFlags(f=>[...f,r[0]]);
    setShowAdd(false); setForm(blank);
  };
  const del = async (id) => { if (!confirm("Delete this flag?")) return; await db.del("feature_flags",id); setFlags(f=>f.filter(x=>x.id!==id)); };
  const grouped = cats.reduce((a,c)=>{const i=flags.filter(f=>f.category===c);if(i.length)a[c]=i;return a;},{});

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <p style={{ margin:0, fontSize:13, color:T.mid }}>{flags.filter(f=>f.enabled).length} of {flags.length} features currently ON</p>
        <Btn onClick={()=>setShowAdd(true)} icon={P.plus} small>Add Flag</Btn>
      </div>
      {Object.entries(grouped).map(([cat,items])=>(
        <div key={cat} style={{ marginBottom:24 }}>
          <div style={{ marginBottom:8 }}><Badge label={cat} color={cc[cat]}/></div>
          <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
            {items.map(flag=>(
              <div key={flag.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 15px", background:"#100f18", borderRadius:8, border:`1px solid ${T.border}`, opacity:saving===flag.id?0.5:1 }}>
                <Toggle on={flag.enabled} onChange={()=>toggle(flag)} disabled={saving===flag.id}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:flag.enabled?T.text:T.low }}>{flag.label}</div>
                  {flag.description&&<div style={{ fontSize:11, color:T.low, marginTop:2, lineHeight:1.5 }}>{flag.description}</div>}
                </div>
                <span style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:T.low, letterSpacing:"0.04em", flexShrink:0 }}>{flag.key}</span>
                <button onClick={()=>del(flag.id)} style={{ background:"none", border:"none", cursor:"pointer", color:T.red, opacity:0.4, padding:4, flexShrink:0 }}><Ic d={P.trash} size={13}/></button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {showAdd&&(
        <Modal title="Add Feature Flag" subtitle="Lets you turn a part of the app on or off without touching code." onClose={()=>setShowAdd(false)}>
          <Field label="Internal Key" hint="Letters and underscores only. e.g. my_feature"><input style={inp} value={form.key} onChange={e=>setForm(f=>({...f,key:e.target.value}))} placeholder="feature_name"/></Field>
          <Field label="Display Name"><input style={inp} value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))} placeholder="My New Feature"/></Field>
          <Field label="What does this do?"><input style={inp} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Plain English — what does turning this on do?"/></Field>
          <Field label="Category"><select style={inp} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>{cats.map(c=><option key={c} value={c}>{c}</option>)}</select></Field>
          <Field label="Start turned ON?"><div style={{ display:"flex", alignItems:"center", gap:10 }}><Toggle on={form.enabled} onChange={v=>setForm(f=>({...f,enabled:v}))}/><span style={{ fontSize:12, color:T.mid }}>{form.enabled?"Yes — active immediately":"No — off until you flip it"}</span></div></Field>
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:8 }}><Btn variant="ghost" onClick={()=>setShowAdd(false)}>Cancel</Btn><Btn onClick={add}>Add Flag</Btn></div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. SUBSCRIPTION TIERS (Stripe-connected)
// ═══════════════════════════════════════════════════════════════════════════════
function SubscriptionTiers() {
  const [tiers, setTiers]     = useState([]);
  const [modal, setModal]     = useState(null);
  const [saving, setSaving]   = useState(false);
  const [toggling, setToggling] = useState(null);
  const [err, setErr]         = useState("");
  const [stripeOk, setStripeOk] = useState(null);
  const blank = { name:"", price:"", interval:"month", description:"", features:"", badge:"", active:true, sort_order:0, stripe_product_id:"", stripe_price_id:"", _op:"", _oi:"" };
  const [form, setForm] = useState(blank);

  const load = useCallback(()=>{ db.get("subscription_tiers","&order=sort_order.asc").then(d=>Array.isArray(d)&&setTiers(d)); },[]);
  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ stripeAdmin("restore",{stripe_product_id:null}).then(()=>setStripeOk(true)).catch(()=>setStripeOk(false)); },[]);

  const openAdd  = ()=>{ setErr(""); setForm(blank); setModal("add"); };
  const openEdit = (t)=>{ setErr(""); setForm({...t, features:Array.isArray(t.features)?t.features.join("\n"):"", _op:t.price, _oi:t.interval}); setModal(t.id); };

  const save = async () => {
    if (!form.name||!form.price){ setErr("Plan name and price are required."); return; }
    setSaving(true); setErr("");
    try {
      const features = form.features?form.features.split("\n").filter(Boolean):[];
      const isEdit   = modal!=="add";
      const priceChanged = isEdit&&(parseFloat(form.price)!==parseFloat(form._op)||form.interval!==form._oi);
      let sid = form.stripe_product_id, spid = form.stripe_price_id;

      if (!isEdit) {
        const r = await stripeAdmin("create",{ name:form.name, description:form.description, price:form.price, interval:form.interval });
        sid=r.stripe_product_id; spid=r.stripe_price_id;
      } else if (sid) {
        const r = await stripeAdmin("update",{ stripe_product_id:sid, stripe_price_id:spid, name:form.name, description:form.description, price:form.price, interval:form.interval, price_changed:priceChanged });
        spid=r.stripe_price_id;
      } else {
        const r = await stripeAdmin("create",{ name:form.name, description:form.description, price:form.price, interval:form.interval });
        sid=r.stripe_product_id; spid=r.stripe_price_id;
      }

      const payload={ name:form.name, price:parseFloat(form.price), interval:form.interval, description:form.description, features, badge:form.badge, active:form.active, sort_order:parseInt(form.sort_order)||0, stripe_product_id:sid, stripe_price_id:spid };
      if (isEdit){ await db.update("subscription_tiers",modal,payload); setTiers(t=>t.map(x=>x.id===modal?{...x,...payload}:x)); }
      else { const r=await db.insert("subscription_tiers",payload); if(Array.isArray(r))setTiers(t=>[...t,r[0]]);else load(); }
      setModal(null);
    } catch(e){ setErr(e.message); } finally { setSaving(false); }
  };

  const toggleActive = async (tier) => {
    setToggling(tier.id); setErr("");
    try {
      await stripeAdmin(tier.active?"archive":"restore",{ stripe_product_id:tier.stripe_product_id, stripe_price_id:tier.stripe_price_id });
      await db.update("subscription_tiers",tier.id,{active:!tier.active});
      setTiers(t=>t.map(x=>x.id===tier.id?{...x,active:!x.active}:x));
    } catch(e){ setErr(`Stripe toggle failed: ${e.message}`); } finally { setToggling(null); }
  };

  const del = async (tier) => {
    if (!confirm(`Delete "${tier.name}"?\n\nThis removes it from LitSense. Existing subscribers keep their access.`)) return;
    if (tier.stripe_product_id) await stripeAdmin("archive",{stripe_product_id:tier.stripe_product_id,stripe_price_id:tier.stripe_price_id}).catch(()=>{});
    await db.del("subscription_tiers",tier.id);
    setTiers(t=>t.filter(x=>x.id!==tier.id));
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <p style={{ margin:0, fontSize:13, color:T.mid }}>{tiers.filter(t=>t.active).length} plan{tiers.filter(t=>t.active).length!==1?"s":""} visible to users</p>
          {stripeOk===true  && <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase", padding:"3px 8px", borderRadius:20, background:T.green+"20", color:T.green, border:`1px solid ${T.green}40`, display:"inline-flex", alignItems:"center", gap:5 }}><span style={{ width:5,height:5,borderRadius:"50%",background:"currentColor",display:"inline-block"}}/> Stripe connected</span>}
          {stripeOk===false && <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase", padding:"3px 8px", borderRadius:20, background:T.red+"20", color:T.red, border:`1px solid ${T.red}40`, display:"inline-flex", alignItems:"center", gap:5 }}><span style={{ width:5,height:5,borderRadius:"50%",background:"currentColor",display:"inline-block"}}/> Stripe not reachable</span>}
        </div>
        <Btn onClick={openAdd} icon={P.plus} small>Add Plan</Btn>
      </div>
      <ErrBox msg={err}/>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {tiers.map(tier=>(
          <div key={tier.id} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:"16px 18px", opacity:tier.active?1:0.55, transition:"opacity 0.15s" }}>
            <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
              <Toggle on={tier.active} onChange={()=>toggleActive(tier)} disabled={toggling===tier.id}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:2 }}>
                  <span style={{ fontSize:15, fontWeight:700, color:T.text, fontFamily:"'Fraunces',Georgia,serif" }}>{tier.name}</span>
                  {tier.badge&&<Badge label={tier.badge}/>}
                  {!tier.active&&<Badge label="Hidden" color={T.low}/>}
                </div>
                <div style={{ fontSize:22, fontWeight:800, color:T.amber, fontFamily:"'Fraunces',Georgia,serif", lineHeight:1.1, marginBottom:4 }}>
                  ${tier.price}<span style={{ fontSize:12, fontWeight:400, color:T.low }}>{tier.interval==="once"?" one-time":`/${tier.interval}`}</span>
                </div>
                {tier.description&&<p style={{ margin:"0 0 6px", fontSize:12, color:T.low }}>{tier.description}</p>}
                {Array.isArray(tier.features)&&tier.features.length>0&&(
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:6 }}>{tier.features.map((f,i)=><span key={i} style={{ fontSize:10, color:T.mid, background:T.border, borderRadius:4, padding:"2px 8px" }}>{f}</span>)}</div>
                )}
                {tier.stripe_price_id
                  ? <span style={{ fontSize:10, color:T.low, fontFamily:"'JetBrains Mono',monospace" }}>{tier.stripe_price_id}</span>
                  : <span style={{ fontSize:10, color:T.amber+"80", fontFamily:"'JetBrains Mono',monospace" }}>Not yet synced to Stripe</span>}
              </div>
              <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                <Btn variant="secondary" onClick={()=>openEdit(tier)} small>Edit</Btn>
                <button onClick={()=>del(tier)} style={{ background:"none", border:"none", cursor:"pointer", color:T.red, opacity:0.4, padding:6 }}><Ic d={P.trash} size={14}/></button>
              </div>
            </div>
          </div>
        ))}
        {tiers.length===0&&<div style={{ textAlign:"center", padding:"40px 20px", color:T.low, fontSize:13 }}>No plans yet. Add your first subscription plan.</div>}
      </div>

      {modal&&(
        <Modal title={modal==="add"?"Add Subscription Plan":"Edit Plan"} subtitle={modal==="add"?"Creates a matching product in Stripe automatically.":"Price changes create a new Stripe price automatically."} onClose={()=>setModal(null)}>
          <ErrBox msg={err}/>
          <Field label="Plan Name"><input style={inp} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. $999 Club"/></Field>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1.6fr", gap:10 }}>
            <Field label="Price ($)"><input style={inp} type="number" step="0.01" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="9.99"/></Field>
            <Field label="Billing"><select style={inp} value={form.interval} onChange={e=>setForm(f=>({...f,interval:e.target.value}))}><option value="month">Monthly</option><option value="year">Yearly</option><option value="once">One-Time</option></select></Field>
          </div>
          {modal!=="add"&&(parseFloat(form.price)!==parseFloat(form._op)||form.interval!==form._oi)&&(
            <div style={{ background:T.amber+"12", border:`1px solid ${T.amber}30`, borderRadius:7, padding:"9px 13px", marginBottom:14, fontSize:12, color:T.amber, lineHeight:1.6 }}>
              ℹ Price or billing changed — Stripe will create a new price automatically. Existing subscribers keep their current rate.
            </div>
          )}
          <Field label="Short Description"><input style={inp} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="One sentence — what users get"/></Field>
          <Field label="Features (one per line)" hint="Each line becomes a bullet on your pricing page"><textarea style={{...inp,minHeight:90,resize:"vertical"}} value={form.features} onChange={e=>setForm(f=>({...f,features:e.target.value}))} placeholder={"Unlimited AI recommendations\nEarly access to Book Drops\nPriority support"}/></Field>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <Field label="Badge" hint="e.g. Most Popular"><input style={inp} value={form.badge} onChange={e=>setForm(f=>({...f,badge:e.target.value}))} placeholder="Most Popular"/></Field>
            <Field label="Display Order" hint="Lower = shows first"><input style={inp} type="number" value={form.sort_order} onChange={e=>setForm(f=>({...f,sort_order:e.target.value}))}/></Field>
          </div>
          <Field label="Show to users?"><div style={{ display:"flex", alignItems:"center", gap:10 }}><Toggle on={form.active} onChange={v=>setForm(f=>({...f,active:v}))}/><span style={{ fontSize:12, color:T.mid }}>{form.active?"Yes — visible on pricing page":"No — hidden from users"}</span></div></Field>
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:8 }}>
            <Btn variant="ghost" onClick={()=>setModal(null)}>Cancel</Btn>
            <button onClick={save} disabled={saving} style={{ background:saving?T.amberDim:T.amber, border:"none", borderRadius:7, padding:"9px 18px", color:T.bg, fontWeight:700, cursor:saving?"wait":"pointer", fontSize:13, display:"inline-flex", alignItems:"center", gap:6 }}>
              {saving?<><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" style={{animation:"spin 0.8s linear infinite"}}><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg>Saving to Stripe…</>:modal==="add"?"Create Plan":"Save Changes"}
            </button>
          </div>
        </Modal>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. COUPON CODES
// ═══════════════════════════════════════════════════════════════════════════════
function CouponCodes() {
  const [coupons, setCoupons] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [copied, setCopied]   = useState(null);
  const blank = { code:"", discount_type:"percent", discount_value:"", max_uses:"", expires_at:"", description:"", active:true };
  const [form, setForm] = useState(blank);

  const load = useCallback(()=>{ db.get("coupon_codes","&order=created_at.desc").then(d=>Array.isArray(d)&&setCoupons(d)); },[]);
  useEffect(()=>{ load(); },[load]);

  const gen = ()=>{ const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s=""; for(let i=0;i<8;i++)s+=c[Math.floor(Math.random()*c.length)]; setForm(f=>({...f,code:s})); };
  const save = async ()=>{
    if (!form.code||!form.discount_value) return;
    await db.insert("coupon_codes",{...form,code:form.code.toUpperCase(),discount_value:parseFloat(form.discount_value),max_uses:form.max_uses?parseInt(form.max_uses):null,expires_at:form.expires_at||null});
    setShowAdd(false); setForm(blank); load();
  };
  const toggle = async (c)=>{ await db.update("coupon_codes",c.id,{active:!c.active}); setCoupons(cs=>cs.map(x=>x.id===c.id?{...x,active:!x.active}:x)); };
  const del = async (id)=>{ if(!confirm("Delete this coupon code?"))return; await db.del("coupon_codes",id); setCoupons(c=>c.filter(x=>x.id!==id)); };
  const copy = (code)=>{ navigator.clipboard.writeText(code); setCopied(code); setTimeout(()=>setCopied(null),1500); };
  const isExp = (c)=>c.expires_at&&new Date(c.expires_at)<new Date();
  const isOut = (c)=>c.max_uses&&c.uses_count>=c.max_uses;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <p style={{ margin:0, fontSize:13, color:T.mid }}>{coupons.filter(c=>c.active&&!isExp(c)&&!isOut(c)).length} live codes</p>
        <Btn onClick={()=>setShowAdd(true)} icon={P.plus} small>New Code</Btn>
      </div>
      {coupons.length===0
        ? <div style={{ textAlign:"center", padding:"40px 20px", color:T.low, fontSize:13 }}>No codes yet.</div>
        : <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {coupons.map(c=>{
              const dead=isExp(c)||isOut(c);
              return (
                <div key={c.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", background:"#100f18", border:`1px solid ${T.border}`, borderRadius:8, opacity:!c.active||dead?0.45:1 }}>
                  <Toggle on={c.active&&!dead} onChange={()=>!dead&&toggle(c)} disabled={dead}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:700, color:T.text, letterSpacing:"0.1em" }}>{c.code}</span>
                      <button onClick={()=>copy(c.code)} style={{ background:"none", border:"none", cursor:"pointer", color:copied===c.code?T.green:T.low, padding:0 }}><Ic d={copied===c.code?P.check:P.copy} size={12}/></button>
                      <Badge label={c.discount_type==="percent"?`${c.discount_value}% off`:`$${c.discount_value} off`} color={T.blue}/>
                      {isExp(c)&&<Badge label="Expired" color={T.red}/>}
                      {isOut(c)&&<Badge label="Used up" color={T.red}/>}
                      {!c.active&&!dead&&<Badge label="Paused" color={T.low}/>}
                    </div>
                    <div style={{ fontSize:11, color:T.low, marginTop:3, display:"flex", gap:12, flexWrap:"wrap" }}>
                      {c.description&&<span>{c.description}</span>}
                      <span>{c.max_uses?`${c.uses_count}/${c.max_uses} uses`:`${c.uses_count} uses so far`}</span>
                      {c.expires_at&&<span>Expires {new Date(c.expires_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <button onClick={()=>del(c.id)} style={{ background:"none", border:"none", cursor:"pointer", color:T.red, opacity:0.4, padding:4, flexShrink:0 }}><Ic d={P.trash} size={13}/></button>
                </div>
              );
            })}
          </div>
      }
      {showAdd&&(
        <Modal title="New Coupon Code" subtitle="Give users a discount code to use at checkout." onClose={()=>setShowAdd(false)}>
          <Field label="Code" hint="What users type in — all caps, no spaces">
            <div style={{ display:"flex", gap:8 }}>
              <input style={{...inp,flex:1,fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.1em"}} value={form.code} onChange={e=>setForm(f=>({...f,code:e.target.value.toUpperCase()}))} placeholder="SUMMER25"/>
              <Btn variant="secondary" onClick={gen} small icon={P.refresh}>Generate</Btn>
            </div>
          </Field>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <Field label="Type"><select style={inp} value={form.discount_type} onChange={e=>setForm(f=>({...f,discount_type:e.target.value}))}><option value="percent">% off</option><option value="fixed">$ off</option></select></Field>
            <Field label={form.discount_type==="percent"?"How many % off?":"How many $ off?"}><input style={inp} type="number" value={form.discount_value} onChange={e=>setForm(f=>({...f,discount_value:e.target.value}))} placeholder={form.discount_type==="percent"?"25":"10"}/></Field>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <Field label="Max Uses" hint="Blank = unlimited"><input style={inp} type="number" value={form.max_uses} onChange={e=>setForm(f=>({...f,max_uses:e.target.value}))} placeholder="No limit"/></Field>
            <Field label="Expiry Date" hint="Blank = never"><input style={inp} type="date" value={form.expires_at} onChange={e=>setForm(f=>({...f,expires_at:e.target.value}))}/></Field>
          </div>
          <Field label="Internal Note" hint="Only you see this"><input style={inp} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="e.g. Summer launch promo"/></Field>
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:8 }}><Btn variant="ghost" onClick={()=>setShowAdd(false)}>Cancel</Btn><Btn onClick={save}>Create Code</Btn></div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. SECRETS VAULT
// ═══════════════════════════════════════════════════════════════════════════════
function SecretsVault() {
  const [unlocked, setUnlocked] = useState(false);
  const [vaultKey, setVaultKey] = useState(null);
  const [pwInput, setPwInput]   = useState("");
  const [isFirst, setIsFirst]   = useState(!localStorage.getItem(HASH_KEY));
  const [pwErr, setPwErr]       = useState("");
  const [secrets, setSecrets]   = useState([]);
  const [revealed, setRevealed] = useState({});
  const [decrypted, setDecrypted] = useState({});
  const [copied, setCopied]     = useState(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [editId, setEditId]     = useState(null);
  const blank = { name:"", category:"api_keys", description:"", hint:"" };
  const [form, setForm] = useState({...blank,_plain:""});
  const cats = ["api_keys","auth","database","payments","email","other"];
  const catLabel = { api_keys:"API Keys", auth:"Auth & Access", database:"Database", payments:"Payments", email:"Email", other:"Other" };
  const catColor = { api_keys:T.amber, auth:T.purple, database:T.blue, payments:T.green, email:T.red, other:T.mid };

  const unlock = async () => {
    setPwErr("");
    const salt = getSalt(), key = await deriveKey(pwInput, salt);
    if (isFirst) {
      localStorage.setItem(HASH_KEY, await hashPw(pwInput));
      setVaultKey(key); setUnlocked(true); setIsFirst(false);
    } else {
      if (await hashPw(pwInput) !== localStorage.getItem(HASH_KEY)) { setPwErr("Wrong password."); return; }
      setVaultKey(key); setUnlocked(true);
    }
    setPwInput("");
  };

  const loadSecrets = useCallback(async ()=>{ const d=await db.get("app_secrets","&order=category.asc,name.asc"); if(Array.isArray(d))setSecrets(d); },[]);
  useEffect(()=>{ if(unlocked)loadSecrets(); },[unlocked,loadSecrets]);

  const reveal = async (sec) => {
    if (revealed[sec.id]){ setRevealed(r=>({...r,[sec.id]:false})); return; }
    const val = await decrypt(sec.encrypted_value, vaultKey);
    if (!val){ alert("Could not decrypt. Wrong vault password?"); return; }
    setDecrypted(d=>({...d,[sec.id]:val})); setRevealed(r=>({...r,[sec.id]:true}));
  };
  const copyVal = async (sec) => {
    const val = decrypted[sec.id] || await decrypt(sec.encrypted_value, vaultKey);
    if (!val) return;
    navigator.clipboard.writeText(val); setCopied(sec.id); setTimeout(()=>setCopied(null),1500);
  };
  const saveSecret = async () => {
    if (!form.name||!form._plain) return;
    const enc = await encrypt(form._plain, vaultKey);
    if (editId) await db.update("app_secrets",editId,{name:form.name,encrypted_value:enc,category:form.category,description:form.description,hint:form.hint});
    else await db.insert("app_secrets",{name:form.name,encrypted_value:enc,category:form.category,description:form.description,hint:form.hint});
    setShowAdd(false); setEditId(null); setForm({...blank,_plain:""}); loadSecrets();
  };
  const openEdit = async (sec) => {
    const val = await decrypt(sec.encrypted_value, vaultKey);
    setForm({name:sec.name,_plain:val||"",category:sec.category,description:sec.description||"",hint:sec.hint||""});
    setEditId(sec.id); setShowAdd(true);
  };
  const del = async (id) => { if(!confirm("Delete this secret? Cannot be undone."))return; await db.del("app_secrets",id); setSecrets(s=>s.filter(x=>x.id!==id)); };
  const resetVault = ()=>{ if(!confirm("Reset vault password? All existing encrypted secrets will become unreadable."))return; localStorage.removeItem(HASH_KEY); localStorage.removeItem(SALT_KEY); setUnlocked(false); setIsFirst(true); setVaultKey(null); setSecrets([]); };
  const grouped = cats.reduce((a,c)=>{const i=secrets.filter(s=>s.category===c);if(i.length)a[c]=i;return a;},{});

  if (!unlocked) return (
    <div style={{ maxWidth:400, margin:"0 auto", paddingTop:20 }}>
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:"32px 28px", textAlign:"center" }}>
        <div style={{ width:56, height:56, borderRadius:14, background:T.purple+"20", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}><Ic d={P.lock} size={24} col={T.purple}/></div>
        <h3 style={{ margin:"0 0 6px", fontFamily:"'Fraunces',Georgia,serif", fontSize:18, color:T.text }}>{isFirst?"Set a Vault Password":"Unlock the Vault"}</h3>
        <p style={{ margin:"0 0 20px", fontSize:13, color:T.mid, lineHeight:1.6 }}>{isFirst?"Choose a strong password to protect your API keys. Write it down — you'll need it every time.":"Enter your vault password to view and manage your secrets."}</p>
        <input style={{...inp,textAlign:"center",letterSpacing:"0.08em",marginBottom:8}} type="password" placeholder={isFirst?"Choose a strong password":"Your vault password"} value={pwInput} onChange={e=>setPwInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&unlock()}/>
        {pwErr&&<p style={{ margin:"0 0 8px", fontSize:12, color:T.red }}>{pwErr}</p>}
        <Btn onClick={unlock} disabled={!pwInput}>{isFirst?"Set Password & Open Vault":"Unlock"}</Btn>
        {!isFirst&&<div style={{ marginTop:16 }}><button onClick={resetVault} style={{ background:"none", border:"none", cursor:"pointer", color:T.red, fontSize:11, opacity:0.5 }}>Reset vault password (dangerous)</button></div>}
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}><Dot color={T.green}/><span style={{ fontSize:12, color:T.mid }}>{secrets.length} secret{secrets.length!==1?"s":""} stored — vault unlocked</span></div>
        <div style={{ display:"flex", gap:8 }}>
          <Btn variant="ghost" onClick={()=>{setUnlocked(false);setVaultKey(null);setRevealed({});setDecrypted({});}} small>Lock</Btn>
          <Btn onClick={()=>{setEditId(null);setForm({...blank,_plain:""});setShowAdd(true);}} icon={P.plus} small>Add Secret</Btn>
        </div>
      </div>
      <div style={{ background:T.purple+"0d", border:`1px solid ${T.purple}22`, borderRadius:8, padding:"10px 14px", marginBottom:20, display:"flex", gap:10, alignItems:"flex-start" }}>
        <Ic d={P.shield} size={15} col={T.purple}/>
        <p style={{ margin:0, fontSize:12, color:T.mid, lineHeight:1.6 }}>All values are encrypted with AES-256 before saving. Nobody can read them without your vault password — not even in the database.</p>
      </div>
      {Object.entries(grouped).map(([cat,items])=>(
        <div key={cat} style={{ marginBottom:24 }}>
          <div style={{ marginBottom:8 }}><Badge label={catLabel[cat]} color={catColor[cat]}/></div>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            {items.map(sec=>(
              <div key={sec.id} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:8, padding:"12px 14px" }}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:2 }}>{sec.name}</div>
                    {sec.description&&<div style={{ fontSize:11, color:T.low, marginBottom:4 }}>{sec.description}</div>}
                    {revealed[sec.id]
                      ? <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:T.amber, background:T.bg, border:`1px solid ${T.border}`, borderRadius:5, padding:"5px 9px", wordBreak:"break-all" }}>{decrypted[sec.id]}</div>
                      : <div style={{ fontSize:11, color:T.low, fontFamily:"'JetBrains Mono',monospace", letterSpacing:"0.1em" }}>{sec.hint?`Hint: ${sec.hint}`:"••••••••••••••••••••"}</div>}
                  </div>
                  <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                    <button title={revealed[sec.id]?"Hide":"Reveal"} onClick={()=>reveal(sec)} style={{ background:T.border, border:"none", borderRadius:6, padding:"5px 8px", cursor:"pointer", color:revealed[sec.id]?T.amber:T.mid }}><Ic d={revealed[sec.id]?P.eyeOff:P.eye} size={13}/></button>
                    <button title="Copy" onClick={()=>copyVal(sec)} style={{ background:T.border, border:"none", borderRadius:6, padding:"5px 8px", cursor:"pointer", color:copied===sec.id?T.green:T.mid }}><Ic d={copied===sec.id?P.check:P.copy} size={13}/></button>
                    <button title="Edit" onClick={()=>openEdit(sec)} style={{ background:T.border, border:"none", borderRadius:6, padding:"5px 8px", cursor:"pointer", color:T.mid }}><Ic d={P.edit} size={13}/></button>
                    <button title="Delete" onClick={()=>del(sec.id)} style={{ background:"none", border:"none", cursor:"pointer", color:T.red, opacity:0.4, padding:5 }}><Ic d={P.trash} size={13}/></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {showAdd&&(
        <Modal title={editId?"Edit Secret":"Add Secret"} subtitle="The value will be encrypted immediately when you save." onClose={()=>{setShowAdd(false);setEditId(null);}}>
          <Field label="Name" hint="e.g. Anthropic API Key, Stripe Secret Key"><input style={inp} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Anthropic API Key"/></Field>
          <Field label="Value (the actual secret)" hint="Encrypted before saving — nobody can read it without your vault password"><input style={{...inp,fontFamily:"'JetBrains Mono',monospace"}} type="password" value={form._plain} onChange={e=>setForm(f=>({...f,_plain:e.target.value}))} placeholder="sk-ant-api..."/></Field>
          <Field label="Category"><select style={inp} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>{cats.map(c=><option key={c} value={c}>{catLabel[c]}</option>)}</select></Field>
          <Field label="Description" hint="What is this key used for?"><input style={inp} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="e.g. Used for AI book recommendations"/></Field>
          <Field label="Hint" hint="Optional — shown even when locked. Do NOT put the actual key here."><input style={inp} value={form.hint} onChange={e=>setForm(f=>({...f,hint:e.target.value}))} placeholder="e.g. Starts with sk-ant-api..."/></Field>
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:8 }}><Btn variant="ghost" onClick={()=>{setShowAdd(false);setEditId(null);}}>Cancel</Btn><Btn icon={P.lock} onClick={saveSecret}>Encrypt & Save</Btn></div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. CONTENT MANAGER
// ═══════════════════════════════════════════════════════════════════════════════
function ContentManager() {
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(null);
  const [saved, setSaved]   = useState(null);
  const secs = ["homepage","footer","pages","seo","system"];
  const secLabel = { homepage:"Homepage", footer:"Footer", pages:"Pages", seo:"SEO", system:"System" };

  useEffect(()=>{ db.get("app_content","&order=section.asc,label.asc").then(d=>Array.isArray(d)&&setItems(d)); },[]);

  const save = async (item) => {
    setSaving(item.id);
    await db.upsert("app_content",{key:item.key,label:item.label,value:item.value,type:item.type,section:item.section,description:item.description});
    setSaved(item.id); setSaving(null); setTimeout(()=>setSaved(null),1500);
  };
  const update = (id,val)=>setItems(i=>i.map(x=>x.id===id?{...x,value:val}:x));
  const grouped = secs.reduce((a,s)=>{const i=items.filter(x=>x.section===s);if(i.length)a[s]=i;return a;},{});

  return (
    <div>
      <p style={{ margin:"0 0 20px", fontSize:13, color:T.mid }}>Edit the words that appear on your site. Click Save after each edit.</p>
      {Object.entries(grouped).map(([sec,its])=>(
        <div key={sec} style={{ marginBottom:28 }}>
          <div style={{ marginBottom:12 }}><Badge label={secLabel[sec]} color={T.blue}/></div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {its.map(item=>(
              <div key={item.id} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:"16px 18px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:T.text }}>{item.label}</div>
                    {item.description&&<div style={{ fontSize:11, color:T.low, marginTop:2 }}>{item.description}</div>}
                  </div>
                  <button onClick={()=>save(item)} disabled={saving===item.id} style={{ background:saved===item.id?T.green+"22":T.border, border:"none", borderRadius:6, padding:"5px 12px", color:saved===item.id?T.green:T.mid, fontSize:11, fontWeight:600, cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", gap:5 }}>
                    {saved===item.id?<><Ic d={P.check} size={12} col={T.green}/>Saved</>:saving===item.id?"Saving…":"Save"}
                  </button>
                </div>
                {item.type==="textarea"
                  ? <textarea style={{...inp,minHeight:80,resize:"vertical"}} value={item.value||""} onChange={e=>update(item.id,e.target.value)}/>
                  : <input style={inp} value={item.value||""} onChange={e=>update(item.id,e.target.value)} placeholder={`Enter ${item.label.toLowerCase()}…`}/>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. APP SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════
function AppSettings() {
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(null);
  const [saved, setSaved]   = useState(null);
  const secs = ["branding","contact","social","affiliate","display"];
  const secLabel = { branding:"Branding", contact:"Contact & Support", social:"Social Media", affiliate:"Affiliate Program", display:"Display Options" };
  const secColor = { branding:T.amber, contact:T.blue, social:T.green, affiliate:T.purple, display:T.mid };

  useEffect(()=>{ db.get("app_settings","&order=section.asc,label.asc").then(d=>Array.isArray(d)&&setItems(d)); },[]);

  const save = async (item) => {
    setSaving(item.id);
    await db.upsert("app_settings",{key:item.key,label:item.label,value:item.value,type:item.type,section:item.section,description:item.description});
    setSaved(item.id); setSaving(null); setTimeout(()=>setSaved(null),1500);
  };
  const update = (id,val)=>setItems(i=>i.map(x=>x.id===id?{...x,value:val}:x));
  const grouped = secs.reduce((a,s)=>{const i=items.filter(x=>x.section===s);if(i.length)a[s]=i;return a;},{});

  return (
    <div>
      <p style={{ margin:"0 0 20px", fontSize:13, color:T.mid }}>Core app configuration. Changes take effect after saving.</p>
      {Object.entries(grouped).map(([sec,its])=>(
        <div key={sec} style={{ marginBottom:24 }}>
          <div style={{ marginBottom:12 }}><Badge label={secLabel[sec]} color={secColor[sec]}/></div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {its.map(item=>(
              <div key={item.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", background:"#100f18", border:`1px solid ${T.border}`, borderRadius:8 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:2 }}>{item.label}</div>
                  {item.description&&<div style={{ fontSize:11, color:T.low }}>{item.description}</div>}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                  <input style={{...inp,width:item.type==="number"?80:200,padding:"6px 10px",fontSize:12}} type={item.type==="number"?"number":"text"} value={item.value||""} onChange={e=>update(item.id,e.target.value)}/>
                  <button onClick={()=>save(item)} disabled={saving===item.id} style={{ background:saved===item.id?T.green+"22":T.border, border:"none", borderRadius:6, padding:"6px 12px", color:saved===item.id?T.green:T.mid, fontSize:11, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap" }}>
                    {saved===item.id?<><Ic d={P.check} size={12} col={T.green}/>Saved</>:saving===item.id?"…":"Save"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SHELL
// ═══════════════════════════════════════════════════════════════════════════════
const NAV = [
  { id:"home",    label:"Overview",      icon:P.home     },
  { id:"flags",   label:"Feature Flags", icon:P.flag     },
  { id:"tiers",   label:"Subscriptions", icon:P.layers   },
  { id:"coupons", label:"Coupon Codes",  icon:P.tag      },
  { id:"vault",   label:"Secrets Vault", icon:P.lock     },
  { id:"content", label:"Site Content",  icon:P.file     },
  { id:"settings",label:"App Settings",  icon:P.settings },
];

export default function AdminDashboard() {
  const isAdmin = useIsAdmin();
  const [tab, setTab]       = useState("home");
  const [open, setOpen]     = useState(true);
  const W = open ? 216 : 56;

  if (!isAdmin) return (
    <div style={{ minHeight:"100vh", background:T.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}><Ic d={P.lock} size={48} col={T.low}/><p style={{ color:T.low, marginTop:14, fontSize:14 }}>Admin access only.</p></div>
    </div>
  );

  const cur = NAV.find(n=>n.id===tab);

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:T.bg, fontFamily:"'DM Sans',system-ui,sans-serif", color:T.text }}>

      {/* SIDEBAR */}
      <div style={{ width:W, flexShrink:0, background:T.surface, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column", transition:"width 0.18s", overflow:"hidden" }}>
        <div style={{ padding:open?"18px 16px 14px":"18px 0 14px", display:"flex", alignItems:"center", justifyContent:open?"space-between":"center", borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
          {open&&<div><div style={{ fontSize:14, fontWeight:700, color:T.text, fontFamily:"'Fraunces',Georgia,serif" }}>LitSense</div><div style={{ fontSize:9, color:T.amberDim, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase" }}>Admin Panel</div></div>}
          <button onClick={()=>setOpen(o=>!o)} style={{ background:"none", border:"none", cursor:"pointer", color:T.low, padding:4 }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><line x1={3} y1={12} x2={21} y2={12}/><line x1={3} y1={6} x2={21} y2={6}/><line x1={3} y1={18} x2={21} y2={18}/></svg>
          </button>
        </div>
        <nav style={{ flex:1, padding:"8px 0" }}>
          {NAV.map(n=>{
            const active=tab===n.id;
            return (
              <button key={n.id} onClick={()=>setTab(n.id)} title={!open?n.label:""} style={{ display:"flex", alignItems:"center", gap:9, width:"100%", padding:open?"10px 16px":"10px 0", justifyContent:open?"flex-start":"center", background:active?T.amber+"15":"none", border:"none", borderLeft:`2px solid ${active?T.amber:"transparent"}`, cursor:"pointer", color:active?T.amber:T.mid, fontSize:13, fontWeight:active?600:400, transition:"all 0.12s", whiteSpace:"nowrap" }}>
                <Ic d={n.icon} size={16} col={active?T.amber:T.mid}/>{open&&n.label}
              </button>
            );
          })}
        </nav>
        {open&&<div style={{ padding:"10px 16px", borderTop:`1px solid ${T.border}`, flexShrink:0 }}><div style={{ fontSize:10, color:T.low, lineHeight:1.6 }}>Tahoma Systems LLC<br/>LitSense v1.0</div></div>}
      </div>

      {/* MAIN */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
        <div style={{ background:T.surface, borderBottom:`1px solid ${T.border}`, padding:"0 28px", height:54, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <div>
            <span style={{ fontSize:15, fontWeight:700, color:T.text, fontFamily:"'Fraunces',Georgia,serif" }}>{cur?.label}</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:7 }}><Dot color={T.green}/><span style={{ fontSize:11, color:T.low }}>Live</span></div>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"28px 32px" }}>
          {tab==="home"    &&<Overview   onNav={setTab}/>}
          {tab==="flags"   &&<FeatureFlags/>}
          {tab==="tiers"   &&<SubscriptionTiers/>}
          {tab==="coupons" &&<CouponCodes/>}
          {tab==="vault"   &&<SecretsVault/>}
          {tab==="content" &&<ContentManager/>}
          {tab==="settings"&&<AppSettings/>}
        </div>
      </div>
    </div>
  );
}
