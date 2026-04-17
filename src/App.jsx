/**
 * LitSense — Your Reading Companion
 * v21 · Readability & Color Refinement
 *
 * Changes from v20 (style values only — no layout, logic, or component changes):
 *
 *  CSS VARIABLES
 *  --text2: #b0a080 → #cbc3b8
 *    Was warm mid-gray at ~43% luminance. Now warm light-gray at ~60%.
 *    Improves readability of every element using this variable across the app:
 *    hero body, proof reason, book-why, empty states, modal sub-copy,
 *    welcome sub, chat bubbles, shelf labels, auth sub — all improve automatically.
 *
 *  --muted: #706040 → #8c8476
 *    Was too dark at small sizes (~17% luminance). Now ~28%.
 *    Improves author names, row subtitles, pro feature descriptions,
 *    nav labels, secondary labels throughout.
 *
 *  CSS CLASSES
 *  .ls-why-reason: color var(--text2) → rgba(240,232,216,.82), line-height 1.7 → 1.72
 *    TileModal explanatory text — higher explicit contrast, fractionally more open.
 *
 *  .ls-proof-reason: line-height 1.62 → 1.68
 *    Hero proof card body — more breathing room.
 *
 *  .ls-pro-feat-desc: line-height 1.55 → 1.62
 *    Pro modal feature descriptions.
 *
 *  WHEEL FOCUS PANEL (inline)
 *  Reason text: var(--text2) → rgba(240,232,216,.78)
 *    Explicit near-white for the most-read surface in the wheel experience.
 *
 *  FOR YOU ITEM (inline) — three-tier hierarchy:
 *  Title:  var(--text) = #f0e8d8 — unchanged, max brightness
 *  Hook:   rgba(240,232,216,.95) — near-title brightness, 600 weight
 *  Reason: rgba(240,232,216,.72) — clearly secondary, still readable
 *  Hook line-height: 1.4 → 1.48 — slightly more open
 *  Reason line-height: 1.68 → 1.70
 *
 * ⚠️  PRODUCTION: Replace fetch URL with "/api/ai" before deploying.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { supabase, signUp, signIn, signOut, loadShelfFromDB, upsertBookState, saveReaction, getOrCreateDiscussion, getDiscussionPosts, createDiscussionPost } from "./supabase.js";
import {
  BookOpen, BookMarked, MessageCircle, Search, Star,
  Sun, Brain, Heart, Lightbulb, Smile, Moon,
  Plus, X, Send, Crown, ChevronRight, ChevronLeft, RotateCcw,
  Library, Bookmark, Sparkles, Lock,
  ShoppingBag, ArrowLeftRight, Package, Tag, Users, MessageSquare, CheckCircle,
} from "lucide-react";

// ── QUESTION LIMITS ─────────────────────────────────────────────────────────
// Set to Infinity during free launch period.
// When ready to charge: LIMIT_ANON = 3, LIMIT_FREE = 5
const LIMIT_ANON = Infinity;
const LIMIT_FREE = Infinity;
const MEM_BOOKS  = 5;

// ── AMAZON AFFILIATE ──────────────────────────────────────────────────────────
// 🔑 Replace with your affiliate tag when ready: e.g. "litsense-20"
const AMAZON_TAG = "litsense-20";

function amazonLink(title, author, isbn) {
  if (isbn && isbn.length >= 10) {
    return `https://www.amazon.com/dp/${isbn}?tag=${AMAZON_TAG}&linkCode=ll1`;
  }
  const q = encodeURIComponent(`${title} ${author}`);
  return `https://www.amazon.com/s?k=${q}&tag=${AMAZON_TAG}`;
}

// ── SAFE AMAZON LINK ──────────────────────────────────────────────────────────
// Validates the ISBN-based URL before navigation. Falls back to search silently.
// Pre-validates on hover so the result is ready by the time the user clicks.

function SafeAmazonLink({ title, author, isbn, children, style, className }) {
  const [status, setStatus] = useState("idle"); // idle | checking | ok | fallback
  const checkRef = useRef(false);

  const searchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(`${title} ${author||""}`.trim())}&tag=${AMAZON_TAG}`;
  const directUrl = amazonLink(title, author, isbn);
  // If it's already a search URL (no ISBN), skip validation
  const needsCheck = isbn && isbn.length >= 10;

  const validate = async () => {
    if (!needsCheck || checkRef.current) return;
    checkRef.current = true;
    setStatus("checking");
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: directUrl }),
        signal: AbortSignal.timeout(5000),
      });
      const d = await res.json();
      setStatus(d.valid ? "ok" : "fallback");
    } catch {
      setStatus("fallback"); // network error → safe fallback
    }
  };

  const handleClick = async (e) => {
    e.preventDefault();
    if (status === "ok")       { window.open(directUrl,  "_blank", "noopener"); return; }
    if (status === "fallback") { window.open(searchUrl,  "_blank", "noopener"); return; }
    // Not yet resolved — run check now and navigate on result
    checkRef.current = true;
    setStatus("checking");
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: directUrl }),
        signal: AbortSignal.timeout(5000),
      });
      const d = await res.json();
      setStatus(d.valid ? "ok" : "fallback");
      window.open(d.valid ? directUrl : searchUrl, "_blank", "noopener");
    } catch {
      setStatus("fallback");
      window.open(searchUrl, "_blank", "noopener");
    }
  };

  return (
    <a
      href={status === "fallback" ? searchUrl : directUrl}
      onClick={handleClick}
      onMouseEnter={validate}
      onPointerEnter={validate}
      target="_blank" rel="noopener noreferrer"
      style={style} className={className}
    >
      {status === "checking" ? "Checking…" : children}
    </a>
  );
}

// ── REFERRAL SYSTEM ───────────────────────────────────────────────────────────
// In production: store referral data in Supabase, validate server-side
// For now: localStorage simulation + URL param detection

const REFERRAL_MILESTONES = [
  { refs:1,  label:"Sharer",    reward:"+3 questions/day",     bonus:3  },
  { refs:3,  label:"Connector", reward:"+9 questions/day",     bonus:9  },
  { refs:5,  label:"Advocate",  reward:"1 month Pro free",     bonus:15 },
  { refs:10, label:"Champion",  reward:"3 months Pro free",    bonus:15 },
];

function genRefCode(email) {
  // Simple deterministic code from email — production should use UUID in DB
  let h = 0;
  for (let i = 0; i < email.length; i++) {
    h = ((h << 5) - h) + email.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36).toUpperCase().slice(0,6).padEnd(6,"X");
}

function getReferralLink(email) {
  const code = genRefCode(email);
  return `https://litsense.app?ref=${code}`;
}

function getReferralMilestone(count) {
  for (let i = REFERRAL_MILESTONES.length - 1; i >= 0; i--) {
    if (count >= REFERRAL_MILESTONES[i].refs) return REFERRAL_MILESTONES[i];
  }
  return null;
}

function getNextMilestone(count) {
  return REFERRAL_MILESTONES.find(m => m.refs > count) || null;
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,600;0,700;1,600;1,700&family=Inter:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}

.ls {
  font-family:'Inter',sans-serif;
  height:100dvh;display:flex;flex-direction:column;overflow:hidden;
  background:transparent;color:#E8E2D9;
  position:relative;z-index:1;
  overscroll-behavior:none;

  --gold:    #C6A15B;
  --gold-r:  #D4B06A;
  --gold-l:  rgba(198,161,91,.13);
  --gold-d:  #8A6E3A;
  --sage:    #4a8060;
  --rust:    #9B3828;

  /* Glass system — over warm-dark bg */
  --glass:        rgba(255,248,236,.028);
  --glass-mid:    rgba(255,248,236,.052);
  --glass-lift:   rgba(255,248,236,.09);
  --glass-border: rgba(255,248,236,.07);
  --glass-strong: rgba(18,16,14,.58);

  --bg:      #12100E;
  --bg2:     rgba(30,26,23,.55);
  --bg3:     rgba(30,26,23,.92);
  --card:    var(--glass);
  --card2:   var(--glass-mid);

  --text:    #E8E2D9;
  --text2:   #CFC8BE;
  --muted:   #8A8178;
  --faint:   rgba(255,248,236,.07);

  --r-sm:  10px;
  --r-md:  16px;
  --r-lg:  22px;
  --r-xl:  30px;
  --r-pill:99px;
  --glow:  rgba(198,161,91,.20);
  --spring: cubic-bezier(0.34,1.56,0.64,1);
  --ease:   cubic-bezier(0.25,0.46,0.45,0.94);
}
.ls ::-webkit-scrollbar{display:none;}

/* ── HEADER — espresso glass ── */
.ls-hdr{
  height:58px;min-height:58px;padding:0 20px;
  display:flex;align-items:center;justify-content:space-between;
  background:rgba(18,16,14,.72);
  backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);
  border-bottom:1px solid rgba(255,248,236,.06);
  flex-shrink:0;z-index:10;
}
.ls-logo{display:flex;flex-direction:column;gap:2px;}
.ls-logo-img{height:26px;width:auto;display:block;filter:brightness(1.3);}
.ls-logo-name{font-family:'Lora',serif;font-size:22px;font-weight:700;letter-spacing:-.5px;line-height:1;color:var(--text);}
.ls-logo-name em{color:var(--gold);font-style:italic;}
.ls-logo-sub{font-size:8px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:var(--muted);opacity:.8;}
.ls-hdr-right{display:flex;align-items:center;gap:8px;}
.ls-hdr-left{display:flex;align-items:center;gap:6px;}
.ls-back-btn{
  display:flex;align-items:center;justify-content:center;
  width:34px;height:34px;border-radius:50%;border:none;
  background:transparent;color:var(--text2);cursor:pointer;
  transition:color .18s,background .18s;flex-shrink:0;
  -webkit-tap-highlight-color:transparent;
}
.ls-back-btn:hover{background:rgba(255,255,255,.07);color:var(--text);}
.ls-back-btn:active{background:rgba(255,255,255,.12);transform:scale(.9);}
.ls-signin-btn{
  padding:7px 15px;border-radius:var(--r-pill);
  border:1px solid rgba(255,248,236,.12);
  background:rgba(255,248,236,.06);color:var(--text2);
  font-size:12px;font-weight:600;cursor:pointer;
  transition:all .30s var(--ease);
  backdrop-filter:blur(8px);
}
.ls-signin-btn:hover{border-color:var(--gold);color:var(--gold);background:var(--gold-l);}
.ls-pro-btn{
  display:flex;align-items:center;gap:5px;
  padding:7px 15px;border-radius:var(--r-pill);
  background:var(--gold);color:#0e0c09;border:none;
  font-size:12px;font-weight:700;cursor:pointer;
  transition:all .30s var(--ease);
  box-shadow:0 2px 18px var(--glow);
}
.ls-pro-btn:hover{background:var(--gold-r);transform:translateY(-1px);box-shadow:0 5px 26px rgba(198,161,91,.38);}
.ls-user-avatar{
  width:32px;height:32px;border-radius:50%;
  background:rgba(198,161,91,.10);border:1.5px solid rgba(198,161,91,.32);
  display:flex;align-items:center;justify-content:center;
  font-size:12px;font-weight:700;color:var(--gold);cursor:pointer;
  transition:all .28s;
}
.ls-user-avatar:hover{background:rgba(198,161,91,.18);}
.ls-pro-pip{font-size:9px;font-weight:700;color:#0e0c09;background:var(--gold);padding:2px 9px;border-radius:var(--r-pill);letter-spacing:.3px;}

/* ── BOTTOM NAV — espresso glass ── */
.ls-nav{
  display:flex;
  background:rgba(18,16,14,.80);
  backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);
  border-top:1px solid rgba(255,248,236,.06);
  flex-shrink:0;padding-bottom:env(safe-area-inset-bottom,0);
}
.ls-nav-btn{flex:1;padding:11px 4px 9px;border:none;background:transparent;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;color:var(--muted);transition:color .28s var(--ease),transform .28s var(--spring);}
.ls-nav-btn.on{color:var(--gold);}
.ls-nav-btn:active{transform:scale(.88);}
.ls-nav-label{font-family:'Inter',sans-serif;font-size:9.5px;font-weight:500;letter-spacing:.3px;color:inherit;}

/* ── GRAIN TEXTURE — paper/leather tactile layer ── */
.ls-grain{
  position:fixed;inset:0;z-index:9998;pointer-events:none;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
  background-size:180px 180px;
  opacity:0.038;
  mix-blend-mode:overlay;
}

/* ── LAYOUT ── */
.ls-main{flex:1;overflow:hidden;display:flex;flex-direction:column;}
.ls-scroll{flex:1;overflow-y:auto;overscroll-behavior:none;-webkit-overflow-scrolling:auto;}

/* ── CINEMATIC HERO ── */
.ls-hero{
  padding:24px 20px 20px;
  position:relative;
}
.ls-hero-eyebrow{
  font-size:9px;font-weight:700;letter-spacing:3.5px;
  text-transform:uppercase;color:var(--gold);margin-bottom:14px;
  display:flex;align-items:center;gap:9px;opacity:.95;
}
.ls-hero-eyebrow::before{content:'';width:24px;height:1.5px;background:var(--gold);border-radius:1px;}
.ls-hero-title{
  font-family:'Lora',serif;
  font-size:32px;font-weight:700;line-height:1.18;
  color:var(--text);margin-bottom:14px;letter-spacing:-.5px;
}
.ls-hero-title em{color:var(--gold);font-style:italic;}
.ls-hero-body{font-size:15px;line-height:1.72;color:var(--text2);margin-bottom:24px;max-width:310px;}
.ls-hero-cta{
  display:inline-flex;align-items:center;gap:9px;
  padding:14px 26px;border:none;border-radius:var(--r-pill);
  background:var(--gold);color:#060402;
  font-family:'Inter',sans-serif;font-size:14px;font-weight:700;
  cursor:pointer;transition:all .25s var(--ease);margin-bottom:14px;
  box-shadow:0 4px 28px rgba(212,148,26,.45);
}
.ls-hero-cta:hover{background:var(--gold-r);transform:translateY(-2px) scale(1.02);box-shadow:0 8px 36px rgba(212,148,26,.55);}
.ls-hero-links{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;}
.ls-hero-link{
  padding:8px 16px;border-radius:var(--r-pill);
  border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.06);
  backdrop-filter:blur(10px);
  color:var(--text2);font-size:12.5px;font-weight:500;
  cursor:pointer;transition:all .22s var(--ease);
}
.ls-hero-link:hover{border-color:rgba(212,148,26,.5);color:var(--gold);background:var(--gold-l);transform:translateY(-1px);}

/* ── PROOF CARD — glass ── */
.ls-proof{margin-top:28px;padding-top:24px;border-top:1px solid rgba(255,255,255,.07);}
.ls-proof-label{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin-bottom:14px;opacity:.85;}
.ls-proof-card{
  display:flex;gap:16px;
  background:rgba(255,255,255,.055);
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  border-radius:var(--r-lg);padding:18px;
  border:1px solid rgba(255,255,255,.10);
  box-shadow:0 8px 32px rgba(0,0,0,.25);
}
.ls-proof-cover{width:72px;min-width:72px;height:104px;border-radius:9px;overflow:hidden;flex-shrink:0;box-shadow:0 6px 20px rgba(0,0,0,.55);}
.ls-proof-cover img{width:100%;height:100%;object-fit:cover;display:block;}
.ls-proof-cover .ls-book-cover{width:100%;min-width:unset;height:100%;border-radius:0;box-shadow:none;}
.ls-proof-body{flex:1;min-width:0;}
.ls-proof-title{font-family:'Lora',serif;font-size:14px;font-weight:700;color:var(--text);margin-bottom:2px;line-height:1.3;}
.ls-proof-author{font-size:11px;color:var(--muted);margin-bottom:11px;}
.ls-proof-reason{font-size:12px;line-height:1.75;color:var(--text2);font-style:italic;padding:10px 13px;background:rgba(212,148,26,.08);border-left:2px solid var(--gold);border-radius:0 8px 8px 0;}
.ls-proof-reason strong{color:var(--gold);font-style:normal;font-weight:600;}

/* ── SECTION HEADERS ── */
.ls-sec-hdr{display:flex;align-items:center;justify-content:space-between;padding:0 20px;margin-bottom:14px;}
.ls-sec-hdr.spaced{margin-top:32px;}
.ls-sec-title{font-family:'Lora',serif;font-size:16px;font-weight:700;color:var(--text);letter-spacing:-.2px;}
.ls-sec-sub{font-size:10px;font-weight:500;color:var(--muted);letter-spacing:.2px;}

/* ── MOOD CHIPS — glass ── */
.ls-mood-row{display:flex;gap:9px;overflow-x:auto;padding:0 20px 8px;margin-bottom:24px;}
.ls-mood-chip{
  flex-shrink:0;display:flex;align-items:center;gap:6px;
  padding:9px 16px;border-radius:var(--r-pill);
  background:rgba(255,255,255,.06);
  backdrop-filter:blur(12px);
  border:1px solid rgba(255,255,255,.09);
  color:var(--text2);cursor:pointer;
  transition:all .22s var(--ease);
  font-size:13px;font-weight:500;white-space:nowrap;
}
.ls-mood-chip:hover{border-color:rgba(212,148,26,.4);color:var(--gold);background:var(--gold-l);transform:translateY(-1px);}
.ls-mood-chip.on{background:var(--gold);color:#060402;border-color:var(--gold);font-weight:700;box-shadow:0 4px 18px var(--glow);}
.ls-mood-chip.on svg{color:#060402;}
.ls-mood-banner{
  margin:-16px 20px 22px;padding:10px 14px;border-radius:var(--r-md);
  background:rgba(212,148,26,.1);border:1px solid rgba(212,148,26,.22);
  display:flex;align-items:center;justify-content:space-between;
  backdrop-filter:blur(8px);
}
.ls-mood-banner-text{font-size:12px;color:var(--gold);font-weight:500;}
.ls-mood-banner-clear{background:transparent;border:none;color:var(--gold);font-size:11px;font-weight:600;cursor:pointer;}

/* ── GENRE PILLS — glass ── */
.ls-genre-row{display:flex;gap:8px;overflow-x:auto;padding:0 20px 4px;margin-bottom:22px;}
.ls-genre-pill{
  padding:7px 16px;border-radius:var(--r-pill);
  border:1px solid rgba(255,255,255,.09);
  background:rgba(255,255,255,.05);
  backdrop-filter:blur(8px);
  color:var(--text2);font-size:12.5px;font-weight:500;
  cursor:pointer;transition:all .2s var(--ease);white-space:nowrap;flex-shrink:0;
}
.ls-genre-pill:hover{border-color:rgba(212,148,26,.4);color:var(--gold);transform:translateY(-1px);}
.ls-genre-pill.on{background:var(--gold);border-color:var(--gold);color:#060402;font-weight:700;box-shadow:0 4px 16px var(--glow);}

/* ── FILTER CTA ── */
.ls-filter-cta{
  display:flex;align-items:center;justify-content:center;gap:8px;
  margin:0 20px 24px;padding:14px;border-radius:var(--r-lg);
  border:1px solid rgba(212,148,26,.28);
  background:rgba(212,148,26,.1);
  backdrop-filter:blur(10px);
  color:var(--gold);font-size:14px;font-weight:600;cursor:pointer;transition:all .22s;
}
.ls-filter-cta:hover{background:rgba(212,148,26,.18);transform:translateY(-1px);box-shadow:0 4px 20px var(--glow);}

/* ── BOOK CARDS — glass ── */
.ls-books{display:flex;flex-direction:column;gap:14px;padding:0 20px 8px;}
.ls-book-card{
  display:flex;gap:14px;padding:14px 16px;
  background:rgba(30,26,23,.50);
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  border-radius:var(--r-lg);
  border:1px solid rgba(255,248,236,.07);
  cursor:pointer;transition:all .32s var(--ease);
  box-shadow:0 4px 28px rgba(6,4,2,.25);
}
.ls-book-card:hover{
  background:rgba(30,26,23,.75);
  border-color:rgba(198,161,91,.22);
  transform:translateY(-2px);
  box-shadow:0 10px 40px rgba(6,4,2,.38),0 0 0 1px rgba(198,161,91,.10);
}

/* ── BOOK COVER ── */
.ls-book-cover{width:72px;min-width:72px;height:104px;border-radius:9px;overflow:hidden;flex-shrink:0;box-shadow:0 4px 20px rgba(0,0,0,.5);position:relative;background:#1a1408;}
.ls-book-cover.fill{width:100%!important;min-width:unset!important;height:100%!important;border-radius:0!important;box-shadow:none!important;position:absolute;inset:0;}
.ls-book-cover img{width:100%;height:100%;object-fit:cover;display:block;}
.ls-book-info{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between;}
.ls-book-title{font-family:'Lora',serif;font-size:15px;font-weight:700;line-height:1.28;color:var(--text);letter-spacing:-.1px;}
.ls-book-author{font-size:11.5px;color:var(--muted);margin-bottom:8px;}
.ls-book-why{font-size:12px;line-height:1.65;color:var(--text2);}
.ls-book-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;}
.ls-tag{font-size:10px;font-weight:600;padding:3px 8px;border-radius:var(--r-pill);background:rgba(255,255,255,.07);color:var(--muted);border:1px solid rgba(255,255,255,.07);}
.ls-book-actions{display:flex;gap:7px;margin-top:10px;}
.ls-save-btn{flex:1;padding:9px;border-radius:var(--r-pill);border:none;background:var(--gold);color:#060402;font-size:12px;font-weight:700;cursor:pointer;transition:all .22s var(--ease);box-shadow:0 2px 12px var(--glow);}
.ls-save-btn:hover{background:var(--gold-r);transform:translateY(-1px);}
.ls-dismiss-btn{padding:9px 13px;border-radius:var(--r-pill);border:1px solid rgba(255,255,255,.1);background:transparent;color:var(--muted);font-size:12px;font-weight:500;cursor:pointer;transition:all .18s;}
.ls-dismiss-btn:hover{border-color:rgba(255,255,255,.2);color:var(--text2);}

/* ── ROW TILES — Netflix horizontal scroll ── */
.ls-row-wrap{overflow-x:auto;padding:0 20px 8px;}
.ls-row{display:flex;gap:12px;}
.ls-tile-wrap{flex-shrink:0;cursor:pointer;transition:transform .25s var(--spring);}
.ls-tile-wrap:hover{transform:scale(1.05) translateY(-4px);}
.ls-tile{width:150px;height:220px;border-radius:var(--r-md);overflow:hidden;position:relative;box-shadow:0 6px 24px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.07);transition:box-shadow .25s;}
.ls-tile-wrap:hover .ls-tile{box-shadow:0 14px 40px rgba(0,0,0,.65),0 0 0 1px rgba(212,148,26,.25);}
.ls-tile-overlay{position:absolute;inset:0;background:linear-gradient(180deg,transparent 35%,rgba(4,2,1,.95) 100%);opacity:0;transition:opacity .22s;display:flex;flex-direction:column;justify-content:flex-end;padding:12px 10px;}
.ls-tile-wrap:hover .ls-tile-overlay{opacity:1;}
.ls-tile-book-title{font-family:'Inter',sans-serif;font-size:11px;font-weight:700;color:#fff;line-height:1.25;margin-bottom:2px;}
.ls-tile-book-author{font-size:10px;color:rgba(255,255,255,.6);}

/* ── SHELF ── */
.ls-shelf-scroll{flex:1;overflow-y:auto;padding-bottom:16px;}
.ls-shelf-hdr{padding:28px 20px 20px;}
.ls-shelf-hdr-title{font-family:'Lora',serif;font-size:24px;font-weight:700;color:var(--text);margin-bottom:4px;}

/* ── PROFILE ── */
.ls-profile-scroll{flex:1;overflow-y:auto;padding-bottom:80px;}
.ls-profile-hero{padding:28px 20px 0;display:flex;flex-direction:column;align-items:center;text-align:center;}
.ls-profile-avatar{width:80px;height:80px;border-radius:50%;background:rgba(212,148,26,.2);border:2px solid rgba(212,148,26,.4);display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;color:var(--gold);overflow:hidden;flex-shrink:0;cursor:pointer;position:relative;}
.ls-profile-name{font-family:'Lora',serif;font-size:22px;font-weight:700;color:var(--text);margin-bottom:4px;}
.ls-profile-email{font-size:12px;color:var(--muted);margin-bottom:12px;}
.ls-profile-archetype{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:var(--r-pill);background:rgba(212,148,26,.12);border:1px solid rgba(212,148,26,.3);color:var(--gold);font-size:11px;font-weight:700;letter-spacing:.5px;margin-bottom:16px;}
.ls-profile-bio{width:100%;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,.1);color:var(--text2);font-size:14px;line-height:1.6;padding:6px 0;outline:none;font-family:'Inter',sans-serif;text-align:center;resize:none;box-sizing:border-box;}
.ls-profile-bio::placeholder{color:var(--muted);}
.ls-profile-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:rgba(255,255,255,.06);border-radius:var(--r-lg);overflow:hidden;margin:20px 16px 0;}
.ls-profile-stat{background:rgba(255,255,255,.03);padding:16px 8px;text-align:center;}
.ls-profile-stat-n{font-family:'Lora',serif;font-size:24px;font-weight:700;color:var(--text);line-height:1;}
.ls-profile-stat-l{font-size:10px;color:var(--muted);margin-top:4px;letter-spacing:.3px;}
.ls-profile-section{padding:24px 20px 0;}
.ls-profile-section-title{font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:14px;}
.ls-profile-book-row{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;}
.ls-profile-book-row::-webkit-scrollbar{display:none;}
.ls-profile-book-thumb{flex-shrink:0;width:64px;cursor:pointer;}
.ls-profile-book-cover{width:64px;height:92px;border-radius:8px;overflow:hidden;margin-bottom:5px;box-shadow:0 4px 12px rgba(0,0,0,.4);}
.ls-profile-book-label{font-size:9px;color:var(--text2);line-height:1.3;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ls-profile-reaction{display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(255,255,255,.04);border-radius:var(--r-md);border:1px solid rgba(255,255,255,.06);margin-bottom:8px;}
.ls-profile-reaction-info{flex:1;min-width:0;}
.ls-profile-reaction-title{font-size:13px;font-weight:600;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ls-profile-reaction-label{font-size:10px;color:var(--muted);margin-top:2px;}
.ls-profile-genre{display:inline-flex;padding:6px 14px;border-radius:var(--r-pill);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);font-size:12px;color:var(--text2);margin:0 6px 8px 0;}
.ls-profile-empty{text-align:center;padding:32px 24px;color:var(--muted);font-size:13px;line-height:1.7;}

/* ── MARKETPLACE ── */
.ls-market{flex:1;overflow-y:auto;padding-bottom:80px;}
.ls-market-hdr{padding:24px 20px 16px;}
.ls-market-title{font-family:'Lora',serif;font-size:24px;font-weight:700;color:var(--text);margin-bottom:4px;}
.ls-market-sub{font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:16px;}
.ls-market-tabs{display:flex;gap:8px;padding:0 20px 16px;}
.ls-market-tab{flex:1;padding:8px;border-radius:var(--r-md);border:1px solid rgba(255,255,255,.10);background:transparent;color:var(--muted);font-size:12px;font-weight:600;cursor:pointer;transition:all .18s;}
.ls-market-tab.on{background:rgba(212,148,26,.15);border-color:rgba(212,148,26,.4);color:var(--gold);}
.ls-listing-card{margin:0 16px 12px;padding:16px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:var(--r-lg);display:flex;gap:14px;cursor:pointer;transition:all .2s;}
.ls-listing-card:hover{background:rgba(255,255,255,.07);border-color:rgba(212,148,26,.2);}
.ls-listing-cover{width:56px;min-width:56px;height:80px;border-radius:8px;overflow:hidden;flex-shrink:0;}
.ls-listing-body{flex:1;min-width:0;}
.ls-listing-title{font-family:'Lora',serif;font-size:14px;font-weight:700;color:var(--text);line-height:1.3;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ls-listing-author{font-size:11px;color:var(--muted);margin-bottom:8px;}
.ls-listing-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.ls-listing-price{font-size:15px;font-weight:700;color:var(--gold);}
.ls-listing-condition{font-size:10px;font-weight:600;padding:2px 8px;border-radius:var(--r-pill);background:rgba(255,255,255,.07);color:var(--text2);text-transform:capitalize;}
.ls-listing-seller{font-size:10px;color:var(--muted);}
.ls-list-btn{width:calc(100% - 32px);margin:0 16px 20px;padding:13px;border-radius:var(--r-lg);border:1px solid rgba(212,148,26,.4);background:rgba(212,148,26,.10);color:var(--gold);font-size:14px;font-weight:700;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px;}
.ls-list-btn:hover{background:rgba(212,148,26,.2);}
.ls-market-empty{text-align:center;padding:60px 32px;color:var(--muted);}
.ls-market-empty-icon{font-size:40px;margin-bottom:16px;opacity:.4;}
.ls-market-empty-title{font-family:'Lora',serif;font-size:18px;font-weight:700;color:var(--text2);margin-bottom:8px;}
.ls-market-empty-body{font-size:13px;line-height:1.7;color:var(--muted);}
.ls-market-new-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:var(--r-pill);background:rgba(212,148,26,.12);border:1px solid rgba(212,148,26,.3);color:var(--gold);font-size:10px;font-weight:700;letter-spacing:.5px;margin-bottom:12px;}

/* ── LIST A BOOK MODAL ── */
.ls-list-modal{position:fixed;inset:0;z-index:300;display:flex;align-items:flex-end;justify-content:center;}
.ls-list-modal-bg{position:absolute;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(12px);}
.ls-list-modal-sheet{position:relative;width:100%;max-width:480px;background:rgba(20,16,10,.96);border-radius:28px 28px 0 0;padding:0 22px 52px;max-height:90dvh;overflow-y:auto;animation:slideUp .32s cubic-bezier(.32,.72,0,1);border:1px solid rgba(255,255,255,.1);border-bottom:none;}
.ls-list-modal-handle{width:40px;height:4px;background:rgba(255,255,255,.14);border-radius:2px;margin:16px auto 22px;}
.ls-list-modal-title{font-family:'Lora',serif;font-size:20px;font-weight:700;color:var(--text);margin-bottom:20px;}
.ls-list-field{margin-bottom:16px;}
.ls-list-label{font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);margin-bottom:6px;}
.ls-list-input{width:100%;padding:12px 14px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:var(--r-md);color:var(--text);font-size:14px;font-family:'Inter',sans-serif;box-sizing:border-box;outline:none;}
.ls-list-input:focus{border-color:var(--gold);}
.ls-list-input::placeholder{color:var(--muted);}
.ls-condition-btns{display:flex;gap:6px;flex-wrap:wrap;}
.ls-condition-btn{padding:6px 12px;border-radius:var(--r-pill);border:1px solid rgba(255,255,255,.12);background:transparent;color:var(--text2);font-size:11px;font-weight:600;cursor:pointer;transition:all .15s;}
.ls-condition-btn.on{background:rgba(212,148,26,.15);border-color:rgba(212,148,26,.4);color:var(--gold);}
.ls-list-submit{width:100%;padding:14px;border-radius:var(--r-lg);border:none;background:var(--gold);color:#060402;font-size:14px;font-weight:700;cursor:pointer;margin-top:8px;transition:all .2s;}
.ls-list-submit:hover{background:var(--gold-r);}
.ls-list-submit:disabled{opacity:.4;cursor:not-allowed;}

/* ── DISCUSSION ── */
.ls-disc{flex:1;overflow-y:auto;padding-bottom:80px;}
.ls-disc-hdr{padding:20px 20px 12px;border-bottom:1px solid rgba(255,255,255,.06);}
.ls-disc-book{font-family:'Lora',serif;font-size:16px;font-weight:700;color:var(--text);}
.ls-disc-count{font-size:11px;color:var(--muted);margin-top:2px;}
.ls-disc-post{padding:14px 20px;border-bottom:1px solid rgba(255,255,255,.05);}
.ls-disc-post-header{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
.ls-disc-avatar{width:28px;height:28px;border-radius:50%;background:rgba(212,148,26,.2);border:1px solid rgba(212,148,26,.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--gold);flex-shrink:0;}
.ls-disc-username{font-size:12px;font-weight:600;color:var(--text2);}
.ls-disc-time{font-size:10px;color:var(--muted);}
.ls-disc-content{font-size:14px;color:var(--text);line-height:1.65;}
.ls-disc-actions{display:flex;gap:16px;margin-top:10px;}
.ls-disc-action{background:none;border:none;color:var(--muted);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;padding:0;transition:color .15s;}
.ls-disc-action:hover{color:var(--gold);}
.ls-disc-input-row{position:sticky;bottom:0;padding:12px 16px;background:rgba(14,11,8,.92);backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,.07);display:flex;gap:10px;align-items:flex-end;}
.ls-disc-textarea{flex:1;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.10);border-radius:var(--r-lg);color:var(--text);font-size:14px;padding:10px 14px;resize:none;outline:none;font-family:'Inter',sans-serif;line-height:1.5;max-height:120px;}
.ls-disc-textarea:focus{border-color:var(--gold);}
.ls-disc-send{width:38px;height:38px;border-radius:50%;background:var(--gold);border:none;color:#060402;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.ls-disc-empty{text-align:center;padding:48px 24px;color:var(--muted);font-size:14px;line-height:1.7;}

.ls-shelf-hdr-sub{font-size:13px;color:var(--text2);}
.ls-shelf-gate{display:flex;flex-direction:column;align-items:center;text-align:center;padding:52px 32px;}
.ls-shelf-gate-icon{color:var(--muted);margin-bottom:18px;opacity:.4;}
.ls-shelf-gate-title{font-family:'Lora',serif;font-size:21px;font-weight:700;color:var(--text);margin-bottom:10px;}
.ls-shelf-gate-body{font-size:14px;color:var(--text2);max-width:240px;line-height:1.72;}
.ls-status-tabs{display:flex;gap:6px;padding:0 20px;margin-bottom:20px;}
.ls-status-tab{flex:1;padding:9px 4px;border-radius:var(--r-md);border:none;background:rgba(255,255,255,.05);color:var(--muted);font-family:'Inter',sans-serif;font-size:12px;font-weight:600;cursor:pointer;text-align:center;transition:all .2s;}
.ls-status-tab.on{background:rgba(212,148,26,.15);color:var(--gold);border:1px solid rgba(212,148,26,.25);}
.ls-input-row{display:flex;gap:8px;padding:0 20px;margin-bottom:16px;}
.ls-input-label{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:10px;}
.ls-input{flex:1;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(8px);border-radius:var(--r-md);color:var(--text);font-family:'Inter',sans-serif;font-size:14px;padding:11px 14px;outline:none;transition:border-color .2s;}
.ls-input:focus{border-color:var(--gold);}
.ls-input::placeholder{color:var(--muted);}
.ls-input-btn{padding:11px 16px;border-radius:var(--r-md);border:none;background:var(--gold);color:#060402;font-size:13px;font-weight:700;cursor:pointer;transition:all .2s;white-space:nowrap;}
.ls-input-btn:hover{background:var(--gold-r);}
.ls-book-row-item{display:flex;align-items:center;gap:11px;padding:10px 20px;border-radius:var(--r-md);transition:background .18s;}
.ls-book-row-item:hover{background:rgba(255,255,255,.04);}
.ls-book-row-thumb{width:36px;height:50px;border-radius:5px;overflow:hidden;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.4);}
.ls-book-row-title{font-family:'Lora',serif;font-size:13px;font-weight:600;color:var(--text);line-height:1.3;}
.ls-book-row-author{font-size:11px;color:var(--muted);}
.ls-star-row{display:flex;gap:3px;margin-top:4px;}
.ls-star{font-size:14px;color:rgba(255,255,255,.15);cursor:pointer;transition:color .12s;}
.ls-star.on{color:var(--gold);}
.ls-remove-btn{background:transparent;border:none;color:rgba(255,255,255,.18);cursor:pointer;padding:4px 6px;transition:color .15s;display:flex;align-items:center;}
.ls-remove-btn:hover{color:var(--rust);}
.ls-want-item{display:flex;align-items:center;justify-content:space-between;padding:9px 20px;}
.ls-want-text{font-size:13.5px;color:var(--text2);line-height:1.5;flex:1;}
.ls-action-btn{width:100%;padding:15px;border-radius:var(--r-lg);border:none;background:var(--gold);color:#060402;font-family:'Inter',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:all .25s var(--ease);display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 24px rgba(212,148,26,.38);}
.ls-action-btn:hover{background:var(--gold-r);transform:translateY(-2px);box-shadow:0 8px 32px rgba(212,148,26,.48);}
.ls-ask-ai-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:var(--r-sm);border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);backdrop-filter:blur(8px);color:var(--text2);font-size:11.5px;font-weight:600;cursor:pointer;transition:all .18s;}
.ls-ask-ai-btn:hover{border-color:var(--gold);color:var(--gold);}

/* ── CALLOUT — glass ── */
.ls-callout{display:flex;align-items:flex-start;gap:9px;font-size:12.5px;line-height:1.65;padding:12px 16px;margin:0 20px;border-radius:var(--r-md);background:rgba(255,255,255,.04);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.08);color:var(--text2);}
.ls-callout.info{border-color:rgba(212,148,26,.2);background:rgba(212,148,26,.06);}
.ls-callout-icon{color:var(--gold);flex-shrink:0;margin-top:1px;}

/* ── EMPTY ── */
.ls-empty{display:flex;flex-direction:column;align-items:center;text-align:center;padding:52px 32px;}
.ls-empty-icon{color:var(--muted);margin-bottom:16px;opacity:.4;}
.ls-empty-title{font-family:'Lora',serif;font-size:17px;font-weight:600;color:var(--text);margin-bottom:8px;}
.ls-empty-body{font-size:13.5px;color:var(--text2);max-width:220px;line-height:1.7;}

/* ── LIMIT GATE ── */
.ls-limit{display:flex;flex-direction:column;align-items:center;text-align:center;padding:44px 24px;}
.ls-limit-icon{color:var(--muted);margin-bottom:14px;opacity:.5;}
.ls-limit-title{font-family:'Lora',serif;font-size:22px;font-weight:700;color:var(--text);line-height:1.25;margin-bottom:8px;}
.ls-limit-body{font-size:14px;color:var(--text2);max-width:240px;line-height:1.72;margin-bottom:6px;}
.ls-limit-note{font-size:11.5px;color:var(--muted);margin-top:4px;}
.ls-limit-cta{margin-top:8px;padding:14px 32px;border-radius:var(--r-pill);border:none;background:var(--gold);color:#060402;font-family:'Inter',sans-serif;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 24px rgba(212,148,26,.4);transition:all .25s var(--ease);}
.ls-limit-cta:hover{background:var(--gold-r);transform:translateY(-2px);}
.ls-limit-cta.outline{background:transparent;color:var(--gold);border:1.5px solid var(--gold);box-shadow:none;margin-top:4px;}

/* ── WELCOME ── */
.ls-welcome{display:flex;flex-direction:column;align-items:center;text-align:center;padding:44px 24px 32px;}
.ls-welcome-title{font-family:'Lora',serif;font-size:28px;font-weight:700;color:var(--text);line-height:1.2;margin-bottom:10px;}
.ls-welcome-title em{color:var(--gold);font-style:italic;}
.ls-welcome-sub{font-size:14px;color:var(--text2);max-width:250px;line-height:1.72;margin-bottom:8px;}

/* ── ASK / CHAT ── */
.ls-ask{flex:1;overflow:hidden;display:flex;flex-direction:column;}
.ls-chat{flex:1;overflow-y:auto;padding:16px 16px 8px;display:flex;flex-direction:column;gap:14px;}
.ls-msg{display:flex;gap:10px;align-items:flex-start;animation:fadeIn .22s ease;}
.ls-av{width:30px;height:30px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
.ls-av.ai{background:rgba(212,148,26,.12);border:1px solid rgba(212,148,26,.22);color:var(--gold);font-size:14px;}
.ls-av.user{background:rgba(255,255,255,.08);color:var(--text2);font-size:11px;font-weight:700;}
.ls-bubble{padding:12px 16px;border-radius:16px;font-size:14px;line-height:1.75;max-width:calc(100% - 44px);}
.ls-bubble.ai{background:rgba(255,255,255,.06);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.09);color:var(--text2);border-radius:4px 16px 16px 16px;}
.ls-bubble.ai strong{color:var(--text);font-weight:600;}
.ls-bubble.ai h4{font-family:'Inter',sans-serif;font-size:12.5px;font-weight:600;color:var(--text2);margin:12px 0 5px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,.07);}
.ls-bubble.ai ul{margin:6px 0;padding-left:0;list-style:none;}
.ls-bubble.ai li{margin-bottom:5px;padding-left:14px;color:var(--text2);}
.ls-bubble.user{background:rgba(212,148,26,.12);border:1px solid rgba(212,148,26,.18);color:var(--text);border-radius:16px 4px 16px 16px;}
.ls-typing{display:flex;gap:5px;align-items:center;padding:12px 16px;}
.ls-dot{width:6px;height:6px;border-radius:50%;background:var(--gold);animation:ldot 1.2s ease-in-out infinite;}
.ls-dot:nth-child(2){animation-delay:.2s;}.ls-dot:nth-child(3){animation-delay:.4s;}
@keyframes ldot{0%,60%,100%{transform:translateY(0);opacity:.3}30%{transform:translateY(-6px);opacity:1}}
.ls-retry-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:6px;border:1px solid rgba(184,64,40,.3);background:transparent;color:var(--rust);font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;align-self:flex-start;}
.ls-prompt-btn{width:100%;padding:13px 16px;border-radius:var(--r-md);border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.06);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:var(--text2);font-size:13.5px;font-weight:500;font-family:'Inter',sans-serif;text-align:left;cursor:pointer;transition:all .22s var(--ease);line-height:1.4;}
.ls-prompt-btn:hover{background:rgba(212,148,26,.10);border-color:rgba(212,148,26,.35);color:var(--gold);transform:translateX(3px);}
.ls-prompt-btn:active{transform:scale(.98);}

/* ── CHAT INPUT — glass ── */
.ls-input-row-chat{display:flex;gap:9px;padding:10px 16px;border-top:1px solid rgba(255,255,255,.07);background:rgba(18,14,10,.75);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);flex-shrink:0;}
textarea.ls-chat-input{flex:1;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.11);backdrop-filter:blur(8px);border-radius:14px;color:var(--text);font-family:'Inter',sans-serif;font-size:14px;padding:11px 14px;resize:none;outline:none;line-height:1.5;min-height:46px;max-height:110px;transition:border-color .2s;}
textarea.ls-chat-input:focus{border-color:var(--gold);}
textarea.ls-chat-input::placeholder{color:var(--muted);}
.ls-send-btn{width:46px;height:46px;border-radius:14px;border:none;flex-shrink:0;background:var(--gold);color:#060402;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .22s var(--spring);box-shadow:0 3px 16px rgba(212,148,26,.42);}
.ls-send-btn:hover{background:var(--gold-r);transform:scale(1.08);}
.ls-send-btn:active{transform:scale(.91);}
.ls-send-btn:disabled{opacity:.35;cursor:not-allowed;box-shadow:none;transform:none;}

/* ── MODALS — glass sheets ── */
.ls-overlay{position:fixed;inset:0;background:rgba(0,0,0,.50);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);display:flex;align-items:flex-end;justify-content:center;z-index:200;animation:fadeIn .22s ease;}

/* ── WELCOME SCREEN ── */
.ls-welcome{
  position:fixed;inset:0;z-index:500;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:rgba(6,4,2,.97);
  padding:32px 32px 52px;
  text-align:center;
  animation:fadeIn .4s ease;
}
.ls-welcome-logo{margin-bottom:32px;}
.ls-welcome-title{font-family:'Lora',serif;font-size:28px;font-weight:700;color:var(--text);line-height:1.3;margin-bottom:16px;}
.ls-welcome-title em{color:var(--gold);font-style:italic;}
.ls-welcome-body{font-size:15px;color:var(--text2);line-height:1.8;max-width:320px;margin:0 auto 32px;}
.ls-welcome-features{display:flex;flex-direction:column;gap:14px;width:100%;max-width:320px;margin:0 auto 36px;text-align:left;}
.ls-welcome-feature{display:flex;align-items:flex-start;gap:12px;}
.ls-welcome-feature-icon{width:32px;height:32px;border-radius:50%;background:rgba(212,148,26,.12);border:1px solid rgba(212,148,26,.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;}
.ls-welcome-feature-text{flex:1;}
.ls-welcome-feature-title{font-size:14px;font-weight:700;color:var(--text);margin-bottom:2px;}
.ls-welcome-feature-desc{font-size:12px;color:var(--muted);line-height:1.5;}
.ls-welcome-cta{width:100%;max-width:320px;padding:16px;border-radius:var(--r-lg);border:none;background:var(--gold);color:#060402;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 6px 28px rgba(212,148,26,.4);transition:all .2s;}
.ls-welcome-cta:hover{background:var(--gold-r);transform:translateY(-1px);}
.ls-welcome-skip{margin-top:14px;background:none;border:none;color:var(--muted);font-size:13px;cursor:pointer;}

@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.ls-modal{background:rgba(24,19,14,.88);backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);border-radius:28px 28px 0 0;padding:8px 22px 50px;width:100%;max-width:480px;animation:slideUp .32s cubic-bezier(.32,.72,0,1);box-shadow:0 -8px 60px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.1);border-bottom:none;}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.ls-modal-handle{width:40px;height:4px;border-radius:2px;background:rgba(255,255,255,.14);margin:14px auto 24px;}
.ls-modal-eyebrow{font-size:9.5px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--gold);margin-bottom:7px;opacity:.9;}
.ls-modal-title{font-family:'Lora',serif;font-size:28px;font-weight:700;color:var(--text);margin-bottom:7px;line-height:1.2;}
.ls-modal-title em{color:var(--gold);font-style:italic;}
.ls-modal-sub{font-size:14px;color:var(--text2);line-height:1.68;margin-bottom:22px;}
.ls-pro-features{display:flex;flex-direction:column;gap:14px;margin-bottom:26px;}
.ls-pro-feature{display:flex;align-items:flex-start;gap:13px;}
.ls-pro-feat-icon{width:34px;height:34px;border-radius:var(--r-md);background:rgba(212,148,26,.12);border:1px solid rgba(212,148,26,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--gold);}
.ls-pro-feat-text{flex:1;}
.ls-pro-feat-title{font-size:14px;font-weight:600;color:var(--text);margin-bottom:2px;}
.ls-pro-feat-desc{font-size:12px;color:var(--muted);line-height:1.62;}
.ls-modal-price-row{display:flex;align-items:baseline;gap:7px;margin-bottom:18px;}
.ls-modal-price{font-family:'Lora',serif;font-size:38px;font-weight:700;color:var(--text);}
.ls-modal-price-period{font-size:14px;color:var(--muted);}
.ls-modal-price-note{font-size:12px;color:var(--sage);font-weight:600;}
.ls-modal-cta{width:100%;padding:17px;border-radius:var(--r-lg);border:none;background:var(--gold);color:#060402;font-family:'Inter',sans-serif;font-size:16px;font-weight:700;cursor:pointer;margin-bottom:11px;box-shadow:0 6px 28px rgba(212,148,26,.45);transition:all .25s var(--ease);}
.ls-modal-cta:hover{background:var(--gold-r);transform:translateY(-2px);}
.ls-modal-cta:disabled{opacity:.5;cursor:not-allowed;transform:none;}

/* ── STRIPE CARD INPUT ── */
.ls-stripe-field{margin-bottom:16px;}
.ls-stripe-label{font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);margin-bottom:8px;}
.ls-stripe-input{
  width:100%;padding:13px 14px;
  background:rgba(255,255,255,.07);
  border:1px solid rgba(255,255,255,.12);
  border-radius:var(--r-md);
  color:var(--text);font-size:14px;
  font-family:'Inter',sans-serif;
  box-sizing:border-box;outline:none;
}
.ls-stripe-input:focus{border-color:var(--gold);}
.ls-stripe-card-element{
  padding:13px 14px;
  background:rgba(255,255,255,.07);
  border:1px solid rgba(255,255,255,.12);
  border-radius:var(--r-md);
  margin-bottom:16px;
}
.ls-stripe-error{font-size:12px;color:#e06060;margin-bottom:12px;}

.ls-modal-cancel{width:100%;padding:14px;border-radius:var(--r-md);border:1px solid rgba(255,255,255,.1);background:transparent;color:var(--muted);font-size:14px;cursor:pointer;transition:all .15s;}
.ls-modal-cancel:hover{color:var(--text2);}

/* ── AUTH MODAL — glass ── */
.ls-auth-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(20px);display:flex;align-items:flex-end;justify-content:center;z-index:300;animation:fadeIn .22s ease;}
.ls-auth-modal{background:rgba(24,19,14,.88);backdrop-filter:blur(32px);border-radius:28px 28px 0 0;padding:8px 22px 50px;width:100%;max-width:480px;animation:slideUp .32s cubic-bezier(.32,.72,0,1);box-shadow:0 -8px 60px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.1);border-bottom:none;}
.ls-auth-handle{width:40px;height:4px;border-radius:2px;background:rgba(255,255,255,.14);margin:14px auto 24px;}
.ls-auth-eyebrow{font-size:9.5px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--gold);margin-bottom:7px;}
.ls-auth-title{font-family:'Lora',serif;font-size:24px;font-weight:700;color:var(--text);margin-bottom:5px;line-height:1.25;}
.ls-auth-title em{color:var(--gold);font-style:italic;}
.ls-auth-sub{font-size:13.5px;color:var(--text2);line-height:1.65;margin-bottom:22px;}
.ls-auth-field{display:flex;flex-direction:column;gap:6px;margin-bottom:13px;}
.ls-auth-label{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);}
.ls-auth-input{width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:var(--r-md);color:var(--text);font-family:'Inter',sans-serif;font-size:15px;padding:13px 15px;outline:none;transition:border-color .2s;}
.ls-auth-input:focus{border-color:var(--gold);}
.ls-auth-input::placeholder{color:var(--muted);}
.ls-auth-error{font-size:13px;color:var(--rust);margin-bottom:13px;padding:10px 13px;background:rgba(184,64,40,.08);border-radius:var(--r-sm);border:1px solid rgba(184,64,40,.22);}
.ls-auth-cta{width:100%;padding:16px;border-radius:var(--r-lg);border:none;background:var(--gold);color:#060402;font-family:'Inter',sans-serif;font-size:16px;font-weight:700;cursor:pointer;margin-bottom:13px;box-shadow:0 6px 28px rgba(212,148,26,.45);transition:all .25s var(--ease);margin-top:4px;}
.ls-auth-cta:hover{background:var(--gold-r);transform:translateY(-2px);}
.ls-auth-switch{text-align:center;font-size:13.5px;color:var(--text2);margin-bottom:11px;}
.ls-auth-switch button{background:none;border:none;color:var(--gold);font-weight:600;cursor:pointer;padding:0;}
.ls-auth-cancel{display:block;width:100%;padding:13px;border-radius:var(--r-md);border:1px solid rgba(255,255,255,.1);background:transparent;color:var(--muted);font-size:13.5px;cursor:pointer;transition:all .15s;text-align:center;}
.ls-auth-cancel:hover{color:var(--text2);}
@media(hover:none){.ls-tile-wrap:hover .ls-tile{transform:scale(1);}.ls-tile-wrap:hover .ls-tile-overlay{opacity:0;}.ls-tile-wrap,.ls-tile{transition:none;}}

/* ── TILE MODAL — glass ── */
.ls-tile-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.52);backdrop-filter:blur(20px);display:flex;align-items:flex-end;justify-content:center;z-index:200;animation:fadeIn .22s ease;}
.ls-tile-modal{background:rgba(24,19,14,.88);backdrop-filter:blur(32px);border-radius:28px 28px 0 0;padding:8px 22px 52px;width:100%;max-width:480px;animation:slideUp .32s cubic-bezier(.32,.72,0,1);box-shadow:0 -8px 60px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.1);border-bottom:none;max-height:92dvh;overflow-y:auto;}
.ls-tile-modal-handle{width:40px;height:4px;border-radius:2px;background:rgba(255,255,255,.14);margin:14px auto 22px;}
.ls-tile-modal-cover{width:92px;height:134px;border-radius:13px;overflow:hidden;margin:0 auto 18px;box-shadow:0 12px 40px rgba(0,0,0,.65);}
.ls-tile-modal-title{font-family:'Lora',serif;font-size:22px;font-weight:700;color:var(--text);text-align:center;margin-bottom:4px;line-height:1.22;}
.ls-tile-modal-author{font-size:13px;color:var(--muted);text-align:center;margin-bottom:22px;}
.ls-tile-modal-cta{width:100%;padding:14px;border-radius:var(--r-lg);border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.07);backdrop-filter:blur(8px);color:var(--text2);font-family:'Inter',sans-serif;font-size:13.5px;font-weight:600;cursor:pointer;margin-bottom:10px;transition:all .2s;display:block;text-align:center;box-sizing:border-box;}
.ls-tile-modal-cta:hover{background:rgba(255,255,255,.12);color:var(--text);}
.ls-tile-modal-cancel{width:100%;padding:13px;border-radius:var(--r-md);border:none;background:transparent;color:var(--muted);font-size:13px;cursor:pointer;transition:all .15s;display:block;text-align:center;box-sizing:border-box;}
.ls-tile-modal-cancel:hover{color:var(--text2);}

/* ── WHY BLOCK ── */
.ls-why-block{padding:12px 14px;background:rgba(255,255,255,.05);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.09);border-radius:var(--r-md);margin-bottom:14px;}
.ls-why-label{display:flex;align-items:center;gap:7px;font-size:8px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--gold);opacity:.82;margin-bottom:7px;}
.ls-why-label::before{content:'';width:14px;height:1px;background:rgba(212,148,26,.5);border-radius:1px;flex-shrink:0;}
.ls-why-reason{font-size:12.5px;line-height:1.72;color:rgba(240,232,216,.9);font-style:italic;}
.ls-why-reason strong{color:var(--gold);font-style:normal;font-weight:600;}
.ls-overlay-why-label{font-size:7px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(212,148,26,.65);margin-bottom:3px;}
.ls-proof-why-label{display:flex;align-items:center;gap:6px;font-size:7.5px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--gold);opacity:.78;margin-bottom:6px;}
.ls-proof-why-label::before{content:'';width:10px;height:1px;background:rgba(212,148,26,.4);border-radius:1px;}

/* ── WHEEL ── */
@keyframes wheelFocus{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes wheelFadeIn{from{opacity:0}to{opacity:1}}

/* ── FOR YOU FEED ── */
.ls-feed-toggle{
  display:flex;padding:10px 16px;gap:6px;
  background:rgba(18,14,10,.68);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
  border-bottom:1px solid rgba(255,255,255,.08);
  position:sticky;top:0;z-index:9;flex-shrink:0;
}
.ls-feed-toggle-btn{
  flex:1;padding:9px;border-radius:var(--r-pill);border:none;
  font-family:'Inter',sans-serif;font-size:13px;font-weight:600;
  cursor:pointer;transition:all .25s var(--ease);
}
.ls-feed-toggle-btn.on{background:var(--gold);color:#060402;box-shadow:0 3px 16px var(--glow);}
.ls-feed-toggle-btn:not(.on){background:transparent;color:var(--muted);border:1px solid rgba(255,255,255,.12);}
.ls-feed-toggle-btn:not(.on):hover{color:var(--text2);border-color:rgba(255,255,255,.22);}
/* ── FOR YOU FEED — full-screen snap scroll ── */
.ls-foryou-feed{
  flex:1;
  overflow-y:scroll;
  scroll-snap-type:y mandatory;
  -webkit-overflow-scrolling:touch;
  /* Must have explicit height for snap to work */
  height:0;
  min-height:100%;
}
.ls-foryou-card{
  position:relative;
  width:100%;
  /* Explicit height = viewport minus header (58px) minus nav (56px) */
  height:calc(100dvh - 114px);
  min-height:calc(100dvh - 114px);
  flex-shrink:0;
  scroll-snap-align:start;
  scroll-snap-stop:always;
  overflow:hidden;
  display:flex;
  flex-direction:column;
  justify-content:flex-end;
}
@keyframes feedItemIn{from{opacity:0}to{opacity:1}}

@keyframes micPulse{
  0%,100%{box-shadow:0 0 0 2px rgba(212,148,26,.4);}
  50%{box-shadow:0 0 0 5px rgba(212,148,26,.15),0 0 0 2px rgba(212,148,26,.5);}
}

/* ── MOMENT CARD — top-level surfaced moment ── */
@keyframes momentIn{
  from{opacity:0;transform:translateY(-6px);}
  to{opacity:1;transform:translateY(0);}
}
@keyframes momentOut{
  from{opacity:1;transform:translateY(0);}
  to{opacity:0;transform:translateY(-4px);}
}
.ls-moment-card{
  margin:14px 20px 2px;
  padding:14px 16px;
  border-radius:var(--r-lg);
  background:rgba(255,255,255,.055);
  backdrop-filter:blur(20px);
  -webkit-backdrop-filter:blur(20px);
  border:1px solid rgba(255,255,255,.10);
  position:relative;
  animation:momentIn .3s var(--ease) both;
  transition:transform .2s var(--ease), box-shadow .2s var(--ease);
}
.ls-moment-card:hover{
  transform:translateY(-1px);
  box-shadow:0 6px 28px rgba(0,0,0,.25);
}
.ls-moment-card.exiting{
  animation:momentOut .25s var(--ease) both;
  pointer-events:none;
}
.ls-moment-msg{
  font-family:'Lora',serif;
  font-size:14.5px;
  font-weight:600;
  line-height:1.55;
  color:var(--text);
  margin-bottom:12px;
  padding-right:20px;
}
.ls-moment-cta{
  padding:8px 16px;
  border-radius:var(--r-pill);
  border:none;
  background:var(--gold);
  color:#060402;
  font-size:12.5px;
  font-weight:700;
  cursor:pointer;
  transition:all .18s;
  box-shadow:0 2px 12px rgba(212,148,26,.28);
}
.ls-moment-cta:hover{
  background:var(--gold-r);
  box-shadow:0 4px 18px rgba(212,148,26,.4);
}
.ls-moment-dismiss{
  position:absolute;
  top:10px;right:12px;
  background:none;border:none;
  color:var(--muted);font-size:17px;
  cursor:pointer;line-height:1;
  padding:2px 4px;
  transition:color .15s;
}
.ls-moment-dismiss:hover{color:var(--text2);}


@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
.ls-cursor{display:inline-block;width:2px;height:14px;background:var(--gold);margin-left:2px;vertical-align:middle;animation:blink .7s ease infinite;}
@keyframes toastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes bgFadeIn{from{opacity:0}to{opacity:1}}
.ls-shelf-toast{
  position:fixed;bottom:90px;left:50%;transform:translateX(-50%);
  background:rgba(212,148,26,.95);color:#060402;
  padding:9px 16px;border-radius:var(--r-pill);
  font-size:13px;font-weight:700;white-space:nowrap;
  animation:toastIn .25s ease;z-index:999;
  box-shadow:0 4px 20px rgba(0,0,0,.4);
}
.ls-friend-prompt{
  margin:12px 16px 6px;
  padding:12px 16px;
  border-radius:14px;
  background:rgba(255,255,255,.06);
  backdrop-filter:blur(14px);
  -webkit-backdrop-filter:blur(14px);
  border:1px solid rgba(255,255,255,.08);
  font-size:13.5px;
  line-height:1.6;
  color:rgba(240,232,216,.9);
  font-weight:500;
}

/* ── FLOATING QUICK-CHAT — persistent bar on Discover ── */
.ls-quick-chat{
  display:flex;gap:8px;align-items:center;
  padding:10px 16px;
  background:rgba(8,6,4,.80);
  backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
  border-top:1px solid rgba(255,255,255,.07);
  flex-shrink:0;
}
.ls-quick-input{
  flex:1;background:rgba(255,255,255,.07);
  border:1px solid rgba(255,255,255,.10);
  border-radius:var(--r-pill);
  color:var(--text);font-family:'Inter',sans-serif;font-size:14px;
  padding:10px 16px;outline:none;transition:border-color .2s;
}
.ls-quick-input:focus{border-color:var(--gold);}
.ls-quick-input::placeholder{color:var(--muted);}

/* ── REACTION PILLS — on book tiles ── */
.ls-reaction-bar{
  display:flex;gap:5px;flex-wrap:wrap;
  padding:8px 12px;
  border-top:1px solid rgba(255,255,255,.06);
}
.ls-reaction-pill{
  padding:4px 10px;border-radius:var(--r-pill);
  border:1px solid rgba(255,255,255,.10);
  background:transparent;color:var(--muted);
  font-size:10.5px;font-weight:500;cursor:pointer;
  transition:all .15s;
}
.ls-reaction-pill:hover{border-color:var(--gold);color:var(--gold);}

/* BookCover fills full screen inside For You card */
.ls-foryou-bg-cover .ls-book-cover{
  width:100% !important;
  min-width:unset !important;
  height:100% !important;
  border-radius:0 !important;
  box-shadow:none !important;
  position:absolute;
  inset:0;
}

/* ── CINEMATIC BACKGROUND — VOICE THEMES ─────────────────────────────────────
   Outer wrapper structure:
     .ls-app-wrapper  (relative, height:100dvh, bg:#14110d)
       .ls-bg-scene   (absolute, inset:0, z:0) — primary gradient + ::after depth
       .ls-bg-vignette(absolute, inset:0, z:1) — paper-grain + dark overlay
     .ls (relative, z:2, bg:transparent) — all app content

   data-bg attribute on .ls drives theme selection.
   ─────────────────────────────────────────────────────────────────────────── */

/* ── Scene layer — primary gradient ── */
.ls-bg-scene {
  position:absolute;inset:0;z-index:0;pointer-events:none;
  filter:blur(44px) saturate(0.85);
  transition:opacity 4s ease-in-out;
  animation:lsBgBreath 28s ease-in-out infinite alternate;
  opacity:0.85;
}

/* Secondary depth — smaller tighter pools, slower drift */
.ls-bg-scene::after {
  content:"";position:absolute;inset:0;
  filter:blur(80px) saturate(0.5);
  opacity:0.6;
  animation:lsBgDrift 42s ease-in-out infinite alternate;
}

/* ── Vignette — paper-grain texture + light edge darkening ── */
.ls-bg-vignette {
  position:absolute;inset:0;z-index:1;pointer-events:none;
  background:
    repeating-conic-gradient(rgba(255,255,255,.012) 0% 25%,transparent 0% 50%) 0 0 / 4px 4px,
    radial-gradient(ellipse 120% 90% at 50% 42%,transparent 0%,rgba(14,11,8,.06) 45%,rgba(10,8,6,.28) 100%),
    radial-gradient(ellipse 60% 35% at 50% 8%,rgba(180,130,50,.06) 0%,transparent 100%),
    radial-gradient(ellipse 80% 25% at 50% 98%,rgba(120,80,30,.04) 0%,transparent 100%);
}

@keyframes lsBgBreath {
  from { opacity:0.78; filter:blur(50px) saturate(0.80); }
  to   { opacity:0.90; filter:blur(42px) saturate(0.95); }
}
@keyframes lsBgDrift {
  from { opacity:0.3; transform:scale(1.02) translateY(0); }
  to   { opacity:0.5; transform:scale(0.98) translateY(-2%); }
}

/* ── Voice theme gradients — primary scene layer ── */
.ls-bg-scene[data-voice="literary"] {
  background:
    radial-gradient(ellipse 72% 88% at 4%  68%, rgba(195,108,18,.72) 0%, transparent 58%),
    radial-gradient(ellipse 58% 70% at 88% 16%, rgba(155,92,14,.55)  0%, transparent 54%),
    radial-gradient(ellipse 88% 52% at 50% 102%,rgba(130,70,8,.48)   0%, transparent 52%),
    radial-gradient(ellipse 52% 60% at 78% 72%, rgba(80,52,12,.38)   0%, transparent 50%),
    radial-gradient(ellipse 48% 55% at 22% 22%, rgba(100,62,10,.42)  0%, transparent 50%);
}
.ls-bg-scene[data-voice="literary"]::after {
  background:
    radial-gradient(ellipse 35% 45% at 65% 35%, rgba(210,150,50,.18) 0%, transparent 100%),
    radial-gradient(ellipse 40% 30% at 15% 80%, rgba(160,100,20,.14) 0%, transparent 100%),
    radial-gradient(ellipse 28% 38% at 85% 60%, rgba(140,85,15,.10)  0%, transparent 100%),
    radial-gradient(ellipse 50% 25% at 45% 12%, rgba(180,120,30,.08) 0%, transparent 100%);
}

.ls-bg-scene[data-voice="nonfiction"] {
  background:
    radial-gradient(ellipse 68% 82% at 12% 58%, rgba(52,75,128,.65)  0%, transparent 58%),
    radial-gradient(ellipse 62% 72% at 85% 22%, rgba(38,58,105,.50)  0%, transparent 54%),
    radial-gradient(ellipse 82% 48% at 50% 105%,rgba(28,42,88,.42)   0%, transparent 52%),
    radial-gradient(ellipse 55% 65% at 72% 78%, rgba(62,52,32,.35)   0%, transparent 50%),
    radial-gradient(ellipse 45% 52% at 18% 18%, rgba(35,55,95,.38)   0%, transparent 50%);
}
.ls-bg-scene[data-voice="nonfiction"]::after {
  background:
    radial-gradient(ellipse 32% 42% at 70% 28%, rgba(65,85,140,.15)  0%, transparent 100%),
    radial-gradient(ellipse 38% 35% at 20% 75%, rgba(45,65,115,.12)  0%, transparent 100%),
    radial-gradient(ellipse 45% 22% at 55% 90%, rgba(55,75,120,.08)  0%, transparent 100%),
    radial-gradient(ellipse 25% 35% at 88% 55%, rgba(75,62,45,.10)   0%, transparent 100%);
}

.ls-bg-scene[data-voice="thriller"] {
  background:
    radial-gradient(ellipse 65% 85% at 8%  72%, rgba(128,18,18,.68)  0%, transparent 56%),
    radial-gradient(ellipse 55% 68% at 88% 18%, rgba(32,28,48,.58)   0%, transparent 54%),
    radial-gradient(ellipse 85% 50% at 50% 105%,rgba(88,12,12,.50)   0%, transparent 52%),
    radial-gradient(ellipse 58% 62% at 80% 80%, rgba(18,22,42,.40)   0%, transparent 50%),
    radial-gradient(ellipse 42% 52% at 20% 20%, rgba(72,10,10,.35)   0%, transparent 50%);
}
.ls-bg-scene[data-voice="thriller"]::after {
  background:
    radial-gradient(ellipse 30% 40% at 55% 40%, rgba(100,8,8,.14)    0%, transparent 100%),
    radial-gradient(ellipse 35% 32% at 25% 65%, rgba(28,18,45,.12)   0%, transparent 100%),
    radial-gradient(ellipse 42% 28% at 78% 85%, rgba(80,5,5,.10)     0%, transparent 100%),
    radial-gradient(ellipse 22% 30% at 92% 15%, rgba(45,22,55,.08)   0%, transparent 100%);
}

.ls-bg-scene[data-voice="sciFi"] {
  background:
    radial-gradient(ellipse 70% 88% at 6%  65%, rgba(18,52,175,.68)  0%, transparent 58%),
    radial-gradient(ellipse 60% 72% at 86% 20%, rgba(58,18,138,.52)  0%, transparent 54%),
    radial-gradient(ellipse 85% 52% at 50% 104%,rgba(10,28,105,.45)  0%, transparent 52%),
    radial-gradient(ellipse 55% 65% at 76% 76%, rgba(28,14,85,.38)   0%, transparent 50%),
    radial-gradient(ellipse 45% 55% at 18% 20%, rgba(38,62,145,.40)  0%, transparent 50%);
}
.ls-bg-scene[data-voice="sciFi"]::after {
  background:
    radial-gradient(ellipse 30% 45% at 60% 30%, rgba(25,60,180,.15)  0%, transparent 100%),
    radial-gradient(ellipse 38% 30% at 18% 72%, rgba(65,25,145,.12)  0%, transparent 100%),
    radial-gradient(ellipse 42% 25% at 80% 88%, rgba(15,35,120,.09)  0%, transparent 100%),
    radial-gradient(ellipse 28% 38% at 42% 55%, rgba(40,18,100,.07)  0%, transparent 100%);
}

.ls-bg-scene[data-voice="curious"],
.ls-bg-scene:not([data-voice]) {
  background:
    radial-gradient(ellipse 72% 88% at 4%  68%, rgba(195,108,18,.65) 0%, transparent 58%),
    radial-gradient(ellipse 58% 70% at 88% 16%, rgba(140,82,14,.50)  0%, transparent 54%),
    radial-gradient(ellipse 88% 52% at 50% 102%,rgba(120,65,8,.45)   0%, transparent 52%),
    radial-gradient(ellipse 62% 72% at 82% 78%, rgba(52,68,108,.38)  0%, transparent 52%),
    radial-gradient(ellipse 48% 55% at 20% 22%, rgba(88,58,12,.35)   0%, transparent 50%);
}
.ls-bg-scene[data-voice="curious"]::after,
.ls-bg-scene:not([data-voice])::after {
  background:
    radial-gradient(ellipse 35% 42% at 62% 32%, rgba(200,140,40,.14) 0%, transparent 100%),
    radial-gradient(ellipse 38% 30% at 18% 78%, rgba(130,75,15,.11)  0%, transparent 100%),
    radial-gradient(ellipse 42% 22% at 50% 92%, rgba(110,60,10,.08)  0%, transparent 100%),
    radial-gradient(ellipse 28% 35% at 85% 50%, rgba(55,70,110,.09)  0%, transparent 100%);
}

/* ── Glass utilities ── */
.ls-glass    { background:rgba(255,255,255,.055); backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px); border:1px solid rgba(255,255,255,.10); box-shadow:0 2px 16px rgba(0,0,0,.2); }
.ls-glass-mid{ background:rgba(255,255,255,.08);  backdrop-filter:blur(22px); -webkit-backdrop-filter:blur(22px); border:1px solid rgba(255,255,255,.12); box-shadow:0 4px 20px rgba(0,0,0,.25);}
.ls-glass-str{ background:rgba(20,17,13,.55);     backdrop-filter:blur(28px); -webkit-backdrop-filter:blur(28px); border:1px solid rgba(255,255,255,.10); box-shadow:0 8px 32px rgba(0,0,0,.35);}

/* ── Cover fallback ── */
.ls-cover-fallback{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px 10px;text-align:center;}
.ls-book-cover-fallback{
  position:absolute;inset:0;
  display:flex;flex-direction:column;
  justify-content:center;align-items:center;
  padding:10px 8px;
  overflow:hidden;
}
.ls-book-cover-fallback::before{
  content:"";
  position:absolute;top:12px;left:8px;right:8px;
  height:1px;background:rgba(212,148,26,.4);
}
.ls-book-cover-fallback::after{
  content:"";
  position:absolute;bottom:12px;left:8px;right:8px;
  height:1px;background:rgba(212,148,26,.4);
}
.ls-book-cover-title{
  font-family:'Lora',serif;
  font-size:13px;font-weight:700;
  color:#f0e8d8;
  line-height:1.3;
  text-align:center;
  word-break:break-word;
  hyphens:auto;
  padding:0 4px;
}
.ls-book-cover-author{
  font-size:9px;
  color:rgba(212,148,26,.9);
  font-style:italic;
  text-align:center;
  margin-top:6px;
  letter-spacing:.3px;
}
.ls-book-cover-lines{display:none;}
.ls-book-cover-line{display:none;}
`;


// ─── DATA ─────────────────────────────────────────────────────────────────────
// Open Library cover URLs — free, no API key
// https://covers.openlibrary.org/b/isbn/{ISBN}-L.jpg
const BOOKS = [
  {
    id:1,
    title:"The Covenant of Water",
    author:"Abraham Verghese",
    isbn:"9780802162175",
    tags:["Literary Fiction","Family Saga"],
    primary:"Literary Fiction",
    score:96,
    why:"Because you gravitate toward <strong>patient, sweeping storytelling</strong> — this is three generations across 70 years in South India. If Pachinko moved you, this will too.",
    color:["#1a2430","#0e1820"],
  },
  {
    id:2,
    title:"Demon Copperhead",
    author:"Barbara Kingsolver",
    isbn:"9780063250550",
    tags:["Literary Fiction","Opioid Crisis"],
    primary:"Literary Fiction",
    score:94,
    why:"Your taste runs toward <strong>novels with moral weight and real stakes</strong>. Pulitzer 2023. Dickens retold in Appalachia during the opioid epidemic — raw, important, impossible to put down.",
    color:["#2a1808","#1a1004"],
  },
  {
    id:3,
    title:"Project Hail Mary",
    author:"Andy Weir",
    isbn:"9780593135204",
    tags:["Sci-Fi","Space","Survival"],
    primary:"Sci-Fi",
    score:93,
    why:"You've rated books that <strong>reward intelligence</strong>. This is hard science fiction that reads like a thriller — lone astronaut, no memory, mission to save Earth. Genuinely hard to put down.",
    color:["#0a1828","#061020"],
  },
  {
    id:4,
    title:"All the Light We Cannot See",
    author:"Anthony Doerr",
    isbn:"9781501173219",
    tags:["Historical","WWII","Literary"],
    primary:"Historical",
    score:91,
    why:"You appreciate <strong>precise, luminous prose</strong>. Pulitzer winner. A blind French girl and a German soldier in WWII — alternating perspectives, devastating and beautiful.",
    color:["#201818","#140e0e"],
  },
  {
    id:5,
    title:"The Lincoln Highway",
    author:"Amor Towles",
    isbn:"9780593413722",
    tags:["Literary Fiction","1950s"],
    primary:"Literary Fiction",
    score:89,
    why:"If you loved <strong>A Gentleman in Moscow</strong> for Towles's wit and restraint, this delivers the same. Unforgettable characters across 10 days in 1954 America.",
    color:["#181428","#100c1c"],
  },
  {
    id:6,
    title:"Thinking, Fast and Slow",
    author:"Daniel Kahneman",
    isbn:"9780374533557",
    tags:["Psychology","Non-Fiction","Award Winner"],
    primary:"Psychology",
    score:88,
    why:"For readers who <strong>want to understand their own minds</strong>. Every decision you make looks different after this. One of the most genuinely useful books written in the last 30 years.",
    color:["#141c14","#0c1408"],
  },
  // ── BOOKS EXPANSION — Phase 16 ─────────────────────────────────────────────
  {
    id:7, title:"Normal People", author:"Sally Rooney", isbn:"9780571334650",
    tags:["Literary Fiction","Contemporary","Emotional"], primary:"Literary Fiction", score:92,
    why:"Rooney writes dialogue that sounds exactly like how people actually talk and don't say. Small book, enormous emotional impact.",
    color:["#141820","#0c1018"],
  },
  {
    id:8, title:"Gone Girl", author:"Gillian Flynn", isbn:"9780307588371",
    tags:["Thriller","Gripping","Psychological Thriller"], primary:"Thriller", score:91,
    why:"Two unreliable narrators, a missing wife, and a structure that keeps completely reversing what you think you know. One of the best page-turners written in the last 20 years.",
    color:["#1a1010","#100808"],
  },
  {
    id:9, title:"The Silent Patient", author:"Alex Michaelides", isbn:"9781250301697",
    tags:["Thriller","Gripping","Psychological Thriller"], primary:"Thriller", score:89,
    why:"A famous painter shoots her husband and never speaks again. Her therapist becomes obsessed. The twist lands — genuinely.",
    color:["#181818","#101010"],
  },
  {
    id:10, title:"Where the Crawdads Sing", author:"Delia Owens", isbn:"9780735224292",
    tags:["Literary Fiction","Mystery","Gripping"], primary:"Literary Fiction", score:90,
    why:"A woman who raised herself in the marshes of North Carolina. A murder. Stunning nature writing wrapped around a propulsive mystery.",
    color:["#0e1a10","#081008"],
  },
  {
    id:11, title:"The Seven Husbands of Evelyn Hugo", author:"Taylor Jenkins Reid", isbn:"9781501161933",
    tags:["Literary Fiction","Gripping","Historical"], primary:"Literary Fiction", score:91,
    why:"Old Hollywood, a legendary actress, seven marriages, and one interview. Reid makes you feel the whole span of a life. Impossible to put down.",
    color:["#201428","#180e1c"],
  },
  {
    id:12, title:"A Little Life", author:"Hanya Yanagihara", isbn:"9780804172707",
    tags:["Literary Fiction","Award Winner","Emotional"], primary:"Literary Fiction", score:94,
    why:"The most devastating novel written in the last decade. Four men in New York over thirty years. Not easy — but one of the most important things you'll read.",
    color:["#141414","#0c0c0c"],
  },
  {
    id:13, title:"Piranesi", author:"Susanna Clarke", isbn:"9781635575637",
    tags:["Fantasy","Unexpected","Award Winner"], primary:"Fantasy", score:93,
    why:"A man lives in a house with infinite halls and tides. He doesn't know how he got there. Utterly original — unlike anything else you'll read.",
    color:["#101828","#0a1018"],
  },
  {
    id:14, title:"Tomorrow, and Tomorrow, and Tomorrow", author:"Gabrielle Zevin", isbn:"9780593321201",
    tags:["Literary Fiction","Unexpected","Award Winner"], primary:"Literary Fiction", score:95,
    why:"About two game designers, their 30-year collaboration, and everything they fail to say to each other. It's about creativity, love, and time. Widely considered the novel of 2022.",
    color:["#181428","#10101c"],
  },
  {
    id:15, title:"The Kite Runner", author:"Khaled Hosseini", isbn:"9781594631931",
    tags:["Literary Fiction","Emotional","Family Saga"], primary:"Literary Fiction", score:90,
    why:"A man haunted by a betrayal he committed as a boy in Afghanistan. Hosseini's debut. Still one of the most powerful first novels you'll read.",
    color:["#201410","#180e08"],
  },
  {
    id:16, title:"Big Little Lies", author:"Liane Moriarty", isbn:"9780399167065",
    tags:["Thriller","Gripping","Mystery"], primary:"Thriller", score:88,
    why:"Trivia night murder at an Australian school. Three women, secrets stacked on secrets, and genuinely funny writing before it turns devastating.",
    color:["#0e1820","#081018"],
  },
  {
    id:17, title:"Educated", author:"Tara Westover", isbn:"9780399590504",
    tags:["Biography","Unexpected","Award Winner"], primary:"Biography", score:95,
    why:"A woman who grew up off-grid with survivalist parents, never went to school, and ended up with a PhD from Cambridge. One of the great memoirs of our time.",
    color:["#201814","#18100c"],
  },
  {
    id:18, title:"Rebecca", author:"Daphne du Maurier", isbn:"9780380730407",
    tags:["Thriller","Gripping","Gothic"], primary:"Thriller", score:90,
    why:"'Last night I dreamt I went to Manderley again.' A nameless narrator, a dead first wife, and a house alive with menace. Still unsurpassed.",
    color:["#180e10","#100808"],
  },
  {
    id:19, title:"Born a Crime", author:"Trevor Noah", isbn:"9780385540100",
    tags:["Biography","Unexpected","Funny"], primary:"Biography", score:92,
    why:"Growing up mixed-race under apartheid in South Africa. Noah is genuinely funny and the stories are genuinely harrowing. The combination is impossible to put down.",
    color:["#141c10","#0c1408"],
  },
  {
    id:20, title:"The Great Gatsby", author:"F. Scott Fitzgerald", isbn:"9780743273565",
    tags:["Classics","Quick Read","Literary Fiction"], primary:"Classics", score:88,
    why:"Still the most elegantly constructed American novel. Parties, obsession, green lights. Read it in an afternoon, think about it for years.",
    color:["#1c1808","#141004"],
  },
  {
    id:21, title:"Animal Farm", author:"George Orwell", isbn:"9780451526342",
    tags:["Classics","Quick Read","Political"], primary:"Classics", score:89,
    why:"A farm, some pigs, and a complete portrait of how power corrupts. 112 pages. Still one of the most efficient political statements in literary history.",
    color:["#141814","#0c100c"],
  },
  {
    id:22, title:"Pachinko", author:"Min Jin Lee", isbn:"9781455563920",
    tags:["Literary Fiction","Family Saga","Historical","Award Winner"], primary:"Literary Fiction", score:96,
    why:"Four generations of a Korean family in Japan across the twentieth century. Makes you feel you've lived several lives. Almost everyone who reads it can't stop talking about it.",
    color:["#1a1010","#120808"],
  },
  {
    id:23, title:"A Gentleman in Moscow", author:"Amor Towles", isbn:"9780670026197",
    tags:["Literary Fiction","Unexpected","Historical"], primary:"Literary Fiction", score:93,
    why:"A Russian count under house arrest in a Moscow hotel for 32 years. Sounds limiting — Towles makes it feel like a whole world. Warm, witty, quietly profound.",
    color:["#1c1208","#140c04"],
  },
  {
    id:24, title:"The Midnight Library", author:"Matt Haig", isbn:"9780525559474",
    tags:["Literary Fiction","Emotional","Unexpected"], primary:"Literary Fiction", score:87,
    why:"A library between life and death, containing every version of her life she could have lived. Haig writes about regret and hope better than almost anyone.",
    color:["#081828","#041018"],
  },
  {
    id:25, title:"Lessons in Chemistry", author:"Bonnie Garmus", isbn:"9780385547345",
    tags:["Literary Fiction","Funny","Unexpected","Award Winner"], primary:"Literary Fiction", score:91,
    why:"A female chemist in 1960s California ends up hosting a cooking show. Wickedly funny and quietly furious — the combination is irresistible.",
    color:["#1c1a10","#141208"],
  },
  {
    id:26, title:"Hamnet", author:"Maggie O'Farrell", isbn:"9780525657606",
    tags:["Literary Fiction","Historical","Emotional","Award Winner"], primary:"Literary Fiction", score:93,
    why:"Shakespeare's son dies of plague, told from his mother's perspective. Exquisitely written, devastating. Won the Women's Prize for Fiction.",
    color:["#181010","#100808"],
  },
  {
    id:27, title:"The Girl with the Dragon Tattoo", author:"Stieg Larsson", isbn:"9780307454546",
    tags:["Thriller","Gripping","Mystery"], primary:"Thriller", score:88,
    why:"A disgraced journalist and a hacker investigate a 40-year-old disappearance. Larsson builds atmosphere like almost no thriller writer since.",
    color:["#101018","#08080e"],
  },
  {
    id:28, title:"The Secret History", author:"Donna Tartt", isbn:"9781400031702",
    tags:["Literary Fiction","Gripping","Psychological Thriller"], primary:"Literary Fiction", score:92,
    why:"You know from page one that a murder happened. The novel is about how. Tartt makes classics students in Vermont feel like the center of the universe.",
    color:["#181420","#100c18"],
  },
  {
    id:29, title:"The Old Man and the Sea", author:"Ernest Hemingway", isbn:"9780684801223",
    tags:["Classics","Quick Read","Literary Fiction"], primary:"Classics", score:87,
    why:"An old Cuban fisherman, a massive marlin, three days at sea. Hemingway at his most essential. One afternoon.",
    color:["#0e1820","#08101c"],
  },
  {
    id:30, title:"Of Mice and Men", author:"John Steinbeck", isbn:"9780140177398",
    tags:["Classics","Quick Read","Emotional"], primary:"Classics", score:88,
    why:"Two migrant workers and a dream of land. Every scene tight, every line doing work. Finish it in two hours. Think about it for weeks.",
    color:["#141c08","#0c1404"],
  },
  {
    id:31, title:"Giovanni's Room", author:"James Baldwin", isbn:"9780307275776",
    tags:["Classics","Quick Read","Literary Fiction","Emotional"], primary:"Classics", score:91,
    why:"An American in Paris, a love affair he can't allow himself to have, and the consequences. Baldwin at his most precise. One of the most beautiful novels in American literature.",
    color:["#141420","#0c0c18"],
  },
  {
    id:32, title:"A Man Called Ove", author:"Fredrik Backman", isbn:"9781501117732",
    tags:["Literary Fiction","Unexpected","Emotional","Funny"], primary:"Literary Fiction", score:89,
    why:"A grumpy Swedish man tries to die and keeps being interrupted by people who need him. Infuriating and then absolutely devastating.",
    color:["#141c1c","#0c1414"],
  },
  {
    id:33, title:"The House in the Cerulean Sea", author:"T.J. Klune", isbn:"9781250217288",
    tags:["Fantasy","Unexpected","Funny","Emotional"], primary:"Fantasy", score:88,
    why:"A government case worker is sent to oversee a magical orphanage. Cozy, warm, and quietly serious. The antidote to books that feel like work.",
    color:["#0e1820","#081018"],
  },
  {
    id:34, title:"The Overstory", author:"Richard Powers", isbn:"9780393356120",
    tags:["Literary Fiction","Award Winner","Unexpected"], primary:"Literary Fiction", score:90,
    why:"Nine Americans whose lives intertwine around trees. Powers writes about ecology with the urgency of a thriller. Pulitzer Prize winner.",
    color:["#0a180a","#041004"],
  },
  {
    id:35, title:"Klara and the Sun", author:"Kazuo Ishiguro", isbn:"9780593311295",
    tags:["Literary Fiction","Sci-Fi","Unexpected","Award Winner"], primary:"Literary Fiction", score:91,
    why:"Told from the perspective of an Artificial Friend watching the world through a shop window. Ishiguro asking what it means to love someone.",
    color:["#181410","#100c08"],
  },
  {
    id:36, title:"In the Woods", author:"Tana French", isbn:"9780143113492",
    tags:["Mystery","Gripping","Literary Fiction"], primary:"Mystery", score:90,
    why:"A detective investigating a child's murder in the Dublin woods — the same woods where he was found as a boy with no memory. French is the best crime writer working.",
    color:["#0a1408","#061004"],
  },
  {
    id:37, title:"The God of Small Things", author:"Arundhati Roy", isbn:"9780812979657",
    tags:["Literary Fiction","Award Winner","Family Saga","Emotional"], primary:"Literary Fiction", score:92,
    why:"A family in Kerala, a forbidden love, and the small things that break everything. Roy's prose is so precise it hurts. Booker Prize. Her only novel.",
    color:["#1a0e0c","#120808"],
  },
  {
    id:38, title:"Verity", author:"Colleen Hoover", isbn:"9781538724736",
    tags:["Thriller","Gripping","Psychological Thriller"], primary:"Thriller", score:87,
    why:"A writer moves into a famous author's home and finds a manuscript that may confess to murder. CoHo's most unhinged book — genuinely can't-put-down.",
    color:["#180c10","#100808"],
  },
  {
    id:39, title:"Remarkably Bright Creatures", author:"Shelby Van Pelt", isbn:"9780063204157",
    tags:["Literary Fiction","Unexpected","Funny","Emotional"], primary:"Literary Fiction", score:88,
    why:"Told partly from the perspective of a giant Pacific octopus at an aquarium. A widow, a young man, and the octopus who sees everything. Exactly as good as everyone says.",
    color:["#0a1820","#061018"],
  },
  {
    id:40, title:"Lincoln in the Bardo", author:"George Saunders", isbn:"9780812985405",
    tags:["Literary Fiction","Unexpected","Award Winner"], primary:"Literary Fiction", score:91,
    why:"Lincoln's dead son in a graveyard, surrounded by ghosts in denial. Told through 166 different voices. Saunders won the Man Booker for this. Nothing else like it.",
    color:["#141420","#0c0c18"],
  },
];

// ── RECOMMENDATION REASON ENGINE ─────────────────────────────────────────────
// Affinity metadata per book — extends the static BOOKS array without bloating it.
// similarTo: titles the user may have in their read history
// toneWords:  2-3 descriptors used in generated reason copy
// pacing:     used when no other signal is available
// moodMap:    optional mood-specific copy overrides
const BOOK_AFFINITY = {
  1: {
    similarTo: ["Pachinko","A Gentleman in Moscow","The Kite Runner","The God of Small Things","Cutting for Stone"],
    toneWords:  ["sweeping","patient","literary"],
    pacing:     "slow",
    moodMap: {
      escape:  "An immersive escape across three generations — completely absorbing",
      feel:    "Will move you deeply — patient, emotional family storytelling",
      unwind:  "Rich, slow-burning and atmospheric — perfect for unwinding",
    },
  },
  2: {
    similarTo: ["East of Eden","Grapes of Wrath","The Underground Railroad","Where the Crawdads Sing","Hillbilly Elegy"],
    toneWords:  ["morally urgent","raw","essential"],
    pacing:     "moderate",
    moodMap: {
      think:   "Hard to look away — morally urgent writing about a real crisis",
      feel:    "Emotionally gripping — this will make you feel things that matter",
      learn:   "One of the most illuminating novels about modern America written recently",
    },
  },
  3: {
    similarTo: ["The Martian","Ready Player One","Dark Matter","Recursion","Hitchhiker's Guide"],
    toneWords:  ["propulsive","clever","mind-bending"],
    pacing:     "fast",
    moodMap: {
      escape:  "A total escape — lone astronaut, impossible odds, relentless momentum",
      think:   "Hard science wrapped in a thriller — rewards intelligence on every page",
      laugh:   "Genuinely funny and clever — science fiction with real wit",
    },
  },
  4: {
    similarTo: ["The Nightingale","The Book Thief","All the Light","Pillars of the Earth","The Alice Network"],
    toneWords:  ["luminous","devastating","precise"],
    pacing:     "moderate",
    moodMap: {
      feel:    "Devastating in the best way — precise, luminous prose about war and loss",
      escape:  "WWII France — completely absorbing, alternating perspectives",
      unwind:  "Beautifully written, immersive — the kind of historical fiction that stays with you",
    },
  },
  5: {
    similarTo: ["A Gentleman in Moscow","Rules of Civility","The Remains of the Day","Lincoln in the Bardo"],
    toneWords:  ["elegant","witty","restrained"],
    pacing:     "moderate",
    moodMap: {
      escape:  "A beautifully constructed world — Towles's wit and restraint at their best",
      laugh:   "Sharp, funny, and full of personality — Towles writes like no one else",
      unwind:  "Elegant prose, unforgettable characters — very easy to lose yourself in",
    },
  },
  6: {
    similarTo: ["Thinking in Bets","Predictably Irrational","Blink","Nudge","The Power of Habit","Sapiens"],
    toneWords:  ["mind-expanding","rigorous","practical"],
    pacing:     "moderate",
    moodMap: {
      think:   "Every decision you make looks different after reading this — genuinely mind-expanding",
      learn:   "One of the most useful books written in decades — you will think differently",
      escape:  "The ideas here will follow you for weeks after you finish",
    },
  },
  // Phase 16 expansion
  7:  { similarTo:["Normal People","Conversations with Friends","One Day","Beautiful World","Attachments"], toneWords:["precise","restrained","contemporary"], pacing:"moderate" },
  8:  { similarTo:["Gone Girl","The Girl on the Train","Sharp Objects","Dark Places","Behind Closed Doors"], toneWords:["twisty","propulsive","dark"], pacing:"fast" },
  9:  { similarTo:["The Silent Patient","The Woman in the Window","Behind Closed Doors","The Couple Next Door"], toneWords:["taut","psychological","twisty"], pacing:"fast" },
  10: { similarTo:["Where the Crawdads Sing","Big Little Lies","Little Fires Everywhere","The Marsh King's Daughter"], toneWords:["atmospheric","propulsive","literary"], pacing:"moderate" },
  11: { similarTo:["Daisy Jones and The Six","The Seven Husbands","Malibu Rising","One True Loves"], toneWords:["cinematic","sweeping","emotional"], pacing:"fast" },
  12: { similarTo:["A Little Life","The Corrections","The Hours","Let the Great World Spin","The Goldfinch"], toneWords:["devastating","literary","essential"], pacing:"slow" },
  13: { similarTo:["Piranesi","Jonathan Strange","The Night Circus","Mexican Gothic","Babel"], toneWords:["original","mysterious","immersive"], pacing:"moderate" },
  14: { similarTo:["Tomorrow x3","The Interestings","The Marriage Plot","Freedom","Commonwealth"], toneWords:["ambitious","emotional","original"], pacing:"moderate" },
  15: { similarTo:["The Kite Runner","A Thousand Splendid Suns","Cutting for Stone","The God of Small Things","Pachinko"], toneWords:["redemptive","emotional","sweeping"], pacing:"moderate" },
  16: { similarTo:["Big Little Lies","Truly Madly Guilty","The Husband's Secret","Nine Perfect Strangers"], toneWords:["propulsive","sharp","domestic"], pacing:"fast" },
  17: { similarTo:["Educated","The Glass Castle","Hillbilly Elegy","Wild","Between the World and Me"], toneWords:["urgent","honest","remarkable"], pacing:"moderate" },
  18: { similarTo:["Rebecca","Jane Eyre","Wuthering Heights","The Little Stranger","Mexican Gothic"], toneWords:["atmospheric","gothic","gripping"], pacing:"moderate" },
  19: { similarTo:["Born a Crime","Between the World and Me","Just Kids","I Know Why the Caged Bird Sings"], toneWords:["funny","profound","essential"], pacing:"fast" },
  20: { similarTo:["The Great Gatsby","Tender is the Night","This Side of Paradise","Bright Lights Big City"], toneWords:["elegant","precise","American"], pacing:"fast" },
  21: { similarTo:["Animal Farm","1984","Brave New World","We","Lord of the Flies"], toneWords:["allegorical","sharp","essential"], pacing:"fast" },
  22: { similarTo:["Pachinko","The Covenant of Water","A Gentleman in Moscow","Snow Flower","The Kite Runner"], toneWords:["sweeping","generational","essential"], pacing:"slow" },
  23: { similarTo:["A Gentleman in Moscow","The Rules of Civility","Lincoln Highway","The Storied Life of AJ Fikry"], toneWords:["witty","warm","beautifully constructed"], pacing:"moderate" },
  24: { similarTo:["The Midnight Library","The Time Traveler's Wife","Before I Fall","Replay"], toneWords:["hopeful","imaginative","emotional"], pacing:"fast" },
  25: { similarTo:["Lessons in Chemistry","The Thursday Murder Club","Major Pettigrew's Last Stand","The Rosie Project"], toneWords:["witty","warm","funny"], pacing:"moderate" },
  26: { similarTo:["Hamnet","Wolf Hall","The Miniaturist","Girl with a Pearl Earring","Bring Up the Bodies"], toneWords:["lyrical","devastating","precise"], pacing:"slow" },
  27: { similarTo:["The Girl with the Dragon Tattoo","The Snowman","I am Pilgrim","The Spy who came in from the Cold"], toneWords:["atmospheric","intelligent","propulsive"], pacing:"fast" },
  28: { similarTo:["The Secret History","The Goldfinch","Donna Tartt","Brideshead Revisited","The Rules of Attraction"], toneWords:["rich","dark","literary"], pacing:"slow" },
  29: { similarTo:["The Old Man and the Sea","A Farewell to Arms","For Whom the Bell Tolls","The Sun Also Rises"], toneWords:["spare","essential","timeless"], pacing:"fast" },
  30: { similarTo:["Of Mice and Men","East of Eden","Grapes of Wrath","The Pearl","Cannery Row"], toneWords:["economic","emotional","essential"], pacing:"fast" },
  31: { similarTo:["Giovanni's Room","Go Tell It on the Mountain","Another Country","Maurice","The Well of Loneliness"], toneWords:["precise","devastating","beautiful"], pacing:"moderate" },
  32: { similarTo:["A Man Called Ove","Eleanor Oliphant","The Rosie Project","Major Pettigrew","The 100-Year-Old Man"], toneWords:["funny","heartwarming","unexpected"], pacing:"moderate" },
  33: { similarTo:["House in Cerulean Sea","Legends & Lattes","The House Witch","Piranesi","The Night Circus"], toneWords:["cozy","warm","magical"], pacing:"moderate" },
  34: { similarTo:["The Overstory","Braiding Sweetgrass","H is for Hawk","Underland","Entangled Life"], toneWords:["ambitious","urgent","beautiful"], pacing:"slow" },
  35: { similarTo:["Klara and the Sun","Never Let Me Go","The Remains of the Day","Machines Like Me"], toneWords:["quiet","devastating","philosophical"], pacing:"slow" },
  36: { similarTo:["In the Woods","The Likeness","Faithful Place","The Dublin Murder Squad","Broken Harbour"], toneWords:["atmospheric","literary","gripping"], pacing:"fast" },
  37: { similarTo:["The God of Small Things","The Inheritance of Loss","A Fine Balance","Arundhati Roy","Q&A"], toneWords:["lush","devastating","essential"], pacing:"slow" },
  38: { similarTo:["Verity","It Ends with Us","November 9","Ugly Love","Confess"], toneWords:["propulsive","twisty","emotional"], pacing:"fast" },
  39: { similarTo:["Remarkably Bright Creatures","A Man Called Ove","The One Hundred-Year-Old Man","The Unlikely Pilgrimage","Eleanor Oliphant"], toneWords:["warm","funny","unexpected"], pacing:"moderate" },
  40: { similarTo:["Lincoln in the Bardo","Cloud Atlas","The Hours","A Visit from the Goon Squad","Invisible Man"], toneWords:["inventive","profound","ambitious"], pacing:"slow" },
};

// Maps mood selection to a reason template when no personal signal exists
const MOOD_FALLBACKS = {
  escape:  (tone) => `${tone[0][0].toUpperCase()}${tone[0].slice(1)} and hard to put down — exactly what you're looking for right now`,
  think:   (tone) => `You'll close this with a different perspective — ${tone[0]} writing that stays with you`,
  feel:    (tone) => `You wanted something to feel — this has genuine emotional weight, not just sentiment`,
  learn:   (tone) => `You'll finish this knowing something you didn't — ${tone[2] || tone[0]} and practically useful`,
  laugh:   ()     => `Lighter in tone but not in quality — has real wit without sacrificing substance`,
  unwind:  (tone) => `${tone[0][0].toUpperCase()}${tone[0].slice(1)} and immersive — the kind of book you get lost in without trying`,
};

function stripHtml(str) {
  return (str || "").replace(/<[^>]+>/g, "");
}

// ── USER VOICE PROFILE SYSTEM ─────────────────────────────────────────────────
// The app's explanation language adapts to how the user reads and thinks.
// Voice is never labelled in the UI — it only affects word choice and rhythm.
//
// Detection uses available signals: saved books, rated books, mood, genre.
// Designed for future extension: multi-voice blending, adaptive shift over time.

const VOICE_PROFILES = {
  analytical: {
    description: "Precise, structured, evidence-based. No sentiment.",
    traits:      ["declarative", "data-adjacent", "efficient"],
  },
  literary: {
    description: "Appreciates prose craft. Clause-rich, quality-conscious.",
    traits:      ["craft-aware", "register-sensitive", "descriptive"],
  },
  emotional: {
    description: "Feeling-first. The reader's inner experience is paramount.",
    traits:      ["empathetic", "resonance-focused", "personal"],
  },
  fast: {
    description: "Hook-first. Short sentences. Momentum over analysis.",
    traits:      ["punchy", "action-led", "directional"],
  },
  curious: {
    description: "Insight-driven. Connects ideas. Exploratory and open.",
    traits:      ["idea-connecting", "exploratory", "observational"],
  },
};

// Voice-aware phrase templates, keyed by context type.
// Each key maps voice → string-producing function.
// To add a new voice or context: add an entry here.
const VOICE_PHRASES = {

  // Context: user saved a book that matches this book's affinity
  saved: {
    analytical: ({title})       => `You saved **${title}** — this one follows the same thread.`,
    literary:   ({title})       => `You'd probably stick with this. Same feel as **${title}**.`,
    emotional:  ({title})       => `This will land the same way **${title}** did.`,
    fast:       ({title})       => `You saved **${title}**. This feels like the next logical read.`,
    curious:    ({title})       => `You saved **${title}** — this connects to it in an interesting way.`,
  },

  // Context: user gave a matched book 4+ stars
  rated: {
    analytical: ({title, rating}) => `You gave **${title}** ${rating} stars. This has the same structure.`,
    literary:   ({title})         => `If **${title}** worked for you, this one should too.`,
    emotional:  ({title, rating}) => `${rating} stars on **${title}** — this one hits similarly.`,
    fast:       ({title, rating}) => `${rating} stars on **${title}**. Same energy. Different story.`,
    curious:    ({title})         => `You responded well to **${title}** — this follows a related thread.`,
  },

  // Context: genre filter is active
  genre: {
    analytical: ({genre})       => `One of the more rigorous ${genre} books out there.`,
    literary:   ({genre})       => `Strong ${genre} — the writing holds up.`,
    emotional:  ({genre})       => `This one earns its place in ${genre}.`,
    fast:       ({genre})       => `${genre}. Moves well. One of the better ones.`,
    curious:    ({genre})       => `Worth knowing about in ${genre} — not obvious, but genuinely good.`,
  },

  // Context: slow-paced book
  pacing_slow: {
    analytical: () => `Patient read. Rewards attention.`,
    literary:   () => `Takes its time — and the writing earns it.`,
    emotional:  () => `Slow build, but the payoff is real.`,
    fast:       () => `Slower than you usually reach for — but worth it.`,
    curious:    () => `Deliberate pace. What it's building toward justifies it.`,
  },

  // Context: fast-paced book
  pacing_fast: {
    analytical: () => `Moves fast. High signal, low drag.`,
    literary:   () => `Quick without sacrificing the writing — that's rare.`,
    emotional:  () => `Pulls you forward. The feeling hits before you expect it.`,
    fast:       () => `Hard to put down. You'll finish this in a weekend.`,
    curious:    () => `Unusually propulsive — the ideas don't suffer for the pace.`,
  },

  // Context: moderate-paced book
  pacing_moderate: {
    analytical: () => `Solid pacing. Never drags.`,
    literary:   () => `Well-calibrated. Doesn't rush, doesn't stall.`,
    emotional:  () => `Moves at the right pace to feel what it's building.`,
    fast:       () => `Good pacing throughout. Worth your time.`,
    curious:    () => `Steady — gives the ideas room to develop.`,
  },
};

// Resolve a voice phrase by context key and variable map.
// Fallback chain: requested voice → curious → null.
function voicePhrase(voice, key, vars = {}) {
  const group = VOICE_PHRASES[key];
  if (!group) return null;
  const fn = group[voice] || group.curious;
  return typeof fn === "function" ? fn(vars) : (fn || null);
}

// Detect the user's dominant voice profile from available signals.
// Scores each voice type, returns the highest scorer.
// Default: "curious" — the most open reading posture for new users.
//
// Extensibility note: to add blending, return the full scores object
// and use weighted interpolation across voice templates in voicePhrase.
// ── PHASE 6: INTELLIGENCE AND PATTERN LEARNING ────────────────────────────────
//
// Architecture:
//   BEHAVIORAL_ARCHETYPES  — seeded cluster centroids (replaced by ML in prod)
//   computeArchetype()     — assigns user to nearest behavioral cluster
//   trackOutcome()         — records what happened after a recommendation
//   detectIntervention()   — identifies when strategy should change
//   adaptUserState()       — adjusts downstream recommendation inputs
//   adaptVoice()           — adjusts tone based on engagement patterns
//
// All adaptation is invisible to the user. The app simply "gets better."
// No technical labels, cluster names, or ML language ever surfaces in UI.

// ── Behavioral archetypes — seeded priors, tuned from real data in production ──
// Each archetype represents a behavioral similarity cluster.
// Dimensions: pacing tolerance, completion rate, genre breadth, tone preference,
//             interaction depth, signal responsiveness.
const BEHAVIORAL_ARCHETYPES = [
  {
    id: "deep_finisher",
    // Reads slowly, finishes almost everything, prefers literary/emotional
    // Responds to: "takes its time", "rewards attention", long conviction pitches
    pacingTolerance: 0.85,    // 0=hates slow, 1=loves slow
    completionRate:  0.90,
    genreBreadth:    0.35,    // focused
    tonePreference:  "literary",
    signalPriority:  ["author_alert", "discussion"],
    pitchLength:     "long",
    voiceAdjust:     { literary: +0.3, emotional: +0.2 },
    interventionAt:  0.25,    // abandon rate that triggers intervention
  },
  {
    id: "fast_explorer",
    // Reads fast, abandons freely, tries many genres
    // Responds to: "hard to put down", "two sittings", short punchy pitches
    pacingTolerance: 0.20,
    completionRate:  0.55,
    genreBreadth:    0.85,
    tonePreference:  "fast",
    signalPriority:  ["momentum", "trending"],
    pitchLength:     "short",
    voiceAdjust:     { fast: +0.3, curious: +0.1 },
    interventionAt:  0.55,
  },
  {
    id: "literary_collector",
    // Slow reader, high taste, cares about editions and authors
    // Responds to: author news, rare copies, Pulitzer/Booker mentions
    pacingTolerance: 0.75,
    completionRate:  0.80,
    genreBreadth:    0.30,
    tonePreference:  "literary",
    signalPriority:  ["marketplace", "author_alert"],
    pitchLength:     "long",
    voiceAdjust:     { literary: +0.4, analytical: +0.1 },
    interventionAt:  0.20,
  },
  {
    id: "mood_driven",
    // Reading depends heavily on emotional state, inconsistent completion
    // Responds to: mood framing, "right for right now", empathetic tone
    pacingTolerance: 0.50,
    completionRate:  0.60,
    genreBreadth:    0.60,
    tonePreference:  "emotional",
    signalPriority:  ["discussion", "trending"],
    pitchLength:     "medium",
    voiceAdjust:     { emotional: +0.3, curious: +0.1 },
    interventionAt:  0.45,
  },
  {
    id: "analytical_reader",
    // Finishes non-fiction and ideas-driven books, skips emotion-heavy
    // Responds to: concrete claims, what you'll learn, specific insight
    pacingTolerance: 0.60,
    completionRate:  0.75,
    genreBreadth:    0.45,
    tonePreference:  "analytical",
    signalPriority:  ["author_alert", "discussion"],
    pitchLength:     "medium",
    voiceAdjust:     { analytical: +0.4, curious: +0.2 },
    interventionAt:  0.30,
  },
];

// ── Compute which archetype this user is closest to ──────────────────────────
function computeArchetype(behaviorModel, reactions, readBooks) {
  const totalBooks = readBooks.length || 1;
  const reactionValues = Object.values(reactions);

  // Derive behavioral dimensions from this user's actual data
  const abandonCount    = reactionValues.filter(r => r.reaction === "abandoned").length;
  const finishedCount   = reactionValues.filter(r => r.reaction === "finished" || r.reaction === "loved").length;
  const slowCount       = reactionValues.filter(r => r.reaction === "slow").length;
  const fastCount       = reactionValues.filter(r => r.reaction === "fast").length;
  const completionRate  = totalBooks > 0 ? finishedCount / Math.max(totalBooks, 1) : 0.5;
  const pacingTolerance = slowCount + fastCount > 0
    ? 1 - (fastCount / (slowCount + fastCount))
    : 0.5; // no signal → default to middle
  const genreBreadth    = readBooks.length > 0
    ? Math.min(1, new Set(readBooks.flatMap(b => b.tags || [])).size / 10)
    : 0.5;

  // Score each archetype by Euclidean distance (lower = closer)
  const scored = BEHAVIORAL_ARCHETYPES.map(a => {
    const d = Math.sqrt(
      Math.pow(a.pacingTolerance - pacingTolerance, 2) +
      Math.pow(a.completionRate  - completionRate,  2) +
      Math.pow(a.genreBreadth    - genreBreadth,    2)
    );
    return { archetype: a, distance: d };
  });

  scored.sort((a, b) => a.distance - b.distance);
  return scored[0].archetype;
}

// ── Outcome tracking ──────────────────────────────────────────────────────────
// Call this whenever something meaningful happens after a recommendation.
// outcomes: click | save | start | finish | abandon | skip
function createOutcomeTracker(setOutcomes) {
  return (bookId, outcome, context = {}) => {
    setOutcomes(prev => [
      ...prev.slice(-99), // keep last 100 outcomes
      { bookId, outcome, ts: Date.now(), context },
    ]);
  };
}

// ── Intervention detection ────────────────────────────────────────────────────
// Returns 0 (normal), 1 (simplify), 2 (reset)
function detectIntervention(reactions, outcomes, archetype) {
  if (!archetype) return 0;

  const recent = outcomes.slice(-10); // look at last 10 interactions
  const recentAbandons  = recent.filter(o => o.outcome === "abandon").length;
  const recentSkips     = recent.filter(o => o.outcome === "skip").length;
  const totalAbandons   = Object.values(reactions).filter(r => r.reaction === "abandoned").length;
  const totalFinished   = Object.values(reactions).filter(r => r.reaction === "finished" || r.reaction === "loved").length;
  const abandonRate     = (totalAbandons + totalFinished) > 0
    ? totalAbandons / (totalAbandons + totalFinished)
    : 0;

  // Consecutive recent abandons → escalate
  if (recentAbandons >= 4) return 2; // full reset: shorter books, new genre
  if (recentAbandons >= 2 || recentSkips >= 4) return 1; // simplify
  if (abandonRate > archetype.interventionAt && totalAbandons >= 3) return 1;
  return 0;
}

// ── Adaptive voice — adjusts voice scores based on engagement ────────────────
function adaptVoice(baseVoice, archetype, signalEngagements) {
  if (!archetype) return baseVoice;

  // If the archetype strongly suggests a different voice, blend toward it
  const archetypeVoice = archetype.tonePreference;

  // If user's signal engagement confirms the archetype, commit to it
  const engagementConfidence = Object.values(signalEngagements).reduce((sum, v) => sum + Math.abs(v), 0);

  // Low engagement data → stay with base voice
  if (engagementConfidence < 0.3) return baseVoice;

  // High confidence → blend toward archetype voice
  const voices = ["analytical","literary","emotional","fast","curious"];
  if (archetypeVoice !== baseVoice && engagementConfidence > 0.6) {
    // Return archetype voice if it's meaningfully different
    return archetypeVoice;
  }
  return baseVoice;
}

// ── Adaptive userState — mutates inputs to all downstream recommendation fns ──
function adaptUserState(userState, archetype, interventionLevel) {
  if (!archetype) return userState;

  const adapted = { ...userState };

  // Intervention level 1: simplify — boost fast-paced books
  if (interventionLevel === 1) {
    adapted._boostPacing = "fast"; // signal to buildDiscoverRows/buildFeedItems
    adapted._simplify = true;
  }

  // Intervention level 2: reset — clear genre filter, suggest fresh start
  if (interventionLevel === 2) {
    adapted._boostPacing = "fast";
    adapted._resetGenre = true;
    adapted._interventionNote = "You've had a rough streak — let's find something you'll actually finish.";
  }

  // Archetype-specific adjustments
  if (archetype.id === "fast_explorer") {
    adapted._preferredPacing = "fast";
  } else if (archetype.id === "deep_finisher" || archetype.id === "literary_collector") {
    adapted._preferredPacing = "slow";
  }

  return adapted;
}

// ──────────────────────────────────────────────────────────────────────────────

function getUserVoiceProfile(userState) {
  const { savedBooks = [], readBooks = [], mood = null, genre = null } = userState;

  const scores = { analytical:0, literary:0, emotional:0, fast:0, curious:0 };

  // ── Signals from saved books (have full tag data) ──
  const ANALYTICAL_TAGS = ["Psychology","Non-Fiction","Business","Self-Help","Philosophy","Biography"];
  const LITERARY_TAGS   = ["Literary Fiction","Historical","Essays"];
  const EMOTIONAL_TAGS  = ["Family Saga","Romance"];
  const FAST_TAGS       = ["Sci-Fi","Thriller","Mystery","True Crime","Fantasy"];

  for (const b of savedBooks) {
    const tags = b.tags || [];
    if (tags.some(t => ANALYTICAL_TAGS.includes(t))) scores.analytical += 2;
    if (tags.some(t => LITERARY_TAGS.includes(t)))   scores.literary   += 2;
    if (tags.some(t => EMOTIONAL_TAGS.includes(t)))  scores.emotional  += 1;
    if (tags.some(t => FAST_TAGS.includes(t)))       scores.fast       += 2;
  }

  // Genre diversity across saves → curious signal
  const uniqueTagsFromSaves = new Set(savedBooks.flatMap(b => b.tags || []));
  if (uniqueTagsFromSaves.size >= 4) scores.curious += 2;

  // ── Signals from read books — cross-reference with curated BOOKS for tags ──
  for (const rb of readBooks) {
    const match = BOOKS.find(b =>
      b.title.toLowerCase() === rb.title.toLowerCase() ||
      rb.title.toLowerCase().includes(b.title.toLowerCase().split(":")[0].toLowerCase())
    );
    if (!match) continue;
    const weight = (rb.rating || 3) >= 4 ? 2 : 1;
    if (match.tags.some(t => ANALYTICAL_TAGS.includes(t))) scores.analytical += weight;
    if (match.tags.some(t => LITERARY_TAGS.includes(t)))   scores.literary   += weight;
    if (match.tags.some(t => EMOTIONAL_TAGS.includes(t)))  scores.emotional  += weight;
    if (match.tags.some(t => FAST_TAGS.includes(t)))       scores.fast       += weight;
  }

  // ── Signals from mood ──
  const MOOD_SIGNALS = {
    think: { analytical:3 }, learn:  { analytical:2, curious:1 },
    feel:  { emotional:3  }, unwind: { literary:1,  emotional:1 },
    escape:{ fast:2       }, laugh:  { curious:2, fast:1       },
  };
  if (mood && MOOD_SIGNALS[mood]) {
    for (const [v, pts] of Object.entries(MOOD_SIGNALS[mood])) scores[v] += pts;
  }

  // ── Signals from genre filter ──
  const GENRE_SIGNALS = {
    "Psychology":       { analytical:3 }, "Business":    { analytical:2 },
    "Self-Help":        { analytical:2 }, "Philosophy":  { analytical:2, curious:1 },
    "Biography":        { analytical:1, literary:1 },
    "Literary Fiction": { literary:3   }, "Historical":  { literary:2 },
    "Essays":           { literary:2, curious:1 },
    "Romance":          { emotional:3  },
    "Sci-Fi":           { fast:2, curious:1 }, "Thriller": { fast:3 },
    "Mystery":          { fast:2, curious:1 }, "True Crime":{ fast:2, analytical:1 },
    "Fantasy":          { fast:1, curious:2 },
  };
  if (genre && GENRE_SIGNALS[genre]) {
    for (const [v, pts] of Object.entries(GENRE_SIGNALS[genre])) scores[v] += pts;
  }

  // No signals → default to curious
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  if (total === 0) return "curious";

  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}



/**
 * getRecommendationReason(book, userState, rowContext?)
 *
 * Priority order (unchanged from v16):
 *  1. Saved book affinity match        ← voice-aware
 *  2. Highly rated book affinity match ← voice-aware
 *  3. Mood + book-specific copy        (book-specific, not voice-varied)
 *  4. Mood + generic fallback          (mood-specific, not voice-varied)
 *  5. Genre filter active              ← voice-aware
 *  6. Row context                      (context-specific, not voice-varied)
 *  7. Reading history / pacing signal  ← voice-aware
 *  8. Curated HTML fallback            (editorial copy, not voice-varied)
 *
 * Voice is detected from userState via getUserVoiceProfile().
 * Never shown in UI — only affects word choice and sentence rhythm.
 */
function getRecommendationReason(book, userState = {}, rowContext = null) {
  const { savedBooks = [], readBooks = [], mood = null, genre = null } = userState;
  const meta      = BOOK_AFFINITY[book.id] || {};
  const toneWords = meta.toneWords || ["well-crafted", "compelling", "absorbing"];
  const similarTo = meta.similarTo || [];

  // Detect voice once at the top — used across all voice-aware branches below
  const voice = getUserVoiceProfile(userState);

  // Fuzzy title match: first word of each string is enough to connect books
  const titleMatch = (userTitle, targets) =>
    targets.some(t =>
      userTitle.toLowerCase().includes(t.toLowerCase().split(" ")[0]) ||
      t.toLowerCase().includes(userTitle.toLowerCase().split(" ")[0])
    );

  // 1. Saved book affinity match — voice-aware ─────────────────────────────
  for (const sb of savedBooks) {
    if (titleMatch(sb.title, similarTo)) {
      return voicePhrase(voice, "saved", { title: sb.title, tone: toneWords[0] });
    }
  }

  // 2. Highly rated book affinity match — voice-aware ──────────────────────
  const topRated = [...readBooks].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  for (const rb of topRated) {
    if ((rb.rating || 0) >= 4 && titleMatch(rb.title, similarTo)) {
      return voicePhrase(voice, "rated", { title: rb.title, rating: rb.rating, tone: toneWords[0] });
    }
  }

  // 3. Mood + book-specific copy ─────────────────────────────────────────────
  // Per-book moodMap entries are already precise — no voice variation needed.
  if (mood && meta.moodMap?.[mood]) {
    return meta.moodMap[mood];
  }

  // 4. Mood + generic fallback ───────────────────────────────────────────────
  // Mood-specific wording is already distinct enough — no voice variation.
  if (mood && MOOD_FALLBACKS[mood]) {
    return MOOD_FALLBACKS[mood](toneWords);
  }

  // 5. Genre filter active — voice-aware ────────────────────────────────────
  if (genre && book.tags.some(t => t.toLowerCase().includes(genre.toLowerCase()))) {
    return voicePhrase(voice, "genre", { genre, tone: toneWords[0] });
  }

  // 6. Row context — context-specific copy, not voice-varied ─────────────────
  if (rowContext) {
    if (rowContext === "fast-paced") {
      return meta.pacing === "fast" ? "Moves fast — this one you finish ahead of schedule" : "Picks up quickly and doesn't waste your time";
    }
    if (rowContext === "slow-burn literary") {
      return "Takes its time. Worth it.";
    }
    if (rowContext === "mind-expanding non-fiction") {
      return "You'll think about something differently after this. That's the point.";
    }
    if (rowContext.startsWith("Because you") || rowContext.includes("loved") || rowContext.includes("saved")) {
      return `Same ${toneWords[0]} feel — this feels like a natural next step`;
    }
  }

  // 7. Reading history signal — pacing-based, voice-aware ───────────────────
  if (readBooks.length >= 2) {
    const pacingKey = meta.pacing === "slow" ? "pacing_slow"
      : meta.pacing === "fast" ? "pacing_fast"
      : "pacing_moderate";
    return voicePhrase(voice, pacingKey, {});
  }

  // 8. Curated fallback — editorial copy, not voice-varied ──────────────────
  return stripHtml(book.why);
}

/**
 * getFavoriteBookPitch(book, userState, rowContext)
 *
 * Generates a 3-sentence persuasive paragraph for conviction surfaces:
 * hero wheel focus panel and desktop hover overlay.
 *
 * Structure:
 *   S1 — core appeal: what makes this book distinctive
 *   S2 — reading experience: what it actually delivers
 *   S3 — personal connection: why this reader specifically
 *
 * Voice-matched but subtle. No algorithmic language.
 * "If the books you love..." is fine. "Based on your taste" is not.
 */
function getFavoriteBookPitch(book, userState = {}) {
  const voice  = getUserVoiceProfile(userState);
  const meta   = BOOK_AFFINITY[book.id] || {};
  const pacing = meta.pacing || "moderate";
  const tags   = book.tags || [];
  const { readBooks = [] } = userState;

  // Deterministic pool pick — same book always gets same pitch
  const pick = (pool) => pool[book.id % pool.length];

  // Comparison anchor — highest-rated book the user has read
  const topRated = [...readBooks]
    .filter(b => (b.rating || 0) >= 4)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
  const anchor = topRated ? topRated.title.split(":")[0].trim() : null;

  // ── S1: Core appeal — what makes this book distinctive ──────────────────
  const isSciFi    = tags.includes("Sci-Fi") || tags.includes("Fantasy");
  const isThriller = tags.includes("Thriller") || tags.includes("Mystery") || tags.includes("True Crime");
  const isLit      = tags.includes("Literary Fiction") || tags.includes("Historical") || tags.includes("Essays");
  const isNf       = tags.some(t => ["Non-Fiction","Psychology","Self-Help","Business","Biography","Philosophy"].includes(t));
  const isEmotional= tags.includes("Family Saga") || tags.includes("Romance");

  let s1;
  if (isNf) s1 = pick([
    "This is the kind of non-fiction that changes the way you think about something you believed you already understood — the argument is specific, the evidence is concrete, and the conclusions are earned.",
    "The best non-fiction makes a complex subject feel clear without oversimplifying it, and this one does that — rigorously but readably.",
    "This manages to be genuinely useful and genuinely interesting at the same time, which is a harder combination to pull off than it sounds and rarer than it should be.",
  ]);
  else if (isSciFi) s1 = pick([
    "This has the propulsive problem-solving energy that makes the best science fiction hard to put down, without the jargon that slows lesser books.",
    "The core concept is genuinely original, and the execution keeps it moving — the ideas and the pacing work together instead of competing.",
    "This moves like a thriller and thinks like the best science fiction — the setup is clean, the problem is real, and the pages go fast.",
  ]);
  else if (isThriller) s1 = pick([
    "The tension here is built carefully and released at exactly the right moments — the kind of control that makes it genuinely difficult to set the book down.",
    "This compresses time — you look up and an hour has passed without you registering it, which is exactly what the best thrillers do.",
    "The pacing is a craft achievement: it accelerates when it should and pauses in the right places, which creates tension that feels real rather than mechanical.",
  ]);
  else if (isEmotional) s1 = pick([
    "The characters in this book feel lived in rather than constructed — they make choices that make sense for who they are, and the emotional turns feel earned rather than manufactured.",
    "This creates real attachment to people who do not exist, which is a difficult thing to do with any kind of honesty.",
    "The emotional intelligence here is confident, not manipulative — it knows what it wants you to feel and earns it rather than forcing it.",
  ]);
  else s1 = pick([
    "Few books manage to be this precise and this moving at the same time — the writing does exactly what it intends, and what it intends is genuinely ambitious.",
    "This is the kind of literary fiction that reminds you what the form is capable of — patient, specific, and quietly devastating.",
    "This earns its reputation — the kind of read that delivers on what the premise promises and then keeps going.",
  ]);

  // ── S2: Reading experience — what the pages actually feel like ──────────
  let s2;
  if (pacing === "fast" || isSciFi || isThriller) {
    s2 = pick([
      "It moves — the chapters do not overstay their welcome, which means you can read a large stretch without noticing how much time has passed.",
      "The structure never lets up, and that momentum is a genuine pleasure — this is a book you finish ahead of when you planned to.",
      "It earns its pace: nothing is rushed, but nothing is wasted, and the result is a reading experience that keeps its grip.",
    ]);
  } else if (pacing === "slow" || (isLit && !isThriller)) {
    s2 = pick([
      "It takes its time in the best way — the depth that builds slowly here is the kind that stays with you, not the kind that just delays the payoff.",
      "This rewards the attention you give it — the more you bring, the more it returns.",
      "The pace is deliberate and the investment is real, but so is the payoff — books this carefully constructed are rare.",
    ]);
  } else if (isNf) {
    s2 = pick([
      "This is a book you read with a pen — you keep finding things worth returning to, and the ideas compound as you go.",
      "The structure carries you forward even when the material is dense, which is exactly what good non-fiction writing is supposed to do.",
      "It respects your intelligence throughout, which means the conclusions land harder because you followed the full argument to get there.",
    ]);
  } else {
    s2 = pick([
      "The reading experience is smooth and confident — the author knows what they are building toward, and the structure reflects that clarity.",
      "This has the rare quality of feeling completely in control without ever feeling cold or calculated.",
      "Every element earns its place — the result is a book that feels neither overwritten nor rushed.",
    ]);
  }

  // ── S3: Personal connection — why this reader specifically ──────────────
  let s3;
  if (anchor) {
    // Use their actual reading history — most persuasive option
    s3 = pick([
      `If ${anchor} is in your short list of favorites, the sensibility here should feel immediately familiar in the best way.`,
      `Given how much you responded to ${anchor}, this has the qualities that likely made it land for you — just in a different setting.`,
    ]);
  } else if (voice === "analytical") {
    s3 = "If the books you return to are the ones that actually changed how you think about something, this has genuine potential to be one of those.";
  } else if (voice === "literary") {
    s3 = "If the books that stay with you are the ones where the writing itself is doing real work, this is a very strong fit.";
  } else if (voice === "emotional") {
    s3 = "If your favorite reads are the ones where you still think about the characters weeks after you finished — this delivers that.";
  } else if (voice === "fast") {
    s3 = "If you want a book that can take over a weekend and make it feel genuinely well spent, this is exactly that kind of read.";
  } else {
    s3 = pick([
      "If you want something that earns real staying power rather than just passing the time well, this is one of the stronger options available right now.",
      "This is the kind of book people recommend specifically, not generically — which is usually a reliable signal.",
    ]);
  }

  return `${s1} ${s2} ${s3}`;
}


const TASTE_LEVELS = [
  { min:0,  label:"New Reader",    emoji:"📖", next:3,  desc:"Rate 3 books to unlock your taste profile." },
  { min:3,  label:"Bookworm",      emoji:"🐛", next:7,  desc:"Your taste is starting to take shape." },
  { min:7,  label:"Lit Nerd",      emoji:"🧠", next:15, desc:"LitSense is learning your reading DNA." },
  { min:15, label:"Literary Twin", emoji:"✨", next:30, desc:"Recommendations are now deeply personal." },
  { min:30, label:"Book Oracle",   emoji:"🔮", next:null, desc:"You have achieved legendary reading taste." },
];

function getTasteLevel(count) {
  for (let i = TASTE_LEVELS.length - 1; i >= 0; i--) {
    if (count >= TASTE_LEVELS[i].min) return TASTE_LEVELS[i];
  }
  return TASTE_LEVELS[0];
}

// Detect top genres from highly-rated books in our curated list
function detectTopGenres(readBooks) {
  const counts = {};
  readBooks.filter(b => b.rating >= 4).forEach(rb => {
    const match = BOOKS.find(b => b.title.toLowerCase() === rb.title.toLowerCase());
    if (match) match.tags.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
  });
  return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([g])=>g);
}

// Build smart row title based on detected taste
function smartRowTitle(readBooks) {
  if (readBooks.length < 3) return null;
  const genres = detectTopGenres(readBooks);
  if (!genres.length) return null;
  const g = genres[0];
  const labels = {
    "Literary Fiction": "Because you love literary fiction",
    "Sci-Fi":           "For the science fiction fan in you",
    "Historical":       "History and atmosphere, your way",
    "Psychology":       "Because you love understanding people",
    "Thriller":         "Edge-of-your-seat reads you'll love",
  };
  return labels[g] || `Because you love ${g}`;
}

// ── DISCOVER ROW BUILDER ───────────────────────────────────────────────────────
// Generates multiple contextual rows for the Discover tab.
// Each row has a strong, specific title rather than a generic label.
// Rows adapt based on: savedBooks, readBooks, mood, genre, dismissedBooks.

const MOOD_ROWS = {
  escape: { title:"You want to disappear into a book — these will do it",  subtitle:"Absorbing from page one" },
  think:  { title:"You'll still be thinking about these days later",        subtitle:"Ideas that don't leave you alone" },
  feel:   { title:"You wanted something to feel — these deliver",           subtitle:"Emotional weight, earned" },
  learn:  { title:"You'll finish these knowing something you didn't",       subtitle:"Non-fiction worth the investment" },
  laugh:  { title:"Not everything has to be serious — and these prove it",  subtitle:"Wit and lightness, without sacrificing quality" },
  unwind: { title:"You want to slow down — these pull you in gently",       subtitle:"Immersive and low-pressure" },
};

const GENRE_ROW_TITLES = {
  "Literary Fiction": { title:"Literary fiction that earns its length",          subtitle:"Patient, precise, worth every page" },
  "Sci-Fi":           { title:"Smart sci-fi — ideas first, plot second",          subtitle:"No jargon barriers, just good thinking" },
  "Historical":       { title:"Historical fiction that puts you somewhere else",  subtitle:"Another place, another time, completely real" },
  "Psychology":       { title:"You want to understand how people actually work",  subtitle:"The most practically useful shelf in fiction" },
  "Thriller":         { title:"High tension, no filler — dark and propulsive",    subtitle:"The kind you finish in one sitting" },
  "Mystery":          { title:"Mystery fiction that respects your intelligence",  subtitle:"Character-led — never just a puzzle" },
  "Biography":        { title:"Real lives that read stranger than fiction",       subtitle:"You'll close these knowing someone deeply" },
  "Self-Help":        { title:"Self-help that actually earns the label",          subtitle:"Evidence-based — not optimism theater" },
  "Philosophy":       { title:"Philosophy written for people who read fiction",   subtitle:"Clearer and more urgent than you'd expect" },
};

function buildDiscoverRows(allBooks, userState) {
  const {
    savedBooks = [], readBooks = [], mood = null, genre = null, dismissedBooks = [],
    // STEP 3: intervention signals from adaptUserState
    _boostPacing, _resetGenre, _preferredPacing,
  } = userState;
  const available = allBooks.filter(b => !dismissedBooks.includes(b.id));
  if (available.length === 0) return [];

  const rows = [];
  const usedIds = new Set();

  const affinityMatch = (userTitle, targets = []) =>
    targets.some(t => {
      const tFirst = t.toLowerCase().split(/\s+/)[0];
      const uFirst = userTitle.toLowerCase().split(/\s+/)[0];
      return userTitle.toLowerCase().includes(tFirst) || t.toLowerCase().includes(uFirst);
    });

  // STEP 3: Intervention row — shown FIRST when user is in intervention state.
  // Language is invisible — no "we detected a problem". Just better picks.
  if (_boostPacing) {
    const pacingBooks = available.filter(b =>
      BOOK_AFFINITY[b.id]?.pacing === "fast" && !usedIds.has(b.id)
    );
    if (pacingBooks.length >= 1) {
      rows.push({
        id: "intervention-pacing",
        title: "Moves fast. Hard to put down.",
        subtitle: "Books that don't waste your time",
        books: pacingBooks,
        rowContext: "fast-paced",
      });
      pacingBooks.forEach(b => usedIds.add(b.id));
    }
  }

  // ── Row 1: PERSONALIZED — if user has saved or highly-rated books ──
  const topSaved = savedBooks[0];
  const topRated = [...readBooks].sort((a,b)=>(b.rating||0)-(a.rating||0)).find(b=>(b.rating||0)>=4);
  const anchor = topSaved || topRated;
  if (anchor) {
    const personalBooks = available.filter(b =>
      affinityMatch(anchor.title, BOOK_AFFINITY[b.id]?.similarTo)
    );
    if (personalBooks.length >= 1) {
      const verb = topSaved ? "saved" : "loved";
      const shortTitle = anchor.title.split(":")[0].split("—")[0].trim();
      rows.push({
        id: "personal",
        title: `Because you ${verb} ${shortTitle}`,
        subtitle: "Same tone, same craft — different story",
        books: personalBooks,
        rowContext: anchor.title,
      });
      personalBooks.forEach(b => usedIds.add(b.id));
    }
  }

  // ── Row 2: MOOD — if mood is active ──
  if (mood && MOOD_ROWS[mood]) {
    // Show all available books, reason engine will use mood signal
    rows.push({
      id: `mood-${mood}`,
      ...MOOD_ROWS[mood],
      books: available,
      rowContext: mood,
    });
  }

  // ── Row 3: GENRE — if genre filter is active ──
  if (genre) {
    const genreBooks = available.filter(b =>
      b.tags.some(t => t.toLowerCase().includes(genre.toLowerCase()))
    );
    if (genreBooks.length >= 1) {
      const genreMeta = GENRE_ROW_TITLES[genre] || {
        title: `The best ${genre} right now`,
        subtitle: "Handpicked for quality and craft",
      };
      rows.push({
        id: `genre-${genre}`,
        ...genreMeta,
        books: genreBooks,
        rowContext: genre,
      });
    }
  }

  // ── Row 4: CAN'T PUT DOWN ──
  const grippingBooks = available.filter(b =>
    b.tags.some(t => ["Gripping","Thriller","Psychological Thriller","Mystery","Crime"].includes(t)) ||
    BOOK_AFFINITY[b.id]?.pacing === "fast"
  );
  if (grippingBooks.length >= 2) {
    rows.push({
      id: "cant-put-down",
      title: "Can't Put Down",
      subtitle: "Books that take the weekend with them",
      books: grippingBooks.slice(0, 12),
      rowContext: "fast gripping",
      prompts: [
        { label:"Something fast", prompt:"I want something I genuinely can't put down this weekend. Fast-paced and gripping. What should I read?" },
        { label:"A thriller", prompt:"What's the best psychological thriller I haven't read? Be specific about why it's genuinely unsettling." },
      ],
    });
  }

  // ── Row 5: ACTUALLY WORTH READING ──
  const worthReading = available.filter(b =>
    b.tags.includes("Award Winner") || b.score >= 91
  );
  if (worthReading.length >= 2) {
    rows.push({
      id: "worth-reading",
      title: "Actually Worth Reading",
      subtitle: "Award winners and genuine standouts — not just bestsellers",
      books: worthReading.slice(0, 12),
      rowContext: "literary quality",
      prompts: [
        { label:"Something important", prompt:"What's a genuinely important book I should read — not just popular, but one that actually matters? Why?" },
        { label:"Something emotional", prompt:"I want something emotionally devastating. What's the most moving book you'd recommend and why?" },
      ],
    });
  }

  // ── Row 6: IF YOU LIKED… ──
  // Surfaces books with high cross-affinity to universally beloved titles
  const popularAnchors = ["Pachinko","The Kite Runner","Normal People","Gone Girl","A Gentleman in Moscow","Educated","A Little Life"];
  const ifYouLikedBooks = available.filter(b => {
    const aff = BOOK_AFFINITY[b.id];
    return aff?.similarTo?.some(s =>
      popularAnchors.some(a => s.toLowerCase().includes(a.toLowerCase().split(" ")[0]))
    );
  });
  if (ifYouLikedBooks.length >= 2) {
    rows.push({
      id: "if-you-liked",
      title: "If You Liked…",
      subtitle: "Books readers recommend when they loved Pachinko, Normal People, or Gone Girl",
      books: ifYouLikedBooks.slice(0, 12),
      rowContext: "affinity based",
    });
  }

  // ── Row 7: SOMETHING DIFFERENT ──
  const differentBooks = available.filter(b =>
    b.tags.includes("Unexpected") ||
    b.tags.some(t => ["Fantasy","Sci-Fi","Funny","Gothic"].includes(t))
  );
  if (differentBooks.length >= 2) {
    rows.push({
      id: "something-different",
      title: "Something Different",
      subtitle: "Surprising, cross-genre, and unlike anything in your current rotation",
      books: differentBooks.slice(0, 12),
      rowContext: "unexpected picks",
      prompts: [
        { label:"Something different", prompt:"I want something I'd never usually pick — a book that surprises me. What would you choose for me and why?" },
        { label:"Something funny", prompt:"What's the most genuinely funny literary novel worth reading? Not just light — actually funny writing." },
      ],
    });
  }

  // ── Row 8: QUICK READS ──
  const quickBooks = available.filter(b =>
    b.tags.includes("Quick Read") || b.tags.includes("Classics")
  );
  if (quickBooks.length >= 2) {
    rows.push({
      id: "quick-reads",
      title: "Quick Reads",
      subtitle: "Finished in a sitting — but not forgettable",
      books: quickBooks.slice(0, 10),
      rowContext: "short books",
      prompts: [
        { label:"Low commitment", prompt:"I have one evening. What's a short book I can finish tonight that will genuinely stay with me?" },
      ],
    });
  }

  // ── Row 9: WEEKEND READS — moderate pacing ──
  const weekendBooks = available.filter(b =>
    ["fast","moderate"].includes(BOOK_AFFINITY[b.id]?.pacing) &&
    !b.tags.includes("Quick Read")
  );
  if (weekendBooks.length >= 2) {
    rows.push({
      id: "weekend",
      title: "Good for a weekend",
      subtitle: "Propulsive enough to read in a few long sittings",
      books: weekendBooks.slice(0, 10),
      rowContext: "fast-paced",
    });
  }

  // ── Row 10: DEFAULT — always shown ──
  const smartTitle = smartRowTitle(readBooks);
  rows.push({
    id: "all",
    title: smartTitle || (readBooks.length >= 1 ? "More picks shaped around your taste" : "The full list"),
    subtitle: readBooks.length >= 1
      ? "Getting more accurate the more you rate"
      : "Forty books. Every one worth your time.",
    books: available,
    rowContext: null,
  });

  return rows.filter(r => r.books.length >= 1).slice(0, 8);
}

// ── FOR YOU FEED BUILDER ──────────────────────────────────────────────────────
// Scores every available book against current user signals, sorts by fit,
// then applies a light diversity pass to avoid same-pacing clusters.
function buildFeedItems(allBooks, userState) {
  const { savedBooks = [], readBooks = [], dismissedBooks = [], mood = null, genre = null } = userState;

  // Filter dismissed
  const available = allBooks.filter(b => !dismissedBooks.includes(b.id));

  // Fuzzy affinity match (same logic as getRecommendationReason)
  const hit = (userTitle, targets = []) =>
    targets.some(t =>
      userTitle.toLowerCase().includes(t.toLowerCase().split(" ")[0]) ||
      t.toLowerCase().includes(userTitle.toLowerCase().split(" ")[0])
    );

  // Score each book
  const scored = available.map(book => {
    let feedScore = book.score;
    const meta = BOOK_AFFINITY[book.id] || {};

    // Saved-book affinity → strong positive signal
    for (const sb of savedBooks) {
      if (hit(sb.title, meta.similarTo)) { feedScore += 22; break; }
    }

    // Rated-book affinity — weighted by stars
    const byRating = [...readBooks].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    for (const rb of byRating) {
      const stars = rb.rating || 0;
      if (stars >= 5 && hit(rb.title, meta.similarTo)) { feedScore += 18; break; }
      if (stars >= 4 && hit(rb.title, meta.similarTo)) { feedScore += 12; break; }
    }

    // Mood alignment
    if (mood && meta.moodMap?.[mood]) feedScore += 10;

    // Genre alignment
    if (genre && book.tags.some(t => t.toLowerCase().includes(genre.toLowerCase()))) feedScore += 7;

    return { ...book, feedScore };
  });

  // Sort by fit score
  scored.sort((a, b) => b.feedScore - a.feedScore);

  // Light diversity pass — avoid the same pacing more than twice in a row
  const result = [];
  const window = []; // rolling window of last 3 pacing values
  for (const book of scored) {
    const pacing = BOOK_AFFINITY[book.id]?.pacing || "moderate";
    const recentSame = window.filter(p => p === pacing).length;
    result.push(book); // always include — diversity only affects ordering
    window.push(pacing);
    if (window.length > 3) window.shift();
    // If this caused 3 same-pacing in a row, we just note it but don't exclude —
    // with small data sets exclusion would leave gaps. The sort already distributes well.
  }

  return result;
}

const MOODS = [
  { id:"escape", name:"Escape",  Icon:Sun        },
  { id:"think",  name:"Think",   Icon:Brain      },
  { id:"feel",   name:"Feel",    Icon:Heart      },
  { id:"learn",  name:"Learn",   Icon:Lightbulb  },
  { id:"laugh",  name:"Laugh",   Icon:Smile      },
  { id:"unwind", name:"Unwind",  Icon:Moon       },
];
const GENRES = ["Literary Fiction","Thriller","Mystery","Sci-Fi","Fantasy","Historical","Romance","Biography","Self-Help","Business","True Crime","Psychology","Philosophy","Essays"];

// ── BACKGROUND SYSTEM — intent-mapped, not genre-matched ─────────────────────
// Each image maps to a felt experience, not a category label.
// Selection uses explicit signals first (mood, genre filter) then
// derived signals (voice profile, screen context). Never random.
const BACKGROUNDS = {
  literary:     "/backgrounds/2y88r.jpg",   // immersive / literary     — candlelit bookshelves
  reflective:   "/backgrounds/zorEp.jpg",   // reflective / light       — open books, afternoon
  emotional:    "/backgrounds/laZvI.jpg",   // emotional / romantic     — flowers, warm fabric
  fantasy:      "/backgrounds/I6yup.jpg",   // fantasy / escapism       — quill, old maps, candles
  enchanted:    "/backgrounds/mLL3D.jpg",   // fantasy / escapism (alt) — glowing forest
  dark:         "/backgrounds/yAZGN.jpg",   // dark / mysterious        — foggy Victorian street
  fast:         "/backgrounds/2Xnwr.jpg",   // fast / gripping          — neon rain, wet city
  investigative:"/backgrounds/5YgWB.jpg",   // investigative            — desk, scattered papers
  analytical:   "/backgrounds/6XTvH.jpg",   // intellectual / analytical — blueprint gears
  cosmic:       "/backgrounds/chrBZ.jpg",   // intellectual / analytical — nebula, planets
};

function getBackgroundKey({ mood, adaptedVoice, genre, inAsk }) {
  // 1. Mood — most explicit, user-declared
  if (mood === "escape")   return "fantasy";
  if (mood === "feel")     return "emotional";
  if (mood === "think")    return "analytical";
  if (mood === "learn")    return "investigative";
  if (mood === "unwind")   return "reflective";

  // 2. Genre filter — explicit content signal
  if (genre === "Fantasy")                   return "enchanted";
  if (genre === "Sci-Fi")                    return "cosmic";
  if (genre === "Thriller" || genre === "True Crime") return "fast";
  if (genre === "Mystery")                   return "dark";
  if (genre === "Romance")                   return "emotional";
  if (genre === "Literary Fiction" || genre === "Essays" || genre === "Historical") return "literary";
  if (["Biography","Psychology","Philosophy","Self-Help","Business"].includes(genre)) return "analytical";

  // 3. Derived voice profile — from reading patterns
  if (adaptedVoice === "emotional") return "reflective";
  if (adaptedVoice === "analytical") return "analytical";
  if (adaptedVoice === "fast")       return "fast";
  if (adaptedVoice === "literary")   return "literary";

  // 4. Context — searching/asking implies investigation
  if (inAsk) return "investigative";

  return "literary"; // default: the library
}
const ASK_PROMPTS = [
  "I want something I genuinely can't put down this weekend.",
  "What should I read if I loved Pachinko?",
  "Something dark but not depressing.",
  "I've been in a slump. What pulls me back in?",
  "Surprise me — something I'd never pick but would love.",
  "Best thing you've seen people talking about lately.",
];

// ── SIGNAL MOMENTS — casual friend-style observations ──────────────────────────
// In production these would be live-fetched. For now seeded with real upcoming data.
// ── UNIFIED RANKING ENGINE ────────────────────────────────────────────────────
// The single pipeline that decides the one thing worth saying right now.
// Recommendations and signals compete in one shared scoring pass.
// Output: one Candidate object, or null.

const COOLDOWN_MS    = { signal: 6*60*60*1000, nudge: 4*60*60*1000, rec: 2*60*60*1000 };
const SURFACE_THRESH = { high: 0.35, normal: 0.45, low: 0.55, rec: 0.40 };
// FIX 1: Remove recency from WEIGHTS — it wasn't computed, just wasted weight
const SCORE_WEIGHTS  = { base: 0.35, context: 0.20, behavioral: 0.25, cluster: 0.15 };

function scoreRecCandidate(book, intel, reasonType) {
  const aff = book._affinity || BOOK_AFFINITY[book.id] || {};
  const voice = intel.voice_label || 'curious';
  const tags  = book.tags || [];
  let base = 0;

  // Pacing match
  const pacing = aff.pacing || 'moderate';
  const pp = intel.pacing_preference ?? 0.5;
  if (pacing === 'fast'     && pp < 0.40) base += 0.30;
  if (pacing === 'slow'     && pp > 0.65) base += 0.28;
  if (pacing === 'moderate')              base += 0.12;

  // Genre/voice match
  const genreMatch =
    (voice === 'literary'   && tags.some(t => ['Literary Fiction','Historical','Essays'].includes(t))) ||
    (voice === 'analytical' && tags.some(t => ['Non-Fiction','Psychology','Business','Philosophy'].includes(t))) ||
    (voice === 'emotional'  && tags.some(t => ['Family Saga','Romance'].includes(t))) ||
    (voice === 'fast'       && tags.some(t => ['Thriller','Sci-Fi','Mystery'].includes(t)));
  if (genreMatch) base += 0.25;

  // Editorial score as tiebreaker
  if (book.score) base += (book.score / 100) * 0.15;

  return Math.max(0, Math.min(1, base));
}

// FIX 3: Signal behavioral learning — use v_user_signal_learning data if available
function scoreSignalFinal(signal, intel, context) {
  let base = signal.relevance_score || signal.score || 0;

  // Priority multiplier — applied to base, not final, so context can still differentiate
  const priorityMult = { high: 1.20, normal: 1.00, low: 0.75 }[signal.priority || 'normal'];
  base *= priorityMult;
  base = Math.min(1, base); // cap before adding other components

  // FIX 4: cluster distance scaling fixed (was 1 - dist*2, could go negative)
  const clusterAdj = intel.cluster_rec_adjustments;
  const clusterWeight = Math.max(0, 1 - (intel.cluster_distance ?? 0.5)); // FIX 4
  let clusterBoost = 0;
  if (clusterAdj?.preferred_signal_types?.includes(signal.type)) {
    clusterBoost = 0.10 * clusterWeight;
  }

  // FIX 3: behavioral learning from v_user_signal_learning
  let behavioralBoost = 0;
  const signalLearning = context?.signalLearning?.[signal.signal_type || signal.type];
  if (signalLearning) {
    // conversation_rate 0.3 = neutral. Above = boost, below = penalty.
    behavioralBoost = (signalLearning.conversation_rate - 0.3) * 0.2;
  }

  return Math.max(0, Math.min(1, base + clusterBoost + behavioralBoost));
}

function contextBoost(candidate, context) {
  if (!context) return 0;
  const { mood, intent, readingState, hasUnresolvedThread } = context;
  let boost = 0;
  if (hasUnresolvedThread && candidate.kind === 'nudge') boost += 0.12;
  if (intent === 'next_book' && candidate.kind === 'rec')  boost += 0.10;
  if (intent === 'mid_book'  && candidate.kind === 'nudge') boost += 0.08;
  if (candidate.kind === 'signal' && (candidate.contextTags || []).length > 0) {
    const userCtx = [mood && `mood:${mood}`, readingState && `reading_state:${readingState}`].filter(Boolean);
    const matches = (candidate.contextTags || []).filter(t => userCtx.includes(t)).length;
    boost += Math.min(0.15, matches * 0.05);
  }
  if (candidate.kind === 'rec' && mood) {
    const moodMap = (BOOK_AFFINITY[candidate.book?.id] || {}).moodMap || {};
    if (moodMap[mood]) boost += 0.10;
  }
  return boost;
}

function interventionBias(candidate, level, failedGenres = []) {
  if (level === 0) return 0;
  let delta = 0;
  if (candidate.kind === 'rec') {
    const pacing = (BOOK_AFFINITY[candidate.book?.id] || {}).pacing || 'moderate';
    const overlap = (candidate.book?.tags || []).some(t => failedGenres.includes(t));
    if (level >= 1) {
      if (pacing === 'fast') delta += 0.15;
      if (pacing === 'slow') delta -= 0.20;
      if (overlap)           delta -= 0.15;
    }
    if (level >= 2) {
      if (pacing === 'fast') delta += 0.10;
      if (pacing === 'slow') delta -= 0.15;
    }
  }
  if (candidate.kind === 'nudge' && candidate.isIntervention) delta += 0.25;
  return delta;
}

function withCooldown(candidates, lastSurfaced = []) {
  const now = Date.now();
  return candidates.map(c => {
    const recent = (lastSurfaced)
      .filter(ls => ls.kind === c.kind && ls.type === c.type)
      .sort((a, b) => b.ts - a.ts)[0];
    if (!recent) return c;
    const elapsed = now - recent.ts;
    const cd = COOLDOWN_MS[c.kind] || COOLDOWN_MS.rec;
    if (elapsed < cd) return { ...c, finalScore: c.finalScore - 0.30 * (1 - elapsed/cd) };
    return c;
  });
}

function pickWinner(candidates) {
  return candidates
    .filter(c => {
      const thresh = c.kind === 'signal'
        ? (SURFACE_THRESH[c.priority] || SURFACE_THRESH.normal)
        : SURFACE_THRESH.rec;
      return c.finalScore >= thresh;
    })
    .sort((a, b) => b.finalScore - a.finalScore)[0] || null;
}

function enforceTwo(text) {
  if (!text) return text;
  const s = text.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [text];
  return s.slice(0, 2).join('').trim();
}

function recMessage(book, intel, context) {
  const voice  = intel.voice_label || 'curious';
  const aff    = BOOK_AFFINITY[book.id] || {};
  const pacing = aff.pacing || 'moderate';
  const tone   = aff.toneWords?.[0] || '';
  const title  = book.title?.split(':')[0] || book.title;
  const moodMsg = context?.mood && aff.moodMap?.[context.mood];

  const TMPL = {
    literary:   { fast: `${title} moves — rare for writing this careful.`,          slow: `${title} is patient, but it earns it.`,              moderate: `${title} is ${tone} — probably more your speed.` },
    fast:       { fast: `${title}. Hard to put down. Seriously.`,                    slow: `${title} takes its time — heads up.`,               moderate: `${title} — solid pacing, worth the time.` },
    analytical: { fast: `${title} — propulsive, ${tone}. High signal.`,              slow: `${title} rewards sustained attention.`,              moderate: `${title} is ${tone}. Likely a strong fit.` },
    emotional:  { fast: `${title} moves fast but the emotional core hits hard.`,     slow: `${title} is slow getting there. The feeling is real.`, moderate: `${title} — you'd probably feel this one.` },
    curious:    { fast: `${title} is unusually propulsive for something this good.`, slow: `${title} — slow build, but worth following.`,        moderate: `${title} follows a thread worth pulling.` },
  };
  const msg = moodMsg
    ? `${moodMsg.split('.')[0]}.`
    : ((TMPL[voice] || TMPL.curious)[pacing] || (TMPL[voice] || TMPL.curious).moderate);

  return {
    msg: enforceTwo(msg),
    cta: 'Tell me more',
    prompt: `Tell me about "${book.title}" by ${book.author}. Is it right for me based on what I've been reading?`,
  };
}

function doRankAndSurface({ intel, signalCandidates=[], recCandidates=[], nudge=null, context={}, lastSurfaced=[], failedGenres=[] }) {
  const level = intel.current_intervention_level || 0;
  const all = [];

  // FIX 2: Recs — normalized formula: base*w + ctx*w + behavioral*w + cluster*w + bias
  for (const { book, reasonType } of recCandidates) {
    const base         = scoreRecCandidate(book, intel, reasonType);
    const ctx          = contextBoost({ kind:'rec', book }, context);
    const bias         = interventionBias({ kind:'rec', book }, level, failedGenres);
    // Behavioral: not yet wired from DB — zero until v_user_behavioral_signals is fetched
    const behavioral   = 0;
    const clusterBoost = 0; // cluster adjustments already in scoreRecCandidate
    const finalScore   = Math.min(1, Math.max(0,
      base       * SCORE_WEIGHTS.base +
      ctx        * SCORE_WEIGHTS.context +
      behavioral * SCORE_WEIGHTS.behavioral +
      clusterBoost * SCORE_WEIGHTS.cluster +
      bias
    ));
    const m = recMessage(book, intel, context);
    all.push({ id: String(book.id), kind:'rec', type: reasonType, baseScore: base, finalScore, ...m, book });
  }

  // FIX 2: Signals — same normalized formula
  for (const signal of signalCandidates) {
    const base       = scoreSignalFinal(signal, intel, context); // FIX 3 behavioral inside
    const ctx        = contextBoost({ kind:'signal', contextTags: signal.context_tags||[], priority: signal.priority_level }, context);
    const bias       = interventionBias({ kind:'signal' }, level, failedGenres);
    const finalScore = Math.min(1, Math.max(0,
      base * SCORE_WEIGHTS.base +
      ctx  * SCORE_WEIGHTS.context +
      // behavioral already inside scoreSignalFinal via signalLearning
      bias
    ));
    const msg = enforceTwo(signal.msg || signal.message_shown || '');
    all.push({
      id: String(signal.signal_id||signal.id), kind:'signal',
      type: signal.signal_type||signal.type, priority: signal.priority_level||signal.priority,
      contextTags: signal.context_tags||[], baseScore: base, finalScore,
      msg, cta: signal.cta||'Tell me more', prompt: signal.prompt||'', signal,
    });
  }

  // FIX 2 + 5: Nudge — same pattern, lower base so context does the work
  if (nudge) {
    const isIntervention = level >= 1;
    // FIX 5: lower base, rely on contextBoost and interventionBias to lift when warranted
    const base       = isIntervention ? 0.75 : 0.50;
    const ctx        = contextBoost({ kind:'nudge', contextTags:[] }, context);
    const bias       = interventionBias({ kind:'nudge', isIntervention }, level, failedGenres);
    const finalScore = Math.min(1, Math.max(0,
      base * SCORE_WEIGHTS.base +
      ctx  * SCORE_WEIGHTS.context +
      bias
    ));
    all.push({
      id:'nudge', kind:'nudge', type:'friend_nudge', baseScore: base, finalScore,
      msg: enforceTwo(nudge.msg||''), cta: nudge.cta||'Tell me',
      prompt: nudge.prompt||'', isIntervention, nudge,
    });
  }

  const winner = pickWinner(withCooldown(all, lastSurfaced));

  // FIX 6: Fallback — never return null if we have books to recommend
  if (!winner) {
    const fallbackBook = recCandidates[0]?.book;
    if (fallbackBook) {
      const m = recMessage(fallbackBook, intel, context);
      return {
        id: String(fallbackBook.id), kind:'rec', type:'fallback',
        baseScore: 0.40, finalScore: 0.40,
        ...m, book: fallbackBook,
        _isFallback: true,
      };
    }
    return null;
  }

  return winner;
}

// ── PUBLIC API — matches the external ranking-engine.js interface ─────────────
// rankAndSurface: external-facing alias for doRankAndSurface with normalized params
function rankAndSurface({ intelligence, signalCandidates, recCandidates, behavioral, context, lastSurfaced, recentlyFailedGenres }) {
  // COMPANION FIRST: if user has a current book, that's always the most important thing.
  // Surface a check-in about it before any recommendation or signal.
  if (context?.currentBook) {
    const title = context.currentBook.split(":")[0].trim();
    const shortTitle = title.split(" ").slice(0, 5).join(" ");
    return {
      id: "current-book-checkin",
      kind: "nudge",
      type: "companion_checkin",
      finalScore: 1.0,
      msg: `How's ${shortTitle} going?`,
      cta: "Tell me",
      prompt: `I'm currently reading "${context.currentBook}". Ask me how it's going — I want to talk about it.`,
    };
  }

  return doRankAndSurface({
    intel:            intelligence      || {},
    signalCandidates: signalCandidates  || [],
    recCandidates:    recCandidates     || [],
    nudge:            null,
    context:          context           || {},
    lastSurfaced:     lastSurfaced      || [],
    failedGenres:     recentlyFailedGenres || [],
  });
}

// logOutcome: routes outcome logging to the correct system (signal vs rec)
function logOutcome(candidate, outcome, handlers = {}) {
  if (!candidate) return;
  const { recordSignalEngagement, trackOutcome, setDismissedSignals } = handlers;
  if (candidate.kind === 'signal') {
    const engaged = outcome === 'tapped';
    recordSignalEngagement?.(candidate.type, engaged);
    if (outcome === 'dismissed' && candidate.id) {
      setDismissedSignals?.(prev => [...prev, candidate.id]);
    }
  }
  if (candidate.kind === 'rec' && candidate.book) {
    const outcomeMap = { tapped:'clicked', dismissed:'dismissed', shown:'seen', ignored:'ignored' };
    trackOutcome?.(candidate.book.id, outcomeMap[outcome] || 'seen');
  }
}
//   SIGNAL_CORPUS        — raw signals (what happened in the world)
//   scoreSignal()        — ranks each signal against this user's state
//   relationshipFilter() — "would a smart friend actually mention this?"
//   renderSignalMsg()    — writes the message in the user's learned tone
//   rankSignals()        — sorts, filters, returns the one signal to show
//
// In production: SIGNAL_CORPUS would be fetched from a live feed API.
// The scoring/filtering/rendering engine stays exactly as built here.

const SIGNAL_CORPUS = [
  // ── Author alerts ───────────────────────────────────────────────────────────
  {
    id: "s_everett_new",
    type: "author_alert",
    author: "Percival Everett",
    relatedTitles: ["James","The Trees","Erasure","So Much Blue"],
    recency: 0.95, // 0–1, how fresh this is
    source: "publisher",  // "instagram" | "publisher" | "press" | "marketplace" | "discussion"
    sourceDetail: "publisher announcement",
    templates: {
      finished_loved:  () => `Percival Everett has a new book coming. His publisher just announced it — given how James landed for you, you'll want to get ahead of this one.`,
      finished:        () => `Percival Everett is working on something new. Publisher confirmed it. Worth knowing.`,
      saved:           () => `That Percival Everett you saved — he's got another one coming. Might be worth reading the first before this drops.`,
      default:         () => `Percival Everett has a new book announced. If you've been curious about him, now's a good time to start.`,
    },
    cta: "Tell me more",
    prompt: "Tell me about Percival Everett's upcoming book. What should I expect based on his recent work?",
    interruptThreshold: 0.55, // only show if relevance score exceeds this
    signalTypes: ["author_alert"],
  },
  {
    id: "s_whitehead_new",
    type: "author_alert",
    author: "Colson Whitehead",
    relatedTitles: ["The Nickel Boys","Zone One","The Intuitionist","Harlem Shuffle"],
    recency: 0.80,
    source: "press",
    sourceDetail: "interview",
    templates: {
      finished_loved:  () => `Colson Whitehead mentioned in an interview he's working on something new. No title yet. Thought you'd want to know.`,
      finished:        () => `Colson Whitehead has a new book in progress — came up in an interview recently.`,
      default:         () => `Colson Whitehead is working on something new. If you haven't read him yet, good time to start.`,
    },
    cta: "What should I read while I wait?",
    prompt: "What should I read while I wait for Colson Whitehead's next book? Something with a similar feel.",
    interruptThreshold: 0.50,
    signalTypes: ["author_alert"],
  },
  {
    id: "s_hannah_women",
    type: "author_alert",
    author: "Kristin Hannah",
    relatedTitles: ["The Women","The Nightingale","Firefly Lane","The Great Alone"],
    recency: 0.70,
    source: "discussion",
    sourceDetail: "book communities",
    templates: {
      finished_loved:  () => `The Women is getting talked about a lot again — saw it on several book accounts this week. Did you want to revisit it?`,
      saved:           () => `The Women is getting another wave of attention. You saved it — might be the right moment.`,
      default:         () => `The Women by Kristin Hannah is getting talked about again. Worth knowing if you're into that kind of read.`,
    },
    cta: "Is it right for me?",
    prompt: "Is The Women by Kristin Hannah right for my taste? Give me an honest take.",
    interruptThreshold: 0.45,
    signalTypes: ["trending", "author_alert"],
  },

  // ── Discussion spikes ───────────────────────────────────────────────────────
  {
    id: "s_james_discussion",
    type: "discussion",
    author: "Percival Everett",
    relatedTitles: ["James"],
    recency: 0.75,
    source: "discussion",
    sourceDetail: "book communities",
    templates: {
      finished_loved:  () => `James is getting a second wave of attention — people who read it are recommending it hard. That one stuck with you, right?`,
      finished:        () => `People are talking about James again. You read it — worth joining that conversation?`,
      saved:           () => `James keeps coming up in book discussions this week. You saved it — maybe now's the time.`,
      default:         () => `James by Percival Everett keeps coming up. If you haven't read it, people seem to think it's worth it.`,
    },
    cta: "What's the conversation about?",
    prompt: "What are people saying about James by Percival Everett? What's the conversation around it right now?",
    interruptThreshold: 0.40,
    signalTypes: ["discussion"],
  },
  {
    id: "s_pachinko_discussion",
    type: "discussion",
    author: "Min Jin Lee",
    relatedTitles: ["Pachinko","Free Food for Millionaires"],
    recency: 0.60,
    source: "discussion",
    sourceDetail: "reading communities",
    templates: {
      finished_loved:  () => `That Pachinko discussion is still going. People keep coming back to it — something about that book doesn't let go.`,
      finished:        () => `Pachinko is getting talked about again. You finished it — still think about it?`,
      default:         () => `Pachinko keeps coming up in book discussions. If you haven't read it, people clearly think it matters.`,
    },
    cta: "Why is it still being talked about?",
    prompt: "Why does Pachinko keep coming up in book discussions? What is it about that book that people can't let go of?",
    interruptThreshold: 0.45,
    signalTypes: ["discussion"],
  },

  // ── Marketplace ─────────────────────────────────────────────────────────────
  {
    id: "s_pachinko_marketplace",
    type: "marketplace",
    author: "Min Jin Lee",
    relatedTitles: ["Pachinko"],
    recency: 0.90,
    source: "marketplace",
    sourceDetail: "AbeBooks",
    templates: {
      finished_loved:  () => `A signed first edition of Pachinko just showed up on AbeBooks. Given how much you responded to it — thought you'd want to know before it's gone.`,
      finished:        () => `A first edition of Pachinko just appeared on AbeBooks. Rare. Thought you'd want to know.`,
      saved:           () => `A first edition of Pachinko showed up on AbeBooks — you saved it, so figured this was worth a mention.`,
      default:         () => `A first edition of Pachinko just appeared on AbeBooks. If you're into collecting, this one's notable.`,
    },
    cta: "Tell me about it",
    prompt: "Tell me about the publishing history of Pachinko and why a first edition might be significant.",
    interruptThreshold: 0.60, // marketplace signals need higher relevance to interrupt
    signalTypes: ["marketplace"],
  },

  // ── Momentum picks ──────────────────────────────────────────────────────────
  {
    id: "s_momentum_literary",
    type: "momentum",
    relatedTitles: [], // not title-gated — taste-based
    tasteMatch: ["literary","emotional"], // only show to these voice profiles
    recency: 0.65,
    source: "discussion",
    sourceDetail: "literary communities",
    templates: {
      default: () => `A book called James by Percival Everett keeps coming up in literary circles. Won the Pulitzer last year — people are still talking about it.`,
    },
    cta: "Is it for me?",
    prompt: "Tell me about James by Percival Everett. Would it fit my taste?",
    interruptThreshold: 0.35,
    signalTypes: ["momentum"],
  },
];

// ── Signal scoring engine ──────────────────────────────────────────────────────
function scoreSignal(signal, userState, reactions, signalEngagements) {
  const { readBooks = [], savedBooks = [], voice, mood } = userState;
  const allTitles = [...readBooks, ...savedBooks].map(b => b.title.toLowerCase());
  const allAuthors = [...readBooks, ...savedBooks].map(b => (b.author||"").toLowerCase());

  let score = 0;

  // 1. Author relationship — has the user read this author?
  const authorMatch = signal.author && allAuthors.some(a =>
    a.includes((signal.author||"").split(" ").pop().toLowerCase())
  );
  if (authorMatch) score += 0.35;

  // 2. Title relationship — has the user read a related title?
  const titleMatch = (signal.relatedTitles||[]).some(t =>
    allTitles.includes(t.toLowerCase())
  );
  if (titleMatch) score += 0.30;

  // 3. Reaction quality — did they finish/love it?
  const relatedReaction = Object.entries(reactions).find(([bookId, r]) => {
    const book = [...readBooks, ...savedBooks].find(b => String(b.id) === bookId);
    if (!book) return false;
    return (signal.relatedTitles||[]).some(t => t.toLowerCase() === book.title.toLowerCase());
  });
  if (relatedReaction) {
    const [, {reaction}] = relatedReaction;
    if (reaction === "loved" || reaction === "finished") score += 0.25;
    if (reaction === "abandoned" || reaction === "too slow") score -= 0.15;
  }

  // 4. Taste alignment — voice profile match
  if (signal.tasteMatch && signal.tasteMatch.includes(voice)) score += 0.20;

  // 5. Recency — fresher signals score higher
  score += (signal.recency || 0.5) * 0.15;

  // 6. Signal type engagement — has the user responded to this type before?
  const typeEngagement = (signalEngagements[signal.type] || 0);
  score += typeEngagement * 0.10;

  // 7. FIX 2: Context boost — treat as additive, not binary filter.
  //    If the signal's context tags match current user state, boost score.
  //    mood is the primary context signal available client-side right now.
  if (signal.contextTags && signal.contextTags.length > 0) {
    const userContext = [
      mood && `mood:${mood}`,
      readBooks.length > 0 && "reading_state:has_history",
    ].filter(Boolean);
    const contextMatch = signal.contextTags.some(tag => userContext.includes(tag));
    if (contextMatch) score += 0.10; // boost, not gate
  }

  // 8. FIX 3: Marketplace — softer floor so strong signals survive.
  //    Old: return 0.15 (too aggressive — killed strong relationship signals).
  //    New: halve the score proportionally. Strong signals stay viable.
  if (signal.type === "marketplace" && typeEngagement <= 0) {
    score = Math.max(0.25, score * 0.5);
  }

  return Math.max(0, Math.min(1, score));
}

// ── Relationship filter — "would a smart friend mention this?" ────────────────
function passesRelationshipFilter(signal, score, userState) {
  // Must clear the signal's own interrupt threshold
  if (score < signal.interruptThreshold) return false;
  // Marketplace: only show if user has read the related book
  if (signal.type === "marketplace") {
    const allTitles = [...(userState.readBooks||[]), ...(userState.savedBooks||[])]
      .map(b => b.title.toLowerCase());
    return (signal.relatedTitles||[]).some(t => allTitles.includes(t.toLowerCase()));
  }
  return true;
}

// ── Message renderer — tone-matched, max two sentences ───────────────────────
// FIX 5: two-sentence hard guardrail applied after template selection.
// Signals should sound like a text from a friend — not a paragraph.
function enforceMaxTwoSentences(text) {
  if (!text) return text;
  // Split on sentence-ending punctuation followed by space or end-of-string
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [text];
  return sentences.slice(0, 2).join("").trim();
}

function renderSignalMsg(signal, userState, reactions) {
  const { readBooks = [], savedBooks = [] } = userState;
  const allTitles = [...readBooks, ...savedBooks].map(b => b.title.toLowerCase());

  const hasRead = (signal.relatedTitles||[]).some(t => allTitles.includes(t.toLowerCase()));
  const hasSaved = (signal.relatedTitles||[]).some(t =>
    savedBooks.map(b => b.title.toLowerCase()).includes(t.toLowerCase())
  );

  const relatedReaction = Object.entries(reactions).find(([bookId, r]) => {
    const book = [...readBooks, ...savedBooks].find(b => String(b.id) === bookId);
    return book && (signal.relatedTitles||[]).some(t => t.toLowerCase() === book.title.toLowerCase());
  });
  const reaction = relatedReaction?.[1]?.reaction;

  const t = signal.templates;
  let raw;
  if (reaction === "loved" && t.finished_loved) raw = t.finished_loved();
  else if ((reaction === "finished" || hasRead) && t.finished) raw = t.finished();
  else if (hasSaved && t.saved) raw = t.saved();
  else raw = t.default();

  // FIX 5: cap at two sentences — always
  return enforceMaxTwoSentences(raw);
}

// ── Main ranking function ─────────────────────────────────────────────────────
// FIX 1: signals are stratified by priority before ranking.
// The caller receives three buckets and decides when to show each.
// high   → show immediately, even mid-session
// normal → show on next Discover open
// low    → show only if no high/normal signal exists

function rankSignals({ corpus, userState, reactions, dismissedSignals, signalEngagements }) {
  const scored = corpus
    .filter(s => !dismissedSignals.includes(s.id))
    .map(s => {
      const score = scoreSignal(s, userState, reactions, signalEngagements);
      const passes = passesRelationshipFilter(s, score, userState);
      const msg = renderSignalMsg(s, userState, reactions);
      return { ...s, score, passes, msg };
    })
    .filter(s => s.passes)
    .sort((a, b) => b.score - a.score);

  // Stratify by priority level
  const high   = scored.filter(s => s.priority === "high");
  const normal = scored.filter(s => !s.priority || s.priority === "normal");
  const low    = scored.filter(s => s.priority === "low");

  return { high, normal, low, top: high[0] || normal[0] || low[0] || null };
}

// Reaction types tracked per book
const REACTION_TYPES = {
  finished:  { label:"Finished it",     emoji:"✓",  color:"var(--sage)" },
  loved:     { label:"Loved it",         emoji:"★",  color:"var(--gold)" },
  abandoned: { label:"Stopped reading",  emoji:"✗",  color:"var(--rust)" },
  slow:      { label:"Felt slow",        emoji:"⏸",  color:"var(--muted)" },
  fast:      { label:"Couldn't put down",emoji:"⚡", color:"var(--gold)" },
};
const PRO_FEATURES = [
  { Icon:BookOpen,      title:"Unlimited reading advisor",    desc:"Ask anything about books, anytime, without limits." },
  { Icon:Library,       title:"Complete shelf history",       desc:"Track every book you've ever read, rated, or loved." },
  { Icon:Sparkles,      title:"Deep taste analysis",          desc:"Maps your reading DNA and surfaces your patterns." },
  { Icon:Bookmark,      title:"Want-to-read intelligence",    desc:"Tells you which book on your list to read first." },
  { Icon:MessageCircle, title:"Book club mode",               desc:"Discussion questions for any book." },
  { Icon:BookMarked,    title:"Author alerts",                desc:"New releases from authors you love, as they drop." },
];
const AI_SYSTEM = `You are LitSense — a reading intelligence with real taste and a clear point of view. Not an assistant. Not a chatbot. You read widely, you have opinions, and you give them.

When someone is mid-book: ask about that book first. Show genuine interest — not as a feature, but because it matters. "Did it pick up?" "What lost you?" Follow the thread of what they've already said.

When recommending: name one book. Make the case for it in a sentence or two. Be specific — tone, what it does well, why it fits this person now. Don't hedge. Don't offer alternatives unless asked. A strong pick stated plainly carries more weight than three options with qualifiers.

Voice:
- Calm, direct, slightly opinionated.
- Write like someone who reads a lot and talks like a person.
- Never: "based on your preferences," "you might enjoy," "you may like," "great question," or any phrasing that sounds like a product.
- Instead: "Read this." "This one fits." "If [X] worked for you, [Y] will too."
- Short. Precise. Let the recommendation do the work.

Format: **bold** titles and author names. Prose only. Ask one question at most — only when you actually need the answer to say something useful.`;

const today = () => new Date().toISOString().slice(0,10);

// ── BOOK MENTION DETECTION ────────────────────────────────────────────────────
// Scans user messages for phrases like "I've read X", "I finished X", "I read X"
// Returns { title, author } if a book is detected, null otherwise.
// Author is extracted if "by Author" follows the title.
function detectBookMention(text) {
  if (!text) return null;

  // Bail immediately if the message looks like a question or request
  const SKIP = [
    /should i/i, /can i/i, /if i loved/i, /if i like/i,
    /recommend/i, /suggest/i, /find me/i, /what should/i, /what would/i,
  ];
  if (SKIP.some(p => p.test(text))) return null;

  // Use RegExp constructor to keep patterns on one line without escaping issues
  const T = "([\\w][^,\\.!?]{2,58}?)"; // title capture: 3-60 chars
  const B = "([^,\\.!?]{2,38})";       // by-author capture
  const BY = `(?:\\s+by\\s+${B})?`;
  const END = "(?:[,\\.!?]|$)";

  const patterns = [
    new RegExp(`(?:^|[.!?] )i(?:'ve| have) (?:read|finished|completed) ["\u201c]?${T}["\u201d]?${BY}${END}`, "i"),
    new RegExp(`(?:^|[.!?] )i (?:just |recently )?finished ["\u201c]?${T}["\u201d]?${BY}${END}`, "i"),
    new RegExp(`(?:^|[.!?] )i (?:just |recently )?read ["\u201c]?${T}["\u201d]?${BY}${END}`, "i"),
    new RegExp(`\\b(?:finished|completed|just read) ["\u201c]([\\w][^"\u201d]{2,58})["\u201d]${BY}`, "i"),
  ];

  const STOPLIST = new Set(["it","that","this","the book","a book","one","something","another","it again","that one"]);

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const title = match[1]?.trim();
      const author = match[2]?.trim() || "";
      if (title && title.length >= 3 && !STOPLIST.has(title.toLowerCase())) {
        return { title, author };
      }
    }
  }
  return null;
}


function renderAI(text) {
  return text.split("\n").map((line, i) => {
    if (/^#{1,3} /.test(line))               return <h4 key={i}>{line.replace(/^#{1,3} /,"")}</h4>;
    if (/^\*\*[^*]+\*\*$/.test(line.trim())) return <h4 key={i}>{line.trim().slice(2,-2)}</h4>;
    if (/^[-•] /.test(line))                 return <li key={i}>{fmtLine(line.slice(2))}</li>;
    if (!line.trim())                        return <br key={i}/>;
    return <p key={i} style={{marginBottom:3}}>{fmtLine(line)}</p>;
  });
}
function fmtLine(t) {
  return t.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((p,i) => {
    if (p.startsWith("**")&&p.endsWith("**")) return <strong key={i}>{p.slice(2,-2)}</strong>;
    if (p.startsWith("*") &&p.endsWith("*"))  return <em key={i}>{p.slice(1,-1)}</em>;
    return p;
  });
}

// ── REASON BLOCK — reusable "Why this was recommended" display ───────────────
// Used in TileModal and any detail surface.
function ReasonBlock({ reason, style = {} }) {
  if (!reason) return null;
  return (
    <div className="ls-why-block" style={style}>
      <div className="ls-why-label">Why this was recommended</div>
      <div className="ls-why-reason">{fmtLine(reason)}</div>
    </div>
  );
}

// ── RECOMMENDATION WHEEL — cinematic arc hero ─────────────────────────────────
// Polish pass v16: tighter snap, controlled inertia, stronger visual hierarchy.
// ── BOOK SCENE ILLUSTRATIONS ──────────────────────────────────────────────────
// One atmospheric SVG scene per book.
// Dark engraving / woodcut style — barely-there, literary, not decorative.
// Crossfades when the active wheel book changes.

const BOOK_SCENES = {
  // The Covenant of Water — Kerala backwaters, blazing sunset, palm silhouettes
  1: ({ opacity }) => (
    <svg viewBox="0 0 390 320" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",opacity}}>
      <defs>
        <linearGradient id="s1sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a0800"/>
          <stop offset="40%" stopColor="#8B3000" stopOpacity="0.9"/>
          <stop offset="75%" stopColor="#d4601a" stopOpacity="0.7"/>
          <stop offset="100%" stopColor="#0d0805"/>
        </linearGradient>
        <radialGradient id="s1sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffcc44" stopOpacity="0.95"/>
          <stop offset="40%" stopColor="#e87020" stopOpacity="0.6"/>
          <stop offset="100%" stopColor="#c84010" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="s1glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff8822" stopOpacity="0.5"/>
          <stop offset="100%" stopColor="#ff4400" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect width="390" height="320" fill="url(#s1sky)"/>
      {/* Horizon glow */}
      <ellipse cx="195" cy="180" rx="300" ry="80" fill="#c04010" opacity="0.35"/>
      {/* Sun */}
      <ellipse cx="195" cy="168" rx="80" ry="80" fill="url(#s1glow)"/>
      <ellipse cx="195" cy="168" rx="30" ry="30" fill="url(#s1sun)"/>
      <circle cx="195" cy="168" r="16" fill="#ffe070" opacity="0.9"/>
      {/* Sun reflection on water */}
      <ellipse cx="195" cy="252" rx="12" ry="40" fill="#ffaa30" opacity="0.55"/>
      <ellipse cx="195" cy="270" rx="30" ry="20" fill="#ff8820" opacity="0.22"/>
      {/* Water surface — flat, dark, reflective */}
      <rect x="0" y="196" width="390" height="124" fill="#080502" opacity="0.88"/>
      {/* Water shimmer lines */}
      {[204,212,220,228,236,244,252,260,268,278].map((y,i)=>(
        <line key={i} x1={20+i*5} y1={y} x2={370-i*5} y2={y}
          stroke="#d4601a" strokeOpacity={0.07+i*0.012} strokeWidth="1.5"/>
      ))}
      {/* Palm tree silhouettes — stark black against fire sky */}
      {[18,52,90,140,250,300,340,375].map((x,i)=>{
        const h=55+Math.sin(i*0.9)*22; const lean=(i%2===0?-1:1)*0.12;
        return (
          <g key={i} transform={`translate(${x},${192+Math.sin(i)*6})`}>
            <line x1="0" y1="0" x2={lean*h} y2={-h} stroke="#0a0604" strokeWidth={3-i*0.15} strokeLinecap="round"/>
            {[-40,-25,-10,5,20,35,50].map((a,j)=>(
              <line key={j} x1={lean*h} y1={-h}
                x2={lean*h+Math.sin((a+j*2)*Math.PI/180)*26}
                y2={-h-Math.cos((a+j*2)*Math.PI/180)*16}
                stroke="#0a0604" strokeWidth="2" strokeLinecap="round" opacity="0.95"/>
            ))}
          </g>
        );
      })}
      {/* Boat silhouette */}
      <path d="M148 218 Q195 206 242 218 L250 230 Q195 240 140 230 Z" fill="#0a0604"/>
      <line x1="195" y1="192" x2="195" y2="218" stroke="#0a0604" strokeWidth="2.5"/>
      <path d="M195 192 L218 208 L195 210 Z" fill="#0a0604"/>
      {/* Cabin warm light */}
      <ellipse cx="195" cy="218" rx="5" ry="3" fill="#ffaa30" opacity="0.5"/>
    </svg>
  ),

  // Demon Copperhead — Appalachian night, coal fire, dark ridgeline
  2: ({ opacity }) => (
    <svg viewBox="0 0 390 320" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",opacity}}>
      <defs>
        <linearGradient id="s2sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#050208"/>
          <stop offset="55%" stopColor="#1a0a0e"/>
          <stop offset="100%" stopColor="#0a0204"/>
        </linearGradient>
        <radialGradient id="s2fire" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff6600" stopOpacity="0.9"/>
          <stop offset="50%" stopColor="#cc2200" stopOpacity="0.5"/>
          <stop offset="100%" stopColor="#880000" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="s2ember" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff9900" stopOpacity="1"/>
          <stop offset="100%" stopColor="#ff3300" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect width="390" height="320" fill="url(#s2sky)"/>
      {/* Stars — sparse and cold */}
      {[[30,18],[75,8],[130,22],[195,6],[250,14],[310,20],[355,10],[15,40],[370,38]].map(([x,y],i)=>(
        <circle key={i} cx={x} cy={y} r={i%3===0?1.5:0.8} fill="#e0d8f0" opacity={0.35+i*0.04}/>
      ))}
      {/* Distant ridge layers */}
      <path d="M0 155 Q55 132 110 148 Q170 125 230 142 Q290 122 390 136 L390 320 L0 320Z" fill="#110608"/>
      <path d="M0 178 Q45 158 95 172 Q155 150 215 166 Q275 148 335 164 Q365 156 390 160 L390 320 L0 320Z" fill="#0d0406"/>
      {/* Near ridge — main silhouette */}
      <path d="M0 208 Q40 186 80 200 Q140 178 200 196 Q260 176 320 192 Q355 184 390 188 L390 320 L0 320Z" fill="#080204"/>
      {/* Tree line — dead and skeletal */}
      {[8,28,48,65,82,100,120,142,162,182,205,228,250,272,295,318,342,365].map((x,i)=>{
        const h=24+Math.abs(Math.sin(i*1.1))*20; const y=186+Math.sin(i*0.6)*9;
        return (
          <g key={i}>
            <line x1={x} y1={y} x2={x} y2={y-h} stroke="#080204" strokeWidth="2.2" strokeLinecap="round"/>
            <line x1={x} y1={y-h*0.6} x2={x-8} y2={y-h*0.8} stroke="#080204" strokeWidth="1.4" strokeLinecap="round"/>
            <line x1={x} y1={y-h*0.6} x2={x+7} y2={y-h*0.75} stroke="#080204" strokeWidth="1.4" strokeLinecap="round"/>
            <line x1={x} y1={y-h*0.82} x2={x-5} y2={y-h} stroke="#080204" strokeWidth="1" strokeLinecap="round"/>
          </g>
        );
      })}
      {/* Coal fire glow — low on ridge, menacing */}
      <ellipse cx="110" cy="196" rx="55" ry="28" fill="url(#s2fire)"/>
      <ellipse cx="110" cy="196" rx="12" ry="8" fill="url(#s2ember)"/>
      <ellipse cx="110" cy="193" rx="5" ry="4" fill="#ffcc00" opacity="0.8"/>
      {/* Second distant fire */}
      <ellipse cx="305" cy="188" rx="28" ry="14" fill="#cc2200" opacity="0.28"/>
      <ellipse cx="305" cy="188" rx="6" ry="4" fill="#ff6600" opacity="0.6"/>
      {/* Lone figure silhouette on ridge */}
      <rect x="193" y="178" width="4" height="16" rx="1" fill="#060102"/>
      <ellipse cx="195" cy="176" rx="4" ry="4" fill="#060102"/>
    </svg>
  ),

  // Project Hail Mary — deep space, brilliant nebula, spacecraft beacon
  3: ({ opacity }) => (
    <svg viewBox="0 0 390 320" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",opacity}}>
      <defs>
        <radialGradient id="s3neb1" cx="65%" cy="38%" r="55%">
          <stop offset="0%" stopColor="#2244cc" stopOpacity="0.7"/>
          <stop offset="45%" stopColor="#441188" stopOpacity="0.4"/>
          <stop offset="100%" stopColor="#020408" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="s3neb2" cx="25%" cy="70%" r="45%">
          <stop offset="0%" stopColor="#cc4422" stopOpacity="0.5"/>
          <stop offset="55%" stopColor="#882211" stopOpacity="0.2"/>
          <stop offset="100%" stopColor="#020408" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="s3star1" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffeeaa" stopOpacity="1"/>
          <stop offset="30%" stopColor="#ffcc44" stopOpacity="0.7"/>
          <stop offset="100%" stopColor="#ffaa00" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="s3star2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#aaccff" stopOpacity="1"/>
          <stop offset="40%" stopColor="#6688ff" stopOpacity="0.6"/>
          <stop offset="100%" stopColor="#224488" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect width="390" height="320" fill="#010206"/>
      {/* Nebula clouds */}
      <ellipse cx="255" cy="122" rx="200" ry="140" fill="url(#s3neb1)"/>
      <ellipse cx="98" cy="220" rx="160" ry="120" fill="url(#s3neb2)"/>
      {/* Dense star field */}
      {Array.from({length:80},(_,i)=>({
        x:(i*47+13)%390, y:(i*83+7)%320,
        r:i%8===0?2:i%4===0?1.2:0.6,
        o:0.2+(i%7)*0.1
      })).map((s,i)=>(
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#f0ecff" opacity={s.o}/>
      ))}
      {/* Tau Ceti — warm yellow star */}
      <ellipse cx="292" cy="68" rx="60" ry="60" fill="url(#s3star1)"/>
      <circle cx="292" cy="68" r="10" fill="#ffe080" opacity="0.95"/>
      <circle cx="292" cy="68" r="5" fill="#ffffff" opacity="0.9"/>
      {/* Eridani — blue-white companion */}
      <ellipse cx="98" cy="218" rx="40" ry="40" fill="url(#s3star2)"/>
      <circle cx="98" cy="218" r="7" fill="#c0d8ff" opacity="0.95"/>
      <circle cx="98" cy="218" r="3" fill="#ffffff" opacity="0.9"/>
      {/* Spacecraft */}
      <g transform="translate(185 155) rotate(-18)">
        <rect x="-9" y="-32" width="18" height="62" rx="5" fill="#1a2238" stroke="#2a3858" strokeWidth="1.2"/>
        <path d="M-7 30 Q-12 42 -14 54 L14 54 Q12 42 7 30Z" fill="#141828"/>
        <ellipse cx="0" cy="54" rx="12" ry="6" fill="#4466ee" opacity="0.7"/>
        <ellipse cx="0" cy="60" rx="7" ry="10" fill="#6688ff" opacity="0.4"/>
        <ellipse cx="0" cy="66" rx="4" ry="8" fill="#99aaff" opacity="0.25"/>
        <rect x="-30" y="-6" width="21" height="10" rx="2" fill="#162040" stroke="#1e3060" strokeWidth="0.8"/>
        <rect x="9" y="-6" width="21" height="10" rx="2" fill="#162040" stroke="#1e3060" strokeWidth="0.8"/>
        {[2,6,10,14].map(dx=>(<line key={dx} x1={-30+dx} y1="-6" x2={-30+dx} y2="4" stroke="#1e3060" strokeWidth="0.7"/>))}
        <ellipse cx="0" cy="-20" rx="5" ry="4" fill="#203050" opacity="0.9"/>
        <ellipse cx="0" cy="-20" rx="2.5" ry="2" fill="#7090c0" opacity="0.7"/>
      </g>
    </svg>
  ),

  // All the Light We Cannot See — Saint-Malo, dramatic searchlights over sea
  4: ({ opacity }) => (
    <svg viewBox="0 0 390 320" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",opacity}}>
      <defs>
        <linearGradient id="s4sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#04040c"/>
          <stop offset="60%" stopColor="#0c0c1e"/>
          <stop offset="100%" stopColor="#060816"/>
        </linearGradient>
        <radialGradient id="s4beam1" cx="50%" cy="0%" r="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="s4beacon" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95"/>
          <stop offset="30%" stopColor="#e8e0d0" stopOpacity="0.6"/>
          <stop offset="100%" stopColor="#c8b870" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect width="390" height="320" fill="url(#s4sky)"/>
      {/* Stars */}
      {[[28,18],[72,12],[148,8],[205,20],[268,10],[332,16],[358,28],[14,42],[378,36]].map(([x,y],i)=>(
        <circle key={i} cx={x} cy={y} r={i%3===0?1.4:0.8} fill="#e8e4f8" opacity={0.3+i*0.04}/>
      ))}
      {/* Searchlight beams — crisscrossing the sky */}
      <polygon points="188,214 180,0 196,0 196,214" fill="url(#s4beam1)" opacity="0.5"/>
      <polygon points="230,210 310,0 330,0 248,210" fill="url(#s4beam1)" opacity="0.3"/>
      <polygon points="155,212 60,0 80,0 168,212" fill="url(#s4beam1)" opacity="0.25"/>
      {/* Sea — dark and menacing */}
      <rect x="0" y="236" width="390" height="84" fill="#040810" opacity="0.95"/>
      {/* Wave crests */}
      {[242,254,266,278,290].map((y,i)=>(
        <path key={i} d={`M0 ${y} Q${50+i*8} ${y-6} ${100+i*4} ${y} Q${160+i*6} ${y+5} ${210+i*3} ${y} Q${268+i*5} ${y-6} ${320+i*2} ${y} Q${360+i*3} ${y+4} 390 ${y}`}
          fill="none" stroke="#1a2844" strokeOpacity={0.45-i*0.06} strokeWidth="1.2"/>
      ))}
      {/* City wall / ramparts */}
      <path d="M0 228 L28 228 L28 216 L44 216 L44 228 L68 228 L68 212 L84 212 L84 228 L118 228 L118 218 L132 218 L132 228 L390 228 L390 320 L0 320Z" fill="#0a0814"/>
      {/* Saint-Malo buildings */}
      {[[38,168,20,60],[85,152,18,76],[128,166,22,62],[174,146,25,82],[215,160,20,68],[260,144,24,84],[302,158,22,70],[342,150,26,78],[372,162,18,66]].map(([x,y,w,h],i)=>(
        <g key={i}>
          <rect x={x-w/2} y={y} width={w} height={h} fill="#08060e" stroke="#120a1c" strokeWidth="0.5"/>
          <polygon points={`${x-w/2} ${y} ${x} ${y-18} ${x+w/2} ${y}`} fill="#060408"/>
          {i%3===0 && <rect x={x-5} y={y+h*0.4} width="9" height="12" rx="1" fill="#d4941a" opacity="0.28"/>}
          {i%4===1 && <rect x={x-4} y={y+h*0.6} width="8" height="10" rx="1" fill="#d4941a" opacity="0.18"/>}
        </g>
      ))}
      {/* Radio tower */}
      <line x1="192" y1="52" x2="192" y2="228" stroke="#140a20" strokeWidth="3.5"/>
      {[90,120,152,186].map((y,i)=>{const w=10+i*7;return <line key={i} x1={192-w} y1={y} x2={192+w} y2={y} stroke="#140a20" strokeWidth="1.8"/>;} )}
      <line x1="192" y1="90" x2="132" y2="224" stroke="#140a20" strokeOpacity="0.5" strokeWidth="0.9"/>
      <line x1="192" y1="90" x2="252" y2="224" stroke="#140a20" strokeOpacity="0.5" strokeWidth="0.9"/>
      {/* Tower beacon */}
      <ellipse cx="192" cy="52" rx="50" ry="50" fill="url(#s4beacon)"/>
      <circle cx="192" cy="52" r="5" fill="#ffffff" opacity="0.9"/>
    </svg>
  ),

  // The Lincoln Highway — vast starry plains, lone headlights, Milky Way
  5: ({ opacity }) => (
    <svg viewBox="0 0 390 320" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",opacity}}>
      <defs>
        <linearGradient id="s5sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#020408"/>
          <stop offset="60%" stopColor="#080c18"/>
          <stop offset="85%" stopColor="#141008"/>
          <stop offset="100%" stopColor="#080604"/>
        </linearGradient>
        <radialGradient id="s5moon" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f0e8d8" stopOpacity="0.9"/>
          <stop offset="50%" stopColor="#d8c8a0" stopOpacity="0.5"/>
          <stop offset="100%" stopColor="#c0a860" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="s5head" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffe8a0" stopOpacity="0.9"/>
          <stop offset="100%" stopColor="#ffe8a0" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect width="390" height="320" fill="url(#s5sky)"/>
      {/* Milky Way — bright diagonal band */}
      <ellipse cx="195" cy="130" rx="360" ry="65" fill="#1a2050" opacity="0.55" transform="rotate(-22 195 130)"/>
      <ellipse cx="195" cy="125" rx="280" ry="38" fill="#2030a0" opacity="0.22" transform="rotate(-22 195 125)"/>
      {/* Dense stars */}
      {Array.from({length:70},(_,i)=>({
        x:(i*61+17)%390, y:(i*43+9)%210,
        r:i%10===0?2.2:i%5===0?1.4:0.7,
        o:0.25+(i%8)*0.08
      })).map((s,i)=>(
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#f0eeff" opacity={s.o}/>
      ))}
      {/* Moon */}
      <ellipse cx="318" cy="48" rx="44" ry="44" fill="url(#s5moon)"/>
      <circle cx="318" cy="48" r="14" fill="#f0e8d0" opacity="0.7"/>
      <circle cx="318" cy="48" r="8" fill="#f8f2e4" opacity="0.6"/>
      {/* Flat horizon */}
      <rect x="0" y="222" width="390" height="98" fill="#050402"/>
      {/* Road — vanishing point */}
      <path d="M152 320 L172 222 L218 222 L238 320Z" fill="#0f0e0a"/>
      <path d="M152 320 L172 222 L174 222 L154 320Z" fill="#e8e0c0" opacity="0.08"/>
      <path d="M236 320 L218 222 L220 222 L238 320Z" fill="#e8e0c0" opacity="0.08"/>
      {/* Center line dashes */}
      {[232,252,272,292,310].map((y,i)=>(
        <rect key={i} x="191" y={y} width="7" height="15" rx="1" fill="#d4941a" opacity="0.35"/>
      ))}
      {/* Car headlights — far away */}
      <ellipse cx="192" cy="228" rx="22" ry="5" fill="url(#s5head)"/>
      <circle cx="188" cy="226" r="3" fill="#ffe880" opacity="0.85"/>
      <circle cx="196" cy="226" r="3" fill="#ffe880" opacity="0.85"/>
      {/* Telephone poles */}
      {[55,125,265,335].map((x,i)=>(
        <g key={i}>
          <line x1={x} y1="175" x2={x} y2="270" stroke="#0a0806" strokeWidth="3"/>
          <line x1={x-16} y1="184" x2={x+16} y2="184" stroke="#0a0806" strokeWidth="1.8"/>
          <line x1={x-11} y1="196" x2={x+11} y2="196" stroke="#0a0806" strokeWidth="1.8"/>
          <line x1={x} y1="184" x2="195" y2="224" stroke="#0a0806" strokeOpacity="0.4" strokeWidth="0.6"/>
        </g>
      ))}
    </svg>
  ),

  // Thinking Fast and Slow — two minds, neural sparks, abstract intelligence
  6: ({ opacity }) => (
    <svg viewBox="0 0 390 320" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",opacity}}>
      <defs>
        <radialGradient id="s6warm" cx="28%" cy="55%" r="55%">
          <stop offset="0%" stopColor="#cc6600" stopOpacity="0.55"/>
          <stop offset="60%" stopColor="#882200" stopOpacity="0.2"/>
          <stop offset="100%" stopColor="#060402" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="s6cool" cx="72%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#2244cc" stopOpacity="0.55"/>
          <stop offset="60%" stopColor="#112288" stopOpacity="0.2"/>
          <stop offset="100%" stopColor="#020408" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="s6spark" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffcc44" stopOpacity="0.9"/>
          <stop offset="100%" stopColor="#ffcc44" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect width="390" height="320" fill="#04040a"/>
      {/* Two ambient brain hemispheres */}
      <ellipse cx="108" cy="168" rx="210" ry="190" fill="url(#s6warm)"/>
      <ellipse cx="282" cy="152" rx="210" ry="190" fill="url(#s6cool)"/>
      {/* Dividing line — faint */}
      <line x1="195" y1="0" x2="195" y2="320" stroke="#e0d0c0" strokeOpacity="0.06" strokeWidth="1.5"/>
      {/* System 1 — intuitive curves, warm */}
      {[0,1,2,3,4].map(i=>(
        <path key={i} d={`M${35+i*9} ${55+i*12} Q${78+i*14} ${118+i*9} ${48+i*11} ${190+i*7} Q${28+i*7} ${252+i*5} ${72+i*9} ${300}`}
          fill="none" stroke="#cc6622" strokeOpacity={0.22-i*0.03} strokeWidth={2.2-i*0.3}/>
      ))}
      {/* System 1 nodes */}
      {[[52,85],[38,138],[72,186],[45,244],[88,285]].map(([x,y],i)=>(
        <g key={i}>
          <circle cx={x} cy={y} r="4" fill="#cc6622" opacity={0.45+i*0.05}/>
          <circle cx={x} cy={y} r="8" fill="#cc6622" opacity={0.12}/>
        </g>
      ))}
      {/* System 1 connections */}
      {[[52,85,38,138],[38,138,72,186],[72,186,45,244],[45,244,88,285]].map(([x1,y1,x2,y2],i)=>(
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#cc5511" strokeOpacity="0.2" strokeWidth="1.2"/>
      ))}
      {/* System 2 — geometric, cool */}
      {[0,1,2,3,4].map(i=>(
        <g key={i}>
          <line x1={228+i*20} y1={48+i*6} x2={248+i*16} y2={162+i*9} stroke="#2244cc" strokeOpacity={0.22-i*0.03} strokeWidth={2-i*0.25}/>
          <line x1={248+i*16} y1={162+i*9} x2={232+i*18} y2={282+i*5} stroke="#2244cc" strokeOpacity={0.18-i*0.02} strokeWidth={2-i*0.25}/>
        </g>
      ))}
      {/* System 2 nodes */}
      {[[325,72],[348,132],[315,188],[340,242],[320,285]].map(([x,y],i)=>(
        <g key={i}>
          <circle cx={x} cy={y} r="4" fill="#4466ee" opacity={0.45+i*0.05}/>
          <circle cx={x} cy={y} r="8" fill="#4466ee" opacity="0.12"/>
        </g>
      ))}
      {/* System 2 connections */}
      {[[325,72,348,132],[348,132,315,188],[315,188,340,242],[340,242,320,285]].map(([x1,y1,x2,y2],i)=>(
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2244cc" strokeOpacity="0.2" strokeWidth="1.2"/>
      ))}
      {/* Convergence spark */}
      <ellipse cx="195" cy="162" rx="45" ry="45" fill="url(#s6spark)"/>
      <circle cx="195" cy="162" r="6" fill="#ffe860" opacity="0.9"/>
      <circle cx="195" cy="162" r="3" fill="#ffffff" opacity="0.95"/>
      {/* Spark connections to both systems */}
      <line x1="72" y1="186" x2="195" y2="162" stroke="#cc6622" strokeOpacity="0.3" strokeWidth="1.2" strokeDasharray="4 4"/>
      <line x1="315" y1="188" x2="195" y2="162" stroke="#4466ee" strokeOpacity="0.3" strokeWidth="1.2" strokeDasharray="4 4"/>
      {/* Fine star field */}
      {Array.from({length:30},(_,i)=>({x:(i*71+23)%390,y:(i*53+11)%320})).map((s,i)=>(
        <circle key={i} cx={s.x} cy={s.y} r="0.7" fill="#f0eeff" opacity="0.15"/>
      ))}
    </svg>
  ),
};


// ── BOOK SCENE BACKGROUND — renders behind the wheel, crossfades on change ────
function BookSceneBackground({ bookId }) {
  // bookId may be a book object or a raw id number
  const resolveId = (v) => (v && typeof v === 'object') ? v.id : v;

  const [currentId, setCurrentId] = useState(() => resolveId(bookId));
  const [prevId,    setPrevId]    = useState(null);
  const [opacity,   setOpacity]   = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setOpacity(1), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const id = resolveId(bookId);
    if (id === currentId) return;
    setPrevId(currentId);
    setCurrentId(id);
  }, [bookId]);

  useEffect(() => {
    if (!prevId) return;
    const t = setTimeout(() => setPrevId(null), 1000);
    return () => clearTimeout(t);
  }, [prevId]);

  const SceneCurrent = BOOK_SCENES[currentId];
  const ScenePrev    = BOOK_SCENES[prevId];

  // Fixed height — matches wheel component's total rendered height
  // COVER_H(296) + track padding(52+24) + eyebrow(40) + info panel(~170) = ~582
  const H = 580;

  return (
    <div style={{ width:"100%", height:H, position:"relative", overflow:"hidden" }}>
      {ScenePrev && (
        <div style={{
          position:"absolute", inset:0,
          opacity:0, transition:"opacity 900ms ease",
          filter:"brightness(2.2) saturate(1.5)",
        }}>
          <ScenePrev opacity={1}/>
        </div>
      )}
      {SceneCurrent && (
        <div style={{
          position:"absolute", inset:0,
          opacity, transition:"opacity 700ms ease",
          filter:"brightness(2.2) saturate(1.5)",
        }}>
          <SceneCurrent opacity={1}/>
        </div>
      )}
      {/* Vignette keeps wheel text readable */}
      <div style={{
        position:"absolute", inset:0,
        background:"radial-gradient(ellipse 90% 65% at 50% 40%, transparent 25%, rgba(8,6,4,.80) 100%)",
        pointerEvents:"none",
      }}/>
    </div>
  );
}

function RecommendationWheel({ books, savedBooks, onSave, onDismiss, onAsk, onTap, onReact, userState, onActiveBook }) {
  const STEP    = 110; // px between book centers
  const COVER_W = 200; // cover width px
  const COVER_H = 296; // cover height px
  const RADIUS  = 3;   // books rendered each side of center

  const [pos,      setPos]      = useState(0);
  const [dragging, setDragging] = useState(false);
  const [mounted,  setMounted]  = useState(false); // entry animation gate

  const posRef       = useRef(0);
  const dragStartX   = useRef(0);
  const dragStartPos = useRef(0);
  const lastX        = useRef(0);
  const lastT        = useRef(0);
  const velRef       = useRef(0);
  const animRef      = useRef(null);
  const trackRef     = useRef(null);

  const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const activeIdx  = Math.round(cl(pos, 0, books.length - 1));
  const activeBook = books[activeIdx] || null;

  // Notify parent when active book changes (drives BookSceneBackground)
  useEffect(() => {
    if (activeBook) onActiveBook?.(activeBook);
  }, [activeIdx]);

  // Entry animation — fires once on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // ── snapTo: 240ms ease-out, no overshoot ──────────────────────────────────
  const snapTo = useCallback((raw) => {
    const target = cl(Math.round(raw), 0, books.length - 1);
    cancelAnimationFrame(animRef.current);
    const from = posRef.current;
    const t0   = performance.now();
    const dur  = 240; // ms — short enough to feel responsive, slow enough to feel premium
    const tick = (now) => {
      const t = Math.min((now - t0) / dur, 1);
      // ease-out cubic — decelerates cleanly to rest, no overshoot
      const e = 1 - Math.pow(1 - t, 3);
      const v = from + (target - from) * e;
      posRef.current = v;
      setPos(v);
      if (t < 1) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }, [books.length]);

  // Clamp when dismissed books shrink the array
  useEffect(() => {
    const max = Math.max(0, books.length - 1);
    if (posRef.current > max) snapTo(max);
  }, [books.length, snapTo]);

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const startDrag = useCallback((clientX) => {
    cancelAnimationFrame(animRef.current);
    setDragging(true);
    dragStartX.current   = clientX;
    dragStartPos.current = posRef.current;
    lastX.current        = clientX;
    lastT.current        = performance.now();
    velRef.current       = 0;
  }, []);

  const moveDrag = useCallback((clientX) => {
    const now = performance.now();
    const dt  = Math.max(1, now - lastT.current);
    velRef.current  = (clientX - lastX.current) / dt; // px/ms
    lastX.current   = clientX;
    lastT.current   = now;
    const delta = (clientX - dragStartX.current) / STEP;
    const next  = cl(dragStartPos.current - delta, 0, books.length - 1);
    posRef.current  = next;
    setPos(next);
  }, [books.length]);

  // Directional snap — max 1 book travel per gesture, no flyaway inertia.
  // vel > 0 = finger moving right = going to lower index.
  // vel < 0 = finger moving left  = going to higher index.
  const endDrag = useCallback(() => {
    setDragging(false);
    const vel = velRef.current;
    const cur = posRef.current;
    let target;
    if (Math.abs(vel) > 0.3) {
      // Has directional intent — snap one book that way
      target = vel > 0 ? Math.floor(cur) : Math.ceil(cur);
    } else {
      // Slow or stopped — snap to nearest
      target = Math.round(cur);
    }
    snapTo(target);
  }, [snapTo]);

  // Mouse
  const onMouseDown = (e) => { e.preventDefault(); startDrag(e.clientX); };
  useEffect(() => {
    if (!dragging) return;
    const m = (e) => moveDrag(e.clientX);
    const u = () => endDrag();
    window.addEventListener("mousemove", m);
    window.addEventListener("mouseup",   u);
    return () => { window.removeEventListener("mousemove", m); window.removeEventListener("mouseup", u); };
  }, [dragging, moveDrag, endDrag]);

  // Touch
  const onTouchStart = (e) => startDrag(e.touches[0].clientX);
  const onTouchMove  = (e) => { e.preventDefault(); moveDrag(e.touches[0].clientX); };
  const onTouchEnd   = () => endDrag();

  // Scroll wheel — one book per tick, no accumulation
  const onWheel = useCallback((e) => {
    e.preventDefault();
    cancelAnimationFrame(animRef.current);
    snapTo(Math.round(posRef.current) + (e.deltaY > 0 ? 1 : -1));
  }, [snapTo]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  // ── Book transform ─────────────────────────────────────────────────────────
  // Visual hierarchy values tuned for unambiguous center focus:
  //   absRel   scale    opacity
  //   0        1.00     1.00   ← unmistakable
  //   1        0.78     0.62   ← clearly secondary
  //   2        0.60     0.37   ← supporting context
  //   3        0.48     0.15   ← barely there
  const getTransform = (index) => {
    const rel    = index - pos;
    const absRel = Math.abs(rel);
    if (absRel > RADIUS + 0.6) return null;

    const tx      = rel * STEP;
    const ty      = absRel * absRel * 3.8;              // gentle parabolic arc
    const scale   = Math.max(0.47, 1 - absRel * 0.22); // steep enough to be obvious
    const opacity = Math.max(0.13, 1 - absRel * 0.29); // far books nearly gone
    const rotY    = cl(-rel * 8, -22, 22);              // subtle depth, not theatrical
    const zIdx    = Math.round(60 - absRel * 14);
    return { tx, ty, scale, opacity, rotY, zIdx };
  };

  const onTileClick = (index, book) => {
    if (Math.abs(index - posRef.current) < 0.35) { onTap?.(book); }
    else { snapTo(index); }
  };

  const handleNoThanks = () => {
    if (!activeBook) return;
    onDismiss(activeBook.id);
  };

  const reason = activeBook
    ? getRecommendationReason(activeBook, userState || {})
    : "";
  const pitch  = activeBook
    ? getFavoriteBookPitch(activeBook, userState || {})
    : "";

  if (!books || books.length === 0) return null;

  return (
    <div style={{
      position:"relative",
      background:"transparent",
      borderBottom:"1px solid rgba(255,255,255,.05)",
      overflow:"hidden",
      paddingBottom:24,
      // Entry fade — entire hero fades in from transparent
      opacity: mounted ? 1 : 0,
      transition:"opacity 0.35s ease",
    }}>
      {/* Ambient glow — centred, understated */}
      <div style={{
        position:"absolute", top:0, left:"50%", transform:"translateX(-50%)",
        width:220, height:200, pointerEvents:"none",
        background:"radial-gradient(ellipse 100% 100% at 50% 12%,rgba(212,148,26,.08) 0%,transparent 65%)",
      }}/>

      {/* Eyebrow */}
      <div style={{
        textAlign:"center", paddingTop:20,
        fontSize:8, fontWeight:700, letterSpacing:"2.8px",
        textTransform:"uppercase", color:"rgba(212,148,26,.45)",
      }}>Your top pick right now</div>

      {/* ── Wheel track ── */}
      <div
        ref={trackRef}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          position:"relative",
          height: COVER_H + 52,
          display:"flex", alignItems:"flex-start",
          justifyContent:"center",
          paddingTop:24,
          cursor: dragging ? "grabbing" : "grab",
          userSelect:"none", WebkitUserSelect:"none",
          overflow:"visible",
        }}
      >
        {books.map((book, index) => {
          const tf = getTransform(index);
          if (!tf) return null;
          const { tx, ty, scale, opacity, rotY, zIdx } = tf;
          const isCenter = index === activeIdx;
          const isSaved  = savedBooks?.some(sb => sb.id === book.id);

          return (
            <div
              key={book.id}
              onClick={() => onTileClick(index, book)}
              style={{
                position:"absolute",
                width: COVER_W, height: COVER_H,
                borderRadius: 9, overflow:"hidden",
                transform:`perspective(1000px) translateX(${tx}px) translateY(${ty}px) scale(${scale}) rotateY(${rotY}deg)`,
                opacity,
                zIndex: zIdx,
                // During drag: no transition — raw response.
                // After snap: single property transition — avoids shimmer from competing values.
                transition: dragging
                  ? "none"
                  : "transform 0.24s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.24s ease",
                boxShadow: isCenter
                  ? "0 16px 44px rgba(0,0,0,.72), 0 0 0 1px rgba(212,148,26,.32)"
                  : "0 4px 18px rgba(0,0,0,.5)",
                cursor: isCenter ? "default" : "pointer",
                // Center book gets a subtle brightness lift — unmistakable without being garish
                filter: isCenter ? "brightness(1.07)" : "none",
              }}
            >
              <BookCover
                isbn={book.isbn} title={book.title}
                author={book.author} color={book.color}
                className="fill"
              />
              {/* Saved pip */}
              {isSaved && (
                <div style={{
                  position:"absolute", bottom:5, left:5, zIndex:3,
                  background:"rgba(10,8,6,.9)", backdropFilter:"blur(4px)",
                  border:"1px solid rgba(212,148,26,.4)", color:"var(--gold)",
                  fontSize:7, fontWeight:700, padding:"2px 6px", borderRadius:99,
                }}>✓</div>
              )}
              {/* Score on non-centre books — fades with distance */}
              {!isCenter && (
                <div style={{
                  position:"absolute", top:5, right:5, zIndex:3,
                  background:"rgba(10,8,6,.72)", backdropFilter:"blur(3px)",
                  color:"var(--gold)", fontSize:7.5, fontWeight:700,
                  padding:"1px 5px", borderRadius:99,
                  border:"1px solid rgba(212,148,26,.15)",
                  opacity: Math.max(0.25, 1 - Math.abs(index - pos) * 0.42),
                }}>{book.score}%</div>
              )}
            </div>
          );
        })}

        {/* Vignette — fades side books into the background */}
        <div style={{
          position:"absolute", inset:0, zIndex:80, pointerEvents:"none",
          background:"linear-gradient(90deg,#131007 0%,transparent 22%,transparent 78%,#131007 100%)",
        }}/>
      </div>

      {/* ── Focus info panel ──
          key=activeBook.id re-mounts on change, re-triggering wheelFocus animation.
          Breathing room between wheel and text is intentional. */}
      {activeBook && (
        <div
          key={activeBook.id}
          style={{
            padding:"10px 24px 0",
            textAlign:"center",
            animation:"wheelFocus .18s ease-out",
          }}
        >
          {/* Score badge */}
          <div style={{
            display:"inline-flex", alignItems:"center",
            fontSize:8.5, fontWeight:700, letterSpacing:".3px",
            color:"var(--gold)",
            background:"rgba(212,148,26,.09)", border:"1px solid rgba(212,148,26,.18)",
            padding:"2px 10px", borderRadius:99, marginBottom:9,
          }}>{activeBook.score}% match</div>

          {/* Title */}
          <div style={{
            fontFamily:"'Lora',serif", fontSize:17, fontWeight:700,
            color:"var(--text)", lineHeight:1.22, marginBottom:4, letterSpacing:"-.2px",
          }}>{activeBook.title}</div>

          {/* Author */}
          <div style={{
            fontSize:12, color:"var(--muted)", fontStyle:"italic", marginBottom:10,
          }}>{activeBook.author}</div>

          {/* Why this could be your next favorite */}
          <div style={{
            maxWidth:320, marginLeft:"auto", marginRight:"auto",
            marginBottom:18, textAlign:"left",
          }}>
            <div style={{
              fontSize:8, fontWeight:700, letterSpacing:"2px",
              textTransform:"uppercase", color:"var(--gold)", opacity:.88,
              marginBottom:9, display:"flex", alignItems:"center", gap:7,
            }}>
              <span style={{width:12,height:1.5,background:"rgba(212,148,26,.6)",display:"inline-block",borderRadius:1,flexShrink:0}}/>
              Why this could be your next favorite
            </div>
            <div style={{
              fontSize:13.5, color:"rgba(240,232,216,.93)",
              lineHeight:1.74, fontStyle:"italic",
            }}>{pitch}</div>
          </div>

          {/* Actions */}
          <div style={{display:"flex", gap:8, justifyContent:"center"}}>
            {(() => {
              const saved = savedBooks?.some(sb => sb.id === activeBook.id);
              return (
                <button
                  onClick={() => !saved && onSave(activeBook)}
                  style={{
                    padding:"9px 24px", borderRadius:99, border:"none",
                    background: saved ? "rgba(212,148,26,.1)" : "var(--gold)",
                    color: saved ? "var(--gold)" : "#0a0806",
                    fontSize:13, fontWeight:700,
                    cursor: saved ? "default" : "pointer",
                    transition:"all .2s",
                    ...(saved
                      ? { border:"1px solid rgba(212,148,26,.25)" }
                      : { boxShadow:"0 2px 12px rgba(212,148,26,.28)" }),
                  }}
                >{saved ? "✓ Saved" : "Save to Read"}</button>
              );
            })()}
            <button
              onClick={handleNoThanks}
              style={{
                padding:"9px 16px", borderRadius:99,
                border:"1px solid rgba(255,255,255,.12)", background:"transparent",
                color:"var(--muted)", fontSize:12.5, fontWeight:500,
                cursor:"pointer", transition:"all .15s",
              }}
            >Not for me</button>
          </div>

          {/* Reaction pills — quick memory capture */}
          {activeBook && onReact && (
            <div className="ls-reaction-bar" style={{justifyContent:"center", marginTop:10}}>
              {[["loved","Loved it"],["too slow","Too slow"],["finished","Finished it"],["abandoned","Stopped reading"]].map(([r,label]) => (
                <button key={r} className="ls-reaction-pill"
                  onClick={() => onReact(activeBook, r)}
                >{label}</button>
              ))}
            </div>
          )}

          {/* Navigation dots */}
          <div style={{
            display:"flex", gap:6, justifyContent:"center", marginTop:16,
          }}>
            {books.slice(0, Math.min(books.length, 7)).map((_, i) => (
              <div
                key={i}
                onClick={() => snapTo(i)}
                style={{
                  width: i === activeIdx ? 18 : 5,
                  height: 5,
                  borderRadius: 99,
                  background: i === activeIdx ? "var(--gold)" : "rgba(255,255,255,.13)",
                  cursor: "pointer",
                  transition:"width .22s cubic-bezier(0.25,0.46,0.45,0.94), background .22s ease",
                  flexShrink:0,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── FOR YOU ITEM — single card in the personalised feed ──────────────────────

// Hand-crafted hooks for the curated catalog.
// These are the highest-quality copy — specific to the book, not generated.
const BOOK_HOOKS = {
  1: "Three generations, seventy years — patient, sweeping, impossible to quit",
  2: "Dickens retold for the opioid crisis — raw, morally urgent, essential",
  3: "Lone astronaut, no memory, mission to save Earth — relentless from page one",
  4: "Two perspectives across WWII France — precision prose, devastating payoff",
  5: "Ten days in 1954 America — Towles at his most elegant and most witty",
  6: "Every decision you make looks different after you finish this",
};

/**
 * getHook(book)
 *
 * Returns a 1-line hook for the given book.
 * Priority: hand-crafted → genre pool → pacing fallback → neutral fallback.
 *
 * Rules:
 *  - One line, ≤12 words ideally
 *  - Reads like front-of-book copy or a trailer line
 *  - Never references the user ("you", "your")
 *  - Never sounds like a recommendation reason or explanation
 *  - Strong, clear language — no filler, no passive constructions
 *
 * Pool selection is deterministic (book.id % pool.length) so the same book
 * always gets the same hook regardless of render order.
 */
function getHook(book) {
  // 1. Hand-crafted — highest quality
  if (BOOK_HOOKS[book.id]) return BOOK_HOOKS[book.id];

  const meta   = BOOK_AFFINITY[book.id] || {};
  const pacing = meta.pacing  || "moderate";
  const tone   = (meta.toneWords || [])[0] || "compelling";
  const Tone   = tone.charAt(0).toUpperCase() + tone.slice(1);
  const tags   = book.tags || [];

  // Deterministic pick from a pool — same book always gets the same line
  const pick = (pool) => pool[book.id % pool.length];

  // 2. Sci-Fi — emphasise intelligence, pace, ideas
  if (tags.includes("Sci-Fi")) return pick([
    "Fast, intelligent sci-fi with zero filler",
    "Concept-driven and propulsive — reads like a thriller",
    "The kind of sci-fi that makes you smarter as it entertains",
    "Ideas first. Pace second. Both excellent.",
  ]);

  // 3. Thriller / Mystery / True Crime — tension, speed, stakes
  if (tags.some(t => ["Thriller","Mystery","True Crime"].includes(t))) return pick(
    pacing === "slow" ? [
      "Slow-burn tension that earns its ending",
      "Quiet, then suddenly impossible to stop",
      "The threat builds before you realise it's there",
    ] : [
      "High-stakes and relentless — one more chapter, always one more",
      "Fast, tense, and impossible to put down",
      "Grips you from the first page and doesn't let go",
    ]
  );

  // 4. Literary Fiction — prose quality, depth, emotional payoff
  if (tags.includes("Literary Fiction")) return pick(
    pacing === "slow" ? [
      "Simple on the surface, quietly devastating underneath",
      `${Tone} prose — the kind that stays with you long after`,
      "Rewards patience in ways you won't see coming",
      "A slow build that earns every one of its pages",
    ] : [
      "Character-driven and emotionally precise",
      "A story that actually earns its emotion",
      "Literary fiction that moves — no meandering, no filler",
      "Sharp, controlled, and surprisingly hard to put down",
    ]
  );

  // 5. Historical Fiction — immersion, stakes, craft
  if (tags.includes("Historical")) return pick(
    pacing === "slow" ? [
      "Historical fiction that puts you somewhere else entirely",
      "Another time, another place — completely convincing",
      "The past rendered so vividly you forget it's fiction",
    ] : [
      "History told like a thriller — paced for today, set in another era",
      "Fast-moving historical fiction with something real to say",
      "Immersive and propulsive — leaves you looking things up afterward",
    ]
  );

  // 6. Non-fiction — insight, usefulness, perspective shift
  if (tags.some(t => ["Non-Fiction","Psychology","Self-Help","Business","Philosophy","Biography","Essays"].includes(t))) return pick([
    "Finishes the way the best non-fiction does: differently than it started",
    "Practical, well-argued, and genuinely useful",
    "The kind of insight that actually changes how you see things",
    "A book that earns the time you give it",
    "Smarter than most. Clearer than any.",
  ]);

  // 7. Family Saga / emotional fiction
  if (tags.some(t => ["Family Saga","Romance"].includes(t))) return pick([
    "Gets under your skin before you notice",
    "Emotionally precise — feels things you didn't expect",
    "Character-driven, deeply felt, and hard to put down",
  ]);

  // 8. Pacing-based fallback — still a pitch, not an explanation
  if (pacing === "fast") return "The kind of book you finish in one sitting";
  if (pacing === "slow") return "Slow to start, then impossible to stop thinking about";

  // 9. Neutral fallback — engaging but never explanatory
  return "A well-crafted story with real depth and momentum";
}

// ── BACKGROUND GRADIENT SCENES ───────────────────────────────────────────────
// Pure CSS gradients — no network requests, always visible.
// Layered radial-gradients suggest different literary moods.
// Crossfades every 9s using opacity transitions.




function ForYouItem({ book, userState, savedBooks, onSave, onDismiss, onAsk, onReact }) {
  const [exiting, setExiting] = useState(false);
  const [showPitch, setShowPitch] = useState(false);
  const isSaved = savedBooks?.some(sb => sb.id === book.id);
  const hook    = getHook(book);
  const pitch   = getFavoriteBookPitch(book, userState || {});

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(() => onDismiss(book.id), 350);
  };

  return (
    <div
      className="ls-foryou-card"
      style={{
        opacity: exiting ? 0 : 1,
        transition: exiting ? "opacity .35s ease" : "none",
      }}
    >
      {/* Full-bleed cover background */}
      {/* Full-bleed background — color gradient always shows, cover image on top when available */}
      <div style={{ position:"absolute", inset:0, zIndex:0, overflow:"hidden",
        background:`linear-gradient(155deg,${book.color[0]},${book.color[1]})`,
      }}>
        {/* Override ls-book-cover to fill 100% */}
        <div style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}
          className="ls-foryou-bg-cover">
          <BookCover isbn={book.isbn} title={book.title} author={book.author} color={book.color}/>
        </div>
      </div>

      {/* Heavy bottom gradient for text legibility */}
      <div style={{
        position:"absolute", inset:0, zIndex:1, pointerEvents:"none",
        background:"linear-gradient(to top, rgba(4,2,1,.97) 0%, rgba(4,2,1,.88) 28%, rgba(4,2,1,.50) 52%, rgba(4,2,1,.15) 72%, transparent 100%)",
      }}/>

      {/* Score badge — top right */}
      <div style={{
        position:"absolute", top:16, right:16, zIndex:3,
        fontSize:10, fontWeight:700, color:"var(--gold)",
        background:"rgba(10,8,6,.75)", backdropFilter:"blur(8px)",
        WebkitBackdropFilter:"blur(8px)",
        padding:"3px 10px", borderRadius:99,
        border:"1px solid rgba(212,148,26,.3)",
      }}>{book.score}% match</div>

      {/* Content pinned to bottom */}
      <div style={{ position:"relative", zIndex:2, padding:"0 22px 32px" }}>

        <div style={{
          fontFamily:"'Lora',serif", fontSize:26, fontWeight:700,
          color:"#fff", lineHeight:1.15, marginBottom:4, letterSpacing:"-.4px",
          textShadow:"0 2px 20px rgba(0,0,0,.5)",
        }}>{book.title}</div>

        <div style={{
          fontSize:14, color:"rgba(255,255,255,.65)",
          fontStyle:"italic", marginBottom:16,
        }}>{book.author}</div>

        <div style={{
          fontSize:15, fontWeight:600, color:"rgba(255,255,255,.95)",
          lineHeight:1.45, marginBottom:14,
          textShadow:"0 1px 12px rgba(0,0,0,.4)",
        }}>{hook}</div>

        {showPitch ? (
          <div
            style={{
              fontSize:13, color:"rgba(255,255,255,.82)",
              lineHeight:1.7, marginBottom:18, fontStyle:"italic",
              textShadow:"0 1px 8px rgba(0,0,0,.4)",
            }}
            onClick={() => setShowPitch(false)}
          >
            {pitch}
            <span style={{display:"block",marginTop:8,fontSize:11,color:"rgba(212,148,26,.7)",fontStyle:"normal"}}>Tap to collapse</span>
          </div>
        ) : (
          <button
            onClick={() => setShowPitch(true)}
            style={{
              display:"flex", alignItems:"center", gap:6,
              background:"none", border:"none",
              color:"rgba(212,148,26,.85)", fontSize:12.5, fontWeight:600,
              cursor:"pointer", padding:0, marginBottom:18,
            }}
          >
            <span style={{width:10,height:1,background:"rgba(212,148,26,.55)",display:"inline-block",borderRadius:1}}/>
            Why this could be your next favorite
          </button>
        )}

        <div style={{display:"flex", gap:10}}>
          <button
            onClick={() => !isSaved && onSave(book)}
            style={{
              flex:2, padding:"13px 0", borderRadius:12, border:"none",
              background: isSaved ? "rgba(212,148,26,.15)" : "var(--gold)",
              color: isSaved ? "var(--gold)" : "#060402",
              fontSize:14, fontWeight:700,
              cursor: isSaved ? "default" : "pointer",
              transition:"all .18s",
              boxShadow: isSaved ? "none" : "0 4px 20px rgba(212,148,26,.4)",
              ...(isSaved ? {border:"1px solid rgba(212,148,26,.3)"} : {}),
            }}
          >{isSaved ? "✓ Saved" : "Save to Read"}</button>

          <button
            onClick={handleDismiss}
            style={{
              flex:1, padding:"13px 0", borderRadius:12,
              border:"1px solid rgba(255,255,255,.22)", background:"rgba(0,0,0,.3)",
              backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)",
              color:"rgba(255,255,255,.7)", fontSize:13, fontWeight:500,
              cursor:"pointer",
            }}
          >Not for me</button>
        </div>

        <button
          onClick={() => onAsk(`Tell me about "${book.title}" by ${book.author}. Should I read it?`)}
          style={{
            display:"block", width:"100%", marginTop:12, padding:"6px 0",
            background:"none", border:"none",
            color:"rgba(255,255,255,.35)", fontSize:11.5,
            cursor:"pointer", textAlign:"center",
          }}
        >Ask about this book →</button>

        {/* Reaction pills */}
        {onReact && (
          <div className="ls-reaction-bar" style={{paddingLeft:0, paddingRight:0, marginTop:8}}>
            {[["loved","Loved it"],["too slow","Too slow"],["finished","Finished it"],["abandoned","Stopped reading"]].map(([r,label]) => (
              <button key={r} className="ls-reaction-pill"
                onClick={() => onReact(book, r)}
              >{label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ForYouFeed({ books, savedBooks, onSave, onDismiss, onAsk, onReact, userState, memory }) {
  const feedItems = buildFeedItems(books, userState || {});

  if (feedItems.length === 0) {
    return (
      <div className="ls-empty" style={{paddingTop:52}}>
        <div className="ls-empty-icon"><BookOpen size={40} strokeWidth={1}/></div>
        <div className="ls-empty-title">All caught up</div>
        <div className="ls-empty-body">Browse Discover or rate more books to unlock new picks.</div>
      </div>
    );
  }

  return (
    <>
      <div className="ls-foryou-feed">
      {feedItems.map(book => (
        <ForYouItem
          key={book.id}
          book={book}
          userState={userState}
          savedBooks={savedBooks}
          onSave={onSave}
          onDismiss={onDismiss}
          onAsk={onAsk}
          onReact={onReact}
        />
      ))}
    </div>
    </>
  );
}

// ── BOOK SEARCH — live Open Library search with cover previews ───────────────
// ── SEARCH HELPERS — fuzzy matching + ranking ─────────────────────────────────

// Normalize: lowercase, strip punctuation, collapse whitespace
function normStr(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

// Levenshtein edit distance
function editDist(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const curr = [i + 1];
    for (let j = 0; j < b.length; j++) {
      curr[j + 1] = a[i] === b[j]
        ? prev[j]
        : 1 + Math.min(prev[j], prev[j + 1], curr[j]);
    }
    prev.splice(0, prev.length, ...curr);
  }
  return prev[b.length];
}

// Similarity score 0–1 between two strings
function strSim(a, b) {
  const na = normStr(a), nb = normStr(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.88;
  const dist = editDist(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

// Score a single OpenLibrary doc against the user's query
function scoreDoc(doc, query) {
  const nq = normStr(query);
  const nt = normStr(doc.title || "");
  const na = normStr((doc.author_name || [])[0] || "");

  let score = 0;

  // Exact and prefix matches — highest priority
  if (nt === nq)              score += 120;
  else if (nt.startsWith(nq)) score += 90;
  else if (na === nq)         score += 80;

  // Similarity
  score += strSim(nq, nt) * 60;
  score += strSim(nq, na) * 30;

  // Popularity signals
  if (doc.edition_count)  score += Math.min(18, doc.edition_count / 12);
  if (doc.ratings_count)  score += Math.min(10, doc.ratings_count / 800);
  if (doc.first_publish_year && doc.first_publish_year > 1950) score += 2;

  return score;
}

// Deduplicate by normalised title (keep highest-scored per title)
function dedupByTitle(docs) {
  const seen = new Map();
  for (const doc of docs) {
    const key = normStr(doc.title);
    if (!seen.has(key) || doc._score > seen.get(key)._score) seen.set(key, doc);
  }
  return [...seen.values()];
}

function BookSearch({ onSelect, placeholder = "Search for a book...", mode = "rate" }) {
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [pending, setPending]   = useState(null);
  const [didYouMean, setDidYouMean] = useState(null);
  const debounceRef = useRef(null);

  const search = async (q) => {
    const trimmed = q.trim();
    if (!trimmed || trimmed.length < 2) { setResults([]); setDidYouMean(null); return; }
    setLoading(true);
    try {
      // Normalise query before sending — strips punctuation/extra spaces
      const apiQ = normStr(trimmed).replace(/\s+/g, "+");
      const res  = await fetch(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(normStr(trimmed))}&limit=12&fields=title,author_name,isbn,cover_i,first_publish_year,edition_count,ratings_count`
      );
      const data = await res.json();

      // Score, sort, deduplicate
      const scored = (data.docs || [])
        .filter(d => d.title)
        .map(d => ({ ...d, _score: scoreDoc(d, trimmed) }))
        .sort((a, b) => b._score - a._score);

      const deduped = dedupByTitle(scored).slice(0, 6);

      // "Did you mean" — fire when top result title diverges from what was typed
      const top = deduped[0];
      const topSim = top ? strSim(trimmed, top.title) : 1;
      if (top && topSim < 0.55 && normStr(top.title) !== normStr(trimmed)) {
        setDidYouMean(top.title);
      } else {
        setDidYouMean(null);
      }

      setResults(deduped);
    } catch { setResults([]); setDidYouMean(null); }
    setLoading(false);
  };

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 340);
  };

  const selectBook = (doc) => {
    const book = {
      title:  doc.title,
      author: doc.author_name?.[0] || "",
      isbn:   doc.isbn?.[0] || "",
      coverId:doc.cover_i || null,
    };
    setDidYouMean(null);
    if (mode === "want") {
      onSelect(book);
      setQuery(""); setResults([]);
    } else {
      setPending(book);
      setQuery(""); setResults([]);
    }
  };

  const confirmRate = (rating) => {
    onSelect({ ...pending, rating });
    setPending(null);
  };

  return (
    <div style={{position:"relative"}}>
      <div style={{display:"flex",gap:8}}>
        <div style={{flex:1,position:"relative"}}>
          <input
            className="ls-input full"
            value={query}
            onChange={handleChange}
            placeholder={placeholder}
          />
          {loading && (
            <div style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:11,color:"var(--muted)"}}>
              Searching…
            </div>
          )}
        </div>
      </div>

      {/* Search results dropdown */}
      {results.length > 0 && (
        <div style={{
          position:"absolute",top:"calc(100% + 6px)",left:0,right:0,zIndex:100,
          background:"var(--bg3)",border:"1px solid rgba(255,255,255,.1)",
          borderRadius:10,overflow:"hidden",
          boxShadow:"0 8px 32px rgba(0,0,0,.6)",
        }}>
          {/* Did you mean banner */}
          {didYouMean && (
            <div style={{
              padding:"7px 12px",
              background:"rgba(212,148,26,.07)",
              borderBottom:"1px solid rgba(255,255,255,.06)",
              fontSize:11, color:"var(--muted)",
            }}>
              Showing results for{" "}
              <span style={{color:"var(--gold)",fontWeight:600,fontStyle:"italic"}}>{didYouMean}</span>
            </div>
          )}
          {results.map((doc, i) => {
            const covUrl = doc.cover_i
              ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-S.jpg`
              : null;
            const isTopMatch = i === 0;
            return (
              <div key={i}
                onClick={() => selectBook(doc)}
                style={{
                  display:"flex",alignItems:"center",gap:10,
                  padding:"9px 12px",cursor:"pointer",
                  borderBottom:"1px solid rgba(255,255,255,.05)",
                  transition:"background .14s",
                  background: isTopMatch ? "rgba(212,148,26,.04)" : "transparent",
                }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(212,148,26,.08)"}
                onMouseLeave={e=>e.currentTarget.style.background=isTopMatch?"rgba(212,148,26,.04)":"transparent"}
              >
                <div style={{width:28,height:40,borderRadius:3,overflow:"hidden",flexShrink:0,background:"var(--card2)"}}>
                  {covUrl
                    ? <img src={covUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                    : <div style={{width:"100%",height:"100%",background:"var(--lift)"}}/>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"'Lora',serif",fontSize:12.5,fontWeight:600,color:"var(--text)",lineHeight:1.25,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{doc.title}</div>
                  <div style={{fontSize:10.5,color:"var(--muted)",fontStyle:"italic",marginTop:1}}>{doc.author_name?.[0] || "Unknown"}{doc.first_publish_year ? ` · ${doc.first_publish_year}` : ""}</div>
                </div>
                <div style={{fontSize:10,color: isTopMatch ? "var(--gold)" : "var(--muted)",fontWeight:600,flexShrink:0}}>{mode==="want"?"+ Add":"Rate →"}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inline star rating after selecting (rate mode) */}
      {pending && (
        <div style={{
          marginTop:8,padding:"12px 14px",
          background:"var(--card2)",borderRadius:10,
          border:"1px solid rgba(212,148,26,.2)",
        }}>
          <div style={{fontFamily:"'Lora',serif",fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:1}}>{pending.title}</div>
          <div style={{fontSize:11,color:"var(--muted)",fontStyle:"italic",marginBottom:10}}>{pending.author}</div>
          <div style={{fontSize:11.5,color:"var(--text2)",marginBottom:8}}>How would you rate it?</div>
          <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:10}}>
            {[1,2,3,4,5].map(s=>(
              <span key={s} onClick={()=>confirmRate(s)}
                style={{fontSize:26,cursor:"pointer",color:"var(--gold)",transition:"transform .1s"}}
                onMouseEnter={e=>e.target.style.transform="scale(1.25)"}
                onMouseLeave={e=>e.target.style.transform="scale(1)"}
              >★</span>
            ))}
          </div>
          <button onClick={()=>setPending(null)}
            style={{fontSize:11,color:"var(--muted)",background:"none",border:"none",cursor:"pointer",padding:0}}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}


// ── VOICE SHELF INTAKE ────────────────────────────────────────────────────────
const VSI_REACTIONS = ["liked","loved","didnt_like","didnt_finish"];
const VSI_META = {
  liked:       { label:"Liked it",      bg:"rgba(255,255,255,.10)", color:"var(--text2)" },
  loved:       { label:"Loved it",      bg:"rgba(212,148,26,.22)", color:"var(--gold)" },
  didnt_like:  { label:"Didn't like",   bg:"rgba(184,64,40,.18)",  color:"#e07060" },
  didnt_finish:{ label:"Didn't finish", bg:"rgba(255,255,255,.06)", color:"var(--muted)" },
};

function VoiceShelfIntake({ onAdd }) {
  const [phase, setPhase]           = useState("idle");
  const [books, setBooks]           = useState([]);
  const [usedFollowUp, setUsedFollowUp] = useState(false);
  const [errMsg, setErrMsg]         = useState(null);
  const recogRef = useRef(null);
  const hasSpeech = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    setErrMsg(null);
    let finalText = "";
    const r = new SR();
    r.lang = "en-US"; r.continuous = true; r.interimResults = false;
    recogRef.current = r;
    r.onresult = e => { for (let i=e.resultIndex;i<e.results.length;i++) { if(e.results[i].isFinal) finalText+=e.results[i][0].transcript+" "; } };
    r.onend = () => { const t=finalText.trim(); if(t) processTranscript(t); else setPhase("idle"); };
    r.onerror = () => setPhase("idle");
    r.start();
    setPhase("listening");
  };

  const stopListening = () => { recogRef.current?.stop(); setPhase("processing"); };

  const processTranscript = async (text) => {
    setPhase("processing");
    try {
      const res = await fetch("/api/ai", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:800,
          system:`Extract every book title from this voice transcript. Return ONLY a raw JSON array — no markdown, no explanation.
Each item: {"title":"string","author":"string","reaction":"liked"|"loved"|"didnt_like"|"didnt_finish","reason":"string"}
Reaction — infer from context: loved/amazing/favorite/obsessed → loved; good/liked/enjoyed/fine/finished → liked; didn't like/bad/boring/hated → didnt_like; didn't finish/gave up/stopped/DNF → didnt_finish. Default: liked.
Reason: verbatim phrase max 8 words, or empty string. Author: extract only if clearly stated, else empty string.`,
          messages:[{role:"user",content:text}],
        }),
      });
      const data = await res.json();
      const raw = (data.content?.[0]?.text||"[]").replace(/\`\`\`json|\`\`\`/g,"").trim();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)&&parsed.length>0) {
        setBooks(parsed.map((b,i)=>({...b,id:Date.now()+i})));
        setPhase("confirming");
      } else if (!usedFollowUp) {
        setUsedFollowUp(true);
        setErrMsg("Didn't catch any titles — could you say them again?");
        setPhase("idle");
      } else {
        setErrMsg("Still no titles found. Try the search below."); setPhase("idle");
      }
    } catch { setErrMsg("Something went quiet — try again."); setPhase("idle"); }
  };

  const cycleReaction = (id) => setBooks(p=>p.map(b=>{ if(b.id!==id)return b; const next=VSI_REACTIONS[(VSI_REACTIONS.indexOf(b.reaction)+1)%VSI_REACTIONS.length]; return {...b,reaction:next}; }));
  const removeBook = (id) => setBooks(p=>p.filter(b=>b.id!==id));

  const confirmAdd = () => {
    onAdd(books.map(b=>({ id:b.id, title:b.title, author:b.author||"", rating:b.reaction==="loved"?5:b.reaction==="liked"?4:2, _reaction:{loved:"loved",liked:null,didnt_like:"abandoned",didnt_finish:"abandoned"}[b.reaction], _reason:b.reason||"" })));
    setPhase("idle"); setBooks([]); setErrMsg(null); setUsedFollowUp(false);
  };

  if (phase==="confirming"&&books.length>0) return (
    <div style={{margin:"0 0 20px",padding:"16px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.09)",borderRadius:"var(--r-lg)"}}>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:"var(--gold)",marginBottom:14}}>Found {books.length} book{books.length!==1?"s":""}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
        {books.map(b=>{ const meta=VSI_META[b.reaction]||VSI_META.liked; return (
          <div key={b.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",background:"rgba(255,255,255,.04)",borderRadius:"var(--r-md)",border:"1px solid rgba(255,255,255,.07)"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:"'Lora',serif",fontSize:13.5,fontWeight:700,color:"var(--text)",lineHeight:1.25,marginBottom:2}}>{b.title}</div>
              {b.author&&<div style={{fontSize:11,color:"var(--muted)",marginBottom:5}}>{b.author}</div>}
              <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                <button onClick={()=>cycleReaction(b.id)} style={{padding:"3px 9px",borderRadius:99,border:"none",background:meta.bg,color:meta.color,fontSize:11,fontWeight:600,cursor:"pointer"}}>
                  {meta.label} ↻
                </button>
                {b.reason&&<span style={{fontSize:11,color:"var(--muted)",fontStyle:"italic"}}>{b.reason}</span>}
              </div>
            </div>
            <button onClick={()=>removeBook(b.id)} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",padding:"2px 4px",flexShrink:0,fontSize:16,lineHeight:1}}>×</button>
          </div>
        );})}
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={confirmAdd} style={{flex:1,padding:"11px",borderRadius:"var(--r-lg)",border:"none",background:"var(--gold)",color:"#060402",fontSize:13,fontWeight:700,cursor:"pointer"}}>Add {books.length} book{books.length!==1?"s":""} to shelf</button>
        <button onClick={()=>{setPhase("idle");setBooks([]);}} style={{padding:"11px 14px",borderRadius:"var(--r-lg)",border:"1px solid rgba(255,255,255,.1)",background:"transparent",color:"var(--muted)",fontSize:13,cursor:"pointer"}}>Cancel</button>
      </div>
    </div>
  );

  if (phase==="listening") return (
    <div style={{margin:"0 0 20px",padding:"20px 16px",background:"rgba(212,148,26,.06)",border:"1px solid rgba(212,148,26,.2)",borderRadius:"var(--r-lg)",textAlign:"center"}}>
      <div style={{width:52,height:52,borderRadius:"50%",background:"rgba(212,148,26,.18)",border:"2px solid rgba(212,148,26,.5)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",animation:"micPulse 1.2s ease-in-out infinite"}}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
      </div>
      <div style={{fontSize:13,color:"var(--text2)",lineHeight:1.6,marginBottom:16}}>Listening…<br/><span style={{fontSize:12,color:"var(--muted)"}}>Tell me what you've read and what you thought of each one.</span></div>
      <button onClick={stopListening} style={{padding:"9px 22px",borderRadius:"var(--r-pill)",border:"1px solid rgba(212,148,26,.4)",background:"transparent",color:"var(--gold)",fontSize:12,fontWeight:600,cursor:"pointer"}}>Done</button>
    </div>
  );

  if (phase==="processing") return (
    <div style={{margin:"0 0 20px",padding:"20px 16px",background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",borderRadius:"var(--r-lg)",textAlign:"center"}}>
      <div style={{display:"flex",gap:5,justifyContent:"center",marginBottom:10}}>
        {[0,1,2].map(i=><div key={i} className="ls-dot" style={{animationDelay:`${i*0.18}s`}}/>)}
      </div>
      <div style={{fontSize:12,color:"var(--muted)"}}>Reading your response…</div>
    </div>
  );

  if (!hasSpeech) return null;
  return (
    <div style={{margin:"0 0 16px"}}>
      <button onClick={startListening} style={{width:"100%",padding:"14px 16px",display:"flex",alignItems:"center",gap:12,background:"rgba(212,148,26,.07)",border:"1px solid rgba(212,148,26,.2)",borderRadius:"var(--r-lg)",cursor:"pointer",transition:"all .2s",textAlign:"left"}}
        onMouseEnter={e=>e.currentTarget.style.background="rgba(212,148,26,.12)"}
        onMouseLeave={e=>e.currentTarget.style.background="rgba(212,148,26,.07)"}>
        <div style={{width:36,height:36,borderRadius:"50%",background:"rgba(212,148,26,.15)",border:"1px solid rgba(212,148,26,.3)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--text)",marginBottom:2}}>Tell me what you've read</div>
          <div style={{fontSize:11.5,color:"var(--muted)",lineHeight:1.45}}>Speak naturally — titles, what you liked, what you didn't finish.</div>
        </div>
        {errMsg&&<div style={{fontSize:11,color:"#e07060",textAlign:"right",maxWidth:130,lineHeight:1.4}}>{errMsg}</div>}
      </button>
    </div>
  );
}


// ── BOOKSHELF SCAN ─────────────────────────────────────────────────────────────
// Photo-based shelf import. Sends image to Claude Vision, extracts titles,
// confidence-buckets them, lets user confirm, then asks which they enjoyed.

function resizeImageToBase64(file, maxPx = 1400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width  * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      const data = canvas.toDataURL("image/jpeg", 0.88).split(",")[1];
      resolve(data);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function matchLocalBook(title, author, localBooks) {
  if (!localBooks?.length) return null;
  let best = null, bestSim = 0;
  for (const b of localBooks) {
    const ts = strSim(title, b.title);
    const as = author ? strSim(author, b.author || "") : 0;
    const score = ts * 0.75 + as * 0.25;
    if (score > bestSim && ts > 0.6) { bestSim = score; best = b; }
  }
  return best;
}

const BSS_BUCKET = { confident:"confident", review:"review", unknown:"unknown" };

function BookshelfScan({ onAdd, localBooks = [] }) {
  const [phase, setPhase]     = useState("idle");  // idle | processing | review | enjoying
  const [preview, setPreview] = useState(null);     // object URL for photo preview
  const [books, setBooks]     = useState([]);       // [{id,title,author,confidence,note,isbn,color,included}]
  const [enjoyed, setEnjoyed] = useState({});       // { id: "loved"|"liked"|null }
  const [errMsg, setErrMsg]   = useState(null);
  const fileRef = useRef(null);

  const bucket = (c) => c >= 0.82 ? BSS_BUCKET.confident : c >= 0.50 ? BSS_BUCKET.review : BSS_BUCKET.unknown;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objUrl = URL.createObjectURL(file);
    setPreview(objUrl);
    setErrMsg(null);
    setPhase("processing");

    try {
      const b64 = await resizeImageToBase64(file);
      const res = await fetch("/api/ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1200,
          system: `You are reading book spines on a shelf. Extract every readable title and author. Handle vertical, angled, and partially obscured text. Return ONLY a raw JSON array — no markdown, no explanation.
Each item: {"title":"string","author":"string","confidence":0.0-1.0,"note":"string"}
confidence: 1.0 = clearly readable, 0.75 = mostly clear, 0.5 = partially readable, 0.3 = guessed.
note: only if uncertain (e.g. "spine obscured", "title partial"). Empty string otherwise.
author: extract only if clearly visible on spine, else empty string.`,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
              { type: "text", text: "List every book title and author visible on this shelf." }
            ]
          }],
        }),
      });
      const data = await res.json();
      const raw  = (data.content?.[0]?.text || "[]").replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) { setErrMsg("No books found. Try a clearer photo."); setPhase("idle"); return; }

      const enriched = parsed.map((b, i) => {
        const local = matchLocalBook(b.title, b.author, localBooks);
        return {
          id: Date.now() + i,
          title: b.title, author: b.author || (local?.author || ""),
          confidence: Math.min(1, Math.max(0, b.confidence ?? 0.5)),
          note: b.note || "",
          isbn:  local?.isbn  || "",
          color: local?.color || ["#1a1408","#0e0c06"],
          included: true,
        };
      }).sort((a, b) => b.confidence - a.confidence);

      setBooks(enriched);
      setPhase("review");
    } catch (err) {
      setErrMsg("Scan failed — try a clearer photo."); setPhase("idle");
    }
    // reset file input so same file can be re-selected
    if (fileRef.current) fileRef.current.value = "";
  };

  const toggleInclude = (id) => setBooks(p => p.map(b => b.id === id ? { ...b, included: !b.included } : b));
  const editTitle     = (id, title) => setBooks(p => p.map(b => b.id === id ? { ...b, title } : b));
  const removeBook    = (id) => setBooks(p => p.filter(b => b.id !== id));

  const proceedToEnjoy = () => {
    const init = {};
    books.filter(b => b.included).forEach(b => { init[b.id] = null; });
    setEnjoyed(init);
    setPhase("enjoying");
  };

  const toggleEnjoy = (id) => {
    setEnjoyed(prev => {
      const cur = prev[id];
      return { ...prev, [id]: cur === "loved" ? "liked" : cur === "liked" ? null : "loved" };
    });
  };

  const confirmAll = () => {
    const toAdd = books.filter(b => b.included).map(b => ({
      id: b.id, title: b.title, author: b.author,
      isbn: b.isbn, color: b.color,
      rating: enjoyed[b.id] === "loved" ? 5 : enjoyed[b.id] === "liked" ? 4 : 3,
      _reaction: enjoyed[b.id] === "loved" ? "loved" : null,
      _reason: "",
    }));
    onAdd(toAdd);
    setPhase("idle"); setBooks([]); setPreview(null); setEnjoyed({}); setErrMsg(null);
  };

  // ── ENJOYING ──
  if (phase === "enjoying") {
    const included = books.filter(b => b.included);
    return (
      <div style={{ margin:"0 0 20px", padding:"16px", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.09)", borderRadius:"var(--r-lg)" }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:"2px", textTransform:"uppercase", color:"var(--gold)", marginBottom:4 }}>One last thing</div>
        <div style={{ fontFamily:"'Lora',serif", fontSize:17, fontWeight:700, color:"var(--text)", marginBottom:4 }}>Which of these did you enjoy?</div>
        <div style={{ fontSize:12, color:"var(--muted)", marginBottom:16 }}>Tap once for liked · twice for loved · again to clear</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(80px, 1fr))", gap:10, marginBottom:18 }}>
          {included.map(b => {
            const feel = enjoyed[b.id];
            return (
              <div key={b.id} onClick={() => toggleEnjoy(b.id)} style={{ cursor:"pointer", textAlign:"center" }}>
                <div style={{ position:"relative", width:"100%", aspectRatio:"2/3", borderRadius:8, overflow:"hidden", marginBottom:5, boxShadow:"0 4px 16px rgba(0,0,0,.45)", border: feel ? `2px solid ${feel==="loved"?"var(--gold)":"rgba(255,255,255,.3)"}` : "2px solid transparent", transition:"border-color .15s" }}>
                  <BookCover isbn={b.isbn} title={b.title} author={b.author} color={b.color} className="fill"/>
                  {feel && (
                    <div style={{ position:"absolute", top:4, right:4, width:20, height:20, borderRadius:"50%", background: feel==="loved" ? "var(--gold)" : "rgba(255,255,255,.85)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#060402" }}>
                      {feel==="loved" ? "★" : "✓"}
                    </div>
                  )}
                </div>
                <div style={{ fontSize:10, color: feel ? "var(--text)" : "var(--muted)", lineHeight:1.3, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{b.title}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={confirmAll} style={{ flex:1, padding:"11px", borderRadius:"var(--r-lg)", border:"none", background:"var(--gold)", color:"#060402", fontSize:13, fontWeight:700, cursor:"pointer" }}>
            Add {included.length} book{included.length!==1?"s":""} to shelf
          </button>
          <button onClick={() => setPhase("review")} style={{ padding:"11px 14px", borderRadius:"var(--r-lg)", border:"1px solid rgba(255,255,255,.1)", background:"transparent", color:"var(--muted)", fontSize:13, cursor:"pointer" }}>Back</button>
        </div>
      </div>
    );
  }

  // ── REVIEW ──
  if (phase === "review") {
    const confident = books.filter(b => bucket(b.confidence) === BSS_BUCKET.confident);
    const needsReview = books.filter(b => bucket(b.confidence) === BSS_BUCKET.review);
    const unknown = books.filter(b => bucket(b.confidence) === BSS_BUCKET.unknown);
    const includedCount = books.filter(b => b.included).length;

    const BookReviewCard = ({ b }) => (
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 10px", background: b.included ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.02)", borderRadius:"var(--r-md)", border:`1px solid ${b.included ? "rgba(255,255,255,.09)" : "rgba(255,255,255,.04)"}`, transition:"all .15s", opacity: b.included ? 1 : 0.45 }}>
        <div style={{ width:36, height:52, borderRadius:5, overflow:"hidden", flexShrink:0, position:"relative" }}>
          <BookCover isbn={b.isbn} title={b.title} author={b.author} color={b.color} className="fill"/>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <input
            value={b.title}
            onChange={e => editTitle(b.id, e.target.value)}
            style={{ width:"100%", background:"transparent", border:"none", outline:"none", fontFamily:"'Lora',serif", fontSize:12.5, fontWeight:700, color:"var(--text)", padding:0, lineHeight:1.25, marginBottom:2 }}
          />
          {b.author && <div style={{ fontSize:10.5, color:"var(--muted)" }}>{b.author}</div>}
          {b.note && <div style={{ fontSize:10, color:"#d4941a88", marginTop:2 }}>{b.note}</div>}
        </div>
        <div style={{ display:"flex", gap:5, flexShrink:0 }}>
          <button onClick={() => toggleInclude(b.id)} style={{ width:26, height:26, borderRadius:"50%", border:`1.5px solid ${b.included?"var(--gold)":"rgba(255,255,255,.15)"}`, background: b.included ? "var(--gold)" : "transparent", color: b.included ? "#060402" : "var(--muted)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:12, fontWeight:700 }}>
            {b.included ? "✓" : "+"}
          </button>
          <button onClick={() => removeBook(b.id)} style={{ width:26, height:26, borderRadius:"50%", border:"1px solid rgba(255,255,255,.1)", background:"transparent", color:"var(--muted)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:14 }}>×</button>
        </div>
      </div>
    );

    return (
      <div style={{ margin:"0 0 20px", padding:"16px", background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.09)", borderRadius:"var(--r-lg)" }}>
        {preview && <div style={{ borderRadius:"var(--r-md)", overflow:"hidden", marginBottom:14, maxHeight:140 }}><img src={preview} alt="shelf" style={{ width:"100%", height:140, objectFit:"cover", opacity:.7 }}/></div>}

        {confident.length > 0 && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:"1.5px", textTransform:"uppercase", color:"var(--gold)", marginBottom:8 }}>Confident — {confident.length} found</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>{confident.map(b => <BookReviewCard key={b.id} b={b}/>)}</div>
          </div>
        )}

        {needsReview.length > 0 && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:"1.5px", textTransform:"uppercase", color:"var(--muted)", marginBottom:8 }}>Double-check these</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>{needsReview.map(b => <BookReviewCard key={b.id} b={b}/>)}</div>
          </div>
        )}

        {unknown.length > 0 && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:"1.5px", textTransform:"uppercase", color:"rgba(255,255,255,.25)", marginBottom:8 }}>Unclear</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>{unknown.map(b => <BookReviewCard key={b.id} b={b}/>)}</div>
          </div>
        )}

        <div style={{ display:"flex", gap:8, marginTop:4 }}>
          <button onClick={proceedToEnjoy} disabled={includedCount === 0} style={{ flex:1, padding:"11px", borderRadius:"var(--r-lg)", border:"none", background: includedCount > 0 ? "var(--gold)" : "rgba(255,255,255,.08)", color: includedCount > 0 ? "#060402" : "var(--muted)", fontSize:13, fontWeight:700, cursor: includedCount > 0 ? "pointer" : "default" }}>
            Continue with {includedCount} book{includedCount!==1?"s":""}
          </button>
          <button onClick={() => { setPhase("idle"); setBooks([]); setPreview(null); }} style={{ padding:"11px 14px", borderRadius:"var(--r-lg)", border:"1px solid rgba(255,255,255,.1)", background:"transparent", color:"var(--muted)", fontSize:13, cursor:"pointer" }}>Cancel</button>
        </div>
      </div>
    );
  }

  // ── PROCESSING ──
  if (phase === "processing") {
    return (
      <div style={{ margin:"0 0 20px", borderRadius:"var(--r-lg)", overflow:"hidden", border:"1px solid rgba(255,255,255,.08)", position:"relative" }}>
        {preview && <img src={preview} alt="" style={{ width:"100%", height:160, objectFit:"cover", opacity:.4 }}/>}
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10 }}>
          <div style={{ display:"flex", gap:5 }}>{[0,1,2].map(i=><div key={i} className="ls-dot" style={{ animationDelay:`${i*0.18}s` }}/>)}</div>
          <div style={{ fontSize:12, color:"var(--text2)", fontWeight:500 }}>Reading your shelf…</div>
        </div>
      </div>
    );
  }

  // ── IDLE ──
  return (
    <div style={{ margin:"0 0 16px" }}>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={handleFile}/>
      <button
        onClick={() => fileRef.current?.click()}
        style={{ width:"100%", padding:"14px 16px", display:"flex", alignItems:"center", gap:12, background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.09)", borderRadius:"var(--r-lg)", cursor:"pointer", transition:"all .2s", textAlign:"left" }}
        onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.07)"}
        onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.04)"}
      >
        <div style={{ width:36, height:36, borderRadius:"50%", background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.12)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:600, color:"var(--text)", marginBottom:2 }}>Scan your bookshelf</div>
          <div style={{ fontSize:11.5, color:"var(--muted)", lineHeight:1.45 }}>Take a photo — we'll find the books automatically.</div>
        </div>
        {errMsg && <div style={{ fontSize:11, color:"#e07060", textAlign:"right", maxWidth:120, lineHeight:1.4 }}>{errMsg}</div>}
      </button>
    </div>
  );
}


// ── LINK CARD — detects pasted URLs, extracts book, handles intent ─────────────
function LinkCard({ card, onDismiss, onReact, onConsider }) {
  const LC_REACTIONS = [
    { key:"loved",        label:"Loved it",      bg:"rgba(212,148,26,.22)", color:"var(--gold)" },
    { key:"liked",        label:"Liked it",      bg:"rgba(255,255,255,.10)", color:"var(--text2)" },
    { key:"didnt_like",   label:"Didn't like",   bg:"rgba(184,64,40,.18)",  color:"#e07060" },
    { key:"didnt_finish", label:"Didn't finish", bg:"rgba(255,255,255,.06)", color:"var(--muted)" },
  ];

  if (card.phase === "loading") return (
    <div style={{ margin:"0 16px 8px", padding:"12px 14px", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.09)", borderRadius:"var(--r-lg)", display:"flex", alignItems:"center", gap:10 }}>
      <div style={{ display:"flex", gap:4 }}>{[0,1,2].map(i=><div key={i} className="ls-dot" style={{ width:5, height:5, animationDelay:`${i*0.18}s` }}/>)}</div>
      <div style={{ fontSize:12, color:"var(--muted)" }}>Looking up that book…</div>
      <button onClick={onDismiss} style={{ marginLeft:"auto", background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:16, lineHeight:1 }}>×</button>
    </div>
  );

  if (card.phase === "reacting") return (
    <div style={{ margin:"0 16px 8px", padding:"12px 14px", background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.09)", borderRadius:"var(--r-lg)" }}>
      <div style={{ fontFamily:"'Lora',serif", fontSize:13, fontWeight:700, color:"var(--text)", marginBottom:2 }}>{card.book?.title}</div>
      {card.book?.author && <div style={{ fontSize:11, color:"var(--muted)", marginBottom:10 }}>{card.book.author}</div>}
      <div style={{ fontSize:11.5, color:"var(--text2)", marginBottom:9 }}>How was it?</div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
        {LC_REACTIONS.map(r => (
          <button key={r.key} onClick={() => onReact(r.key)} style={{ padding:"5px 11px", borderRadius:99, border:"none", background:r.bg, color:r.color, fontSize:11.5, fontWeight:600, cursor:"pointer" }}>
            {r.label}
          </button>
        ))}
      </div>
      <button onClick={onDismiss} style={{ marginTop:8, background:"none", border:"none", color:"var(--muted)", fontSize:11, cursor:"pointer", padding:0 }}>Dismiss</button>
    </div>
  );

  // asking phase
  const book = card.book;
  return (
    <div style={{ margin:"0 16px 8px", padding:"12px 14px", background:"rgba(255,255,255,.05)", border:"1px solid rgba(212,148,26,.18)", borderRadius:"var(--r-lg)" }}>
      <div style={{ display:"flex", gap:10, marginBottom:10 }}>
        <div style={{ width:36, height:52, borderRadius:6, overflow:"hidden", flexShrink:0, position:"relative" }}>
          <BookCover isbn={book?.isbn||""} title={book?.title||""} author={book?.author||""} color={["#1e1408","#0e0c06"]} className="fill"/>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontFamily:"'Lora',serif", fontSize:13.5, fontWeight:700, color:"var(--text)", lineHeight:1.25, marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{book?.title || "Unknown book"}</div>
          {book?.author && <div style={{ fontSize:11, color:"var(--muted)", marginBottom:4 }}>{book.author}</div>}
          {book?.description && <div style={{ fontSize:11.5, color:"var(--text2)", lineHeight:1.45 }}>{book.description}</div>}
        </div>
        <button onClick={onDismiss} style={{ alignSelf:"flex-start", background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:16, lineHeight:1, flexShrink:0 }}>×</button>
      </div>
      <div style={{ fontSize:12, color:"var(--text2)", marginBottom:8, fontWeight:500 }}>Did you read this or are you considering it?</div>
      <div style={{ display:"flex", gap:7 }}>
        <button onClick={() => onReact(null)} style={{ flex:1, padding:"8px", borderRadius:"var(--r-md)", border:"none", background:"var(--gold)", color:"#060402", fontSize:12, fontWeight:700, cursor:"pointer" }}>I read it</button>
        <button onClick={onConsider} style={{ flex:1, padding:"8px", borderRadius:"var(--r-md)", border:"1px solid rgba(255,255,255,.12)", background:"transparent", color:"var(--text2)", fontSize:12, fontWeight:600, cursor:"pointer" }}>Considering it</button>
      </div>
    </div>
  );
}

// Book cover — real cover from Open Library, premium designed fallback
// ── MIC BUTTON — voice input via Web Speech API ───────────────────────────────
function MicButton({ onTranscript }) {
  const [listening, setListening] = useState(false);
  const recogRef = useRef(null);

  const toggle = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    if (listening) {
      recogRef.current?.stop();
      setListening(false);
      return;
    }

    const r = new SR();
    r.lang = "en-US";
    r.interimResults = false;
    r.maxAlternatives = 1;
    recogRef.current = r;

    r.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      onTranscript(transcript);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);

    r.start();
    setListening(true);
  };

  // Only render if speech API available
  if (typeof window !== "undefined" && !window.SpeechRecognition && !window.webkitSpeechRecognition) return null;

  return (
    <button
      onClick={toggle}
      title={listening ? "Tap to stop" : "Tap to speak"}
      style={{
        width:46, height:46, borderRadius:14, border:"none", flexShrink:0,
        background: listening ? "rgba(212,148,26,.25)" : "rgba(255,255,255,.07)",
        color: listening ? "var(--gold)" : "var(--muted)",
        display:"flex", alignItems:"center", justifyContent:"center",
        cursor:"pointer", transition:"all .2s",
        boxShadow: listening ? "0 0 0 2px rgba(212,148,26,.4)" : "none",
        animation: listening ? "micPulse 1.2s ease-in-out infinite" : "none",
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    </button>
  );
}

// ── FRIEND PROMPT — context-aware opening nudge ───────────────────────────────
const FRIEND_PROMPTS = [
  "Still reading that one?",
  "Did you finish it?",
  "That one felt slower than your usual picks.",
  "You'd probably like something faster next.",
  "How was it?",
  "Worth it or no?",
  "You usually finish books like this fast — what happened?",
];

function getFriendPrompt(memory) {
  if (memory?.lastReaction === "too slow") return "Want something faster this time?";
  if (memory?.lastReaction === "loved")    return "Want something like that again?";
  if (memory?.lastStarted)                 return `How's ${memory.lastStarted.split(":")[0].split(" ").slice(0,4).join(" ")} going?`;
  return FRIEND_PROMPTS[Math.floor(Math.random() * FRIEND_PROMPTS.length)];
}

// ── TOP MOMENT — the one thing worth saying ──────────────────────────────────
// Uses rankAndSurface + logOutcome (public API, matches external ranking-engine.js)
// Runs once on mount (or when rerunKey changes). Never re-ranks on every render.
// ── Chat intent detection ─────────────────────────────────────────────────────
// Reads the last few user messages to understand what they want next.
// Returns { intent, prompt, cta } if a clear signal exists, null otherwise.
function detectChatIntent(recentMsgs = []) {
  const userMsgs = recentMsgs.filter(m => m.role === "user").map(m => m.content?.toLowerCase() || "");
  const last = userMsgs[userMsgs.length - 1] || "";
  const prev = userMsgs[userMsgs.length - 2] || "";
  const combined = last + " " + prev;

  // "I loved it / it was great / amazing" → find more like it
  if (/(loved?|amazing|great|brilliant|fantastic|incredible|obsessed|devoured|couldn.t put)/.test(combined)) {
    // Extract what they loved — look for quoted title or book mentioned by AI
    const titleMatch = combined.match(/[""]([^""]+)[""]/);
    const title = titleMatch?.[1] || null;
    if (title) return {
      msg: `Want something that hits the same way as ${title.split(":")[0]}?`,
      prompt: `I loved "${title}". Find me more books with exactly that same feeling — same emotional tone, similar pacing, same kind of payoff.`,
      cta: null,
    };
    return {
      msg: "Want me to find more like it?",
      prompt: "Based on what I just said I loved, find me 2-3 books with the same feeling. Be specific about why they match.",
      cta: null,
    };
  }

  // "I abandoned it / stopped / couldn't get into it"
  if (/(abandoned|stopped|gave up|couldn.t get into|too slow|boring|quit|dnf)/.test(combined)) {
    return {
      msg: "Want something with more momentum?",
      prompt: "I just abandoned a book. Find me something faster-paced that I'm very likely to actually finish — something I won't want to put down.",
      cta: null,
    };
  }

  // "I finished it"
  if (/(finished|just finished|done|completed|read it|got through)/.test(combined)) {
    return {
      msg: "What should be next?",
      prompt: "I just finished a book. Based on what I've told you about it and how I felt, what should I read next? Be specific.",
      cta: null,
    };
  }

  // "something dark / funny / fast / emotional" — mood request
  const moodMap = [
    { pattern: /(dark|dark(?:er)?|grim|bleak)/, msg: "Something dark coming up.", prompt: "Find me something genuinely dark — not just tense, but dark in tone and subject matter. Something that doesn't soften it." },
    { pattern: /(funny|laugh|humor|light(?:er)?|fun)/, msg: "Something to make you actually laugh.", prompt: "Find me something genuinely funny — not just charming, actually funny. Good writing that also makes you laugh." },
    { pattern: /(fast|quick|pag?e.turner|couldn.t stop|one.sitting)/, msg: "Something you won't be able to put down.", prompt: "Find me the most propulsive, can't-stop-reading book that fits my taste. Prioritize momentum above everything else." },
    { pattern: /(emotional|cry|moving|feel|heart|sad)/, msg: "Something that'll actually move you.", prompt: "Find me something emotionally powerful — the kind of book that earns its emotion rather than manufacturing it." },
    { pattern: /(smart|intelligent|ideas|think|mind.expanding)/, msg: "Something to genuinely challenge you.", prompt: "Find me something intellectually ambitious — a book that changes how I think about something, fiction or non-fiction." },
  ];
  for (const { pattern, msg, prompt } of moodMap) {
    if (pattern.test(combined)) return { msg, prompt, cta: null };
  }

  return null;
}

function TopMoment({ intelligence, signalCandidates, recCandidates, behavioral, context, lastSurfaced, recentlyFailedGenres, handlers, onOpenChat, rerunKey, recentMsgs = [] }) {
  const [moment, setMoment] = useState(null);
  const [exiting, setExiting] = useState(false);
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const typingRef = useRef(null);

  useEffect(() => {
    // Chat intent takes priority — if user said something specific, respond to that
    const chatIntent = detectChatIntent(recentMsgs);
    if (chatIntent) {
      const m = { id:"chat-intent", kind:"nudge", type:"chat_response", finalScore:1.0, ...chatIntent };
      setMoment(m);
      setDisplayed(""); setDone(false);
      return;
    }
    const result = rankAndSurface({
      intelligence, signalCandidates, recCandidates, behavioral,
      context, lastSurfaced, recentlyFailedGenres,
    });
    if (result) {
      setMoment(result);
      setDisplayed(""); setDone(false);
      logOutcome(result, "shown", handlers);
    }
  }, [rerunKey, recentMsgs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Typing animation
  useEffect(() => {
    if (!moment?.msg) return;
    const msg = moment.msg;
    let i = 0;
    clearInterval(typingRef.current);
    setDisplayed(""); setDone(false);
    const start = setTimeout(() => {
      typingRef.current = setInterval(() => {
        i++;
        setDisplayed(msg.slice(0, i));
        if (i >= msg.length) { clearInterval(typingRef.current); setDone(true); }
      }, 26);
    }, 280);
    return () => { clearTimeout(start); clearInterval(typingRef.current); };
  }, [moment]);

  if (!moment) return null;

  const handleClick = () => {
    logOutcome(moment, "tapped", handlers);
    if (onOpenChat) onOpenChat(moment);
  };

  const handleDismiss = () => {
    setExiting(true);
    clearInterval(typingRef.current);
    logOutcome(moment, "dismissed", handlers);
    setTimeout(() => setMoment(null), 220);
  };

  return (
    <div
      className={`ls-moment-card ${exiting ? "exiting" : ""}`}
      onClick={done ? handleClick : undefined}
      style={{ minHeight:72, cursor: done ? "pointer" : "default" }}
    >
      {/* Sage label */}
      <div style={{
        fontSize:8, fontWeight:700, letterSpacing:"2.5px", textTransform:"uppercase",
        color:"rgba(212,148,26,.5)", marginBottom:9,
        display:"flex", alignItems:"center", gap:7,
      }}>
        <div style={{
          width:16, height:16, borderRadius:"50%",
          background:"rgba(212,148,26,.1)", border:"1px solid rgba(212,148,26,.2)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:8, color:"var(--gold)",
        }}>✦</div>
        Sage
      </div>
      {/* Typing text */}
      <div className="ls-moment-msg" style={{paddingRight:28}}>
        {displayed}
        {!done && (
          <span style={{display:"inline-block",width:2,height:13,background:"var(--gold)",marginLeft:2,verticalAlign:"middle",animation:"blink .6s ease infinite"}}/>
        )}
        {/* After typing, show a subtle tap-to-continue arrow instead of a button */}
        {done && (
          <span style={{
            display:"inline-block", marginLeft:8,
            color:"var(--gold)", fontSize:13, verticalAlign:"middle",
            animation:"fadeIn .4s ease",
          }}>→</span>
        )}
      </div>
      <button className="ls-moment-dismiss" onClick={(e)=>{e.stopPropagation();handleDismiss();}}>×</button>
    </div>
  );
}

function FriendNudge({ nudge, memory, onAct, onDismiss }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  // Use structured nudge if available, otherwise fall back to friend prompt
  const msg  = nudge?.msg  || getFriendPrompt(memory);
  const cta  = nudge?.cta  || null;
  const prompt = nudge?.prompt || null;

  const dismiss = () => { setVisible(false); onDismiss?.(); };

  return (
    <div style={{
      margin:"16px 20px 4px",
      padding:"14px 16px",
      background:"rgba(255,255,255,.055)",
      backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)",
      border:"1px solid rgba(255,255,255,.10)",
      borderRadius:"var(--r-lg)",
      position:"relative",
    }}>
      <button onClick={dismiss} style={{
        position:"absolute", top:10, right:12,
        background:"none", border:"none", color:"var(--muted)",
        fontSize:16, cursor:"pointer", lineHeight:1, padding:"2px 4px",
      }}>×</button>
      <div style={{
        fontSize:14.5, color:"var(--text)", lineHeight:1.55,
        fontFamily:"'Lora',serif", fontWeight:600,
        marginBottom: cta ? 12 : 0, paddingRight:20,
      }}>{msg}</div>
      {cta && prompt && (
        <button onClick={() => { dismiss(); onAct(prompt); }} style={{
          padding:"8px 16px", borderRadius:"var(--r-pill)", border:"none",
          background:"var(--gold)", color:"#060402",
          fontSize:12.5, fontWeight:700, cursor:"pointer",
          boxShadow:"0 2px 12px rgba(212,148,26,.3)",
        }}>{cta} →</button>
      )}
    </div>
  );
}

// ── SIGNAL MOMENT — casual "I saw..." observation ─────────────────────────────
function SignalMoment({ signal, onAct, onDismiss }) {
  const [visible, setVisible] = useState(true);
  if (!signal || !visible) return null;
  // Use engine-rendered msg if available, fall back to static msg
  const message = signal.msg || "";
  return (
    <div style={{
      margin:"8px 20px",
      padding:"13px 16px",
      background:"rgba(212,148,26,.06)",
      border:"1px solid rgba(212,148,26,.15)",
      borderRadius:"var(--r-lg)",
      backdropFilter:"blur(12px)",
      position:"relative",
    }}>
      <button onClick={() => { setVisible(false); onDismiss(signal.id, signal); }} style={{
        position:"absolute", top:10, right:12,
        background:"none", border:"none", color:"var(--muted)",
        fontSize:16, cursor:"pointer", lineHeight:1, padding:"2px 4px",
      }}>×</button>
      <div style={{
        fontSize:13.5, color:"var(--text2)", lineHeight:1.6,
        paddingRight:20, marginBottom:10,
      }}>
        {message}
      </div>
      <button
        onClick={() => { setVisible(false); onDismiss(signal.id, signal); onAct(signal.prompt, signal); }}
        style={{
          background:"none", border:"none", color:"var(--gold)",
          fontSize:12.5, fontWeight:600, cursor:"pointer", padding:0,
        }}
      >{signal.cta} →</button>
    </div>
  );
}

// ── BOOK COVER ──────────────────────────────────────────────────────────────
function BookCover({ isbn, title, author = "", color = ["#1a1408","#0e0c06"], className = "", style = {} }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError]   = useState(false);
  const hasIsbn = isbn && isbn !== "undefined" && isbn !== "null";
  const url = hasIsbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg` : null;

  return (
    <div className={`ls-book-cover ${className}`}
      style={{ background:`linear-gradient(155deg, ${color[0]} 0%, ${color[1]} 100%)`, ...style }}>
      {hasIsbn && !error && (
        <img src={url} alt={title}
          onLoad={(e) => { if (e.target.naturalWidth > 5) setLoaded(true); else setError(true); }}
          onError={() => setError(true)}
          style={{ display: loaded ? "block" : "none", position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }}/>
      )}
      {(!hasIsbn || !loaded || error) && (
        <div className="ls-book-cover-fallback">
          <div className="ls-book-cover-title">{title}</div>
          {author && <div className="ls-book-cover-author">{author}</div>}
        </div>
      )}
    </div>
  );
}

// ── BOOK DETAIL SHEET ─────────────────────────────────────────────────────────
// Glass overlay that slides up when a book tile is tapped.
// Shows cover + full conviction pitch side by side.
// Second tap or "More" button opens the full TileModal.

function BookDetailSheet({ book: b, onClose, onAsk, isSaved, onSave, onDismiss, onMore, userState }) {
  const [exiting, setExiting] = useState(false);
  const pitch  = getFavoriteBookPitch(b, userState || {});
  const reason = getRecommendationReason(b, userState || {});

  const close = () => { setExiting(true); setTimeout(onClose, 280); };

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:200,
      display:"flex", alignItems:"flex-end",
    }} onClick={close}>
      {/* Backdrop */}
      <div style={{
        position:"absolute", inset:0,
        background:"rgba(4,2,1,.6)",
        backdropFilter:"blur(18px)",
        WebkitBackdropFilter:"blur(18px)",
      }}/>
      {/* Sheet */}
      <div
        onClick={e=>e.stopPropagation()}
        style={{
          position:"relative", width:"100%", maxWidth:480, margin:"0 auto",
          background:"rgba(18,14,9,.96)",
          borderRadius:"24px 24px 0 0",
          border:"1px solid rgba(255,255,255,.1)",
          borderBottom:"none",
          padding:"0 0 40px",
          transform: exiting ? "translateY(100%)" : "translateY(0)",
          transition:"transform .28s cubic-bezier(.32,.72,0,1)",
          maxHeight:"78dvh",
          overflowY:"auto",
        }}
      >
        <div style={{width:40,height:4,background:"rgba(255,255,255,.15)",borderRadius:2,margin:"14px auto 20px"}}/>

        {/* Cover + meta row */}
        <div style={{display:"flex",gap:16,padding:"0 20px 16px"}}>
          <div style={{width:80,height:118,borderRadius:10,overflow:"hidden",flexShrink:0,boxShadow:"0 8px 28px rgba(0,0,0,.65)",position:"relative"}}>
            <BookCover isbn={b.isbn} title={b.title} author={b.author} color={b.color} className="fill"/>
          </div>
          <div style={{flex:1,minWidth:0,paddingTop:4}}>
            <div style={{fontFamily:"'Lora',serif",fontSize:18,fontWeight:700,color:"var(--text)",lineHeight:1.3,marginBottom:4}}>{b.title}</div>
            <div style={{fontSize:12,color:"rgba(212,148,26,.8)",marginBottom:10}}>{b.author}</div>
            {b.tags?.slice(0,2).map(t=>(
              <span key={t} style={{display:"inline-block",fontSize:10,fontWeight:600,padding:"3px 9px",borderRadius:99,background:"rgba(255,255,255,.07)",color:"var(--text2)",marginRight:5,marginBottom:5}}>{t}</span>
            ))}
            <div style={{fontSize:11,color:"var(--gold)",fontWeight:700,marginTop:4}}>{b.score}% match</div>
          </div>
        </div>

        {/* Divider */}
        <div style={{height:1,background:"rgba(255,255,255,.06)",margin:"0 20px 16px"}}/>

        {/* Full conviction pitch */}
        <div style={{padding:"0 20px 20px"}}>
          <div style={{
            fontSize:8.5, fontWeight:700, letterSpacing:"2px",
            textTransform:"uppercase", color:"rgba(212,148,26,.7)",
            marginBottom:10,
          }}>Why this could be your next favorite</div>
          <div style={{
            fontSize:14, lineHeight:1.75,
            color:"rgba(240,232,216,.9)",
            fontFamily:"'Lora',serif",
            fontStyle:"italic",
          }} dangerouslySetInnerHTML={{__html: pitch || reason || b.why || ""}}/>
        </div>

        {/* Actions */}
        <div style={{padding:"0 20px",display:"flex",gap:10,flexDirection:"column"}}>
          <div style={{display:"flex",gap:10}}>
            <button
              onClick={() => { if (!isSaved) onSave(b); }}
              style={{
                flex:2, padding:"13px", borderRadius:12, border:"none",
                background: isSaved ? "rgba(212,148,26,.15)" : "var(--gold)",
                color: isSaved ? "var(--gold)" : "#060402",
                fontSize:14, fontWeight:700, cursor: isSaved?"default":"pointer",
                ...(isSaved?{border:"1px solid rgba(212,148,26,.3)"}:{}),
              }}
            >{isSaved ? "✓ Saved to read" : "Save to Read"}</button>
            <button
              onClick={() => { onDismiss(b.id); close(); }}
              style={{
                flex:1, padding:"13px", borderRadius:12,
                border:"1px solid rgba(255,255,255,.12)",
                background:"transparent", color:"var(--muted)",
                fontSize:13, fontWeight:500, cursor:"pointer",
              }}
            >Not for me</button>
          </div>
          <button
            onClick={() => { close(); setTimeout(()=>onMore(b),300); }}
            style={{
              width:"100%", padding:"12px", borderRadius:12,
              border:"1px solid rgba(255,255,255,.1)",
              background:"rgba(255,255,255,.05)",
              color:"var(--text2)", fontSize:13, fontWeight:600, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center", gap:7,
            }}
          >
            <MessageSquare size={13}/> Ask about this book
          </button>
        </div>
      </div>
    </div>
  );
}

function BookTile({ book: b, onAsk, onTap, scrollScale = 1, isFirst, isLast, isSaved, onSave, onDismiss, userState, rowContext, onShowDetail }) {
  const [dismissing, setDismissing] = useState(false);
  const [elevated,   setElevated]   = useState(false);
  const isTouchRef    = useRef(false);
  const tileRef       = useRef(null);
  const hoverTimerRef = useRef(null);

  // Scroll tile to horizontal center of its track, then open detail
  const handleClick = () => {
    // Center in the horizontal scroll container
    tileRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    // Brief visual elevation
    setElevated(true);
    setTimeout(() => setElevated(false), 480);
    if (isTouchRef.current) {
      isTouchRef.current = false;
      onShowDetail?.(b);
    }
  };

  const handleMouseEnter = () => {
    if (isTouchRef.current) return;
    hoverTimerRef.current = setTimeout(() => onShowDetail?.(b), 900);
  };
  const handleMouseLeave = () => { clearTimeout(hoverTimerRef.current); };
  const handleTouchStart = () => { isTouchRef.current = true; clearTimeout(hoverTimerRef.current); };

  const handleSaveClick = (e) => {
    e.stopPropagation();
    if (!isSaved) onSave(b);
  };

  const handleDismissClick = (e) => {
    e.stopPropagation();
    setDismissing(true);
    setTimeout(() => onDismiss(b.id), 320);
  };

  const finalScale = scrollScale;
  const origin = isFirst ? "left center" : isLast ? "right center" : "center center";

  return (
    <div
      ref={tileRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onClick={handleClick}
      style={{
        flexShrink: 0, position: "relative", cursor: "pointer",
        opacity: dismissing ? 0 : 1,
        transform: dismissing ? "translateY(-10px) scale(.93)" : undefined,
        pointerEvents: dismissing ? "none" : undefined,
        transition: "opacity .3s ease, transform .3s ease",
      }}
    >
      <div style={{
        width: 150,
        height: 220,
        transform: elevated
          ? `scale(${Math.max(finalScale, 1.14)}) translateY(-6px)`
          : `scale(${finalScale})`,
        transformOrigin: origin,
        transition: elevated
          ? "transform .22s cubic-bezier(.34,1.56,.64,1), box-shadow .22s ease"
          : "transform .3s cubic-bezier(.2,.8,.2,1), box-shadow .3s ease",
        borderRadius: 10,
        overflow: "hidden", position: "relative",
        boxShadow: elevated
          ? "0 18px 52px rgba(0,0,0,.80), 0 0 0 2px rgba(212,148,26,.55)"
          : scrollScale > 1.05
            ? "0 12px 32px rgba(0,0,0,.7), 0 0 0 1px rgba(212,148,26,.2)"
            : "0 2px 8px rgba(0,0,0,.4)",
      }}>
        <BookCover isbn={b.isbn} title={b.title} author={b.author} color={b.color} className="fill"/>

        {/* Score badge */}
        <div style={{
          position:"absolute", top:7, right:7, zIndex:2,
          fontSize:9, fontWeight:700, color:"var(--gold)",
          background:"rgba(10,8,6,.82)", backdropFilter:"blur(4px)",
          padding:"2px 6px", borderRadius:99, border:"1px solid rgba(212,148,26,.25)",
        }}>{b.score}%</div>

        {/* Saved pip */}
        {isSaved && (
          <div style={{
            position:"absolute", bottom:7, left:7, zIndex:2,
            fontSize:8, fontWeight:700, color:"var(--gold)",
            background:"rgba(10,8,6,.9)", backdropFilter:"blur(4px)",
            padding:"2px 6px", borderRadius:99, border:"1px solid rgba(212,148,26,.4)",
          }}>✓</div>
        )}
      </div>
      {/* Title below */}
      <div style={{marginTop:6,width:150}}>
        <div style={{fontSize:11.5,fontWeight:600,color:"var(--text2)",lineHeight:1.3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.title}</div>
        <div style={{fontSize:10.5,color:"var(--muted)",fontStyle:"italic",marginTop:1}}>{b.author}</div>
      </div>
    </div>
  );
}

// ── BOOK ROW — horizontal scroll with center-scale focal effect ────────────────
function BookRow({ books, title, subtitle, onAsk, onTap, savedBooks, onSave, onDismiss, userState, onShowDetail }) {
  const trackRef = useRef(null);
  const [scales, setScales] = useState(() => books.map((_, i) => i === 0 ? 1.12 : 0.9));

  const calcScales = useCallback(() => {
    const track = trackRef.current;
    if (!track || !track.children.length) return;
    const viewCenter = track.scrollLeft + track.clientWidth / 2;
    const half = track.clientWidth * 0.52;

    const next = Array.from(track.children).map(child => {
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const dist = Math.abs(viewCenter - childCenter);
      const t = Math.max(0, 1 - dist / half);
      // Smooth ease: cubic
      const eased = t * t * (3 - 2 * t);
      // Range: 0.88 (edges) → 1.18 (center)
      return 0.90 + 0.17 * eased;
    });
    setScales(next);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    // Initial calc after layout
    const timer = setTimeout(calcScales, 60);
    track.addEventListener("scroll", calcScales, { passive: true });
    window.addEventListener("resize", calcScales);
    return () => {
      clearTimeout(timer);
      track.removeEventListener("scroll", calcScales);
      window.removeEventListener("resize", calcScales);
    };
  }, [calcScales]);

  return (
    <div style={{marginBottom:0,paddingTop:28}}>
      {/* Row header — stacked title + subtitle */}
      <div style={{padding:"0 16px",marginBottom:10}}>
        <div style={{
          fontFamily:"'Lora',serif",fontSize:15,fontWeight:700,
          color:"var(--text)",letterSpacing:"-.15px",lineHeight:1.2,
        }}>{title}</div>
        {subtitle && (
          <div style={{
            fontSize:11,color:"var(--text2)",marginTop:4,
            fontStyle:"italic",lineHeight:1.4,opacity:.8,
          }}>{subtitle}</div>
        )}
      </div>
      <div
          ref={trackRef}
          style={{
            display:"flex", gap:12,
            overflowX:"auto", overflowY:"visible",
            padding:"16px 16px 24px",
            scrollbarWidth:"none", msOverflowStyle:"none",
            WebkitOverflowScrolling:"touch",
            touchAction:"pan-x",
          }}
        >
          {books.map((b, i) => (
            <BookTile
              key={b.id} book={b}
              scrollScale={scales[i] ?? 1}
              onAsk={onAsk} onTap={onTap}
              isFirst={i===0} isLast={i===books.length-1}
              isSaved={savedBooks?.some(sb => sb.id === b.id) ?? false}
              onSave={onSave}
              onDismiss={onDismiss}
              userState={userState}
              rowContext={title}
              onShowDetail={onShowDetail}
            />
          ))}
        </div>
    </div>
  );
}

// ── TASTE CARD — shows after 3+ ratings ───────────────────────────────────────
function TasteCard({ readBooks, onAddBooks, isPro, onUpgrade }) {
  const count = readBooks.length;
  const level = getTasteLevel(count);
  const genres = detectTopGenres(readBooks);
  const progress = level.next
    ? Math.min(100, ((count - level.min) / (level.next - level.min)) * 100)
    : 100;

  return (
    <div style={{
      margin:"0 16px 24px",
      background:"linear-gradient(135deg,rgba(212,148,26,.08),rgba(212,148,26,.04))",
      border:"1px solid rgba(212,148,26,.18)",
      borderRadius:16, padding:"16px 18px",
    }}>
      {/* Level badge + title */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
        <div style={{fontSize:28,lineHeight:1}}>{level.emoji}</div>
        <div>
          <div style={{fontFamily:"'Lora',serif",fontSize:15,fontWeight:700,color:"var(--text)",lineHeight:1.2}}>{level.label}</div>
          <div style={{fontSize:11,color:"var(--text2)",marginTop:1}}>{count} book{count!==1?"s":""} rated</div>
        </div>
        {isPro && <div style={{marginLeft:"auto",fontSize:10,fontWeight:700,color:"#0a0806",background:"var(--gold)",padding:"2px 8px",borderRadius:99}}>PRO</div>}
      </div>

      {/* Progress bar to next level */}
      {level.next && (
        <div style={{marginBottom:12}}>
          <div style={{height:3,background:"rgba(255,255,255,.08)",borderRadius:99,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${progress}%`,background:"var(--gold)",borderRadius:99,transition:"width .4s ease"}}/>
          </div>
          <div style={{fontSize:10,color:"var(--muted)",marginTop:5}}>
            {level.next - count} more to reach <strong style={{color:"var(--text2)"}}>{TASTE_LEVELS.find(l=>l.min===level.next)?.label}</strong>
          </div>
        </div>
      )}

      {/* Detected genres */}
      {genres.length > 0 && (
        <div style={{marginBottom:12}}>
          <div style={{fontSize:9,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:"var(--muted)",marginBottom:7}}>Your taste</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {genres.map(g=>(
              <span key={g} style={{fontSize:11,fontWeight:600,color:"var(--gold)",background:"rgba(212,148,26,.12)",border:"1px solid rgba(212,148,26,.2)",padding:"3px 10px",borderRadius:99}}>{g}</span>
            ))}
          </div>
        </div>
      )}

      <div style={{fontSize:11.5,color:"var(--text2)",lineHeight:1.6,marginBottom:12,fontStyle:"italic"}}>{level.desc}</div>

      <button
        onClick={onAddBooks}
        style={{display:"flex",alignItems:"center",gap:6,background:"var(--gold)",color:"#0a0806",border:"none",padding:"8px 16px",borderRadius:99,fontSize:12,fontWeight:700,cursor:"pointer"}}
      >+ Rate another book</button>
    </div>
  );
}

// ── QUICK RATE CARD — onboarding when shelf is empty ──────────────────────────
function QuickRateCard({ onRate, onSkip }) {
  const [ratings, setRatings] = useState({});
  const starters = BOOKS.slice(0, 3);
  const ratedCount = Object.keys(ratings).length;

  return (
    <div style={{margin:"0 16px 28px",background:"var(--card)",borderRadius:16,padding:"18px 16px",border:"1px solid rgba(255,255,255,.06)"}}>
      <div style={{fontFamily:"'Lora',serif",fontSize:16,fontWeight:700,color:"var(--text)",marginBottom:4}}>
        Rate a few books.
      </div>
      <div style={{fontSize:13,color:"var(--text2)",marginBottom:16,lineHeight:1.6}}>
        LitSense learns from what you've loved. The more you rate, the smarter your recommendations get.
      </div>

      {starters.map(b=>(
        <div key={b.id} style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <div style={{width:40,height:56,borderRadius:5,overflow:"hidden",flexShrink:0,background:`linear-gradient(145deg,${b.color[0]},${b.color[1]})`}}>
            <BookCover isbn={b.isbn} title={b.title} color={b.color}/>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:"'Lora',serif",fontSize:12.5,fontWeight:600,color:"var(--text)",lineHeight:1.3,marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.title}</div>
            <div style={{fontSize:11,color:"var(--muted)",fontStyle:"italic"}}>{b.author}</div>
          </div>
          <div style={{display:"flex",gap:3,flexShrink:0}}>
            {[1,2,3,4,5].map(s=>(
              <span key={s} onClick={()=>setRatings(r=>({...r,[b.id]:s}))} style={{cursor:"pointer",fontSize:15,color:ratings[b.id]>=s?"var(--gold)":"var(--faint)"}}>★</span>
            ))}
          </div>
        </div>
      ))}

      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button
          disabled={ratedCount===0}
          onClick={()=>onRate(starters.map(b=>({...b,rating:ratings[b.id]||0})).filter(b=>b.rating>0))}
          style={{
            flex:1,padding:"10px",borderRadius:99,border:"none",
            background:ratedCount>0?"var(--gold)":"rgba(212,148,26,.2)",
            color:ratedCount>0?"#0a0806":"var(--muted)",
            fontFamily:"'Inter',sans-serif",fontSize:13,fontWeight:700,
            cursor:ratedCount>0?"pointer":"default",transition:"all .2s",
          }}
        >{ratedCount>0?`Save ${ratedCount} rating${ratedCount>1?"s":""}  →`:"Rate at least one book"}</button>
        <button onClick={onSkip} style={{padding:"10px 14px",borderRadius:99,border:"1px solid rgba(255,255,255,.1)",background:"transparent",color:"var(--muted)",fontSize:12,cursor:"pointer"}}>Skip</button>
      </div>
    </div>
  );
}

// ── TILE MODAL (mobile tap replacement for hover overlay) ─────────────────────
function TileModal({ book: b, onClose, onAsk, isSaved, onSave, onDismiss, userState, onDiscuss }) {
  if (!b) return null;

  const handleDismiss = () => {
    onDismiss(b.id);
    onClose();
  };

  const reason = getRecommendationReason(b, userState || {});

  return (
    <div className="ls-tile-modal-overlay" onClick={onClose}>
      <div className="ls-tile-modal" onClick={e => e.stopPropagation()}>
        <div className="ls-tile-modal-handle"/>
        <div className="ls-tile-modal-cover" style={{position:"relative"}}>
          <BookCover isbn={b.isbn} title={b.title} author={b.author} color={b.color}/>
        </div>
        <div className="ls-tile-modal-title">{b.title}</div>
        <div className="ls-tile-modal-author">{b.author}</div>

        {/* Dynamic why block */}
        <ReasonBlock reason={reason}/>

        {/* ── PRIMARY ACTIONS ── */}
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          {/* Save to Read */}
          <button
            onClick={() => { if (!isSaved) onSave(b); }}
            style={{
              flex:1,padding:"13px",borderRadius:10,border:"none",
              background: isSaved ? "rgba(212,148,26,.12)" : "var(--gold)",
              color: isSaved ? "var(--gold)" : "#0a0806",
              fontFamily:"'Inter',sans-serif",fontSize:14,fontWeight:700,
              cursor: isSaved ? "default" : "pointer",
              transition:"all .2s",
              boxSizing:"border-box",
              ...(isSaved ? {border:"1px solid rgba(212,148,26,.25)"} : {boxShadow:"0 4px 16px rgba(212,148,26,.35)"}),
            }}
          >{isSaved ? "✓ Saved" : "Save to Read"}</button>
          {/* No Thanks */}
          <button
            onClick={handleDismiss}
            style={{
              padding:"13px 16px",borderRadius:10,
              border:"1px solid rgba(255,255,255,.1)",background:"transparent",
              color:"var(--muted)",fontSize:14,fontWeight:500,
              cursor:"pointer",transition:"all .18s",boxSizing:"border-box",
              flexShrink:0,
            }}
          >Not for me</button>
        </div>

        <button className="ls-tile-modal-cta" onClick={() => { onAsk(`Tell me about "${b.title}" by ${b.author}. Should I read it?`); onClose(); }}>
          Ask about this book
        </button>
        <button className="ls-tile-modal-cta" onClick={() => { onDiscuss?.(b); onClose(); }} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
          <MessageSquare size={14}/> Join the discussion
        </button>
        <SafeAmazonLink
          title={b.title} author={b.author} isbn={b.isbn}
          style={{
            display:"block",width:"100%",padding:"13px",borderRadius:10,
            background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",
            color:"var(--text2)",textAlign:"center",textDecoration:"none",
            fontSize:14,fontWeight:600,marginBottom:10,boxSizing:"border-box",
          }}
        >Buy on Amazon →</SafeAmazonLink>
        <button className="ls-tile-modal-cancel" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// ── REFERRAL CARD ─────────────────────────────────────────────────────────────
function ReferralCard({ userEmail, referralCount }) {
  const [copied, setCopied] = useState(false);
  const link = getReferralLink(userEmail);
  const milestone = getReferralMilestone(referralCount);
  const next = getNextMilestone(referralCount);
  const nextMilestoneCount = next ? next.refs : null;
  const progress = next
    ? Math.min(100, (referralCount / next.refs) * 100)
    : 100;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // fallback — select the text
    }
  };

  const shareLink = async () => {
    if (navigator.share) {
      await navigator.share({
        title: "LitSense — Your Reading Companion",
        text: "I've been using LitSense to find my next book. It learns your taste and tells you exactly why each book is right for you. Try it free:",
        url: link,
      });
    } else {
      copyLink();
    }
  };

  return (
    <div style={{
      margin:"0 0 24px",
      background:"linear-gradient(135deg,rgba(212,148,26,.06),rgba(212,148,26,.02))",
      border:"1px solid rgba(212,148,26,.15)",
      borderRadius:16, padding:"18px 16px",
    }}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
        <div>
          <div style={{fontFamily:"'Lora',serif",fontSize:16,fontWeight:700,color:"var(--text)",lineHeight:1.2,marginBottom:3}}>
            Invite friends.<br/><em style={{color:"var(--gold)"}}>Earn more.</em>
          </div>
          <div style={{fontSize:12,color:"var(--text2)",lineHeight:1.55}}>
            They get 14 days Pro free.<br/>You get +3 questions/day per referral.
          </div>
        </div>
        <div style={{fontSize:28,flexShrink:0,marginLeft:10}}>🎁</div>
      </div>

      {/* Stats row */}
      <div style={{display:"flex",gap:10,marginBottom:14}}>
        <div style={{flex:1,background:"var(--card)",borderRadius:10,padding:"10px 12px",border:"1px solid rgba(255,255,255,.05)"}}>
          <div style={{fontFamily:"'Lora',serif",fontSize:22,fontWeight:700,color:"var(--gold)",lineHeight:1}}>{referralCount}</div>
          <div style={{fontSize:10,color:"var(--muted)",marginTop:2,fontWeight:600,letterSpacing:".5px",textTransform:"uppercase"}}>Referred</div>
        </div>
        <div style={{flex:1,background:"var(--card)",borderRadius:10,padding:"10px 12px",border:"1px solid rgba(255,255,255,.05)"}}>
          <div style={{fontFamily:"'Lora',serif",fontSize:22,fontWeight:700,color:milestone?"var(--gold)":"var(--muted)",lineHeight:1}}>
            {milestone ? `+${milestone.bonus === 999 ? "∞" : milestone.bonus}` : "+0"}
          </div>
          <div style={{fontSize:10,color:"var(--muted)",marginTop:2,fontWeight:600,letterSpacing:".5px",textTransform:"uppercase"}}>Q/day bonus</div>
        </div>
        {milestone && (
          <div style={{flex:1,background:"var(--card)",borderRadius:10,padding:"10px 12px",border:"1px solid rgba(255,255,255,.05)"}}>
            <div style={{fontSize:14,fontWeight:700,color:"var(--gold)",lineHeight:1.2}}>{milestone.label}</div>
            <div style={{fontSize:10,color:"var(--muted)",marginTop:2,fontWeight:600,letterSpacing:".5px",textTransform:"uppercase"}}>Your status</div>
          </div>
        )}
      </div>

      {/* Progress to next milestone */}
      {next && (
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
            <span style={{fontSize:11,color:"var(--text2)"}}>{referralCount} of {next.refs} referrals to <strong style={{color:"var(--gold)"}}>{next.reward}</strong></span>
            <span style={{fontSize:10,color:"var(--muted)"}}>{next.refs - referralCount} to go</span>
          </div>
          <div style={{height:3,background:"rgba(255,255,255,.07)",borderRadius:99,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${progress}%`,background:"linear-gradient(90deg,var(--gold-d),var(--gold))",borderRadius:99,transition:"width .4s ease"}}/>
          </div>
        </div>
      )}
      {!next && referralCount >= 10 && (
        <div style={{marginBottom:14,padding:"8px 12px",background:"rgba(212,148,26,.1)",borderRadius:8,fontSize:12,color:"var(--gold)",fontFamily:"'Inter',sans-serif",fontStyle:"italic"}}>
          🏆 Champion — you've earned 3 months Pro free. We'll be in touch.
        </div>
      )}

      {/* Referral link */}
      <div style={{
        background:"var(--bg2)",borderRadius:8,padding:"9px 12px",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        marginBottom:10,border:"1px solid rgba(255,255,255,.06)",
      }}>
        <span style={{fontSize:11.5,color:"var(--text2)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{link}</span>
        <button onClick={copyLink} style={{
          flexShrink:0,marginLeft:8,padding:"4px 10px",borderRadius:6,border:"none",
          background:copied?"rgba(74,128,96,.3)":"rgba(212,148,26,.15)",
          color:copied?"#6ecf9a":"var(--gold)",
          fontSize:11,fontWeight:700,cursor:"pointer",transition:"all .2s",whiteSpace:"nowrap",
        }}>{copied?"✓ Copied":"Copy"}</button>
      </div>

      {/* Share buttons */}
      <div style={{display:"flex",gap:8}}>
        <button onClick={shareLink} style={{
          flex:1,padding:"10px",borderRadius:99,border:"none",
          background:"var(--gold)",color:"#0a0806",
          fontFamily:"'Inter',sans-serif",fontSize:13,fontWeight:700,
          cursor:"pointer",
        }}>Share your link</button>
      </div>

      {/* How it works */}
      <details style={{marginTop:12}}>
        <summary style={{fontSize:11,color:"var(--muted)",cursor:"pointer",userSelect:"none",listStyle:"none",display:"flex",alignItems:"center",gap:5}}>
          <span>How it works</span>
        </summary>
        <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:6}}>
          {REFERRAL_MILESTONES.map(m=>(
            <div key={m.refs} style={{display:"flex",alignItems:"center",gap:8,opacity:referralCount>=m.refs?1:.5}}>
              <div style={{width:20,height:20,borderRadius:"50%",background:referralCount>=m.refs?"var(--gold)":"rgba(255,255,255,.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:referralCount>=m.refs?"#0a0806":"var(--muted)",flexShrink:0}}>
                {referralCount>=m.refs?"✓":m.refs}
              </div>
              <div>
                <span style={{fontSize:11.5,fontWeight:600,color:"var(--text2)"}}>{m.refs} referral{m.refs>1?"s":""}</span>
                <span style={{fontSize:11,color:"var(--muted)"}}> → {m.reward}</span>
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

// ── MARKETPLACE ──────────────────────────────────────────────────────────────
// Local state only for now — wires to Supabase listings table when ready.
// Sellers list books, buyers pay through Stripe escrow.

const MOCK_LISTINGS = [
  { id:"l1", title:"The Covenant of Water", author:"Abraham Verghese", isbn:"9780802162175", price:14, condition:"Like New", seller:"sarah_reads", color:["#1a2430","#0e1820"] },
  { id:"l2", title:"Demon Copperhead", author:"Barbara Kingsolver", isbn:"9780063250550", price:11, condition:"Good", seller:"bookworm_jo", color:["#2a1808","#1a1004"] },
  { id:"l3", title:"Piranesi", author:"Susanna Clarke", isbn:"9781635575644", price:9, condition:"Like New", seller:"nightreader", color:["#181428","#100c1c"] },
];

function ListingCard({ listing, onTap }) {
  return (
    <div className="ls-listing-card" onClick={() => onTap(listing)}>
      <div className="ls-listing-cover" style={{position:"relative"}}>
        <BookCover isbn={listing.isbn} title={listing.title} author={listing.author} color={listing.color} className="fill"/>
      </div>
      <div className="ls-listing-body">
        <div className="ls-listing-title">{listing.title}</div>
        <div className="ls-listing-author">{listing.author}</div>
        <div className="ls-listing-meta">
          <span className="ls-listing-price">${listing.price}</span>
          <span className="ls-listing-condition">{listing.condition}</span>
          <span className="ls-listing-seller">by {listing.seller}</span>
        </div>
      </div>
    </div>
  );
}

function ListBookModal({ onClose, onSubmit }) {
  const [title,     setTitle]     = useState("");
  const [author,    setAuthor]    = useState("");
  const [price,     setPrice]     = useState("");
  const [condition, setCondition] = useState("Good");
  const conditions = ["New","Like New","Good","Fair","Poor"];
  const ready = title.trim() && price && Number(price) > 0;

  return (
    <div className="ls-list-modal">
      <div className="ls-list-modal-bg" onClick={onClose}/>
      <div className="ls-list-modal-sheet">
        <div className="ls-list-modal-handle"/>
        <div className="ls-list-modal-title">List a book</div>

        <div className="ls-list-field">
          <div className="ls-list-label">Title</div>
          <input className="ls-list-input" placeholder="Book title" value={title} onChange={e=>setTitle(e.target.value)}/>
        </div>
        <div className="ls-list-field">
          <div className="ls-list-label">Author</div>
          <input className="ls-list-input" placeholder="Author name" value={author} onChange={e=>setAuthor(e.target.value)}/>
        </div>
        <div className="ls-list-field">
          <div className="ls-list-label">Your asking price (USD)</div>
          <input className="ls-list-input" placeholder="$0.00" type="number" min="1" value={price} onChange={e=>setPrice(e.target.value)}/>
        </div>
        <div className="ls-list-field">
          <div className="ls-list-label">Condition</div>
          <div className="ls-condition-btns">
            {conditions.map(c => (
              <button key={c} className={`ls-condition-btn${condition===c?" on":""}`} onClick={()=>setCondition(c)}>{c}</button>
            ))}
          </div>
        </div>
        <div style={{fontSize:11,color:"var(--muted)",lineHeight:1.6,marginBottom:16}}>
          LitSense holds payment in escrow until the buyer confirms delivery. We take a 10% platform fee. You keep the rest.
        </div>
        <button className="ls-list-submit" disabled={!ready} onClick={()=>{ onSubmit({title,author,price:Number(price),condition}); onClose(); }}>
          List for ${price||"0"} →
        </button>
      </div>
    </div>
  );
}

function MarketplaceTab({ isPro, savedBooks, wantList, onRequirePro, userEmail }) {
  const [marketTab, setMarketTab]   = useState("browse");
  const [listings,  setListings]    = useState(MOCK_LISTINGS);
  const [showList,  setShowList]    = useState(false);
  const [selected,  setSelected]    = useState(null);
  const [buying,    setBuying]      = useState(false);
  const [buyError,  setBuyError]    = useState("");
  const [buyDone,   setBuyDone]     = useState(false);

  if (!isPro) {
    return (
      <div className="ls-market" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,padding:"40px 32px",textAlign:"center"}}>
        <Lock size={36} strokeWidth={1.5} style={{color:"var(--gold)",opacity:.6,marginBottom:16}}/>
        <div style={{fontFamily:"'Lora',serif",fontSize:20,fontWeight:700,color:"var(--text)",marginBottom:8}}>Marketplace is Pro</div>
        <div style={{fontSize:13,color:"var(--muted)",lineHeight:1.7,marginBottom:24}}>Buy and sell books directly with other readers. Trade your shelf for something new.</div>
        <button className="ls-list-submit" style={{maxWidth:240}} onClick={onRequirePro}>Go Pro to access →</button>
      </div>
    );
  }

  return (
    <div className="ls-market" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,padding:"40px 32px",textAlign:"center"}}>
      <ShoppingBag size={44} strokeWidth={1.2} style={{color:"var(--gold)",opacity:.5,marginBottom:20}}/>
      <div className="ls-market-new-badge" style={{marginBottom:16}}><Sparkles size={10}/> Coming Soon</div>
      <div style={{fontFamily:"'Lora',serif",fontSize:22,fontWeight:700,color:"var(--text)",marginBottom:10}}>Book Marketplace</div>
      <div style={{fontSize:14,color:"var(--muted)",lineHeight:1.75,maxWidth:300,marginBottom:28}}>
        Buy and sell books directly with other LitSense readers. We handle payment, escrow, and shipping labels. Launching soon.
      </div>
      <div style={{fontSize:13,color:"var(--text2)",lineHeight:1.7,padding:"14px 18px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:"var(--r-lg)",maxWidth:300}}>
        Be among the first sellers when we launch — list a book and reach readers who'll actually love it.
      </div>
    </div>
  );

  // Highlight listings matching user's want list
  const wantTitles = (wantList||[]).map(t=>t.toLowerCase());
  const matches = browse.filter(l => wantTitles.includes(l.title.toLowerCase()));

  return (
    <div className="ls-market">
      <div className="ls-market-hdr">
        <div className="ls-market-new-badge"><Sparkles size={10}/> NEW — just getting started</div>
        <div className="ls-market-title">Book Marketplace</div>
        <div className="ls-market-sub">Buy books from other readers. We handle payment, escrow, and postage labels. 10% platform fee.</div>
      </div>

      <div className="ls-market-tabs">
        {[["browse","Browse"],["mine","My Listings"]].map(([v,label])=>(
          <button key={v} className={`ls-market-tab${marketTab===v?" on":""}`} onClick={()=>setMarketTab(v)}>{label}</button>
        ))}
      </div>

      {marketTab==="browse" && (
        <>
          {matches.length > 0 && (
            <div style={{margin:"0 16px 12px",padding:"12px 14px",background:"rgba(212,148,26,.08)",border:"1px solid rgba(212,148,26,.25)",borderRadius:"var(--r-md)"}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--gold)",letterSpacing:".5px",textTransform:"uppercase",marginBottom:6}}>On your want list</div>
              {matches.map(l=><ListingCard key={l.id} listing={l} onTap={setSelected}/>)}
            </div>
          )}
          {browse.length === 0 ? (
            <div className="ls-market-empty">
              <div className="ls-market-empty-icon">📚</div>
              <div className="ls-market-empty-title">Be one of the first</div>
              <div className="ls-market-empty-body">We're just getting started. List a book and be among the first sellers on LitSense.</div>
            </div>
          ) : browse.filter(l=>!wantTitles.includes(l.title.toLowerCase())).map(l=>(
            <ListingCard key={l.id} listing={l} onTap={setSelected}/>
          ))}
        </>
      )}

      {marketTab==="mine" && (
        <>
          {myListings.length === 0 ? (
            <div className="ls-market-empty">
              <div className="ls-market-empty-title">Nothing listed yet</div>
              <div className="ls-market-empty-body">List a book from your shelf and reach readers who'll actually love it.</div>
            </div>
          ) : myListings.map(l=><ListingCard key={l.id} listing={l} onTap={setSelected}/>)}
        </>
      )}

      <button className="ls-list-btn" onClick={()=>setShowList(true)}>
        <Tag size={15}/> List a book
      </button>

      {showList && (
        <ListBookModal
          onClose={()=>setShowList(false)}
          onSubmit={(data)=>{
            setListings(prev=>[{id:`l${Date.now()}`,seller:"me",...data,color:["#1a1408","#0e0c06"]},  ...prev]);
            setMarketTab("mine");
          }}
        />
      )}

      {/* Listing detail sheet */}
      {selected && (
        <div className="ls-list-modal">
          <div className="ls-list-modal-bg" onClick={()=>setSelected(null)}/>
          <div className="ls-list-modal-sheet">
            <div className="ls-list-modal-handle"/>
            <div style={{display:"flex",gap:14,marginBottom:20}}>
              <div style={{width:72,height:104,borderRadius:10,overflow:"hidden",flexShrink:0}}>
                <BookCover isbn={selected.isbn} title={selected.title} author={selected.author} color={selected.color} className="fill"/>
              </div>
              <div>
                <div style={{fontFamily:"'Lora',serif",fontSize:17,fontWeight:700,color:"var(--text)",lineHeight:1.3,marginBottom:4}}>{selected.title}</div>
                <div style={{fontSize:12,color:"var(--muted)",marginBottom:10}}>{selected.author}</div>
                <div style={{fontSize:20,fontWeight:700,color:"var(--gold)",marginBottom:4}}>${selected.price}</div>
                <div style={{fontSize:11,color:"var(--text2)"}}>{selected.condition} · Listed by {selected.seller}</div>
              </div>
            </div>
            <div style={{fontSize:12,color:"var(--muted)",lineHeight:1.7,marginBottom:20}}>
              Payment is held in escrow until you confirm delivery. We generate the postage label — seller ships to you directly. LitSense takes a 10% platform fee.
            </div>

            {buyDone ? (
              <div style={{textAlign:"center",padding:"20px 0"}}>
                <CheckCircle size={36} style={{color:"var(--gold)",marginBottom:12}}/>
                <div style={{fontFamily:"'Lora',serif",fontSize:18,fontWeight:700,color:"var(--text)",marginBottom:8}}>Payment held in escrow</div>
                <div style={{fontSize:13,color:"var(--muted)",lineHeight:1.7}}>The seller has been notified. They'll ship within 3 days. You'll get tracking info here.</div>
                <button className="ls-list-submit" style={{marginTop:20}} onClick={()=>{setSelected(null);setBuyDone(false);}}>Done</button>
              </div>
            ) : (
              <>
                {buyError && (
                  <div style={{padding:"10px 14px",background:"rgba(220,50,50,.1)",border:"1px solid rgba(220,50,50,.3)",borderRadius:"var(--r-md)",fontSize:13,color:"#e06060",marginBottom:14}}>
                    {buyError}
                  </div>
                )}
                <button
                  className="ls-list-submit"
                  disabled={buying}
                  onClick={async () => {
                    setBuying(true); setBuyError("");
                    try {
                      const amount_cents = selected.price * 100;
                      const res = await fetch("/api/checkout", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          listing_id:    selected.id,
                          buyer_email:   userEmail,
                          amount_cents,
                          postage_cents: 450, // ~$4.50 Media Mail estimate
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || "Checkout failed");
                      // In production: use Stripe.js to confirm the payment with client_secret
                      // For now: show success (payment intent created, funds authorized)
                      setBuyDone(true);
                    } catch (err) {
                      setBuyError(err.message || "Payment failed. Please try again.");
                    } finally {
                      setBuying(false);
                    }
                  }}
                >
                  {buying ? "Processing…" : `Buy for $${selected.price} + $4.50 shipping →`}
                </button>
              </>
            )}
            <button onClick={()=>{setSelected(null);setBuyError("");setBuyDone(false);}} style={{width:"100%",marginTop:10,padding:12,background:"none",border:"none",color:"var(--muted)",fontSize:13,cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}


// ── DISCUSSION ───────────────────────────────────────────────────────────────
// Conversational thread per book. Scrolls chronologically, not like a forum.

function DiscussionThread({ book, userEmail, userId, onClose }) {
  const [posts,   setPosts]   = useState([]);
  const [draft,   setDraft]   = useState("");
  const [loading, setLoading] = useState(true);
  const [discId,  setDiscId]  = useState(null);
  const bottomRef = useRef(null);

  // Load discussion from Supabase
  useEffect(() => {
    if (!book) return;
    (async () => {
      try {
        const disc = await getOrCreateDiscussion(book);
        setDiscId(disc.id);
        const p = await getDiscussionPosts(disc.id);
        setPosts(p);
      } catch {
        // Fallback to localStorage if Supabase fails
        const key = `ls_disc_${book?.isbn || book?.id || "general"}`;
        try { const r = localStorage.getItem(key); if (r) setPosts(JSON.parse(r)); } catch {}
      } finally {
        setLoading(false);
      }
    })();
  }, [book]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [posts]);

  const userName = userEmail ? userEmail.split("@")[0].split(/[._]/)[0] : "Reader";
  const initial  = userName[0].toUpperCase();

  const send = async () => {
    if (!draft.trim()) return;
    const content = draft.trim();
    setDraft("");

    if (discId && userId) {
      try {
        const post = await createDiscussionPost(discId, userId, content);
        setPosts(prev => [...prev, { ...post, author: { email: userEmail } }]);
        return;
      } catch {}
    }
    // Fallback to localStorage
    setPosts(prev => {
      const updated = [...prev, { id: Date.now(), user: userName, initial, content, ts: Date.now(), likes: 0 }];
      try { localStorage.setItem(`ls_disc_${book?.isbn || book?.id}`, JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    const diff = (Date.now() - d) / 1000;
    if (diff < 60)    return "just now";
    if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="ls-list-modal">
      <div className="ls-list-modal-bg" onClick={onClose}/>
      <div className="ls-list-modal-sheet" style={{paddingBottom:0}}>
        <div className="ls-list-modal-handle"/>
        <div className="ls-disc-hdr">
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
            <button onClick={onClose} style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",padding:0}}><X size={18}/></button>
            <div>
              <div className="ls-disc-book">{book?.title?.split(":")[0]}</div>
              <div className="ls-disc-count">{posts.length} {posts.length===1?"comment":"comments"}</div>
            </div>
          </div>
        </div>

        <div style={{maxHeight:"55dvh",overflowY:"auto"}}>
          {posts.length === 0 ? (
            <div className="ls-disc-empty">
              <Users size={28} style={{opacity:.3,marginBottom:12}}/>
              <div>Be the first to say something about this one.</div>
            </div>
          ) : posts.map(p => (
            <div key={p.id} className="ls-disc-post">
              <div className="ls-disc-post-header">
                <div className="ls-disc-avatar">{p.initial}</div>
                <div className="ls-disc-username">{p.user}</div>
                <div className="ls-disc-time">{formatTime(p.ts)}</div>
              </div>
              <div className="ls-disc-content">{p.content}</div>
              <div className="ls-disc-actions">
                <button className="ls-disc-action" onClick={()=>setPosts(prev=>prev.map(x=>x.id===p.id?{...x,likes:x.likes+1}:x))}>
                  <Heart size={12}/> {p.likes > 0 ? p.likes : "Like"}
                </button>
              </div>
            </div>
          ))}
          <div ref={bottomRef}/>
        </div>

        <div className="ls-disc-input-row">
          <textarea
            className="ls-disc-textarea"
            rows={1}
            placeholder="What do you think of this one?"
            value={draft}
            onChange={e=>setDraft(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
          />
          <button className="ls-disc-send" onClick={send}><Send size={14}/></button>
        </div>
      </div>
    </div>
  );
}

export default function LitSense() {
  useEffect(() => {
    // Check for referral param — store so signup flow can credit referrer
    // In production: send to Supabase to credit the referrer's account
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get("ref");
    if (refCode) {
      try { localStorage.setItem("ls_ref_from", refCode); } catch {}
    }
  }, []);

  // ── AUTH ──────────────────────────────────────────────────────────────────
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isPro, setIsPro]           = useState(() => { try { return localStorage.getItem("ls_pro") === "1"; } catch { return false; } });
  const [userEmail, setUserEmail]   = useState("");
  const [userId,    setUserId]      = useState(null);

  // On mount — restore Supabase session if one exists
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsSignedIn(true);
        setUserEmail(session.user.email);
        setUserId(session.user.id);
      }
    });
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setIsSignedIn(true);
        setUserEmail(session.user.email);
        setUserId(session.user.id);
      } else {
        setIsSignedIn(false);
        setUserEmail("");
        setUserId(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);
  const [showAuth, setShowAuth]     = useState(false);
  const [authMode, setAuthMode]     = useState("signup");
  const [authEmail, setAuthEmail]   = useState("");
  const [authPass, setAuthPass]     = useState("");
  const [authError, setAuthError]   = useState("");
  const [authExitWarn, setAuthExitWarn] = useState(false);

  // ── COUNTER ───────────────────────────────────────────────────────────────
  const loadCounter = () => { try { const r = localStorage.getItem("ls_counter"); if (!r) return 0; const {count,date} = JSON.parse(r); return date===today()?count:0; } catch { return 0; } };
  const [questionsUsed, setQuestionsUsed] = useState(loadCounter);
  const saveCounter = (n) => { try { localStorage.setItem("ls_counter",JSON.stringify({count:n,date:today()})); } catch {} };

  // ── SHELF ─────────────────────────────────────────────────────────────────
  const loadShelf = () => { try { const r = localStorage.getItem("ls_shelf"); return r ? JSON.parse(r) : null; } catch { return null; } };
  const [readBooks, setReadBooks]     = useState(() => loadShelf()?.readBooks ?? []);
  const [currentBook, setCurrentBook] = useState(() => loadShelf()?.currentBook ?? "");
  const [wantList, setWantList]       = useState(() => loadShelf()?.wantList ?? []);
  useEffect(() => { if (!isSignedIn) return; try { localStorage.setItem("ls_shelf",JSON.stringify({readBooks,currentBook,wantList})); } catch {} }, [readBooks,currentBook,wantList,isSignedIn]);

  // ── PERSONALIZATION FEEDBACK ───────────────────────────────────────────────
  const [savedBooks,     setSavedBooks]     = useState(() => { try { const r = localStorage.getItem("ls_saved"); return r ? JSON.parse(r) : []; } catch { return []; } });
  const [dismissedBooks, setDismissedBooks] = useState(() => { try { const r = localStorage.getItem("ls_dismissed"); return r ? JSON.parse(r) : []; } catch { return []; } });
  useEffect(() => { try { localStorage.setItem("ls_saved",     JSON.stringify(savedBooks));     } catch {} }, [savedBooks]);
  useEffect(() => { try { localStorage.setItem("ls_dismissed", JSON.stringify(dismissedBooks)); } catch {} }, [dismissedBooks]);
  const isBookSaved     = useCallback((id) => savedBooks.some(b => b.id === id),    [savedBooks]);
  const isBookDismissed = useCallback((id) => dismissedBooks.includes(id),           [dismissedBooks]);

  // ── Outcome tracking — must be declared before handleSaveBook/handleDismissBook ──
  const [outcomes, setOutcomes] = useState(() => {
    try { const r=localStorage.getItem("ls_outcomes"); return r?JSON.parse(r):[]; } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem("ls_outcomes", JSON.stringify(outcomes.slice(-100))); } catch {}
  }, [outcomes]);
  const trackOutcome = useCallback(createOutcomeTracker(setOutcomes), []);
  const handleSaveBook = useCallback((book) => {
    setSavedBooks(prev => prev.some(b => b.id === book.id) ? prev : [...prev, book]);
    trackOutcome(book.id, "save");
  }, [trackOutcome]);

  const handleDismissBook = useCallback((id) => {
    setDismissedBooks(prev => prev.includes(id) ? prev : [...prev, id]);
    trackOutcome(id, "skip");
  }, [trackOutcome]);

  // ── REACTIONS — per-book emotional memory ─────────────────────────────────
  const [reactions, setReactions] = useState(() => { try { const r=localStorage.getItem("ls_reactions"); return r?JSON.parse(r):{}; } catch { return {}; } });
  useEffect(() => { try { localStorage.setItem("ls_reactions",JSON.stringify(reactions)); } catch {} }, [reactions]);

  // Simple memory — drives FriendPrompt
  const [memory, setMemory] = useState({ lastStarted: null, lastReaction: null });

  const addReaction = useCallback((bookId, reaction, note="") => {
    setReactions(prev => ({...prev, [bookId]: {reaction, note, ts:Date.now()}}));
  }, []);

  const handleReaction = useCallback((book, reaction) => {
    addReaction(book.id, reaction);
    setMemory({ lastStarted: book.title, lastReaction: reaction });
    // Map reaction to outcome for the intelligence layer
    const outcomeMap = { loved:"finish", finished:"finish", abandoned:"abandon", "too slow":"abandon", fast:"finish" };
    trackOutcome(book.id, outcomeMap[reaction] || reaction);
  }, [addReaction, trackOutcome]);

  // ── DISMISSED SIGNALS ─────────────────────────────────────────────────────
  const [dismissedSignals, setDismissedSignals] = useState(() => { try { const r=localStorage.getItem("ls_dismissed_signals"); return r?JSON.parse(r):[]; } catch { return []; } });
  useEffect(() => { try { localStorage.setItem("ls_dismissed_signals",JSON.stringify(dismissedSignals)); } catch {} }, [dismissedSignals]);

  // ── UI STATE — declared early because computed values depend on mood/genre ──
  const [tab, setTab]       = useState("discover");
  const [feedMode, setFeedMode] = useState("discover");
  const [mood, setMood]     = useState(null);
  const [genre, setGenre]   = useState(null);
  const discoverScrollRef   = useRef(null);
  const discoverScrollPos   = useRef(0);

  // ── Signal engagement — must precede bgVoice/adaptedVoice which use it ──
  const [signalEngagements, setSignalEngagements] = useState(() => {
    try { const r=localStorage.getItem("ls_signal_eng"); return r?JSON.parse(r):{}; } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem("ls_signal_eng", JSON.stringify(signalEngagements)); } catch {}
  }, [signalEngagements]);

  // ── COMPUTED — must precede Phase 6 which depends on them ────────────────
  const bgVoice = useMemo(() => {
    const voice = getUserVoiceProfile({ savedBooks, readBooks, mood, genre });
    if (voice === "fast") return savedBooks.some(b=>(b.tags||[]).includes("Sci-Fi"))||genre==="Sci-Fi" ? "sciFi" : "thriller";
    if (voice === "emotional") return "literary";
    if (voice === "analytical") return "nonfiction";
    return voice;
  }, [savedBooks, readBooks, mood, genre]);

  const wheelBooks = BOOKS
    .filter(b => !dismissedBooks.includes(b.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);

  // Tracks which book is centered in the wheel — drives scene illustration
  const [activeWheelBook, setActiveWheelBook] = useState(wheelBooks[0] || null);

  const userInitial = userEmail ? userEmail[0].toUpperCase() : "";
  const [userName,  setUserName]  = useState(() => { try { return localStorage.getItem("ls_username") || ""; } catch { return ""; } });
  const [userPhoto, setUserPhoto] = useState(() => { try { return localStorage.getItem("ls_photo") || ""; } catch { return ""; } });

  // ── PHASE 6: Intelligence layer — must be before friendNudge ─────────────
  const archetype = useMemo(() =>
    computeArchetype({}, reactions, readBooks),
  [reactions, readBooks]);

  const interventionLevel = useMemo(() =>
    detectIntervention(reactions, outcomes, archetype),
  [reactions, outcomes, archetype]);

  const adaptedVoice = useMemo(() =>
    adaptVoice(bgVoice, archetype, signalEngagements),
  [bgVoice, archetype, signalEngagements]);

  // Intent-driven background key — must be after adaptedVoice
  const bgKey = useMemo(() => getBackgroundKey({
    mood, adaptedVoice, genre,
    inAsk: tab === "ask" && msgs.length > 0,
  }), [mood, adaptedVoice, genre, tab, msgs.length]);

  const adaptedUserState = useMemo(() => adaptUserState(
    { savedBooks, readBooks, mood, genre, dismissedBooks, voice: adaptedVoice },
    archetype,
    interventionLevel,
  ), [savedBooks, readBooks, mood, genre, dismissedBooks, adaptedVoice, archetype, interventionLevel]);

  // ── FRIEND NUDGE — contextual opening message ─────────────────────────────
  const friendNudge = useMemo(() => {
    // Extract first name from email (e.g. john.smith@... → John)
    const firstName = isSignedIn && userEmail
      ? userEmail.split("@")[0].split(/[._]/)[0].replace(/\b\w/g, c => c.toUpperCase())
      : null;

    // Intervention override — surfaces naturally, never technically
    if (interventionLevel === 2) {
      return {
        msg: `${firstName ? `${firstName}, you've` : "You've"} started a few things lately that didn't quite stick. Want to try something shorter and faster?`,
        cta: "Find something that sticks",
        prompt: "I've been abandoning books lately. Recommend something shorter and fast-paced that I'm very likely to actually finish.",
      };
    }
    if (interventionLevel === 1) {
      return {
        msg: "The last couple didn't work out — want something with more momentum?",
        cta: "Show me something faster",
        prompt: "My recent reads haven't been landing. Find me something fast-paced that I'll actually finish.",
      };
    }
    const reactionEntries = Object.entries(reactions);
    if (reactionEntries.length > 0) {
      const [bookId, {reaction}] = reactionEntries.sort((a,b)=>b[1].ts-a[1].ts)[0];
      const book = [...readBooks, ...savedBooks].find(b=>String(b.id)===String(bookId));
      const title = book?.title?.split(":")[0] || "that one";
      if (reaction==="abandoned") return { msg:`You stopped reading ${title}. Too slow, or just not the right time?`, cta:"Find something better", prompt:`I stopped reading ${title}. Help me find something with more momentum.` };
      if (reaction==="slow")      return { msg:`${title} felt slow — want something that moves faster?`, cta:"Find something faster", prompt:`${title} felt too slow for me. What should I read that has real momentum?` };
      if (reaction==="finished" || reaction==="loved") return { msg:`You finished ${title}. Still thinking about it, or ready to move on?`, cta:"What's next", prompt:`I just finished ${title}. What should I read next?` };
    }
    if (currentBook) {
      const shortTitle = currentBook.split(":")[0].split(" ").slice(0,5).join(" ");
      return {
        msg: `Still reading ${shortTitle}?`,
        cta: "Tell me how it's going",
        prompt: `I'm currently reading "${currentBook}". I want to talk about it — ask me how it's going.`,
      };
    }
    if (savedBooks.length > 0 && readBooks.length > 0) {
      const unread = savedBooks.find(sb => !reactions[sb.id]);
      if (unread) return { msg:`You saved ${unread.title.split(":")[0]} — did you ever start it?`, cta:"Tell me more about it", prompt:`Tell me more about ${unread.title} by ${unread.author}. Is it right for me?` };
    }
    // Marketplace signal — book on their want list is listed for sale
    if (isPro && wantList.length > 0) {
      const wantTitles = wantList.map(t => t.toLowerCase());
      const match = MOCK_LISTINGS.find(l => wantTitles.includes(l.title.toLowerCase()));
      if (match) {
        return {
          msg: `Someone just listed a copy of ${match.title.split(":")[0]} — it's on your list.`,
          cta: "See it in the marketplace",
          prompt: `Tell me about ${match.title} by ${match.author}. I might buy it.`,
          onTap: () => setTab("market"),
        };
      }
    }
    // New signed-in user with no history — greet by name
    if (firstName) {
      return {
        msg: `Hey ${firstName} — what are you reading right now, or are you looking for something new?`,
        cta: "Tell me",
        prompt: `Ask me what I'm reading or looking for next. I'm a new user so you know nothing about me yet — just ask naturally.`,
      };
    }
    return null;
  }, [reactions, currentBook, savedBooks, readBooks, interventionLevel, isSignedIn, userEmail, isPro, wantList]);

  // Build memory object for getFriendPrompt
  const friendMemory = useMemo(() => {
    const lastReactionEntry = Object.entries(reactions).sort((a,b)=>b[1].ts-a[1].ts)[0];
    return {
      lastReaction: lastReactionEntry?.[1]?.reaction || null,
      lastStarted:  currentBook || null,
    };
  }, [reactions, currentBook]);

  const recordSignalEngagement = useCallback((signalType, engaged) => {
    setSignalEngagements(prev => ({
      ...prev,
      [signalType]: Math.max(-1, Math.min(1, (prev[signalType]||0) + (engaged ? 0.1 : -0.05))),
    }));
  }, []);

  // ── STEP 1: v_user_intelligence — unified intelligence context ───────────────
  // In production: SELECT * FROM v_user_intelligence WHERE user_id = ?
  // Here: derived from local state in the same shape as the DB view.
  // Every downstream consumer (AI prompt, rec engine, signals, tone) reads from here.
  const intelligence = useMemo(() => {
    const reactionVals = Object.values(reactions);
    const finished     = reactionVals.filter(r => r.reaction === "finished" || r.reaction === "loved").length;
    const abandoned    = reactionVals.filter(r => r.reaction === "abandoned" || r.reaction === "too slow").length;
    const total        = Math.max(readBooks.length, 1);

    return {
      // Reading preferences
      voice_label:               adaptedVoice,
      pacing_preference:         archetype?.pacingTolerance ?? 0.5,
      completion_rate:           finished / total,
      complexity_tolerance:      archetype?.id === "analytical_reader" ? 0.75
                                 : archetype?.id === "fast_explorer"   ? 0.35 : 0.55,
      // Genre affinities from adaptedUserState
      genre_literary:    adaptedUserState.voice === "literary"    ? 0.8 : 0.4,
      genre_thriller:    adaptedUserState.voice === "fast"        ? 0.7 : 0.3,
      genre_nonfiction:  adaptedUserState.voice === "analytical"  ? 0.8 : 0.35,

      // Voice and tone
      response_length:   archetype?.pitchLength === "short" ? 0.2
                         : archetype?.pitchLength === "long" ? 0.8 : 0.5,
      tone_warmth:       adaptedVoice === "emotional" ? 0.85
                         : adaptedVoice === "analytical" ? 0.25 : 0.6,

      // Cluster adjustments
      cluster_rec_adjustments: archetype ? {
        boost_pacing:             archetype.id === "fast_explorer" ? "fast" : null,
        preferred_signal_types:   archetype.signalPriority,
        pitch_length:             archetype.pitchLength,
        voice_bias:               archetype.tonePreference,
        intervention_threshold:   archetype.interventionAt,
      } : null,

      // Intervention
      current_intervention_level: interventionLevel,

      // Recent snapshot (approximated from outcomes)
      books_abandoned_7d:  abandoned,
      books_finished_7d:   finished,
      recs_saved_7d:       savedBooks.length,
      avg_save_rate_7d:    savedBooks.length / Math.max(total * 2, 1),
    };
  }, [adaptedVoice, archetype, interventionLevel, reactions, readBooks,
      adaptedUserState, savedBooks]);

  // ── UNIFIED RANKING — one winner across recs + signals + nudge ──────────────
  const [lastSurfaced, setLastSurfaced] = useState([]);
  // rerunKey increments after meaningful interactions to trigger TopMoment re-rank
  const [rerunKey, setRerunKey] = useState(0);
  const bumpRerunKey = useCallback(() => setRerunKey(k => k + 1), []);

  // rankedSignals at component scope — passed into TopMoment for candidate scoring
  const rankedSignals = useMemo(() => rankSignals({
    corpus: SIGNAL_CORPUS,
    userState: { readBooks, savedBooks, voice: bgVoice, mood },
    reactions, dismissedSignals, signalEngagements,
  }), [readBooks, savedBooks, bgVoice, mood, reactions, dismissedSignals, signalEngagements]);

  // ── UI STATE ──────────────────────────────────────────────────────────────
  const [showPro, setPro]           = useState(false);
  const [proStep,  setProStep]       = useState("pitch"); // "pitch" | "card" | "done"
  const [proError, setProError]      = useState("");
  const [proBusy,  setProBusy]       = useState(false);
  const [proCard,  setProCard]       = useState({ number:"", expiry:"", cvc:"", name:"" });
  const [shelfToast, setShelfToast] = useState(null); // { title } shown briefly when book auto-added
  const [discBook,   setDiscBook]   = useState(null); // book being discussed
  const [detailBook, setDetailBook] = useState(null); // glass detail sheet
  const [showWelcome, setShowWelcome] = useState(() => {
    try {
      const last = localStorage.getItem("ls_welcome_shown");
      if (!last) return true;
      const lastDate = new Date(last).toDateString();
      return lastDate !== new Date().toDateString(); // show once per day
    } catch { return true; }
  });
  const [shelfTab, setShelfTab]   = useState("read");
  const [bookInput, setBookInput] = useState("");
  const [wantInput, setWantInput] = useState("");
  const [tappedBook, setTappedBook]       = useState(null);
  const [quickRateDone, setQuickRateDone] = useState(() => { try { return !!localStorage.getItem("ls_qr_done"); } catch { return false; } });
  const [referralCount, setReferralCount] = useState(() => { try { return parseInt(localStorage.getItem("ls_refs")||"0",10); } catch { return 0; } });
  // Referral bonus adds to daily question limit
  const refMilestone = getReferralMilestone(referralCount);
  const refBonus = (!isPro && isSignedIn && refMilestone) ? refMilestone.bonus : 0;
  const questionLimit = isPro ? Infinity : isSignedIn ? LIMIT_FREE + refBonus : LIMIT_ANON;
  const questionsLeft = questionLimit === Infinity ? null : Math.max(0, questionLimit - questionsUsed);
  const atLimit = !isPro && questionsUsed >= questionLimit;
  const [msgs, setMsgs]           = useState([]);
  const [chatIn, setChatIn]       = useState("");
  const [chatLoad, setLoad]       = useState(false);
  const [linkCard, setLinkCard]   = useState(null); // {phase,url,book} | null
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({behavior:"smooth"}); }, [msgs, chatLoad]);

  // ── SHELF ACTIONS ─────────────────────────────────────────────────────────
  const requireAuth = (cb) => { if (!isSignedIn) { setAuthMode("signup"); setShowAuth(true); return; } cb(); };
  const addBook    = () => requireAuth(() => { if (!bookInput.trim()) return; setReadBooks(p=>[...p,{id:Date.now(),title:bookInput.trim(),author:"",rating:3}]); setBookInput(""); });
  const setRating  = (id,r) => setReadBooks(p=>p.map(b=>b.id===id?{...b,rating:r}:b));
  const removeBook = (id) => setReadBooks(p=>p.filter(b=>b.id!==id));
  const addWant    = () => requireAuth(() => { if (!wantInput.trim()) return; setWantList(p=>[...p,wantInput.trim()]); setWantInput(""); });

  // ── PROFILE ───────────────────────────────────────────────────────────────
  // ── STEP 2: intelligence-aware profile for AI system prompt ─────────────────
  // Old: raw list of titles and ratings.
  // New: structured, voice-calibrated context block that tells the AI
  //      how to behave, not just what the user has read.
  const buildProfile = useCallback(() => {
    const books = isPro ? readBooks : readBooks.slice(-MEM_BOOKS);
    const hasHistory = books.length > 0;
    const {
      current_intervention_level,
      cluster_rec_adjustments,
    } = intelligence;

    const lines = [];

    // New user — no assumptions, just ask
    if (!hasHistory && !currentBook) {
      lines.push("This is a new user with no reading history yet. Do NOT assume anything about their taste, reading habits, or past books. Ask what they enjoy or what they're looking for.");
      if (mood)  lines.push(`Current mood: ${mood}.`);
      if (genre) lines.push(`They selected genre: ${genre}.`);
      return lines.join(" ");
    }

    // Has history — only state what we actually know
    if (books.length) {
      lines.push(`Books read and rated: ${books.map(b=>`"${b.title}"${b.author?` by ${b.author}`:""} (${b.rating}/5)`).join(", ")}.`);
    }

    if (currentBook) {
      lines.push(`CURRENTLY READING: "${currentBook}". Ask about this book first before recommending anything else.`);
    }

    // Only include reactions that actually exist
    const reactionEntries = Object.entries(reactions).sort((a,b)=>b[1].ts-a[1].ts).slice(0,3);
    if (reactionEntries.length) {
      const reactionMap = { loved:"loved it", finished:"finished it", abandoned:"stopped reading", "too slow":"said it was too slow", fast:"said it was hard to put down" };
      reactionEntries.forEach(([bookId, {reaction, note}]) => {
        const book = [...readBooks, ...savedBooks].find(b => String(b.id) === bookId);
        if (book) {
          lines.push(`They ${reactionMap[reaction]||reaction} "${book.title}"${note ? ` — they said: "${note}"` : ""}.`);
        }
      });
    }

    if (wantList.length)  lines.push(`Want to read: ${wantList.slice(0,5).join(", ")}.`);
    if (mood)             lines.push(`Current mood: ${mood}.`);
    if (genre)            lines.push(`Preferred genre: ${genre}.`);

    // Only add behavioral context if we have enough data to be confident
    if (books.length >= 3 && current_intervention_level >= 2) {
      lines.push("Recent pattern: they've been abandoning books. Lean toward faster, shorter reads.");
    } else if (books.length >= 3 && current_intervention_level === 1) {
      lines.push("Some recent abandonment. Prioritize books with strong momentum.");
    }

    if (books.length >= 5 && cluster_rec_adjustments?.boost_pacing === "fast") {
      lines.push("This reader finishes fast-paced books more consistently.");
    }

    return lines.filter(Boolean).join(" ") || "";
  }, [readBooks, currentBook, wantList, mood, genre, isPro, intelligence, reactions, savedBooks]);

  // ── CHAT ──────────────────────────────────────────────────────────────────
  const sendChat = async (msg, isRetry=false) => {
    if (chatLoad||!msg.trim()) return;
    if (atLimit) { setPro(true); return; }

    // Detect if user mentions having read a book — add it silently
    const detected = detectBookMention(msg);
    if (detected) {
      const alreadyOnShelf = readBooks.some(b =>
        b.title.toLowerCase() === detected.title.toLowerCase()
      );
      if (!alreadyOnShelf) {
        setReadBooks(prev => [...prev, {
          id: Date.now(),
          title: detected.title,
          author: detected.author,
          rating: 3, // default — they can rate it properly on shelf
        }]);
        setShelfToast(detected.title);
        setTimeout(() => setShelfToast(null), 3000);
      }
    }
    setLoad(true);
    const base = isRetry ? msgs.slice(0,-1) : msgs;
    const newMsgs = [...base,{role:"user",content:msg}];
    setMsgs(newMsgs); setChatIn("");
    const next = questionsUsed+1;
    setQuestionsUsed(next); saveCounter(next);
    const sys = `${AI_SYSTEM}\n\nReader profile: ${buildProfile()||"No reading history yet."}`;
    try {
      // ⚠️ PRODUCTION: Replace with "/api/ai" (streaming endpoint)
      const res = await fetch("/api/ai",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:700,
          system:sys,
          messages:newMsgs,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const d = await res.json();
      const fullText = d.content?.[0]?.text;
      if (!fullText) throw new Error("Empty");

      // Typewriter effect — types the full response word by word
      // More reliable than true streaming on Safari iOS
      const words = fullText.split(" ");
      setMsgs(prev => [...prev, {role:"assistant", content:"", streaming:true}]);

      for (let i = 0; i < words.length; i++) {
        const partial = words.slice(0, i + 1).join(" ");
        setMsgs(prev => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          if (last?.streaming) msgs[msgs.length - 1] = {...last, content: partial};
          return msgs;
        });
        // Small delay between words — feels natural, not robotic
        await new Promise(r => setTimeout(r, 18));
      }

      // Finalise
      setMsgs(prev => {
        const msgs = [...prev];
        const last = msgs[msgs.length - 1];
        if (last?.streaming) msgs[msgs.length - 1] = {role:"assistant", content: fullText};
        return msgs;
      });

    } catch {
      setQuestionsUsed(questionsUsed); saveCounter(questionsUsed);
      setMsgs(prev => {
        // Remove the empty streaming placeholder if it exists
        const cleaned = prev[prev.length-1]?.streaming ? prev.slice(0,-1) : prev;
        return [...cleaned, {role:"assistant",content:"Something went quiet — check your connection and try again.",isError:true,retryMsg:msg}];
      });
    }
    setLoad(false);
  };

  const dismissWelcome = () => {
    try { localStorage.setItem("ls_welcome_shown", new Date().toISOString()); } catch {}
    setShowWelcome(false);
  };

  // ── LINK HANDLING ─────────────────────────────────────────────────────────
  const fetchLinkMeta = useCallback(async (url) => {
    try {
      const res = await fetch("/api/ai", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 300,
          system: `Identify the book from this URL. Return ONLY raw JSON — no markdown.
{"title":"string","author":"string","description":"string","found":true}
If unrecognised: {"found":false,"title":"","author":"","description":""}
description: one sentence max.`,
          messages: [{ role: "user", content: url }],
        }),
      });
      const data = await res.json();
      const raw  = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
      const book = JSON.parse(raw);
      if (book.found && book.title) {
        setLinkCard(prev => prev ? { ...prev, phase: "asking", book } : null);
      } else {
        setLinkCard(null);
      }
    } catch { setLinkCard(null); }
  }, []);

  const handleChatChange = useCallback((e) => {
    const val = e.target.value;
    setChatIn(val);
    if (/^https?:\/\/\S+$/i.test(val.trim())) {
      setLinkCard({ phase: "loading", url: val.trim(), book: null });
      fetchLinkMeta(val.trim());
    } else if (linkCard) {
      setLinkCard(null);
    }
  }, [linkCard, fetchLinkMeta]);

  const goAsk = (prompt) => { setTab("ask"); setTimeout(()=>sendChat(prompt),80); };

  // ── BACK NAVIGATION ───────────────────────────────────────────────────────
  // Priority order: overlay → ask result → tab → root
  const goBack = useCallback(() => {
    if (detailBook) { setDetailBook(null); return; }
    if (tappedBook) { setTappedBook(null); return; }
    if (tab === "ask" && msgs.length > 0) { setMsgs([]); setChatIn(""); return; }
    if (tab !== "discover") {
      setTab("discover");
      requestAnimationFrame(() => {
        if (discoverScrollRef.current) discoverScrollRef.current.scrollTop = discoverScrollPos.current;
      });
      return;
    }
  }, [detailBook, tappedBook, tab, msgs]);

  const canGoBack = !!(detailBook || tappedBook || (tab === "ask" && msgs.length > 0) || tab !== "discover");

  // Stable ref so the popstate listener always calls the latest goBack
  const goBackRef = useRef(goBack);
  useEffect(() => { goBackRef.current = goBack; }, [goBack]);

  // Wire browser back to internal navigation — never exits the app
  useEffect(() => {
    window.history.replaceState({ ls: true }, "");
    window.history.pushState({ ls: true }, ""); // buffer entry
    const handlePopState = () => {
      goBackRef.current();
      window.history.pushState({ ls: true }, ""); // re-push so next back still works
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // ── AUTH HANDLERS ─────────────────────────────────────────────────────────
  const handleAuth = async () => {
    setAuthError("");
    if (!authEmail.trim() || !authPass.trim()) { setAuthError("Please fill in both fields."); return; }
    try {
      if (authMode === "signup") {
        await signUp(authEmail.trim(), authPass.trim());
        // Supabase sends a confirmation email by default
        // For now we auto-sign-in after signup
        await signIn(authEmail.trim(), authPass.trim());
      } else {
        await signIn(authEmail.trim(), authPass.trim());
      }
      setShowAuth(false); setAuthEmail(""); setAuthPass(""); setAuthError("");
    } catch (err) {
      setAuthError(err.message || "Something went wrong. Please try again.");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setIsPro(false);
    setReadBooks([]); setCurrentBook(""); setWantList([]);
    localStorage.removeItem("ls_pro");
  };

  const handleUpgrade = () => {
    if (!isSignedIn) { setShowAuth(true); setAuthMode("signup"); setPro(false); return; }
    localStorage.setItem("ls_pro", "1");
    setIsPro(true);
    setPro(false);
  };


  // ── BACKGROUND — inline gradients, no CSS class dependency ─────────────────
  const discoverRows = buildDiscoverRows(BOOKS, adaptedUserState);

  return (
    <div style={{ position:"relative", height:"100dvh", overflow:"hidden", background:"#12100E" }}>
      <style>{CSS}</style>

      {/* ── BACKGROUND — intent-driven photography ── */}
      {/* Image layer — crossfades on bgKey change */}
      <div style={{ position:"absolute", inset:0, zIndex:0, pointerEvents:"none", overflow:"hidden" }}>
        <div
          key={bgKey}
          style={{
            position:"absolute", inset:"-5%",
            backgroundImage: `url('${BACKGROUNDS[bgKey]}')`,
            backgroundSize: "cover", backgroundPosition: "center",
            filter: "blur(8px) saturate(0.9) brightness(0.8)",
            animation: "bgFadeIn 1.4s ease forwards",
          }}
        />
      </div>
      {/* Dark overlay — spec: rgba(10,8,6,0.65) */}
      <div style={{
        position:"absolute", inset:0, zIndex:1, pointerEvents:"none",
        background: "rgba(10,8,6,0.65)",
      }}/>
      {/* Vignette — deep warm edge shadow */}
      <div style={{
        position:"absolute", inset:0, zIndex:2, pointerEvents:"none",
        background:"radial-gradient(ellipse 130% 100% at 50% 40%, transparent 0%, rgba(8,6,4,.18) 52%, rgba(6,4,2,.62) 100%)",
      }}/>
      {/* Grain — paper/leather tactile texture */}
      <div className="ls-grain"/>

      {/* ── APP ── */}
      <div className="ls" style={{ position:"relative", zIndex:3, background:"transparent" }}>

      {/* HEADER */}
      <header className="ls-hdr">
        <div className="ls-hdr-left">
          {canGoBack && (
            <button className="ls-back-btn" onClick={goBack} aria-label="Go back">
              <ChevronLeft size={22} strokeWidth={2.25}/>
            </button>
          )}
          <div className="ls-logo">
          {isPro ? (
            /* Pro logo — includes red PRO badge built into the SVG */
            <svg height="32" viewBox="0 0 1267.82 368.3" xmlns="http://www.w3.org/2000/svg" style={{width:"auto"}}>
              <defs><style>{`.lp1{fill:#931a1d}.lp2{fill:#fff;stroke:#fff;stroke-miterlimit:10}.lp3{fill:#d4941a}.ls2{fill:#fff}`}</style></defs>
              <g><g>
                <path className="lp3" d="M799.84,92.35c7.82,0,13.41,4.25,16.78,12.74,3.37,8.49,3.81,19.41,1.35,32.77-1.26,6.61-1.1,10.44.49,11.47h2.51c17.19-19.83,26.45-32.28,27.77-37.34,1.52-5.83-1.11-13.13-7.9-21.88-6.79-8.75-17.03-13.13-30.71-13.13-18.06,0-34.74,8.43-50.03,25.28-15.3,16.85-25.57,35.33-30.82,55.42-3.02,11.54-4.07,23.4-3.16,35.59.91,12.19,5.69,27.07,14.34,44.66,8.65,17.59,13.45,30.04,14.39,37.36.94,7.32.57,14.22-1.12,20.69-3.28,12.56-9.85,23.61-19.69,33.13-9.84,9.52-19.7,14.28-29.56,14.28-9.03,0-15.36-3.82-18.99-11.47-3.63-7.65-3.5-21.58.38-41.81,1.23-6.48,1.53-10.92.9-13.32-.63-2.4-2.44-3.6-5.41-3.6-.84,0-5.83,6.61-14.96,19.83-9.14,13.22-14.18,21.65-15.12,25.28-1.69,6.48,1.28,14.88,8.92,25.18,7.64,10.31,19.42,15.46,35.34,15.46,19.27,0,38.39-8.78,57.36-26.35,18.97-17.56,31.47-37.88,37.51-60.96,2.61-9.98,3.36-20.52,2.25-31.6-1.11-11.08-6.26-25.97-15.46-44.67-9.2-18.7-14.36-32.35-15.48-40.96-1.12-8.61-.7-16.67,1.27-24.18,2.71-10.36,7.69-19.26,14.94-26.71,7.25-7.44,14.55-11.17,21.91-11.17Z"/>
                <path className="lp3" d="M1139.37,213.87c1.42-5.44,3.66-11.14,6.7-17.1,1.28-2.07,2.18-4.08,2.69-6.02.27-1.04-.06-1.56-.99-1.56-1.3,0-5.41.75-12.31,2.24-6.91,1.49-13.88,3.4-20.91,5.74-15.12,29.01-37.4,59.54-66.81,91.6h0c-.05.05-.11.11-.16.17-1.43,1.56-2.86,3.11-4.32,4.68l-.09.33c-19.19,21.55-31.96,32.34-38.28,32.34-4.57,0-5.84-3.9-3.8-11.7,1.53-5.85,7.6-18.56,18.2-38.14,15.46-28.52,24.81-49,28.06-61.43,1.96-7.51,2.02-13.76.16-18.74-1.86-4.98-5.16-7.48-9.89-7.48-6.97,0-16.13,4.57-27.49,13.71-11.36,9.14-27.76,25.57-49.22,49.29,6.27-15.43,16.49-36.56,30.67-63.39l-36.46,9.14c-13.83,23.33-24.92,44.34-33.29,63-4.1,9.15-7.85,18.56-11.25,28.23-15.38,15.79-26.46,25.99-33.24,30.59-6.79,4.6-13.25,6.9-19.4,6.9-15.73,0-22.16-12.64-19.27-37.92,45.33-16.72,71.5-38.5,78.51-65.34,2.64-10.11,2.17-18.28-1.42-24.5-3.59-6.22-9.71-9.33-18.37-9.33-16.66,0-34.74,11.12-54.24,33.35-19.5,22.23-32.83,47.09-40.02,74.57-4.81,18.41-4.81,33.25.02,44.53,4.82,11.28,13.57,16.92,26.23,16.92,11.36,0,22.74-3.86,34.16-11.57,10.99-7.42,24.14-18.82,39.43-34.1-.65,2.31-1.28,4.63-1.9,6.97-2.24,8.56-5.13,21.58-8.68,39.09l33.5-10.11c3.05-11.67,5.61-20.93,7.69-27.81,2.87-9.2,6.44-19.31,10.72-30.34,2.53-6.48,6.28-12.64,11.25-18.47l11.12-12.64c4.1-4.67,7.89-8.81,11.35-12.45,4-4.28,7.56-7.91,10.67-10.89,3.45-3.24,6.39-5.77,8.82-7.58,2.61-1.81,4.57-2.72,5.88-2.72,2.33,0,2.95,2.08,1.86,6.22s-5.81,13.87-14.19,29.17c-15.65,28.52-25.28,49.72-28.91,63.59-2.68,10.24-2.9,18.41-.68,24.5,2.22,6.09,6.45,9.14,12.69,9.14,15.36,0,37.92-15.81,67.7-47.45,23.21-25.41,43.38-50.23,60.52-74.48-.36,9.21.85,20.61,3.63,34.22,2.77,13.61,3.09,24.5.95,32.67-2.2,8.43-6.75,16.31-13.65,23.63-6.9,7.33-13.18,10.99-18.86,10.99s-8.29-5.31-7.84-15.95c.45-10.63-.81-15.95-3.79-15.95-2.23,0-7.07,4.34-14.51,13.03-7.44,8.69-11.56,14.58-12.37,17.7-1.39,5.32-.09,10.31,3.91,14.97,3.99,4.67,9.15,7,15.48,7,14.61,0,31.15-9.2,49.6-27.61,18.45-18.41,30.26-37.53,35.45-57.36,2.61-9.98,2.65-20.81.12-32.48-2.53-11.67-2.92-20.88-1.17-27.62ZM862.68,224.29c8.99-13.03,16.56-19.54,22.7-19.54,6.52,0,8.15,6.22,4.9,18.67-6.57,25.15-23,42.39-49.26,51.73,5.45-20.87,12.68-37.82,21.67-50.85Z"/>
                <path className="lp3" d="M1226.29,319.38c-6.79,4.6-13.25,6.9-19.4,6.9-15.73,0-22.16-12.64-19.27-37.92,45.33-16.72,71.5-38.5,78.51-65.34,2.64-10.11,2.17-18.28-1.42-24.5-3.59-6.22-9.71-9.33-18.37-9.33-16.67,0-34.74,11.12-54.24,33.35-19.5,22.23-32.83,47.09-40.02,74.57-4.81,18.41-4.8,33.25.02,44.53,4.82,11.28,13.57,16.92,26.23,16.92,11.36,0,22.74-3.86,34.16-11.57,11.42-7.71,25.16-19.67,41.21-35.88l5.84-22.36c-15.4,15.82-26.49,26.03-33.28,30.63ZM1211.63,224.29c8.99-13.03,16.56-19.54,22.7-19.54,6.51,0,8.15,6.22,4.9,18.67-6.57,25.15-23,42.39-49.26,51.73,5.45-20.87,12.68-37.82,21.67-50.85Z"/>
              </g><g>
                <path className="ls2" d="M551.37,199.01c-2.51,10.46-4.77,17.95-6.77,22.47-2,4.52-4.59,8.72-7.75,12.59-1.95,3.62-6.14,7.24-12.57,10.85-8.57,4.78-20.34,7.17-35.33,7.17l-8.8-.19-8.24.19-13.27-.75c-.93-1.17-1.4-3.7-1.4-7.59l.56-92.27c0-5.19.05-9.41.14-12.65.28-8.7.42-16.42.42-23.17,0-5.84-.14-12.65-.42-20.44-.19-4.93-.28-8.43-.28-10.51,0-1.69.03-3.37.1-5.06.21-6.49.31-10.06.31-10.71v-5.64l.42-12.26.14-5.45c.19-.65.46-1.43.84-2.34,1.12-.78,1.91-1.29,2.37-1.56l17.31-5.65c3.54-.65,5.59-1.43,6.14-2.34,1.02-1.54,1.54-3.78,1.54-6.72,0-3.71-.37-6.27-1.12-7.68-.56-1.02-1.54-1.54-2.93-1.54-.47,0-2.19.18-5.17.53-10.05,1.08-18.29,1.61-24.72,1.61l-14.8-.39-19.97.19c-13.96-1.04-22.06-1.56-24.3-1.56-.93,0-1.82.33-2.65.97-.09,2.08-.14,3.63-.14,4.67,0,1.82.09,4.41.28,7.78,1.3,1.56,3.58,2.92,6.84,4.08,1.86.52,3.96,1.43,6.28,2.72,3.07,1.69,4.84,2.66,5.31,2.92,4.75,2.08,7.42,3.8,8.03,5.16.6,1.36,1.23,8.85,1.89,22.48v2.73l-.14,19.66-.56,43.4.28,20.25-.14,19.07v16.15l-.84,25.3.28,24.91c0,2.08-.28,4.67-.84,7.78-1.21,1.5-3.63,2.32-7.26,2.44-.93,0-4.03.53-9.29,1.6-5.26,1.07-9.33,2.18-12.22,3.35-.65,2.46-.98,6.42-.98,11.86,0,1.04.09,2.27.28,3.69,1.21.13,2.09.19,2.65.19h2.09c9.59-1.04,19.87-1.75,30.86-2.14l28.49-1.17c15.27,0,30.86.39,46.78,1.17s24.81,1.23,26.67,1.36c10.24,1.04,15.78,1.56,16.62,1.56l7.26-.19h5.17c.56,0,1.91-.26,4.05-.78.65-2.07,1.3-7.76,1.95-17.07,1.68-23.27,2.51-39.56,2.51-48.87v-5.43c-2.79-.52-5.31-.78-7.54-.78h-4.47Z"/>
                <path className="ls2" d="M606.25,66.78c3.26,0,6.45-1.33,9.56-3.99,3.12-2.66,5.4-6.19,6.84-10.6,1.44-4.41,2.16-8.81,2.16-13.22,0-5.96-1.82-11.31-5.45-16.04-3.63-4.73-8.19-7.1-13.68-7.1-5.12,0-9.31,2.24-12.57,6.71-3.26,4.47-4.89,10.21-4.89,17.21,0,7.39,1.89,13.74,5.66,19.06,3.77,5.32,7.89,7.97,12.36,7.97Z"/>
                <path className="ls2" d="M620.91,254.63c-.37-4.41-.56-9.33-.56-14.78l.98-79.34c0-25.67-.19-46.54-.56-62.61h-9.36c-5.77,7.91-11.13,13.42-16.06,16.53-7.26,4.8-15.69,7.58-25.27,8.36v10.89c6.75.65,11.48,1.69,14.2,3.11,2.72,1.43,4.59,3.11,5.62,5.06.56,4.28.84,8.43.84,12.45l-.42,31.7.21,9.14-.21,9.72c.28,7,.42,11.73.42,14.2,0,3.11-.07,6.71-.21,10.79s-.21,6.9-.21,8.46v2.14c0,6.09-.44,10.01-1.33,11.76-.89,1.75-2.49,3.08-4.82,3.99l-15.78,2.92.28,12.64c1.58,0,4.51-.23,8.78-.68,4.27-.45,8.69-.68,13.24-.68,15.89,0,28.57.33,38.05.97,2.88.26,5.02.39,6.41.39,1.21,0,3.07-.06,5.57-.19l.28-10.7c-1.49-.78-3.49-1.42-6-1.94-6.52-1.42-11.22-2.85-14.1-4.28Z"/>
                <path className="ls2" d="M730.38,248.41c-1.4-2.46-3.21-4.92-5.45-7.38-1.21,1.17-2.09,2.07-2.65,2.72-2.89,3.1-4.93,4.98-6.14,5.63-1.21.65-3.07.97-5.59.97s-4.98-.71-7.12-2.14c-1.68-3.24-2.77-6.64-3.28-10.21-.51-3.57-.72-12.54-.63-26.93l.28-74.29,6.7-.58,2.51.19h7.26c2.23.52,3.72.78,4.47.78,1.58,0,3.91-.39,6.98-1.16.65-3.98.98-7.45.98-10.4,0-2.69-.28-5.78-.84-9.24-6.33.26-9.82.39-10.47.39-8.29.52-12.66.78-13.13.78l-3.21-.19c-.09-2.33-.14-3.82-.14-4.47l.42-11.47c.09-3.76.14-9.01.14-15.75,0-3.76-.42-7.32-1.26-10.7h-7.82c-5.59,13.98-10.82,24.08-15.71,30.29-4.89,6.22-12.82,12.56-23.81,19.03-.19,5.01-.28,7.89-.28,8.66,0,1.03.28,2.12.84,3.27l1.82.97,10.05-.39,4.33.39v55.34l-.56,34.18c0,16.06,2.7,27.9,8.1,35.54,5.4,7.64,12.43,11.46,21.08,11.46,6.7,0,13.01-2.04,18.92-6.13,5.91-4.08,10.49-9.69,13.75-16.82l-.56-2.33Z"/>
              </g></g>
              <path className="lp3" d="M356.87,35.66c-7.41.84-14.7,1.85-21.87,3.01V0l-12.14,2.66c-29.04,6.36-55.87,18.36-79.73,35.67-27.97,20.29-46.55,44.23-58.59,64.66-.18.17-.36.34-.53.5-.18-.17-.36-.34-.54-.5-12.04-20.43-30.62-44.37-58.59-64.66C101.01,21.02,74.18,9.02,45.14,2.66l-12.14-2.66v38.67c-7.17-1.16-14.46-2.17-21.87-3.01l-11.13-1.26v278.88l8.91.98c29.92,3.29,58.65,8.78,85.38,16.3,29.82,8.39,56.6,19.14,79.71,31.98,1.67.93,3.33,1.87,4.97,2.82l3.38,1.96,1.66.96,1.66-.96,3.38-1.96c1.64-.95,3.29-1.89,4.97-2.82,23.11-12.84,49.89-23.59,79.71-31.98,26.73-7.53,55.46-13.01,85.38-16.3l8.91-.98V34.4l-11.13,1.26ZM254.87,54.52c18.26-13.25,38.43-23.06,60.13-29.27v235.2c-22.79,5.55-44.71,14.01-65.28,25.19-20.26,11.02-38.93,24.49-55.72,40.21V127.68c1.82-3.78,3.92-7.83,6.33-12.06,8.62-15.13,21.26-32.65,39.36-48.84,4.69-4.2,9.74-8.3,15.18-12.26ZM53,25.25c21.69,6.2,41.87,16.02,60.13,29.27,5.45,3.95,10.49,8.06,15.18,12.26,18.1,16.19,30.73,33.71,39.36,48.84,2.41,4.23,4.52,8.28,6.33,12.06v198.18c-16.79-15.72-35.46-29.2-55.72-40.21-20.57-11.18-42.49-19.64-65.28-25.19V25.25ZM99.71,311.31c-25.12-7.07-51.89-12.4-79.71-15.88V56.93c4.38.61,8.71,1.28,13,2v217.59l7.92,1.68c23.75,5.04,46.56,13.46,67.8,25,12.28,6.67,23.91,14.33,34.85,22.9-13.82-5.52-28.47-10.47-43.87-14.8ZM348,295.43c-27.82,3.48-54.59,8.81-79.71,15.88-15.4,4.33-30.04,9.28-43.87,14.8,10.94-8.57,22.58-16.23,34.85-22.9,21.24-11.55,44.06-19.96,67.8-25l7.92-1.68V58.93c4.29-.72,8.62-1.4,13-2v238.5Z"/>
              <g>
                <path className="lp1" d="M1148.09,159.72h-210.37c-17.59,0-26.66-14.26-20.26-31.85l21.82-59.95c6.4-17.59,25.85-31.85,43.44-31.85h210.37c17.59,0,26.66,14.26,20.26,31.85l-21.82,59.95c-6.4,17.59-25.85,31.85-43.44,31.85Z"/>
                <g>
                  <path className="lp2" d="M1007.65,58.74c8.25,0,14.27,1.39,17.33,4.98,3.06,3.59,3.57,9.15.15,16.99-6.8,15.6-21.32,23.12-33.18,24.51-1.88.25-4.27.25-5.47.16l-7.63-2.29-7.94,18.22c-4.45,10.21-3.73,10.87,6.39,11.68l-1.49,3.43h-32.21l1.49-3.43c9.53-.82,10.96-1.8,15.3-11.76l20.54-47.14c4.66-10.7,3.87-11.19-4.43-11.76l1.57-3.59h29.59ZM980.66,98.93c1.22.57,3.98,1.47,7.6,1.47,7.17,0,18.04-4.08,24.66-19.28,5.66-12.99.15-18.38-8.95-18.38-3.16,0-5.83.65-6.96,1.47s-2.16,2.12-3.62,5.47l-12.74,29.25Z"/>
                  <path className="lp2" d="M1077.15,137.49c-1.39,0-2.66-.08-3.98-.25-9.11-.49-12.75-3.1-14.65-10.95-1.4-5.8-2.01-13.07-2.99-18.79-.59-3.43-1.95-4.9-7.88-4.9h-3.24l-8.11,18.63c-4.38,10.05-3.69,10.95,5.2,11.76l-1.49,3.43h-31.21l1.49-3.43c9.68-.82,11.15-1.72,15.53-11.76l20.64-47.38c4.45-10.21,3.73-10.87-4.92-11.52l1.57-3.59h29.51c8.71,0,13.87,1.06,16.91,4.17,3.35,3.1,3.96,8.41.8,15.68-4.52,10.37-13.54,16.58-23.39,20.26.3,3.92,1.58,11.76,2.66,17.24,1.42,6.29,2.43,9.64,3.84,12.58,1.4,3.51,3.37,4.82,5.71,5.47l-2,3.35ZM1051.32,98.61c5.78,0,10.06-.98,14.06-3.43,5.96-3.59,9.76-8.25,12.57-14.7,5.59-12.83-.29-17.56-8.84-17.56-3.47,0-5.53.49-6.66,1.14-1.06.65-2.12,2.04-3.48,5.15l-12.81,29.41h5.16Z"/>
                  <path className="lp2" d="M1156.32,56.94c20.27,0,31.77,15.68,21.35,39.62-11.25,25.81-36.45,41.74-58.34,41.74s-31.55-16.91-21.51-39.95c9.43-21.65,33.38-41.42,58.43-41.42h.08ZM1151.82,61.44c-12.95,0-30.15,11.19-40.01,33.82s-4.55,38.56,12.02,38.56c12.95,0,29.58-10.95,39.66-34.07,10.93-25.08,3.59-38.31-11.59-38.31h-.08Z"/>
                </g>
              </g>
            </svg>
          ) : (
            /* Standard logo — white version */
            <svg height="32" viewBox="0 0 1267.82 368.3" xmlns="http://www.w3.org/2000/svg" style={{width:"auto"}}>
              <defs><style>{`.ls1{fill:#d4941a}.ls2{fill:#fff}`}</style></defs>
              <g><g>
                <path className="ls1" d="M799.84,92.35c7.82,0,13.41,4.25,16.78,12.74,3.37,8.49,3.81,19.41,1.35,32.77-1.26,6.61-1.1,10.44.49,11.47h2.51c17.19-19.83,26.45-32.28,27.77-37.34,1.52-5.83-1.11-13.13-7.9-21.88-6.79-8.75-17.03-13.13-30.71-13.13-18.06,0-34.74,8.43-50.03,25.28-15.3,16.85-25.57,35.33-30.82,55.42-3.02,11.54-4.07,23.4-3.16,35.59.91,12.19,5.69,27.07,14.34,44.66,8.65,17.59,13.45,30.04,14.39,37.36.94,7.32.57,14.22-1.12,20.69-3.28,12.56-9.85,23.61-19.69,33.13-9.84,9.52-19.7,14.28-29.56,14.28-9.03,0-15.36-3.82-18.99-11.47-3.63-7.65-3.5-21.58.38-41.81,1.23-6.48,1.53-10.92.9-13.32-.63-2.4-2.44-3.6-5.41-3.6-.84,0-5.83,6.61-14.96,19.83-9.14,13.22-14.18,21.65-15.12,25.28-1.69,6.48,1.28,14.88,8.92,25.18,7.64,10.31,19.42,15.46,35.34,15.46,19.27,0,38.39-8.78,57.36-26.35,18.97-17.56,31.47-37.88,37.51-60.96,2.61-9.98,3.36-20.52,2.25-31.6-1.11-11.08-6.26-25.97-15.46-44.67-9.2-18.7-14.36-32.35-15.48-40.96-1.12-8.61-.7-16.67,1.27-24.18,2.71-10.36,7.69-19.26,14.94-26.71,7.25-7.44,14.55-11.17,21.91-11.17Z"/>
                <path className="ls1" d="M1139.37,213.87c1.42-5.44,3.66-11.14,6.7-17.1,1.28-2.07,2.18-4.08,2.69-6.02.27-1.04-.06-1.56-.99-1.56-1.3,0-5.41.75-12.31,2.24-6.91,1.49-13.88,3.4-20.91,5.74-15.12,29.01-37.4,59.54-66.81,91.6h0c-.05.05-.11.11-.16.17-1.43,1.56-2.86,3.11-4.32,4.68l-.09.33c-19.19,21.55-31.96,32.34-38.28,32.34-4.57,0-5.84-3.9-3.8-11.7,1.53-5.85,7.6-18.56,18.2-38.14,15.46-28.52,24.81-49,28.06-61.43,1.96-7.51,2.02-13.76.16-18.74-1.86-4.98-5.16-7.48-9.89-7.48-6.97,0-16.13,4.57-27.49,13.71-11.36,9.14-27.76,25.57-49.22,49.29,6.27-15.43,16.49-36.56,30.67-63.39l-36.46,9.14c-13.83,23.33-24.92,44.34-33.29,63-4.1,9.15-7.85,18.56-11.25,28.23-15.38,15.79-26.46,25.99-33.24,30.59-6.79,4.6-13.25,6.9-19.4,6.9-15.73,0-22.16-12.64-19.27-37.92,45.33-16.72,71.5-38.5,78.51-65.34,2.64-10.11,2.17-18.28-1.42-24.5-3.59-6.22-9.71-9.33-18.37-9.33-16.66,0-34.74,11.12-54.24,33.35-19.5,22.23-32.83,47.09-40.02,74.57-4.81,18.41-4.81,33.25.02,44.53,4.82,11.28,13.57,16.92,26.23,16.92,11.36,0,22.74-3.86,34.16-11.57,10.99-7.42,24.14-18.82,39.43-34.1-.65,2.31-1.28,4.63-1.9,6.97-2.24,8.56-5.13,21.58-8.68,39.09l33.5-10.11c3.05-11.67,5.61-20.93,7.69-27.81,2.87-9.2,6.44-19.31,10.72-30.34,2.53-6.48,6.28-12.64,11.25-18.47l11.12-12.64c4.1-4.67,7.89-8.81,11.35-12.45,4-4.28,7.56-7.91,10.67-10.89,3.45-3.24,6.39-5.77,8.82-7.58,2.61-1.81,4.57-2.72,5.88-2.72,2.33,0,2.95,2.08,1.86,6.22s-5.81,13.87-14.19,29.17c-15.65,28.52-25.28,49.72-28.91,63.59-2.68,10.24-2.9,18.41-.68,24.5,2.22,6.09,6.45,9.14,12.69,9.14,15.36,0,37.92-15.81,67.7-47.45,23.21-25.41,43.38-50.23,60.52-74.48-.36,9.21.85,20.61,3.63,34.22,2.77,13.61,3.09,24.5.95,32.67-2.2,8.43-6.75,16.31-13.65,23.63-6.9,7.33-13.18,10.99-18.86,10.99s-8.29-5.31-7.84-15.95c.45-10.63-.81-15.95-3.79-15.95-2.23,0-7.07,4.34-14.51,13.03-7.44,8.69-11.56,14.58-12.37,17.7-1.39,5.32-.09,10.31,3.91,14.97,3.99,4.67,9.15,7,15.48,7,14.61,0,31.15-9.2,49.6-27.61,18.45-18.41,30.26-37.53,35.45-57.36,2.61-9.98,2.65-20.81.12-32.48-2.53-11.67-2.92-20.88-1.17-27.62ZM862.68,224.29c8.99-13.03,16.56-19.54,22.7-19.54,6.52,0,8.15,6.22,4.9,18.67-6.57,25.15-23,42.39-49.26,51.73,5.45-20.87,12.68-37.82,21.67-50.85Z"/>
                <path className="ls1" d="M1226.29,319.38c-6.79,4.6-13.25,6.9-19.4,6.9-15.73,0-22.16-12.64-19.27-37.92,45.33-16.72,71.5-38.5,78.51-65.34,2.64-10.11,2.17-18.28-1.42-24.5-3.59-6.22-9.71-9.33-18.37-9.33-16.67,0-34.74,11.12-54.24,33.35-19.5,22.23-32.83,47.09-40.02,74.57-4.81,18.41-4.8,33.25.02,44.53,4.82,11.28,13.57,16.92,26.23,16.92,11.36,0,22.74-3.86,34.16-11.57,11.42-7.71,25.16-19.67,41.21-35.88l5.84-22.36c-15.4,15.82-26.49,26.03-33.28,30.63ZM1211.63,224.29c8.99-13.03,16.56-19.54,22.7-19.54,6.51,0,8.15,6.22,4.9,18.67-6.57,25.15-23,42.39-49.26,51.73,5.45-20.87,12.68-37.82,21.67-50.85Z"/>
              </g><g>
                <path className="ls2" d="M551.37,199.01c-2.51,10.46-4.77,17.95-6.77,22.47-2,4.52-4.59,8.72-7.75,12.59-1.95,3.62-6.14,7.24-12.57,10.85-8.57,4.78-20.34,7.17-35.33,7.17l-8.8-.19-8.24.19-13.27-.75c-.93-1.17-1.4-3.7-1.4-7.59l.56-92.27c0-5.19.05-9.41.14-12.65.28-8.7.42-16.42.42-23.17,0-5.84-.14-12.65-.42-20.44-.19-4.93-.28-8.43-.28-10.51,0-1.69.03-3.37.1-5.06.21-6.49.31-10.06.31-10.71v-5.64l.42-12.26.14-5.45c.19-.65.46-1.43.84-2.34,1.12-.78,1.91-1.29,2.37-1.56l17.31-5.65c3.54-.65,5.59-1.43,6.14-2.34,1.02-1.54,1.54-3.78,1.54-6.72,0-3.71-.37-6.27-1.12-7.68-.56-1.02-1.54-1.54-2.93-1.54-.47,0-2.19.18-5.17.53-10.05,1.08-18.29,1.61-24.72,1.61l-14.8-.39-19.97.19c-13.96-1.04-22.06-1.56-24.3-1.56-.93,0-1.82.33-2.65.97-.09,2.08-.14,3.63-.14,4.67,0,1.82.09,4.41.28,7.78,1.3,1.56,3.58,2.92,6.84,4.08,1.86.52,3.96,1.43,6.28,2.72,3.07,1.69,4.84,2.66,5.31,2.92,4.75,2.08,7.42,3.8,8.03,5.16.6,1.36,1.23,8.85,1.89,22.48v2.73l-.14,19.66-.56,43.4.28,20.25-.14,19.07v16.15l-.84,25.3.28,24.91c0,2.08-.28,4.67-.84,7.78-1.21,1.5-3.63,2.32-7.26,2.44-.93,0-4.03.53-9.29,1.6-5.26,1.07-9.33,2.18-12.22,3.35-.65,2.46-.98,6.42-.98,11.86,0,1.04.09,2.27.28,3.69,1.21.13,2.09.19,2.65.19h2.09c9.59-1.04,19.87-1.75,30.86-2.14l28.49-1.17c15.27,0,30.86.39,46.78,1.17s24.81,1.23,26.67,1.36c10.24,1.04,15.78,1.56,16.62,1.56l7.26-.19h5.17c.56,0,1.91-.26,4.05-.78.65-2.07,1.3-7.76,1.95-17.07,1.68-23.27,2.51-39.56,2.51-48.87v-5.43c-2.79-.52-5.31-.78-7.54-.78h-4.47Z"/>
                <path className="ls2" d="M606.25,66.78c3.26,0,6.45-1.33,9.56-3.99,3.12-2.66,5.4-6.19,6.84-10.6,1.44-4.41,2.16-8.81,2.16-13.22,0-5.96-1.82-11.31-5.45-16.04-3.63-4.73-8.19-7.1-13.68-7.1-5.12,0-9.31,2.24-12.57,6.71-3.26,4.47-4.89,10.21-4.89,17.21,0,7.39,1.89,13.74,5.66,19.06,3.77,5.32,7.89,7.97,12.36,7.97Z"/>
                <path className="ls2" d="M620.91,254.63c-.37-4.41-.56-9.33-.56-14.78l.98-79.34c0-25.67-.19-46.54-.56-62.61h-9.36c-5.77,7.91-11.13,13.42-16.06,16.53-7.26,4.8-15.69,7.58-25.27,8.36v10.89c6.75.65,11.48,1.69,14.2,3.11,2.72,1.43,4.59,3.11,5.62,5.06.56,4.28.84,8.43.84,12.45l-.42,31.7.21,9.14-.21,9.72c.28,7,.42,11.73.42,14.2,0,3.11-.07,6.71-.21,10.79s-.21,6.9-.21,8.46v2.14c0,6.09-.44,10.01-1.33,11.76-.89,1.75-2.49,3.08-4.82,3.99l-15.78,2.92.28,12.64c1.58,0,4.51-.23,8.78-.68,4.27-.45,8.69-.68,13.24-.68,15.89,0,28.57.33,38.05.97,2.88.26,5.02.39,6.41.39,1.21,0,3.07-.06,5.57-.19l.28-10.7c-1.49-.78-3.49-1.42-6-1.94-6.52-1.42-11.22-2.85-14.1-4.28Z"/>
                <path className="ls2" d="M730.38,248.41c-1.4-2.46-3.21-4.92-5.45-7.38-1.21,1.17-2.09,2.07-2.65,2.72-2.89,3.1-4.93,4.98-6.14,5.63-1.21.65-3.07.97-5.59.97s-4.98-.71-7.12-2.14c-1.68-3.24-2.77-6.64-3.28-10.21-.51-3.57-.72-12.54-.63-26.93l.28-74.29,6.7-.58,2.51.19h7.26c2.23.52,3.72.78,4.47.78,1.58,0,3.91-.39,6.98-1.16.65-3.98.98-7.45.98-10.4,0-2.69-.28-5.78-.84-9.24-6.33.26-9.82.39-10.47.39-8.29.52-12.66.78-13.13.78l-3.21-.19c-.09-2.33-.14-3.82-.14-4.47l.42-11.47c.09-3.76.14-9.01.14-15.75,0-3.76-.42-7.32-1.26-10.7h-7.82c-5.59,13.98-10.82,24.08-15.71,30.29-4.89,6.22-12.82,12.56-23.81,19.03-.19,5.01-.28,7.89-.28,8.66,0,1.03.28,2.12.84,3.27l1.82.97,10.05-.39,4.33.39v55.34l-.56,34.18c0,16.06,2.7,27.9,8.1,35.54,5.4,7.64,12.43,11.46,21.08,11.46,6.7,0,13.01-2.04,18.92-6.13,5.91-4.08,10.49-9.69,13.75-16.82l-.56-2.33Z"/>
              </g></g>
              <path className="ls1" d="M356.87,35.66c-7.41.84-14.7,1.85-21.87,3.01V0l-12.14,2.66c-29.04,6.36-55.87,18.36-79.73,35.67-27.97,20.29-46.55,44.23-58.59,64.66-.18.17-.36.34-.53.5-.18-.17-.36-.34-.54-.5-12.04-20.43-30.62-44.37-58.59-64.66C101.01,21.02,74.18,9.02,45.14,2.66l-12.14-2.66v38.67c-7.17-1.16-14.46-2.17-21.87-3.01l-11.13-1.26v278.88l8.91.98c29.92,3.29,58.65,8.78,85.38,16.3,29.82,8.39,56.6,19.14,79.71,31.98,1.67.93,3.33,1.87,4.97,2.82l3.38,1.96,1.66.96,1.66-.96,3.38-1.96c1.64-.95,3.29-1.89,4.97-2.82,23.11-12.84,49.89-23.59,79.71-31.98,26.73-7.53,55.46-13.01,85.38-16.3l8.91-.98V34.4l-11.13,1.26ZM254.87,54.52c18.26-13.25,38.43-23.06,60.13-29.27v235.2c-22.79,5.55-44.71,14.01-65.28,25.19-20.26,11.02-38.93,24.49-55.72,40.21V127.68c1.82-3.78,3.92-7.83,6.33-12.06,8.62-15.13,21.26-32.65,39.36-48.84,4.69-4.2,9.74-8.3,15.18-12.26ZM53,25.25c21.69,6.2,41.87,16.02,60.13,29.27,5.45,3.95,10.49,8.06,15.18,12.26,18.1,16.19,30.73,33.71,39.36,48.84,2.41,4.23,4.52,8.28,6.33,12.06v198.18c-16.79-15.72-35.46-29.2-55.72-40.21-20.57-11.18-42.49-19.64-65.28-25.19V25.25ZM99.71,311.31c-25.12-7.07-51.89-12.4-79.71-15.88V56.93c4.38.61,8.71,1.28,13,2v217.59l7.92,1.68c23.75,5.04,46.56,13.46,67.8,25,12.28,6.67,23.91,14.33,34.85,22.9-13.82-5.52-28.47-10.47-43.87-14.8ZM348,295.43c-27.82,3.48-54.59,8.81-79.71,15.88-15.4,4.33-30.04,9.28-43.87,14.8,10.94-8.57,22.58-16.23,34.85-22.9,21.24-11.55,44.06-19.96,67.8-25l7.92-1.68V58.93c4.29-.72,8.62-1.4,13-2v238.5Z"/>
            </svg>
          )}
          <div className="ls-logo-sub" style={{display:"none"}}>Reading Companion</div>
        </div>
        </div>
        <div className="ls-hdr-right">
          {!isSignedIn ? (
            <>
              <button className="ls-signin-btn" onClick={()=>{setAuthMode("login");setShowAuth(true);}}>Sign in</button>
              <button className="ls-pro-btn" onClick={()=>setPro(true)}><Crown size={11} strokeWidth={2}/> Go Pro</button>
            </>
          ) : (
            <>
              {!isPro && <button className="ls-pro-btn" onClick={()=>setPro(true)}><Crown size={11} strokeWidth={2}/> Go Pro</button>}
              <div className="ls-user-avatar" title={`Signed in as ${userEmail}`} onClick={handleSignOut}
                style={userPhoto ? {backgroundImage:`url(${userPhoto})`,backgroundSize:"cover",backgroundPosition:"center",color:"transparent"} : {}}>
                {userPhoto ? "" : userInitial}
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── Shelf toast — appears when a book is auto-added from chat ── */}
      {shelfToast && (
        <div className="ls-shelf-toast">
          ✓ Added "{shelfToast.length > 30 ? shelfToast.slice(0,28)+"…" : shelfToast}" to your shelf
        </div>
      )}

      <div className="ls-main">

        {/* ── DISCOVER ── */}
        {tab==="discover" && (
          <>
          <div className="ls-scroll"
            ref={discoverScrollRef}
            onScroll={e => { discoverScrollPos.current = e.currentTarget.scrollTop; }}
          >

            {/* ── TOP MOMENT — one thing worth saying ── */}
            <TopMoment
              intelligence={intelligence}
              signalCandidates={rankedSignals ? [...(rankedSignals.high||[]), ...(rankedSignals.normal||[]), ...(rankedSignals.low||[])] : []}
              recCandidates={wheelBooks.slice(0,6).map(book => ({ book, reasonType: savedBooks.some(sb=>sb.id===book.id)?'affinity_match':'voice_profile' }))}
              behavioral={null}
              recentMsgs={msgs.slice(-6)}
              context={{ mood, currentBook, intent: currentBook?'mid_book':'next_book', readingState: currentBook?'reading':readBooks.length>0?'finished':'new', hasUnresolvedThread: msgs.length>0 && tab!=='ask', signalLearning: {} }}
              lastSurfaced={lastSurfaced}
              recentlyFailedGenres={Object.entries(reactions).filter(([,r])=>r.reaction==='abandoned'||r.reaction==='too slow').flatMap(([bookId])=>{const b=[...BOOKS,...savedBooks].find(x=>String(x.id)===bookId);return b?.tags||[];})}
              handlers={{ recordSignalEngagement, trackOutcome, setDismissedSignals }}
              rerunKey={rerunKey}
              onOpenChat={(moment) => {
                // Brief Step 7: switch to Ask, preload prompt into input
                setLastSurfaced(prev => [...prev.slice(-20), { kind: moment.kind, type: moment.type, ts: Date.now() }]);
                bumpRerunKey();
                setTab("ask");
                setChatIn(moment.prompt || moment.msg || "");
              }}
            />

            {/* ── Recommendation Wheel + Scene Background ── */}
            {wheelBooks.length > 0 && (
              <div style={{ position:"relative", isolation:"isolate" }}>
                {/* Scene — absolutely positioned, stretches to match wheel height */}
                <div style={{
                  position:"absolute",
                  top:0, left:0, right:0, bottom:0,
                  zIndex:0, pointerEvents:"none",
                  overflow:"hidden",
                }}>
                  <BookSceneBackground bookId={activeWheelBook?.id ?? wheelBooks[0]?.id} />
                </div>
                {/* Wheel — renders at natural height, scene stretches behind it */}
                <div style={{ position:"relative", zIndex:1 }}>
                  <RecommendationWheel
                    books={wheelBooks}
                    savedBooks={savedBooks}
                    onSave={handleSaveBook}
                    onDismiss={handleDismissBook}
                    onAsk={goAsk}
                    onTap={setTappedBook}
                    onReact={handleReaction}
                    userState={adaptedUserState}
                    onActiveBook={setActiveWheelBook}
                  />
                </div>
              </div>
            )}

            {/* Cinematic Hero */}
            <div className="ls-hero">
              <div className="ls-hero-eyebrow">Taste-matched. Explained. Personal.</div>
              <div className="ls-hero-title">Stop abandoning books.<br/><em>Start finishing them.</em></div>
              <div className="ls-hero-body">LitSense learns exactly how you read — pace, tone, emotional weight — and recommends with a real explanation of why each book is right for you. Not an algorithm. A considered opinion.</div>
              <button className="ls-hero-cta" onClick={()=>goAsk("Based on my reading history and taste, what's the single best book I should read next? Tell me exactly why it's right for me — be specific about tone, pacing, and what I'll get from it.")}>
                Find my next book <ChevronRight size={16} strokeWidth={2.5}/>
              </button>
              <div className="ls-hero-links">
                <button className="ls-hero-link" onClick={()=>goAsk("Recommend something I'd never pick for myself but would genuinely love. Be specific about why it fits my taste even though it's unexpected.")}>Surprise me</button>
                <button className="ls-hero-link" onClick={()=>goAsk("I've been in a reading slump. What's the one book that will pull me back in? Tell me honestly why it will work.")}>End a slump</button>
                <button className="ls-hero-link" onClick={()=>goAsk("What's a book I should read this week — something genuinely underrated that most people overlook?")}>Hidden gems</button>
              </div>

              {/* Proof card — shows the intelligence, not just the claim */}
              <div className="ls-proof">
                
                <div className="ls-proof-card">
                  <div className="ls-proof-cover" style={{position:"relative"}}>
                    <BookCover isbn="9780802162175" title="The Covenant of Water" author="Abraham Verghese" color={["#1a2430","#0e1820"]}/>
                  </div>
                  <div className="ls-proof-body">
                    <div className="ls-proof-title">The Covenant of Water</div>
                    <div className="ls-proof-author">Abraham Verghese · 96% match</div>
                    <div className="ls-proof-reason">
                      <div className="ls-proof-why-label">Why this could be your next favorite</div>
                      <span>Few novels manage to be this precise and this moving at the same time. Three generations across seventy years in South India — the kind of patient, sweeping storytelling that rewards attention and stays with you long after. If the books you love most are the ones that feel genuinely important once you finish them, this is a very strong fit.</span>
                    </div>
                    <SafeAmazonLink title="The Covenant of Water" author="Abraham Verghese" isbn="9780802162175"
                      style={{display:"inline-flex",alignItems:"center",gap:5,marginTop:10,padding:"5px 12px",borderRadius:99,textDecoration:"none",background:"rgba(212,148,26,.15)",border:"1px solid rgba(212,148,26,.25)",color:"var(--gold)",fontSize:11,fontWeight:600}}>Buy on Amazon →</SafeAmazonLink>
                  </div>
                </div>
              </div>
            </div>

            {/* Taste profile card — shown after 3+ ratings */}
            {readBooks.length >= 3 && (
              <TasteCard
                readBooks={readBooks}
                onAddBooks={()=>setTab("shelf")}
                isPro={isPro}
                onUpgrade={()=>setPro(true)}
              />
            )}

            {/* Quick-rate onboarding — shown until dismissed or 3 books rated */}
            {readBooks.length < 3 && !quickRateDone && (
              <QuickRateCard
                onRate={(rated)=>{
                  rated.forEach(b => setReadBooks(prev=>[...prev,{id:Date.now()+Math.random(),title:b.title,author:b.author,rating:b.rating}]));
                  localStorage.setItem("ls_qr_done","1");
                  setQuickRateDone(true);
                }}
                onSkip={()=>{ localStorage.setItem("ls_qr_done","1"); setQuickRateDone(true); }}
              />
            )}

            {/* Mood */}
            <div className="ls-sec-hdr" style={{padding:"0 16px",marginBottom:12}}>
              <span className="ls-sec-title">Set your mood</span>
              
            </div>
            <div className="ls-mood-row">
              {MOODS.map(({id,name,Icon})=>(
                <div key={id} className={`ls-mood-chip${mood===id?" on":""}`} onClick={()=>setMood(mood===id?null:id)}>
                  <Icon size={15} strokeWidth={1.75}/>{name}
                </div>
              ))}
            </div>
            {mood && (
              <div className="ls-mood-banner">
                <span className="ls-mood-banner-text">Showing a <em>{mood}</em> row — your picks are filtered below</span>
                <button className="ls-mood-banner-clear" onClick={()=>setMood(null)}>Clear</button>
              </div>
            )}

            {/* Genre */}
            <div className="ls-sec-hdr" style={{padding:"0 16px",marginBottom:12}}>
              <span className="ls-sec-title">Browse by genre</span>
            </div>
            <div className="ls-genre-row">
              {GENRES.map(g=>(
                <button key={g} className={`ls-genre-pill${genre===g?" on":""}`} onClick={()=>setGenre(genre===g?null:g)}>{g}</button>
              ))}
            </div>
            {(mood||genre) && (
              <button className="ls-filter-cta" onClick={()=>goAsk(`Based on my reading history${mood?`, I'm in the mood to ${mood}`:""}${genre?`, I prefer ${genre}`:""}. Give me three specific recommendations with honest reasons why each is right for me.`)}>
                Get my picks <ChevronRight size={16} strokeWidth={2.5}/>
              </button>
            )}

            {/* Curated multi-row discovery */}
            {discoverRows.length === 0 ? (
              <div className="ls-empty" style={{padding:"32px 16px"}}>
                <div className="ls-empty-icon"><BookOpen size={36} strokeWidth={1}/></div>
                <div className="ls-empty-title">All caught up</div>
                <div className="ls-empty-body">You've dismissed all current picks. Reset your filters to see more.</div>
              </div>
            ) : (
              discoverRows.map((row, i) => (
                <div key={row.id}>
                  <BookRow
                    books={row.books}
                    title={row.title}
                    subtitle={row.subtitle}
                    onAsk={goAsk}
                    onTap={setTappedBook}
                    savedBooks={savedBooks}
                    onSave={handleSaveBook}
                    onDismiss={handleDismissBook}
                    userState={adaptedUserState}
                    onShowDetail={setDetailBook}
                  />
                  {row.prompts && row.prompts.length > 0 && (
                    <div style={{padding:"4px 16px 20px",display:"flex",gap:8,flexWrap:"wrap"}}>
                      {row.prompts.map((p, pi) => (
                        <button key={pi} onClick={()=>goAsk(p.prompt)}
                          style={{padding:"8px 15px",borderRadius:"var(--r-pill)",border:"1px solid rgba(255,248,236,.12)",background:"rgba(255,248,236,.05)",color:"var(--text2)",fontSize:12.5,fontWeight:500,cursor:"pointer",backdropFilter:"blur(8px)"}}
                          onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--gold)";e.currentTarget.style.color="var(--gold)";e.currentTarget.style.background="var(--gold-l)";}}
                          onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,248,236,.12)";e.currentTarget.style.color="var(--text2)";e.currentTarget.style.background="rgba(255,248,236,.05)";}}
                        >{p.label} →</button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}

            <div style={{height:8}}/>
            <div className="ls-callout info">
              <Lightbulb size={14} strokeWidth={2} className="ls-callout-icon"/>
              <span>
                {readBooks.length>=3
                  ? "The more you rate, the more personal your picks become."
                  : <span>Rate books above to unlock recommendations tailored to your taste.</span>}
              </span>
            </div>
            <div style={{height:8}}/>

          </div>

          {/* ── Floating quick-chat — always accessible on Discover ── */}
          <div className="ls-quick-chat">
            <input
              className="ls-quick-input"
              placeholder={currentBook ? `How far into ${currentBook.split(" ").slice(0,3).join(" ")} are you?` : "What are you in the mood for?"}
              onKeyDown={e=>{
                if(e.key==="Enter"&&e.target.value.trim()){
                  const val=e.target.value.trim();
                  e.target.value="";
                  goAsk(val);
                }
              }}
            />
            <MicButton onTranscript={(t)=>goAsk(t)}/>
          </div>
          </>
        )}

        {/* ── PROFILE ── */}
        {tab==="profile" && (
          <div className="ls-profile-scroll">
            {!isSignedIn ? (
              <div className="ls-shelf-gate">
                <div className="ls-shelf-gate-icon"><Lock size={44} strokeWidth={1}/></div>
                <div className="ls-shelf-gate-title">Your reading profile</div>
                <div className="ls-shelf-gate-body">Sign in to build your reading identity. The more you tell LitSense, the richer your profile gets.</div>
                <button className="ls-action-btn" style={{marginTop:16,maxWidth:260}} onClick={()=>{setAuthMode("signup");setShowAuth(true);}}>Create your free account</button>
              </div>
            ) : (
              <>
                {/* ── Hero — avatar, name, archetype ── */}
                <div className="ls-profile-hero">
                  <label style={{cursor:"pointer",marginBottom:14}}>
                    <div className="ls-profile-avatar"
                      style={userPhoto?{backgroundImage:`url(${userPhoto})`,backgroundSize:"cover",backgroundPosition:"center",color:"transparent"}:{}}>
                      {!userPhoto && (userInitial || "?")}
                      <div style={{position:"absolute",bottom:0,right:0,width:22,height:22,borderRadius:"50%",background:"var(--gold)",display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid var(--bg)"}}>
                        <Plus size={12} strokeWidth={2.5} style={{color:"#060402"}}/>
                      </div>
                    </div>
                    <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{
                      const file = e.target.files[0]; if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => { setUserPhoto(ev.target.result); try { localStorage.setItem("ls_photo",ev.target.result); } catch {} };
                      reader.readAsDataURL(file);
                    }}/>
                  </label>

                  {/* Display name */}
                  <input className="ls-profile-name" style={{background:"transparent",border:"none",outline:"none",textAlign:"center",fontFamily:"'Lora',serif",fontSize:22,fontWeight:700,color:"var(--text)",width:"100%",marginBottom:4}}
                    placeholder={userEmail?.split("@")[0]?.replace(/[._]/g," ")?.replace(/\b\w/g,c=>c.toUpperCase()) || "Your name"}
                    value={userName}
                    onChange={e=>{setUserName(e.target.value);try{localStorage.setItem("ls_username",e.target.value);}catch{}}}
                  />
                  <div className="ls-profile-email">{userEmail}</div>

                  {/* Reading archetype badge */}
                  {archetype?.label && (
                    <div className="ls-profile-archetype">
                      <Sparkles size={10}/> {archetype.label}
                    </div>
                  )}

                  {/* Bio */}
                  <textarea className="ls-profile-bio" rows={2}
                    placeholder="What kind of reader are you? (fills in as you talk to LitSense)"
                    value={(() => { try { return localStorage.getItem("ls_bio")||""; } catch { return ""; } })()}
                    onChange={e=>{try{localStorage.setItem("ls_bio",e.target.value);}catch{}}}
                    style={{width:"100%"}}
                  />
                </div>

                {/* ── Stats ── */}
                <div className="ls-profile-stats">
                  {[
                    [readBooks.length, "Read"],
                    [savedBooks.length, "Saved"],
                    [Object.values(reactions).filter(r=>r.reaction==="loved"||r.reaction==="finished").length, "Loved"],
                  ].map(([n,l])=>(
                    <div key={l} className="ls-profile-stat">
                      <div className="ls-profile-stat-n">{n}</div>
                      <div className="ls-profile-stat-l">{l}</div>
                    </div>
                  ))}
                </div>

                {/* ── Currently reading ── */}
                {currentBook && (
                  <div className="ls-profile-section">
                    <div className="ls-profile-section-title">Currently reading</div>
                    <div style={{padding:"12px 14px",background:"rgba(212,148,26,.08)",border:"1px solid rgba(212,148,26,.2)",borderRadius:"var(--r-lg)",display:"flex",alignItems:"center",gap:12}}>
                      <BookOpen size={18} style={{color:"var(--gold)",flexShrink:0}}/>
                      <div style={{fontSize:14,fontWeight:600,color:"var(--text)"}}>{currentBook}</div>
                    </div>
                  </div>
                )}

                {/* ── Books read ── */}
                {readBooks.length > 0 && (
                  <div className="ls-profile-section">
                    <div className="ls-profile-section-title">Books read</div>
                    <div className="ls-profile-book-row">
                      {readBooks.map(b=>(
                        <div key={b.id} className="ls-profile-book-thumb">
                          <div className="ls-profile-book-cover">
                            <BookCover isbn={b.isbn} title={b.title} author={b.author||""} color={b.color||["#1a1408","#0e0c06"]} className="fill"/>
                          </div>
                          <div className="ls-profile-book-label">{b.title}</div>
                          {/* Star rating */}
                          <div style={{display:"flex",justifyContent:"center",gap:1,marginTop:3}}>
                            {[1,2,3,4,5].map(s=>(
                              <Star key={s} size={8} strokeWidth={0} fill={s<=(b.rating||3)?"var(--gold)":"rgba(255,255,255,.15)"}/>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Want to read ── */}
                {savedBooks.length > 0 && (
                  <div className="ls-profile-section">
                    <div className="ls-profile-section-title">Want to read</div>
                    <div className="ls-profile-book-row">
                      {savedBooks.map(b=>(
                        <div key={b.id} className="ls-profile-book-thumb">
                          <div className="ls-profile-book-cover">
                            <BookCover isbn={b.isbn} title={b.title} author={b.author||""} color={b.color||["#1a1408","#0e0c06"]} className="fill"/>
                          </div>
                          <div className="ls-profile-book-label">{b.title}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Reactions ── */}
                {Object.keys(reactions).length > 0 && (
                  <div className="ls-profile-section">
                    <div className="ls-profile-section-title">What you thought</div>
                    {Object.entries(reactions)
                      .sort((a,b)=>b[1].ts-a[1].ts)
                      .slice(0,6)
                      .map(([bookId,{reaction,note}])=>{
                        const book = [...readBooks,...savedBooks].find(b=>String(b.id)===String(bookId));
                        if (!book) return null;
                        const emoji = {loved:"❤️",finished:"✓",abandoned:"◌","too slow":"⏸",fast:"⚡"}[reaction]||"·";
                        const label = {loved:"Loved it",finished:"Finished",abandoned:"Stopped reading","too slow":"Too slow",fast:"Couldn't put it down"}[reaction]||reaction;
                        return (
                          <div key={bookId} className="ls-profile-reaction">
                            <div style={{fontSize:18,flexShrink:0}}>{emoji}</div>
                            <div className="ls-profile-reaction-info">
                              <div className="ls-profile-reaction-title">{book.title}</div>
                              <div className="ls-profile-reaction-label">{label}{note?` — "${note}"`:""}</div>
                            </div>
                          </div>
                        );
                    })}
                  </div>
                )}

                {/* ── Favorite genres ── */}
                {readBooks.length >= 2 && (
                  <div className="ls-profile-section">
                    <div className="ls-profile-section-title">Favorite genres</div>
                    <div style={{flexWrap:"wrap",display:"flex"}}>
                      {[...new Set(readBooks.flatMap(b=>b.tags||[b.primary]).filter(Boolean))].slice(0,8).map(g=>(
                        <span key={g} className="ls-profile-genre">{g}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Empty state ── */}
                {readBooks.length===0 && !currentBook && Object.keys(reactions).length===0 && (
                  <div className="ls-profile-empty">
                    <div style={{fontSize:32,marginBottom:12}}>📚</div>
                    <div style={{fontFamily:"'Lora',serif",fontSize:16,fontWeight:700,color:"var(--text2)",marginBottom:8}}>Your profile builds itself</div>
                    Tell LitSense what you've read, what you loved, what you abandoned.<br/>It fills in as you go.
                  </div>
                )}

                {/* ── Sign out ── */}
                <div style={{padding:"28px 20px 0",textAlign:"center"}}>
                  <button onClick={handleSignOut} style={{background:"none",border:"none",color:"var(--muted)",fontSize:13,cursor:"pointer",textDecoration:"underline"}}>
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── MARKETPLACE ── */}
        {tab==="market" && (
          <MarketplaceTab
            isPro={isPro}
            savedBooks={savedBooks}
            wantList={wantList}
            onRequirePro={()=>setPro(true)}
            userEmail={userEmail}
          />
        )}

        {/* ── MY SHELF ── */}
        {tab==="shelf" && (
          <div className="ls-shelf-scroll">
            <div className="ls-shelf-hdr">
              <div className="ls-shelf-hdr-title">My Shelf</div>
              <div className="ls-shelf-hdr-sub">Your reading history powers your recommendations</div>
            </div>

            {isSignedIn && (
              <div style={{margin:"0 16px 20px",padding:"16px",background:"rgba(255,255,255,.045)",border:"1px solid rgba(255,255,255,.08)",borderRadius:"var(--r-lg)",display:"flex",alignItems:"center",gap:14}}>
                {/* Avatar / photo upload */}
                <label style={{cursor:"pointer",flexShrink:0}}>
                  <div style={{
                    width:52,height:52,borderRadius:"50%",
                    background:userPhoto?"transparent":"rgba(212,148,26,.2)",
                    border:"2px solid rgba(212,148,26,.4)",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    overflow:"hidden",
                    backgroundImage:userPhoto?`url(${userPhoto})`:"none",
                    backgroundSize:"cover",backgroundPosition:"center",
                    fontSize:20,fontWeight:700,color:"var(--gold)",
                  }}>
                    {!userPhoto && userInitial}
                  </div>
                  <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = ev => {
                      const dataUrl = ev.target.result;
                      setUserPhoto(dataUrl);
                      try { localStorage.setItem("ls_photo", dataUrl); } catch {}
                    };
                    reader.readAsDataURL(file);
                  }}/>
                </label>
                {/* Username */}
                <div style={{flex:1}}>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:".5px",textTransform:"uppercase",color:"var(--muted)",marginBottom:6}}>Display name</div>
                  <input
                    style={{width:"100%",background:"transparent",border:"none",borderBottom:"1px solid rgba(255,255,255,.12)",color:"var(--text)",fontSize:15,fontWeight:600,padding:"2px 0",outline:"none",fontFamily:"'Inter',sans-serif",boxSizing:"border-box"}}
                    placeholder={userEmail?.split("@")[0] || "Your name"}
                    value={userName}
                    onChange={e=>{
                      setUserName(e.target.value);
                      try { localStorage.setItem("ls_username", e.target.value); } catch {}
                    }}
                  />
                  <div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>{userEmail}</div>
                </div>
              </div>
            )}

            {!isSignedIn ? (
              <div className="ls-shelf-gate">
                <div className="ls-shelf-gate-icon"><Lock size={44} strokeWidth={1}/></div>
                <div className="ls-shelf-gate-title">Your shelf lives here</div>
                <div className="ls-shelf-gate-body">Create a free account to save books, rate them, and get recommendations that actually know your taste.</div>
                <button className="ls-action-btn" style={{marginTop:16,maxWidth:260}} onClick={()=>{setAuthMode("signup");setShowAuth(true);}}>
                  Create your free account
                </button>
                <button style={{background:"none",border:"none",color:"var(--muted)",fontSize:13,cursor:"pointer",marginTop:6}} onClick={()=>{setAuthMode("login");setShowAuth(true);}}>
                  Already have an account? Sign in
                </button>
              </div>
            ) : (
              <>
                {/* Referral card — shown to signed-in users */}
                <ReferralCard
                  userEmail={userEmail}
                  referralCount={referralCount}
                />

                <div className="ls-status-tabs">
                  {[["read","Finished"],["reading","Reading"],["want","Want to Read"],["saved","Saved"]].map(([v,l])=>(
                    <button key={v} className={`ls-status-tab${shelfTab===v?" on":""}`} onClick={()=>setShelfTab(v)}>{l}{v==="saved"&&savedBooks.length>0?` (${savedBooks.length})`:""}</button>
                  ))}
                </div>

                {shelfTab==="read" && (
                  <>
                    <VoiceShelfIntake
                      onAdd={(extracted) => {
                        extracted.forEach(b => {
                          setReadBooks(p=>[...p,{id:b.id,title:b.title,author:b.author,rating:b.rating}]);
                          if (b._reaction) addReaction(b.id, b._reaction, b._reason);
                        });
                      }}
                    />
                    <BookshelfScan
                      localBooks={BOOKS}
                      onAdd={(extracted) => {
                        extracted.forEach(b => {
                          setReadBooks(p=>[...p,{id:b.id,title:b.title,author:b.author,isbn:b.isbn||"",color:b.color,rating:b.rating}]);
                          if (b._reaction) addReaction(b.id, b._reaction, b._reason);
                        });
                      }}
                    />
                    <div className="ls-input-card">
                      <div className="ls-input-label">Or search by title</div>
                      <BookSearch
                        mode="rate"
                        placeholder="Title, author, or ISBN..."
                        onSelect={(book) => {
                          setReadBooks(p=>[...p,{
                            id: Date.now(),
                            title: book.title,
                            author: book.author,
                            isbn: book.isbn,
                            rating: book.rating || 3,
                          }]);
                        }}
                      />
                    </div>
                    {!isPro && readBooks.length>=MEM_BOOKS && (
                      <div className="ls-callout info" style={{marginBottom:12}}>
                        <Lightbulb size={14} strokeWidth={2} className="ls-callout-icon"/>
                        <span>Free accounts share your last {MEM_BOOKS} books for better picks.{" "}
                          <button style={{background:"none",border:"none",color:"var(--gold)",fontWeight:600,cursor:"pointer",padding:0,fontSize:12}} onClick={()=>setPro(true)}>Upgrade to Pro</button> for full history.</span>
                      </div>
                    )}
                    {readBooks.length===0 ? (
                      <div className="ls-empty">
                        <div className="ls-empty-icon"><BookOpen size={40} strokeWidth={1}/></div>
                        <div className="ls-empty-title">Your shelf is empty</div>
                        <div className="ls-empty-body">Add books you've read and rate them. Each rating makes your recommendations more accurate.</div>
                      </div>
                    ) : (
                      <>
                        {readBooks.map(b=>(
                          <div key={b.id} className="ls-book-row">
                            <div className="ls-book-row-left">
                              <div className="ls-book-row-title">{b.title}</div>
                              {b.author&&<div className="ls-book-row-author">{b.author}</div>}
                            </div>
                            <div className="ls-book-row-right">
                              <div className="ls-star-row">
                                {[1,2,3,4,5].map(s=>(
                                  <span key={s} className="ls-star" onClick={()=>setRating(b.id,s)}>
                                    <Star size={14} strokeWidth={1.5}
                                      fill={b.rating>=s?"var(--gold)":"none"}
                                      color={b.rating>=s?"var(--gold)":"var(--faint)"}/>
                                  </span>
                                ))}
                              </div>
                              <button className="ls-remove-btn" onClick={()=>removeBook(b.id)}><X size={14}/></button>
                            </div>
                          </div>
                        ))}
                        {readBooks.length>=2 && (
                          <div className="ls-action-wrap">
                            <button className="ls-action-btn" onClick={()=>goAsk("Based on everything I've rated, what does my reading taste say about me — and what should I read next?")}>
                              Analyze my taste & recommend
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {shelfTab==="reading" && (
                  <>
                    <div className="ls-input-card">
                      <div className="ls-input-label">Currently reading</div>
                      <input className="ls-input full" placeholder="What are you reading right now?"
                        value={currentBook} onChange={e=>setCurrentBook(e.target.value)}/>
                    </div>
                    {currentBook ? (
                      <button className="ls-action-btn" onClick={()=>goAsk(`I'm currently reading "${currentBook}". What should I read right after I finish?`)}>
                        What do I read after this?
                      </button>
                    ) : (
                      <div className="ls-empty">
                        <div className="ls-empty-icon"><BookOpen size={40} strokeWidth={1}/></div>
                        <div className="ls-empty-title">Nothing logged yet</div>
                        <div className="ls-empty-body">Enter what you're reading and get a recommendation for what comes next.</div>
                      </div>
                    )}
                  </>
                )}

                {shelfTab==="want" && (
                  <>
                    <div className="ls-input-card">
                      <div className="ls-input-label">Search books to add</div>
                      <BookSearch
                        mode="want"
                        placeholder="Find a book to add to your list..."
                        onSelect={(book) => {
                          setWantList(p=>[...p, book.title + (book.author ? ` — ${book.author}` : "")]);
                        }}
                      />
                    </div>
                    {wantList.length===0 ? (
                      <div className="ls-empty">
                        <div className="ls-empty-icon"><Bookmark size={40} strokeWidth={1}/></div>
                        <div className="ls-empty-title">Your list is clear</div>
                        <div className="ls-empty-body">Add books you want to read. Ask which one to start with.</div>
                      </div>
                    ) : (
                      <>
                        {wantList.map((t,i)=>(
                          <div key={i} className="ls-book-row">
                            <div className="ls-book-row-left"><div className="ls-book-row-title">{t}</div></div>
                            <div className="ls-book-row-actions">
                              <button className="ls-ask-ai-btn" onClick={()=>goAsk(`Should I read "${t}"? Give me a real, honest take based on what I've read before.`)}>Ask AI</button>
                              <SafeAmazonLink
                                title={t.split(" — ")[0]} author={t.split(" — ")[1]||""} isbn=""
                                style={{display:"inline-flex",alignItems:"center",padding:"4px 9px",borderRadius:6,textDecoration:"none",background:"rgba(212,148,26,.1)",border:"1px solid rgba(212,148,26,.2)",color:"var(--gold)",fontSize:10.5,fontWeight:600}}>Buy</SafeAmazonLink>
                              <button className="ls-remove-btn" onClick={()=>setWantList(p=>p.filter((_,j)=>j!==i))}><X size={14}/></button>
                            </div>
                          </div>
                        ))}
                        {wantList.length>=2 && (
                          <div className="ls-action-wrap">
                            <button className="ls-action-btn" onClick={()=>goAsk(`I have these on my list: ${wantList.join(", ")}. Which should I read first and why?`)}>
                              Which should I read first?
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {shelfTab==="saved" && (
                  <>
                    {savedBooks.length===0 ? (
                      <div className="ls-empty">
                        <div className="ls-empty-icon"><Bookmark size={40} strokeWidth={1}/></div>
                        <div className="ls-empty-title">Nothing saved yet</div>
                        <div className="ls-empty-body">Tap <em>Save to Read</em> on any recommendation to queue it here.</div>
                      </div>
                    ) : (
                      <>
                        {savedBooks.map(b=>(
                          <div key={b.id} className="ls-book-row">
                            <div className="ls-book-row-left">
                              <div className="ls-book-row-title">{b.title}</div>
                              {b.author&&<div className="ls-book-row-author">{b.author}</div>}
                            </div>
                            <div className="ls-book-row-actions">
                              <button className="ls-ask-ai-btn" onClick={()=>goAsk(`I saved "${b.title}" by ${b.author}. Should I read it next? Give me your honest take.`)}>Ask AI</button>
                              <SafeAmazonLink
                                title={b.title} author={b.author||""} isbn={b.isbn||""}
                                style={{display:"inline-flex",alignItems:"center",padding:"4px 9px",borderRadius:6,textDecoration:"none",background:"rgba(212,148,26,.1)",border:"1px solid rgba(212,148,26,.2)",color:"var(--gold)",fontSize:10.5,fontWeight:600}}>Buy</SafeAmazonLink>
                              <button className="ls-remove-btn" title="Remove from saved"
                                onClick={()=>setSavedBooks(p=>p.filter(sb=>sb.id!==b.id))}>
                                <X size={14}/>
                              </button>
                            </div>
                          </div>
                        ))}
                        {savedBooks.length>=2 && (
                          <div className="ls-action-wrap">
                            <button className="ls-action-btn" onClick={()=>goAsk(`I've saved these books: ${savedBooks.map(b=>b.title).join(", ")}. Which should I read first, and why?`)}>
                              Which should I read first?
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ── ASK ── */}
        {tab==="ask" && (
          <>
            {atLimit ? (
              <div className="ls-limit-wall">
                <div style={{color:"var(--gold)"}}><BookOpen size={48} strokeWidth={1}/></div>
                <div className="ls-limit-title">{isSignedIn?<>Today's questions <em>used up.</em></>:<>Create an account for <em>more.</em></>}</div>
                <div className="ls-limit-body">
                  {isSignedIn
                    ?`You've used all ${LIMIT_FREE} of today's questions. Upgrade to Pro for unlimited.`
                    :`You've used all ${LIMIT_ANON} free questions. Create an account for ${LIMIT_FREE} per day — or go Pro for unlimited.`}
                </div>
                <button className="ls-limit-cta" onClick={()=>{if(!isSignedIn){setAuthMode("signup");setShowAuth(true);}else setPro(true);}}>
                  {isSignedIn?"Upgrade to Pro — $4.99/mo":"Create a free account"}
                </button>
                {!isSignedIn&&<button className="ls-limit-cta outline" onClick={()=>setPro(true)}>Upgrade to Pro — $4.99/mo</button>}
                <div className="ls-limit-note">Resets every day at midnight.</div>
              </div>
            ) : (
              <div className="ls-ask-msgs">
                {msgs.length===0&&!chatLoad ? (
                  <div className="ls-welcome">
                    <div style={{ width:"100%", textAlign:"left", padding:"24px 20px 0" }}>
                      {currentBook ? (
                        // COMPANION MODE — the primary experience when reading
                        <>
                          <div style={{ fontSize:13, color:"var(--gold)", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>Currently reading</div>
                          <div style={{ fontSize:24, fontFamily:"'Lora',serif", fontWeight:700, color:"var(--text)", lineHeight:1.25, marginBottom:10 }}>
                            How's <em style={{color:"var(--gold)"}}>{currentBook.split(":")[0].split(" ").slice(0,5).join(" ")}</em> going?
                          </div>
                          <div style={{ fontSize:15, color:"var(--text2)", lineHeight:1.65, marginBottom:22 }}>
                            Tell me where you are in it. I'll ask the right questions.
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:28 }}>
                            {[
                              { label: "Just started it", prompt: `I just started "${currentBook}". What should I know going in?` },
                              { label: "I'm about halfway through", prompt: `I'm about halfway through "${currentBook}". Ask me what I think of it so far.` },
                              { label: "It's losing me a bit", prompt: `I'm reading "${currentBook}" but it's starting to lose me. Ask me what's happening and help me figure out if I should keep going.` },
                              { label: "I just finished it", prompt: `I just finished "${currentBook}". I want to talk about it.` },
                            ].map((o,i) => (
                              <button key={i} className="ls-prompt-btn" onClick={() => sendChat(o.prompt)}>{o.label}</button>
                            ))}
                          </div>
                        </>
                      ) : readBooks.length >= 2 ? (
                        <>
                          <div style={{ fontSize:22, fontFamily:"'Lora',serif", fontWeight:700, color:"var(--text)", lineHeight:1.25, marginBottom:8 }}>
                            What are you looking for<em style={{color:"var(--gold)"}}>?</em>
                          </div>
                          <div style={{ fontSize:15, color:"var(--text2)", lineHeight:1.65, marginBottom:20 }}>
                            I've got a feel for your taste. Tell me what kind of read you're after right now.
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:28 }}>
                            {ASK_PROMPTS.map((p,i) => (
                              <button key={i} className="ls-prompt-btn" onClick={() => sendChat(p)}>{p}</button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize:22, fontFamily:"'Lora',serif", fontWeight:700, color:"var(--text)", lineHeight:1.25, marginBottom:8 }}>
                            Tell me what you<em style={{color:"var(--gold)"}}> love.</em>
                          </div>
                          <div style={{ fontSize:15, color:"var(--text2)", lineHeight:1.65, marginBottom:20 }}>
                            What's a book you finished and still think about? I'll take it from there.
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:28 }}>
                            {ASK_PROMPTS.map((p,i) => (
                              <button key={i} className="ls-prompt-btn" onClick={() => sendChat(p)}>{p}</button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {msgs.map((m,i)=>(
                      <div key={i} className={`ls-msg ${m.role}`}>
                        <div className={`ls-av ${m.role==="assistant"?"ai":"user"}`}>
                          {m.role==="assistant"?<BookOpen size={14} strokeWidth={2}/>:"ME"}
                        </div>
                        <div className={`ls-bubble ${m.isError?"error":m.role==="assistant"?"ai":"user"}`}>
                          {m.isError?(
                            <><span>{m.content}</span><button className="ls-retry-btn" onClick={()=>sendChat(m.retryMsg,true)}><RotateCcw size={12} strokeWidth={2}/> Try again</button></>
                          ):m.role==="assistant"?(
                            <>{renderAI(m.content)}{m.streaming && <span className="ls-cursor"/>}</>
                          ):m.content}
                        </div>
                      </div>
                    ))}
                    {chatLoad&&(
                      <div className="ls-msg">
                        <div className="ls-av ai"><BookOpen size={14} strokeWidth={2}/></div>
                        <div className="ls-bubble ai"><div className="ls-dots"><div className="ls-dot"/><div className="ls-dot"/><div className="ls-dot"/></div></div>
                      </div>
                    )}
                  </>
                )}
                <div ref={endRef}/>
              </div>
            )}

            {!atLimit && (
              <div className={`ls-counter${questionsLeft!==null&&questionsLeft<=1?" warn":""}`}>
                <span>
                  {isPro?"Unlimited · Pro":questionsLeft===null?"":questionsLeft===0?"No questions remaining today":`${questionsLeft} question${questionsLeft===1?"":"s"} remaining today`}
                </span>
                {!isPro&&(
                  <button className="ls-counter-upgrade" onClick={()=>{if(!isSignedIn){setAuthMode("signup");setShowAuth(true);}else setPro(true);}}>
                    {isSignedIn?"Go Pro for unlimited →":`Sign up for ${LIMIT_FREE}/day →`}
                  </button>
                )}
              </div>
            )}
            {!atLimit&&(
              <>
                {linkCard && (
                  <LinkCard
                    card={linkCard}
                    onDismiss={() => { setLinkCard(null); setChatIn(""); }}
                    onReact={(reactionKey) => {
                      if (!reactionKey) {
                        // "I read it" — advance to reaction picking
                        setLinkCard(prev => ({ ...prev, phase: "reacting" }));
                      } else {
                        // Reaction chosen — add book and dismiss
                        const book = linkCard.book;
                        if (book?.title) {
                          const id = Date.now();
                          const ratingMap = { loved:5, liked:4, didnt_like:2, didnt_finish:2 };
                          const reactionMap = { loved:"loved", liked:null, didnt_like:"abandoned", didnt_finish:"abandoned" };
                          setReadBooks(p => [...p, { id, title:book.title, author:book.author||"", rating:ratingMap[reactionKey]||3 }]);
                          if (reactionMap[reactionKey]) addReaction(id, reactionMap[reactionKey], "");
                        }
                        setLinkCard(null); setChatIn("");
                      }
                    }}
                    onConsider={() => {
                      const book = linkCard.book;
                      setLinkCard(null); setChatIn("");
                      if (book?.title) {
                        goAsk(`Tell me about "${book.title}"${book.author ? ` by ${book.author}` : ""} — worth reading for someone with my taste?`);
                      }
                    }}
                  />
                )}
              </>
            )}
            {!atLimit&&(
              <div className="ls-input-row-chat">
                <textarea className="ls-chat-input" rows={1}
                  placeholder="What are you looking for..."
                  value={chatIn} onChange={handleChatChange}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat(chatIn);}}}/>
                <MicButton onTranscript={(t)=>{ setChatIn(t); setTimeout(()=>sendChat(t),100); }}/>
                <button className="ls-send-btn" onClick={()=>sendChat(chatIn)} disabled={chatLoad||!chatIn.trim()}>
                  <Send size={16} strokeWidth={2}/>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* BOTTOM NAV */}
      <nav className="ls-nav">
        {[
          ["discover",<Search size={21} strokeWidth={1.75}/>,"Discover"],
          ["shelf",<Library size={21} strokeWidth={1.75}/>,"My Shelf"],
          ["profile",<BookMarked size={21} strokeWidth={1.75}/>,"Profile"],
          ["ask",<MessageCircle size={21} strokeWidth={1.75}/>,"Ask"],
        ].map(([v,icon,label])=>(
          <button key={v} className={`ls-nav-btn${tab===v?" on":""}`} onClick={()=>setTab(v)}>
            {icon}<span className="ls-nav-label">{label}</span>
          </button>
        ))}
      </nav>

      {/* BOOK DETAIL SHEET */}
      {detailBook && (
        <BookDetailSheet
          book={detailBook}
          onClose={() => setDetailBook(null)}
          onAsk={(p) => { setDetailBook(null); goAsk(p); }}
          isSaved={isBookSaved(detailBook?.id)}
          onSave={handleSaveBook}
          onDismiss={(id) => { handleDismissBook(id); setDetailBook(null); }}
          onMore={(b) => setTappedBook(b)}
          userState={adaptedUserState}
        />
      )}
        <TileModal
          book={tappedBook}
          onClose={() => setTappedBook(null)}
          onAsk={(p) => { setTappedBook(null); goAsk(p); }}
          isSaved={isBookSaved(tappedBook?.id)}
          onSave={handleSaveBook}
          onDismiss={(id) => { handleDismissBook(id); setTappedBook(null); }}
          userState={adaptedUserState}
          onDiscuss={(b) => { setTappedBook(null); setDiscBook(b); }}
        />
      )}

      {/* DISCUSSION THREAD */}
      {discBook && (
        <DiscussionThread
          book={discBook}
          userEmail={userEmail}
          userId={userId}
          onClose={() => setDiscBook(null)}
        />
      )}

      {/* PRO MODAL */}
      {showPro&&(
        <div className="ls-overlay" onClick={()=>{setPro(false);setProStep("pitch");setProError("");}}>
          <div className="ls-modal" onClick={e=>e.stopPropagation()}>
            <div className="ls-modal-handle"/>

            {proStep==="pitch" && (
              <>
                <div className="ls-modal-eyebrow">LitSense Pro</div>
                <div className="ls-modal-title">Read <em>smarter.</em><br/>Every month.</div>
                <div className="ls-modal-sub">For readers who take books seriously. Cancel anytime.</div>
                <div className="ls-pro-features">
                  {PRO_FEATURES.map(({Icon,title,desc},i)=>(
                    <div key={i} className="ls-pro-feature">
                      <div className="ls-pro-feat-icon"><Icon size={15} strokeWidth={1.75}/></div>
                      <div className="ls-pro-feat-text">
                        <div className="ls-pro-feat-title">{title}</div>
                        <div className="ls-pro-feat-desc">{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="ls-modal-price-row">
                  <div className="ls-modal-price">$4.99</div>
                  <div className="ls-modal-price-period">/ month</div>
                  <div className="ls-modal-price-note">· or $39.99/year — save 33%</div>
                </div>
                <button className="ls-modal-cta" onClick={()=>{
                  if (!isSignedIn) { setPro(false); setShowAuth(true); setAuthMode("signup"); return; }
                  setProStep("card");
                }}>
                  {isSignedIn ? "Start your free 7-day trial →" : "Create an account to get started"}
                </button>
                <button className="ls-modal-cancel" onClick={()=>{setPro(false);setProStep("pitch");}}>Maybe another time</button>
              </>
            )}

            {proStep==="card" && (
              <>
                <div className="ls-modal-eyebrow">LitSense Pro — $4.99/month</div>
                <div className="ls-modal-title" style={{fontSize:22,marginBottom:20}}>Payment details</div>

                {proError && <div className="ls-stripe-error">{proError}</div>}

                <div className="ls-stripe-field">
                  <div className="ls-stripe-label">Name on card</div>
                  <input className="ls-stripe-input" placeholder="Jane Smith"
                    name="ccname" autoComplete="cc-name"
                    value={proCard.name} onChange={e=>setProCard(p=>({...p,name:e.target.value}))}/>
                </div>
                <div className="ls-stripe-field">
                  <div className="ls-stripe-label">Card number</div>
                  <input className="ls-stripe-input" placeholder="1234 5678 9012 3456"
                    name="cardnumber" autoComplete="cc-number" inputMode="numeric"
                    maxLength={19}
                    value={proCard.number}
                    onChange={e=>{
                      const v = e.target.value.replace(/\D/g,"").slice(0,16);
                      setProCard(p=>({...p,number:v.replace(/(.{4})/g,"$1 ").trim()}));
                    }}/>
                </div>
                <div style={{display:"flex",gap:12}}>
                  <div className="ls-stripe-field" style={{flex:1}}>
                    <div className="ls-stripe-label">Expiry</div>
                    <input className="ls-stripe-input" placeholder="MM/YY" maxLength={5}
                      name="cc-exp" autoComplete="cc-exp" inputMode="numeric"
                      value={proCard.expiry}
                      onChange={e=>{
                        const v = e.target.value.replace(/\D/g,"").slice(0,4);
                        setProCard(p=>({...p,expiry:v.length>2?v.slice(0,2)+"/"+v.slice(2):v}));
                      }}/>
                  </div>
                  <div className="ls-stripe-field" style={{flex:1}}>
                    <div className="ls-stripe-label">CVC</div>
                    <input className="ls-stripe-input" placeholder="123" maxLength={4}
                      name="cvc" autoComplete="cc-csc" inputMode="numeric"
                      value={proCard.cvc}
                      onChange={e=>setProCard(p=>({...p,cvc:e.target.value.replace(/\D/g,"").slice(0,4)}))}/>
                  </div>
                </div>

                <div style={{fontSize:11,color:"var(--muted)",marginBottom:16,lineHeight:1.6}}>
                  Secured by Stripe. Cancel anytime from your account settings. Free 7-day trial — card charged after trial ends.
                </div>

                <button className="ls-modal-cta" disabled={proBusy}
                  onClick={async()=>{
                    if (!proCard.name || !proCard.number || !proCard.expiry || !proCard.cvc) {
                      setProError("Please fill in all card details."); return;
                    }
                    setProBusy(true); setProError("");
                    try {
                      // Load Stripe from CDN if not already loaded
                      if (!window.Stripe) {
                        await new Promise((resolve, reject) => {
                          const script = document.createElement("script");
                          script.src = "https://js.stripe.com/v3/";
                          script.onload = resolve;
                          script.onerror = reject;
                          document.head.appendChild(script);
                        });
                      }
                      const stripe = window.Stripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

                      // Create subscription payment intent via API
                      const res = await fetch("/api/subscribe", {
                        method:"POST",
                        headers:{"Content-Type":"application/json"},
                        body:JSON.stringify({ email: userEmail, plan:"monthly" }),
                      });
                      const { client_secret } = await res.json();

                      // Confirm card payment with Stripe
                      const [month, year] = proCard.expiry.split("/");
                      const { error } = await stripe.confirmCardPayment(client_secret, {
                        payment_method: {
                          card: {
                            number:    proCard.number.replace(/\s/g,""),
                            exp_month: parseInt(month),
                            exp_year:  parseInt("20"+year),
                            cvc:       proCard.cvc,
                          },
                          billing_details: { name: proCard.name, email: userEmail },
                        },
                      });

                      if (error) { setProError(error.message); return; }

                      // Success — grant Pro access
                      localStorage.setItem("ls_pro","1");
                      setIsPro(true);
                      setProStep("done");
                    } catch(err) {
                      setProError(err.message || "Payment failed. Please try again.");
                    } finally {
                      setProBusy(false);
                    }
                  }}
                >
                  {proBusy ? "Processing…" : "Start free trial →"}
                </button>
                <button className="ls-modal-cancel" onClick={()=>{setProStep("pitch");setProError("");}}>← Back</button>
              </>
            )}

            {proStep==="done" && (
              <div style={{textAlign:"center",padding:"20px 0"}}>
                <CheckCircle size={44} style={{color:"var(--gold)",marginBottom:16}}/>
                <div className="ls-modal-title" style={{fontSize:24,marginBottom:8}}>Welcome to Pro</div>
                <div className="ls-modal-sub">Your 7-day free trial has started. Enjoy unlimited everything.</div>
                <button className="ls-modal-cta" style={{marginTop:24}} onClick={()=>{setPro(false);setProStep("pitch");}}>
                  Let's go →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AUTH MODAL */}
      {showAuth&&(
        <div className="ls-auth-overlay" onClick={()=>{
          const hasInput = authEmail.trim() || authPass.trim();
          if (hasInput && !authExitWarn) { setAuthExitWarn(true); return; }
          setShowAuth(false); setAuthError(""); setAuthExitWarn(false);
        }}>
          <div className="ls-auth-modal" onClick={e=>e.stopPropagation()}>
            <div className="ls-auth-handle"/>

            {/* Exit warning — shown only when user taps backdrop with unsaved input */}
            {authExitWarn && (
              <div style={{
                margin:"0 0 16px", padding:"11px 14px",
                background:"rgba(184,64,40,.15)", border:"1px solid rgba(184,64,40,.3)",
                borderRadius:"var(--r-md)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10,
              }}>
                <span style={{ fontSize:12.5, color:"#f0c8b8", lineHeight:1.4 }}>Leave signup? Your progress is not saved.</span>
                <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                  <button onClick={()=>setAuthExitWarn(false)} style={{ padding:"5px 10px", borderRadius:6, border:"none", background:"rgba(255,255,255,.12)", color:"var(--text2)", fontSize:11.5, fontWeight:600, cursor:"pointer" }}>Stay</button>
                  <button onClick={()=>{ setShowAuth(false); setAuthError(""); setAuthExitWarn(false); }} style={{ padding:"5px 10px", borderRadius:6, border:"none", background:"rgba(184,64,40,.4)", color:"#f0c8b8", fontSize:11.5, fontWeight:600, cursor:"pointer" }}>Leave</button>
                </div>
              </div>
            )}

            <div className="ls-auth-eyebrow">LitSense</div>
            <div className="ls-auth-title">
              {authMode==="signup"?<>Your shelf, <em>remembered.</em></>:<>Welcome <em>back.</em></>}
            </div>
            <div className="ls-auth-sub">
              {authMode==="signup"
                ?`Free account gets ${LIMIT_FREE} questions per day and saves your last ${MEM_BOOKS} rated books.`
                :"Sign in to access your shelf and reading history."}
            </div>
            {authError&&<div className="ls-auth-error">{authError}</div>}
            <div className="ls-auth-field">
              <div className="ls-auth-label">Email</div>
              <input className="ls-auth-input" type="email"
                name="email" autoComplete="email"
                placeholder="you@example.com"
                value={authEmail} onChange={e=>{setAuthEmail(e.target.value);setAuthExitWarn(false);}}
                onKeyDown={e=>{if(e.key==="Enter")handleAuth();}}/>
            </div>
            <div className="ls-auth-field">
              <div className="ls-auth-label">Password</div>
              <input className="ls-auth-input" type="password"
                name="password" autoComplete={authMode==="signup"?"new-password":"current-password"}
                placeholder="••••••••"
                value={authPass} onChange={e=>{setAuthPass(e.target.value);setAuthExitWarn(false);}}
                onKeyDown={e=>{if(e.key==="Enter")handleAuth();}}/>
            </div>
            <button className="ls-auth-cta" onClick={handleAuth}>
              {authMode==="signup"?"Create free account":"Sign in"}
            </button>
            <div className="ls-auth-switch">
              {authMode==="signup"
                ?<>Already have an account? <button onClick={()=>{setAuthMode("login");setAuthError("");setAuthExitWarn(false);}}>Sign in</button></>
                :<>Don't have an account? <button onClick={()=>{setAuthMode("signup");setAuthError("");setAuthExitWarn(false);}}>Sign up free</button></>}
            </div>
            <button className="ls-auth-cancel" onClick={()=>{
              const hasInput = authEmail.trim() || authPass.trim();
              if (hasInput && !authExitWarn) { setAuthExitWarn(true); return; }
              setShowAuth(false); setAuthError(""); setAuthExitWarn(false);
            }}>Maybe later</button>
          </div>
        </div>
      )}

      {/* ── WELCOME SCREEN — shown once per day ── */}
      {showWelcome && (
        <div style={{
          position:"fixed", inset:0, zIndex:500,
          display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"space-between",
          background:"#0a0806",
          paddingBottom:"env(safe-area-inset-bottom,0)",
        }}>
          {/* Eyebrow */}
          <div style={{
            paddingTop:32, fontSize:9, fontWeight:700,
            letterSpacing:"4px", textTransform:"uppercase",
            color:"rgba(212,148,26,.55)", textAlign:"center",
          }}>A doorworth opening</div>

          {/* Keyhole image — takes up center */}
          <div style={{flex:1, display:"flex", alignItems:"center", justifyContent:"center", width:"100%"}}>
            <img
              src="/keyhole.svg"
              alt=""
              style={{
                width:"100%", maxWidth:420,
                height:"auto",
                objectFit:"contain",
              }}
            />
          </div>

          {/* Bottom content */}
          <div style={{width:"100%", padding:"0 32px 48px", textAlign:"center"}}>
            <div style={{
              fontFamily:"'Lora',serif", fontSize:28, fontWeight:700,
              color:"#f0e8d8", lineHeight:1.25, marginBottom:12,
              fontStyle:"italic",
            }}>On the other side is your<br/>next great read.</div>

            <div style={{
              height:1, width:40, background:"rgba(212,148,26,.4)",
              margin:"0 auto 18px",
            }}/>

            <div style={{
              fontSize:14, color:"rgba(240,232,216,.65)",
              lineHeight:1.75, marginBottom:32, maxWidth:300, margin:"0 auto 32px",
            }}>
              There are books that stay with you for life — that shift how you see, feel, think. We find yours. Curated to your taste, your mood, this moment in your reading life.
            </div>

            <button
              onClick={dismissWelcome}
              style={{
                width:"100%", maxWidth:320, padding:"16px",
                borderRadius:"var(--r-lg)", border:"1px solid rgba(212,148,26,.5)",
                background:"transparent", color:"var(--text)",
                fontSize:12, fontWeight:700, letterSpacing:"3px",
                textTransform:"uppercase", cursor:"pointer",
                transition:"all .2s",
              }}
            >Open the door</button>

            <div style={{
              marginTop:16, fontSize:12, color:"rgba(240,232,216,.3)",
              fontStyle:"italic",
            }}>No account needed to begin</div>
          </div>
        </div>
      )}



      </div>
    </div>
  );
}
