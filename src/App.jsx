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
  Plus, X, Send, Crown, ChevronRight, RotateCcw,
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
  background:transparent;color:#f0e8d8;
  position:relative;z-index:1;
  overscroll-behavior:none;

  --gold:    #d4941a;
  --gold-r:  #e8a820;
  --gold-l:  rgba(212,148,26,.15);
  --gold-d:  #9a6808;
  --sage:    #4a8060;
  --rust:    #b84028;

  /* Glass system — everything layered over the gradient bg */
  --glass:        rgba(255,255,255,.035);
  --glass-mid:    rgba(255,255,255,.06);
  --glass-lift:   rgba(255,255,255,.10);
  --glass-border: rgba(255,255,255,.09);
  --glass-strong: rgba(20,17,13,.50);

  --bg:      #14110d;
  --bg2:     rgba(255,255,255,.04);
  --bg3:     rgba(22,17,12,.78);
  --card:    var(--glass);
  --card2:   var(--glass-mid);

  --text:    #f5efe5;
  --text2:   #e8e2da;
  --muted:   #c4bdb4;
  --faint:   rgba(255,255,255,.08);

  --r-sm:  8px;
  --r-md:  14px;
  --r-lg:  20px;
  --r-xl:  26px;
  --r-pill:99px;
  --glow:  rgba(212,148,26,.28);
  --spring: cubic-bezier(0.34,1.56,0.64,1);
  --ease:   cubic-bezier(0.25,0.46,0.45,0.94);
}
.ls ::-webkit-scrollbar{display:none;}

/* ── HEADER — glass, floats above bg ── */
.ls-hdr{
  height:58px;min-height:58px;padding:0 20px;
  display:flex;align-items:center;justify-content:space-between;
  background:rgba(18,14,10,.65);
  backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
  border-bottom:1px solid rgba(255,255,255,.07);
  flex-shrink:0;z-index:10;
}
.ls-logo{display:flex;flex-direction:column;gap:2px;}
.ls-logo-img{height:26px;width:auto;display:block;filter:brightness(1.3);}
.ls-logo-name{font-family:'Lora',serif;font-size:22px;font-weight:700;letter-spacing:-.5px;line-height:1;color:var(--text);}
.ls-logo-name em{color:var(--gold);font-style:italic;}
.ls-logo-sub{font-size:8px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:var(--muted);opacity:.8;}
.ls-hdr-right{display:flex;align-items:center;gap:8px;}
.ls-signin-btn{
  padding:7px 15px;border-radius:var(--r-pill);
  border:1px solid rgba(255,255,255,.14);
  background:rgba(255,255,255,.07);color:var(--text2);
  font-size:12px;font-weight:600;cursor:pointer;
  transition:all .22s var(--ease);
  backdrop-filter:blur(8px);
}
.ls-signin-btn:hover{border-color:var(--gold);color:var(--gold);background:var(--gold-l);}
.ls-pro-btn{
  display:flex;align-items:center;gap:5px;
  padding:7px 15px;border-radius:var(--r-pill);
  background:var(--gold);color:#0a0806;border:none;
  font-size:12px;font-weight:700;cursor:pointer;
  transition:all .22s var(--ease);
  box-shadow:0 2px 16px var(--glow);
}
.ls-pro-btn:hover{background:var(--gold-r);transform:translateY(-1px);box-shadow:0 4px 24px rgba(212,148,26,.45);}
.ls-user-avatar{
  width:32px;height:32px;border-radius:50%;
  background:rgba(212,148,26,.12);border:1.5px solid rgba(212,148,26,.35);
  display:flex;align-items:center;justify-content:center;
  font-size:12px;font-weight:700;color:var(--gold);cursor:pointer;
  transition:all .2s;
}
.ls-user-avatar:hover{background:rgba(212,148,26,.2);}
.ls-pro-pip{font-size:9px;font-weight:700;color:#0a0806;background:var(--gold);padding:2px 9px;border-radius:var(--r-pill);letter-spacing:.3px;}

/* ── BOTTOM NAV — glass ── */
.ls-nav{
  display:flex;
  background:rgba(18,14,10,.70);
  backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);
  border-top:1px solid rgba(255,255,255,.07);
  flex-shrink:0;padding-bottom:env(safe-area-inset-bottom,0);
}
.ls-nav-btn{flex:1;padding:11px 4px 9px;border:none;background:transparent;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;color:var(--muted);transition:color .2s var(--ease),transform .2s var(--spring);}
.ls-nav-btn.on{color:var(--gold);}
.ls-nav-btn:active{transform:scale(.88);}
.ls-nav-label{font-family:'Inter',sans-serif;font-size:9.5px;font-weight:500;letter-spacing:.3px;color:inherit;}

/* ── LAYOUT ── */
.ls-main{flex:1;overflow:hidden;display:flex;flex-direction:column;}
.ls-scroll{flex:1;overflow-y:auto;overscroll-behavior:none;-webkit-overflow-scrolling:auto;}

/* ── CINEMATIC HERO ── */
.ls-hero{
  padding:36px 20px 32px;
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
  background:rgba(255,255,255,.055);
  backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
  border-radius:var(--r-lg);
  border:1px solid rgba(255,255,255,.09);
  cursor:pointer;transition:all .25s var(--ease);
  box-shadow:0 4px 24px rgba(0,0,0,.2);
}
.ls-book-card:hover{
  background:rgba(255,255,255,.09);
  border-color:rgba(212,148,26,.25);
  transform:translateY(-2px);
  box-shadow:0 8px 36px rgba(0,0,0,.35),0 0 0 1px rgba(212,148,26,.12);
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
  justify-content:space-between;
  padding:14px 12px 12px;
  overflow:hidden;
}
/* Top rule */
.ls-book-cover-fallback::before{
  content:"";
  position:absolute;top:20px;left:12px;right:12px;
  height:1px;background:rgba(212,148,26,.35);
}
/* Bottom rule */
.ls-book-cover-fallback::after{
  content:"";
  position:absolute;bottom:20px;left:12px;right:12px;
  height:1px;background:rgba(212,148,26,.35);
}
.ls-book-cover-title{
  font-family:'Lora',serif;
  font-size:11px;font-weight:700;
  color:rgba(245,239,229,.92);
  line-height:1.35;
  margin-top:18px;
  text-align:center;
  word-break:break-word;
  hyphens:auto;
  flex:1;
  display:flex;align-items:center;justify-content:center;
}
.ls-book-cover-author{
  font-size:8.5px;
  color:rgba(212,148,26,.7);
  font-style:italic;
  text-align:center;
  margin-bottom:18px;
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
    tags:["Psychology","Non-Fiction"],
    primary:"Psychology",
    score:88,
    why:"For readers who <strong>want to understand their own minds</strong>. Every decision you make looks different after this. One of the most genuinely useful books written in the last 30 years.",
    color:["#141c14","#0c1408"],
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

  // ── Row 4: WEEKEND READS — fast + moderate pacing ──
  const weekendBooks = available.filter(b =>
    ["fast","moderate"].includes(BOOK_AFFINITY[b.id]?.pacing)
  );
  if (weekendBooks.length >= 2) {
    rows.push({
      id: "weekend",
      title: "You tend to finish faster-paced books — start here",
      subtitle: "Propulsive writing that doesn't let you stop",
      books: weekendBooks,
      rowContext: "fast-paced",
    });
  }

  // ── Row 5: SLOW-BURN LITERARY — slow pacing, literary/historical tags ──
  const slowBooks = available.filter(b =>
    BOOK_AFFINITY[b.id]?.pacing === "slow" ||
    b.tags.some(t => ["Literary Fiction","Historical","Family Saga"].includes(t))
  );
  if (slowBooks.length >= 2) {
    rows.push({
      id: "literary",
      title: "Worth the slow build — the payoff is the whole point",
      subtitle: "Patient storytelling at its best",
      books: slowBooks,
      rowContext: "slow-burn literary",
    });
  }

  // ── Row 6: MIND-EXPANDING — non-fiction and psychology ──
  const nonficBooks = available.filter(b =>
    b.tags.some(t => ["Non-Fiction","Psychology","Self-Help","Business","Philosophy","Biography"].includes(t))
  );
  if (nonficBooks.length >= 1) {
    rows.push({
      id: "nonfic",
      title: "You'll close these knowing something you didn't before",
      subtitle: "Non-fiction that earns the time you give it",
      books: nonficBooks,
      rowContext: "mind-expanding non-fiction",
    });
  }

  // ── Row 7: DEFAULT — always shown, smart title ──
  const smartTitle = smartRowTitle(readBooks);
  rows.push({
    id: "all",
    title: smartTitle || (readBooks.length >= 1 ? "More picks shaped around your taste" : "Where to start"),
    subtitle: readBooks.length >= 1
      ? "Getting more accurate the more you rate"
      : "Eight editors. One list. No filler.",
    books: available,
    rowContext: null,
  });

  // Deduplicate consecutive identical row sets (keep all — overlap is intentional context)
  // Cap at 5 rows max for a clean layout
  return rows.filter(r => r.books.length >= 1).slice(0, 5);
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
const AI_SYSTEM = `You are LitSense — a smart, well-read friend who reads alongside the user. You are not primarily a recommendation engine. You are a reading companion first. You remember what they're reading, how far they got, what they liked and didn't like, and you check in naturally.

Your primary role — reading companion:
- When someone is mid-book, ask about THAT book first. "How far did you get?" "Did it pick up?" "What happened at the end — did it stick the landing?"
- Show genuine curiosity about their experience, not just their next pick.
- Notice when something they said earlier matters now. "You said it felt slow — did that change?"
- If they abandoned something, be curious not clinical. "What lost you?" "Too slow, or something else?"
- Follow up on things they've mentioned. If they said they liked the ending, ask what specifically worked.

Your secondary role — recommender:
- Only recommend when they ask, or when the conversation naturally opens it up.
- Never pivot straight to a recommendation when they're talking about a book they're reading.
- When you do recommend, make it specific to what you just learned from the conversation.

Your voice:
- Warm but not gushing. Direct but never cold.
- Sound like a text from a friend who reads a lot — not a product, not a chatbot.
- "How far did you get?" not "What was your progress with that title?"
- "Did it pick up or stay slow?" not "Did your engagement improve?"
- "You'd probably like this more" not "Based on your profile..."
- If you mention where you saw something, only say it if you actually know. "I saw it mentioned recently" is fine. Don't fabricate specifics.

Format:
- Use **bold** for book titles and author names.
- Keep it under 150 words. Shorter is usually better.
- Prose, not bullet lists. Friends don't bullet-point you.
- Never start with "Great question!" or "Certainly!" — just answer or ask.
- Ask one follow-up question at a time, not three.`;

const today = () => new Date().toISOString().slice(0,10);

// ── BOOK MENTION DETECTION ────────────────────────────────────────────────────
// Scans user messages for phrases like "I've read X", "I finished X", "I read X"
// Returns { title, author } if a book is detected, null otherwise.
// Author is extracted if "by Author" follows the title.
function detectBookMention(text) {
  if (!text) return null;

  // Patterns that indicate the user has read a book
  const patterns = [
    /i(?:'ve| have) (?:read|finished|completed)\s+[""]?([^""",\.!?]+?)[""]?(?:\s+by\s+([^,\.!?\n]+))?(?:[,\.!?\n]|$)/i,
    /i (?:just |recently )?finished\s+[""]?([^""",\.!?]+?)[""]?(?:\s+by\s+([^,\.!?\n]+))?(?:[,\.!?\n]|$)/i,
    /i (?:just )?read\s+[""]?([^""",,\.!?]+?)[""]?(?:\s+by\s+([^,\.!?\n]+))?(?:[,\.!?\n]|$)/i,
    /(?:read|finished)\s+[""]([^"""]+)[""](?:\s+by\s+([^,\.!?\n]+))?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const title = match[1]?.trim();
      const author = match[2]?.trim() || "";
      // Filter out false positives — too short or common words
      if (title && title.length > 2 && !["it","that","this","the book","a book"].includes(title.toLowerCase())) {
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
  // The Covenant of Water — Kerala backwaters, a boat at dusk
  1: ({ opacity }) => (
    <svg viewBox="0 0 390 320" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",opacity}}>
      <defs>
        <radialGradient id="s1sky" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#3d2a12" stopOpacity="0.9"/>
          <stop offset="100%" stopColor="#0d0a06" stopOpacity="1"/>
        </radialGradient>
        <radialGradient id="s1moon" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#d4941a" stopOpacity="0.6"/>
          <stop offset="100%" stopColor="#d4941a" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect width="390" height="320" fill="url(#s1sky)"/>
      {/* Moon glow */}
      <ellipse cx="290" cy="60" rx="60" ry="60" fill="url(#s1moon)"/>
      <circle cx="290" cy="60" r="14" fill="#c4841a" opacity="0.7"/>
      {/* Water reflections — horizontal strokes */}
      {[180,190,200,210,220,230,240,250,260,270,280,290,300,310].map((y,i) => (
        <line key={i} x1={10+i*2} y1={y} x2={380-i} y2={y}
          stroke="#d4941a" strokeOpacity={0.04+i*0.01} strokeWidth="1.5"/>
      ))}
      {/* Moon reflection in water */}
      <ellipse cx="290" cy="240" rx="8" ry="40" fill="#d4941a" opacity="0.08"/>
      {/* Far treeline — palm silhouettes */}
      {[20,50,80,110,140,170,200,230,260,290,320,350].map((x,i) => (
        <g key={i} transform={`translate(${x},${155+Math.sin(i)*6})`}>
          <line x1="0" y1="0" x2="0" y2={-35-Math.abs(Math.sin(i*1.7))*15}
            stroke="#1a1208" strokeWidth="2.5"/>
          {/* Palm fronds */}
          {[-30,-20,-10,0,10,20,30].map((angle,j) => (
            <line key={j}
              x1="0" y1={-35-Math.abs(Math.sin(i*1.7))*15}
              x2={Math.sin(angle*Math.PI/180)*20}
              y2={-35-Math.abs(Math.sin(i*1.7))*15 - Math.cos(angle*Math.PI/180)*12}
              stroke="#251a0a" strokeWidth="1.5" opacity="0.9"/>
          ))}
        </g>
      ))}
      {/* Water surface */}
      <rect x="0" y="175" width="390" height="145" fill="#0d0a06" opacity="0.6"/>
      {/* Boat hull */}
      <path d="M130 210 Q195 195 260 210 L275 228 Q195 238 115 228 Z"
        fill="#1a1208" stroke="#2a1e0e" strokeWidth="1"/>
      {/* Boat cabin */}
      <rect x="170" y="196" width="48" height="18" rx="3"
        fill="#221608" stroke="#3a2810" strokeWidth="1"/>
      {/* Warm cabin light */}
      <ellipse cx="194" cy="205" rx="6" ry="4" fill="#d4941a" opacity="0.25"/>
      {/* Mast */}
      <line x1="194" y1="178" x2="194" y2="210" stroke="#1a1208" strokeWidth="2"/>
      {/* Ripples around boat */}
      <ellipse cx="194" cy="232" rx="65" ry="6" fill="none"
        stroke="#d4941a" strokeOpacity="0.06" strokeWidth="1"/>
      <ellipse cx="194" cy="238" rx="80" ry="8" fill="none"
        stroke="#d4941a" strokeOpacity="0.04" strokeWidth="1"/>
      {/* Stars */}
      {[[40,30],[70,18],[120,25],[180,12],[240,22],[310,15],[350,35],[320,50]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="1" fill="#f5efe5" opacity={0.3+Math.sin(i)*0.2}/>
      ))}
    </svg>
  ),

  // Demon Copperhead — Appalachian hills at dusk, a lone figure on a ridge
  2: ({ opacity }) => (
    <svg viewBox="0 0 390 320" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",opacity}}>
      <defs>
        <linearGradient id="s2sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a0a04"/>
          <stop offset="60%" stopColor="#3d1a08"/>
          <stop offset="100%" stopColor="#0d0805"/>
        </linearGradient>
      </defs>
      <rect width="390" height="320" fill="url(#s2sky)"/>
      {/* Sunset band */}
      <rect x="0" y="90" width="390" height="50" fill="#8B2500" opacity="0.12"/>
      {/* Distant ridge — far */}
      <path d="M0 155 Q60 130 120 145 Q180 128 240 140 Q300 125 390 138 L390 320 L0 320 Z"
        fill="#1a0e06"/>
      {/* Mid ridge */}
      <path d="M0 175 Q40 155 90 168 Q150 148 210 162 Q270 145 330 160 Q360 152 390 158 L390 320 L0 320 Z"
        fill="#14080403"/>
      {/* Near ridge — main */}
      <path d="M0 210 Q50 185 100 200 Q160 178 220 195 Q280 175 350 190 Q370 185 390 188 L390 320 L0 320 Z"
        fill="#0d0604"/>
      {/* Trees on ridge */}
      {[15,35,55,72,88,105,125,145,165,185,205,225,248,268,288,308,328,348,368].map((x,i) => {
        const h = 20 + Math.abs(Math.sin(i*0.8+1))*18;
        const y = 188 + Math.sin(i*0.5)*8;
        return (
          <g key={i}>
            <line x1={x} y1={y} x2={x} y2={y-h} stroke="#0d0604" strokeWidth="2"/>
            <polygon
              points={`${x},${y-h} ${x-6},${y-h+12} ${x+6},${y-h+12}`}
              fill="#0d0604"/>
            <polygon
              points={`${x},${y-h+6} ${x-8},${y-h+18} ${x+8},${y-h+18}`}
              fill="#110804"/>
          </g>
        );
      })}
      {/* Lone figure on ridge */}
      <line x1="195" y1="182" x2="195" y2="198" stroke="#0a0604" strokeWidth="3"/>
      <circle cx="195" cy="179" r="4" fill="#0a0604"/>
      {/* Faint ember glow — fire pit far off */}
      <ellipse cx="80" cy="200" rx="6" ry="3" fill="#d4941a" opacity="0.15"/>
      <ellipse cx="80" cy="198" rx="3" ry="6" fill="#d4941a" opacity="0.08"/>
      {/* Stars */}
      {[[30,20],[80,35],[130,15],[200,28],[260,18],[320,30],[355,22],[15,45]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="1" fill="#f5efe5" opacity={0.25+Math.cos(i)*0.15}/>
      ))}
    </svg>
  ),

  // Project Hail Mary — deep space, a lone spacecraft, alien star system
  3: ({ opacity }) => (
    <svg viewBox="0 0 390 320" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",opacity}}>
      <defs>
        <radialGradient id="s3nebula" cx="60%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#1a3060" stopOpacity="0.5"/>
          <stop offset="50%" stopColor="#0a1830" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="#020408" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="s3star1" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e8d4a0" stopOpacity="0.9"/>
          <stop offset="100%" stopColor="#e8d4a0" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="s3star2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a0c8e8" stopOpacity="0.7"/>
          <stop offset="100%" stopColor="#a0c8e8" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect width="390" height="320" fill="#020408"/>
      {/* Nebula cloud */}
      <ellipse cx="240" cy="130" rx="180" ry="120" fill="url(#s3nebula)"/>
      {/* Tau Ceti — warm star */}
      <ellipse cx="280" cy="80" rx="40" ry="40" fill="url(#s3star1)"/>
      <circle cx="280" cy="80" r="8" fill="#e8d4a0" opacity="0.9"/>
      {/* Eridani — cool blue companion */}
      <ellipse cx="110" cy="200" rx="25" ry="25" fill="url(#s3star2)"/>
      <circle cx="110" cy="200" r="5" fill="#a0c8e8" opacity="0.8"/>
      {/* Star field */}
      {Array.from({length: 60}, (_,i) => ({
        x: (i*47+13) % 390,
        y: (i*83+7)  % 320,
        r: i%5===0 ? 1.5 : 0.8,
        o: 0.2 + (i%7)*0.08
      })).map((s,i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#f5efe5" opacity={s.o}/>
      ))}
      {/* Spacecraft — Hail Mary, rough cylinder */}
      <g transform="translate(175 145) rotate(-15)">
        {/* Main hull */}
        <rect x="-8" y="-28" width="16" height="56" rx="4"
          fill="#1a2030" stroke="#2a3848" strokeWidth="1"/>
        {/* Engine bell */}
        <path d="M-6 28 Q-10 38 -12 48 L12 48 Q10 38 6 28 Z"
          fill="#141820" stroke="#202830" strokeWidth="1"/>
        {/* Engine glow */}
        <ellipse cx="0" cy="48" rx="10" ry="5" fill="#4060d0" opacity="0.4"/>
        <ellipse cx="0" cy="52" rx="6" ry="8" fill="#4060d0" opacity="0.2"/>
        {/* Solar panels */}
        <rect x="-28" y="-8" width="20" height="8" rx="1"
          fill="#1a3050" stroke="#203848" strokeWidth="0.5"/>
        <rect x="8" y="-8" width="20" height="8" rx="1"
          fill="#1a3050" stroke="#203848" strokeWidth="0.5"/>
        {/* Panel lines */}
        {[0,5,10,15].map(dx => (
          <line key={dx} x1={-28+dx} y1="-8" x2={-28+dx} y2="0"
            stroke="#203848" strokeWidth="0.5"/>
        ))}
        {/* Cockpit window */}
        <ellipse cx="0" cy="-16" rx="4" ry="3" fill="#304060" opacity="0.8"/>
        <ellipse cx="0" cy="-16" rx="2" ry="1.5" fill="#6080a0" opacity="0.5"/>
      </g>
      {/* Astrophage trail — the orange cloud */}
      <ellipse cx="195" cy="240" rx="120" ry="20" fill="#d4941a" opacity="0.04"/>
      <ellipse cx="195" cy="248" rx="80" ry="12" fill="#d4941a" opacity="0.03"/>
    </svg>
  ),

  // All the Light We Cannot See — Saint-Malo, radio tower, sea
  4: ({ opacity }) => (
    <svg viewBox="0 0 390 320" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",opacity}}>
      <defs>
        <linearGradient id="s4sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#08080e"/>
          <stop offset="100%" stopColor="#181424"/>
        </linearGradient>
        <radialGradient id="s4light" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f5efe5" stopOpacity="0.15"/>
          <stop offset="100%" stopColor="#f5efe5" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect width="390" height="320" fill="url(#s4sky)"/>
      {/* Sea */}
      <rect x="0" y="230" width="390" height="90" fill="#080c14" opacity="0.9"/>
      {/* Waves */}
      {[240,252,264,276,288].map((y,i) => (
        <path key={i}
          d={`M0 ${y} Q${40+i*5} ${y-5} ${80+i*3} ${y} Q${130+i*4} ${y+5} ${170+i*2} ${y} Q${220+i*3} ${y-5} ${260+i*2} ${y} Q${310+i*4} ${y+5} 390 ${y}`}
          fill="none" stroke="#1a2030" strokeOpacity={0.3-i*0.04} strokeWidth="1"/>
      ))}
      {/* City wall / ramparts */}
      <path d="M0 220 L30 220 L30 210 L45 210 L45 220 L70 220 L70 208 L85 208 L85 220 L120 220 L120 212 L135 212 L135 220 L390 220 L390 320 L0 320 Z"
        fill="#141018"/>
      {/* Buildings — Saint-Malo townhouses */}
      {[[40,170,22,50],[90,155,18,65],[130,168,20,52],[175,150,24,70],[210,162,18,58],[255,148,22,72],[295,160,20,60],[330,155,24,65],[360,165,18,55]].map(([x,y,w,h],i) => (
        <g key={i}>
          <rect x={x-w/2} y={y} width={w} height={h} fill="#100c18" stroke="#1a1528" strokeWidth="0.5"/>
          {/* Roof */}
          <polygon points={`${x-w/2} ${y} ${x} ${y-15} ${x+w/2} ${y}`} fill="#0c0a14"/>
          {/* Dim window */}
          {i%3===0 && <rect x={x-4} y={y+h/2-6} width="8" height="10" rx="1" fill="#d4941a" opacity="0.12"/>}
        </g>
      ))}
      {/* Radio tower — tall, center */}
      <line x1="194" y1="60" x2="194" y2="220" stroke="#1a1528" strokeWidth="3"/>
      <line x1="194" y1="80" x2="194" y2="220" stroke="#201c30" strokeWidth="1.5"/>
      {/* Tower cross beams */}
      {[100,130,160,190].map((y,i) => {
        const w = 8+i*6;
        return <line key={i} x1={194-w} y1={y} x2={194+w} y2={y} stroke="#1a1528" strokeWidth="1.5"/>;
      })}
      {/* Guy wires */}
      <line x1="194" y1="80" x2="130" y2="215" stroke="#1a1528" strokeWidth="0.8" opacity="0.6"/>
      <line x1="194" y1="80" x2="258" y2="215" stroke="#1a1528" strokeWidth="0.8" opacity="0.6"/>
      {/* Tower light beacon */}
      <circle cx="194" cy="62" r="4" fill="#f5efe5" opacity="0.6"/>
      <ellipse cx="194" cy="62" rx="40" ry="40" fill="url(#s4light)"/>
      {/* Radio waves emanating */}
      {[20,35,50].map((r,i) => (
        <circle key={i} cx="194" cy="62" r={r} fill="none"
          stroke="#f5efe5" strokeOpacity={0.06-i*0.015} strokeWidth="1"/>
      ))}
      {/* Stars / searchlight streaks */}
      {[[30,25],[80,18],[280,22],[340,30],[360,15]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="1" fill="#f5efe5" opacity="0.3"/>
      ))}
    </svg>
  ),

  // The Lincoln Highway — open American road, 1950s, vast sky
  5: ({ opacity }) => (
    <svg viewBox="0 0 390 320" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",opacity}}>
      <defs>
        <linearGradient id="s5sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#050810"/>
          <stop offset="70%" stopColor="#0e1828"/>
          <stop offset="100%" stopColor="#1a1408"/>
        </linearGradient>
        <radialGradient id="s5moon" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f5efe5" stopOpacity="0.5"/>
          <stop offset="100%" stopColor="#f5efe5" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect width="390" height="320" fill="url(#s5sky)"/>
      {/* Milky Way band */}
      <ellipse cx="195" cy="140" rx="300" ry="60" fill="#1a2040" opacity="0.15" transform="rotate(-20 195 140)"/>
      {/* Moon */}
      <ellipse cx="320" cy="55" rx="35" ry="35" fill="url(#s5moon)"/>
      <circle cx="320" cy="55" r="11" fill="#e8e0d0" opacity="0.5"/>
      {/* Stars */}
      {Array.from({length:50},(_,i) => ({
        x:(i*73+17)%390, y:(i*41+9)%200, o:0.15+(i%6)*0.08
      })).map((s,i) => (
        <circle key={i} cx={s.x} cy={s.y} r={i%8===0?1.5:0.8} fill="#f5efe5" opacity={s.o}/>
      ))}
      {/* Flat horizon — Great Plains */}
      <rect x="0" y="218" width="390" height="102" fill="#0a0c08"/>
      {/* Road — vanishing point center */}
      <path d="M155 320 L172 218 L218 218 L235 320 Z" fill="#141410"/>
      {/* Road center dashes */}
      {[230,252,270,288,306].map((y,i) => (
        <rect key={i} x="192" y={y} width="6" height="14" rx="1" fill="#d4941a" opacity="0.15"/>
      ))}
      {/* Road shoulders — white lines */}
      <line x1="155" y1="320" x2="172" y2="218" stroke="#f5efe5" strokeOpacity="0.08" strokeWidth="1"/>
      <line x1="235" y1="320" x2="218" y2="218" stroke="#f5efe5" strokeOpacity="0.08" strokeWidth="1"/>
      {/* Car headlights — far off */}
      <circle cx="191" cy="224" r="2" fill="#f5efe5" opacity="0.5"/>
      <circle cx="199" cy="224" r="2" fill="#f5efe5" opacity="0.5"/>
      <ellipse cx="195" cy="226" rx="15" ry="4" fill="#f5efe5" opacity="0.04"/>
      {/* Telephone poles */}
      {[60,130,260,330].map((x,i) => (
        <g key={i}>
          <line x1={x} y1="180" x2={x} y2="270" stroke="#0e0c08" strokeWidth="2.5"/>
          <line x1={x-14} y1="188" x2={x+14} y2="188" stroke="#0e0c08" strokeWidth="1.5"/>
          <line x1={x-10} y1="196" x2={x+10} y2="196" stroke="#0e0c08" strokeWidth="1.5"/>
          {/* Wire to road */}
          <line x1={x} y1="188" x2={195} y2="220"
            stroke="#0e0c08" strokeOpacity="0.5" strokeWidth="0.5"/>
        </g>
      ))}
      {/* Gas station far right — warm glow */}
      <rect x="340" y="205" width="30" height="18" fill="#100e08"/>
      <rect x="336" y="198" width="38" height="8" fill="#0e0c06"/>
      <ellipse cx="355" cy="206" rx="20" ry="12" fill="#d4941a" opacity="0.08"/>
    </svg>
  ),

  // Thinking Fast and Slow — dual minds, two paths diverging, abstract
  6: ({ opacity }) => (
    <svg viewBox="0 0 390 320" xmlns="http://www.w3.org/2000/svg" style={{width:"100%",height:"100%",opacity}}>
      <defs>
        <radialGradient id="s6left" cx="30%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1a3018" stopOpacity="0.5"/>
          <stop offset="100%" stopColor="#1a3018" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="s6right" cx="70%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#182030" stopOpacity="0.5"/>
          <stop offset="100%" stopColor="#182030" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect width="390" height="320" fill="#06080a"/>
      {/* Two ambient hemispheres — intuition (warm) vs reason (cool) */}
      <ellipse cx="110" cy="160" rx="200" ry="180" fill="url(#s6left)"/>
      <ellipse cx="280" cy="160" rx="200" ry="180" fill="url(#s6right)"/>
      {/* Central dividing line — the brain split */}
      <line x1="195" y1="0" x2="195" y2="320" stroke="#f5efe5" strokeOpacity="0.04" strokeWidth="1"/>
      {/* System 1 — intuitive, organic curves */}
      {[0,1,2,3,4].map(i => (
        <path key={i}
          d={`M${40+i*8} ${60+i*10} Q${80+i*15} ${120+i*8} ${50+i*12} ${180+i*6} Q${30+i*8} ${240+i*5} ${70+i*10} ${290}`}
          fill="none" stroke="#4a8040" strokeOpacity={0.12-i*0.02} strokeWidth={2-i*0.3}/>
      ))}
      {/* System 2 — logical, geometric lines */}
      {[0,1,2,3,4].map(i => (
        <g key={i}>
          <line x1={220+i*18} y1={50+i*5} x2={240+i*14} y2={160+i*8}
            stroke="#4060a0" strokeOpacity={0.12-i*0.02} strokeWidth={1.5-i*0.25}/>
          <line x1={240+i*14} y1={160+i*8} x2={225+i*16} y2={280+i*5}
            stroke="#4060a0" strokeOpacity={0.10-i*0.02} strokeWidth={1.5-i*0.25}/>
        </g>
      ))}
      {/* Convergence point — where they meet */}
      <circle cx="195" cy="160" r="3" fill="#d4941a" opacity="0.4"/>
      <circle cx="195" cy="160" r="18" fill="none" stroke="#d4941a" strokeOpacity="0.08" strokeWidth="1"/>
      <circle cx="195" cy="160" r="35" fill="none" stroke="#d4941a" strokeOpacity="0.05" strokeWidth="1"/>
      {/* Data points — scattered nodes System 1 */}
      {[[60,90],[45,140],[80,180],[55,240],[90,275]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="2.5" fill="#4a8040" opacity={0.2+i*0.04}/>
      ))}
      {/* Data points — structured nodes System 2 */}
      {[[320,80],[340,130],[310,185],[335,235],[315,280]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="2" fill="#4060a0" opacity={0.2+i*0.04}/>
      ))}
      {/* Connecting lines between nodes */}
      {[[60,90,45,140],[45,140,80,180],[80,180,55,240],[55,240,90,275]].map(([x1,y1,x2,y2],i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#4a8040" strokeOpacity="0.1" strokeWidth="1"/>
      ))}
      {[[320,80,340,130],[340,130,310,185],[310,185,335,235],[335,235,315,280]].map(([x1,y1,x2,y2],i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#4060a0" strokeOpacity="0.1" strokeWidth="1"/>
      ))}
      {/* Fine star field — minds in the dark */}
      {Array.from({length:25},(_,i)=>({x:(i*67+23)%390,y:(i*53+11)%320})).map((s,i)=>(
        <circle key={i} cx={s.x} cy={s.y} r="0.7" fill="#f5efe5" opacity="0.12"/>
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
      background:"linear-gradient(180deg,#131007 0%,rgba(10,8,6,.98) 100%)",
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
function BookSearch({ onSelect, placeholder = "Search for a book...", mode = "rate" }) {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(null); // book waiting for rating
  const debounceRef = useRef(null);

  const search = async (q) => {
    if (!q.trim() || q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res  = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=7&fields=title,author_name,isbn,cover_i,first_publish_year`);
      const data = await res.json();
      setResults((data.docs || []).filter(d => d.title));
    } catch { setResults([]); }
    setLoading(false);
  };

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 380);
  };

  const selectBook = (doc) => {
    const book = {
      title:  doc.title,
      author: doc.author_name?.[0] || "",
      isbn:   doc.isbn?.[0] || "",
      coverId:doc.cover_i || null,
    };
    if (mode === "want") {
      onSelect(book);
      setQuery(""); setResults([]);
    } else {
      // rate mode — show inline star picker
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
          {results.map((doc, i) => {
            const covUrl = doc.cover_i
              ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-S.jpg`
              : null;
            return (
              <div key={i}
                onClick={() => selectBook(doc)}
                style={{
                  display:"flex",alignItems:"center",gap:10,
                  padding:"9px 12px",cursor:"pointer",
                  borderBottom:"1px solid rgba(255,255,255,.05)",
                  transition:"background .14s",
                }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(212,148,26,.08)"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}
              >
                {/* Small cover */}
                <div style={{width:28,height:40,borderRadius:3,overflow:"hidden",flexShrink:0,background:"var(--card2)"}}>
                  {covUrl
                    ? <img src={covUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                    : <div style={{width:"100%",height:"100%",background:"var(--lift)"}}/>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"'Lora',serif",fontSize:12.5,fontWeight:600,color:"var(--text)",lineHeight:1.25,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{doc.title}</div>
                  <div style={{fontSize:10.5,color:"var(--muted)",fontStyle:"italic",marginTop:1}}>{doc.author_name?.[0] || "Unknown"}{doc.first_publish_year ? ` · ${doc.first_publish_year}` : ""}</div>
                </div>
                <div style={{fontSize:10,color:"var(--gold)",fontWeight:600,flexShrink:0}}>{mode==="want"?"+ Add":"Rate →"}</div>
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
function TopMoment({ intelligence, signalCandidates, recCandidates, behavioral, context, lastSurfaced, recentlyFailedGenres, handlers, onOpenChat, rerunKey }) {
  const [moment, setMoment] = useState(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const result = rankAndSurface({
      intelligence,
      signalCandidates,
      recCandidates,
      behavioral,
      context,
      lastSurfaced,
      recentlyFailedGenres,
    });
    if (result) {
      setMoment(result);
      logOutcome(result, "shown", handlers);
    }
  }, [rerunKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!moment) return null;

  const handleClick = () => {
    logOutcome(moment, "tapped", handlers);
    if (onOpenChat) onOpenChat(moment);
  };

  const handleDismiss = () => {
    setExiting(true);
    logOutcome(moment, "dismissed", handlers);
    setTimeout(() => setMoment(null), 220);
  };

  return (
    <div className={`ls-moment-card ${exiting ? "exiting" : ""}`}>
      <div className="ls-moment-msg">{moment.msg}</div>
      <button className="ls-moment-cta" onClick={handleClick}>{moment.cta || "Tell me more"} →</button>
      <button className="ls-moment-dismiss" onClick={handleDismiss}>×</button>
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
          onLoad={() => setLoaded(true)}
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
          maxHeight:"88dvh",
          overflowY:"auto",
        }}
      >
        <div style={{width:40,height:4,background:"rgba(255,255,255,.15)",borderRadius:2,margin:"14px auto 20px"}}/>

        {/* Cover + meta row */}
        <div style={{display:"flex",gap:16,padding:"0 20px 16px"}}>
          <div style={{width:100,height:148,borderRadius:12,overflow:"hidden",flexShrink:0,boxShadow:"0 12px 36px rgba(0,0,0,.7)"}}>
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
  const [dismissing,setDismissing]= useState(false);
  const isTouchRef = useRef(false);

  const handleMouseEnter = () => { if (!isTouchRef.current) onShowDetail?.(b); };
  const handleTouchStart = () => { isTouchRef.current = true; };

  const handleClick = () => {
    if (isTouchRef.current) {
      isTouchRef.current = false;
      onShowDetail?.(b);
    }
  };

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
      onMouseEnter={handleMouseEnter}
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
        transform: `scale(${finalScale})`,
        transformOrigin: origin,
        transition: "transform .3s cubic-bezier(.2,.8,.2,1)",
        borderRadius: 10,
        overflow: "hidden", position: "relative",
        boxShadow: scrollScale > 1.05
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
      return 0.88 + 0.30 * eased;
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
      {/* Outer: clips horizontal, allows vertical scale overflow */}
      <div style={{overflowX:"hidden", overflowY:"visible"}}>
        <div
          ref={trackRef}
          style={{
            display:"flex", gap:12,
            overflowX:"auto", overflowY:"visible",
            padding:"12px 16px 20px",
            scrollbarWidth:"none", msOverflowStyle:"none",
            WebkitOverflowScrolling:"touch",
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
        <div className="ls-tile-modal-cover">
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
        <a
          href={amazonLink(b.title, b.author, b.isbn)}
          target="_blank" rel="noopener noreferrer"
          style={{
            display:"block",width:"100%",padding:"13px",borderRadius:10,
            background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",
            color:"var(--text2)",textAlign:"center",textDecoration:"none",
            fontSize:14,fontWeight:600,marginBottom:10,boxSizing:"border-box",
          }}
        >Buy on Amazon →</a>
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
      <div className="ls-listing-cover">
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


// ── WELCOME PAGE ──────────────────────────────────────────────────────────────
const KEYHOLE_IMG = "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz48c3ZnIGlkPSJMYXllcl8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2aWV3Qm94PSIwIDAgNzY4IDEzNjAiPjxpbWFnZSB3aWR0aD0iNzY4IiBoZWlnaHQ9IjEzNjAiIHhsaW5rOmhyZWY9ImRhdGE6aW1hZ2UvcG5nO2Jhc2U2NCwvOWovNFFKQVJYaHBaZ0FBU1VrcUFBZ0FBQUFEQUE0QkFnRGtBQUFBTWdBQUFEc0JBZ0FsQUFBQUZnRUFBR21IQkFBQkFBQUFPd0VBQUFBQUFBQlRhV2R1WVhSMWNtVTZJRWhqWlhKSWRrMVpXV1J0VEVWRGRVZHpTVGhyTldkcVJWZGllbGx3VUVWRWNqbFBWbU5DWjI0d2QxZFVZbmxDWkVGWk9HUllSbFpRZFc0MFJqTTJaamxpUmxJMmJUSTRTR05pYVhCNFJ6Sm5WMWxVY1RkNFkwdG9aRkJIYkdkcU5uQjJhRzFGVmxSNFpEZDVaRkZOV1dwek5ubEJjRkZpVUhaRWVGQnZNbWxWUlU1bEswMHlZbUZaVmxwUk5UbFFjWEZ6UmpSMmRWbE1jMkY1ZFU1VFJrNXBkMHB1YWtOc1JFTlBaWEV3YjBKVWJVSXZVa3hXVUd0aGVFYzVVU3RuY3poeVIxcFpkM3BvUjBaMFMyNWtjVW96UVZKS1NIYzlQUUF5T1Raak9EUmxOaTFpTURGbUxUUTBNelF0T0RVMFlTMDVaalV4TjJRM05UWXlOVGNBQVFDR2tnY0E2d0FBQUUwQkFBQUFBQUFBUVZORFNVa0FBQUJUYVdkdVlYUjFjbVU2SUVoalpYSklkazFaV1dSdFRFVkRkVWR6U1Rock5XZHFSVmRpZWxsd1VFVkVjamxQVm1OQ1oyNHdkMWRVWW5sQ1pFRlpPR1JZUmxaUWRXNDBSak0yWmpsaVJsSTJiVEk0U0dOaWFYQjRSekpuVjFsVWNUZDRZMHRvWkZCSGJHZHFObkIyYUcxRlZsUjRaRGQ1WkZGTldXcHpObmxCY0ZGaVVIWkVlRkJ2TW1sVlJVNWxLMDB5WW1GWlZscFJOVGxRY1hGelJqUjJkVmxNYzJGNWRVNVRSazVwZDBwdWFrTnNSRU5QWlhFd2IwSlViVUl2VWt4V1VHdGhlRWM1VVN0bmN6aHlSMXBaZDNwb1IwWjBTMjVrY1VvelFWSktTSGM5UGYvZ0FCQktSa2xHQUFFQkFBQUJBQUVBQVAvYkFFTUFBZ0VCQVFFQkFnRUJBUUlDQWdJQ0JBTUNBZ0lDQlFRRUF3UUdCUVlHQmdVR0JnWUhDUWdHQndrSEJnWUlDd2dKQ2dvS0Nnb0dDQXNNQ3dvTUNRb0tDdi9iQUVNQkFnSUNBZ0lDQlFNREJRb0hCZ2NLQ2dvS0Nnb0tDZ29LQ2dvS0Nnb0tDZ29LQ2dvS0Nnb0tDZ29LQ2dvS0Nnb0tDZ29LQ2dvS0Nnb0tDZ29LQ2dvS0N2L0FBQkVJQlZBREFBTUJJZ0FDRVFFREVRSC94QUFmQUFBQkJRRUJBUUVCQVFBQUFBQUFBQUFBQVFJREJBVUdCd2dKQ2d2L3hBQzFFQUFDQVFNREFnUURCUVVFQkFBQUFYMEJBZ01BQkJFRkVpRXhRUVlUVVdFSEluRVVNb0dSb1FnalFySEJGVkxSOENRelluS0NDUW9XRnhnWkdpVW1KeWdwS2pRMU5qYzRPVHBEUkVWR1IwaEpTbE5VVlZaWFdGbGFZMlJsWm1kb2FXcHpkSFYyZDNoNWVvT0VoWWFIaUltS2twT1VsWmFYbUptYW9xT2twYWFucUttcXNyTzB0YmEzdUxtNndzUEV4Y2JIeU1uSzB0UFUxZGJYMk5uYTRlTGo1T1htNStqcDZ2SHk4L1QxOXZmNCtmci94QUFmQVFBREFRRUJBUUVCQVFFQkFBQUFBQUFBQVFJREJBVUdCd2dKQ2d2L3hBQzFFUUFDQVFJRUJBTUVCd1VFQkFBQkFuY0FBUUlERVFRRklURUdFa0ZSQjJGeEV5SXlnUWdVUXBHaHNjRUpJek5TOEJWaWN0RUtGaVEwNFNYeEZ4Z1pHaVluS0NrcU5UWTNPRGs2UTBSRlJrZElTVXBUVkZWV1YxaFpXbU5rWldabmFHbHFjM1IxZG5kNGVYcUNnNFNGaG9lSWlZcVNrNVNWbHBlWW1acWlvNlNscHFlb3FhcXlzN1MxdHJlNHVickN3OFRGeHNmSXljclMwOVRWMXRmWTJkcmk0K1RsNXVmbzZlcnk4L1QxOXZmNCtmci8yZ0FNQXdFQUFoRURFUUEvQVB5dzF2d3d0MnJTb0JnMjVZdDF4aXZSL3dCaTJlejB1YlNidUtVRzcwN1cydTRvOGRvM1RPZmJCSkgwcmhMYXp1THVHOFZwMkNsQ2lxRDA0elhZL3N6Vzl0NE84RGFsOFRibTFOekI0WTFCYnE1dDQ4YnBFUHlsUm50M3hqdlU0WjJaV0pWNGxmOEE0S0ErTTlGK0puN1IvaXpYdEhqYUVQZXhvd2t4OHJvZ1Z2cm5QYXZDUEJsb3Ezc3U1d1FUakdldlAvNnE2NzlxV1c2aCtLMnAzY0VaamgxRzQrM1JxVzVDU2dFRDY0TmVjNlBjM0thekdiTnlYM0FBRDNQVTFsaU5aTmw0ZDJzZEhlYVROZlhjYUl1TVhQbDRZNEFKNlo5cTZ6NHErRWJMVEh0OVcwaTVTV0lRTEZLVVAzWFVBSDlhZzhWK0IvRmVrK0VOTzhlU0pCSGI2eGN1bHY1Y2czbzhmSHpEdDNybjlYdjJ0TE9QU0k3aHh0T1hSK2dZOVQrZkZjc2RUc2tWQks3MjUycmtyNzgxRU1rYm00NDVxWFRJWmxrZWN1cFVqZ0thVFVJR2dWWGJHRzZDdEZzS0l5M2psMCs5ajFhRWdnSEJVZGNWTDRxMUU2M2QyclJxVkN4ZnhIM3BzRWlsY0tjZ0p4elNMYk5kdkR0K2JDbk9PMVpUdGMzZ20wVVZBaSswSm5HTUNsdGJzMnliaitQTk91SWtlZTRNaUhudUtpMnhHQVJ4RTV6eVRXZktpMUpvc2FicVMzTjA3NEl6L0NUVWVzZ3pTcmpqNXVPYXF3ckxhMzZpUHAzeFZyVXd5eXF6bkFQcFdjMVpta0pOb2xhMzJrc1U0OHZBcnMvZ1Q4Tk5XOFdlS0l0UXN0ZXQ3RzJpbEhuelR0aklKSEhOY2JPSGx0Rk51LzF5T2FqMHBieG5OdkZleXhxZVNFY2dFL2hTakc2Q3BkUjBQcUw5b2o0VDJmaFQ0UDNkeHB0LzVwTWtCQUE2NWJzZTlmTVVPazZsQXNyWE1lUG1QQnJ0ZGUrT25pM1hQQUsrRDlVbk1zU2VXb2tjY2pZZVBmdlhOd0ZiK0h6alBJeFlra01lbFRHUElLbW5OSE56QmpjeGhrK1JYQkl6eVFEMHJvWVp0TjFiV29ydXlzUHM2aFFCR1Rub0t4dFlnbVhVTXhJeFUrbmVyZWt1WUxxTlpQbE9SeFdzMm5FSUxsa2FXcHhCdFc4eE00enlhaDFFbnp4YlN4N1F3K1Y4OUt0ekkzMm56SEdjOUtyNndIa0FabEpLZ2xRS3lwczZKZkFVcExOeEdvS25JT000cEpkUGgzaVF5YlNCOTBIM3JVMGErdHBMY0pjS0N6OUFhemRaOE9heGF6Ry9qakx4TWM1WHNLNmVWTkhHNnJUMUVXUkZuTVk5T3ByVzBSWGEydlJqZzJiL0FER3N1S08wdHI3N1BxVXZsdjVBSUJQYzlLMWJTZU8zOFBUdkkyREltME5uMnJpbkMxUTdhZFRtcG5OTXR4YndSc3k1QkE3MUlieVpiWm9Wd2R5a0JqMnpWZDUzU1FXek1XQTZaSGVsVU1XSVpTRFc2Mk1TV1FXN3JCNUkyYllBc29KenVZZDZTS1pMYVR6SmNnWkhidG1pSzVSZ2JZd0FBSDcyT2g0cEpad3pzSnVkdlRqcHpWSUhzYU44OWo5cWtUVDNMUnNxaGQ0OXMvMHJvNXJrUytCWXJRRXR0MVNFWXgvc0VWeE9tM0F1WnloUEhZMTMyaVdFVng0WHVvV0FQbFhOdTZuT2Vja1pybHJXNTBkV0ZkNlVqa3pFWWQ3YmpnU0hpcjExSk5mVzhFTVRoV2lJSUpxbGNSTTNtUG5rU0h2UkxLYlo0ZDdFZ2pCSXJubWRWRjZIUWFMNGduOE83cnp5TjRTUkZJLzJjWU5jL1pyYVFhdmN6MmZFY3R3enhCdXdKemlyMDk4VjA5bGtYZ2djWTYxVWFKWkhFc2ZBWURQclUrMFVxZktiZXp0V1VpMXFjc2N0NTVjTDhpUDd0VTRIUTZrOExjQjF4dTdEdFVsdmJtZlUxU1Bra1k0cUs1aWhnZVNEZmx3eEdmN3RUU2lvc3V0SnREWW1raXVJSWM1Wk1oaDY4OEd1bzAwVFBHalJqUEFEWjZWeDh5TmIzVUxJNTlEZzEybWtUYklZZGdHUzNMZHNWVmVHZ3NQTzF5S2JVWFNLWGNwWHl5Y1pQdFdWcVVrdDlhTExHcElYbGptdGpXL0R1cWF3ZFFUUmJWNURieEdhY3AvQWc2dFdOYjJVRm5wOFFtdVN4a1RMRFA2VTZjRW8zSm5WY3BXTFVGb3E2TkZJelpPUnhucFRMdlRvcHJ1T1lLMFcrTVlEZCtsUHNuaHQ5Tm1DUHV4a2oxRlM2aGVmMmhwVnUxdEhnb05yS092K2U5ZGRGSm5EaWRHWW1vMkNnbU5XR2VweFZYVEhTQzZjTWVWNVVmalZtL2h2Ym00OGd4bFNpanJUanBRdDJpMUJSdVZDTjQ5cTFza2NpZXBzTnN1OUxnaXpobzVpTUhxYWkxUzZiUjdtQjRjK2JISXJLUjdIL3dDdFYyQ05FTXMwVWZDb0dqejZtc3J5N3ZVTlZpdGI5VHVlUlFyRHR5Qi9YOUtxQzFDdjhKNko0bmtsOFVmdDVlSU5ldW1Ca24wMkM1YzlmbWF5aDVyRDhkU1NXZmpPTzR1NHlpQzVJQy9pYy96cG54d3Z0VytGdjdXdXN0YVNCcFpOSzA5WTVlQ05qMnNQUDZHdTMwL3dBUGlsYTJNRTdiSnBVWmkrY2NnWlA2MTB6bDdwdzBWekt4NVQ0bnRFWFhKYjIwZmNoa3l1M3A2MXpHcFNUVDN4ZkI0UGJOZC80aDhLUDRYMWQ5SzFHNUcySjhZQzV5QWV2NVZCQnAra1NheXJhWFpSenhsTXVUamcxakJIVTFvYzVieE9sakR2eXJNZU0rbGRUNGFaSVZDeXR1R0RnMUlkTWU5MVczZGJSVHRiYUlRdkZkSGI2SFo2Tkc2L1lNeXNjNVljRHArbE9hUlVVK1VsOE5XY1VyM0Y1Q2ZsRVJHUFFrVnpQZ0VQWjI5MWJYbVVmN1F4R2ZmL0FQWFcvWTZoUFpDYTJTSUp2QnlWSEEveHB1aFR4VzJwdExMWUpNU1RrRWNjbnJXVmpTR201ZzMrbEhVOWNEVzB4Q29Nay9qMjlhcVNXZDE5dTNSeS93Q3JmbmFlbmV2UXRGc2RQbXZKVE5iTEd6a2xWNllyQzhSK0dCcHVvU3lXa2daTjJkZ0hQZXMzRkkzUlQ4V1h1cnpRV04zSXZtTEVvREFkYXFIeGhZUVhVQWpnTVlVY2s5Ty81MXA2cHFYMlhTRlc1dFhCeGpnVndldFhrRXIrYnVDOGdpazZuS0p3Y2pzZmlGNFExUHczYjZScXQ3Y3d5SFZiQVhzQ1JTWktLeHdBM3Awck9GekhlV3NUbklhSWpjRjdqM3BJNTV0VnNJNUxtZVNSRWhFYWhtenRYSEFIdDFxdkJGY1dabU5zRGdLZHhQWVUrYm1MaERsV3BadTBTK2xYN0FNbkk0UFFWdnoyVWR4b1VkZzBnODJNWkovRDlhNWpUeEp1VjFrSncyWElQVDZWcmF4TGVRV1MzZHFoSUNnRmU1Rk9JVFM2RlRUNFREcmtrVEE0Wk1MNkdtNnZvcUNScnBIOWVLaDB6Vm81cnp6cjVIamtJQUFkY1ZvelJmYTI4d1RZT09SL1duTmt4SGVCdGV1NEdlemJJQUJ3VDI3VnErSXJZYWhhUVNPY0lKVHZVZDZ6cmZRTHF6c24xYUlncVR6NjA2ODFXU096VXUyVjd0NlZLdWJSMU9hWFJiV1R4T1BzTWhRQ1RPMDl1YTY3VXZzWXNwYksvazhzaTJieXovdFZpZUI0ck85OGFSbTh1QkhiK2IrOGxKd0ZHYTB2aXJOcDF6cjR0OUJtRWxzR3hISXZSaFZHTTlKRUhndVBVSWtqMDZ5Z0ptdVhBRFk2RHBtdS93QlgwaDlNU0syazVZS0FTUFdvUEJ1bEpiV2RwcWtjUkppUUFzQjByVThTVHlYY0ltWWNLQnppdFlNNXFxc1lXdWFjdHZaUjNUZG5BSXJKdnRPRnRPWm1iNVQzL0t1ajFHSVhXbXh3T2QyN0g0VmthcGJ4Nmg0bXViZEp3SXJHeUhHZUMyS3AydVFpUHdqcGxocTJuNnJlWEU1amRTQkEyZnUvNXdLOHcxSjd0ZkU1TncrNDd3T0s5TThQMmR3dWszbmtzUUN4eWM0eWZhdlB0VHNIazFXWXg4bUdVczM0bWwwS1c2TjJLV2VPRkkxaXlTQmdlbGQ1NEVsbTAyeVdTU01sdHU1UVJ5T2xjUkhkTXIyck1uOFF6K2xlaldSZ1MrczQwVEhuVytDQU9tUWF6VGFPaXk1a2U0L0RwTmUrS3Z3VjEzNFQyOXVYWFM3UzkxQVNzM0VhbEFNbk9janJ6N1Y4V2VJOUx1ZElzeHB3dVVlYTVuSVpCL0NCeCtScjYzL1oyK09lbC9Eenc1OFIvREUwSmoxUHhCb0tXR216Z0FHUE1oTW1UL3U0cjV3OForSGJhRHhEOW1uSVp0b2JLbjczWC9HdXlNbE9DWjUwcWJqaUpJd1BBbW9UMjBEd3pJd1pPQ0QzNHJPOGN6ZmF0UXRtQkxZdkFkb0hTdXJ2Yk8xdDdtVFVJb3NpUmxRYlIxeFdCNHFzN2FQVUxhNFJlSTUxWmxiditIdlYzMEhKV1IzeTNhSFNiWk4vcHo3VmovRWpTU05ZaVkveHhobEFQV3V4dWIzd0JxTjdFdG40YSswV2ZrUlRYRnUxMFk1UTIwZ3B1SFJlUXh4MDIrOVpxZUNibnhqcXR2YTJUTVhjYkVqT1NFR0FRQWUrT1JudlNzNTZITFBSR25vY1duNkI0VnNrc0wwUE81ek9uSEErdjlhei9HdGlsMGJZK2FBWlpCNVlCNCtsWTNpVFZYOEhyOWt2Y3h2RGxXVnVEa2Z3L3dBdnpyZDhGNk0vamZTTk52M1k3bzV0eEhzU2Y4SzdGSmNsamt0NzF6RytKK3R2cXNTMjdEUDJXTUk1QjdZUE5lZDZqRzBjVWNtUVF6REFGZGw4UkxtUFJQRUUrak55U1BtR094UFQ2VnlPcDI0YVB6b2JnTVlwUVFtZXhyanFOTm5vVWw3cDk2L3NGZUx0VXN6NGJ0dERsUDJpMnZJcElBTTh0akFIdU00K2dyMWYvZ3UxcEhpWFE1N3RmRktwOXVuazAvVUdFWjR4TEd5WTY4OHBpdm03L2duWjRya3NQaWo0Y3NKbk8ySFVvWlN6REtxQXc2MTlaZjhBQmVtNnMvaUY4VTdDUzF1MThxWHdmYjNDK1c0SUFpY3ZqQTlRVy9DdlVweXZoYk04ZXY4QTc0ZmxYOEJJQnJmeFV0TFJTY0Mza0xFOWdBZXRaWGpXTk5COGE2cnBkd21ITjR4SEhiZG4rdGFQd0V1NU5FK0tIMnFBQS92SklpUU0vS1h3Y2ZnYWQ4YmJXRzcrTVVqV3NmRndWTDRHUG1JNS9VVnh5a2xBOUJSdkk5eStIOXVzWGhLMDhxd0VZOGdOayttQitkWHZpSmVKalZyL0FFeEQ1Y2hoVkF4NkVSalA0WnB1blhTNkw0RzA5NU1Mc3RRTTRPVHgwck04VDY0ay9oNWlHQUV4RE1HK25OUG5iUkVxZG1YL0FJUjN0enFuaDU3QzZKVmhQczUrbVB4cWJ4UHBjZGw4VGJSZE9pNENoZUJ4MU5WZmh2cDk3cE9uelRPMlZZNzQvcDEvQ3VnMHNXdXErSTB2V2RTMEZzems1NUhYR2E2SVN0QXduRzdQQzQ5V2lzSTc5SC9nZGlmWG9hOUYvWm5hMjFYNEYrTy9EZHJLbjJpOHVZN2RFSXl4M3Nvd2VPaDlmV3ZPR3Q3VzQxN1ZiZVFBcXdSaU04QUhpdlMvMlI5SjAreCtDWGpyeFZCaDdtdzFpQ1ZlTWtKRTZOamp0Z1Z6VUdWaWIyT0QvYjk4T1RlRlBpOUg0ZWtoYU40Tk10Zys3UFB5QWQ2OGg4RlFhZkhyTnRkM1VxUnRHNFA3em8zSTUvOEFyVjlJZjhGTi9FSGgzeC80dzhNL0VQUTJSbDFEU1ZWd3BHV0l3Um4zNjE4MFBwNjNsa1RQOG0zRzArL1dzcXk1cmw0ZHFLdWV4L0ZmeFphK0lQQ1doYUZvbG9ZL051cExwNUF4S2w5cTVJOVFmVHQzcnluVzd4cjNXR2FaY00zeW5IR0Qvald6OEtvNVkvRkZscDh1cFBjeGVSSVlrYzUyTVIyOUt5ZkZscGNXdXYzTVR4YkdXWTl1bURYUFRqeW8zY25MVWsweWJUOU9GdzF6ZGVXVlFpQ1BibmNmODRxRFgwdWJCNExTNkozTkVzblBiY2VLaHY3dXptRU1naCtjQUxKbXJmaks5WFdOYVMraUg3dElZMENqdGdZclVTYjZHYkpJa2E3NG40clQwQ2Z5b3hNQmtCaVB6ckxFYU12UGZwbXRQUmJkNDRQbTVHN2dWaFZPdWkyUVhDK1ZjeVJTSjk0bkpGVUFQTDJ2ajVRL1RGYTk5dW1rZFlrTGJXNVlEcFZCSXdMaDF4MDVBcVZzTzdjaXVBV3Z0eWNaUEFOU2F0dVc0VlRrOGRLRmtqODNsVlVaNm1sdUpvZjdROHdIY0NNQnNWRWpTSmFpbVZkTU1jbytZRGppancrZ0dwck50Wm1YSktnVXJRbVMzOHlOTTQ1QXJRME96djdmVk5KdHJTSlM5L2Z4amtEZ0FqUDRWTWRDNmo5MDZYNHJhRHBmaGEvZlFMWFRqRThjTURUWi92dkdHYjlUWE5hTkpBNU1XUUJqNVJXcDhWZkh0eDQxOGEzOXpjV3dqTDNKT1FlQUZ3b0EvQVZqK0hZWW4xRlRJMk1IcitOUlYwamNlRzFsWkZmVkxaMXZoSUdJSG1ZUHRWZU1JSjN5Y2xYK1Z2VDJyZThZNlBKcHVvMnh0ekhNSlUzckVqNWNkT1dBN2Rhd1N1Ymp6WGpLNVBLMU1aWGdiVGhhWm96U3RPOE1xU1lZNEFCTkpxa3pSM1N3T25PTU8zMW9zcmRETXN5UmxrWEJWZmVwdGZXSnA0bmVRN2lCdXlPYWxOSmxjcjVTaEZiM0ZzSTRWR0R1eWhQZXBOWDFHL1VKcFJuWlpDT1kxNUFwZFJtZUlyQ0R5QUNPZWFrOEg2bDRlMEx4M3B2aUx4cHBzdW9hWERPR3ZiYUkvTklub0s2cVV6anJ3U1Z5RW5SdFZqSzYwSGp1NDEycmNMM0E5ZldxcG4yMkV0dkRMdlZlaFBBL0t0cjRzNjU4Ti9FUGplNzFiNFM2ZGQyZWxUZk9sdGVBYjR6M0FQcFhNaVVMWnNGZkc3cVBXcG1rNWw0ZS9KY3FUWHZ5NUdBVVBIdlY1cHZ0RUt6Umo1TnVOL29hcVcrbnE4aG5mN283Vll1SHVJSTQ3QzF3SW13UjdtcXNraFhaWWlGdG1CTGtmZU9HSXJNbFlKZVNvRDhnWWhmZXJ4aWt0V2puS2tpUHFQZXFkOHZtUDlvVlNDVDB4U1E5ME1zRks2ajhtY0U4Z1Y2UHBiUnI0WXY3NUFWbGlhMktPRzR4dTU0cnpXMGU0ZzFDTnBZOEFpdlNkSmltL3dDRmNhcExNaFZSNUF4anI4OWNsYjQ3blhnOUlTUnpGL3Vna1poTnVqZVRKeUtKdk1XelNSNGxZaHh0QjdDb3RVU1Y0dk5UbGQvUUduZVpMZDJvdDVBUVZIeWtMM3JDWjEwMmk4OWlURUoybEczR1dXcVYxY2szQ3lSakVRR05vNzFaUkd1SVJITkx0Q1FIR2FyWGNTSnBhZ2RUMy9HczZjZFRhcElmcHJzMm94VDJxbFNHR0FlOVdieTNrYWVXU0sxSkxTSGY3R3FIZzEybDE2RzF2NVFrSWt5N0hyaXRqVzcrM1RVYnkyczMyeGw4eHNQU3JrdVdlZ1JhbEF4N2hvc3BHZys0Mkd6NjExT2wzZHZIWm9OeWxRQVFLNUpybEpsazJ1bytZa2U1RmFZZTF2WWRQbDB4bVNhT01yZXJuak9SZzFjclNXcGpDWEs5RDFUNFBlTHRGMHp4RnJrV3F5S2tXcGVIWmJaUzUvaVBJL0d2SmRaaWUxSzdISjhzbENjNStncWFWdFRlNlkyNUs3VGduT00xbWFuZVBjUXRaUzhNcmdrK21NVmNkckV6M3ViZWdSUkRSYnJVR2t5dVFvUDFxcmZHVjRrbXNKaUFyY2tHcjhNdHZwbmdxS3lTTUY1NVFaT2Fqc0xhUHl3ZHdLY2ZMMkh2V2xKV01Lc1hNeUxtYS9TQ082RWpGaWNNeHJaOE1BWE5xNzZrd0NxZUFmVDEvbFZoOU9zNVBDMTFjcU56UTZpQm5CNkVWbXZxUXRBdDNESW9PMEtGYnBXam1ZS25jdnZyRVUrZnMrUXFZVlZJNmluK0hCTnFPcFQzbHlrVU1XbVcvd0JvZmVlWk9RTm85NnpiTjdtOWxFOXhNcDQ1UkJpdE9HOXNiUUdESWZlaEczUEo0NHFvUzFGVmkxQjNOajlyd2YycDhYUERmajJDZmVtdWVGN1JSSjI4eUg1RCtPTVY2RjRiMUxVL0QzdzB0UEZtazJ6a1J4T2hsVWNLeFVIR2UxY0orMVRwT21ENFVmREM0MHAvOU1tam5WRjNaWXA4bk9mVGVjVjdsNFQxZlF2RG43Tzgvd0FNWHRrbXU0eERMSXdBUHpOR0EyZXZRNXJwbEZ6U1I1bEdhaE04T3R2Rm1tK01idWEzMXlJQWtGbWNqclhHejNOcERxc2ttbnV5Ukk1Q01wNUlCcnB2K0VaU3kxdThuQ0ZVMkVyeGpyemo5YTVlNHQ3U3hsazh4UGtaajh3NzFFV3Flak95Y1pWSGRGN1R2RTEwbXF3N05Rd1ZJdzNwWGVRNnZmWHdXUVhpU2s0eWNkSzh6aHRyR1ZSY1FnNXlNQVpyVHNieTd0a0N3U3R6MXdUU2xKTmx3Y282TTlDZlNyK1dIN1RIWmJoM0tqazFRZ25paHVqRmMyVTBSM1lFaEhBOS93QmFvMm5qcldkS3NZckZwTS9OeXg3Q3JsejR3ZTVnYUtZREd6Zy80Vm5kbXRyblEza2RqYitUY0NhV1BjZ0JZcmtrVnpYaTI4a3NwaTFoSVpReVpKSEl6WGFXM2g4WEhnNjJ1aHJrZHlKMExJbTNKalBwWG0xa1BFTnRxMHh1MDgxUE1JWGQ2WnFiWE5PWlJWalgrMlR6Mk5xWjdmSUkrWUVWekh4aThKMk5nSU5WMGwxQWxYNWtCNkhGZG5yL0FJaS9zL1JJTGk0MFoxajZlWXVOdi8xcXg1WWRFK0lXblBieDZna2R5aWt3N213TTRIYXNuSFV0T3h6SGdpZTZGdjVkMUl1MUI4Z1BPVFd1WlpiYTdCZUhjazdlV1FvNkU5S3dKTkE4VStHcGlMaXlkbFRPWkUrNytGUHRmSGNXblF4UlhNZVpGdnhMeXY4QUNCLzllcml0QWxMUXVXTFN4M3kyS09GRFNGWldic00xME5yQmQ2MmZzS3FRb2wyUWxCeXc5ZnBYTVcycDIrcFhBbTNoUkpKbHNIMU5kL29lajYydGdtdGFYYm5FQ2p5d085T081S1doaGVKUER1bzZMcXFKcUs3MVFEYTIzdFZld2xqdWRUMnhuN280VWRqWFFUYTYvaWl3dWJIVlVDM01RYmFTT29yaUxLUzcwelZCTy9DNzhIanJ6VGIxS2dsWTlJUzJVYU8rbnMvek1uemNaSXpYbjE5ZDNWdFBKcFV5bjVTUmsrbGQ3cHVwV0xhYkxmeVpNMGliWXh4anRYTTMrbStiSStwM1NBNE9TQmpwUW1OYmxUUU5OUzJpa2xlTTdYR01uMHJTazBJWGNsdEZFRkRqZ0tmVDFxU01PbWtSM2EyMnlBdmpKNjFMWWVYTTR1WUp1RmJPUWVncGlrZEZhYXhxWGgzVDJzaHRBZkFPL24wNmZoVnpWYitXZUZXZ1pkbmxEZW81NS96bXNueENZN3ZSMWtEOGtEYVY3MURGZDNkdHA4VVVrZVJqSFBwU1VyTUVrMGJzOXVYbGlNWks1dHd3OXNWdzNqdnhCYitHcDVKYlo5dDFPU01aUFBJNStuV3ZUYjIwZ2k4RzJ1bytZUFBsQUNnbnQ2VjVKNDEwQ1NEV1lkVGlpKzF6UlNnckU0K1U4OS94elhRbGRIRlVkcDZIWS9DcThmV3ZDaGU3dHdqRXNHZkdCMHJoOWRWTkI4Y1hLQ1BkRzNKUTgrOWRuNGMxeTd0OUFWZkpqamxkejV2bGdBQW4yOU1acmk3KzN1N3Z4VmMzc256a1JzWERmaldGL2VzZFBKN2lacDNGcWwzYndYRnNwN1o5dUs5QU15YVZxbWxwS3U1eGJBRFBxUWU5Y3RwZWx6LzhJZFlhdVVRTGNYRElGREF0a2Q2N0R4UGFRTGJXZCtyZ3lJRkFiQnllS2JWb3NVWDc2TVhVN1RVSWRjdXI2eURrUmpmSVZPTm96bXVHOFNlSXJpNDhWd083N3QwVzEyUGF2by80QitCclR4ZjRWOFlhOWViU2tGdUYzdC9EaFdZay9sWHl6YzI4bC80cGtleWs4eUtPNFlBNXp3R3huMzYxMDBvdU5CTTVhMGxMRlNTT3d0cElrMDJJeWZLeFl0aGg3MXlmaXUrbHVOWGhpamoyNzNHR3JvdkZrb3Nwck10R1JHeWdNUU9QL3dCZFZ0UzBDUzgreWFqYnhaRWNnSk9PY2NZK2xXbVJVT3I4T2FLazFqUExFZjNzTUsveGRSM0FyMC85ajZ4VFVQaXRESGY0WVF4TXlaNTIvU3ZJdEI4UVNhUnFubU5rTElQTEM1NEk3ZjU5cTlWL1plbnU3ZjRsQzdzY1psaVlISUI0UFN1bWg4UngxdmdiUEd2MnVaSmYrRS92YnA3RXdSemFsUDhBWlZWTUJsRFlMZm5YcGY3SVdtcjRyOEhYM2s0SnRMUjN5LzhBRGhRYXkvMjFOSHNyait4R05wNVZ6Q3MwVndyS1JrN2ljL2pYVC9zc3lXbnc5K0VIaVhWbWtWSkpMU1dPRXNPb3dBS2MzeXlaalpja1R3ajRoYW5CNGcrSjE3SkR3V2t3QjZlMVU3N1RvMWE1aWpUbzY3c0hwZ1ZaMDdTUnFmajJTU05jRXpFc0Qxem5OV0pvcEo3N1VvMFRJanVOdTd0NmMxeFNsN3g2VkdLNWRUNmwvd0NDYW1tYURlL0ZIVEJxbnl4eE9wRWlnL0ljakdmenIwdi9BSUxBMytwZUhmaXhvNTB2V21udEpOQk1hcUczYkZQM2grUjYrOWVHL3NyK0w0L2hkWnQ0aGxrdy9Cd1RnZ0t1ZjVnVkwrMFQ4VTlRK1BGcHBsN1BPMHNrY004WTU1eGs0cnZqVmo5WDVUeXExQ1gxdm42SGhQd0xzZEt2dkhMSk1tMW9mTmt6ak9Ea2Z5TlRlTFBDZXAzZnhJT3VUS0dVUzhBRG9BM0grZmFxSHd2ay9zUHhIcU44cEs3QVVCQnhra211MTBGSnZFMnBDV0c2WC9XZ0VkOGtpdVZTdm9kcWkwcm5aYWswbDE0T2l0cnhBbTFCdEM5UFhuOWE1ZHRWc2I1VTB1NGt3QUF1N0o5Y1ovV3ZVUGl4OE83cnczNGN0cllveERRSzJkdUNjaXZCOWJGM3BjOGR5M1JYQkNucngvOEFxcloyUkthbWoyMjIwdWJRL0NVZDFjRjQxU0E3WEs5QndlYTUvd0NGV3FRMmw1ZlRTVG1RM0JLNzNZOU93K2xkNThQdkVHbmZGSDRZM05wNUhFTnNVZFQzT3dkUHlyeXI0Zlc4Q1h0MloyWkVnbGNLVDA2KzlVbWMxcnV4NXZwa1dvVGVMNXlNcWx6YUVBSEgzdTFlNi9zQWVGN21YNGYrTDdQVkFHaHY3cDRkakhLbmJHUWMrbk9PZmV2SmRmc24wS1dKNDBKbENSRUZlVHptdmFQK0NmM2gzWC9GT3ArSWRHdGRSbFI3YlcxZUcwMkVpVlhUa0hIYnArT0ttbHNUaUQ1OStPMCttNjFxWThPNk5jU0J0S3VIak1jaEpBNUFPMC9yN1Y1dHJWeE5GcDBjQ0hvMkhJOXE5ZS9hSitIMTE0UCtJK3Y3clpvVk9wenFxTjk5R0hKVTgrdGVSYTNaM0VtbkpJNCsvSVN2djlhVWxxS244QmI4RmE2K2thOVlYWUpHR0F5VGpJSkZkSDhWRXNFOFkzcldyb2Q2aHdxanVRT09hNFB3dlllSmRkMWdXT2xXaGQ3ZU15YlF2UURxYTJVbnV0UmlsRjZEOW9Ua3V3UFQwL1NzMmtqcGcxWXE3U1hBZGVBZUI2R3JMcTAxaVd5QXdLNStsVjUzaWV6TU9OckRrbkhGUHM1Y3crWXplM0o2ZEtScEZLNGx3R2lLeGhPUFVpdG5TbllXaU1DQW9LL2VyTWlJbVlxM3pFZEswOVBnOCtGSVJ3V1liZU8rZTlZMUdqZW51YjJqZUUwMWZ3UHJQaUMxdXR0enAxNkROYm5xOEJIWDhEWEoyRmliNDNrOE42RWVDQXZHcHgrOHIxbWJSL0FQZzYxWHd0cFhpdHRTMWk5czFUVkZnanpCRHV3QW03dXc3OGNaOWE4aHZOS3ZmRDk1ZVdzc3VQSXVtaFlCdVJ4a2ZwVkpLeHozbHpHVzZNU2tqazdtYm5IYzA1YmlPSzdVelJGMERqZEdHd1dHZWdQYXBwQ3dYR3dFVlhzMGVYVUVlNWl6aHNrQVZtMHJHMGIzT20wKzhzSjdobnQ3VjdXRjVCOW5nZjhBZU1SeHhtdTE4SStGYmpUdkgyZzZqcVVSV0pESTZoMUl3ZGpFZlN2UHpJK210SGZJM0MzQVplcHhpdmNmRUh4UXR2SC9BTUZrMXVYUVVzcm0wWmxXZmRrdS9sN1NSN1ovbldGN1NOcHUwYk04UzFFUjN0Lzl2aWNZa1ovbUhmNWpUOUJDdzMrR2JIemN0K05RMlZvc05pcU0zS0g1UVQ2ODFQYkV4U2JnT3A1cWFyWExZMXcyalIwZWw2aGRhUHFzbHhZVzhMQzdoOGlacElRNTJIcnRKKzcrRmNycUxKL2FNeUtwQ3JLUU05Z08xZE5heEdScmFST0NEMHp6aXNIV1VYKzFaWFFLVk1oemoxcm1wemIwTzJ0VFVYYzI5QXRiUzQwVi9PWUJ3NEVaUFdxL2l5emh0N3BHQ2dEZ1o5NmswbG0reWlCK056REI2YlRUZFdnamFSWFlsdHI4anJXZk0vYUhSS0s5aWMvcVR2ZXlrU3FVWlJoTVZtYUxya2VsYW02Nm9DOGJLVklLNVA0VnZlSTVvNDVWbFZlb3g3LzU0cmxDVm52MzNya2grTWl2U3BmQWVSWHU1SkcxYldsdk9IZXdnS3BJVHl3NUFxamZRbXlDeHhxZmtQelpyWDBNU0xJc1lIQkhKSXFuNGhpZExtUlFuVEJQdFdVWnVWUTJjZVNsb1ZZMVo3RnBaT0d6a0FDalVabEppbVJpb0NqMXpWcU9JL1lSdFRobDV5S3FhbkZFTlBqbENFdUgya1pyVnRzemFYS2JPbE5GUGJGVTJ0TExqSHFQL3JWVzFUUmJoWFVTUmxXVVp6amlwTkVpa0Z0RmRvZGpyajVXL091eThjVDZkTDRmdHJ1MXRBc3JXMkpCdHhrMDA0cFdaazRTZXFQTzVMZnpMdEdRNUNkZmF2UTdPV1dmNFU2a2tvR1Z1TGNBZ2NubXVFMDZHS09Jeno3aUdiQlVIMXJ1ZEZ0WVpmaHRxa1Nua3pRT29KNXdEWEZWYmNybnBZWGxWTnJ1Y1ZxREZDWkZiQkRaeDZIL0FDSzFOSDF6VGJlMW5zSmRJVnJpYU5URmNNMzNQV3MyNmpFMTA0WlNNRWdIRldBb2lpWlZqTzVVMmppczVMbU40cmxaUHExMUZIYnJKakRGZWNkK0tyeVFSTFpDNCswcVEzVldQU25Oc3VyVVdyTC9BQThzZldvV3NwV2lodDVaRkozbkNaN1VRaHlseW1wYkZXMFZqY0R5anV5Yy9LYXY2eHBNMFZ5c3NzeXI1a1dTRFJIcEJTVHo0V0NGRDl3ZGVLdDYwa2x6SUpXSU95RGdaNlpGRDFrVXZoT1NzZzhXcE1MdFdLRmp0SUh2MXJvYkpyZTN0eTlxNElZZzRCeldJc01rcnE4YjdzbkI5dWExN0xUNW9iWm51TGVURW94R1NNZlhyMXJTZE55MU9lRW93ZXByNm8yemE4U2xRVkdXQTcrbFpsL2F3TXNkMFNBei9LeUVjNXJmdmJhMnRkS3RaYk9mZW9PR1ZoazV4L2lUV0dEZVh0NnRqc1VHU1FqQkdBdk9hemk3U3NhMVZkWExNTVVkN1lRMjg4Mk1OL0QycVdTZURTLzNGc1M2bGZtYzlxUENyd1d1cXg2VGVxdmx0TXdMTi9DY2dacVh4em85eDRVMTFiVFVpTmhVTWg3TXA2Zld1bUZySEc3a3RqNGswMjI4TVhlbCtYODl6Y0I4WTZZckdJamtSaUloSUFjODloV1FyWFkxQmhFTW83WlFZNElOYXNWdmNSVzRiemRnSkc0a2RLYmpkaEYyZXBadGxnaGlGdzJFR09WSnh4VGZEY1ZycVhpZGN0bU5nUVYzRVo3ZjRWUnU0WTNjUlEzUmxYSFVkcTFmaG5wbDljZkVEUzdTenRETTAxMmk3UWVvTERuanRWd2paNm1HSm1wUlowMzdVZW5wcFh4cjBYd2Y0ZnVHdXJMd3Q0UnNYZEFjaEpIVVNTWjVJemxsSDVWNkg4RVV2Nzd3MXFQaTd4Rk0wVnNrYkNQZm45NWowOVJ6aXFmN1Ezd1h2ckQ0c2VPdkZaTFJodkROcGRXOFNyMEJWRmNFRC9kN1pyVytGK3N5ZUl2Z2ZkK0c1NEdhZU53MWxoZVNwMm5wNis1TmRrWkhpcU9welhpaldMQzU4UFNEK3l4RTRrSVNVZHdUL2hYbldzYU5jMmVvQ0dXZU9SWkZETDlLOUQ4V1hOcC9aQ2FiTkVJNVZ3cnFWQXg3L3JYQ2E5cGlYV3ZuN0hjY2lOUU1FbkZZVmJObnJVVzFFVFJ0T3VOUHV6Y20xV1NCaHlwSFNwZkpTNDFIZEJINVNFOEFMVERwV3VXVUJrWFVHQzlTUGFwTkpsdUpDRWx2UG16d3dIV3NEZE5HaExvMGJ3L3ZXT1FPQ2UxUXpXRjRSRU1IWmpod01acXRyZXBhNVpTQ0x6c3JnWk9LdStHZFl1THhibUM2Q0JGanloYnRUMUI3blplQzcwUjJYMmU2dWhGRmJ4TS96SHJnZEs1SnRlbDFDM1c5aHROb2t1V1hlZVFmZXJkak45bzArUnhMa0ZTQ005UHlyTXMxdTdQUmswN3lHWlVtWmljSHVhdU9oTlJiSFdUem8vaGVLeHZHQkVpNGZjQjM1L3cvS3NCUGdENG9Qd1c4Ui9Idnd2cWdOcDRlMW1PeXU3VUVsZ0hVRU5uMDZjVk45dmE2dFZpSnpnREgreWF2ZUdmaWo0bDhFK0N2Rkh3dXQ1SXBOSzhTWFVVMm9JeVpmY2d3TUh0d2VmcFN3emh6UG5OY1RHcEtFZlo3bksvRHY0a3k2aEVkTTFOVmtJeXBaeCtHY210bldmQmZoRHhGYnkzS3pKRzJUaGdRT2ZyWEhhWjRWdHJmVnBKOU1sSVJpU0l6eml0R0dlNHRVWXp5WWJjZUNlbGM5U2FqT3lOYWRPVGg3NW1hcjRSazBTWlBzZC9sTWpHMzE3VjZmOE9QRk9xNlZwYTZiZm9IaWFQQWt4a2pwWG03WHB2SUNvWXRzZmc4MTEvZ2pWZkxnMlhLNVRHT1I3VnJUbGN5bWt0aG5pKzdoL3RHZTcwNXdyTmtFaXNlNDBlN3V0UFM3VGMrRGtoUlZ2WC9BQTgrcEc1dkxHOUNFRWxZeWFaNEgxclZMRXRiWE51SmxEWUpQMXB5M0hHV2hwVHl1M2d6em9wTnJRa2JnRDFBNC9DbFIwdjlIUVNTZmVRZFBXbDFhMGp2dFB6RElJaE00RFJqcDIvd3FMVExZYWZjdll5dnhFM3lrOFZFM1pHdFBWbTFQRzdlRGxzMWkza2ZLTUQ3byt0WmVsMjBlbTJjak96RVNSbjg2MnJFM0VWM0VxSDkwVUJDNXpuL0FEaXFuaVd6ZXh0MnU3Y1pReVlKOUswaDhOek9wYm1KR2ozNlFqNzhsU01vZTJhdWdlZllLaGpBSlVjVm1TeXpTV2NVa0lKekltUU9CaXRXMnRwYjd4WC9BR1RFNFNNSXBKOUQ2MW0xNzRSMVJjMTBhbEI0V1c3UXVSYnVBRDBDL3dDZXRjcEJjcGZ1dDBXM1BqRC9BRnIwMjVOaC93QUlIZWVIaWhlUldJODNIREQxcnlhM011bjZrOE53UWlZUEdLNmVibGljZkk1VkRwdkNHbExxZWx5cUcvNWJmZUI2R3VXMWUzR2srTERwbHdNZmFFd0hBNlp4WGNlQU5QdmRQOE92Y1NzVkU4MlF2dFhOL0dDMFMydTdIVklBTjBVMk9jODFqQjZzNjU3SkdvTktleWloczR5MnlPTXZzeWVEaXQzUW9VMUxSSHVabmFWbEh5cU8yTVZrYVA0cHRkZmlFSmgydVlkcEpBd09LN0N6OFAzZWkrRVlidXpRc3N4S25qdVIzcU9kdHN0d2lyR2wrelA0M3V0RGgxN3d0cTBZR2xhaGVSZmJNOVNnM1pYT2M4OEN2REJwbG5hZU5iOFdVZmx4U2FnL2xvdWVGTG5BSDZWNnI0RXRiMjA4S2ExZEJjU0dUSzRJQnlBVFhsVVY0OEhpRlo3b1piemkvVHZuUDh5YTdJVmVhZ2p6NTBXc1RKbTU0a3Nia2FKYlNhalloUXQyOEFZSDc3SWYwN1ZmOEovWnIyeWtndmlpSHk5c2FucWY4bmpOYzFyR3V0ZGVINWIrOGxmRFRTT0ZEZmRiSXlSWFJmRGZ3U2JUVHJmeEhkZUlJTGtYRUlhM2pTVE96UEFCR2V1UjByU0R1WlZMcDJaamVNdEV2YlA3SlBBZmtnZmJNeThZYlA4QWhYcHY3TCtzUXhlTXJkcEpCbHBFWGRnbjAvcmpqNjFyYUw4RzlROGMvQ1hYL0hPbHdtVzAweStFYzdEbmFXVTQ1cmp2ZzRwOE1lTTdjdU5xdzNBTE0yY0g1Z1A2VnZTYlUwY2xkcDAyanFQMjVwZE44Uy9FbVd5MDRxR3RZTjVVQURjdzZuajJPS3JlRGJXMzFENGF3NkxaekJUSzhhemRnZmxGYzUrMlhMY1NmRU9IeEhZU041ZHdoRHNwT0QxcnJ2Q1duU3cvRDRYOXNnQ0trWElHQ3hJeHdmd3hWVm5lVE1WRnFuRThSdjdLNDBUNGkzRnZiTnQvZUhERDYxMEdrYWJOYTZCZDZsS2l0SGNYUUVwUEo2OWMxaytKZFVTWHg1SkU5c3hjUGdsVDc0cnJMKzN0WTlDSmRIU1U0WlVEZkxuanRYRzA3bnBRdnlsRFQ5WnVya3RwZHZJeWdJUng2NHhYY2ZEZXh2ZEIxblJOUGZUVXZKYiszdUk0a2tiaFM2a0I4OWd1ZDFlVitIOVVOdjRubWdNWlpYa0NLUjI5Szl3aTh5MzhUNk9SSjVUMmVtTzZ1aCs2eFd0STNzUk5YZGp3blY5TXZQQ3VwYTVwOTNEaWFPL2NIQjVQSndhNlQ0RHdQYytJMlhjYzcxWkZKOVNEL1NzM3haY2lQeFJmUVgwMjR5ekVzN0RjVHoxL25YUy9CNnlnZzFSYml3QlpNamNUK0ZDM0hMU216NlMrTy9pblF0UXVyYndjenI5cXR0TlNWZ1R4akEvejc1cjVvMTdTWmRXOFIzRm8wWUVjZTRKeFhhL0VMWHBiN3hyZitNSHU4TVk0N1NPSU1PTUwvS3NHWkpyZUY5VGFNNUlKT1IySXozclRtT2FqQ3liTzMvWmhSdE12ZFEwUmtLd3ZFZHpFY0RqSGV1VzhXMk5scHN0OVk2R1NDbHc3U25IT005UGYvd0N0Vzc4RGRkZDdxY3dFSGVEdVlkc1ZYMWpUMnRmRUdxUzNVSkNPT1BjazlhM2pIM0RHV2xSbm1OLzRtMHhKTDZYVXNBcnBVY2tTa2YzUmpIZjFyMDcvQUlKKy90RzJuaEQ0ajNQa1FMSkxkdUpYZ2RSMEpVY24yR2Vlb0lCcng3NG02WmFmMmRwejZlT1piRHk1c1o5ZWxhdjdIWGdTOWorSU9xNjZnSVRUN2ZHUjJKYmQvTE5aVVdQRXdUUjZSKzNjMDNpUDRzZUtQR05oQ0k5T3ZOVmd1SWtCQjVlRlFlZmNpdm1qWExTM2U0aGgrMUlrSWZKYlBBOS8xcnN2anQ4YjlWOFMzTjc0WWVNcUJka1N1d3prb2NBZmxYbGR4Y2FlOWlHRWp0YzV6eTJSV2RTV3BOS0Q1VDBid3Y0amowYnhuQjQwME8wc1JhMkZ1RnZVdDR1SGpJd2M1NEpPZjByclBnRnBId2g4ZmVJL0VVM2pYVVVzWTVMQ1o3QXNRQnZKSkFIdjAvT3ViK0IraldYaUg0VmVObm1VQ2FIVG96RjdjMXh0cnA4OW5aaDQySTM5Z2V2Rlo2MUZaRzBJMmtVdGJ0SWRPMUtheHNnSmtXVmxXUlR4alBINTlhcnhSU3F2bG9jS090U3krWWwzNUQvbWFmRkY1Vndkd3lNZEt0S3lOa2xmUVZJYnEwUVR4SnVKOU8zMXEyTHE0aHR4TGdvd3dUdFBRK3RPaEwvMmM5ekhEdWFNazdLcVdQaURUL0VHbXltQzBlQ1dKc09yanFmVUh2V01sZVJjWFkwYlc4bWE2V1Mzbkl1SjVBV2tIM3R4STV6K0ZaMnRxTFRWYnVDYVpwSmx1Rjh3dVNkM0hKL09wTEc2TnJmMjgyM2xaRmJQNDBhOFYxSFhkU3Yxd0dsWld5ZTFXOUVLeTVpbzZSUEh2T1FSamlpeHZvN2U3OHcyNm5CL2lHYVVzRlRiM0ZPRnVaUVFDcWs4ZzRyTzEwVjZHcHJPcXlhcm8zMkw3RkJHQVFReUpnOGRPYTdIWDdtWHd0OERkTDAxbURMYzNKRWhHTzZacmt2RG5oZWZWcFpJak1zY1ZyWk5jVHlTc09BUDhhWHhQNHF1UEUvaG15OE9SbFQ5am5EYjhEQkcwQWZ6NjFueXEraE1tNzJLK25SSmR5UmJtNHhuQS9PdEM2dGhieUt5SUNEN1ZXOE1XY3pMR0crOHFZSlA4cTE5UnRjU1I3M0FPNzg2NWEwbHoyUFN3MEdvcGxyN002eFJTSytNRDdvTmN0TXEzR3FUR2FYYXFObkg0MTJKdUkwWkkwVUFoTTRGY2RjU0E2MUs3SU1OSjByQ2s5V2RXSlNzamRzSkRKWTdkbUNvQkRZcDB5YmJmTEVBSEdjL3pwK253UnRwN1AwRzNnZHhWYlZGVmRHVXBJUzd2akhYRlE3ODVzM2FtWUhpb1RRM1NxekEvS0N1T2xZRnVrWTFBazUrWnVUajNyWTF5UjFtOG1RSDVSM05OMDIyakZsNXFLQ1puSUJ4a2l2UmcycVo1TlJYcW1ocDhadEp3cGxERmx6eDlLcWErN0M0ZVJCMUczRmFGdEFnWlZKd1ZUcm1xdDRpTmM3djlyOCthd2g4WjAxRmVuWVZJdGxqR0hUSEhURlplcFRtRlhWSDJnOXNkSzZLNGhRV3FYQ2dZUWNqMHJuTlhqYTlMb0k5akx6a2ppdDFLN01KTDNTZlNZNW8yaFpwdDVjamdIcFhYNjNmTGM2TEZhM0VmQVVBZmx4WEg2SXNzTVNCbTNZNm5PYTZyWHZMaThQUTNXUTd5RTVYMHhYUFZtL2FXT3ZEMDA2RGJNeTMwcTJGbjVxM0FMSU1sQjI2ZWxhMmlhcXNmaHkvczBJSVpFWnZiQnJrdjdUa1c0M2htQmNZZnJXLzRMWkxxMXU0NWNCUElPQVQxRkthZGpPbHBJcTNCczBkdFJsUHlyTHluY2lraXVwYnUrYVpMTXBHOFEyYmgxcWFTemlsa0FjNFJtR2M5dmV0THhEYlFhWG8wV3BRQlNJM0hHT1NwL3ovQURwVTFlUnRWbTBqSEN5cmNBVFJLb1k4RURwVm5WclN4alNLNVNNaHM0TEtmdkNxU2E4dC9jb0ZzL0pRREJIVTQ0Lyt2VmpVRThtSkNicFpJMmNlU0EzUVlIK05iVGhZem96NW5xSXQ2dHV6TGJ3N25ZZjZ4dTFHcEpiM002Qnd5TTBRRGtIZzBzaUJiVnBvRXl6U2pHVjZEMW8xTlpsYTFlVzJNYXl4YmdUL0FCRE5jMW5jN0w2RkRURnR0THZFdjVwQXl3VDdpb0hYOEs3YTYrTFhoRzkrRTlyOE9wdkJtN1ViZlVaTGthdkd3R0ViSHlFRGs0K3RjSFB1TjJIamd5ak1DQlV6YUs5bk9Ma1JrYnVjanQzcmVNa2xxYzBxZk5MUTE0YjJhTzFVK1VjQWpESGpIdHhWWTI4NjZpTHlSeUdQekFBOUQ3VmFzQ0Jva3FiOXpCd1ZVOVJUYjE1WGVONDhEQTZEdFhNMWVSMXZTbnFVcmszWnZBa2NaRFI1UEhVOS93Q3Y2VjJYaVRTcGZpTDhNRTFxTnQrcWFFQXM2QTh2Ym5HRCtGY3dyM0Vlb0Zwd2pJMFdPQmp0V2g0SThjLzhJdjRvUDlvU2VYWlRLWTd4R0gzbzIrVThldzVycXBSUFBxelNPTnR6TGF4dEs0QjhtUVlCUFk5NmZlNnZjWE1IbFJnaFQxR2V0YkhqZlJuOEkrSWJyU0VpTGlZankySUpEUkg1a2JQZklQNlZsV050REpNV25BVkUvWEgxcm81YkhKN1M1TGFLMXZiUmtwdzMzdDFkUjhKTDJmVHZpSHA5NmtqUlNSM0tzbkhLOGpwNzFrV1dtM2Q5cDgrb1BFQmJ3emlNa1krVmlNaWtTLzFDSFVZYnczUkVrVHJzWk9PaC93RHJWYWd6T2N1YUxQZS8yZy9IM2lQVlBpZForR3JlNWhObWZBTHk2d1ZWY3lJMGgySjJJK2NxZlhyNlZOOEM3V1BTQThtcXliUExnd296d3ZmOFJ6WG5meEV1TmJUNHhYYjNTdVJQNE5zR1FIUHpSbVNNbkE3aklOZFA0ajhRSFJyZ1IyY3BpYWEyVm1MWUdEV3FTUE5hYTBOZjRnV25oN1g5WG1oajJxUVcvZUJzWlBZVjVuNGkrSDJzV2NqYWxwTXU5VlBUbko5K2EwWnpkN0RxMGVvYmxPYzRicDNxaE40cTE0ekdNM0xORVc5T3ZQUFA5S0hHTE5ZMUtrVVVqZTZ2WjJRVy93Qk5EcUI4Mkc1NjFXMHhmdFdwR2NEN01xSEpFbmZtdlEvaVY0YTBRVzJtMzJsREVkMVlxeFpmWEJ6K3RjVkJwYnBhYlVHN1puNXMxbk9ta2RlSHJPZTR6eEZlcGUyVyszdDFZY0FFSDg2ek5QdlFrUmhkV1VzQ0dPTUNxZXRhZnFsck0zMlF1RjNkUm1wdEZ0dkVreXM2YVc4eUlNa2daTlkyc2p0alVqZlV2ZUhaSjROU0ZxczdHTXZ1WUFjWTdWcEk5M0plT1JPUXJOOHErbk5RL3dCcDIyajZmRFBjYVU4Y3NoNXluYXRIU0hzcis3dDUySlZHWmQ0SFVDcDVnZHBNeGRST3NhUk96SGNxc2NoeU9LV1daRzA2S1dSTjBqY3NTT3RiL3dBUTdzUStJMjBmVENyMjNscmhtWGtaeG5tc05ZMVpwT2pDTWNMNmUxUmEreHZDZGxxVFEzTmhwaVJ6d3NxbnAwNUhTcXVwYXJiYXRNYk1XeXJrY1NEajhhYTJvV3p3bEpkTXp4d1RWSzNrMmI3Z1JnS0RnREhhcytSTjNaVHFPV2lHMnRpMm0zdTVTSkZKNFFpdHkzMU5WYUt3Z3R2TExISk5aRUxtTzdCS0hKd1Q3VjBHbFFXbDdxa1V4WUR5MStZMXBCV2taeVZrTThRR2F4dFNWaVplT3VNVmtlRmRYZXhuZWFiNXN0a1o3MTFQaU9DNnZUdHM1VmtpL2lIb09POVpMK0hZa1MxZUJRUTAvd0E5WE9TUkVJeVowQ2FRbXN1WncyMVlVQjJBOVNPZjVWVzArZUR4RkhMREZIaDBVODR4emdjVnErRWJnM09wM052RTY3VXRwV2MvM2NLUUt4UGg0b3Rta25EYml6OXo2R3N2aU40cHBuVmFzZEZzNUxDT3h1bkwvd0Jud2k3REpnTE4zQU5SSmJSNm8xelkzVndtRjR5RDY5S0hqVzYxSlZ1a3p5TXQySEZPdXRNRVltdmJZNVZzbml0NEt5c2M4M3FZNHViVFRKMTA2UnR4VmdBd0hHY2pyV2pHR2g4VW9yWFNPODhRSkM5dmFzZTBFV3AzVFNGZ2ZLYm1tUVhFMGZqQ0NjRWxSOHZCNE5aeWFUdWRGS0RjRDAyOWpTSFMyaEkvNVo4RWRUeC85YXZOUEV0akpOY3M0SUEzWkcwZjRWNkhlVDNFOXVrdHFvWTRLeUFqdFdCWTI4VnhmbHJ5MkEybkl5T000cXI4eU1YSGxsWTZQd09zT3NmRDF0T0tDT1cyY1pmR01nWXJ6N3h4SjlwOFZKcFU3YjBpVTlSa1pyMlB4WjRYdFBBbncwMG54UnBRM0pmUXMxMEJ5TjNiK1ZlR2VJcm43UjRqT3JOSUFza0c3Qi93b2pHeUZKcHpSYThLV2oyM2lKTGFKTTdtSUE5anhYdkt6Q0x3WHA5aGRJcXZKcUFVS2NEMTYxNC84TDlNdHJ5NnV0WXZKTVBIQVRCOWZ6K2xkN3Flb1gwOEdtR1luQ1RCaXE4YzRGRVlxelpjbjc2UlUxQmRRMHhkVHRiZVRiSDVtV1ZjWVA4QWtWNUNGaXV2RVBrN2RyS1h5MytmclhyT3E2emFYVXVvUm1ZRjJmNVYvVHZYbHVvV2t1bWExTmVTZ0ZuSkNxdllFOWFWTjJwMkhYUzlzMlMzUGhzM1BnUWxVT0drZkwvbldKNFQwWFV0RjFPSXdYc2doMjVLQnVyQThBRDYvd0E2N3czVU5yOEk1NzZkT0lwOWdHUFUxamFMcE54ck5zazlxeFFrQnkzVGIxcTZkUnhaaFVwS1VUcnZnaDhldkczZ1BUZkVuZ2lDNkw2VnJvQXZyZHhuNWxKd3c5OEhxS1NDNXM3M1VqY3dJVXd4WXFGSkp4Zzl1YTVleTAyWFE3S1dXYUxMdTVPYTZyNEsrS29kRjhZalU3cUtPUUxFNEt5S0NNRUhzYTlDRHVqeXF0UFZsWHg5ck9rL0ZUUXhiUXpBVFFBYldrSXlTQjB4MTZrL2w3VjJIaEx4SERxM2cxdkNkakdvK3pOYm1SemprS29EZnFhd3ZqYjhEYjdYSFB4QytHRjB0bkMrMDNTT1cyT1NSOHc5TWsrbGVhYVA4Ui9HUHdyMUZ4ckdrQzVqZUFpU1Mwa0RBZzU1eDNweXZlNWdwcmxVZXgxYStEYmk3OGFyREpibkx0dVdaZ0IzengyUEJINTFjOFU2VmZSeDNkckNkMFZzaFJaQUIwL0QvUEZKOFB2anY0WDEyeHZtRWJMZHFyR09LUkFzaTRIYlBCK2dQYXJIZ0x4NzRmOEFGRDMybHozRVJrbFIyVnBXSDN1UitmMDQ1TlR5RzBjUTcyYU9NOEphWThXcFEzVnpGay9hODg5VGl2WGRRdXBKdFRYVVRrZVhZbk9GKzd4M3JoMHMxZzhWMldoUlJxWkpXOHdxTUR2NmR2cFhxcmVFcGY4QWhFZFNtZHcwdjJOaEN3WE9lL0g0ZHFtMWtiS2NibmlLMjFyZDZ6ZDNkd29ZTUdQempQYzlLNnY0S1RSTkl4VTRPOGpCNDdpdVgwZURkWXoza3JiVGI1VWx6anQvbjg2NlA0VVJSV3ptV0Z0eVBLZDJPbzVHUDUwa3RSMVg3Z3ZqWStmNHF1cmJ6TVlsV1VmTmdDdXU4ZTZQYTZQNFJzdHpLWjVySHpKbEhYMk5jNTR3MEdTRFhWMUdjNDgwZ0ZUd2NkLzVWWjhZNml6ZUhXdUhtTE9zSVdOU2VRQVA4UldsckdOSjNRbjdOVnZxTXZpQzlhR2JNY09TVUo5NjZ6eE5LSllMalUzZGQzbkZDbzZEcnhYTy9zZ3p6WHV0YWhBSS9uTEV2SnQveCtwclkxeUFMcU9vYWZOSmpiY0VvQ2ZyL244YTZvcjkyY3MzKytaNUY0Z25zN3J3N2JSdXVTbnlnOXdjNS93cjBEOWlxZTU4UXllT0pqYUtHRWUxQW96MFJoeitWZWY2bHBqV3VqUTNqdDhqU093NTZBRG12WmYrQ2NPbGFINGlrOFQyaHUxaHVwVUxCYy9mVTQ3ZGVQNjF6NGJjMHhidEUrWXZpdGFXdXFlTWRUdTRJaGw1bGQ4Y0JTUUNmMXpYQ1Myd0VwUTVCSnhrbnZYcGZ4aXRwUERYaS9XN1NLMkh5M0x3QUVINWRyRUhyMnh6WG5kN0ZKSWtWeEtoQUw0T1BXc3F1azJGSjNnZWxmQlZyM1JQaDE0d2VIbFRieEk1eU9oTll1bGxyN1RqR2NBeFBrOGRlbGRCOENieGRSOExlSzlFWmcwa3Rncm92Y2xUMkZjdHBGdzhKbHQxaUkzWkRjVk5OV3VhcjRpanFkdHRrK1Zzc3h5T2FaY3h2YjdKRmNISXFlNm1qVFVralZDRjRIUE5SM2NleFc1ejh4clI3bG8zUERLV2orSHJ1NXVTcWhHNHozNE5ZOTl2UUs2Mnl4eHVlQW93VDA2MU5vc2IzYkxiSzVWV1lBaGpnWkpBeWZ3clIrSVBodGZER3BEUi93QzBJYnNSUnF5U3dQbFdCR2Z6cm5sSDNyamhLODdHSE1nYU5XQis3akhGSmNva1FhY0hJY1liRkVvQVZRQVRrZEtrMUV4d1djUmk1eUtPWkkxNWRTdGJpR1NJQXc1WWpQTkxhVzNsdVo1Q2RxdDZjZFIrZFc3ZUJESEhJRkhFWnpROXlnc21nNEFLNHlSelV1WFJGS0xSNkJEcVZuNHIrRjJvNnhKYVcwVjlwTVVjVjdCRVN2Mm0yT01FNDR5RzVKcnpuVTNpV1I1Tk4wcUsyUW5JTVpMQWpBeDFQU3RUdzdCZTNrbHhiMjhqN1o0aWpLdk9WSS8rdFRiUFRoTEY1TndNVFJyc2VOdUNQUTQ3MUthZ20yVHl1cFVTUmE4SkdTV3lXYVFGaUQxRlc5Vm1XUzVqU1JEdk9PdlN0RHcxbzdXMm5tT1hZcFpzQWVnTlZ0WHNvb3RYU0VIZnRVY2c4MTVzNUtkUm52UXB1RkZKazk0c2x0Y1FTVEtOalJIR0R5T0s1ZEVqbjFJdkpDVGx6dC9PdHU4Wi90eUx2SjQ5OERpc1dOaEZkNEVueTcrdlNuVFJqWGxxanBrZzhtdzJJUGxaUUExUUpaeHpySEFWd0ZrNk1PL2VybG5QblQ5NUtrcGdxQ0tUVFpvcnE5U1ZsQStjRXJqcHhXTHZ6SFJLM0tqaWZFRnZQZWFuTUVLSUlpMkdjOWNkcWZvdHVQN0thNExmOHRRRkJQUTlhaThUM1A4QXAwMExKaERjczJhdWVHMFM1OEl5Ym1IN3ZVQnhubkdLOU9OMVNSNU1yZTJzUk5jS2txaHo4M0ZQa2o4Nlh6bllManRUYnVDS080RWhBeUNNSFBXaTRmY1JHZVNlbFlwV05tM2F6TDJqcjVsamNpOG03QlkxOS93cXZkMk52RjlvQUF5b3lYUFdyVU5xYkcyVzRsd3hKSHlxUlZ5RzUwYWJ3cjRvanVMZmJlbU8wZXhidW9FcDh3ZmlNZmxWUjFaTHNqbmJiVG1GdUxxSmdVOU05SzA3eWNUMlVjUWJrRHBWTHcvTERLUHM3TnlTUXRYcEVqWlV0b2JVNVJpSGM5RFhOTk4xRHVvdEtpWXVveHBCWk1pd1pZK2dyUStIeEszVTAwNUhsSmFPOHEvaDdWWjFheWpOdG5LNDlPbFZQRDlqZHdDN3ZSeEg1SkhCOVQ2Y1pyYTEwUkhsVHViR2krSHo0bHZ0UlhUdFJ0cmNXRms5MHEzMG13VFJyZzdVSjRMYzhEdlhOWEhpdlVOUWdGak9NeElNUm5uSTlPOWRuQnJmaENEd3hQYjNGd2d1Wkk5cUlrUUo2RGpOY1EyaHU5dkplaHNKbmdjYzFWTktPNXoxbktUc2kzWndXMFZpbXIzTWJDQlcydVZBeU1qajhLcVIzV21YTXpMYjNERUdRZVdXR01EaXZWL2hONFk4RmF6OE5kZjB6eFpxVWR0SXVueHlXUG11QVdsREU0QVBYaXZMdFc4T1I2YmNFMjdCaHR6OHB5SzZKcUxqYzVLVlNjYTNMWTBKYnFhQzAyQlJHTmcyc1IxNE5RNjNxa3J3V3R0Y09IRU5tVlhIWWs1eFVYaU8rRjNiMjBNUFJJQUhDK3RWQ2htRUNzM0lYalA1MWh5eFBRZFNWckZuU05VdEh5WjBJYmdKa2Q2dmFsZXRGYkNTNmNiY1lQdFdUUHRnbndFeHRiSklIRlQrS0xVWE1jQ1diNUV5REFIcjJxWEJNVWF6VE5Dd3ZvTFMyRjBwM0dSdnU1N1ZGZlQzSG4vYVlvajVSQUdNZE9sVDZYNGJ1b2JLR1dTTS9JQWNIbXRiV29MZlJMRzNsZEFCTHdBTUhPT1RXQ1h2MlIwMVoycDNPWDFDOG10QXR3UVNlTUNxY3pYdXRZZTZpNUs3VUM5eDBycVRZNlpkM2FxSWNxeWpHNGREMXJXc1BEZW0zVnRCSGJvRmxqbjJ1Mk9DQ09EWG9Vb0hqMUtpdVgvRUdsMi9pUDRKNkY0bm5oRFgybHl2cGwwdzZ1ZzVqSjk4Y1o5cTgrbjB1OGFNTkNtQmtFZy96cjFLYTVzTkUrRzJvNkhmU0tobHVZWllFUGNqZ2tjVjU5cldyV3NxN0xlUlZ3UGxZZCtQNWMxME9LdWNmT3pmOE14NmZGOE92RWNWOU5nckpaelFodWdmTEExeXZodlRiM3hGNGhoc0xKR2RwWndFVEhZc1A2VnY2TDRiMVB4YjREMVc0MHljTThUUnlTUWc4bFZIWDI2MXAvczI2dDRJOFA4QWlxT2Z4RHFTZmFsa0FoaUM1UDNsR000NHFuOEkxTkhwK3N2NFA4WWZGRFJmQzJseUxKckhoN3dtK2srSTBaQUVXU081M1FuSndDU2hIOHE1ejR2NlJjanh0YzZiTUZVUWdMRXFnTDhvR2VneWZ3N1ZrK0M3elN2QzN4dDhkU2VKL0VFRUdyYXZyTEMzdHc0THRFMlpBUmdFRUVGUml0djRrK0pmQ09od1FOY1Mvd0JwWE0xekliN3lwdHpRb0R6dGJBN1lQUHFhNTNOeGxaQW94bHF6Q2k4T1hsbHBZbWxpbUlrZkN0OW5Jang5VDI1cTNiZUdiY3FvS2dvdzRJUCtGYmsvakQ0ZjMvZ3BJZEM4WHhUeCtXQUlMaTcyVElTTTdTcDRPRDNIV3VQMG54aTBVclJ5U2hrQU8wOXM0SFQwbzVwR3FqQTZIV2RPMUNidzlZQkx2QWgzb2dQTzBacm5OUGgxT0x6TGNGWk1LVHRiMXJVbThaMk1tangyaGtIeWxtSjlqL0tuNkUwTjhaSjdkbDJCY3FlT3AvOEExaW9uTnBHOUNrbTlEbDcyNGU1c0dodWJSbzMzWStYMjcxWjhLYWpKb2l1WUpHSVlkR0ZYTlJXSzFuTVcwRWs1T0I3MDZlTFNMdlNQTnRJd2pSeVlkL1hqbXMxVlZqcGVITlBXOWEwUHhIbzhPbjNzU0NWZUEyQU9hbjBUU2ZEOWpDRVc1U2FhTWdtTk9RdlQ5T3RjZEpwcjNmbVNXc3hIWHB6elZLenZ0ZDhPeVBkcHVPZnZIMXExeVNabEpUZ2R0NGw4UHRyTjFMcWxxcEFpaEdTUnpYQlR5bXgxSTVrWlFHd3hIMXJhaitLMHFhRU5QanR6NTF4SVduY3AyOUJUZEovc2pXVmtrbVJTd1VrRTkrSzBVRTlpSlNkaWhGZFJSZmFJdFEwZHc4Z3pieXJ4a2V1S2Jjd2dhV2pReUtDNzVjVmZmV1h2MVhUYnVJSHlUdGk0NUk5S1pKbzBrcnRhTm1KeXBhUGQwQXJHb3JNM29OTkVkc0VsWkVmQUFBR2F1Mm1uM1Z0TmNQYm96WWlMQUwxeDYxbDJ3dXJMUDJ1RGZIRzJDMFJ6akZkTDRZMU80dU5SYTVpeCs5aEtCU08xS0pwVVpYMFhXUEkycmRKbkk2VmMwMjlpdUpwWXdPQWNxQ1B1MVR2WU4rRlNQYTBiYldmSEdhc2FMYXhQNXp4dUZ3cEJQYW9taldocXgybFhjK2l5YWpQYlMvUEpiTWh6NzFYOEVSWEVjZ1JTUVdQekNpMmtrWVhNWmdQbHFRdm0rb3pqOGF1NmZiMnRyZkliTzUzcmdaWUhrVkVXYnlzanBicUNOQXBYcnNCUEhQVTBqWEFqMHlRSzNCUWpKTlRPSUd0UXpzRHVVQlRucldOckY4WUEwQ1NoY050T1Ixcm9UME9EU1VpcDRjdExLS0dTWjg0a2wyOGRhdFdta1J5Nml0OUZoakVTV1E5ZURXRHE5L3FHaDZkRThjWkcyUlpXNjk4LzRWdCtEOVZrMWdJOE1MR2VWc2dZd0NmcitOWTFFYjBuYlEzN1h4RkUweXZBQ3FzQXAzam5OV3pwTHlsYnVBbHlUbkE5Zld1UjF1OE1maWk3MFYyQWEyalVuQkhYSHRYU2VDdkVIMmV6ZWVTVlR0amJ5OTNJRGdjVnBUVFVUR3BOT2VoM0d2NjM5dCtFc09pYWhMdjhnT3NhRWRQZitkZUVhN0N0OU5IYlI4QVFFQTU3NXIxM1UwdTA4S1c4MTVDRmFlMTh3N2Z1ak9lbGVjTnBjTTBIMm9NTXFTQVBRYzFyYlF5dmVacmZDMks1ajBZbDErVWdxSmUyUnhpdXgxTzlqc05NaVJTc3NrWTNPQnpnRC84QVhXUDhPTkpmU3ZCOG5tT1pQTWtNaW9SOTN2eFZpMnZZTlRFaVFwaHl1eVVIMHFMMlIwS0YybVpHc2F0WlcrdFFPbHVFODVRemtIbnIxcks4UWFUSGNhb0dzVHVNbk9CelUveEcwdTZzUEZPbXhxaGFDUzBJSjdacWY0ZTNkdnFIaTFZWndTRWlZY25ISTkveXE0eFhzN21OYWQ2dGloNGp1SW9mQWJlRFhVQ2VlNldRTmpnanJXajRaRU9pVzhPblNMOHl4QTdnTzlZWHhDU1NEeEpFTGQ4amR3QWUyZUsyZEZtUzZuaEVrZ01oVUxqdldEZHBHNlY0azhNa2Q3RE5aVFJadzVKSkhRVm0yL2huVWJTNG0reFB0ODFTSTJJNm5rLzBycFpORS9zalVKdlBqR1pZd1F2cG10VFRiYXkxUXZNa29XT0pDRlB2ZzQvblhwVXRZWFBJclhqVXNjd254VjhZK0hvVThJeXlzWVpJOWtpZ241bEpCNDdldGRSOFBmMmJiTDQyL0RuWHZFMXBxSWcxSFNGQXQ0ZXBjSGpqcDN4MHoxTmVlYTFjSk40MXN4Y0RkaVBHNVI2QTRyM0g5bG54cGIrRjlXdUpya2paTXcrUW5nL01QNVZVSGQyWmpVcHFNZVpIemg4Q2ZqSjRVK0ZIeER2dkRIeFE4RkpybWkzRjA4RjVDVTJ6UWtFcnZqZklJSTVJR2V2MHIwcnhqOE9mZ1Y0czhYUlgzd3M4YlMvWk5Rak0xcExjZ1JUMmo4NGlsSUh6NDQ1SHJYSmVKUGhwby9pWDQ0K0tidXhqVXhQcXNydzdSeHlkM0hwWEs2L29lcGVFL0ZYMkJXa1VMdSs2eCs3am4rVkp6NVhZcFVWVWpmcWR4OFZmZ2Q4YVBoQmJhWDR5bjFwWlJmUmViWlN0bnpXaTVBZmFSbmFUbkRkQ0t6dE0vYU8rSjNoeXpqbDhSYWRIYzI3cUY4eUpoMEk3L2huRmVzVGZGTFVQSHZnblM5YjFTM1YwaHNJTEdGbis3RWtRQVZSa25nNUpJSEZmVU0zL0FBVGMrQkhpei9nbWxwZjdVT29sNC9FVSt1NUVpU2hWYUl1RkVaR1B5NHJvalNWU04wemhuVWxSbmFSK2Q4ZnhPOFBhMXBsenAwWmEya3VibnpNTXA0OXEwL2hYOFFMWS9FU3c4R3lNc1VNa2dBdUFjRWpqb0QyNHFUNDJlRnZEdmhINDAzUGhrV2l4V3pXNmlPVVI0RzcxNmRhNFh4Q0xGYkp0VXN0UUVkM1pTYnJTNWljZzVYcCtGYytzSjZuVmQxWWFIMWQ0ODhFNmZyL2lPdzBIUjlVZ0U5eEV6UW5mdzU1S2o2bjByaVBIZmhYV2JEd3k5b0V6SVFVWTR6aGdNWU9Ud2E4cThLL0d6eGRQYTJlczYzcnlDK3Q1MUVaSktzVlhvY2p2Nit1YStoOVM4ZXplSi9CbHV1dmVFb2x1SENtUy93QlBmZkcvSDNtWHFyRnUvcFhUQlFtdFRsYzZ0QjZIbkg3TS93QVRJdmhYcXQ5cDJ1YWRzbnVsSGt2SVIwUGF0enhkck4xZDNjMnNXeW45OGR6bFJ3TTg0ckErTEduNkRyYnhhaDRidTFXUzNVYkJrcTVQb1FlbU1pdDM0WXdKNGo4S1hjZXU2cGEyMDFySGxmdFQ0YWJqb01mblZOOHFzUFNjdVk0dlYwVFUvaC9iSVpOcnA1b0ROakF6aml2UlArQ2FXZ2FqTDhVYnlXeWpaMWlnRHR0YmhGQlVsaWNjREZlVmF6cVJ0UGhsRGNzK1VBUHlnL1hpdlRQK0NaL2p5SHdYOFJkVjhXWHQraVdhd2l6dTQzT1RzZkFWc0hqaGdLNTZEU2Vwcmk0dHhQTlAydk5PazAzNHgrSWJWN2RJeXQ5SzVJYklZRmh4K3BQNDE1SjRpdGhMYVFXTmd1OWo4N0ZCa2pKTmV0L3RmWGMxMThTOVh2cFpTL21YOG1WeUNjRWNkUFhyWGxHZzZoUGIzVWQvSEVITVVpa0t3eUNCNmlzcTB2ZVk2RUc2YXVYZmg1UHEvZ3lPNDhSR1dTRnhCc2pVcWNPQ004OGNqclZpQyttdVFsN0p0LzBoaXpxb3h6WHVldDZyOE52MmdmZ3BJTGZRSTlIMXpRWVFia1FENVoxMjR5QjNyd3kvanQ3RVdOdll5WlZGSU9CeG5ORVhlTGFMVjFLeEZxbHNranhUNHdRdzQ5cXJYMGl5eWxWUWpKSFB2VnU5REpkSW9Cd0FLaTFJTGdTOEErb0hXcHV6UjN2b1NhWEZJNkxCNTVpLzBrWmtYcW85ZmVwTlVoVXlQRERjcTVqTzBzQmdISGVtVzg1aXRvNUltQUpJNTlEVi9VYld3dllESzBxeE5IR0FRRisrM3ZVeUtqR3p1WTl6SkRpT0RnSGFPY2RLZHEwSU9uUmdMZ2cxWHUya2FlTkN1Y1l3YXZlSjNrdDdpMHRraUdHanlUaXNKYUhUQ3pEVE1HU09PZmo1T2xWNWJJU1hzcWc0Q2s0QnE1Q3BWMGJHT25GSk9wVytseWVNYzVxRkt6TkpSdWpwL2dUNHgrSC9BSVQ4U3lXM3hIME82dUxLV04xVzR0VkROQzJ3Z0hhZXZYOEtrMWZUUDdVMTQ2amZQOXFtamdpUkprVUtQTHg4Z0lIQk8zam4wckMwYlQ0cDJ1SkpvOGxMVnpIOG1lY1Y2SmRlRnRRMG5TSWRSbmpiYXRyQ0hWZ2Y3dnYxOWE1OFZYNVVramZCNFhtbHpNNTdTcDBNdmx2bmdmS0NlbFV2RVZxWTlSanVZR3dwNEpGUHRaY2FzVmRmdkU4TDBITldkUUVVcXE4MGlxSTNPYzlxNUY3c3JucHYzbzJNeGx4ZnhDVGJnZ2dFOTZ4WjdFTmVOS1gyaFpEd2ZUTmJUTEcxNUJjTzN5S2NrRDByT3ZVaE5rOXlGTzB5SGsxdEdWam5yUVVrYVduczVpRXdjbER3Q2VsUDArV0dDNm1BQkEzZksxT3NIV1R3cENJVXc2T2NrbW9wbWFLQ0NHTUFONWczTmp0V1VYZVR1YnpqYW1ySEkrS0Nubk9qcGtyS1NBUHh6VGZEVThzQ1NRRmpzZHR3R09EVDljei9BR3RLSmVCNW1NRVpyYmt2L0RjM2h5ejAvU3RQS1hOc2pHNXVEL3kxSjUvU3ZUYnRSUjQ5cjFteksxRlZ1WnhLcmJRWS9sSHZVNzJpeGFWRmRGc3VEOHc3MDdVSWxFc0FpVGhrR2NDcG5WVmgyS2NqSEFQK2ZhdWR2UTZGRnNzZUZUYTZwZTI5cmVUYkk1RzJrczNRMVA0ajhMWGVrcGVrU0FSdkdWTEEvZTVyS2hXTzNpaDJNVktaUEdSem5yVDlhdXI2N3N4RFBlbkJQS0UvU2hOODJnU2phSlI4TFdtelVGWnlBQWNnSHBYUkZFK3l6bG96Z1NraHM5YXlOQW5nZ21FYkRsQmdNZldyNjM4UXZwWTB1bE9JeXpKbnBVU3Y3UTNwV2RFYmY2YllYV21MTkN6aVpXeTVKNHhWQzB1NUlmT3RsbDRLSEpQZjBxMCtvVzdhWEpNMG9VTVRsUFN1VkZ4ZHl6T3J6RUFnaFRuMnJlT3BoZXpMS0xHWkRMMXcyTVo2MTBWbkRiTnBVQ1NLNURUWWR3T24rTlo0OFB4VzJrMlYvQk9KSjN6NXNYOTA5djhBUHBWb3ZmZlk0ck5DRlJXeVFPTW1pVmhKTzRYZWlhaGRPem1ieTR2TXdpc1J3dWZhay9zK0cyalcxZTVNbklKSnE5WlBKTnRqdUgrVURBeWVLa3VMS0NDUlpYSEpjTmc5Nm5tYk5WVFMxTWE2dGY3UHVXampUY3lrQUJsSndPS2JiMmR0ZmFqRTNtNVlENWxBNEhldlI1dkR2dzQ4ZWVEYnVYWE5kdXRNOFF3TUcwNUlrSGtTcHhsR0E1em5Bcmx0SzByVGRNdGZzemhReVp5NHgxNDRGV2tqTnlhNkdZK20yWnZYaW5UY20zNjQ0cVhRdFBpdVlJNS9MM0pCS1ZBUHBtcmtiMlpqa0pqTE96Y0Vqb0tXWFdkUDB5OE5uYmdSeCtXQ1NCeHVxdVhReTV0VHBvaFlOWUJwemhjREs0L1dzeldJOUcvc2NYa3F0S3lTZ0pFdzQvOEFyMUFmRU5sWjZkOXA4MFN5TWZraVJjNEZZMnArSVpiMndaQ0NUbmNGQzR4NjFuR0NUdWFTcVhqWml5YTFFQ1hTMkNrREFBRmFIaHJ4aVpJYnUyZXppa01rZU56ZFVJUFg5SzQ2ZTkxWFVJR2h0cldOUW95ejl6Vi9SYlNhQzBlV1NVNUk1SVBYaXU2bGM0SnRNNmp4aGYzdXEzbHZxdHhwY01TR0JZbGlRNFVnRDczWHJqQi9Dcm1wK0EvRFUvd2FPcHBiRmRhWFhERUpqOXg3Y3BrZCt4NHJpMXY1SGVTM2x1RzNSQTdYWnVGNDdWczZkNHFuMDNRRHBzODRNVXJaVTVKR2NkdXdGYXVOem5zaDN3dDFHTHdMRmZYbW9CcERkUmVTa2JIZ2pQSlA0WXJVZVRSR21TK3NMR0NJbHNsMFVBRDhmODRybXZGRW5tbUc4c1ZKaWFMT1FPQWY4YXB3NjFlV09qbmM1RzJRWXoxUDUwK1hRemNiSG9mN1Mzdzl0ZkNmN1JQZ2p4UDRiZ0VpK0pQRHR2ZHl4cjJtajNJK1d6MUlDblA0NHFTNVBoYlh0UFpyaVdaWjJsUG1vMFFmY1NjRTUvbDlLMHYybHZFRWNmalg0S3gyOTNITE1ta0tXQy9Oc1dXUUFaeU1ldjB4WEQvRVErSXZoTDQvdTlCMXVCMVV6bDRKQVBsZEdPUmpyK1h0VUtLYlZ5RmQ2RTJ2L0RQd3c5aEpxUDhBWlptRVl5ei9BSFNlT3ZIV3VkMGUwK0g5emJ5VzlzMnM2VGR3NEtUVzkwSlkyOWlyK3AvbFhvbDM0NzhNemVCeGFRVGp6WFg1anh5U1BRVndOOVlhZkhwNzNGdW0yUnBBVGp1TTU2K2xYS0N0b0NnMjl6b3ZHSHdwMG54SDRhaHZmaHA0NWdudm9zR1cwMUpYdFd1QmpQeXVHYVBKempzRGl1S2g4YitOUGh2S3VqZUs5Q3Y3RlV3Q0p3V1JoN09PQ0RqZzEwMmh4M0V0cXB0cnJhdVYza2s0ejZZclJ2dFYxTzBpSnZJRm50U3czQXFHVWo2SGp2V2NxY1dyTkcxUDI5SjNpektzdmlScFd1MnpYQ1RxU003UXB6MjcrbFM2WDRsc3pvejJiVEJXWm1MWlBUMHB1cytIZmhMNGp0VnZVMHIrejV6ak54WXVZbTlTU0I4cHJuYno0YVhNMHdnOEdlUFliaVEvTDlrMUZRck43Qnh3ZW9ybWRHTjlEdGhtRWxwTkhYZUU5UXQ1N2xzWHlZQTRWMnJhdUxJVGFKY1hRaURobTJxVkhCei9BRXJ5MjkrSC93QVl2QzBKdTlROEp6TWlETFMyY2dsWEgvQVQ3VnFhQjhYNDdMU1A3RTFsMmhkWk1zc3FsVy9JOVBwVXVqS094c3NWVGtqMGlIdzNwQnNJVm10RjRRWmJiV2JxbWd2cDloZmFqcGtJVHlGWHpPZVRrNHE1cFBpNnh2OEFRNGRSUWd4czZoQ2VoSi9wVm1TK04rWnRNVnRvY1JOSXBiT1I3L25YRXNST25Xc3owNVllblh3NjVUaVlqZHZJdDB6K1c2Y2tZNUpyUnN0WW1sdURmM2R4NWpMRVZVOWh4V3BOb2RveG1Pd2N5Tm5BNHdBYXdJTktrdE5PRVRTajk0ck42bkdmOEs3ZmFRcUhuK3hxVUdYdkQ5bmE2bHFra09uc0Ztd1N3MzhHdGJROUQxODZ3c0ZycHNqTUpNWWpqeU1maDdWd2VuMitwNkxOTkxITXdkU0NwREVISDFyMUg5bDM0dXpmRFg0dzZCcm11Uy9iYkFhakdMMjJuVU1yUm5oanorUDByV0ZOTXhxVjJ1aGphanI4VFhNdmh4b2dvUzRMU0VqQk9PTVZaMG03MCtPMW1ZTU1xQ0NENlZxL0dyU1BDM2lQNGs2ejRtOElPa050ZTZqUEpERXVNQlMyUUJqcFhLNkpEZFdlcFhFRi9DU29pYll4SEZZVlk5anB3MVcyNHVwQjV0Qmh2TFpuVXJlWUs3c1ordE8wZTg4cWRoS1FvSjZaNE5SYWJlU1hkbkpwVXNlQUgzZ0VlaG91VzBtNGxEdGtNcmZLZCtBM1BTc1lJNnBUNWxvZG5aT2wzYXhTeGsrWWhCNTZHc0s1dWpMcno2VkpHZk1Wdm1mT1Jqakg2VnU2SkxFOWtpQWpKVVlIZXNyWHJLYXg4UWpVdHZ5dW5QNFYweHMwY0VsS0VpZnh4SEJKcGlvOEdTRmpVbnFNWnJZOFBQbzNoczJ1cDZ4cERYRmpCSWh1NFlXMnVZOGpPT25Uay9oV1hxRXE2dm96UUxIbGwySGtjazVyZTBKRHIya05DemJTakFNaTR5Y1lHUHhya3JOeGtqc294VWswWFBpeG9md1ExS2FieGQ4SExtUkV1VmpVUTNET0hJeGxzb3hKWEdRTTVPY1pyZ3RLTjlZeHlJd2JERGtucG5GZFhxUGhGYlNjWFVML0FIZ09uSCtlQitsYVdqZUZiUFV0TnVMVzVBVXVjQno2K3RkY0hkSEk0OGwwZGRmV2tHci9BQWZzTG1KZ3pRV3dCeG5PT1JYbWt1aUJtUzFCS2Vjd1hyM09QMHJWdHZHdC93Q0FMaVBTdFFsODYweXFtSHJoYzVKOUIvOEFYcWY0cTJVK2thdGEzK2lyL29rMENUUXNCVk5rSmFpYVBxSTB2UzVkSnhsNEpER0Q2MUpvVUVkbjVsd2lFbWFZQXFjODgxVnQ1QmVPWlV3RElRekR1V3hXL3BVWDJTelBtVy96d25lbmJKOWE1NTN1ZHNOWWg0eDBDVFdwWkhzYlZwQlkyNWVWbFgvVjU5ZUs0M3c1YS8yVnFCdXpGaHlIRHQwNzEzdndXK0l5UTNYaWZ3MXJOdWtxNnphQkk1U1B1T3BPTWZXc1R4cG9kem9TUEs5c1ZTU01xR0E0emovNjRycWovQ1J3elg3MW5uM2lTQ1FhOUxkeVhBTzIxREx6NjFQNEswdTRPc3dhZ1diYXN5c1JuMVAvQU5hdVptMUhWZFExT1l2SWYzVU8xdHc5OGMxNmo4UE5JUnJKVGRQZ3RzM01QcFhKdXpzZzlEWHZaanF1c1R5cHlFWGJ4MEdCV1BjWGk2THAwcnNHMnlNYzRITmFIaHE3aTA2OTFDT1ZkK0pUdFlWWDhmVzBNSGgwWDBJQlZoelhxMFYrNlI1V0l0N1U0KzB1SUJmTnFGeWhZcm55eVJ5Q2YvMTExZWh6VGFkWXgzVnBjN0dsWUJkcHdlVFdEcG1sQzcwWVBESHVMYzVBNmQ2THZXYnl4anRiWHkyR0xsUnU2WTZWTHZGaVM1a1MrR2J3Nkw0eWtlOWY1NWJvaHlmNHVSMytsZWdmdFdmQ1RSdEs4SWFMNHgwOXNYZXFST1psd1BsUUx4WGxyM01tcStMNGpiNUxtKzJzUjY4WXIzajlxNlNlMjhNZUgvRDhxWit6NmVvWXRrNDNELzhBWFV2VkJGV2FSNHg4UEw2NWI0YlhHa0NRaFZsRzFpVG5JeG5IcDAvU3YwWDFueE40bDAvL0FJSTJlQnRBanVYVlovR0Q3eHZIelJKay9YR2EvTTN3bGZycGlHeGVRcm1Za3EzR2Y4NXI5VmRkK0hsMS93QU93UEF2aVNkMVRTckI3cTh1SElHd1NNTUl2VHVjL2xXK0ZsS3pTT1hIMDRxelB6RCtNbXJXbXNmSEdHRzlnR3dPRWJ6QmtFSFBIcjFyaGZHZmh2VDdieHcraFczeVFTdUhHTThBbm5GZDE4WDlHV1Q0em0valBDeUZ0dlRISk5jZlBjblZQaWtobGlKRVlDNzhuNmQ2aWJ2Smpwd3RFaTEvNGM2UlpYVnREcGw4NU9CbjVjNCtsYWR0NHU4YS9EYlZ0T24welVETkhITW9hM2ZCVWp2bjFQTmRKNGowWlZ2YlJvUVBuYm9EWE82L0ViN1V4dVVueTM0eHhqQnBLVHVWeVJsdWZUMzdMSGd2d1grMDk4UnpwUHhBdUxmU05OQ0ZwSkxTRlBNZC92WTNFQUFZR1NlTVlwM3h3L1pJOENtMjFUeEwrejk0dGwxZlQ5TW5hT2RabVYyUUx3ZWM0d2NjWXowcmp2MlMvRmt2aDI3bGx0Tnl5bmZtVGRnY2dBanI2WkZmWXY3U2Z3UitESDdPWDdQa1h4RCtEZW1YV21hejRwdFk1THVNM3pQREtra1kzWkRIQzRJYzRVOURubXRKVjR3U1RPYjJFdWQyUHlwOFFYR3V5ZkQyeWdXTmpIdklKR01ZN1o5cWIrejk0aDFMUkxQWGJsekpIRzdJaU50TzNlY25BSTc4WkZkdnBQaCtQV3ZocmIyMGloMjJNVkJJNHdDYTBmMlM3V3p1RDRraHVyUlprZ3VWdUVqa2kzSXJvU09oOVFUajZWRk9MY2REYXZKTGM4azhYZU83djRpK0lkUXZiZ3NXTnlXalp2N3ZBNy9TcW5ncXpqZUsrdUpuWE1NUHlxZTV5ZWdxbDRxMUVXdmlyVTU3YTJqaVNhN2xHRUdBUG03Znpyb1BnZEJvT282L0xhZUkxa2EybmphTnloTzZNay9mSDA0TlpWRnBjcWxLK3h1ZkQ2WFVZTkE4UzNOb3JLcldJM3FPbld1Y2hTUzgwbUM1a3Q4b3N1M3pNWng3WnJSMTI4MW40YmFscUhocUdkSjdlOWlLeHpyeUpVUDNUejBPT3RaOXRmWG1pZUhUcGx6R3BFdHdrdnJnWXp4UlRkb2xOZStXOVhFTXNhcWtISXdTZlQyckd2NDhYVWtaYkcwREE3VnVUU1JTWHBpVWpPMVdBUGVzN3hKR0h1SkpiWkFRMFkzTUJuRkY5UmxOVlNTMCt6Tm5LbklJUEZYSkpZWW9JcmVPSXB0aXkrNC9lUHJWZTBqSmdRdXZYQlhIVTFOcTVaSFIyajNBakdLbVROWXJRcCtSY3VEY3JFVENqNDNnY1o3RE5hWGlvaHA5TktMbmREK2ZOWlZxMXdiNFdobmtFVXB5WXQzR2ZXdHJ4UEUwVW1uODhwR1JXRW5kbTFQWWdaWEVxZVcyM0I1cU82V01YcHVWY25rWkdLVlM4ajdneEgwcDA3bUpDV2pHQU9lT3RRMWM2VzF5bmJmQmF5bHZmRnR2ZFdNVnZLNk1Yamh1dVVkc2NBL2pnNDlxc1h2aW54THFKdkxUV2IzNWpmbmVxL2R6bmtBZGxIUWUxY3Y0Slc5ajg2YTB1V2phMlVTazdzRWdudCtIODYycnQ0MDA5cEpHemlUZWQyZm1KcmlyeFhOcWRPR2xkYUVVNVdMVVlZNFFoWUxqUHIvalVlc1JPWUhXNEd3a1ovcjBxcGRUck15WFNUbFNoekhqdCtGSzZYdW94L2FydVl5Y2NjMUZyblNuWkZlYVFob2ZLR1FzWjNFSEk0ck12cjl4cGhoVUE3NVNDY1ZjdUxtZTJFeXJFQ3FSRWJtck9sOHVUUzRnUm5jNXlLMWlrYzgzZlE2Q3p0NG9QQ1NYSG1FQUhPU2FkcStuM1ZwcEVHcFB5a3Uwb3ltblJ3cEo0T0dWeUNPQm11ZWgvdFNOUHMwbW95ZVVwM0pDekhhRFdOS1BOSm05ZVRqVFhvVU5hZ3VQN1VuUzlqSXg4M1hweHhVbWlKRVF5NSs5MDRwbXFhbE5mNmxOY3pzU0c0d09PZ3FiUmpESGNoSk9OeHdveFhwVGI5a2VYQ3pxR2cwRVlFUmpPNzVLUXNQdk9uSU9NVks4c1VZQTR4RzVYQVBOTlNUTVQ3dTdjWnJqNW5zZHNZbG14dGJLUmZNbWpHZXE3aFdWcVJXMzFoWkhYQzlSNkFEbitsV2pxUENXd0dHejFQcm4vd0N2V3I0MTA3d25vdHZwVjdvZDI5ekswQmEvOHpCQ3Z4akdEMHFxZCtiVU1UWjBySWs4ZWVDTER3bkJwTytPZUo5UjArTzdsTWd3VkRIb005dW41VmdKWWFVazl5K2wvd0RQTGJuZG5tdXUrSm54TWsrTGVuYVplNm5CSGFIVGJSTFFPdU1NQjZlZ0hhdUoweUd3MHU4bG11cjkyamUzWVJtUCsvamppdEhxekNsZFFzeksxVnpDb3R6SmhnTUVWSHBFTU1rRW4ycU5pdTRiVDZWZXROSWh1ZjMxMDI0OVNjMTBkcnBOdkxwQkVNUUNiY2J0dU8yYWQ1V3NpNHhYTmRtWFBZM1U4aUpHeENsUUZVWnJSaTBhT3p0Uk5kWEh6Z1p4VnVHVllkS0VZakFsVDdydVBmMzlxamtpRTFsdWQybXVBdktvT25UOU1Vdlp6ZXJMbFVwZEN6SmIyRjFaUjNGdkt1ZU9oN2p0VDF2TGFVeFBxZHNOMEF6MCs4UDYxaGkzTXJ4Uk5JMFNxd2JJNis5WExzMnpYTFhEWFcxZkp4Z25qUDhBV3JVRXR5UGFOb1M1MVZKZFFGMUdNWkkrVE5XTG1mVFk5dDF1Q3RqTEllL3RXRHF1b1dtbVFLVVVzNzhweldYZGF4YzNVWU1wSTlNMWRqTnlkelYxanhmYlJYRExIR0JqZ2hlaHFoZFRpK2xXL1pqOCtGS24wcUZiU3lhM2d1ekN6TTdZWm02WnF6ZWlDT0VLN0JRQnh6akJwa1cxMU5XL2U1dGJDRXNnaFJnTnZscUMxTThQZUtyYnczckgyaDlMVzRqbXQzamxNdzUrWWRSV1BIcVYxSENzVThoZFZQeUFucDBvdU5UZ1lMTXNlV0I0eUtjVnFSVmF0b0xiVFNSelNORWhYZXhBSit2RldwYjJhRzJhek9EeDE3K3RVQmUzRnpJck12QUh5cUIwcHJpZWU4UzJ0bStlVTRCSndNL1g2VjFRV2h3U2tiL2gzUnRDOFF6WGRycXV1SlpCTFhmRVpPc3NuR0Y2MVE4U2VEYnp3L0RwOTFMZUNXQytFalJHTWNmSTIwakgrZXRWL0theDFJUXp4Qm1qZkJLa0ZjNXptdlNOZVd5OFcvQlpEcGFlZGRlR3I1cFpRdWMvWjVnTXNmb3dyUXdjN0hMYUg0dSt4V1kwdTYwdU9TM0M0QUsvTjI1RkpvT2gyWGpQeFJaNkJhZktsNWVLcFVkVkI2VmlhVnJ0elp5TjltdFVhUnVkenJ4aXRmNGU2aExhK01iTFhZeis5dHI2R1I0K3hPNFp3UDAvR25iUWx5NW1iTCtDRGRlQWRZOFI2aE9aTlM4UCtLNDdHeGtmZHVSSVcybFFjOEE1emoxQnJwdmlIcVVueE10clVhekhHMHNLL3ZKU296bkFCeCtoL0d1TXYvRzE5YytLZFkrSE1XbHNpUDR5dnIyNG5IWWJnTmhBOVByVjJMeHBwT2x5VGFYSEc4Z0pZQndQdSszMHBLMXdWelBtK0g5cWduaWd2TnJ3SVdHNDV6K0g0VkhhMjZ3Nk9aTnlUYkFkNm5yajBycDlLbDBhL3R6TEZjZjYxQ0hESEI1ckZYU3hwdXNUVzduOTIwUkl6MHhWbXNaSW82WmRXRjViTGFwYStVUE5BTHEzVVZxYi9zTi8vWjgwbTZMTzA4anBXZERwTUIxQzFPbnlqSmY1bDk4MWExWFQ5U2gxR1dlZUIvdmNFOERGVEkwakpvZDRtMFcwdDVFU3pBRWJJR3d2WTF6bXJhVEhwVUthMGwyeGtNMkk0NHh5RDNPY2ZyVzFxMnFLdG5INThueWc0SkgrZUsxUmM2VWZDZGxwazhVVHY5b2tjbkF5VlB2V0Vrem9pb1MzT1YwL3gvNG90a2FXMzE2Y0ZlWFYzUEE5ZWV0WExueFJvbmpHek50NHcwdXh1ai96MGVQWktPT2NNT3A1cTdjZUZOTXVZWmZKUUFTUmR2VVZnMzNnQzVTSVRXci9BQ1k0TlkzbVc2Vk43SFRhSDhOUEMycWFaRzNoTHgzTHAwOFozL1pMbytaRm5rOVJ6VExMUS9pUHB1clRmYWRPKzJRUkRiSmMyUkRLUVBiclhIbXoxVFI0dHdteWdPTUkvRmRCNEorSTJ2ZUd0USswV3R5d1hCM0l3SkRlK0s1cXNZeTNSMDBYVnBMM1dkNXBQaWpRcitDU3l1N2Z5MlFQOHhHTUVqSFBlcWZqelM3YXl1cmYrenBGMlNXaStXQ2Z6NjlSVnIrM2ZBbnhFSVhXNFRwMThXQSsxd0VEQnoxSUhCcWo4U05BOFQrQ2x0cnpVTnVwYWF5WWcxT0JNZ0wxQVlkdTFZS2xOYXhPeU9LcHkwbWpFczFobDFOelBHVEdpaFdmR1FEL0FJMFgybjIxaGRKcTJrekxpTTVrVUUrbFdOTDhSNkZjYWJGWVc4eUZwR3pNZno2MHQwa0Vjck90bXp3c2NDUkQwUFN0cWRXUzBaaFhveGxxakRnMUxXWGJ5N2VSeUMyY25yOWE3M3dMcTFyZEw5ajF1RDVXeis4eHorTmNmWTZXOXJxNGk4ekFrSUtxUjJ6WFUzUzJsbFp0Y1cwZTE0VUlrVmZidlcvTW1Zd3B5NkhSUy9EdlE3Ni8rMytIN3Z6Smx6KzRYa0gyOXV2V3ZOdkdIaERXUEQ5OHozTmpORCs5SjJQL0FBZzg5ZTlkVjhIZmlSYzZUNG1kQmJHUXlIQ2s1eW96WFFmRXY0aCtHcjNYNE5KMUszREdVZ09RbzRvOTB0YzBXWW5oVzZ0Sk5YczRwM3dERU8vZXVoOFNmWVB0YXdGbFpTTW5qT01uL3dEVldISjRac05SbSszZUdyeG1DTmdmS2VvN1ZuWG1yYWhwVjhvMWFGd0FRQXhIVTBsb0twTG5adlJLbHZaM0VSVHl5cjhzZlQvSnJvOVk4SCtJUEJMNlA0cGhPK3gxMkVCWWxIM1cvcWNjMXoyMkhVTkdOdzg0VHpzWVg4Ty9ybXVoMTJYV2ZFSGh6U3RMdHRRZUZMRUtscW03R0NlZDJmcWZ3L1NzbWs1YWx1VGpIUVhWN3k1Z0gySzV0eWhqR0hERG5nOVB5T2EwTkluaWhpU01raFh4a0RyeldocnVyd2E3NFNzZEIxblM0MDFheU8yUzdRQWVjdUFDVDYxa2Fjanl5cUEzM1krR0I0eUsxanBzWjNjdFdNK0kvaFd4dmRKRjlIYmdPT0RnSDA5cWRxVittcWVGTEd4dWdQTXRvQXAzRHNPMWRCYUNDOTA1VXVXeTI3Q29SMEFybWZHRm45Z3Rua2pVampnQVU3c1NSRmEyU2YyakJjUnQ5Nk1ZVWRQL0FLOWRCcjJMTFQxbWlJSndWSUk2MXptaU5BeWFiSVppckJNTUQxNjF1K0tqS0xZeXJrL0x1Q2p0MXJPV3JPaU9rVG12Q1VRZ2l1ZFZtak1NeGxPQWVQZXJYaXZ4YmQ2bHBwdGIrZGl1UGxBSEhibjlLVFZXWC9oQjdqVllHK2FKZm1DK3VLcCtFNHYrRWk4RkdYVUlmbVVOdFlqR2EyVW1vMk9hUzVwM1p5bW42YXV0eHphWHBta0xOZXpvOHZucWR1MUZ4MSt1T0s3ZndYYXpwb0NYODBaaWtWRHVpejkwREEvcFVHbVdsdlphb24yRENvMW1JRHQ3OGdudlZ6eDFxWnNkY2pHblRiWUpiZFJJbzRIR00veXJPVVVsZG1rSlhka0w0WWhNOXhlSTQ1Skp5ZnhwdmpTSkxud0diWXVQTWVRQlBmNXExZEhpdDdEU0RxaXJuemxWV1VkeVJUUEZPamFkREZhdktXWUt5c1l1bWM4OVA4OUs3cU0wcWRqanhGR1VxbDBWUER0aFk2ZjRmaUlrWEVjWTh3OGNNQldXMm15NnByQ1dVdHVGTVU3U25DOUJqak5hbG5wT2w2bHFVVnZxWWtqdDU3cmVOajR4MnJMdmRQMXJUL2lIZFd0dE83b3pyNWI0NTJIQkE2VU4zSjVlUldaei9oL1Q1OUkrTE5uRGZJVEUycXh1UWVtM0k1cjIvd0RhZDhUYWI0aThUSU5QWlpJWW9ZMVhiMndLODdtMDAyMnJDNW5qTytOaGhoMXlEMnJLOFdlSVNOVGlTZTd4NWpCUUMzZjBORHZZeSsyY3g0eWdqaDE2Szh0d0ZMYlJoZU1IZzUvU3YxSCtNMnErS0xyL0FJSTlmRHpScExrbU5mSEx4aTNWZ04wQVQ1ZHhVNU9lbzRyOHMvSGNrOWxjaVNZN1VEWjRJQkk2L2hYNlUvRWJ4cmIzZi9CUFA0ZCtIN1RYSWJtU3kwOS9FRTlqRkRrRWJOZzV4emx1bzZqbXQ4TFpKbUdOYmZJZkEzeEh2bnV2aVcxdmRXVHEyN2w5MlNCMC93QStnckQwalE3ZTY4ZXl4MnNPNExqNWh5UnoyclExbStYVnZpYkt6RXhob3QwY1RjRmZhbStEbW1pK0s2ZlpnREV3dzNwMTlPMVl0KzhheFNjVFg4U1FHMDFHelpUbFl5eFlWekIwdHJ1U1c3UTlXYmp1SzdMeDdBbG5yc2tqUDhwak9NLy9BRnF5UEN3dDIwTzR2OXVWRWhBQTYwMUc3SmJzalcrQ2N0MXA5L05FaXNBdVN4STYrMzFyNjUvYWYrT3VrL0hINE9lQy9odjRFdG4xaS8wdlJrVzlodHBBL2tTWUtndGpJUlFNL01jWXlPbk5mTFhoZ1JwNFV2TEdHQVJTWEtzc2wwVS8xY1p4bHZ3QnIybjltbGZCL2dmOWxiVnRVMGZVdnNrdjIrNU4xT3pxWnJ0d3BBOHh6Z3JHUU9GSGY2MXk0dVVZU2l1cHRocVU2aWM3YUh6TDRaTW1sK0RMQ1dDUUFIT1N3QkdDcEJydHYyQUxTd3U5RzhYV3R4cFc2VnB5elRsdG9JSUlBSlB1Y2c1NjF3ZmgyZEwzd0xaM2ZtWVZGenRmMkI5SzlGL1lWMDJ6MUc1OFQyODA3UmVmTEFJWFJqOHg4ek8zR2VBUnpqdlhvWWJXSjUrT1RXaDh6L3RCZURZL0JYeEQxYlRyYVJaWTJ1elBFUWNreHZ5RDdkUitkUmZCZTRqYlhXdEpBVmVSRHRPY1o0cnUvd0JxUHd5MWg4WDd1MW5JakJ0bGR5M0lJQko0OWp4elhtZnc5dkpkSDhlMkVrYllqKzBnT1RqQlVrMWxXU2R5c0xLMXJuYWVJOUx0TlJ0THpVcEFEOWtmRVJ6MGIvSUhGWVdwVzA3NmZCTGNJZDBzZVZ6M3h4WFUyL2hieEJkK0ROYzhYNmhvOXcrbVM2bjVNVjByQlVWd1NlRDNPSzV6eEFVRnBZTHBNOGpRcjhvaG5QeklUeWYxeitGWXdUakE2Wk5Ta1pVbXV4eVhVYVNSc0hSQXBjSHIrRlMySGlXNzBEeEphWDk1cEJ1TFlTS1hpa0hFcVo1SFBHZlN0ZnhOcXRscW1rYVpaMk9nd3d2YlBpN3VJMUdXT0IxTmN4citwM1YvcUFrT1FrWkFSUjBxckptV3FaMTNqWTZETHJ6NnY0WERMWTNDaDRMYVFBUEFUZ2xUeDY5eFdEcU8rVzhqaldZWjI1SzlLZ3VkVUV0c2tjMlJ3TWYvQUs2bXRrUjVJM2RlY1lGWnlPaW0yeU1Xc2lYS08yTUJzK2xiWGl2eXBsczg0QkNlbFJXUGhYWEwyR2J4RmFXSmV6dHo4OHJUS01kT01kNlR4UDhBdko3Y3FRUjVRNEhhc0piblhCSklxUWhSSXgzY0JjMURmdEtrY1QzRGJmTTZFZHZ3K2xXNGJOMHVsZVViVlpPYytsV2Jxd2oxR05Jb1J1SUFFWjk2bHRKbFRUNVM5NFB2N0JyQ2ZUcDdZUmk0ZGR0M25uakhHTzRKTmF0OGtJaE1FNTNPeWZLZzZZUCtmMXJsZE9XZTMxcVRRREd5dFo0RXFuam11MHQ0N2E0MDZScFFxelc0d0FSeVJ4WExpUGlSMDROM1RPYVdBZVpzWTVDRHBucFYrSGN0bTNtcXdBWDVRUWF5Tk1aNTlTZkRIQkpPUHhyYnVidlV0VHRUQmV6RENEOTNoY2YvQUs2eGs3TkhWRjNWekkxS1VtQzVUSUxDTG5IZXNxeWVWN0lvWWdTdlRqcFVxeXpUelQyamdxVEZqY1FPMU1pYU9QeTRnU01qQllkcTIyUmplOGpxZEtpbWJ3L0VoVWc1NEI2R3VhMW1WazEyUzJXTE9FNHgwRmRmNWNkcHBkcEEwVW02UlN3TmNscWNGeXV0elhSYkNsRGpwV0ZHeW16YkUvdzBabmtzbHcwak9tRzdrMUxaUlJyZEpLa29PSHljR29uQ2VXemdjVTNSV1RjekJ1UStBUFN1NlR2VFBPaWtwSTFZYlEvYUpwaTNIbVpBTkU1dWJtWHk3Uk1aUDNRT2FsQ3hKRTdMTGtqcXZYbXZRZjJQckxSTlorTjBPbStLR2k4aDlLdXlubWpJM2lNN1RXTUk4ek91VS9adzBQUHJEVHBiaDBpbk8xeG5CejBOVk5aMHU4c3B6OXViRzBjTG50aXVuMXpTNG90U3VyYXp1RkpGdzRES2ZRbkgwNjFWOFg2YWtra01Vc201dnNhbjNKcVZMbG5ZdTNQVFRPYXZaRC9aY01TSEtlZDBBNjA5dE1rODdjOG14Qjk4Wjk2bHZMRTIra0NWVzZTaHNIdFcxb3VsSnFNVTkzS054WUFiUjZZcldObVlOV1F6d2xaYUpKSTltc1lFV3pjOGpqazhkUDAvV3VrbjFuUjlQMCtPMjB4WXBMWnhpU0o4WkI0Nkg4T3Rjd3NzVnJlRzN0RGhYSlZ5SzBJTklzSXN1WmlZK09jOUJYUkIyUngzY21WWmRHMUs2bWE4dVpGamh5VEZFaDZpbTJsOURaek5Nc3FoVUJCQk5YdkVLcHFXblJmMkxJVVZmbERINlZ6UzZEck5sQTh0OTh5RlRodDJlMUp1N05Va2tObTFVM3M3U1dzTE5FWDI3c2NaOVByMXFhUFQ3alhJNVJLd1I0b3l4R2VNVnArRU5aOE8ydndwMTd3MXFOdi9BTVRLYlVvTG5UcGNkZ01PdjVZcHZ3dzB5NDFieEtkTk1uTnphVHFtZW03WVdBSDQ4VWJscHEycFQxWFJyV1VXZjJoY1JpUDVqMXJLbTBpM25rYVdBWmpQUUVZeDcxZnRyclU3K2JaSkdma1hDcnQ0NFBTci93Qmx1YmFNTSt3SXhHNzVlbnJTMkp1bXpFdnJHNWJUb2JhSlRzVnVBQlVEYUVzVWtRMU1Oc0xZYm5wWFhaOFB4cXJXc2pOSWk4Nysvd0NkWldzYTNCZFErVXFoU0R3YzlEUXJ0aWsxWXd4cGQzZmFwTEJhd25ZaHdpa2NBVVMrRzlRczVYa3VGQ3FveUJ1Rlc3dlZidlQ0RmxodVVCYjd6SjFxdXQ2enhHNHVKM2ZJOWM4VjBSZzJjYzVwR3I0WXR0SzArL3ROVTFqU3Z0dG9rNnRjMml2c015RDd5Z2pwbXA5UmJ3WGRhOWU2MTRkMGVmVDRaSlM5blpUVCtaNUMvd0IzZmpucml1YUY5ZE1nVjd2YXFqQ0xuc2FrU2U0dHlCWkNPWXUzeitaMEZieGpaR0QxRXUxYzNSSTNFYnpsQms1cnFQaEg0dXYvQUF4cWx6Zlhsc1d0THEwZTBuaGxIREtlTy9IZmcrMVpHbVRHMHZWbmh1UG1jWVpTbzRQdFR0V212TEo5L2tGa0F5R3hoUndPQldpV2hqT0tRM1h0QmhpdXByblN5RmpjRWlIK0pSeGdWMm43SS9ndTE4YS9GSzAwZSt5RldKcFI2N2tJUC9zb3J5bld2RWQvSktza1RGRlZ2dWp1YTczOW56NGhYL2czNHE2UnIrbnJ0LzBoWTV3VjQyTnczQjlxbWJhUUtNYlhIK090TjFQd2QrMUY0NTArU3pkYmVMWDd1Slp5aEFWbU85UUNlTTRINVpxYlI5SHNieDIrMTJ3MnlaS3lZNjU3VjJIeG4xeUh4ZDQvOGFhZmF4S2sxejQ2czdrT1Z3Um0wZFd6MTlNNUhCcmxMSFUwOEZYeGcxZUw3VEZuN3k0eUQ2NC9DcGhLN1NJdWtpMUw0UmpSditKYTdLQ2NqYXBQVDBxanFPbmFuYzNwaW5CVXh4L016REJQNTFzNlQ0bktYTTk5YlJoN2VVRXhLdzZEMDlxZ1R4SGZ6YWtia1drVGdncXlzdkdQOGNWdTBqTlNkekgwMk5MZTlqbUVtQ2pmSVFlNHJxckc0dmRiaXVJTHVMZVZqWmhoUndQZjBybk5QczdGNzJaVHZEN2o1YWtnNXllbGRINFIxWjlFUzl2THUxM0ZyRjRnQ1B1c1RnSG1vWnZHWnhHdFdqSlB2U1Zkb2ZJamNaQkdhbHY0b1pHaVNlQXhrb05ubHR4Vnk5MDZHTmcwamgrT3g2Y1p4L24xcVNhMiszNko5b0JKa3RsNEgrenhXVDNPdU5rZzBtT1MwUnJoN2tTZ0tRZ3g3VkxwV3B4VE10bmR4NEdDVHgySEkvQ3Nhd3U3aFN3aVhlVWZuSjlEMHJaMDQydXAzTEZtQ3lMQVRodU0xbTNabTBVbkc2S054YTZKUGRTSHlpdVNjRTFrM1BoaDFsYS8wMlZHUkJrSTNVMTAwMWdIdGZudHNBcHl4R01WUmhzcExLTWllUU5HemNIZFdjcWNaYWx4cVNnYzlZYXpBWGVLYVh5bTM1T09COVJYcC9nNzRoM2VrZUdqcEU5a2RSaUtiM2dDN2lGN25uUHZYRTZqNEhnMUd5TitvNEJ6a2ZuV2Q0TThXNmo0RzhWU1F3WGFyRE5CNUx0SXVSdFAxck5KdzBLazFOcTUxOXg0TThBK1BGYS8wR045S3ZzNUNqSVVOOU9uV3NtTFRQR25odStUVDlhdFRMYjV3bDdHdnk0N2Y1OTY2cncvNG44T1JYRzZlZUlJM0xsaU9EMU9lS2ZjK085TGwrMTJHbHNKTGFlVlZpWnNISHFSN1V1VlRSYXFPQWx2L1lsemFBWEZzV3ZiWUJvY1l3UjBJWWZtYXlMbUxlWlpFMUVySThiZktlaDR6VzFkYVpwbk0xcmVsWjVSakc3ci9ubXVBMUxWZFJ0ZFhmVForQ3JFRS8xL0xOWXVuTlNPaUZhbW82bm9Qd0w4SmlYVWZMZTEzM0xMdUdCMEdheFBqTDRNMW5TZkhrZCtiZDJHL0tsVit1TVYxZndEMXVlTHhQY1FoY3VMVUdOajZEMS9TdmNmRVh3TDhkK0l2aDdkZkZxNThNSlBZYVRNa2x3NkViZ3VSbHNkMTU2KzlkVWFmYzh1ZU4vZVdQbXo0WWVONWRLMUQrd3RSaTJuemVoWHBrOTY5SitJdWxlSHRhMENPQzFDZWR0M013eGtlLzZpdVorTXVrZUg5TitMUjFYUUlFRnRjV2tVMFNvZUFkdlBUdlUybWFsYmFpNXRaV0pEb1FUazhVbWttZGtaZTBqZEdKNHAwWFZiTHc5SGZhVElaRnRpQ1ZVOXNWZjhHK0xKbWowMjAxUldpbGFjRUs0eHg2ODlxZDRkU2Q1cDlMYTczUXJLTXFSbmdIbnJXOXFXbWFONDk4UzI4MmxrUnJZb0VRcDdjSG9LbVVVOVVDazA3TTMvQUJCTXQzZmZhYmR4NWhHTWVnelZiVEVuZ0JndVU1eHcvcm5GWmVxMitxNkxmTEhjRXVuR0c5ZjhLMmRPdlVuZ1JybmdsZUJqclVvdDJzWERJVXN4TkVlVjdnOWFwYWxjMjk3YVl1TWZPTUZqd0tzL1pydVRUYmhvR1VoUmxGTllkKzl3Mm1CSjAyUHVCQUZNVVVVZkVObWRJaXRab3p0Vmp3UU9sYk9rYTBza2dzcEY4d1BCc0pmc081QitsWnVxSzd4VzhiL3ZGUnpnTnpqaXRUUTlPdGRRMXUxanR5RlpnQXg3Q2xZMXZaR0hxRnExaEhlYUhCS1hpdWo4eU55UWVLMXRHaWp0dEVtMDJ6ZzJpS0xhUjc5LzUxei9BSXh2VG9IanFYVEhPZHM0d1FPZVQvOEFXcnF0Rm5lSzRrVzRoQUUrTnd4MkkvOEFybXJnazVHRTNvWWQ5cE02NmExMVp5c0hqTzVjZCtsYzh1dHgrSTdkNFJJQk5BY09NOThZL0hOZWxQb3R2ZFdkMjhiWldKQ1B3eHdmMHJ5VzMwUzRzcmpVTCsyQjJOTnhqMHpVWWx1TTBrYTRmNGJucEh3eU45cUpUVEwxbGFPTTdrRDRHY1lxSDRuNnhjeGEwcTJoVUxHUUdVYzdlZjVWSjRNaHRmN0grMnp5dEdkb0tzdlhQRmNkNC8xNDJaKzFndEl2VE9PZWxiVXZnTTZ6dEk2M1RKWVo0eEsxd3NRV0V5WmxPQ01ZYjhxMlBoa25oYlhOU1M5dTc0dGNDY0JDM3AwUE9PZTM1MTRMcm54YXVkYjhVVzNoZS94YWVRaWhWRFlMaHUrYTl1K0dmZ2pYTG0xZzFudzNDdDBJMDNtT0VEZDh2Zm50N1YweGFzZWZWY3BNNmZXL0RkaGNhemVISzVXYllQbUIrblR2MHJ4ajRyK0hKN1R4OVoyUmtBUXpLeWdIdGtudFhiUlQrSnIzVjdtN2tzWnZ0Q3lzd1VieHNJUFJoL25yVGJyNGVlSU5mMWIvQUlTTHhCREtESEdmSmxkV3dUemdET08xVkpYV2hrcEpiczVIWHZERWZpOUd0WTU5c2luS042R3ZvLzhBNEp0NnRySGpiNFYvRjM0TitMM2U1VHc3NEhsdWRLbWxETTBHMStWVmljZ1pHZlRGZk0zaC93QVZYQ2VJVHBLUUh6Qk1VSlBQSWJIVHYvalgwaCt6MzRnay9aajEvd0FkV3ZpRFRSdjhiK0E1Yk9DWWhRVWtmQkhVblBmajNxYUYxSzdDczFLRnVwODBXVjVKcmZqNlVETytPSDVuR2VjZFB3cnBQQ0dtdHB2aTE3cGx5Q2ZsUFByWEllRGJtSzIrTTJwMjFwaDRZb3RneDZnYzE2Ym9VRzYvWnBJdm1PZHVCNzBKcHlOVnBEVXIvRUNOWnBEY3lmeEw4bmJIZXVjOEYzUmoweTkwM2VDZDI0VjF2eGFqU3owbU80aFhobEFKQXJ5aTI4WHJvVjM5cDZKMVlNZmVyVHNZWHZvZlNmaFQ0TmVKOVErRDF6ZUNMeXA3dUVtRm1VQTdOdVIrZURqSFhuMHJtL0MwK3RUL0FBcTEvd0FGL2FXVjdMVW9MeVNKMzRTSmx3L0F3ZjhBOWRmUnZ3VzFuL2hZZmhDSzFld1d5YVBSSVpMTkdLN1dVcVZ5Q2VBQVc1SFlacndTNThOVytpL0VXK3M0cFQ1ZDVZeVFUNWNGUXk1d0NjakorWEk2OWM4MTgvS3JPdGlaWDZIME5xVkhCeFVkMmVIK0ZicTcvd0NFRXRiSXgvSXNlQ1FlY0U5ZjUxN1ordy9vbHBiYWplYXJieWpjMnMyVWF4TS9JVnQrT25iSnhYaWVoeUMzOEIyOTQ1eWl4L05uOGE5Qi9aZW04UWFwTjRnazBPOWVHVkxLT2V6WUhBU1NPVldVOWNkQVIrZGZRWVYyZ2ZPNWhHOGppUDI5b0o0LzJnTlJDTVJGR2l4cU9tU3BPUlhpMER5SVRkUTVKaStiY0IweFgxRiszZDhJUEZPbmFucU9yK0laNDdpNVc0RThWOUNNQ2VPUlZjWkhZanBYeVhvdXI2bEJjTlpXcHdKQVZmNWVvNDdVVFQ1aktHa0ZZOTU4RS9IaStzLzJWZFIrRTE1b29tanZ0YTgrSzdJNUdPb0p4bHUxZWIyTTBkNWVSQmlWM1NiaUc0SDRWa2FCZmF0RmROcGp5UDVJWWxZc25hUGV0WXA1YzRkRndNOWh6bXNwdXlzYlVsZDNINlByN2FOcnNubldpM1Z0TElVdUlTUHZMbnNleHEzNHQ4RVdjd0d1K0M1L3RWc1UzU1dySDkvYm4vYUg4UUdlb3JEbWhGeGVyR0R0ekp3TThrNXJvdkVXaGVKdkNsbGE2MUhDd2c0VXp4Zy9MM3huMSt0UW1VMXFjdXRwTTEyZlBaZmtIM1IwSFBRaXRPMmt0MmJ5RENWa1VZM0VjVm82V05NOFF5M0Z4TGVSUVhzZHNYakVoQVdmamtZL3ZWbTJ6aHRVTXFxRlJsR0Z4N1kvT29renFvcE1jcnV0MHRvODdaZHZ1Z25CL3BUcjZOMnZRcFluYVFNWnpUOTBTYXdqcW9ZSnlHSGFwTHh6TGZiaGdGdW5GWXlOa3RTemNrRzFWcDBJSUhBRk11cjFOSTBsTDFHSG1OT2dpSHFjOFZIcnQ3RnArbTVtYjVqMDkvcFZYdy9vZXBhcmUybXNhaTVhMmpjRzJnSzU1NHdTUFRyVWNuTXk2dFZKV1IzWGcrejB2Vi9pNWM2cjRsc1NsdHFkcW91SlZVNGdrQ2ZlOU93NTk2aThSMmxwYjZwZWpSTlFXZTNSbVZaMVAzZ09sYU4zNFc4UVBvMnFhdTNpQm96YXh3cFBZd3JnYkplbko5cTUrMFdIVE5La3RZRktnb2Z2SHY4QTFybnJSdkxRM3cwbENEYk1iVExmN0pxSWU1NFF0MjdqTmRGZFdpV2tiTUVPSkYzSjZnWXJsYkhYb251RlJtRE1yY0FqcWE3SzhlNm5saW1mbmRCOHFnOEQycmxyWFUxYzdNUEtNcWJzY2Jza2gxZVJwRndUbkFGVm83aUczMVJaTGxCNVN0a3FSMTVxM3FGLzVHcks3QUFNVGdBY0FWem1zWHFtL2JheCs5d1Y2WnJyaXJ4T2FiNVpYUFIvK0VobTFtMGp1cHJZSWxwdFdORi91a1ZsYXJHRGF6WFRBY2dsU08zY1Uvd3F4bjBNd1RTS0JKSDBQWEk2VkhMSDVkbE8wMG5JVWphYTVvKzdVc2QwNHFWSzV5dGpLMXhJNlNEREErbEdtbElwN2piMUVneGlsdEVWREpJRGpKeVBXbHNsaUVjek1wQkRacjBrcnhzZVJMYzBZMmMzRXV3bmNXeU9PMk0wNjExUys4TzZzbW9XTWpSU0tHQmtRNHdEd2YwcTQxcXVucTlvMFNQS0kwYnpvMzNBcVFwSDQxbTNWekZKTWdtWUVFOEgxckpxeDBSWFBHeDBXbld0d1poY1RISG54Ymh6MHAyc3czSnVvV2hmRENFRGMzY2Y0VkJaMzdTUkNZM0FLSkhqMlduZUliNnh2VWdtVzVLUnh4QUZlNU5jZG02dHp1WHUwckZTL3dCcnhlUkttYzR5RjZEM3F6QkxxK2kyeGx0cmRYam5RRDVqeUNhajB6VUlaN1F4V3FiMnlBZHc1QnE3ZndDT0ZHbG5BWGJoL216am4vNjlka1VjRlZ0Nkl6ekxiSGNzY0cyVVI1TFl6ODNjZnBVcmFsRGEya2NRUG1UT0J1VHJ0QTlhVFNsZ3Y5UUZocHlsbmtiL0FGaFhvS3VhejRmRmxlUERZV2Y3dDAyR1p2NzNmSHRXeU9ibHRxUVhsN05QNFdhNlVCQkROakNjY1ZoU2E1YzNGaEpieXlrZ3J4bnZWMVduMHJSTlJzN3lRU0NNeHN2Zk9ULytxc0cyU2U3SjJJUWg2OGRLZTVhUmF1N2lBUVJwR01OdEdRSzZYNFRKRnBQamJROVV1NU1wL2E5dVpGUFRZWENzUHlKckJzTk9hV2NKTFpaVkJreU1lQjcxYjBWTHVXN055dDh1MkVsbzFRL2RLa0grbFZIY2lic2pxUGpCcE5oOE8vaXRyL2hlemhDbTAxV2FPTmZMNDI3dVB3eGlzSVNTZVJQZTNOeUZBWElpL3dEclYzUDdVNjJIL0MyYnJ4S3Rydk9wV3RwZUt3SDNqSkFqRSsvT2E4eHU5WkRoMmxpeWRoQlUvd0EvZXRIVFRaaEdwcFlMVjdqVVF6cXdqVnVnQXhnMVFzTlBzbldVNnBjTjhzbUJnMHJhamVSMjhTV3liWTJIUUR2VlU2blA5byt4cGE3aTU2OWNIdC9XcmpGSXlxU0xHbzZkb01FY2MxdDVrcExBWVpxaTFYVzJFUWdndEZSQVFCaGV0ZFA0Wmk4TmFpVHBldjJua3hTd2VXSjA2d1NBL2Z4MzlLNXpXOUhoczdvV2pYZ2tFVDRKUmVENmZtSzJTWFF5dmNyVFdtNk5Ma29RR0hHYXZXVnRERGJMSS9BWSt0VFR3UGNhYWtOODVpZGNHR0lEcU1EdldjSkpiZmJDemNEbFJWSVY3RmlaSHRwakpia1l5TW5kd0s2cnducU9udEMyajZsdGVHNmh3cjhaVnZXc0xTZEgwN1Z5WDFDVjQ0enhsV0hHZjUxcTZ0b09pZUhGaEdsWEpaZG9KWXRuTGZYSFRyVHZZeHJPNXRXSHc4OFB5SVRjMml1UWNnWnozNEovT292QU9sNk5OOFVMVFFySFJ0OGtzbmxRQmNaOHpCd2VlMy8xL1NzU0R4YjRxdUpERHBGaEpLQjh1NGpqSEZkTjhNL0QvaWVYeHhwR3RXNkUzRVdwUXlPcUxrUi9NTnhQdGc5OFVTY2VVd1Y3bXg4Ui9EMFdpL0ZqeHBwOW5vczhkOVk2bllYRXFMS0hDUXlXNXkzSEpHNGcrbk5jMlBEOXpmdDVwdDNmZDF5dkJINVYybHQ0bmY0Zy90WmVQTmEwMXNXT29xYmUyWlNBcEVBalJjRE9COTNqclhTK0lQaHZjMnR3THhyMmFDM3dTWVVkY0RwOHVmOEFPUlhKN1dNWm5VcURuRTRHYndlK2w2VEZLbWRyZFY2SC9QMHFyQjRkdXBaSFdQYXBZL2NMQUU5dnhyclBOczdXOFN3ZTdpVzNmaFBObSs0UjduMXgrdFN3ZUViYldOWFdHVzZnRWlTN1MvMnBWQVhybkdjZTNVY211ajJxWkRwY2lPSnQ3YjdKckVVYnB5cllKNU9LM3JnV052cDl6SENRN0hQbUtvNXhnMVo4YWFMYmVCOWFrR3RYZHUwVnZob1pnNmxXM0RoZUNlZUNPVG5OWW1pYXJwUGlNYXROTGRDQ0ZOS211MXVBTndFcWo5M0gxeGxpY0E1cXR6RG5jWkhQMzhpUjI3WHJSUGxwaXJxZXdQVDhLMlBobkxCZWF3K2dtMWl1SDFDeHViV0FTT0FCSThSS3Z5T3hBTlRTNlBiNnJwc0thZVVZUlFvTGhGN09SME9PaDVybm4wVzkwN1hJNW9wcEkxaWNNTmh3VndQOGlwY2RUcWpOeWpZb1dtblMvYXB3a3hWNHpnODl4ai9DdEx3emUyOXRxSi90QzFXVUdOa09mVS94Wm8wdVMyaUV6RkNXa1lsU2ZyNjFBK2wzaGN6V2tpN1dicjZWaExjN0tWMUUwMzFTVlpGc3l4TUpHQmpyalByVFo5T2hsSDdnOWVnem1uMnlXa3NVY0c4Rms0T1QvblBXbUNOenFEcDVwQmo1WG5HZWFuVXJtSTdpOXVyRzBYU2JpSXBHVG5KNzFqWGZoS3oxM1cwaGprQ1pYTE9EMEhXdWprU0xVd0lwM09VNkhIRk5zN0dLUzRVd3RpUnZsSkI2Z1ZMUmNMTm5OK0kvQ1VObHA3VzJrSTVaVGhwQ2NsdU8xWWR2NHFtMG0xU3d2YlYwV01qRGpwOWYxcnZ0WVc0MDFqYlRSY0ZlR0k2L1N1UTF1SzFua2x0UkdDRHlPT0t6TGtrMmJHbitJMVMzUy9GM3ZrY2d4amQwck84YTIrb0xlblZFK1l5QUhJQTY0NlVtaitEemNXYXRhWFlWMUdWUmpuUHRXOXBGaExlVzMyVFZHRFRJQ3VEejJxWXl0SXAwMDQyT2gvWlkrS25nQ3o4VHkrRS9IVXIyRStvb2x0YTM4bkVjYjdoeXhISXptdnNYeHo4VS9FL3dYOFBYM2hDNzF1eG50TmZzbmp0b0k1UTZtTmdGM0FIT01nZGErQ0lmQytrYWw0cU9qWGRvUTRiSWNEQVA1VjFzc21wNlhxa05uYzMwOHF3UmhJQzhwYmFvN0QwRmRNWkpubXl3Mzd5NW8vRWJTdFVrUDlwUXNaRmlYQ25QUmZUK2ZOWnZoalZBdHVKWjVRR0F3UHlycUxiVm9wTExicUIzNUFBM1k5UDVWeUhpUFJKWUNiM1EzM3I5N1lwL0gvUDFyT3RGdlk5SER5NUhabXpvRXMxamZQSi9CTHdEbjNyWnU3dXg4SDM5c3VseU1zMHB6TGsvNTcxaWZEMjhnOFFhZXNGOWNMYnVsd0l5WE9PYXYrSnZDOXlOYVU3ek1xZ2JaRTV5S3poZTJwcE96ZHpyNTcrTFU0RW5ua1VuQTVJcU5KWk5QbUQzc2JJcmZjWmw0L0NzZTJUeXJkSXJqS2xNQUtPdGJzc3J6YVR5ZHlyR1dHUm5hUjNxbW5jRzBrYjJoK1RMYkZ3NEtuKzdXZDRtMHFJZ0pFUmtqT1FLMGZBbmtHeVc5akFJYTJROGpxZWVPYXErSlNKcHdxL0lWZmdDcEZGczV6VVFscHA4bjJnL2N1RlFBZzVQeTFyK0Q3dTF0cnBOUVk1VkJuSTVJOS8xcm45Y3VwYm5TcmJTSmJjTElMbDVwWmM4dGtnTCtsU2FISjloam50ak51eEhucjE0b05rcmxueHA0TGc4V3ZjK045THZsYVdPNkNUUVp5eWpzZmJwWFN4UjJsNXAxcVpVRWNnUUxJM1lqRmNGb3Q5Y1FTM0dwSk9RaXpZWlMzWG4wcjBqU2RPaDhTYVJIYzJqamVvQmNkTVlGWFQzdWMwM1oyWmphenF6K0g5SzFDN2lIbUkwWkNNRHg5Y2QrdFl2aG5TbW44Sm02YTNIK2xNV1BIclc3NDcwS1Y5QnViYU1uSWlQbHFPNTl2ZmlxUHcvMUZtOEZXMW5QYmZNckdOMngweC9rMU0xZXBkbFFsWmFGR3hlNHMydDlNbUdFYVVnWUdLNS93QVQ2ZEJmL2JMVUFNVlk3UU9jR3V2MTYwYTBuc0FGemxpNWNEdDZWaVdlblc4ZDljS3Frc1dKQUo3WnpXc2RJRXpkNUpIenI4WjlLdm8vRWtPclFsa2RJbFhLOEU0NkhOZWtmczlmSHZ4NzROUzJ1ckcvMm0wbVdURWk3dDRHT0Ruc2Ntbi9BQlI4STIrcFh5d1FJdTkzQzRQdWF5MThOUmVIUEV6NmZiN1JHRWpBVURHV3gvOEFycVkxR3pLZEZKM1B2RDlrL3dEYVcrR0hqM3hacGt2eEkrQ0dneFhWcHJadnJpNDA0bmRleFBqOXk2TWNIR2M3aDZmV3ZjZitDZ2RyOEx2RWVxK0d0YitFdWhXdHBwOTVwNVlSVzhLeG5jRzZiUU9DQXhBTmZuOThMYjZid3BmMnVyU3E2NUF5VkhRWkhUajNyM3JWZmpaZitJTmM4TDZDSnZNaWh0NVcrWUhiaHNjY25HUDVWN1ZHVUhRZDl6d2E4Wnh4S3M5RDVVOFk2UEw0Vi9hakdnUXF3enJrYXJFZXZKQkkvT3ZjL3dCcnp4SnJOcjRwMG5RN3l5VzNFTmlxd3RFdTNJeDNBNEJ5SzhOL2FpMDdYdkIzN1FyK1A5UER5eFhOK2w1QXpjZ09vR1Y2K3RlbGZ0SC9BQlBzdmk3cC9oenhacFJXU1pMSlRlS21NUnYzSFRqclhKRlI1Wkk3Wjh6bkd4NDk4Sk5JdWwrSU9vM0VpSGMwaDc5ZWE5bXRyV0cwblh6U0FXQkN0akdUbXVBK0diSkpyOHQwMEl6SStDUlhxR3QyMGIyc1Y3TzZJeFlLa1k5U0FkMzA0cm1weHNkTmQrNlZmaU5wcTZyb0ZwWXdCV21tT0VVSHJqbXZCUGlSNE4xT3hMaTNRNUJJNUdCeWE5MStIS2F6NHI4Zk5BQVpiZlNOSWtsY0RPQXgrVWZqV2Y0dThLUHFyVHJKYmhjSWNOanYyL0RtdXFFT1pIbnVweXZVODMvWm8vYkg4Vy9CTFc1ZkN2aStXWFZQRHQxYXRhM1ZyUEx5aWtjYkRqSTVMZFBiMHIxM1hmRy9nSys4S3grSmZCbDdxSGxMdU1WcmNLV0RLMjNHWkJ3UU56Y0VBZ2RUWGhYaVA0SkZyQzg4UVc2a2xKVG5nVmYrRmNIaXpUSUcwbXgxR1dLQ1lFU1E1eXJEanNmNTFnc05UVTcyT2gxNU9LVnk3NGMwMk82K0hIMk5pV2VOY2dBYzhIK1ZlNi9zSCtEcm5WZkVrbWlhSFptVzV2b0hnV0Z5QmxqamtaSEk1elhpbmcyL3R4NFdQMnFKakVzWjNJdlVqak5ld2ZzUS9FTFJQQTl2NGorSk10dTBkN29Oc0xuVFM3NTJFTXVCZ2RjZ0d0TUpia0RNRytabldmOEFCUjNHZzZuUDRidjJMejI5ckdqNTVPUWc2WTR4a0RINDE4UC9BQWowSFROVCtKMEVPcjdZN2Q1L25MRGhSdjYvaFgxLysyajRxaCtOZXFhbDhUOUNPNnlrc0VudzJNcVc1T1FPaEJyNDJpbXZOSzFwWkxNTXBaL3ZEMzU0L09wck4rMXNaMGtwWWM3cjQxZUJ2K0ZUZkVHODBNNmNNWEVTeVE1QitWWHl5bm4yL2xYSUlzeWlPVXlaREhrVjJIeGg4ZDZsOFUvRUZ0cWVyQU5kVzlsRGJrZy9lMkRBL0d1TmlTWkxrSTV3dzZLVFdVOWplZ2lycXRqY0M0RWtMa04xWEhIZXRhNitJZmlqVS9DOGZndSt1ayt5SzRaaUUrZHNkTW4wcEwrQXQ1Y3FzTUljc01kcXlyNkhEaWRPN1p4N1ZsekhVNEpzbXNyVzM4NVpKRXlxTmtjOGRjNHE3b3VwYUJKcThrT3Q2Wk41YnVQTHVMWjhsUm4wcUoyaWtnRDI4WmpHekJ6M09LejRoNWs3SE9NZERVdVYyWEJjaDBseG8xamEzMCtwSFZiZWF5VmdJd2wycTNDazRPREdlZVBXcWx6ZTZFczIrQ3d1SkFEa01iakEvbFdKSEF6WFcvWmxnZnZZeWF2MjZ0Y3hTSHlzTUY0UHJ4M3BYVmdhZHkxQnFHajNXb2k5MXJTNUp2TEk4cEMrVi9IMXJwTGJXclM4MUN6bGhSSWcwcUlZRk9WQzVIUFd1TWtTUklGQk9lZW83VnErRmRPOC9Xb2JwV0l3UU1EdHlPbFMybEZzcU1VMmE2YTE0bDAzNG0rUHJDNXVIV09LL1dCWTJQRzFXT3pHZjluSE5aSGlTNDFDZTBhZTJ2Zkt6d3lZN2Q2NjM0cld6MkhpSFV0ZHViWVF5YXpCYnpwTDNrWlUyTm4zNHJoYjJhV1hTR2Rud1MvVTF6KzBVM2M2RlRzbkJtYnBGbThWN0hOZU9DMjRFZWgvenpYbzFwcXplWEM4a1hTTXFRVHowNjVybE5BMHlPNlR5NUdET3Y4QUVUL0t0Tzl1MXRvaGJPMkhYbzNldVd2ZWRSSGJSajdLQmd0cDEzcVdvVDNEQUNDQnlXSSt2NjFsYXRIYU5PV2pUR08rT3RhMXZxTjg4OHVuRlNrSmZMc1FlZnhxdHFWdkcwQ2dCUVMyQVN2YjFycFdpT2VhY2syYm5oMVpEcCs5bE9FakE0NkRQYXBaeEZOWVNpNG1WV3h4dWJINDFiMHUvd0JGMDd3emRXRTJycEZMSzhMd3hQRVdNdUFRVjNkajBxcHFNTm90dElVaUU1S245NFQyNDZZcm12NzUycVY2TmpsblZFRDdXQnlUOHdxSzNNNnMwS25uYVRuTkVzem9oaENBRHZnZnBTVzF0cU53SjUxdG5JU01sbkErNks5R0d4NU03Sm1yb004a2lTUnNCOTNBVW5xZUJSTDRkR3BKZFNDOVdPVzI4dDRZV1BNcWxzSEh1QnpWUFJvN3duN1JicTdlU3BMRlQyTkxOZWI3a05PellYN3V6c08xUk5YTllWRW9tMXIzMkhTTGVHMXN1TU1vY0U4bkFINS8vV3JOTjBkU0paUjBmQ3AyeGlxUzIwbDNQaEpISUl3Ti9VQ3VnMHJUWTlNMHlTN3VZeVpHZkVaeDFybWxvZHRPVG5Fc2FYWnhhZnA2enhLZDdQdWJzY2Y0VTIrYVc0bE1vakpYa042VXVuejM5eVpFQmpqalJjdXpmblZLNFowamtpczlRZmJKbjVTT3RhUXUwWTFPVkdwb091V2ZocTVYV1lvNDVIaGtCVkc2Tm5HZUt0ZU1mSDFqcThodTlMait5aVNZU2JTZDJ6S2dFWjc1SkpyaXByZTlBQWxtd004RFBhckVJdFl4L3BDTktpajVRUFhOZEVUbG0yYkhoYlR4cjZhdkJPQ1YvczluSmIxVnVLejdTU3lzMThnc3JBcm5kNzBuaFBVNytIVko3RzArVVRXa3FOeDI1NHFsRm9XcXRJVmtaVkFPQ1MzV3JjV1JHb2lTNTE1NUovN1BVSG5nbFRWcnc5Wnd4M2dkV3dBU0N2cHgrdFV0WTBhNTBFUTZpeWVhVDJUdFZFYXplYnpKRGJ2SDVuT1NPbitjMVVZc3luTzdQWmZqakxiM2ZocndoNHA4NWNYWGh1SzNra0lKL2VRTzBSQlBzQUs4bGFlM2x1Wko0R0RJSStUamhjOVB6cjFMeEJwOFdvL3NnK0hOWXVQbmwwL3hOZXdNVDFDdUZjRDgrMWNMNE9PaVIrSDlVME84dFF0enFMd20xdUdPTmdWdVZKOU9hN09YUTRsUFVweE5ZTFlwSndKTURDNDZIbmlsc0pMU3p2QnFNa0NzeS9kUXJXMzRoOENwcE5qR0xIVUxhOHVKUG5sUzFiUGxqSHJYTFhsOGtFWGtmWnp1UWpQSElOUWxxS1VteTlxUGlxSzdsWXBwNGpZNDNGVHp4L1dzWFU1THVmOEFmSXhCemxSaXJXazJkMWUzakdWTXh0a3MyM0dLbnZ0SzNPYmVDNGpRS2NCMzZWcWtDYU15TFY3eTJsV0svUXU3THdTM09Ldng2ellFSk5lYVY1Nng1M0RPTTVIQi9sVkxVbzdTQzNXSkpYdVp4eThoSHlqMkhyVm5RQmNYS05ieFdXN2YzSy81OWFET3BKM0wrbFIvYkZpYXpmTy9wQ0R6MTQvTCtsYVUrazZqS1ZlOHRIWTdnRmoybkxmcDcxSEJwc1dtZ0xKWnNKRitaWFJ1aHIwVDRUNkMzaVB4RHA5L2NYVEpETmRKRExLeC93QlV3K2JvY0R0NjFNNUtLdVpheVpENFYrRlB4RTFueW83N1FqcEVDd2VmNXQ5RVVMUkRHU0ZQSkhYcDdWNkhvVnZMNE4wVytzTEtTRFQ3VzVaMGt1MUc2NXVoa0VxcC9oUWdIR09mcFZYV3ZpWGFlSnZFdXBmRXJ4UHJjODF0WmI3V3ppbGsrU0dDTWpoUU9xazVJd2MvTlcxK3pyb3Qvd0RIcnh3ZkdXdHgvWjlFc1hiN0VaaVVWeXArOGV2T0RYa1l6Rk9uU2Nuc2VqUXc4WFpkVHAvaFA4S1BoN2JlSG9yMlh3eEdYbEdTYmhNUG5xTUhxZWVmVG12VU5DK0FuaDd4ZjRTdUxHVFF2S2NLVEU0QkxML2RQMHJ1ZkIvd2IwaTgxdVBUbzlUdDJzVWtIbFhLQUhPTWpBNmpnWTlxK3gvMmUvMmJmaHA0aDBxS0MraURTdHREbUk1YVFzY1o0R0R4MjlhK1NxWjJvVlU5VDE0NEs4TEg1TTZiOE10UHUvRmw3OFBQRTJnMnQxY1Joc0pKR0VlUlFjYmtQVWtEbkhmdFhtSHhML1ozOFA4QWhKN3U4dUxJbUtPZmF1K1RHUXcrWElIVEl4Nzk2KzF2K0NubjdNZmlQOWxmNDJwTG96eXd3a3JmK0hyOG9TWkZKT0VZL1hDa2ZTdkNQaUg5bitQUHd1MUh4bjRkaU1HbzJkcDVseHBvWDVvSm9TZDZiUUFCa0hJN1krbGZYWWF1cXRLTlNMMFo1amhIV0wzUjRGNFo4SGFmcHU2enM5S2lsaGx4SkxCZHB2WE9lMlR4MzVyb0xuVE5NbjhLM2VrYVI0ZmhzQTZmdnhiS1Fyc0FNWjU5cXArRXRRbHY3R0s2bmk4dVFxRUNzQjh3NDYvclhRYU40azBLeDhRUmFYcXFsRmFVQzRBVWNISnhuaXZSYzdLNXd1bEdjckhuMXJlemFKcWx2ckZ6cUxXbTRKRmZ4elc1ZEprQis5Z2Z4REhIdFhSZUpiWHc4eXgrSlBDZXB3Nm5wM2x0L3BGc3JEQkl6c1lIN3JjanJYcW5pbndScFhpQzNqdmJUVEk1TGVWQUk5a2VGeGp0MXJodGIrRjJyK0dkZmp1dkNlbHBOYlhNWmgxU3h4dFdkZjd5L3dCMWhqQVBYdFRwVmxKMllwVVhTMVRQTmJyN001RnZDRlJwQVNlbkJ6Zy9qVU9sU1JYTm5NSjdoUTFzNVYxTGRSNit2YXRIeC9iYVhvZDFPK21lRzlUODR5WlJwbUFXTEJ5UngxR0QrbFpuaWI0ZmVJYkhUTFR4SHRjSnFFYXZISkVjaHNuSUI2WVBYbXJsQ0wxUlZPdTByTWV1bVh6UkdXeFVESnlPZVNhdVF4ZmI3SGRNREZNZ3c1UDg2eTlKMUhWN2EyWkwySmhOSGdQR2UzWUd0blM5ZnREQ0YxT0xhM3JqcDA1ck94MFJhWm1YU3RZb3F5M1pNaGI1c2pqRlc0NW80WFhFbUdVQTV6MUZSZUlvWXJsRnVMQjl5RnZ2ZWxLME1Va0ZtKzBoNC9sbFBZanNhVFNhTkU3TTE1dFJ0TlMwNXJPL2hFaUJlRy9pWHB6WG4xN2JOY1h6elc3YmdtUmpIV3RhOUdvNlpkQTNNaGpTWkM4ZUQxVW5wV2RhaG9Mc1hNUTNKbmdZN1pybmFzYnBvNjM0ZWlPNzJ3M3RvTTlDeEhTcVB4WHRydndacmR0ZDZXR0NUTGxvOXB4Z2ZoMHFiUWRhdUZMVFFRYkFQVWM1cnFQaURlMk92L0QyMnViaTNWcnFCaTNtQWR2VW4wNXE0VVl5amNtVTJuWXl2QnJycUVTYXZNcVJ5bFFxN3NaN2RhM1p0TlRVbjN6NUxkbXgwSDByZ05Ga1hXN1pMSnJvd1RSTURFeW5HRC9XdTYwL1ViaExPSzExZTNaR1NGeDlvVmVKQmpqOWFtbm96UjZxNVh2TENXRzJNVWJraFJuM3lPbFVJTG1TSm8xUitVRzVsUElBNXJSaDFSVmpScm1NcTVIeWdqdDBwTGkxdHhGSmVXMFdXbEdEZzlxMWxxWjJ2c1hyQzAwSFc0Z3NHSTMzRGNGT0N6Y2RoNzFjakdxZUhkVXRudkNaSUdPQXI4MXl6eVI2VUV1clZIRW5HM245YTlDK1RYL0NsbGV6QWVmQ2hNcSsyQmcxaTFabWllZzJSb05YdldheFg1bU9GR09heXRROFNYbmhqeE5iNkhjd2I3V1pQbllqa2VvL1NybWxxTGVUN1I1eFVCdU50UytKTE5kYzJTM0VhSTBDZ0tZMXhuZ2QvWHJWV0k1cnM3ancvcWx0YzJpcmF4S2lCQUFFR0FCanRXWjR2Z2FPRjd5MUlKSExISCtmU3Mvd1VOVDB5NVRSYmhRMGMwQmtobVBVWTdHdFRWRXVFWHk1ZVU3RWpyM3FUVkdINGhzcGI0clBiUjQzUm9TTWNqai9BT3ZXSGFTclkrS1UwYTdiYTgwSUFWczgxMjk1QVV1YlY0RkIzNFZWWThaOUs1Njk4T3k2eDhiTkx0TFd5TTh6Qlk0SW94eTdFNFVBZXRTM2QyR3BPTE9QMURWSk5NOFh5NkY1dyt6UE1EZzl5VCtsZTFlQXRDMVR3NDFnTDJURWVxakVBSnpuOEQwcndqNHAyVStrL0hPZnc1cWVuU1JYRm5kZVhjMjdxY3E0T1NyZjFyczlMK09NMnJlTjlEdEE3eHBiWFJTRzNmSk1Rd0RqcnlQYjBxNHZsWmhQMzNjN2o0ajJGM29zb1I1eXJSM0FKUFhHUDU4VmllQWhlUXZxR21Ya09kMHhsVEE3TjMvV3V1K0xWM0RyVm4vYUxERW13RXFEMDcvMHJsZmhhMnRhNTQxcy9EK2xXQnZMblVTTGEzalJjbG56eGo4T3VhcHJtWlVIYU9vZUlMK05IaGttajNpSmlwSHA3VmtlSUxXOWpNUGlQUzRjSWNMTXI5eDYvd0NmU3R2NGo2YmMrRnIyWFNyMkVwS0xwMVpDTW5qT1J4VzFaMlZqcWZoZFlZZHUweFlKSS9HclVMUnNUZTgwZWEvOElxTmYxNkdPVEozUGtFZTFVTFR3ZlplSWZpSC9BR0JNMkFieFlpVVlaNkVrYy9TdTE4RXJIYmVOM2h1VTNyQkEyR0g4SndRRG11Y2ZUdFZzL0d0ejR5Z3dJSWZFc0FkUklPaFZxeWhIVXVzMWV4MUdvYUF2aGJVTG53NG9aNGhBaGdaeGc4ZS9jMWYwM3hIYWFmOEFFVHczRE1mbDhzcElPZWhJQXAzaks1aThTK0kwdklENWUySGtjZk1NNTdmalhGL1k5UVh4N2IzY3NtVmdrR3daL2hBejJydmpPMGJIblRwWG5jNnY5dFR3dGNlSDlGVFY3dTFjMjhzaW0wa1laeUdHVGc0N2NWNWQ0SXQ3blRyUXBjU2JvN3EwQkM1emcvMHI2VS9iNzFKZGMvWk84Q3dUVzNsWEVjSloyYnEvQkdmeTV6WHp0NGNsaHVMZXh0dk1HOWJNREpQZjByS3RwTldMb2EweC9obTB1ZEwxY096WVJuN2VtZjhBNjllb2F6RXFlR2tXWEphUXF3T2VSMVA4aFhDNkhhb1BFTVFPWFR6TTdjY1kvd0FpdXU4WFh0eExlMnVsNkxpVnJvUnh4UmRTSExESDRkYzBSMklxeVQwTWo0TzZ4ci9nN3gxNGl2U1NiSzh0VmkzZGNGV3p4bjYvbFhxUGhQUUkvRzhkekJDQVhhSmlIQTU2VmcrTE5IMHp3em9UNlhZUkZwWWsyWExsT2syMGIrZlRJT1BvYXRmczEvRzN3ZjRMaGJYL0FCRGVMZ0xOREloZFEyOExsT3A2Y2ZXdXVpK1Zhbm0xcnpmdW5QUStHTGwvQ21xMjg4QkhrVE1wTGpvZlQ5S3d2Q3ZoKzIwM1Y3Rm5qVUM0bUNoVDNOZDllL0hENFpYbmhqV3RQc2RNdUw2N3ZON3VOSlJGQ0E0SS9leVpHT3ZJSHRYaG5pN3hQOFdwTk5zNzlQRGsxdGEyRndKNFpiYTlWN2h1UDQvbEFBejZDb3E2N0dsSk5MM2lyNEV1WG04SWlHT0lsbUJVWVBKT0s5YS9aZDhHcHJuZ1R4MUVWdzM5bXUzbEVad0FDYzRIdlhoR2c2M0xwSGhRVHh0a3gzQVArZWE5bi9aVitNMmtlSHJ6WGQ5bjUwR28yVWtOekdxNHhsU0EzUEdNbXNzTnBFNnNjdWFiT2UxUjllMWo0YzNFWGgrWjJpaXN6OW9pQk9IVlNDVjU2ZjhBMlZlUWFSNGs4TlhWbEhaWDFzUDdTanZRRU9PR1Rwbk9Qd3I2UzBiU2RJOERmQnZVYitLNEVzbW8rSDVMdUdOMUdVUG1PbU9uK3lLK1RQRExhYmRhNncxY05Fek14amNEN3JkY1lIdlZWSXB6dVlVMjQwckhYL0ViUm0wejdKTWo3V3VZRmwzTDFKei9BUFg2MXoyOVRleFA1bVN3QUpKcnN2aWJFaHM5RmhaOXhiVHh5VDFHZnlyaTd1MGZha0t0L0VBR0hhc0todlJidWExM0FpN1VRRWs5Z2VsWkU1Mk85bEZJQ3hQM2oyRmFqNmhzMXFYUzQ0eHRoaFVCdlU0ckV1a2tPcG55eWVXNU9hNW05VDBJNm1uSFp6eldUS2laQ0prOFZSMFZFODgzZDNLTmpFb2k1R1NmZjBIdlcvcGtEdWkyN01Ra2d3eEhwV05hMjZSNnM5a0FGMnVVVjg5S2t0clZIcXZqTDluaTkrRy93ZThOZkd1SFVZcnkzOFFxNUNJbi9IdVFjQUUrOWVaMmQ4c2x5KzlBck1PU3ZTdFNUeDU0elh3KzNnV1hYNTV0S2ltTHBaU1BsRWIxVUhvZXRZMEZxR3VTNU8xVkdXNDZVa2dhYVJWMUs2Q1hIMmVOUWN0ZzRydGZBTmcwendrSmhOeW5KSHZYRHh1OEdyQ1g3UDVpbHVGZFNPT1BYclhxbmdDd1cvbWhzNEhVR1RhUnRBNTU3VmxpSmN0TmxZZjNxaVJ2ZkZ6d3BQNHgrRjF2cjFnVEpMb2VzTkRjSXZhR1VBcVQvd0FDQnJ4YnhUcE9yYU5ZbUM5Z2VPT1JkeXlsY0RJSC93QmV2YWYyaTVQRVB3ZzhLZVJvY284dldiYnliaUoxTERLSElZY2RlT3Z2WGs4bnhEMWJ4WjRNL3M3eFhaUW84TTM3aVVSYlhZRGpCNzQ2ZmhVNFNIUFJUWldLcXVuaXJJenZCOTdNdHNQTW1ES09uT2UxYTFwSWwzZXlUeVB1QzhBRVZ6Zmd5NmpkSldoSEN1UU05TVZ0UUZaQThpTmpuMTYxTTRwU08yRlRtcG9tMVMxZ2hQMnkzaDg0QTVNYW5yWFBYdmlDSysxT09ON0pyY0tBQXVLMzRyMUVna2FSOGJwQW9VbmtETmRKcmVqYUJaZkRpUFVwcldON3k5ZHpISXlqS29PaHBSMWRqT3BlT3h6VTFqYmF1SUxHMlhKR0R1N0tQeXF5ZEswL1Qxa2dmVkpDWWh0Q0E5UGZGUStCZFh0YkJibTIxQ0FNSlV4RkxqN3AvR25YaVJKZC9iSHpnajU4azhrOTZoeGFtYnhhY0xuTk9aRTFEekNNNWJna1ZmZzFhYy9hTk90QWN6UXNzZ3h4anIvS3FsNElJN256MGt5cXY2OUJXdjRVMDlacEwvVjFpTHF0bkpqQVBHUmpQNjEyd3ZZOHl2dVlTcnErajZ2TGJXMSt5cVpTaHgvRUFmOEFDdFdLM3Q0SkI5cEllWS9kT09CV2JyY3hHdFNTc2M1bkxFQTFMYVNQUElibG13dTcrSTBUUXFPNXUyR2x4eHVKYnFSZm0rWlFCK1ZXTmMxRXBwb3Q3VjFNWU9XUThta1c4MDhhY2tVTW05dWd4blA0MWxYMWpkWEphNUV2bFE3dm1ZLzRkNjVuRzdPL25Tam9PU1NUYVk5NS9lcmwvd0RacDBsb3l3cXBueXFrY2ovR3FWN3FTMnlTeDZhTjI4QlN6REpBcWtkUXY0YlVUbVViUi9DVzZWdEdPaGhLZXB2VFM2ZGFRbzJvSnZQcm1yVUYxNFZTQkxoYkJtUEdReHJqSnRSbHZDcE00d094N1ZhZS9SYlFpUjhqamEySzFpckdjcFhSMWZoQ1BUTHZYcDc2TUpiUnh3TUZMOEVucGptcy93QVU2cHAybDNiV2xxNGJhUG5QWDVzYy93Qks1MjMxaTd1TCtLR09RZ0IxVUtPblVDclB4UDhBRDk3b1BpeThzSmdTVlpXQTltVUhOYnhUYU9HVHN5UzYxcTkxZDRvVVlnQlFWK3RVYmxwSTV6Ynl0d2ZXcldsWGhHakt2MmRSTGJubVFqc2FwRm81WmhjT1RLMmNsU2VCMC9NVnBGRVN1MGVvK0R0Vm4xejltL3hENGJXWXlQcGV0VzE3R3BIM1VkU2h4eDZnVjV4YjNkNnQxSERjUmxGRGdZeGl2WGYyZUpaL0UvaEx4em9OekNGODN3bEpQYXhSZ0xsb0pFZjJ6OHVlYThrdUpKNWJzd1NSL0tyWStVYy9YTmIyME1vcTBqcUx5WHkvS2p0bTJPVTdIRlkwaytuTEs0dlE4a2dib0U3MURMcUpta2pXM25ZYkZ4ejEvd0RybW1ySE5KR3lxeExaNXFlVXBSUXliVlpFdVI1SDdxTS93clZXODFPTWJ4Q3hiSitZQ2cyZDVkWGZrcW1XWTR3QjJycU5KOEZhZmJXd2E0ZzNOTHlBM2YycWlKTkk1clJyQzUxS2I3UEhFV0JPU2NkUDhpdXlYdy9KcHNFRGFhQThiTG56a0hHZTYxbzJVZWwrRzRmUGhpUnBHNm9CenlNZmxUTFBYbWt0cE5NQ3FJMllzVkl6NWJkOFo5YWpWbWZOY3lyeVc2VDUyais2UnpqcUs5dDhJV0VjWDdPSTBxeFdPQysxblVjd3pzdy9kS0Q4empuZ2JlTytLOHZzTkh2ZFZ0bFU2WTl6Y3lzQmEyMFFCTG5PTW4wWDNyYnQ5RytNMTVZeGVBSlpFOHhsMlF4V21XTnZHM1ViaDNQZjZWaFhhakM3ZGpTbEZ5a2tpbEpvVjM4WHZHbW5mQ0R3Ykc3NmRaVEtMKzZUL2xvUWRwSkk0L3hyN3UrRkh3MjhOL0R2NGNXZWs2ZnB5R0ZBSTVZeW1Od1hnbnB6bm11RS9aRS9abTB2NFJhRTNpcnhna2NOekt1WkhsWGtMak8wY2NtdlR0YStJTnRxdHhkV2VqNlRJdHF5RXJLUnl5OGZOanAyK2xmRTVqaXA0eXQ3T0h3bzk2blNWQ2x6UGMxNWZHMm02VTBMYVZaeVJ4S052N2tiUWVCd0I2MTdaK3pWKzFMZCtDOVdzaENHZEZrUXhxNHhnN3NFbm5HT3ArdGVJZUd0SHQ3bTNqZlVaa2Eza1JkcUVBOSs0SFBQSXJjOE9XOWxvV28zc3RqRVVXSmRrRDdjZS9IUFN2THIwS0xoeTJGQ3JVVHZmUS9RajlydjltUDRhZjhBQlJ6OW5lNGw4S1hrVSt2NkVKRHBWeUYyN0pRbzNRc0Y2aG1ISFBhdnhTK0lIdzI4YS9zNmZFZE5QMVd4azAxWTlVVFMvRnRyT01DZTNhYkFsSXdmbVhBeWZTdjBiL1pRL2FkOFdmQkh4RmJ0QmZ5UzZkY1hLblViVWtsZGhJM0VaUExmTHdmZXZRUCtDajM3TVB3cS9hMDhDeS9GYjRZMjhUYXY5aVA5clcwQy9OTkN5azcyQS9qWElOZDJWWmhMRHYyTTNvek90U1RmUEUvR1A0MWVDTEx3cjQrdk5Oc3Jka3RZbjMyNlFSNEFYQjI0QjY1NDQ5NjgwMXUxbU1UYXRiSTVRT1N6WitkZStHK2xlaCtLN0Q0aWZDYngvZmZENzRzTGNUZ3lrYVRyYytTSm9oOTJOaVA0Z0FPdFkxemNXODBzOGxrTmpGaUhKVEtOM3dSMHhYM3RCeG5TUjR0YVRWVzVONEgrTkY1WStIRjBsN3dBcTZzQXd5UVJ4eDZWMW1qL0FCSHRZZFJndjVGRGlNNzNpWmNna25ubjhjMTg4ZUpMWHhCNGExK1RVbmpqYTBrY3NEYkFqWWV2UTF2ZUhmR2NVZ1Q3TE9DSEdYYmR4MXpTZE54ZWhzcHhuSFU5dStLRWZoUzZ1WG10QXN1N3l5eXFnejB5UjA2Yy9yWE5MNE4xZlY0YmVMVEwxUDdQdDRwN3U2dEozekdrVVNibmRjanJqdFhPbnhtODl5V01nYVRmdFpUbmtkUi9LdWpiV05BMEg0ZjZ0NGlodldOekdJRXRZMllZRVRPUE43NHdSZ1lweDVteUpLSEtaZnd6MVR3SDRpOFJYa0Y1WVNmWXBJVENsekpGdEFQRzBnZHVvNTVybC9pejRWaTByVVdXeGh3RGdnanZ4d1JYU1FTM0dwWE0rcXdJaVFKSHVqaWpYYXZQVHA3QWZURllPcmVJN2pXZFkvczdVVTNxcTdVa0l6MFBCL0t0WEJuUFNtMU00ZjhBdHg3SHl0UFpUaFd5YTZTeU5qZmFjclF6QU9SamJuazhVbW8rR3ROdnBYWm5DbGM3Z1J5ZWV2SDEvV3NxejArN3M3ajdMQ1R1SkI1OUtWa2RkM2NxK083SFVJWklMd3pNeVFSckh0OU04MUJvMDAwa1FNbVA5M0ZibXNRM1M2ZExCZXhGL05BK2JQY1Z6T2thbERINGxUU3Avd0IzSHVBM0hpc2FrRFdFN2JuVGFUSkFZSnJlUUJYNXdwR0tqdGZGeTM5aGQrRzlRVm9DVklqWTlEMEg1MDN4aHAwV2hhZ2x4WVhheVFTb0NzcUhoVDF3VFZHeDBPYlc1MWxobEw4NWpYOEI2ZlNsRG1namE2a1pmZ3ZWYmZTdGZFT3BRc2RyOFordGVwM25pbExpeVZQcyt3RURieDE0cmcvR2ZoKzU4Tnl3WEYvYkZKcGt4R0NPNHJ0ZkMxcmFhNTRLU084WlJjS2h4MDlLenBxOGpTVHRHeFBxVm5EcTlrbDVaNExMSDBVLzRWaVdQaUNhMHZQc0Y0cFhuQjNWUG84K3IrRllyaVNlUHpnV09GOUJuMHEzbzgraCtPcDN0cFlWam55Y0ZlQ0szNWREbWk1SmtsNDFuTkQ1a0Vhc0dWUmdqb1NjMTJNRm5mYWZwTWIyOFc0SEN5S2ZUL0kvU3VDdmJCOUMxUDhBc2Q3bG5qam5VU01vNVVWNm5wcjIxL2FSZVRkRjFFUXdpOWUzWDhUWEpVZkxJN2FVZWRHRmMyeHRKaHRBZGNEQUZWMTFPQklKL3RVZ1VJL0c3b0J6bXJsKzUwMjVkc25ZejRDOVRqUC9BTmFzelZ0TGJWYmQwaHptVmNoVkhjOGR2NVZyemU2Wjh0cEhiK0dOV3RML0FFNkM4UUV1OFg3b0ZmbUNaNi81OWF2M3hlYUFxWVFkaHkyZTlXOUU4Yy9CL1Z2aHZwbWs2cmJYdWwrSnRNV08xamppdGg1TTBZSXlXSTR5YzlUeU1WVThWUnJibGJXMGJNYlc1ZnpFSEI1NC9Tc1l0dG1sN0l4dFRGNnNmMnBIWUxIeXFnOHIvbm11WDBEeC9xR2wvRlBUUEdHblhLL2FkUDFDS2FOeU9BeXRuSkJycklic3cyTTBVOFJjcXBBR09UanNLOE9zdkVhMnZpQzd0MnpDV21ZUlNNZUJrKzlhS0QzTTNKTjJPbjhiK0w0TlErUE9zL0VQeGNRMDJwNmhOTTc0QU85MkJ5T3crWGNQd05lM2Z0Q2ZCWDRaZU4vajdvWGp2NER5eEhRLytFY3NycThXQThKUDVlMWx6akc0bms0NDdWODArTnpEcnZpN1RkSmVjSjlzOHNQS0cybmRuMXgxNTdWN3g4S3REdS9oaHFmOW4yR3BTVFdxSWlTN3p3elpCUEI5RFZwYWFrU1M1dEMzOFJIZTEwTjdWbTVWT00rbk5aZjdDZnhFMXI0Zi90RzZaNHIxOVRHTlA4NXRQY0FBcEswZXhXT1R5UG1yb1BpWHB6YXRkVzg5bVFZNUh3L3AvbkZZMmkyRnZwMnNDS0dEYXdiNVpRZVkrUmdpbXBjczdCTmZ1em9malBOYjYzcnNyeXhxWGJtUmdNQXZ1T2YxeldQb3QzTFlhYjlpdFZES0JnY1pIK2V0TjhhWGNFMXpBclhtWk1FU0s0NzgvcG5INTFXOFBYVjFGWmo3YkRoOXhBOS84ZzFwSm96aGRrZmhDNHRJTmV1bzlRbUVUVEFxak1mVS93RDE2NS94RkRydWdhQjRnZlViWnZzd3VZWjB1aWdJWmc1eGc0NHlEK2RhdmpleWVFUjNvVERNQWNEanA5S2Q0OE5oZi9DQzFnbW0zdExlb0pFWnVDQmpnKzN0V2RQWmwxcjh5R2VGdFd0ZFdzb3RUTTVZWEJPMFlPY0RqOWF1L1lJN3JWRXVBdTJRT3pGbTlNNDR6WE82WE5jYURiV3JXc0FXTkhDaFR3Rk9NRUN0NU5aU1BVb3BZaHdRQTJSeGovSi9TdDRTdWpDZTU2RC9BTUZBTGRyYjRGZUFJNHBDeUMwTWJBZ1k2ZnJYZ1doNmNiZExhWnlCL280MmdIQXIxZjhBYlk4VWYyMThMUENHblJUbGpGR1NRY1pIcGl2TWIrM3VkUDA3Ukw4Rmp2UUFodUIycDFyT1JORjJwMk5hMU1NZW93UEcydzdlQS9HN2ovNjlYdkR1c3ZZZU1adkU3ek1xYWVOdHNWSEFtUEM5dWVLcVFXRW10NjlIcDZmSWx0Q1o3aWM1Q3hvUFhvT2VuNDFqM2c4VTZuSzl2YUlsdFp4M0htRnBEODAyR0hBUDBQSDQxS2VobFVWMmRUNDMrSUd0UGFOSG85c2t6VGdGd3kvS3I1SkRIMTZtdUE4Ti9DK0RYMHU3Ky8xR1ZweVNRaXRoRlk4OVBZMTZwcm1qK0V0ZTFNUytEN0Y3U3pkWS9KdFpKZk1hTmdnM2MraHJCOE9hVmNhZDRoMUcyVEpWR3dTZlhuakZkRVk2YW5OZTJ4eVg3TnVvTFovRlBWZkNHdlFpUzFmVHBWSWNjS1ZQQndlSzlmWFc5R1h3d05MdVVReVJLMGVjNERMNyt2YXZPdkJGanBkNTR5djlYMFMxSWFEU2pGY3pLdjNwU3gzYy9wVmp4LzhBYk5HOE1yTmx3R1pRQURsdS93Q25TclNTUkV1WnlQT1BDVmhCUDRQdUM4WWJKT1ZQZmpQOUs2ejlpelNENGk4Y2Fub0UwSUEremxpeEpZakoybjVUMXlQNjF5WGd5OHZJOUROZzl1QWtzbUdrY2RCajMvenpYWmZzS3p0SDhmWk5QWFZrSXVMZVJUR3A1YkRaeGpINDF6MFBoTzNGSktiT2crT3E2MTRibE9rUU03V3Ryb054YmRPRnhJVzZaOS8xcndxU1B3OUw0ZVM2czlQVVhRSDd5VmZYQTYvbC9Pdm9UOW83VkYwYlhmRmZoelVJc1BiaVlJeFhzeUN2bS93VUYxR2E3dHIxVEhDbWVXSEMvWDZjZm5WVGRwR1VFblR1ZFo4WExxdzFMVHRCVzNpMm1QUzRnNVFZeCtGY3BlcmI2WTBGdEhOSXpGQVpCSjJydHZHT2pSM09yNk5iMjJvUVNXeldzYSthajVYcHoxSFd1TThWcmJIeEZKSEVkeVJ5YlZaUmpvZWV0WXpaVkZEN1dOcHRXYVVuNWpGeWFxZVdXMVBhNXg4M0ovR3J0cTFvdDh4RWdYYkg4d05aNHVZNU5WTXJQaE4yRko3ODF6UGM3NDZJNjdTOUcxZWFMN1JwTmk4OFVLNzVaRVhJUWVwTllHbjZVYmpXNWJndndKczhmalhUYUY0OHYvRG5oelVOTDArZmF1b3hDTm14MEgxTmM3cGQzSkJNaFFZWjNCejdZcVc3SzV0RlhraDl4WXZiNmhJakhsbHpnbXFEYW5QWXkvNlBGa25JZmppdGU5bWVTNDNBY2hDRzRyS3VrWlowZFU0M2ZyVXFWeXFpTlhWL0dIaVhVZEp0OUYxazI4c1VTaG9XVzNVT0Z4amJ1QXpXbDRHOFZYT2gzdHBxMEtlWTFuTUdJSisrdWVtS3dOU2ltM0pLQjBYRzJwOU1MVzhFczh3Mm9xazRBNmU5RW9xU3N5SXB3ZDBlb2VJZmlKYS9GblJmRXQxcjJuTG1NVzBPaVFsYytVbTRsbXlEalBIWHBnMTVMNHhXMjB1Qm83cEFwMk1ZMXhqSEhZZld1d2o4Y1djdmgxSmpwME1NY0ZqOW5sOGhjQ1JnZHlzMk8rRFhHZUsvRS9oL3hQb1UxbjlnbGE4UTV0WmtISGJnNDdWY0ZHR2lNWlRsTjNlNWkrQmJZZjJiTUNlV2M0WHBYUWFORWd1U0paZHFxQ09heWZDVnNZYklxUUVCVTViMy9yV3ZGRVlJakxkQWduN3JEMHJHcmJtTzZpbnlJcHBiRTNyZVkveUIrTStsZGw4U0pJNy9BTVBhYTNoYTJlNnQ3U3lDWEN4Z25aazhuMnJrcmEyanYxbGtrbjJjL3V3ZjRxMExieHRxSGdHL3NyM1RuREtWS1RSdU1ySXA2Z2lzNmNiekxyU3RCSXpOTmlobjh0bGtLdHhnWndLMTlUalJ1Vlpma1RMRFA1VmpXa3AxN1ZycS9qaUVDTk1Tc1M4RHJuRmFVNlFwR2dtSkVhdGlSdDJPUFdxbEZ1UlVKcFV6bHRSakN2TTViaCtWNXJyUEFldmFYWWVFOWJ0YnQxRWt1a0ZZUzNkdHdybU5hbjBwdFllS3hKZEY0TERwbjJxb1l3ZHpSU1lCT01lb3JvZ3JJNGFudk81SlBNMDE5SUN3M05JZUQ2WXJUc1lJb2dJNU9WeDByRkVjZG5NR2xsM01Ua2MvNTRxMWVUck41WnR0UkJreHltT0JUa3JrUjBOTzZ2N0d4dGtqdDJFanljNUhhbDFMV1h2clNORis2Z0EyWTZtc2l4dGJnN1ZsanlqUzRiZDI1NjU3Q3IrdDJNbGpxdjhBWUx4eHhPb1VoNHBBeWtFWnlEVThxWnJHcFl6MnVWaXZQa2JMdVNNZjNhcm0zTTF5NkdRa0szclV6eFJXbHk2UmtsbFArc1BVMVhTZWFRTWd3aEJ5V1ByVnBXSWNybGhVdExKUE1ZS1FQNzFRWEYxRTRTVjdmWkdTTnE0KzlWYVdmYzQ4MXkyT3ZvYVc3dlpyb0F2SDhxREFVZHFwSzVEbFkwTFNPMmE1RjlEakpYNVY2OGdacnVmMmdOS3ZyL1hOSDhZMjhRK3o2MzRmdDUwYmpHNUJza0gxQlUxNTFvcVNycTF1N2hncGxHUjZEaXZhZmlqY1cyci9BTE5IaHk3c0l6djBIeERlNmJMTUZPVmlrVlprQno5Vy9XdWlDc2pucU84anlDenVrRVQyMFRmZkhJRlRXTFdjTCtiZHI4bzRBSTYxVXRZYmNEem15cEFHUGVyZW9YT2xNcUxid1B0S2dGbTlhcTJwU1ZrZW0vc3hlS0VpK0xWaHAwMXg1VnBxY2MybXlMa0FGYmlGb3huMjNGYTRQVWJLYlJkZnViWXg1OGlaNGlPK1F4QnFqNFl2OVQwblhiVzYwVnRzNHVvWkxaaSswZVlzaWxSK2Ridmo2OE54OFFkWVc2dHpiei8ybE5tM1k4b3hiSlg4eWVmU3RWc1lXdEl5WHNwWlpETXlZM2M1eGdWYnRiTnhFc2tlU0Z4dU9hNlR3SjhPNXZpTHBiNmV2aUNLenVVdTEreHhTcWY5S1hCTERJN2dZTlhyYlF0TmdrT2p4N0ltaWNJek8yTnhIQkh2em1nbDFGc1U5SjBYU29ZRTFhNFpRZHVTcEhOTXV0ZFlSaExmVFpzdEtxMjdHUENrOWVvNjF2Mi9oTzQxUFhiWFJJN1YwYVlnUkhvdVNldVBUR2E5dDByNGE2YmZ0YitEclRUbTFTZTFVUFBCWUlnV0VuZzVidDNPZnJXRld0VHBSdk4yUmxhZFIyaWp3K1Q0ZjYxNHNsaGx0SGx0WjkzN3dxcElDNTVPUFVHcGREL1p5K0t0MzRpM3I0Z3NScGlzRE5QTEVRK3dZeU1EdU1kYStvdkEvd0FIMHZKN3ZUclBSN0xUbVhLM0psa00wZ09PZ0E2SE9mMXJzTEw0SjZKb1dtTlBxRXMrb1NLcEJYTzFHNmRoMUg4cTh1dm5HSHByM1hjNmFXQ3F0KzlvZUUvQ3I0TzY3cVBpR2FMd2trMTFKOHlDNHdWamlVZGdmNGZ3NjE3VjRQOEFodFlmQ20zL0FMYzFHeWp1NytTUWZNNHlGWTg5eG5nMTZQNE44QTJtamVEMDFDTzRpczRHL2VMYVFBS1ZBSFZ1aEl5UHJXRXFhcHF0cHFXbTdHdTQ3bGg1YnRuY1czY0VIcGpGZk9ZakhZbkhUYWVrVDFxTktsaDFkYXM2U0hVSWZFUGgvd0EzV0lBWFNKZmtBNEJHQ01EM3BQQ2VqYWJldmRXMDBRSWFOZ3daTUZCejF4K0hIMXJPOE93M04wLzluWFU2MmtsdW43eU9UNWZtQUhQSFlmcml1OCtHZncxMWZ4QmZUUjIxMzVWdjVqQ1M1WlFOK1FmbFhHRGdqSkhldlBjbzBFMGJUYnF0SEo2YlkzK2pMYjNtcUVHSkZaSXAyT0FoQnlCd1NlblAwcDl4NDJtMXk3RnA0YXNSY0dJNGxta2ZaSHg3anJ3YTVQOEFiMzhVM2ZnVHdIYy9CWDRhK0lrbTEvWkhjWDEzSEpock5PU0ltNHdKSFBZODR4MXI1OS9aQy9hejFEVjlaaytIWGorVVcrcldyRmQ4bkFtQUlIQS92Y1Yxd3dGYXRodmJuUEtyVGpVNUVmWlhocnhGcitsMzBWcmU2WmJKRExoVE5ETWZsNmM4OStUWDBQOEFCYjQxV25oYnhIYWk0MXBWanVBZDRtazRPU0FWSTZaSUEvblh5dm9maUc1MW5XMU5yYnFrRVVSY3lZNEo1NTU5NjZZVzFtdDBsN05LY3ZjSzRWbVBCQTRBOWNnL3BYa1ZhZG5mcWRNRjBQVy8yMlAyUnZoejhlZEh1L0dmdzUwVzN1MmtRdHFXaWhjTWoveFBIMEk3VitYUHhOL1orOGEvQ0h4WE9JOU51YnZTb1ptODJKb2laTGZISlZoMUlIR0Q5YS9VVFF2aXBjMlY2MTg3VHhNa2lwSjVURXNXejk3bnR4akh0N1Z1ZU1QREh3bitLMmdDYnhqbzBTWEZ4R0ZlOHNGQmtKYmpNaWQrTW4xNXIyTUJuczhJMUdwc2MySXdLcUs2UHlkMC93QU8rQy9pRjRPdUx5UzNTMW5TNE1BdDVHRE0vd0F2QnoxR2ZwWGtYakw0S2VJUENGNCtxNktyTkNTV0VZQjVIUHIwcjlOUGk1L3dTZDFQWGJTVHhMOEtOWXNyM2VESkhhMms0amRjazQrVTlEbkZmUDNpWDlrSDlvN3dlbDc0YTF2d3Q1MzJkVGxyNkJrSlJlY0syTUU3YzhWOVhoODR3V0lYeEhrMU1KWHB2Ukh4MVlhcTFycDhnMUZuanVGbEF5Vko3ZFQrRmRaYlc5cnJOZy9oMkhVZk5qdTdVbzJEeU9BYy9YR0s3SDRtZnM5ZU50QTBWdFVqOFBrRjRUdFNBYnl2UVlKK3ZjWnJQL1p1czlKOFplSTdidy9jNll0dHFHazIxMDl5eEp4T0ZVa05nZCtjSEovbFhwMDVRbXJ4MU9hbzV4M09DOERlUE5UOER6bndMNHFqd0dPMjB2andKa3pnREo3NHpXbHIxbGNXcWYybnBiYm1YNWxPUGJvVFduOFIvQldtM2syb2VETmR0emJ6UVhMbXluSXdVSmJqbjhUeFhMZUFQRTB0amZud0I0eWtWSEh5V2t6L0FNWlBBSFR2aml0TkRGU0xXbCtKckxWQjVGM0VJcmtmZkI0QndSeUswWnRMR29tVzR0am1WRHdCM0grUlZMeE40VGkwZTcrMDZ2cHppQVNZU2FJWXh6MzkrdFRhZkxlNmROSlBCTVpvV2orWkR5d0kvd0FpcGRtZGRPZDl5bGNYa3NqaTB1RnlRY2RPQWFwK00vQTZ3NmVtdVJ6SUpnUVFxTno2NHJRVy9ndllDU29XUXQ4M3FEMnFuZWw0SENGMnoxMm5uSjdWRW90bXhuV0UxdERwTXFhaEMwc0UwUnlwUFJ3T29xTHdKNGtqOFBYaHVUSG5hZjNlN3Q2VW1veGFoRWpJSVNZUSs0Z2Z3K3RNU3lYV2JWbnM0UWpScm5BSDN1T3RZdUx0WTBpK1Zub2Z4ZnNvdkZ2Z3V3MWEwblUzRWFncUY2ZE9uSHRpdVU4R2E3ZXdZZ25WbGZCRERQQTZWVjBuV2J3V2JhWGV5dHlwS2I4NEFyVjhLeFJDWE00Vm93U0JubW9WNEs1MHg5OW5hK0VwOU0xSFVuZ3Y4RmZzek5nOUNmV3VTMVRTNXZEUHhCVFV0RkJOdTAzT09tTW10Qy90SVliK082MCtabElYRG91ZVZxOURmMnQ1Q0RKSDh3QUcwOVIwL0tyaExuUkUxeXlzWmMycXkzbXFYRXNTSzd5WFBJSXp4L2hYZlhEU2FJdGhlV2d3eFVMS1BYdlhsdmlPMDFYUjlTVFdiRE93T0RJZ0hHUjlhN2ZUZGJoMVY5UHQ1WndHY0RIUEFOYzlWYW5aUWxwb2RENDBtc3A3VnhiUTRsK3k3OXZ1UGVxR2g2aEZjUnhYbmtnRXhqS1k2ZXRXZkY2dlozRWNrU0ZpSWVnOUtaWVF4dFp3K1ZHZzNMemdES2pyVGpxaVpibHk1RnZkc2t5eDRaY2M5elhRMkY3SkxhUTJkNUNIYmNnalpqMFVaSkJ6OWE1TnBZTEM2M05KdUJJT0NPYTZxR0EzVWNFME1tM09DRG5IV20wbHFUdWFQZ2Z4eGY4QXd0OGZXL2pXSFI3UzlOdnVQMmU5aTN4T0d5T1I2NE9jMTRaKzBWQWZpZDQvbjF6d3BvOXJhMytwMzRLMlZtcXhvN3lIaFZ6MkJyMkxYdE9hNHRXa2Rza0E3UmdESjlLOFExdlhyM3diOFRkTjhSVDJuMmlQVGIrT2MyNzUyeWhXNUJ3Um5QSEdhMWhVV3pPYXJUa3RUWS9hRStIT25mRC9BTU4rRS9EMXBwODBXdWFhbU5UdUhSa1ozT0NWSlBERldCQUk0NDlSWHVQdzMwRnRWK0h5WGQwK1p6R3BPZVNXMmo5YzE1WnFIald5L2FTK0k4dmlQV1pqcE5xaEF0b1pFTHRnSElYY3hQQUI0NTR6WHVud1UwcSsxUlpQRDJuRDdRNmNSTWc2am9EajA0elZTczU2R2RPOGFlcHlVdDFMNVgyYVdVK1lybll2Qk9CeHhXSGI2bTlwcmFMSXBCTFlZZ2NqbkZhZnhDMDY3OEovRUI3YlVNeGJKaUFPTWNuL0FPdFdMNG5UN1A0Z2dlUGhabERJUVR6N1ZpMHVjNlU3MHlieDdiUXk2eEg5amtEZWFxdUNQOC9UOHFuMDkyWFN2c3pmTXlESVkvU29mRmJ3VHlXTFFzQkxBM2x2dDdnOVBxYW51SXB0UHN6SXhiaGVGQTVQL3dCYXRKYW1NSFlxZU05VXM1dEp0Z0hHU3B5VDJBRmJYeE0rREdzZUdQMllmQnZ4ZWgxY1NONGk4UjNGckZvd1E3aEZGRDVubnFlNDRJUEhGY1Q0dnNudXROdExxMG5MaFdrRFJxZWVWemo2MTZpbnhvZzFqNEMvRER3UjRsMDBTTDRNOFJ6enN3SUpsdDVvV1FyNi93QVZWUzVFbmNWWnprMVk4b3RMNlc4MHVPSkV3c1dHbGJwbjlQYy9sVnU3a2ppUzNSeGlRWUxaQjRGTEhaU1dCdXJlMHNESGJUM0xlVXpEa0puNWZyd2M1cG5qVXdhZmVRd21RWmFFWTU1elRqc0pXZTVSK0wrcFIzMWpwc2R6Y2gwalVBQmpuQXB1azZqYmVMZFQwL1JMTWhsaXdWWEhQQXFiOXFId0RQOEFEbnd2NFQxdDVta1hXZE9GenlEeHowL2xWLzhBNEo4NmY0SjhWL3RZK0QxK0o5NDF2NGJhL0xhck9GSklqU05wTVlIcVZBcTR4Ym1rektwTktpMnVoMnY3Uk9oYUg0TjhWMnZnL3dBTnorVmNhcnAxcE5yRzFTREdTdVJEenlRUm5QclhKK0o5R3VMVFRvYmkwZGdJOXU5ampoZHVNZXZyWFlmdFlhRTBmank0OFlXM3l4WFdveXlSYkJoaEdUbU5jWk9QbHhqNjF6OTVxVU54NE1hZTVJQVdFREo0TGNldGJUaW9Tc2psb1ZIT0YyVU5HTnhMYlJUVzhoVmc4WldNZFQvOWF1czB2UzQ1NGRRMVdXTGE4alp3QnprZGF3VHBFM2hhNjBpNisyMjl5MXpiTE8wVUxCdktCUEN0NzROZW4rS2ZEbGw0YjhHM21wVzBpdkNSbnpCNm1QY2Y1MWNWb1JKMm1lQWZBZlVyelNkZThTV2w3QUhpWFVDUXhISTNaOWUySzdQNHBhYmErSWRQc0VzSlZHWmZtaXlNQTdlaDlxNGo0YUVYbDU0cWFKL21NNnNzdU92V3R6UUlkWDhaNnphK0dORG5Yenl4ZGQ4bUJ0VmN0K0dNL2xTNkdqczNjNFBRSllMWHd4R3FxdTBnSG5ybi93RFZVSDdMdzByd3QrMExGNHN1Tlg4djdLcGs4Z3BscE43aGVvOWptazBDMWx1UERhT0FkeUVnNTZjRFBGYlh3RitIVmhySGkzVVBGcGtCTmxiVzNtSVNNRkd1RURIbnBqaXNLSDhOTTZzWEZlMWFPdS9iQzFPd3VmSG5palZ0NFZacldOZ1RrWk93RDgrSzhsOEJhWGE2NzRmYUdLTUZicVBDc25kc0h1UHdyMDc5c3JRQkxQNG11SVdJRnZGQkd6ako1OG9OK0hhdk1QZ3Q0YzFLMThIMk91eDNUcUZ1QlA2cUZ5Ui9UcFExZVZ6bWk3UXNkVnIzaFNMdzk0MzBQdzlhUXJIZTJPbCtkY0YyM0JqeTNHVDZmaVBwWGxtdXp1M2lXVzR1YllCbXUyWm8xSFQ1di8xMTZENDJmVzlCK0tKMVhWcEhqTXNCTU1qWUdVWlJ0d1BUazE1L3F0eEZlNmpKT0hVL09TV0I1em1zNmlkaldoZTVEZlhDUitJTGlhSUFydEdQeXF1MEVrc3F5c003anhpaVdDYTR2Sko0aDhpcnlhZmEzbTIzajJnRmhKM05jN08yTE5DOWhhUFRsQ25wakovU3JHaDJ3dlo0Q3NnQU9BT2ZiUDhBV29MNmVKYlp4SnlIcWJ3anNXWlNkeHlTY2orRVZqTy9LenBndmVSYnZJVERxRHdrODQ1L0h0V2RLdTI3UXl1QkdINU5hT3VvSHZtR0RqMnJOdmZLYUZMZFZZWWJPNDVxS2VxQ3BwSWsxdlViWlhTUzJ0V0tkQzJlS3NJLzJuU0hqSUkzUjhjWXF1QkpGRXZtSVFqWTQvOEFyVlpqdHJ2VUUreTJpK1dyakJZanBXcGs1V1dwMXZ3OStIY1hpbjRKK09OVmlRdmM2TGZXTXlnQWsrVXlzRy94cmt0SXRrOFBUZmIxc0k1QXVTWTVVQkREclhxWDdLdmluUy9BOG5qanc5NHVreGEzbHRiMjg0WkNlb1lFL2dHem4ycnpMNGtYVnBvOGJXMm15cXdhVXFqbnV2WW5QdFdWU1Q1N0kwb1JqeU5zd252VFBkeXpXbHNJbzVKQ2ZMUWNLRDJyV2lrRXVnVHhUY2xTUEpMZmhXQnByenhXNVdTREFQVW10TTNMUjJHd3RoV3h6aW9sZHMzZzdJaXRneGxNTWtxNVE0NFBHYXovQUJiRkpPWWhISnVLNXppcDdWYm43YVREYk1JaWNsajNxYTRqZ2U4SkxEYUYrWUd0b3BSMk01ZTg5Um1uM01OdllxMFp3MjM1OERIcHpXWHFlb1RYK3BSeGlXUTI2bkJqRGNIL0FCcVc4MWEyV1dTenRnT0RoaUIzcXZiZ0M0aWFNZ2dzTTQ2VmFJYmV3OWJLM3RwcEZLN0FHL2k3MVdhVlB0anJER1NvUXNoSTRPSzFkVWdkNTVWYkcxV0JJck5ubmFOMldDMkNsRGxYSjYrMzBxNHN5bmRGWnJLNldmN1pKRTZMS3U1QmpnZzlzOTZiS0lJeWZNbUE1eUFEbXR6eGY4UkxueEN0dGE2ZG9zRmpiMjhLcVlZaGtNNEhMZTJheTdiN0dTdHhQYmhuMi9NQ090REZGWFJCWlh1c1R5K1ZESXlSRElCWWRxMHJLQkV1NDdpYWM3a2NidHh3UC8xVkEwNnlPWW9rNEo2NDZVa0ZwZjZoankwS296RUtmY2Rha0xFdXNYZHZEcU1nbGtSbXprR001R1RpczB0TEpJVWhYY0dQM1JWNyt3VjI0TGs0UElxVzN0SUxTYmNweDFBTldrN0V0cEdlbW0zUnpMSW9SZTRiclYvVDdURnM0bWp5dlVFcjByWnN2QTJ0WE5rK3VTVzdtMlI5cGxQVFBwVVdweFdVR2xTUmFiZEs4eWdlYmpzUDhtdFlKbUxrak5zYjYybTFPSklBU2lNTWdqa25QLzE2OW9zZElTNi9aYjhjUXlJVC9aL2lQUzd4VVluY29kSkl5VDZkczE0TjU3Mnp4eTJKQWFOd2Z4RmZSdndNL3RmeGI0QitLdW02OVpxaTNmZzZHK2lpVmVCSkRPakFnRGpveC9XdG8yTWFqUENiUjlOWUMydmJSeXJINW1qNEk2VkhxdW5hVzEzNVdrTkw1Unh0OHdjNXE2LzJXMmxQbHFHOHNnc01kOGRLdDMydTIxcERGTHArbUo1aFVHUjNYa2UvNlV5MUxUVXFSUXhLYlBTL0tZZnZBQy9RalBwVnROTVJkYXVyYldUTkxPc3AyU0U3bUo0NVBxYXUrQ0dsOFgrSzlOdDdsVkdMdE9RTWNEbnBYVjZ0ZGFOWTMxL0FJbzJ1bHZHRVRzT2NaOS9UaW1ub1RkT1JuMnN0enBac25zbEtMYmc3Y0U5VDlQYW5hdG85N3FsdmNhKzA1aVdMRHFGQnl6OWUzYm5xS3NXTTd1RXVKRkRsL2x3QjNQNFZzYUxZUXo2ME5PMXBqYjJjcWxWbWtIeW8zR1A2ZHFISXdxcEozUm02QjhSTlEwdnd0ZDZ2ZXMzMmpUQnRpa2JnOGphUHFmZXZhZjJIUEhWN0w0UDhWK0tieDJrMUNlNWdndG5rVXRseUQzejZrMTh0ZkZMWFUwMi91UEEzaCs0VzVpYTgzVHp3OHJJYzhBY1Y5ay9zWCtEbCtHM3dST3ZlSU5GYVlhcGR4eUxDdUE4akZmbEl5T21lUVIzR0s4RFBxaVdHVWVyTzdMVis4Y2oxSHd2WTJ2aHU4ZlVMdTRtdDU1MGI3U3o1dzJmbXp6eVJnNHgzcnN2RE9xdzYzSGN5YWNQdGtxc1FpeUxqSUlQZkhPY1orZ3JLdjEwQ0JFMlcwazAwcGpWbzNoeDFCTzM5ZnJWNUZ1UmJpZXgyMnhXSlhpV0xqSkdRRkJHUFQ5YStXaG9lcFVzeXBkV2Z4TTFPQjlEMWE2RU81U0lJZzJRK2NFQVl6a2Q4NTllbGEzaHZUYnpSMXRtMU9OWkF0cVg4eHVjbFNUN0VqSGZyV0t1bStKdkhlcVdtbXdUUzI5emF5RjNtVkNBb0lHN09PNDlUV3g4UnZIL2gzNEo2VERybnhEMWxZcmFJT2pEamZQbklLSUNQbUpPQ1B4cXBUbEtTakRjemd1ck92OEtIU1BFbDVQcnFpSjdPM1FxMTNQRnRHRjdqY2NEdm42VjVmKzBGL3dBRkJ0TThFTS93eitCRnhEZGFtNGFBNjBQbmd0ejI4dFJ3ekFaR2NjVjhxL3RIL3RtK1B2aTFISjRiOEVBNkY0WWhsQ1JhVmFTYlhuNVB6eWxlV2IxVVlGZUJhNWZmRlB3eExENGowZTZIa21ZVzVsQ0tXWFB6REk2Z1lOZW5oTWxjNWUwclA1R05YRnFLNVlIMDk4TVg4VytLZmlOZDZEZXp6NnhlNjFkSk9KL05hU1ZwQzV5ek1lTnB5ZXhCNmNWNWYrMWYrekw4U3ZnLzR1VDRyeEdPMUYzZk9MZHJSeG1HUkNSaGlvd09WSVAwQnI2cS93Q0NXdndiMVBUdkNkNzhZZkdTc0xpK2haYll6Qmd3ajI3aXd5UjFidDFydXY4QWdxMyt5WHIzeGIrQVdtL0Yvd0FBNmxjMnNyeW9OUXRvWEsyLzJ2YjhqbFNlRmtRRWNkWDVQV3VpaG1sUDY3OVcrenNZdkRQMmZ0T3A4dC9zcS90MjJWeThYaFA0Z3pyQmZyOGl5U05oWkc0R2ZybXZzYjRiNjNvM2pXOFhWSmJ0WmxSc3FrUndEZ2UvYXZ4VTFCOWY4SjY1SnBQaWkwbmd1WVh3eGxHMlJTTVlQdnh6WHVmN1BQN2JYajM0VVQyOXBlYWkycGFVaktDSGZMeHJua0FtbG1XUnlsZWRFckQ0eFh0SS9XKzhqdjd2VVd0NHBUNWtvRFFxL3dEeXlZRGdudHg4M1gycTk0ZjE3eEhvOFkvdEZoNWdiQmtNNEFDZ2piMDZmS2V2dlhobjdQZjdXbmdiNHNhZEJlYURxS0M0WUZuUXRpUkNjREJIZmc5dXA3VjZkYldsamV4ekMrdTNjR0dSaytia2xzNE9NOGpBcjVLZEdkS1hKVVI2U3E4eXZFOVNzZmlIUHJFa1dsV2wxUEEwYWgzdTdja0VZUEhRZW5RMTlML3NoYXZvK3NheEQ0ZThjeng2eERjeW9zUXZWVjJCMmdINWlEMUdSWHlMcCt1NmRvbW5RS2wwc1FiUzQ5c1dDeGJHZVA2K3hydmZnZjhBRVB4Rm9QaUNHL2l0SllMVko0OWtydUZaZ0NQbUFQSFE1ejdWbEtISzA0a2M3ZWpKditDNGZnMzRYZkJENG0vRCtEd2Y0S3NOTnR0UTBPNmU3anRMWFlraitlQUR4MytidjYxK1Yzam5TN2I0WC9IN1NQR2VuS2tVRjVjaU9RWStRcklHVTVHTUhqazErdXYvQUFXKzAvUVBpbCt6NThOL2phMWdidExHYVd6dUo0eVFZeTZxeTVQWWJscjhwUDJyZmhkSjhSL2hWcG5pcjRiM015TnAwRzY1dEpDV2trWk9NZ2ozUDQ0cjlLeWVVSjRkTk0rZXhkMUt6T0krUGt2OXZlTUw3VXRIdEFMYnoxV0tSZVdmWXVOMmZUTmVXK01maDdiZU5ZbGtuYVMyMUcyLzFOeWdQYm9PT1Q2MTdEOEp0ZStIM2p6d08rbitKYjJTMjFPMWo4bUpmcys0U3lFQlJ6NmxnYzVQYjFyR3VOSlN4RjE0ZjEzVFpiSzdLK1pERlBGanpnY1lLc0Iyemo4SzlXY294Wnl4cHlhdWp6cndkNDBoMWJVSWZoMThUYnVXT2NFSmEzMEp3azNRTHV3TWduMXEvd0NMdEYxSHdCcjBOdEFKSjdPV0luZTZuZ2c4Z0U5ZjVWVDE3d0I0aG52M3Z0SzBweThibVdNeHFXWmRwd3AyOGM1cnNiTDRnYWI0L3dCTnNmQSt2YVExcHFXbTJSTCtiR0ZFeHljc3Zwa0FaUE9hcFdaS2xLTWp6eTh2WTU3azNWcjhuT1NCMEpxNjkwdXBXTVJLZ1R4a1o0NmoxOTZ2K0x2QWYyWVBjYWVSZ0hnWTYxemlYelFnVzhxbFpZbUpEYlQ4eEhhcGVwMlU1cVJwMjNpQ3owaTlrdWJtelNhSlltaVdOdU56RVkzZTRGWjJteVJXbHo1bGhNc2lPdnpoZXh6ME5hbHJEbzNqQzAvczdVeXR2Y2hTSVpVT0FEd09SV1VQQjJyYUpxbmxTZ3FvT2ZNVWNONzFOa3kwbktScUhUSUx1emx2bGd4SUFBakRvUFg4NnFhYmNUNlJkb1psTHFEOHcvR3RYU1liZWUydVVhWXE2OG9NY2U5UndXOXRkazI3eUFFOS93QzkyckdvdE5EdXBhSTZYUWhaYXl6M2tKTzRRbmFGYkdEaXNiV05HdU5LOFJSUERxZTJON1ZaVEVUNm5uaW9yUDhBdFR3d1M5dHVhSnM1SGYwcmQxSFhmQi9peVhTbm50Wlkzc0xKa3VtVEFEc1R4eDMrdFowM1pDcXB1U1pSbG5GL2F0YXlxcFAzUzJPS2wxVHc5ZVdGdmE2bGFzU1lHQk9EMnA4T2x5QVFtSStZcjlPZlE5ejlLMzFWNXJjV2MvT2RvK3Z2VVM5NlJ2QjhzZEI5N3E4OTdwaXdrWmxhTURKNjFVMGpVYnF6aVdDVldERU5uUHRVZXIvYTdQVTFXNFF4eHNvQ09LdHdpZUN3KzNCVmtDeUJpMlB6TmFLTmlZeXZ1U3ozTnBxVzZDUjJSZ2VIN1o3VjFUYXQvWS9oZlM1YmlGMVdlVm9ZNWloMk9RT1FwUFVqTmMvZTZSRE5wUXZ0S2ZHUnVjcU9mcm42ay9sWFdRYTdvdXMvQWlMd1JxRjFPK3BhWjR4KzMyQ01SNWFXMGx0NWN1TzRKY0lUemltNEpqdllOV3M3b2FRdCttNGdJcFVaenh6WGtQeFdzTGRyOTVrWEpDZ2hnT3JZSnIyNnl1NDczUld0SldHREh0M0gweHdLODcrS2xwNGQwelQ3SnA3cEZra2NvKzV2WHVmd3JLZE4zVmh1U3NlWi9EalhaOUd1N20xMUJpcW41NHZteHNPYzQ2OStLK3QvMkMvR0l2Zml0YVEzQlZsa0lpd09jN2dTUDByd0x4YjhFWVArRk1haDhYZkRkK2t0dFpYcld3YU01TzREY1NEaXJYN0UzeEl1dkRHc040bm5mRWxyZnhzaEo2a0hwK1ZhS0VvU1RaeXpsRnhaNzMrMnY0ZFpQaUJQTkpDSVpESVZ4L2R3VHlSOVA1MTVwb0dsMjE3WkZkUm1lZWFCZHRySXgrNEJqbXZwdjl0elFZUGlWOE9yRDR3ZUh3RyswV2F2Y21QZ0JndlAwNm12bDM0WmExYjZuRExwN05pV1BJWWo4cVUxYVpyU2ZOVEt0aGFYMy9DUlIyMTZESUMyU1Q2QUhCNjEwM2h4WTlRMGFPWXQ1cnNwM2s5dWNkZlRwV0JxbDdOcGV0aTVnQWJ5Sml6bkdjRG9Sejdacm80ZENqME5VdU5GdjN1YlI0VktnamxkeDNiVC91NTYxcWttakdUOTQ0ZnhGcDE5WmVMVVdCU2JlYUk3MXh3akR1QlYrNGpKMGF6UlVLcUwwTHV6Z0JzZEt2NnhIOXQxVjdrdUZVRWdFRE8xc2puOHFkNGUweURWdkJJMHU1dXRrcTZvelpIWEFISDRWazlHYTI5MG0wMnhpMXpXb05MbUtrYmg1U2pqNi9wL0t1Sy9hQTBQK3lQR01HamFiTzN5UkRjZ1BJSFhuOGhXM0pEclBoM1hMVzlzYndTQ0tiZEl2cU1ubXVDK0tQeEJlOCtJOGVyYW9Bb2t1VTNMak9FQkhKL0FpdFZLeU1lWFU5dS9iVThQL3dCcGZzaitBUEZVa2U2VzB0dkk4d2c1eGpPUDYxenYvQkwvQUU2dzhVL3ROK0IvQ0Y5QWl3Mzk3UEN6eWNDUjJnZmFBT004OFl6MnIxVDl0dnhiOE0vRVgvQk96NGR0NEJ1bzVyd1BQYjY3Q3B5ME4wa2cyZzhjYmtKL0FWNUoremhxNDhHZkNIUVBpVjRMUVdmaS93QUplSkYxSzFtY0FDNGpVNzFCeU1zT3hIcG11aE9LcVJaeHU3b1RSN2IrMlQ0SnU5RjFXNTBtNHpHMXBLVTh0MUEyc0MrQVIyR0J4WGhlc2FGUGMrRHhvc01wRWtyREpIcDFyNlYvYlc4VDJmeHkxUFRmakY4TnJ5MDFiU2Rkc2JhNXY3T3dVQjlPdm53SkxhVWZLVkliZGpnakJyNXExRFc3clRkWkZuZTZUY3FZUis4aU1mM0N1Y3FmZmppdGE2dks2T2JDdmxwMlpuNkhiM3ZoK1pMZWNGK0JnODg5UDByNlIrd2FWNHUvWXI4YmE5SlBHYjdUdFJnZFJ2OEFtMkdQSFQwUDlEWGlvdWZEL2lqdzJmRldrM1FkbzkwYzBERER4TUIwSTdldGNWcXZ4TDhkYWZZWDNoalJOV21pczlSQVM3dFEzeXlBY0FrSHZqUE5UR2FpdFIxSXVUdWpQK0h1a2FyTGJhL2RhVkdXTXhDWkFKRzdKOUIrWDFwK2wvQ3o0bTZycU50cldveVQ2VGE3WEVMOHJMTUZQSndPaWtjWjdWN2ovd0FFMElmaGg0eHZ2R1h3OTEzVVZpOGRQcEV0eDROZ3U0QjltRHBDVEpLekgvbG9NQUt2SU9UeFdyOGFQRC9pTHc1by9oWFZMdEZhQTZCSWs1UWNMSVdZSE9EMUp5ZmFrM2NmTTcyUGw3d3Zkd3hmRHk2bjg0WmpXUmxVbmtqYmorWkZWLzJmL0ZmaUI5VTFIUXROZ2VTZS93QkxuaWpBWHE0K2NkdmJpc2pTVWMrRkJLbS9xd1lEcGpyL0FFL25YWi9zdTYvcGRwNC8wZ0xaSTA4R3FxN1BnWU1mbHNHSFBYajE5YTVzTzcwVWVoaTNiRU1vK09QaXBONDgrRHZpUys4Ump5dFNtdUI1cXVEeXdqUkFCK1hOVy9ETTlsNGIvWjc4UFhnZGZOMUtJb2dBejBMajA2OGl1YjhlV1VGLzhPUEVOeEhzVWZiUE5DeDhIRzRuR1IrbnJWWFQ5UWlsK0VPaFdzeEFhSzdieXl4NHdUOWVuTlVwYm1FNGRqWitKK3VYWGlyd05vRjdjdzRuc3pKWlR5WkFMcURsTSsrSzgwajArSzJ1SlJDVGdMeHp5SzlUMURRNWJqdzJ1bEtraGxZUzNxSzR3cW9FK21Qd3J6UFRIYzMrQ053Sy9NMzQxTTJyRlVGYVF4c3hhY3pCOW5tSHBubk5WTFdiWk10dXFFc01ic1ZhMWFWVXN3a1l5QXhEWUgxcUxSeWp0Rk5PTVNPM1BGY3IyTzVvMWZzMzdnT3lFZzQ2MXBhRHA0aW5qRnZPcDNya2dkcWRmaUppbHJaMi9RRGNjVkpvOEpodldaUjVSalRMYnV0WVRlaDAwMTd5STlhZ2RMMG1QUEhKNHJEOFFYK3MvYklOUHRyRmRuRE5LVnJvcnR2SnVrbW5ZY3IzNXJLdjdvVFhKbWdrVUJUME9PbEtrOUFyclVzaUs1dXJSSW1IRzRic2NIODYzL0RHbVhrdC9jVDZOYW84ZW0yd212SnBDTmljZ0JCNnNUL1dzTzN1MHRiY1hFajlSOG93Y0U5Y1YzM3duOElQcW5nVHhIOFJkVThWUjZQcFduUmMrZXBaYjJjSWRrUUhjbkxIUHI5SzNzN0hQVWtra1ovaS93QUs2MzhQSlpkU2x1SXJrYTVISGNzNlI0TWJBY3ArbzRyeS93QVN0ZGFoT0ZrZjVOMlRrL2Q5L2V2WGZIZmpDMzhlL0RhSHhGQmRMSTFrclJ6UnF3SmpZWVVidWNna0FIMzVyeDU1NWtnTjVjeGIza0oyL1RyV05LRGJia2JTbEZRU1ErSzZoUUJHYmNvWEdEUkF4dUkza1NiS3A5MWFwWDhUK2JGSFkyOHpyS2dJWXhFQW4yTlRwRkpZUktyTmd2dzY1cXVUVVNxYVdGdC9FRXNNaFZWK1huQXhWVVgyN2Zkak81bjZEclczNE44SVdYaTJUVkpaTldndHZzTm8wMGF5SEhtbnBnRFBOVXRGME16c0xjeEU0SkpLcmxldlRpdFVrWjg4bXlMdzVkWFBobldvdkVGdlp3elBHamZ1N3FNTW56REJ5RDllS3FRM0diNUNzT3dlYmtnSGdrblBGWHRiZTIwN2ZDWEFZSGhjODFRMHR2N1N2NEk5MkMwcWhTUHJUY1E1cnNuMVZudXRRbmRKZHJSbmhmYXM0M0VrZ0VzaW5yZ1ZwZUlMYUhUOVh1WTJiR3lRZzVOUVJ4eFhDTEloQWlBK1pqMXpTU0hLU004cEdDWFk0T2M0eFV0c3dra01ycVVDampJNjFOT1lUZEJZSU05czQ0TlNpd2VZYjJBQXowcXJFYzVBazBubmtXOFdCbnJpdEdIVXA3T0szc3hIMWxaaG4zRk5hYXh0NGx0ck5SSktjZk1COTJwSjkwTVNUVFI1SzhnZ2RLdUVibU01c2lqMCsvbHV5Zk1JQko1cFcwMk5yMWJkTGpjeFlaLzJUbW1qVUw3VXN4VzQySU9ybmlvWTV6WVNFeHVTUWVYSi93QStsYlJqWXhsS1RSOVFmRGJTL0RtcWZDUFh2QzBraVhFcTJrZDFDdWVUZ2M5SytadkV0a2x2cUYzYjJFcE82UXFBbmJuUDVjMXRlSGJqWFh2SllySFdab0loQWNsSkNOeTl4L24xclB2ZFNzTk1tRysyM1lZYmlSbk5OMnVad3U5ekRzOUZ1ZDRKSkI0NEo2R3ZXdmdGNDQxNy9oWUsrR0JneDY1YlM2WmNidWhSMDJqcnh3ZWZyWG5NV3UyT282eTR0WVdFZTRGUnQ3MTJud3MxcVBTL2lmb0dwckcwYVE2cmJlWXc3Z3VGUDA0SnBwQkxZcld2aEhRbDhialFaM2VkSTVDc3JLdU11TWpINkRtdGl6OEE2RExyYlRHOFdGWVpOMGNSd3dHRCtvcnBybVB3WDhLUGk3ck0vampUNXJqK3p0UXVvb2JPTURkSkp2WUxrK25QWHRYRDZiYno2L3JzbXJXbHBNSTVibkloVUVsUXpaeC9ucm1wZDJ5ZDBYOVFXNmJ4Qi9iZGs4VVVrRXFMbTJpMkE0NEp3TUQvQUJxeGMvQ201dS9FQ1hXcFhySXM1RSs0Y2tvMlRqajB4WHFkbDhJUEExbmJSUGQ2dk50dUxWZDZ5cUZLZGNqNm5wZ2UxZWorQ2ZoRHIvam03dHI2MDhQQzAweTJ0bGdqMUsrVGxrQS9nWHVjR3VldmpjUGhvM213cDRldldkb0k4YStGbndlOGFlTGRTZGRSMU8xMDdUbzl5cFBNQXBaVngwOTY5VHYvQU5uaTB2OEFSbThQK0M3dTYxbVp3UlBkK1J0aTZqb1QzNS9LdmMvQ0h3VytIK2d5eHQ5blc4dVVpSmU0dThzSEk1SEhRY1lycnJLWFQ3Tko3V3kwK1RhbUZnUUlGUmdWNTlPQnh6WGdZbmlKWDVhU1BVbzVTMnIxSkh5TjROLzRKNWFmcDJ0cHIzamU4amhoV1lPeXVSN0VaR0sraU5PZzBmUzQ5STBmdzVxWWwwK3lPR2dpUUJQdWpuUEhIK0ZibDVwMnEzMXVOQzFtTkc4eVRZVTJrcWNFSEp4eGpHUUQ3R29MendyWWVGWTVkaXRMTENqaEkwNmdFbko0SFN2SHE0cXBpbnpWR2RrS01LRWVXQnkydWVPTERUTld0TElLSjU3dlVBbjJja2x0dWNaUHBqQS9BMTJXalcydTNGMUhERHBpdVZrYUdCaGo3ak1RRDlNNEhmNjFTc2ZEc1VsbTJ1V0hoU0ZidVNOcEZuWWZPQ01Zd1QwNUhHTzFkaCt6cjRYMVA0a2VLTENPOXRacmRZR0p2YmhqaFkxVXN6ako2QUxnOWF4cU5OYURpbjFPVy9hWThjWC9BT3pENFB0TDdRTkp0Yjd4VDRpU1I3U3pjalpiUUx3MDhpajVzZjNRZXVLL05IOW9UNDlmRXZ4dDR3ZlZ2SCtzeWEzZmVaZ0xLU0lJaDZJaThBWkhiMHI2MS9hRS9hSjByeGorMHZxWGpTOFdLK2dtdkVzZkQybVhzTENBMmNiRkk5MkI4dWR1ODg5V3pXVHEvd0R3VG0xdjR1NnMzaStQd1ROdXZtTTB0dm91b3F5aFMzSUN2eng4M1A0MTlCZ280VEFwT3Q4VDduQlhkV3JkUTJQalhUUEV1c3ZwczNpT3ltTm1JU0draTNaUmp4amJ1UEp6WHYzN0ZmaHp3VjhaOVFXNCtJK3BKY1d1bVhhTXVqRENpVWdqNTI5aHp4NzhkS3YvQUJlL1lkMXpSRVBoV3oweWJUTEt5TytXMXZGOHVWMjJuTEU0d2VuNDFKNGYvWlMxTDRZL0RzL0Uzd2Y0clNMVnJTTnA3YU9HWExPWTlyRkdVRGdrWk9PK0RYZGlYR3ZSYXBTMVp6MFZLRlJPYTBQdVh4UnJPbStDZmd5ZGU4S1JNbW42ZGZXSDJtQzJpK1Y3VnpzWTdRUVFQcDN5YStsdjJiUEVmZ0g0NGVFMi9aNThYNktidXl2YmVTejFZT29CaWpKUVJ1cHhsWkV5Q3BISUlHSytVdjJQdmlKWS9HSDluMjYxYlhyTkxoYnZSblNleWZrQ1JOdlk1QitZYzlDTzNXdldKUEhtcWZzbC9zc2E1OFp0T2dTTHhiNGp1L3NQaHFGMkJVWGx3TWhnRG5pQ0xMWTlRQjJGZkdTd3RWMVkwdnRYM1BZbktMcDh5MlBoSC9ndUQreFI4Si9nMThVZFI4R2ZCM3huRjRoMUhRNG83dTVuVlYrMHJIS0R2dDU5cEN0S2pEa2djNTV4MHI4ejRibThzYmdQYk95bFQwN0d2MCs4WGVFOU9pMEdENG0rSU5Xa3ZOUmUvRDZ3Wm1kbnZETG5jN0VrYnNuY1FPL3AycnlDKy80Sjd5L0gvd0FhWFd0ZkRMNGJhbllhZklqRlRia2JaSEhPNEE4WUl3ZUsvUWNOaUtXR3BLRldYM25nMWNQVW5LOFQ1YytHUHhuOFcrQi9FVnZybmhuVUh0TG1GZ3hFYkVLNUI5Sy9TNzlrUDlzZlRQamg0ZFRUcmhEYTYzWW9vdjdVQTRaZitlaW5ISTVQRmVOK0dQOEFnaFQ4Y2RZdXhOcGZoanhMYzdHTG1LTFRVYklBRGRRZWNya2cxd25oQzhzUDJaUDJqdENJQk1Cbk5sZTVRaG1WaVZPVjZCbFljajFyemN6dytDeDFKenBhdGRqcndzNjFLWExNL1R6UzlkdExGTklndW9ZOTdmSkpjUDFSTWc5ODQ5Znhyck5XMUd3aTBhM0UycGhaUzhiUUV0a2pyZ1l4amJ3T2E4ODhJM2R2NGpzWUwyNUJrdFl0bm1FS1B2WU9lM0lQRmIycmFyRGFTUTNjbW5vYll3QkdiR1dSY2pvTzNCNzE4UzQyMFBUYXZxajJPNDhhNko4WGYyZnRTL1o0K0sxd0dzZFV3K21YcUlITnJPQ3ZsdWVPUGM4Y1pyNVkrSlA3SVh4bCtIdW4vd0JuYUQ0VWJWTEFMdWluMDFoS2tuem5CS2RWeVA1NHIxMjU4UmY4SXVJSUxhSXEwaVJ5ZkpHZWc2RWp2Mi9XdlRQQnZ4TXRmRVZsWlhiM3BzN3VKVlJ4RUJoODhna1o2NU9hM29abmlzQXYzZXFJZUZwVnRKSDViZkVuOW0zNGw2SnJyYWhaNkFOTFZHM3pXMEtlV3JTS0RoaU8yVG5JSXh6MUdLb2E1cCt1TDRNZTE4YytGSjU3M1M1VmwwKzczZWFFUlFGYU4ySHpBRE9jNTY4ODVyOWV2RmVtL0QveFhwNHRmaUY0S2kxU0tSZ0RMWXc3cG84ODU0T2Yvd0JkZUovR2ovZ25ENFE4YjcvRW53SjhZdERkdW03K3pMM0t1d3o5M25HN3JqQkhxTThWN21HNGtwNGkwYTZzempuZ1pVZFlhbjUyUzZ2b2Z4QzIzZHloc2JrNy9zdDFaTVVrRDVBREJ2NCtmNGNaK3RjcnJQaC80azZSRmU2anFQZ1BUZGNGcW5sVyt0V1RyQlBzSEkzb1J5Mk1rNHIxMzR1L3NnL0Z6NEhlSXZ0dC93Q0htdHA0MlpqRk5FQkZLM0p5cDVDbklISHBpdUEwMzRsRzJ0cDlDK0pGeExhM0YxZG55b3JxSGJDZ0lJK1ZoeDM3akEvR3ZlbzE1SmMxTjNpY3M2Vk9ycEpXWjV6NFErSXZoM1hOVWZRZGJacmE3WnlzVWR5Y0RyZ0FHcGZIZmdXMGkxTlliS0lOSU11U2c0eDI1NllyclBIdndOMGJ4SmFmMnNiYU4yV0h6a05xTVlIVUhLaitYZXVNMURSdkd1alcwTjZtb1N5UUMzMlJsMXl5SU9NRS9UL1BGZWpTcVJxclE0NmxDZEk1SzFhVzgxWmt0NG1pa1U4cG5yMDUvblhVNmRlVFBhelc5OEJKNUNibDNkc2Uvd0NGY3ZwOCtyYVJydzFHNDA1cG81RXdURXVXWFBIVDY5cTZTeTFQVFpZM3VycUc1dG9wRzJ4dkpBUmt0MEdmcG10M0VsVlhFcUxld1NMOXNnaEs0NGxVZHhUYnF5Z2w4dTZodVFwYmxSbnBWaTJrMDJ6MTlyQlpGS2J0cHdlLytHYW4xVFJZQThyUWNjRHl5Q2VDYXluQTdJVkcxY2dzOVRHcEk5dTBvY1I4TVIzcHVuK1E5NHlRcUJnbkg4cTV2V3RMOFFlRGlMKzBqWm9Xd1pVSTZjODlhMk5DdjdmV3JSZFJ0NU5oVEJiUGZGWXVGamRUdWROWTNNdW4zQ1FTWk1aKzZ6VnJ5M0krMlFMR2Y5WWZ2WXJDMG5XWWRTSWl2YmN4S3VBcGZxZmV1aWxXR0RUVXVKb2Q2eEVNSkZISysvdldFdEpIVFRsZU5pMXFrYTZ6Q2JGbHh0empiL1N1ZnNOYW44T2FsL1ltcjgyMDN5aDI5NjFyRzZ1TG1VM3RwSXNrZlZ3RDEvem1rOFYrSDdYeFRwYVN3UHRtaVhNWjlEL2sxdkdTYU1yTk0wOUxzZFEwWnhjMjBnbnMzNVZlcFVaLyt2VVRQSFo2ZzAxcXpHT2ZBS2duais4S3lQQi9pTFZ0S2pHazYraERnSEVqZEN2YXRoNGpjd1BjMmgzS0hCeUQ5MG4vQUJwWE5MYVhOaiswRWlaYmVDWGJHNllKeDA3L0FNc1ZqZUwvQUFsb2Zpbnc2ME4zRHU4em81SnlwOWo5QmlwazFUVGJtM2p0ZCsyWUVBcjA3VWtVbW8yR2lSeWFqWnNOODdDTmp3Q0tUK0pNaHZRek5GdDlYOEcvQzdWZmh2QmZTUzZkZTVsRVVoLzVhYmNaR2VuV3VEK0ZWekJvM2dtOWVDUUM0ajE5WUprSEJBS0ZnZjUxNlZESkZkaHBZeVJ1UHpiajA3OFZRbStGOXNsdlBmNkZHY1gxMGs4cUxuNzZxUm45VFdrdFkzTTFGTSt3djJjdkZPay9FZjhBWmd2dkF1dFhheTNFTnUzMmRKVGtrYmVncjVVMGpSNy9BTUhmRXFleWtCRVVrekx0STl6L0FQV3JvZmdSNDAxYndiTTlwRk02cWNoaG5qOHZTcmZpdUZOYjFhNDFxMHdmTGZkSXlnWjYvd0Q2NndsTG5TTkthOWs3SEhhdnJTRFdiKzF3VlpaTm9HRHlNMTZENFl2a2swSkdtZGZMVlJsY2VtVDJyei94SEhadHJzT29nQTd5RmtQcml1eDhOTFpKWlRtR1pKdGdBaGpJUE9ldlQvSXJTRXJvbXJHenVjN3FDeVcycnp4TVdaR2wzeGsraFA4QU90S2F3Rm40Y2g4VExLRlJMZ3hzYzRCSnh6MHJMazFEWnEwVVdvWTJzei9LUjBJWC9HdGp4TkdZL2hSTnAxNWJzcGt2Vmx0bkhRZk1PdlBvZjBOWnlMaTFZeFozbGpEWENNY3pIZGdua0RPZjhhNGo0NDZQcDBFUGhqVTEwM01zbHd3dVpGNDh3WkdBVCtINlYybml5YVhTQ2tSR1FMWlN6ZmhVSGlYU05NK0lIaFBRb0xhOFR6cmU2THNtZVZHZnB4VnF5Z1JMNGpHdTdmVWJYU1YwT0tWbXNwYnhicWF5Wml5QjhZRFl6MXhubXUzc3RZdHIzUnhGRlpyYnE2YkpWaEdNZ2dBNEFGWWV1UUZOUmExY2N4aFJnTDErdFQrRGx1NzNXWWJLYUR5b0VrM1pBR2ZicjE2MUZOdHZVbXBHTnRDcjhBZml2Yy9EZjR6blJiN1dKck5JYjlYV09WOTBWd2daU1FlRDg1VlNCMi9XdnFqOXBINGFlRWx2VzhaK0QwZ3VkTjFTTmI2eHVMY2xrZU4rQ0EyT2NFOU9ncjQrK0lkcE5wdmplYnhEYVdjTHp3SUFESWdiT09NWUo5TS9uWHNYN0t2N1EraWZHbjRjYTM4RU5mMXUxOE9hL3BheTZqNGNndXB6OWkxQ0lETXRneGIvQUZNaGJCUXJnY0hOZDhKdHF6UEpyVTNHVjBjSDRrOFBmOElycmtzK25TbmJjTCsvalU0REU5U1IwejFxbEI0YXRaeStxR01iWFU3Ui9FU1ZKNHJvL2lsZU5QYlJhanB0cXNVTHhnN3d3ZFJ4MHlNN2lEMzlQWEdhVDRmNkJyM3hEMHEzOEkrRDdiZnJFdW9CYmJBeXB3QzJXNXpqSGNqQUhXczVhRzFPejNQUE5FMVBXdmdOOFZ0QytLbHZMTGF0WmFyRkxNNk9RVEU1MlNBZEFRVno3ZTFmVi83U3NtbzIzZ0RUdE9rdFNZMXRwWmJhNis4QmJTdXJvYzR3UVEzVWR4WHpkOGIvQUFyNDU4UFdzMGZ4UCtFMTdlV3NXRSsyYVZLTUJRTWJ0cDQ1RzQ1Nzlha3Uvd0JxMjk4Yy9BN1MvZzRtbWExY1BvZ01WcHFPcFdxaVFXNUEvZFNNcCtjTGhWQjdCZWxSR3BKYm9Kd2czZE04bTBtNE1Pa3ZvU01QbXMxbTNlaEp4L0lmclhBZkRmeGo0MjBUNGhodEJqYnpIODZFL0xuQVliU1JudUFhN2J3RVRlNjdOSk14eEhhUnB0YnQwTlUvaFg0ajhHK0UvakUxdDRpWlVqYTRjeE1WN3NDTWUzUWZqV2VHay9ZblZqWTJ4QloxNmVML0FJUW02ZTN1em1lTXhHTW51dnArdFVQRWxocW5oendYb1ZwY2pIbVF0TXFnOEVIcCtsYm54SjhJWCtrK0M3YldJa0pobnZaV2JhZnVnc2R1YXJmRksrYldQQ0hoNUxmRWp4NmY1WkNMeUQycW9hM1puSm1kRjhXUEVsN0tsaE5kTXFKWitSdVRQS0h0K05Vckh5MnZXZEhVZktlbFU5VzBxWFFudDdVd2d6R0VQTTMxNUE0cDl2TDVZREtDQ1Y1SnFaN0YwMVpqTlRpTnUwU04wZGp3ZTlTMjBHYmxaVk9BdjNjY1ZaWVd0N2NReHpzTXBDV1hKcUhUcG9RV2hrUHpidUFlTTF6TjNSMHhkMmEwVTBxTXJOTDl6a0h2VTY2M2JRVE5LN2phNjRrUG9QV290TjA3N05ieVR6eUZ0L1BmZ1ZtWDhGcXFTTEZrN3VnckZybU90YzBWZER2RU90d3pYS1c2UzdsMkFLeW1rUkk3ZTNOMWVFcTVJRVk3a25weFZlM3NyWUlraklHQ2tIbm5GTzB5Tzd2ZGZhNjFWc3hSakZzdllWY1VvclF6azNKM1owL2cvVGREMWJ4ZnBXZ2VKYmhvTlB1cFZpdUpWUE1XNDQzZld2b3I0MGZDWFFmREd2ZUZQZzdhV2lyb0Z0b2phZ3hiSVc0bmM0eVQzT01EdCtIV3ZtZStqZ2NpUlhQQnlOcDZjNXpYMWw4QlBIbW4vSFQ0RWFuNGU4VndySmYrRk5OSGszTEhEY0JTdlBVOEtRZWU5WGYzVG5xd2ZNajVIOERhZGNYUHhSOGIrRmJTWmpCL1pjMHlSOWl5U2pEWTlkcDYwbmlMdy9MWjZiWnlMSGxRQ0dZRGpkeng5YTJORnQ0N2Y5clRYSTMrVkx6U2JvbEV5UWQwUWJrZmhXTnIvaVhVbFpMRHpmOEFSVW1MQkNPQzNUK1dLMDZoSFJHUFpQY3RjRTN0N0lzSzhCUWVRTTlxenJ5eDAyNDFDU2VPN25WVU9Rcm5yLzhBV3A5OWZiNzNiRTNMSGhmV29wSGtTNzN5ZENjYmFXeks2Rit3YUs2a2lodG96dlpnb1BQekFuSDg2OVo4WGVBSi9CZnd5aWEzdTFGemNLSkpUd0dYampuMDQ5T2xlYmFIb2w3YTNhNmphV3U2WkVNaVE5K3h6L1A4cXlmRkhqWHhQcTBnbXY4QVY1SkZKK1ZRL0M0N2Z6b1YyeUpOcEZXNXQxaTFKYnJXb251WTFPRzJuK0wwelduOXJ0NFBzK3FSNllJcmFLWlNHSEdjZHMxanhhcGJ6V0VrTURTaVZ2dmg4RUhqcUQyb2lNOXhBc0Vqc3k1enN5Y2ZsV25LMlplMHN5VFZyeURWTlZtdmxRbFpaU3dHZWdOUm5IbWJSa1I4QUFDcTYyUmE3K1hjaWh1Z05iVU5pRktNMEJLWUJPRnpqbi82OVdvQTZseUMxczVZWlBLTVkrYmxjanFQd3JRZzBmVTlqemlKbWpITHNxL0tCUkhmUnBFMHM4QmtDeUJJVnJVMHUvdjcySjdBM3J4UXlMbG9nT00raHB1bVR6c3JEUzdXMHRsdWx0d0FmdkdxOHR4YXZLMER4NVRIR1JXbHJWdmNhVkFzVTA0ZHlBUW9QYW9mQjNoNi93REZtdXhXRnRERnZVRnp2ZmFOcThuK3RhUmp5b2x5dXpGbXZZemFtQkl0cWc0d29xUFNkR2t2N255NVNSR1hCM0VkS3U2dmJ4MnVzWEV1bnNtMVhiYUdPUXB6ejlhbDhPM2JyZUNXOGw4MEhqYU9CbW1EZWgxODlwbzFqNFdGdkV5clBGakw3amx1bkh2WEJhM0FidVUzNnFNQnV3NFB2WFJhbk1aOU91WUpyVXh5S1I1V0c3SHZYTzJFTjJxdEZjVGgweVNGNTYxS1JOMFZ0RnROVHRyMFQyelkzbk9BdnZYZmVEZkMrcDY5cU1LVzhmNy9BQVpGWThBRmZteitsVnZBR2hXdXFhbXNRVVB6d0R4WHRmaGpROUkrSFdoWFB4RXZMcUdLR0dLUklBKzBrdnRLNHhucVMyTWpPTVZGV29vUkhCY3pJZjJrUGg0dXIvSHJVOVF1clZ0bXJRMldvUm1KQWViaTFpbFAzY2pHUzJmcFd6NE4wUFJQREZwQm9IaHJTaHFPclNyajkzR0NGT1N1R0dQVHRXUDRWMWY0MS9ITFZkTzhOVzZMSmZ2YXhXZG1rY1k4eTN0ays2Wkg3Tmo4U0srbHRFK0ZlaS9zcitFYmZXL0VOajl2dTdpUlJjM1VXQzI4OWNaR1J5T3RlTm1PYXd3c2VTT3MyZHVGd1RyWGsvaFJtL0JIOW1tS1B4Qkg0dytLMXhISklybDdiVFNmM1l4emx1M0E3ZEs5ZThaL0dud0Q4TTdXTDdaRkc5a3plWEtzU2o1UjBCQzUrNmF6Zmh4cE9vZkZ1NmZYWjlXTmxweDA4ZVZGRVMwZ0p5TVk2OWUvWDhLODAvYUMvWjN1ZkJ2akMyMUdUWGJpL3dCTnVwMVdOWm8ySmlLN1NVSkIrYk9XNmV1ZWxmTlFoOWNyYzFlV3ZZNjZsV1ZDRnFTME90bDhjYXJxRm5LYldEWkQ1cE1Mc01sRlBSajE3SC94MnEwUGlPK2g4V1djdXBCcElvcmQxZFd5ZXBJejE1TmJ0ekRvVSt5NDB1VlpCNVpXV0JCa3B0QUFCem5HQWV2dFZQVE5PMFN6dEpmRjJzNmpid1c3a3lDV1dRSWlLQ2U1NmM4Vm5MMmNaY3NVRVBhVFYyeXJINGl1dFF2OU8vc25WWkk0V3VTVVE0eUYyZ0VuMTdqMnhXL2Q2dHBIaGxsMWk1a00wRWhJbkdlZHBiSEhQMUZlQ2VPLzJxUGd4NFQ4U1hGcDRGMVdUVnJ1M0RrTGFSR1JReDVPR0l4eHp4WGxldS90Y2ZGL3h6cWJ3K0NmQTA0Z2RqR0RPaDU1T1BiZzQ0cm9oZ01UWDFTc2hPdlRwYnU1OWs2bDhROU4vd0NFemJ3WDRmc0g4aExhS2RyempZZ1lqQ2p0a0RQNW12UjlUOGZXSHczL0FHV3ZIWGkyMWVNWHY5Z05iUXlCZ0czWERwRGtIdHd4L00xK2JlcWF6KzFsY1hEWDB1dUpheW5CTWFNTWhlb0hQb00vclhRK0ZkYi9BR3AvRlBoMjc4TitJL0VjdHpwY3F4bTdqSkdXVkdETDZkRHoxN1YwVThtcVJxcVRsc1pTeDBKUWFzYzUrM044VUpOQzhUK0ZaOUQ4SjIxdEhwY3duRTBNSURTS20zQ3N3NFBRa2V4cjYrL1pJL2EvOE1hMzRhaDhRV09wUmVaNVRHWlpIeklDWXpsUmpHTWVuUTU2ZGErVi93Qm9EUzd2WDlDdExEVWZES2hJamp6WmVFZVJrT0FNamtaeDgyYzl1MWZQZW5lSlBILzdQL2lwYnpRdFN1SWw4NCtmRnV3aFhjVllZempPT0IzNTVyMTh3eTZPUG9wTGRITFF4UHNwVzduNmUvdEkvdG5lTXZEdmlqUS9EM3hrK0VWcGMrRTd6YjloMXdJdm1UeGdJQ3BZZER0TGNkeGs5YTZuNHNmczFmQ0RYLzJmSWYybS93QmwrV1Z0SnNXaVh4TnBEWERTcEJFVktpVk80VUJtVTU3NTdZTmVZK0VmR1BoMzlyYjlqbit5SDA5Ynk0c0lra2ZhcWg0V1ZRR0k0d2NEcGpCK2JrZEswLzhBZ25CNHk4U2ZBNzQ2UCt6TDhZSmhKNFUrSU9ueWFXeTNFaGVNK2VoRnZLdUFSa05oU2V4TmVOUWpPaEZOYnJjN1pOVkZZNFAvQUlKdGVLVzhLK01mRW53Vmx2Q29qMW1XT05kcDVpa2tRakhiT09SNjQrbGU3LzhBQlZmeFRlK0h0RDhCZUU3TzlDUjZaNFR1TmROdUFjUGMzZHlZWTI3amNxSWVmYzE0cit6MzhOcm53WCsyeGUyOTdaM01VdHJmdFk2akM0WlI1MXZNRkQ1NjhxRk9UMDVyNkMvNEtNZkR5NS9hQy9heThJZkNMdzVZczYzWGczdzdheVNNU01SL3Y1M3hrZTNQYmp2WFRPclQrdXhxZVJNWXlWSng4enhuOWpUNFdhUjRnMG5VZmpWOGZMa1A0ZnNpNmFScDl3Y0pjU0psaTVIQTI5ZHZPQVFPdGFYd2cvYisrSXVvZkVKdkJqL0RUVDQ5R2p1VENCYVdqQjQ0aktFUnlRTURBd0NSMkE3VlMvYVNnVHdicnkvQjNUOWF1WWREMEhiYUMxdDRWNUtnNzJmYWNFWXlkdVR5YzRyMFQ0ZS9GbjRHL0FUOW1DOCtJT2wvQng1TDVKeEhhNnByUlR6Tld2OEFIeXBHbjl4V3l6TjNVWXhYSGpJT1VIS29ydVd5Q25XdE5LT3lQdWI0UGZ0TGZDdjRSL0JSdkdmeHUrSUdtK0hZcmpUWE52ZGFqY0xieXJJWXRtRVFqTGtsdURqK0h0WDRDZnRmZUN0UjA2L244UWpWWHZwckhVMm0rMmVadk1zYlNzeXlaSHFHQjllVFhxbXFlSi9FUHg5K0pGNzhSUGoxclZ6cUx3aDJTME9mSnQxM0Z2SmlpNktuSFVldWVheHZFc0ZwOFR2RGw1b056WVMyMFVzVWlXL21SakJVWUs4OFpJNDZZOXZTdld5VEw1NEtqTG5meEhMaThWR3JOY3A5SGZCejQ4V3NmaERSSXI5TVdzMXRDWnJvTVNNbFYyNTZlaCt0ZTRhYjRtMHpYNFkxbmxqTWNzYWIwVEhUcnU0K2xmblQ0YThNZkhUU2ZEdHJZNlA0cTArR0MyaldFTE11ZmxCeXBQc0JuNlZhdGZpaCsyVDRSdnBZYk85c05SdG9keUw1YWZ3ZzlPRG5JelhuNGpLS3M1dHdzZE1jWkJSMVAwb3N2RXFhb2tuOW9Sb1hqbEtROGptRUE0QnoycU41cjNUOUdsK3dSSCswRXZWYlQ0b3VVbHp4eU05TUhyanNPTzlmbmpwSDdjdngrOEszQ254ZDRLbVpJMzJPMW9SbkdlZUNNbml2WlBoTi93QUZFZmg3cjJvUTJ1dWFvOWhkQmdUYjN5dEVWYlBidDA3VjVkYkxzWlNXc2JvM2hpYVV0bWZhZW1mRTdXL0NJK3dLenlYTzVOeGpUcnh6MFBRRVlGZGRaZnRDYVBDbGxIcktxYmo3ZEdzVXcrVjhkQ1FlTVlHT3RlTytGdmp4NE04V1dndVliK0lBS2NPcUJsSngxQkdlTUFjVjBmaFUrR3ZGWG0zdGtrVCtXclJ4U2diU2hLc0NRTWpqRmVlMGtyU1JyZDN2RStzajRZK0cvd0FidEJtMDI3aDA3eEZwa2pFU1dGMFFiaUhJR2RqL0FFUEdlNXI0Vy9hdC93Q0NaSGhIeGpwR3BlT3YyZTdadGIwNjFta2kxYlI1STkxMVlTSU1PT21TQjkwWjV4enpYclhnQ3o4U2VCYmxCbzJ0a0phcnVlVldiTWpncmdZSnhnWTZqcG12Ui9oSjhkbThEZkVQeEY0bzFEUVo1WVVNRXVvTkVubVI2aXJFSzBpZ0U0a3lPU0FmbEI5NjF3V1B4V1h6dlRsZVBZenEwYWVJWHZMVS9IM1ZmQ1BpL3dDRDlyUHBWcmNTdnB3RHJjNlpmcis5dEhQR1Z6MkFQNjFhMGk1OEU2cDRJYlQ3NjdqYTgrMHgvWlF5cmdSZ2xUMzR6d2NlcElyOWtmMjVQK0NhL2dIOXEvNGRINDgvQWF4Z2cxOXJMejd2VFl3RUY2cFhjMkJnYlpUa0RIZml2eE0rUC93WThZZkJ2eHE5d2JHN3RsdGJsbHZyV1ZHVjdkd2NNU3BPY2RzZHMxOTNsMllVc2JUVTRhUHNlVlVwenBQbGxxakc4Ui9EWFVOSDhXUGQyU2t3d1B1VUFEaFR6NittZnAwcUg0d3NJUERHa1R4eGdpSlpyc29CL0VDRVh2MDYxNkQ4UC9GUGhQeEJxTzdWcjlKbDhzS2k3VHg4cEdRT3VPbjA2ODFXK01mZ093bFdGcktYekxPRFJZeE5PTUZZbWVWamtrODQ2VjdNYWprN000S2xQbGxjK2ZkSTFyU05mbkZycml2YlhCUHl6SVNBZVJXcEZmYW5aWGIyd3VCY3cyc2lrU1k2cjIvU3EveEg4QmFuOFBsRjlxT2ltYU9WY3dYTVJ6RzRPQ0NDUHIwcmtOQStJWmp1R3Q3NEFMSWV2WDlUVnRtOU5uc2tHcmFMNGwwNXJlK2pDbDFBMk1PcFBCNTk4L3BYSTJXbXI0UzhTTnBqSEZ0YzVhSnp4dEo3Yy9sVnJTYlhWYit5am1zSTFiek1FS3BHVjlEK3RKNDFFRjlwcVFYSjhtN2hQQkkrOHd3S2g2bzZFem9wUERjK3Iyb25zQnViSDd0VUhQcVAwcXg0ZjhTWE5vSDBIeEhhK1dWQlVPVis4T09EV1I4TWZFRi9iWFZ0TmZYcEh6bFZVblBSZjF6K2xhWGlLTzl1TmQreUdCUzl3eE1ZT0JnZzhqNkNzT1RtWnZHVmllMEZwWmFoNVZtNThvSGNjSDhTRFdwZDNjY2NxWEtOdFJoZytqVnlMUWFqWnptZTFtOHd4Zzc0UzJUd2Yxcm9kRGtUeEpwSDIxWlFpS3hWa2JHUXdIZXJVRWtTNTNlZ1hjY2pzOGN5Z29Sa0hIUVZmOE1TVGFUWlRXclA1a1UwZzNzMzhQSXgxck5sMHdmYkk1UHRyYkN3WEh0L1d0dlJ4YlMyTTlpQ053a0kvbnpqMnA4cUtVcjdtYjRwc0d0N2thcFpFNFE1NC9pNzEyZmhPWStLdmh0ZDJON0h1bnRrTFJzUmpyZzVyaHBiaTZ0ekxaM2I3MVVueXkzYmdWMlBnWFV4cFBoYThlSlZ6TWhHVDI2L21PYWxvcHhPYTB2RWtid3R3eWdnQUQvUHRYU2ZDclc0cFM5dnFPTXBLVnczWUhJL09zclJ4RjVyeUNMbkp5d0hIdFdoR2x2Ykw5dHRKWTQ1RE9vM1o0SlByVGhkc3hrMnRpYlVZSDBmeFBPbmttSkpXM1E0SFVkdjUxME9neTJqcGRRU2tLczl1ZUdQVSt0VWZGMGdodm9iTzlmRENFTkhLdzU5L3IwcTVQcDBObGJJektWekNyREhmTk9jRjBLVW0xZG5tMnJmYTdxOGx0NFRrbzV4OUIwcnBmREVtcVFhUXQ5YmJpQmtITGZUTmN0ZHhYOFdyM1R4ejRDNU9NNU9LOUUrRjl0RGMrQjVKNW13cnNRTjNKL3ptczR3c1ZPVGNUZ05adjd5WHhQQVVneEVFSmNLT3BQWDZkYTcvd0FSM0VlcCtCck94aVVzWkdqVWZMMFArVFhOM25oeWVQWFZqRWU1R2lPQnh6em44Szdyd1VWajB5OHRyK3pVeTI5d3JRQmdEdDVwTFZzYjBTT0w4YzNGcHFGN0xCR0M2d3FzSVVqcVFPZWZ3ck5zOUluMHZ4S3NjVVdFbmlWMENucDYxc2VON2RJZGZtdFV0OXNlN2N6b09keDR6K2RaK28rSW9MSzUwKzdlY2JvY28rOGRRZjUwbWkwa2tMcmpOQkJlWGpzR0t0d1NlUitOYVhoQzRtVVd0NU1QbWZrci9uMUZZZHpwejZycHN0NUZLY3pTSGFQVHZWcncxZVRRZlo3RzVCM3hjTC9uOGF1Q01wdFdHK0xuc1A4QWhMbHQ1Q0VpdUJndWVPYzhIODhmalZYUlBoWm9ONGJuVkxPeFF2TEt5TXlnbk9QN3ZvZURUL2lFTGVUV3JXYVk4QWJ0Zzc4ay9sMHJlOEsrTGRIMEh4WFk2RE1qazNVUWtWQWhQekE1NXo2ak9QclhSSFE0YXEwT1Y4SGVOL0QzaEpicjRaZUw5UDhBc1U3M0ROWlh0MU13aG5SdU5nYmtKMjRQSEZkQjhQUEhQaWY0Si9FZlNmRytpa1MzTmxkTGMyZjJoY1JUTHlHakxaMmtNdVFEK05lZ2Z0RWZBL1NKSHM3K1d3aVlYMW9za2NaQVAzdWRyWkdRUm12RXRRK0dtdjhBaDFQN084T2FyY3d4RlAzbG0zNzJBZ24rNDJjY0R0MHhUa25iUXhpejYxSDdSSGdENDYrQzlVZzAvUzl0MUJNNHZyUjRRUHN1NGNML0FMU2drZ1kvdTlLODF1L0F2aHkydDQ5TnNiR1B6aUpKWkdXTUFBOGdnampubkdQYk5mTGFlSVBFdmd6V3RRV0x3Yy9tWExFeVRXdDNjUXBJQmtBaFZPTVo5T0JUTlYrS1B4QWpzeGZXTnJyTnBNeHo1a2V0U3VjZCtIQjR5QlZlMTBzMFI3RjN1bVVmQk4wa210YXBhUkp0Y0JBclk0R0FQV3VDbjhJWHV0ZkZLTFRBSGFhYVVsTnBPVzZrWXhYcFBoSFNrVzd2OVF0Mi9laVpVMm4rTHB4K2hxOThCdE0wN1cvMmx0STFQVkVSSTRiNEpMRTY4REF4K3BKcml3YXZSdWVsbUg4ZHNzZUU5UDE0K0hkVTBUeEVza2l4cmlKSkFmdkRqQTQ0KzZLeFhtdVBBZnhEMEM3OFVhY1gwNk80aE04TDhqeW1KeWVmVGs1OUI3Vjd6NHUrSXZoQzk4VlIrRGJYd3piMnlXV3F6TlBkeHI4MDRMN2NNQWV3STV6WGtmN1QvaC9YL0R6eHdRNmlKTFdWVWUyRWdCd2hWZ01udjE3SHZXdE42Mk9ONnE1bGZ0TmFYSDRMK01WOXBXYzJ6UnBQWk9GSjgyRmdDcEI3OEh0WEkvYXJhZXgzd2diUU9CakJCK240MWMwM3hUYytQZkRNMmsrTHJTVzgxWFRMY05wdDFQTGlSNEZHUEpKNUo3NHh4aXNmNGIrWHFYamV6MEx4RTR0TFM0bDhxU1dVNFdJa1lWbUo5Q1FNNHFLa0x1NXRTcTJWbVhyS3lmVVpYdUZJV1MyaEJWV1AzMVBYOGFzUVdsbGNZUy9mYUFlV1E4anBYZWZHcjRUYWQ4TEEwbWdlTHRPMWFNd0pCTmM2WmNyS25uYmNzTnk5U01qTmViNkZETFBlR09WanVJT09hNVpKcEhYVHRKbzFHdVludHpCYlN2c2pQeU5KL0VLaXY0V0VLT3lBWkErYkZQbGprczBhR1FiZ0grNE90Wkd1WHR5eUlobUtSZ2doYXhpN3M3WmU2alJLaUd5WXFtUzNYMnFld1JaU2haZXE1MjAyenVZSmJWTVNoZ1ZBYkI1SDEvT3IraXdRR1oybHlQS0h5Z2pyelZ5YVc1S1Rsc1oycXZjUlRDSzN6ejF6MEhOZTAvc3BhbGYrRFBoejQzMWFUS25Vb0VpaEI2RmRwNTQ3Y212SDcrSlhuTThrUkhPUU1kUDg1cjZUK0JHbitGUEhmd3IwaTB0VkVWM0RyRVZucXlzbzJ5UXV3S3Zra0QrSGJqM3FvcThMbUZWMmtrZlBudyt2TEh4SCsxc1pMYzRSb3JxSnhJTUQ1WWNFYzlmNVZsL0haTlAwYldIMHZUb3dxeHluSlg2WnExOE1idTl1UDJ3N3ZWcmF4U0NLNTFmVUFpbGdzU1I3WEFYY2NqZ0FjQTlDS3FmR096Tng0eG1sdVpSdForRG50Nys5YTdUWG9RdmVwM1J4V2xRTmNYQzNrekhjZzQ5NnNTK2ZjM1FqUWplekFBK2xXN3BiUFQ3WHpJR0RaQXdGcXJhVFJpYU9lZFdSeVFDUWVncXJjekJPTVluUStGdkVhYUQ0bVo3bDJsYTFnS0pKdi92TGdnNFBUazF3OTVkTkplRlpTY0J6eCtPUlhWYVhvNjZocnphYlpqYzBrWHloRkpKUHA2OXF3OVcweFA3U2ZFUkRDVWg4ajBJRlhHRm1aVkpYUTdTNFlZTG9TM1VXNU9wWFBXcmNzM2tTYjdHMEFCUEFZNU5TMitqejNOM0pPaktFUkFRTnd5YWx1ZEx4cUNRU0tVWFpuQkdQZXRERXFNL2tURXZFY3QwQUhlcjJqblZoSjlvUzVhRkdPTnVPMzBvVkl0UHV3cVRvM09WNHp5YXR3Mjk3ZVNzU21ON0RrREFGT080RXpzTGEzK3lYS0IxWnQ0SlhvM3JUOUh2b2tMcXpaYlBCQTYxWHZyV1FScE5kbDFJYllYQzVCOXZyVExYVVBMbkNpQ0lxaThNQnkzQTVxeE0xZGRobjFHVjd5T01sWXJjR1VaNkNzU043eXljM0ZuZWxXS25CUnNIRmFsaDQzanM1NXJhZURLVFFlVTVISTlxenJhMWdpdWx2SGY1VWJLKzRvRllwUklxajdSUEpuSTVCTmJmaHJTa3VqSmR4WUFRWnczNTFUanRMYTdrZTZ2V1dGRE5rTURXdVpOUGhnV3owV1ViaVB2RG9CeDFxa3JpY3JJdFhNdHJkeHpXYlRLR2pSWkdZdGc0SEdLcjJHazZmY1hIMmUwWlpRNXg4cDZtcXVqYUxKUE5jVFhMdklaRHNZQW5wWGZmRDc0ZmFiTmV3ektqUm1MQmNFWjQ2NTZIZ1lvMk1yM1pxL0NYNGYvMk5CcTNpVFUwWllkUHNqTHRWUnZmc0ZBSjV6N1Vtb2FScEh4SDFIVGRPME9QVXBMM3o4aXd1OEFNdUZBYkhPZHpFWUdPUUJ4M3Jvcmp4ZmEySHcvMVB4NnVJN1dXYjdKcE5xakx1bUtIR2ZVL04yOUFhK2dQK0NjSDdMbHhMNGIxUDlwMzRxMncyV3NYMmkwZ21VRGR0K1pBTndBQXpuQUhKejB3SzhMSDQyR0hwdWIzNkhxWWJDeW0xZlkyUGg5OEJwLzJhL2hrZkY3WDhhK0laMGpkdzRVQmQvYkhxTUdxL2lieFA0aStJdXBKWitJOVNMckdyYmVxb3BVY04rZVNPeHE5OGVQaWpyL2l5NVdPZTBLVytWeFpQbjVBd09PM1BVblBZMXgvZzR6M1dqR1dFUzcyVmxuTWc1WDVPM3FEMS9YMHI1aWpSbFd2V3EvRXp0cTFPVDkzRFk5TDhIZUk5TytGRjdCcXV1TEk5b2xoaUpMZE1zR0EzQUJSMEdTQ0R6MS9MWWw4WDZUKzBOcWNlcG5TYm5UdE8wZ21hR0tWaHVuY3B1SkxyakE0eUNjakJJOXE0M3dsNE0xcnhEQkZxTXBLMittN251N21kOGJJVUJNakZqeHNHYy9oWGtmeHorT2NIajE1UEFQd2RsbnNmRDBlNUwvVTRvekhMcW0wa1pYQUJTUEhicWVlMWI0YkRlMm43bjNrVkplemdyblUvRWo5cmI0ZmZCaFovREhnQ0JkZTFxT2VSSE1Ea3dxU2VGWnh5Zm92dlhpTnZvdnhYL2FCdVRQNHYxRFVIdHpMdVRTTEFNSTBWamtnam92WHZYUS9DZjRMYVJyR3MvWlNZNHJhSjgzV29OZ3JDb0l5TWtmZXdSeUsraDlEOGQvQ253aG8xeDRVOElXcXBaYWV1YjNVbWlDb1dRZ003c2Z2OEg5ZWxkczNSd2F0QlhrWXB6cWI2STgwK0MzN0Vta1cycFIzOTdjZjJlalNwRE0xdW9lYkRqbjVtK1Vkd0s5b3V2MllQaEI0QmxrMCs4MDI1dnlmbVNlNXZpUXpaQUxZWEM0QkxlL3NhK2FmakwrM1I0dkVyK0YvZ3Rwa1VWdmFmdXhxbDFIdmFZb3hLN1YvdTRyNTUrSjM3VXY3Vm11c2RVMTM0algva29SdjhtVlV4eURqSFhxZTlad3crWjR0M2NySXRWY05UZTF6OUpyMzRJL3MvK1BibDVOUjhQaTBuaWhWWkhzcjJTTmlTU3lnZHVSM1BYUHZYbmVvK0JQZ0I0TTFXOThLNkw0NzF5RUlyaWVTTnhOR0R0eGpPT2NaUDRjVjU1K3g3OFYwOFIvQ2V3ZSsxV2E3MUtWV04zY081UDd6SkFSbXowNUJBcjBIeHA0eDhCL0NUd1V1bzN2aDU5UjFQVXJoekZZMjY3bWs2N21abUhDZzhaNkhOWTAvck5HbzRYYmFLcXVsVVYwaVgvaFVuaXZVZkNVdGw0RHU5TzhaNlMwV0pyZTNqQzNjQUFZbHZMUFVnRURJNTdWNFo4Yy8yZnRIOFNlSGI1UENOdkxwMXl5N0xpd3VSd3ZPR0dHR1VZbFFSL3ZIbXJ2dysvd0NDZ3ZnUHdENDhiKzB2Q3Qzb013bEttZEgrVVpPTnpZNkh2MHhYMlY0TStLUDdPMzdYdmh1SFN2RmQzWjJtc3pRQWFiNG1zc0xMRzNPd3VjQU9wUExBOGpQNGowSTVoWG9OS3JIVHVjVXNMR1R2Qm41NmZzS2ZHSHhIK3pIOFpZZkIzakc0a2kwelZwQkZJa3hPeFpEOG5SVHdDT0RYMHIrMVRiZUt2RC9pYlMvRUtTeUtMRlJlK0ZiK01FSDdPSDNtTGVUa3RHNEJDOXVjVnh2N2JIN0krdGVITHErc0w3VFZ0TlcwNllYRnZjMndQbFRJU2ZMbWpiSTNvL3FPaC9HdXkrQUhqaVg5cFg5ajd4QjhKUEVZRXZpdnd2cHNtcCtHcmh3UFBNc0EvZlFaeDBkRk9Sbm5JTkZlRVovdllkZHpTazNzK2g5UCtDNGZDWHhjdHBQMmxyS0dGYnJWdE9odXJ1RkNvMjN6eDdKMjVKKzh5YzkvbXowcjZOK0oyaGZEMzRUK0c5Ti9hOHVOTWt1dGMwVHdzbHBLc09UdVl3ZVZiREM1eGhwU2M4REMxOERmOEU1L0hPcWEzNEhYd2JkVFNTV28xSkpVdGl1UGxQOEFDTUVaNjR4WDJiL3dVTytMRm44TVAyS1lmRDBkdkpiM25pQ1MydEVpZG1PZGhNcmpsZVNOb0h0d08xZlB4VTNqVkI3SFpVZkxTdWZISHd0K0ZPcGZ0UGZIbTU4UHl6cTJsMkVqWGZpTFVHWWdQSVdmekFXT2RvNjU1NktmWGptZjJ2UGlyNFMrSjNqbVB3MTRKdUk3ZndWNFVpZlQvRHpiQ2tkeEtQbG12Q0JnWkp3cWp1QU9PYTJ2RVdzZUtQMlh2MllMTDRiQzBrZzhXZkVsWDFMeEk5di9BSysxMDFqeENNZk1ydm5CL3dCa3Q2bXZKUGd0OE1mRS93QzBINHhQaGJRSS9zdGpZN1RxV3FTeGw0N0ZBTnBqVmNZZGlHNHdQNVY3OU9NSEo0aXMvZGpzZVkxTjJoSGRuSGFIYzYvTnFrbmdEd1BvVXNrMGwweXl5K1NkemduYms0NFZlZXBQQkhTdTh2ZjJmL0QrZ1dWdi93QUxGK0l3czJZcUhzZE9pM012WEs1NmRxK2tybjRkZkF2OWpmd1hkNmg4UXRYdHRNdDlqa3ZjWU41ZUhhdTdQeTVLazhqSEk3ODE4bitNL3dEZ3BuOENyYnhoTkQ0ZC9aK04vcDBUdEdMdlVaUnVkYy9LUUNEZ2RPT2xROHd4V00vZ1I5MDNqaHFGRCtJOVQzNzRGL3M2L3NuK01McUx3OURxczkvZU5HMlk3cStaV2RnTVpBQUFQWG5IWGI3VjYvbzM3S0g3SnVnbTYwcVB3c3R4ZjZoZWVURXFYenFJbzBIN3h3VGdBRTlRZWVPT2xlTC9BTE8zakw0RGZIM1NZUGlwNEU4TmpROVF0NTFlN3RsdUNxa3FNbmNCd0YrOTB3ZWNIam11ei80SzJmSGp3OTRXK0VmdzF1L2dWcTF2by9qMkl5eWFrbHFxL3dESG1FenVsSFFGcGR4R0FjNTY4VjV6K3VWYTNJcHRNN2VXaEdITmJRdmZGSDlqbjluVzB1b3c5eGUyRDNTQllVU1pKeHVmK0xhd09SakhIWDJydzM0cC93REJLVy84VGFEUDRoOEUzRmhyc1RGcFlZN01yRmN4UjR3dVY2SG5BeUQ5UFN2ay93QVRmdDEvdFRhak9ManhQcmk2aTFvZUdpa0FaY0hMRWJlNVBldlpQMmVQK0NybCs5dGJlRmZGbDNOcDF5c2tTTGNERzdoc25CWTRHU1J4MEpyMEZSelhDUjVwUG1SeE9XSHFTc2xZOHgxWHdmOEF0UGZzaitJSlk5Qm12YnV5dHBNWGVtVEt6Tkh5UVFWSXlPaDVBcjZUL1pRLzRLR2VHZkVSaDBMWHI4YWZmT2RzOWxlRUpsdUZPMThlbmF2b3ZUdkgvd0FIUDJtdE90dEgrTk9tMk04OTRRZE0xaTJuV0c4ako0VTc4QVBuSllxU2ZUSFExOHFmdDMvOEUxcnp3SWYrRTM4RHNaTGFWOTJuNjFEQjVZa0l5VmpuWGpaSjNCSFgyckdjY0ptS3RPUExJdUxxVUgzUjllK1BmMmdJTkorSFYzcjJrbFZ6QXFvSWhqRHVRTTlSazQ5SzlOK0RIeGN0YmpTeHBMb3p4dmJBeUt4SVhCalVsQ1RuY0R5T092TmZsZCt5YisxM0w4T3RUWDRVL0hxM2E3dGxuV095dUx6RGVVd09Oamducm5wNlYraFB3MThaMldvNlpEcVdscEdFWkVrQmpVREhvYzlNWTV4WGg0dkJ2QnB4YStaMVJtcXVxUHR6OW1IeGJvSGhQeEhhV2VzYWxOTGNOY2VjKys1YlpGRndxSUZ5TWpnSG5vUldsL3dVdS80SnFlQS8ydjhBNFlYZnhLK0hHaDJ0djR3dDdRenh5MjhXSTlUakM1WkpBQmdzdzRCOWhYelI4Sy9pRnFjbmlLN2UrUm81bEE4dGk1NVRqQTNIMHlPbmNWOXhmc2kvSDJhOHVaL0JmakRVSW10aGdXRXJ0a3huSUcwazhuUEdPMkJYUGxtSm5oY1NrM1pNeXhWT1RoekxvZnpZZVA4QTRQYTU4R1BpRExwT3FXMHVuV2EzNXQ3cU81WXFiQ2ZPR1J4MTJuQkEvS3ZXL0JuaWJ3bjRsK0hmaW53ZEhwMGt6NnRwSzJkbGRsQUVoS2RHNEdkcFlyakhxUVJYNlRmOEhBMy9BQVR4MC94QjRabC9hUitIbWdxTlAxWkJhZU1ZN2VNWWpsYm1HN0M1QUdUZ0UrdVBXdnlHK0Qzakh4TjRBMTQrQ2RjZGcxaktzVXBCR1NBdzJzcEpQQkdPZStLL1RNTFdWU0treng2c1ZPR2hvZUY3VHc5NHorSE4xOE9kZWtNbHpZYW80dGhLQ0dXSnR3NzlBSFVqRmZOdnhtK0NOLzRSMUdUVU5LUm50OTVJWlI5U1AweFgwMThSZkRZOExlTHJ6Vi9Da1pOdHFVRWQxR1lzZ0lHYmN3Ykk2aHM4ZS92WEdlSnZFbWdhbjRZZTMxU1JHbUN0dVZoem5HSzdKcTZ1akNsTGwwWjg2ZUhmSFBpRHd4cmNFbHhjeUtpNENxVzR4L250WG9NdmpIU2ZGY1htWFNnU0hHWlY0eitYOHFyZU4vQXVuYTFwOXBxRVZxWVlsajJ1UU9XNjhuMnJrNHZEZHpwMXZOY1dWeGxVa0lDSG9WNTlmcDFxYm82NHRuZTJWbSttSW1wV0YzdXQxY2JwVk9kaHpuTmRKNGwwM1I5ZDhQV09veCtJSnBiMUhsYVdDUGhZVVVBSmc5ODlhODI4SGVNMzBpOGEzMWxXV0tYS3lReWtsV0I3NTlhc2F0cW1vYURkQzQwK1JwTEtZL0tTY2hSNmM5OFVsWkZPVHNkMzRmWFVkRDBjMzA5c0d0bFlEelN2VHB5TS9TdDBRTi9aYTZscERFeHlOdWw4dlBzVC93RHFybnYrRXdqMVh3YmJlSG83bFlsbmJkTHdNblAwNXhtdWg4UTZGNHc4TS9DZ2F2b2tJYTNqWU82T1Bta0FHVHpTMVpMcWFrTXQ0TGVTSTNrbnpuYXloVG5iejFycC9EdG5aNjk0ZWEvc1p0bDNIdmFVRFB6Z0VFVjVxdnhLOE0rTWJSTG1GRGFUaFFrdHMzOE9Pdk9PZWE2THdENGxuL3RBMnVudXdpTUpEanMyUmdmMG92WXE3ZW9lTmtXQzBqallFTkxqY1FPZTlkZm8rbndONE9GcnBWMlpNUS9MNms0Rk44YStCYnJ6ZlB1TEk3VmlWdG9IQzVCNC9IK2xZVmhxYy9oaDBaN2tKRTVBK2JvMytjVkV0emVOVkUyZ1hOekhaVE02Y3hFOWVvd0swL0Qxdm9tcytFTlZ1VEt3MUtLOVI3WVovZ3hnakE3VW1rQ0dlNnV2SVFCWkZKempweFVIZ2kwdExYWDdwbm0vZEVNQ1dKSUJ6VlJka05ybUxZMXUxOFoyYVdONU9ZNzYwQkVMTi9HQnhqM3J2dkVzY2tQaGV3MUZWLzFsb3FsdWVvL3lhOHExM1E3ZTIxUnRVMHVianpDZmtQNDE2WjRnOFRXTjk4RWRPUzJkV3U3V1hiSmc4bGFGSzRwcXlQTFBpUjRrZzhPaTAxQ3h0V2Rwbjh1VlFPMk92NjExSGhEeHZiSjRNaHNyWmdtMDd6N2pyV3hheWVDWWZpVDhONXJ2dytsM2JUNnhHK3BRVHhqYTBKQVJsT1FRUnl4SHAwcWwrMEY4SDdYNGUvR1hWOUk4RjNBVFJacmd6V0FKejVjYkhPMzF3TWtVTmRTRldWK1ZvMFBnVE5iL0FCWCtNc0hnM1Q3cUkzTTRLSWp1QUNjOGpuMnJwUEhPbVRlQ2ZpVHFmZ3FSTnMxdTVqdUZYa0t3UDZjRVY0RDRiOERyNEo4WGY4SlpEZjNFYzYzV1Vtam5Lc3B6bktrVjdFTlV1RHJiWGwvRTEzTkxwN3l5WERNV2ZJL2lZbjFyTnV5Tkl4azU2blAydmlHT1Q0aFgxbGV3cStSdFF2amcrdFlYeEw4SFNRSTJ0MjdzZWR5aFR3Ty9GSmJXOTFxRTE1NGhSOXNxM09WVUhHUm5wK3RkaHFxM09zZURXRXNYekNMTFpIWEFGWndiYU9pcmE5a2NacDkvTlplR0lzci9BQmprMXU2YkJCcU9waTVFZU5rWU8zMXJBdlFzWGhvWExFQUIrRnp4V3o0UWQ1NUkyU2JhU2dMKzFiVXprcUpvb2VQck43WFVyZlVYakxyRzQzRURnQWY1RldkY2hzcFBHUGgzeFg0ZGo4OTdVYjVWamJvQnlNOWdNNXo5YTM5WjA2Q2E3Z3NMK0xNVnhHVTZkNjRJNmRxZWtDNHNvTHNxWVpXQ2RjN2V3OXUzNVZyY3dVT2Mra1BFZmlPNitJZmhDd3ZKQXl2YjJpUnBDMkNZOGRqN1lGZWFYZXEydW1YMGRwcU1lSlkyT01yOS9HUjcrMzUxbS9EYnhmcTJuWGlXZmlOSnBZYmo1VXkrZHA0NkRIUEhhcW54RXN4ZWE0YnV4V1JkaEIvZU1UZzhaSUhjY1ZyQ1Z6R3BUNUR0UEJ2eFQ4RitPL0IvaFB3MWQrRTdhRy8wWFRIdGIrVjFVTk00bkxxV0dPTWcvclhHK1BQRCtpNmhyOTBMU3lqU0o5ekJWWEF3Y2NkUFd0Ync3b00yb3ozWGlLUzB0N0s0S1J4dERhWTI1VURrajM2OUs0L1ZmR0M2YjRqTmpxb3daQ2ZLWW5PZWUvNjFUdFl6amU1NU40VnZwZjdWdW9vcENNM2E1L0t0UDRRWDE5RjhYSHNkT3NFTXR6ZnhsTGdqREl3WThnL1FrMVIrSDFycHQxckY4NlRCdVZJREVkYTBQQUdxdG8veHQwaU8zSlNTVzhjSzRQZlljZWxjT0V1cUtPL0dxOVdSMW5qOXd2eFF1MzBoZk5DeXN6c2NOOTNybkhYNWgvT3BmMm9iV2U0MGp3MXFXbzJxeHlTNlNqcXNRRzNhVy84QXJmenFIVDlMbUhpMkdDNnVvL3RON284MHF4RmdTemxpUndPcHgvT3Ivd0MwMXJRdnZEL2gzUjdpSm83aXowWkluamNCQU1NVHgrZjg2MGNmZU9PR3NUd213bWgxenhEZm5TOXlyQlo4YlNSMDQ5ZWxVMEVqM1RSekxrc1BsWTl4UjRXanZOTThSU3lXYkFwS3JJeEk0S2srOVg1OVBRM1FtQnhzWTg1NlZFMmtkTkduZlVrMG04bnNkRXVkS0RIeVdrTW5sOWcyTVp4VVhoUzdpZTdNaUhoVytZK2xOdEhZUlRRdU10enViMXBuZzYyRFJ5Yk83a1pyQ1Q5MDdJUi9lS3gwMm5hYjViVFNYRFpkM0xjK2xVYnpRcmJXTlhTeXpoUWZtQ2ozOUsyNHR3SVVMdXl1R1BQRlVOVHVZdEp1bzlTQndZM0c3UGNWeVVsZWVoMjF0SWFtTkJiSm8ycDNPbWdaMlQ0Qjl1dytsZFJaRGRhTGNJb0l4ZzRIUDUxbCtJZjdIMWJ4bkpOWTRFYjJVVXJCZjcyT2Y1VWs5eUVoOHVDOWFPSkpPTWQ2cXRHN3NaVVo4cXVYZkVicmI2TkxkQlZWbGo1QTR6WHVuL0JQT1dIeFBwT3YrR2RRbUVhVDZOZFRRQnhuYk5GRVhqWVpPTWdqajNyNXI4WDYxZDNXa1BhUWpkSzJCd09TUHhyMTMvZ241OFdORDhIK0tocHVvM0lobmxqa2lsOHhEd3JMdEp5T24zcXBPVUtEc1pWYlRxa2ZoejRQYVg0UitKME9sVHVMcVFhTStxemxndUk1TGdmTHQybmxkZ0hYOUs4NitNRVN0cmMxdUR3ckhhd05mUVB4QTFId2ROKzFQNCt0L0NHckI5TTA3VGJXejA5eVFESmlKTndHVlhQekZ1dGZPWGpWWS84QWhLcElybWI1R2tQekhweWFxaHpUYWJJbmFNSFk1NnkwMWxzSkhsUHpGOElEVldhM3ZJNWNwR1J6NlYwbDVEcGR2TWtWcmVMSndPQWM4MW4zaXROckNiaWRvWEtqSFd2UlNpamliYk56NFQ2MUQ0TitJZW1lTTU3VmJoZFBsV1NXM0lIemdjRWZyWFArSTljaThSK0xkUjFpMHR2SlM4MUNXV09IcnRWbXlCK0ZhV25SSkJMY3pEZ2VXVFNhSDRmaFpUcUVrQjNwTmxGSTY5Nmt6Y2luWjJVMzJ5T1VIYmh4a250ejFycGJXL2x1TmFkYmUxdDdrU1c3SWQvOFB1UHBWVzcweWR4dm1BVGNlNHg3MUtuaFcrMGVSTG1VYk55NUh6VXJYSmM3SXBYZWgyNlFpWnJUZElPRGc4NUZPbXVMdXkwK080c0l3TUVJNnNBY2RPYTJkSWhUVUZrak02Q1JEeUhJR2UzZW90WG50ZE90NUxLTlZiTFp3cHlCeUsxakhRNW5Xa21adDlkWHYvQ0l3d3RFRldTNlpzbi9BUFhXUUxhMXZFUWdHTXFSdU9PdGR4NDE4WWVBZFE4SDZTOW5ESTk2eU1semF4cUJzWUxqY2VNY211WTBsRGMybVJwcVJmTm5jL09lS2JaY0tqWkJkNkRIcHE0MURna0JrSjdjZTFVTlFsVkxjUEEveStuVE5ibmlxRHhHOHNNV3BJOGhranpHb2orVWowRk1zL0JWMjF1MXhmZnUxd1NGeHpVOHl1Yjg2U01XdzE4UXFzVDZmRk9vT2YzNE8wVnBhYnFvdWRjUk5QdDBJWlFybUtQQ2duMEg5YTBMYjRmV3phYkhxT3pmdmtLbEFSdUg2MTEvZ3p3RHAwT21UTU5NS1hDbFhTVXFRTnVSa1ovRHBXcTdtVTVwa09sZUY1RldBSklGZWFVYmcvcjEvSHZYcXh1TlkrSGZnSzQwaExLMGkxTFUxK3kyMGdHWDNPdnpOMTZBZW5RNXJBOE4rSHJueERyTWRwcDFxWkhRaG1LamdBTUQxeHh4L091RStPSHg5dnRkK0pFNXNIZUszMFN3YXowOHJraDU4YlMvWDF6K1ZjdFdxM0xsaWEwcVNhdXp0LzJWL2hKNGgrT3Z4WXNQaGtseGNhaG92aCs1Yk8wNVI1Tncza0VlaFBYMCt0ZmZIeGExN1J2QVBnT0w0YitIdGJlT0swY1BlMmNER05NeGo3cHpuZDBHQjJ6WEovOEFCS3Y0U2FUOEcvZ1BjL0ZIVllFTi9jV1FGczdqNW5sZFF4STc1eVIrUXBQaWZKZDYvcnQzcUsya2NwdUozOHhKRjNCd3h5V1BQY0RIMHI4L3htSmVNekZ3K3pFK25wMHZZNFpQcXppVXZ6NDB2VHJwbVdkcG5DTEtxbkE0L24xK3RkajRlK0hvMVM1dDdMUkxmZGROTXF0RkdtR2xKeXZYSEF4M3Jtb3ZocDRyVVdrdmhpVVdFT1F6MnR1bkRNVndHUDFJemp0WGRlUFBFZDkrekg4QzVQRVJjM1BqRFhyWnJQUUNGK2UwVXJpUzRIR1J0R2R2SEpyZVNsT2FwMDN1YzhYQ0VYT1I1ZCsyRjhiYkxTWVQrelo4TmJ4UmE2ZVZQakRWYlk4WGR3by80OUFSMWpUK0lqN3g0N1Y0ejRWOEphcDR0djQ0TkduYXl0Yk96ODdYNzJEcWxzam5wMUFaOEFLT1A1MXpXcnpXR2phTTkvZlgwa2tqbHByaDVsK2NrNUpPY1pMRTlmYzE5Si9zL2ZESFdaUDJlTkZTMzB3bSs4YWEzQmRhdktGWUJMUU5pS00rZ3d1VDlUNlY3V0k1TXR3cWhING1jRkdVc2JXY25zakgrSVZ2SjhPazB6d040YzAwMjk5ZTZkQVV0SVNkaW1ZYkFTUmtseXVEazlNTlc5KzFqOE1MZndGb25oYjRhV2Nhd05Kb2ozK3F0RmhEY3Z1SXcvUFBRakI5S3VmdG1lS2ROK0EzN1JGLzR5MUh3MCtxUzZMcWR2RmEyUmx5bUk0eGpKT2ZsNzlPSzg5K09uN1p2aDM5cTNWSS9FT2krSExyUnJqUmZDazBkL0ZlU293Y2c3dk1qYkl6eWUvNFZoUXd0U2JqTHVPclZTdWo0bytQbnhGbDBUeExONGE4TDNSdDN0NU5rOXdoQXljNHdDTzJQNVY0M3EydTZtYm1TM2wxS1dRQi93RG5zU0QvQUkwZUt0YnZkZjFtNjFHNnVHa2FXNGQ5N0hKT1RXVFgyRkNoQ2xCSThTcFZsS1o2MzhCZjJnL0YzdzB2MWZSN29OQVhVM05wTmxrYzVIelk3SGpyNjE5S2VNZjJwSWJqNGQydml2WExWSUxsN1F4Mjl0Skp1QVRQemNubkRaN1Y4TFdGNVBZWGNkNWJrYm8yRERJeURqMXJhOFgvQUJIOFIrTWJlSzAxRXh4UVFqNUlZRTJyOWE1YW1YVXBWdWRHeXhjL1o4clBRdkVIeHM4S2VON3A1UEZHbElTVHhMSGtGVHdPTzU0cmIrQS94MjFyNFIrSjB1L0RtdTNENkhKS04wTFNsVEVTQU40OXhrMTRGVnpTTlp1TktsK1VsbzIvMWtmcUsxcllHbFZwdUpOTEZUaEs1KzYvN05QeEc4RmZ0djhBd1J0dmdyNGoxVzMvQU9FanRyTm44QzY1Y09BWkgyNWF4a2JIK3JrT1FNOUd3Ulh5djRRbDhTZnN3ZnRkNmRiYXJhU1dWdGY2cjltMUczblVJSVhKTWNxa0gxQlBYcml2bnIvZ250KzBUckhnajRoMlBoZ2F2TEJCZFRySnBsd0pDREJNcHlBRDlSWDNoL3dVOStINStKWGhid3grMDM0Y3N3aDhSNlVaOVVNRVFIbGFwYW5aY0Fuc1dWbGx6MzVyNWFGS2VIeEVzUFBib2V5NmtKMDFVUlQvQUdjZE0wNzROL3RJNjE4UDdiNUlyYldYa3NwUExZRHluY09oendSOHB4bXZxZjhBYWRTMS9hVCtQM3dPK0N1b3pMSnB0cGIzV3VhMmhQM2JhM0JrYmRuSTZKak9lZDFmSFhnZnhQcG1zZUxmQ1BqTFY3b0pMcVdueFEzYzV5QzVCeHVmUERjQTU5aFhyZnhqK0xHcS9CM3gzNHArSVdnQmJ1NWorRmk2THAxeEcvTnM5M2NSckkrZU00Ulg1QTZNZlN2UHFZYWNjWTNFdDFGS21lVC9BTFRmaUh4SCswQiswRzlsNFExS1E2ajRqMUl3V01hZjh1ZGltVURCUjBBWEdQUTVyNkE4YjYvOExQOEFnbmIrem5EckZwYlJUYTdQR1UwbXptSzc3cTVLNWVaczg3ZHk4LzhBMTY0Zi9nbUg4SjIrSjNqRy93RGpENG1VSzBnOHEwbWtYQWdzNGorOGZMSGpMWit0ZkovL0FBVWMvYWlqK01QeHUxN3h0TmVFYUJvSmV4MEMzSE1ma0kyMVdVRGpMc054OXNVMWg2MlB4RWNQZjNJNytvNVZJWVdtNTlXZUkvdEpmdERlTlBpVjR6dlBHbnhlOGR5M0Y3TThqUldrakZoRUNSOGlvZUZUNmMrdGVLZjhMZ2llZVZMalNvNVlwTWdDUkJsUWZjVnkvakx4SHFIaTd4RmMrSWRRSjg2NWszRmNrN1IySFBwV1VVWlNRd3dSMnI3akQ0R2pScHFLUjROWEV6bks1OUgvQUxKWDdYR3ZmQmJXMjA1YmQ3bXl1Wmc2d0t4d3JaQU9EN2ppdW0vYW4vYXB1dkVrZDVyejNBZlZOVkJWR0c0Q0dQc3FnbmdEMDk2K1hmRDNpSFU5RW16WVFJN04wM3BtazF5NjFyVjV6ZjZsSXp1M1hzQjlCV1A5bTB2ckh0YkdyeGxSMHVVamg4UTZ0YjNSdTdlL2xXUXRrc0hJOXpYVTZMNHJ0dkVLQzExYUVOZW91WWJsT0NUeGpPT3RjT0NRY2cxTFozYzluY3Bjd3ZobGJJelhvVHB4bEd4eXdxU2pLNStuSC9CTkMzaS9hQStFT3AvQ254VnFra09vUVM1MEMvVm1FbGxjS2c4dGhnOHFjWWIyRmZZZjdJZnh1c3ZIbWo2dit5eiswdllMOXFzWlcwMjdTU0xuQUlSSkViQklkV3c2c2NZR1J6eFg1cS9zSi9IMjQvWjF1SWZGRng0VXU3Mnp1cEZsbit6RTR3eFVaeGdqT0MyRG5yaXZyYndCOGE5RStNZjdjR2svRW40VjI4OEZ2NG1zb0k3MkM2VllwUHRNUkc3Y280ejhvUHVldGZEWTZqVW8xWnRyVGRNOTJuVVZTS1BIL3dEZ29IK3lqZmVGUEZlcjJrZGs2YXRvODVqdkhTTmxGOUFUbUc1UWtjbGxJempqT2F5ZitDZnY3WkdxZUZ2RlZwOEZmaVJka3d5eWhkS3U1MlBCenpDL0hKMmppdjBiL3dDQ21Qd25zZEkrRm53NytOVnhGSlBkWGswK2czN3FqaHA0akUwMXZJZU1CaGhsempIWVYrUlA3VW53dnUvQ1hpMCtNL0NpbTJYN1I1cVNXNUFNVWluNVd6Mk83UEh2WGJTcDBzMHdIdmJtWHRYUXEyUDJWOEsrSWg0b2EwMWJRYnlPM2lpR0pONHl6NXdOdnNCemowcjBmNFEvRU81MExWaEVzaUNhU1NSNUdFdUF1RHR5T2M4RWdqNm12Z2IvQUlKei90VEw4VVBocmIybXAzVEM4dHlZcnlMa3Q1d0FCLzc2UFBGZldXamFRMXRxRCtOclNTZEx5NHQvS1NKOHFqQWtIT0NlVHlmNTE4VGlNUDdDcEtuTG9lbnpLY1UwZnB6NEV1UENYN1Ezd1J2L0FJWWVOd2w5QmUyRWxsZlF5RDVtamI1VmNaenlEeUQ2ak5mejJmOEFCU3Y5bHJ4Tit5OThkTmIwS2ZSemVYdmh1NUx5MjBiRUhVZE5KRENWQnlXZFFRNHovQ1Q2Vit3UDdKL3g2MUR3MzRudG9OYm5qdDdlN3VCRks3ekQ1ODhER1R5ZUc1NmRLNGYvQUlMMmZzdTJuamJ3SjRZL2FrOE95RkpkTGxYU2RkbGgyZ1NRU1phR1ZzNHpoc3BuMGZIWVY5SncvajNPUHNwOU5Qa2VYaUthcHowMmY1bjVQZkJieGw0VC9hRzBtODhIYWRMQmFYYWVHaFBwZm1MR1htbVJ5MDF2Z25LS3lOdUF6L0NQcVBuNzR2ZkRMVy9EdDdPWXJkeVVQSUk1SXg5ZUtMdlVMajlsSDlvMjA4U1dVMDBPaTMxNHN5U1pKK3p0bjUwSkI1QVhjTWVocjZUK0tlZ2FINC8wV0x4MTRlU0tTMnU0REpJc0s3Z2prYmdkMk9RUmcvalgyMUJKeDVXZWJWYnB6NWtmSDE3NG5nbjhOSnBsemhHUWJTR0hYNmZuV0NuTVp1SXJsQ2ovQU1HN1BXdlhySDRVK0NkZTFmWEovRjB6UVdkbHBrNzIwVUJBYWE2UENLQ0NDVkgzc2owNlY0cGZmQ3p4WEZaWGQ2a3JMSlo3V1ZNL2Z6K1B0K05SS0RUT21GZUVvbCtQd3ZEcUZwNXR5d1pGWURPY2JLc0N4RnBaRFRyajk1RGdiYzFoMnMydXdJYlNZUDVaaUFZLzN1TzNha3NMdlVvR2VMeldsalhsRmM1eFFOdE42RGRYMURVdkQ5M0hjeGJtUkdIbGpKK3RlL2FWOFVJZkVmN09zV21DTkdlTXNremxRQW8yWkgxNVA2MTgrWC9pQkwrM2UybWhCT0NHNHJyUGgzNDJ0dEw4RjZqNGJsSXhQRGxBZWlFSHJqT09tS3FKblV1MmpKMG0zaGhtdkY4amwxSURGZjRzODEwL3d1MWk2L3RhTFI1NGYzelhjVzV6MEs1R2NjK2hya0p2RU5zMG5reE5HQ3I0TDdoam5yWFVlRllOU3RKN1BYOU9tUzROdktyTUkrU1A4OFVuSFV0TnFOajdkMUR4VjhGL2lUb2NmZ1cxbS9zblhZZEpBbE45dFdLV1JTYzdEakRaenhuMHI1MS9hRytHL2pyNFIzdWtMNG04T01OTTFPNGtlenZkbjd1VXFUOG9Jemc3ZWNHcUhqZnhkbzE3WlcxM2N5bEhXVmN1bjMxWHJ4eDJ6WFZhMThhOWQ4WmZCQmZnWnIxOUZxdW4yMTZsM3BWOWNKdW10U29BQVYrdUN1UVI2bnJpaHhWak5Ta21jNTRaOFEyOWxmZzNQM0pFQUpJejlLamkwK2EydTlSMVhUcGk2eUt6ZVNXeUdIZnZXZkJZMzAraFhMd3docGJRWkcwZGUzNGZ6cS84UE5VYTdacmJWaHNEamFXSTQvRTBsQk02WTFHa1QybDNwMnRhRnYwNjZLeWJQbnRwT3VlQng2MUg0WDhRVFNYQjBQVW5aRllrSU04ZHF5cEdnMGpYdjdHdDVRV1ppMERMazVYZDYrbFdyK3ljVFBjUk1RVVhJWWVvL3dEMVVuSGxORkxtT20weGRRSGpYVGJ4cGNyWnpBd2c1d3ZJL1N1dytPV3J6WDkzYTNibzVkb1F1NDg0NC84QXIxeS93MzAvV3ZpSkRINGM4RmFaTnFQaVMrbSt6YVpwOEVlNlNhUUFra0R2eDcxMWZpeDdtZndiYVdtczJoanY3WDkxZVJTcGhra1VrTUNPeDdVT0xzUmFMbWNCNGcwK1J0QUxybk93TnUvT3V2OEFBcC90Vzh1YlMxbURPUERSSlVnbkI0ckx1MHRuMGN4RXFjb1EzYmtWcStFQkY0VTB5ZldJQis5dk5JYU5UNmowOTY1KzUzV1Nhc2NIcHM5OWFha3Rwc0tJWi9uM2NaNTUvblhyRnJaUXkyUnRHai8xMXNmNVY1RGMrSklMblVycUZTQkpGSGhkcTlUd2Y1azE2enBtczNIOWlhSko5akR2T3BqWmllQmxUNjFOSnJVVlpXc3p5cnhKWnlRYUJKYk9lSTdnNTlnRDdWZjhEM1VjV3AycUZqaVNFQlFjMVUxcjdhSkxxeXYwQkN6dUR0K3Y4cWg4T3pHMjF4SEtuRUVPRnhXMFhxYzlUNFQxZnhINGFsdnRIaDF1M1pjUU52SUhZZjVOZVg2d2JsdGRudlFwRWY4QUFNZmU3MTZoNFQxQ1hYZEZ1N2JlU1hqT3hEMi96eFhtM2phL1hTcGwwbVdNYnk1QWYzNEhHZnJWbU5ONmxqU0xxK2wwelNKVmhJK2VWK09Ud3hGUitKTlJ2cGJ5TFRaRkFhWXFSdUlKeU8zUFVBSDlLMi9odkRvc3VpYWRFYmxaYnF4am5oMUNFcGp5WkdsSlZjNHg5M0JySitNMmthblBQYVhtZ1JPSmhjS1VrajdkL1N0SXNWV3gwdndCOFgyZmlUeFpxSGg3VXg1VnpHekR5NVJnZFZBQTZuT00xNTc4Y1BEMGlhd3R6YmJpWTVuRE9EMkRISDlLN0t3OFByNGYxaGZFRnREc2xsalh6NUVIM3p3VDBOVnZIeldXdFd6U29WeVR5TWR5T2ExcVhVVG1nbGMrZXZCY2R4cGVzM2F1R1Z3M0taNUhOUzZLYjlQaU5vUGk2WnN4VzJ2eFJTOGpnTTJQWDYxYTFxNGl0ZkgrcFFrN0I1bkJ4NzExbndwMFhSZkV2Z3J4bHAxNWRCSmJTMUY3WnppNWlYYkxFNFpSODNKSjVBeDcxd1lGODFCTm5kbUZvWWlTUjFYaWZ3MkxmNDQ2TEpiTGlTRk03QWY0VnlCeC9PcVg3WXNFZHpaYVJxMEV1ZHlOR3pnYzRDaGdEN2oyNlYwZG5yZHBlZnRGYVZCZVlEVGFNenhaWGhtMjd1bzcxeFg3VGR6WjNOek5hVzR3SXIxMkNrNXdOcEdNVjE2V1BOamZuU1BKL0NveDVOMU1VTzdlQm5rOERGVFN2STBWeE9qZ0x6aGU0cXJaWFdrVzFsQlpOTzZTVzFvZjRUZ3V4SnlLdGFXb2swNldSQmtFRWtrNDQvRDYxeDFmaVBUdzc5MG8ybHl2bE5uMzV4N1ZhOERMQUpHaXVKL0tSbk9YQzUyODljVm53UTdyU2FRWVhCT0FEbk5hSGcrSXZiYkNtMDg4azFqSnJrT2luclVSMk1hNmRZNlNndHRVKzB5bkpkeXVNOXh4OUs0RHhMZmF0cUdwUzJpSVZoUTRCOVJrVjJ1bjZLN1dzY2JIQ2xpY2p2VkxWZEhENnF0dXNZRzhoZHhIY25GYzJIa2xVT3JFeGJwM09VMHUvd0RMMThKY3VRR3R4SGtrOXVsYnYyQXZGNWtrdTJJUzVPZWVQWEhwVjN4ZDhFUEZPbTZNUEhGbHByUzZmYnloSjdpRnd3alk0SVZzZERWZSt1VERvSkVZQk94UVNEeC9uaXQ2cnZMUTVhVDkyeFJsMG1EVGxrdlpkVEZ6S1NmSk1ZT0ZYZ2pOUWVDZGUwL3dwNDlzZGFFVFNvbHdobjJEay9NT1JuNlU2ZStqV3c4eVJOcUJlZjhBR3FQaDIyaDFlYVM1c28yWTI3cTduR0FvN0g4NjJoQzYxTWFzbEZuclB4KzFXNjBmNHoydXI2ZHBTeDJ1djZiYTNLdWpNQzUyaFd5T2dPZWVPbUJYTS9FNncwVFQ5VnQ3ajdZczhpeGd6cG5PUGJqOEtUOW9QeC9OTzNoZUN3YmU5bDRmVUoxNmxqL2gwcnpEKzM5U2wzNmhmU003UG5nc2VLMFZQVldNUGFOb1cybk12aUNXNWdVaFBOTEtub00vL1dyM0x4TiswTjhOZmlEOEpyRDRheGZCK3l0TmVzV1FKcjBPQXpLT29PT3RlRzZlc2NJRjRxSEw1eU00UE5iV21tT080UzVzYlkvYUxqNUV5QndPNXE1VTdzU200cXgxR24yek5CY3cyMEtzeGp5MlIySFUxWmcxSFFORXRrTWdudUhZWThtS0g1ZTNHVFZUdzBkUnRKNVk3aEdERzJjRW42Vm82TDRnOG5Sb2RMdU5MM01aQ2ZOSTQ1L3oxOXFkbXpsbkt4ZHR0S3Z0WjhQQy90WVZqVm5IN3R2dnFQWCtvckpzdEl1N1dlUnJuVTVKNUFDb1FzVGdENjFiOFUrTGJ2dzNvNlFhZUlwWldQQmpZSFlNZW5ZYzFONEhXeDFUd1ZxR3VYOTJCZVcwa2JRd3Nwek1oT0NWejZWY1lzd2xOMnV6T1diVE5Qam12OVQwMldWQnpsR3dRUFNxY1Y1b0d2bzY2ZnA5NUV4WElNMkNEeFdoNG5rMUh4RkxEcFhoL1J5Z1JBSmZMR1RJUjFQNjB6UWZESGlSYjFOTm5VeHk5bzVPQ2M0OXExMFMxWmtveWs3bEswOE5rU0s4c1dTRHhnZGE2MCtENEliT1Bvb1lZUElISUdhM2Jud1NmQzFsQmMrS2RTZ2hkK2thRGV6WXhuZ2RSZzlSWFgzL0FJSzhIYnRMdTlMMWpWSkxKSlVTL3VyblRCRkhIdTI3U0dKNzV3U2VNZEt3bldweFoxUXc5UnE1NTFmV2V1ZjJYYkkxd1RCRHdtUUNWeWZVODUveHFxTEc4a2JkY1pjampvU0RYczNqbndCcHZncHd6YXpZWFZvN2xZeEpkS3BVRThjbmc5RzVIYXVidmJYUS9EdW5QY2FzbWxtV1pWamhXVytMc3NoN2JGSFB5bm9hU3EwOXkvWVZTUDRaZkJIeEI0cjFGSklzUXdGVEt2bUE4ODhER01jNFBQdlhwVjk4TnRJMW0ycy9EbmcvUncyc05JYmU3dG9zTmdMa0Z6MEE2NTYrdGNYZi9GN3dONEwwSzIxdlV2SHVyZWVKZnMwY2RucHp4eDVUYmxWWmdNZ2M4ZFFTSzB0RitNOXo0QTFHODhYZURmRmR0cWMrcVdvam5odlJoZ3hJSVpHSDNldlRyd2E1YTlhcS9nTzdEVWFNWSsvdWFmeEM4R3hmQ1R3aFBwSjhZMnVseDNNZXkvdkl5RE94eUFVVTUrVmNIMTYxOHdlRnZET2tmRmY0emFQNEk4TElibTFGMG02NTIvTkxsaVNTZm9hcmZ0UGZHbnhoNHgxZVdQeFJkb3NzN2JrdExkMlpFQkgzdXVPMWVvLzhFdlBCdHRIOFM1dkhXc3c1dDlMMDVybGk0NkFOeDI2NEZZWWh5dzJCbFVmeE1pTFZURktLMlIraE92YTdwbndxK0hHai9EYlRMb1EvWTdSSG1RRUtIWUJSK2dGY2hwK3FXZXVuN1pES3J5Sklxek42SG5LNCt0ZVllTm9QSHZ4aDhXeStJZEI4U2l5UVRaVlNPQ203aGo3WTRQMU5aMHVxK01QaDNyRnRGcC9pZ1h3a1lMY3hpSVpPY0VqUFQyQnI1dkQ1Vy9ZZTFiMVozVk15aTZ2c2o2MitFV2dXbml6V3JQVExWRi8wZ3JISUFOb1ZSOHpIOEJYenIrMGo4VVpmSDN4VDFueFpwc1VrdGhZRjdMUjRvMEpSYmVFNFZ1RGdCbUJKOXpYMHhaNmhwZndSL1k4OFhmRzJ4bVU2bE5wNmFUb2JLU0Q5c3VpSTl3UFB6SWhZL3dEQWErTHZHdmpUWGZoQm9xV2VtYTVGNUY1QjVkMUhMQ0dZY2N0MHpqQVBQdWEzeVhET1dJZFNYUXl6R3JhbHlycWVPZkduUnRUL0FPRUN1OWZ1SWlzVDN3VjhmS1c1NTYrbjlLKzZmZ0w0dWhnOEE2Tm9WcVZ5bWoyOHR2SnR6ODZnQkJqUFBKL1d2aFg0ejNkeDRwK0gxMWUyOTRSYXgyeGEzdGlBQ1d3dVc2REk1UFB2WHJQN00veHZzL0ZYaGJ3cHJlbTNZbHViRzBHbjZuYWh2bWpsamI1VDJBSkFCQnJyemlsS3BhUzZDeXFhaEJwOVQ2Zy9idCtHZWxmdEphbG8zeG4rSHNscGROcjluRGFhMXBNMTBzYzFqcVVTaFhWa0hSV1hCenp5Y0hGZWJlRWYrQ1QzeG04UytITlFnMGJ3SDRidjdpNzArUXo2VkJlRVhrc1lRTVZpR0Jsc2RCMXlDSzNKYmxaL0hTZkZpMzBONDdoNG8xRVVOd2NOS01mT3lqcm5KK1d2cWI5amI5b1RWWXZpNTRSc3ZFTVVjVGFkcTBLRzRRZ2paSXVEdVk0TEU4ODloMXJ4L3dDMU1SaDdSaTlEcXFZU0VyeVB3MC9hbi9aQ3VmZ3hxbjl1YVZiVHJZdmNlUkphWENuekxXUUFmS3grb0k5c0VkcThZdXZDTTEyVmFLTEJKeGpIVTErcFAvQlovd0FSL0RYWGYyaC9pVm8vdy9sdHB0TWw4VFhIa3kybTExRW55TzVHQU1FU2IvemF2Z25SdkN0cThzZHlyTElCbmNnNjVQcG4wem12dDhGWHExcUNrenhLbEpLZGtlYTZaOEs5WnZ6dWl0enp3QlQ3ajRmVGFidU40dnk1STU3RURwaXZvNzRaL0NIeHo0d3ZrMDN3M28xeFBJLzNJMHR6bmtnZ0hBNmU5ZXFyL3dBRXdmajE0eGVQVFp0RWdzcEx5UU5GOXB2STFaUmpKYmJucGorUnAxTWZSb3UwcG9jY1BMc2ZuOWY2RTF2Q0pOdUNUNkdzeVdDU0ppckllSysydmpQL0FNRWxmMmhQaDVheWFsRnB0eGRXa1VURVhDV3BramJHZVEwZWUzY2p2WHkzOFNQaEw0eitIY3BIaVhSR2lWZ1EwNmpLRTU0R2V4cm93K0xwVi9oZHpucTBwUmV4VytFMnZ0b0dxeDZqSEpzbXNyeUs0Z1lIbklQSUgxRmZzTDRmK0oyaGZFUDloTFc5RzF4NDVSWUMzMXpUdHk4cUdScmE2VUhHQVdSMU9PNUFyOGp2MmQvaGUveE84ZVE2WE5MNWR2R3llYVF3R1N6cXFqbjNOZnJWNFIvWVErSXZoYjRmNmY0STBqeDVwRmxwTEtuMnZlenlTemZLb0liR01Eb2NEZzE0T2MxcUZIR3drM1pvNzhKQ3BPZzRwSHpkb1B4RTBQUy9EdmczVGJ1MmtlYlNydVEzUVJ5cXNubUFnRHR6ajE3a1Y2eCswWiswUDRMOFFlQ3RYaDhKZWEwZW9hYloyWUVvSUNqek56WUE0R0FCM0FBcjJHSDloTFI1TE5MSFZmRjFqSSswS2tuOWtaVm00NEZaa24vQk4vVnByVzcyL0Z6UzVMYVQ1VEZOcExaMkhwMytuNFZ4ck1zRk9WMnpvamhNUWxzZDUreVA0LzhBQlh3Mi93Q0NmM2pyeG1rOFFsL3NhZUdOVmsyc28yYkkxK1ZzN21hUU4wNmc1N1YrV2Z4WThDYXQ4VTViUHd4NFV0UkpPMGMrbzNhdElWRHhwd2lxRGpkd1BUbk5mcWI4SHY4QWdrUDhVdmlOOE5kWHZ2QzN4VjBRV0dqd2lTKzAyYUNhRlpZMUFZbGVTRGdLY1pCQU5mQlA3V25oWFUvZ0o4ZEV0OU9lS0NTenRFQW5zSlMwTE9wemhlTUVFZFZ4aXV6S2ZaS3JKeGU1aGpGTnRKbnlYcTN3WWUzQzdZendRSEpIWHJrY2NBanBWZVA0UVN0S0ovSnpIdTJ5RWc3ZWVtVGowcjI3U3ZEVS9pMUdqVzR2SnJ1NG5QMkt6Z2l5eDNIY1hiUFFaeCtacjFmNGRmc1hmRi94Zm9wdG9OSjFCYlZ5V2RYdGpzeVNDdVNBU2Z3NmMxNjlURjBxVDkrVmpOVUUxb2o1WDhKZkJ2UzduUzdpOTJndkM1RGJ1dU00Qi9PdWI4ZWVFMTBXVnRpNFZ1alk0NHI3dHUvK0NmUHh4OEV3VDZ1bmhDZTd0NUF5NXQwMzhaNEJYQWJPZjVWODMvSEg0UmVMTkJabzliMENlQ1JEZ0NSTUx4bnZqQlBIVHJUcDRtbFZkNFRUTXAwbkZhbytaZFd0NDdlNTh1TURPT2NWMnZ3UStBWGl6NHo2L2FhVm85ck1WdXJnUlFyQkZ2a2xiUE8xZTRBNm50V040MDhJNmxwaXhheE8wWmduY3BHVmtHNEVkaU8xZlUzL0FBVEE4YjZIb254ZFM0dk5xR1BSbVd3R01mdk53M0VjOWNVOHd4VThQaEhVaHVaNGVqR3BXdEk5NitHUC9CT1Q0bmVFL0JscDRaMEdPSDdXaWlhU0tYVUE3bkErYk9Sc3djOGNaK1hIV3ZaZjJJZmdUcTN3MStMbDE0cjhXYWZzdWZEbGhLOXJaYmxZeWFuY2Z1WVljakRBWnk3SHNFSjlxOXQ4QWkrOGZYeHVOQjhZSFNidWExZUtDYUlodjNUSEdRQ1NNOGsvaFhwM3dLK0huZ3o0ZDY0NjZqZVBjNnFaRE5QZjN3OHg1WkdBRy84QTJWNUl3RC9FYS9QSzJjVnE5SnhtOXozWTRhTUpKcEhvL3dDMXhaK0hkYy9ZTzhZNlg0dE1OOWVlRzlVMGhyYlU1b1ZBTjM4cU9FdzJNakxweGtIcWZTdnkyK0ovZ0hUOVg4QTZ2YzZoWVJ5dmRTbTFnaVJ3eFhsaVhQVDI1d2VCWDZBLzhGYlAyay9oNzRhL1pCMHY0UmZENEczMVR4SjRpZzFTK3M3ZEI1aTJ0dURKSk0rUndXYkdCakhIMXI4dU5SL2FnOEhRNmpKNGI4UWF0Q3lTcnVqdm9nWklrOHpka1pCK1hhQjI5Njk3aDZNMWh0ZGp6c2NyVDBQUFAyTC9BQnhxUHdGL2FjaTBEVTJaTFhWcmdJVmJnQ1VIY3B4MEJPU09hL1lQUi9GRnJyM2hHMzFPWnh2Vlk1QW9iR2VnSStuL0FOZXZ4cS9hSFRSUFAwMzRtK0JkUldVK1lseEZjdzV5V1huUFBJT1JqSHNhL1NyOWpqNHBXSGkvNGJhTnErcnp2SkRmV2tFaVJaeTc3Z0NRT25jSGozcmg0aXdpNTFWWFU3TURVNW9jclBwRDRTUWFldmp1S0xVSXhNYlM4M3I1cHp0R1NlQU93eUsrNnZIdncvMDM5cDM5anJ4VjhKTDVsbWsxTFFab3JZNERGTGlOZk1nWVp6Z2gwV3Z6aytHVnQ0bjhFK05kVHZJdE9ra3RkVTFOcm0wa3U3bkpTSnNZWEhiQjUvQ3Z2ajlqWDRtT2wvRG9lczNvOHUrK1dQY3dBTW9HY0Q2L01LOFRMNjZ3K05qcm85Q3NUVGM2VGE2SDg2UDdWWHdrajhaZUdMNjJXQW04dG5kNDFLOHBNb09Sa2R5VmJOY24reFI4VmRYWHd2ZmVDTmNrbHU3ZlRYeFBwM21FTkxhazhsT1B2SVJqcjA0cjY0L2JDK0djdnc4L2F1K0pudzFXeFdLTFR2RytveDI4YnJnR041V2xpd09PTnJqSHNhK1p2aVI4Si9DL3dvOFdXbmpQNE1hTnFCa21ueHJKdXJoSGl1RmNLek1pZndxcmJ3VGtqZ2RLL1M2RlQzRkk4aWFVdmRaYStJZWs2TmQ2enQ4RUpjeFdqaEdLWDUrWlh4OTBmaFdWSDRjdU5NaldYWGJBUlFPY0NlTWhreVIvRlcvckhoeTMxVXJjYWZkQ1FJRGh3MlJJd0dRTWpnRURqcjJxQzkwTHhKcjJtcEJwOEZ3eU15Q1RoaXJPUVJ5Y2RNQVYyZTFweTZuSzZOV0wyTWk1K0hmaFRVN2MyNU1XTVlCUTQzZTljSjR4K0Q5dDRmbkYzWjZrbUgvNVpZNXIyRFQvQUllWFMrSWRQMGVlTXd5WEJLT2puNWdGeVN4SEdlbFV0ZCtGV3AzVDNOeUVhVmtaOW1NbjVleC9sUnpVMlZGVlluZyt0L0RHU0hUV3Z0T2pXU1FqZHRDOG4xNjF6MEVGb2x1Mm02aHB6cTBnd1dqNEs4NHIyWFU3RFU5RmdlemV5Y3pSU1lkTmhKWEhxUHhxM3BXZytBZkYrblhHaVh1bEpGcUt3czlwY2hnZzNLQXgzWjlzOWFPV0wySzlySlBVOFIvNFZkcGNwVTI5MDZsc0RFalpKUDhBV3VrMHo0YitPZkJXa2Y4QUNWYVdKVGJZSkdCa0ZlY25HT25GVzE4UGFuSkk3YWZZVHpGR3k3dzI1WlV4OU8zdlgwRCt6VDhTdkNOd2crRVh4VDB4UnBkeURDdW90SDg4TXAyZ0ZnM2JudDNQMW9VWXN2Mi9rZk1jL2p1NXZGK3phNWFza3BYR1VIQXFmdy80K3NyTzRXMGE3QlFjTGhqem5pdlZmMmxQMlpFOEgrTTcvVFBEc3NWeGJveGVONFpGYjVHd1ZISFA4UVA0MTg0K0x2Q0d0ZUh0Vlg3VmF2RTNWVlBHZXA5S3psRnJVMFZSTTk1cy9HdG5wUGgrNjFtQm81REpIanlIWVl6bkhQNTVyM0w5bW45bTd3djhVZmhqRjhVdkUrcHkyU05xVVZzbGhDRXc2TkU3bHNrZ25KUmVuSURmaFh3WmMrTWRUZ3Rmc3J6dUIwWWM5UFd2dFgvZ25EKzBYcCtvalJQaFo0ejFab05MdHI1cFFIYjVmTmRkb0o3NDVOT2s3eXNPbzJvM1I1YjR6Z1R3VDhYZE5uMWkwZjdIQ1pvZVFUdEJMYmMvUTFwV1Z4SGNUT0xoZUhESHB4N2Z6cjI3OXZMOW5LOThMVFM2enA4QWx0THRQT3RMeFVPSkVPV0RqdjNBL1d2bkh3WDRrV1RRcmpTci9NZDVFbUluY0VGOEVBZmpqSDZWVmVEaXd3MVZOMlBXdjJldmpOcnY3T1h4cDhNL3RCK0N0SXRialVQQ21vcmNKWjNpWml1RTI3WkZZZTZralBiclgwMysyeG9mN01meHo4QzZOKzFWK3pUZjNXbTZyclR2TDR4OElUTG1PMm5jNzNhSW5nQU54anB3VDNyNHkwVzVtd0xPNGg4c3ZIbmtZeU1kUDByMG40UCtOVTA5NWZDVTd0NVUvUldKeGc4ZnkvV3NJMUh5Mk5xdE5LcXBJNWlMUkd1L0JkeHJzVndDcTNiUnNvUFRQQStsTHBFMm9YbmdWSDFFK1cybVR2SEprY1NSSHY2OTZaNDkwclZQQmVxWDJtV1VqaXd1cGhKdDdaejcvV3Jta3pSWC93QU5kU2M0SG1FZ2V4ckNiME82bjcycDVWcHNjWC9DUzMxd0YrODdCUVRqak5lMWVBcng5YjhQUjJ5QStaWmZOMDdBVjQvckZqZTZmckpraGl5a3FLU3hIVGdDdS84QWc1NG9PbFgwa0Z4R1NKWUNBcDZrOXE1NlYxVVp2aUkvdTduUGVMdDluZHpha3JiMWttSWNaNmMwelFycU1xV20rOFU0NDYxUzhkWHQ1RlpUZ25HYmdrb2V3eWZTcjBkdkhENGV0TlRlMklMa0t4ejF6aXV1TzV4VFh1SHJId21zYmVMVTRQT0lDeldwNEo3OG12TXZpcDRZbHV2SDIrS1lpR0s1eVVBN1pQYitkZXBUSmE2Yzl0ZWFBekMxV3pqMkU5UWNjajlUWEJlTUw2Q2J4R3JUY2J3T2NkVG1yWnp4MFpGOExJb05ObXVOTmVRR1crMU9TVnlUZ25QVEo3aWp4MXAzaTNSZGJZVytxTGRhZUdESjh1R0JKLzhBMVZKTmJXOE4zQmVRVEJKbktxRlZ1dlN1cjFYdzQ4R2dOZDZpQ0I1RzlWWWRTQm5uUGZrVnBCazFIY282ZGVMZGVHTTNLWllvTzNKNDRya3RVYUtLTjBtY294UHlnanYvQUpOYk9nVFdwdmJWQnFtN3p6a0lCOTA1NlkvQ3M3NHlXVi80YzFLRFVicUVpT1EvS3BHUFVWczJwSTVyY3JQQzliamcxcjRnYWtMZVR0bkk1eHpUTkI4TlBONFMxYWJUbWhOeEJxdHRHNGtYZXp4cytNTHp4enptc1dTODFMUlBGbW8zMWxidE96NCtSVHpnbjJxR3o4WDZ2YWFUT3lPMFUwK3J3TThRUFFBNTZIM3Jnd0tTdzBmUTdzeGJlSmt6NlErSUhoTFVMWDQ2ZUN6SkU2U3lhWTcvQUM1QklDKzljSDhZOUNrdTlYdkJQZEdQYXpzb2wrWU1BZWVmenJZK0lmeHg4VUQ0bWVCUEZXdTJjVWtWcFp2YnY1Y2VDd2JnazhkUlZING1lTWRJMWU0dTVKcDFWaXI3VWY1U005TzNmZDZWMDIwT0dDMVBORHBXalMrQ1UxV0tBTGRwZGxIbDZGazdkNnAycitSRUFKQ0E0SUM1OXE2ZjRqK0Yvd0RoQ3ZoOXBzUTM3cnlFVHV1M0cwc004ZW9yanJDU0tTeEVseEo4d1E3ZU9sYzFWYW5vNFhZYmFBR0tWUWVoTmFmaEpKR3NtTWJEY0NSOU90VjVZTlBqMFpQc3FsWGRUdWNudi9rVlA0VGEzamhGdTVLdGpJOTY1NXIzVHFocE03RFRkVXNkQzhOL2F0UW1EM0R5ZnVJQnlRTS95cm1kUThaK2RxbjlvMmNKUjRTRHNmb2ZYNjlUVU5ycTJuMmVvelIzTnJOS3luQ0hHUUs1cnhYNGd1cE5YVm9iTXh4c1JuSFVqOFA1VmxoNlVWTzdLcjFLbkpZOUMxcnhkNGhzL0FTNmNkVm1pVFdMM3picXoza0J3T2h3ZjUxaVhlOU5LaXRaWkF2bWxRWEF6Z1kvV3VlVFdFdmJxTzQxRFVKNXRpN1VWa3dGSEhBclR2OEF4Q2ZzdTZHUGVpWUdXUDNUNi8xcmVTWE5vWTB2aGR4bGpwdHhyOS9jNk9KMXpGQ1dqVHUyUFlWMDN3WWkwdndicnR5ZkZGdXEyMTdwczhiZWFvNFlEQy9Ua2ZyWE15NmJyYy9oeUx4cnBDM0NUUTNCVzRualU3VlBVY2pqdDBQYXFUZU90ZjFRcEZxMFNPcU1QblJkckhrZm1lSzNqdG9jdFZYa2RCOGNOQ3V6by9oSFZyRDdsN284cXM1T2VWdUhCSFhyZ2l1Q2swbTV0UUhkdzRPQVN2MHIyanh4Q1BHUDdPT2phN3AwU29OQzFhYXdsaVp3WkFzaWlRRThjQXNUaXZJb3RQdW80SGtubXdpa2NNZXRhcVZrWXAyZGllTzNpdGJSWGxPRkFHUldocDE4cjZoYXpXMFpXT0pUdEdLWFd0TUR6b3lTQVJORU52b1Rpck9sQzNta3RiTm9SR04rMHlFY0x4MXhUYnVObHk0OFI2bE5kZVRGRVB1bFNRdnJUcFpkVEdtdmJ6eFNSK1d1L2tZT08zWCtsV3RPRmhhVE1mdEVjanh5SGE2amdrZE8zNjA3VTllbjFLZVNHL2xCM3hHUEFHTzM0WkdhRVlUaVhQZ1o0S2Z4bDR2ZERJZnNWc29rdjVBdy9kUmtnWndSOHg2NHhYMERxSDdPWGdrMzBGbDRhOGFNN0JjU3JiNmN6TXk1NEdWNFBVSE5mTW5nYjRyM1B3d3NybTFzR01jMnFtT0NaeDBFU3NTUjE5ZTFmcVYreFpwZmhmeHg0U3NMRFF0TnRqcWQ1Ym1SNXBGR1FBZ0xFdDFHUFFmblhrWnptY3N0cHFTVjduUmdzQ3NWTFUrZVBodDhEdEgrSG1yRFU0dEl2TlRrZkoyeldJUUE5ems5T2NtdTU4WitDOUw4YVhkanFjM3d2ZTN1TElNYmVkYmdEYzIzQURZQTNEZDB6MXI2UzFuNFd4ZUc5VW0xVFZQRlVDRVpKVTJ3Q3J4MEJZODR6OWF5Ynk0dGRRdFpkSTBYeENteFJzYVJyVUQ1aHlBRDZaenpYejhlSVoxbGV4NjZ5dU5OV1BrbTcvWmw4ZmVOYjZIVzlUMGlHR1dGbE52KzVQeWpuQTU3ZHhUUEZQN1BIakhYOVBid3ZyZWlYRjNhM0NqZkJCTUZWdVFQWGc1SFQxcjZWOFI2aDQwMWQ3YlI5RFd6aWVTUUM3dXRtTnNmVGdZNzVIMXhVNThGaUY0UE12Y1RJbTRBa2doUURrOWV2cFZmMnhKQ2VEUGczeEQvQU1FN0x5ejFOSlYwSFZ4dU81Ylo5UzNnOXNEdm4vR3IxNyt4RDQ4MUZZemUrRHRRWVFmTXBXYVE3ZW1jWjZkdWxmYXplR3I0ZUpZdGU4d3NZd0RHaktlQm43bzU5RG44NndOUy9iRThPK0h2RitzK0M3dlJtMjZhUkZIY1JTYmcvQURaejA1STcrdGRGUE5jVlcrR043SFBQQzBhZnhNK1lMTDloL3hMcjJqUjZmcVBnM1VaZktrTXNZbHVHTzFpQmxnQ2VLZ2I5aUR4anBNNk5mOEFoZlZ4Q3BCWnhHV0d3ZFR4M1ByWDJhL2l5OTEvUkJkYU5lTGJTU3hJWVpSa2dNUWVjYzQ0cTM0TitJSGlHeTAxTEx4RTZUeXFNZWRHUUM2Z2pHY2UzV3MzblZhTHMwVXNGVGVxWjhDL0ZuOWpyd0g0ajFHQyswaWFTMm1XTFpORTZ1QzNQQUlQUS80MTdGK3k5OEJYK0gvZ3JXUERsdmVySmU2aFpvazhrSzRXTk1EWkhuajVpZjByMnZ4VDRmVFdkWW4xYjdBa2lpZmRJaUt1Vno2SEhjNFA0WXF1TG5UUEN1bkJJWUk0NGlmTmR3bTBCL2ZqSkZaNG5NcW1Kb3FCclN3c0tVdVl4dEM4S1RYZmgxYjN3cHFDMitwd0tZYnEzbGNnTVZQQkhiNlV2Zy85bnE2bHYvN2U4VkVYMXhrdUk0emxRZUNjNTdjYzhjVmcrRy9qZDRaMU8vdm51SjF4OXMyN2wrWEdDZWUyZnc2MTZkOEtmaWQ0YThaelM2Skg0c1ZMaTNqQld6SXkwNElHTWVoNDZmbldOU3BtRk9qYm9aMHNQaFpWK2ErcDEvN2R4dnZESDdKUHdvK0V1bndxdDM0ZzhRejYxY3dNNTVqaFFKSGtrZXI4WjlLK0FQMm8vRmw5NFF1THZWL0h5MjRsdExWUnA4VUJVckxuSkdSNlpPSysrZjhBZ29wSHEwM3h5OERhQmVTQ0czMDc0ZTJmMkdOTm9BYVZuWmlRUFhBeUsvSjcvZ29wY2VKTk8rUFY3cEY5ZWsyMzJPT2UyVFBCUmhua2R1YzhaNHpYdlpIVGNxSzh6aXg4azZwNWJybjdSbnhEMW1GdFB1YjFSWjV3dHNpNEFYaml0cjRWZkYveEQ4Tk5TZzhUZUhaenNuSU56Wmh1RHoxOWo3KzllU0Z6djNnWXlmU3ByUFVybXl1UHRFTGMrbU9LK2lxNFNsVWh5Mk9DbGlaMDVYUHVuUXYrQ2k5a2RMamoxVzNrV1pZd05oRGNIdnlPK09LdVdQOEF3VVg4VVhWNUkvZ0czYTJuSktpL2M3R2pEY2VvQkdNL25YeExiZU8xVDU3alRrZHZVVlh1ZkdtcHl6TWJOamJ4dndZNGlRTWQrbGVPc2d3M1BkbzdubVU3V3VmV2ZqVHhiWStKdmgzSkZlU1hOenE5L3F3bm12R1VoQndUdHpuOTRldlBPZWE5SC9abS9aT2JVTk9zUGlEOFRVZTAwVytuUkxXT01LSlp3M1RBWUFnY0VWd0g3QS9nSHhKKzBmOEEyWDRWOGFYSi93Q0VjOFB5RzZ2RzI0Wm84L2MvMnQyVHoyRmZvTjhUVzhJL0NENGZ0OFhmSHlGOUswb1IyZmgzUUltQ2k3dUJueTQxWG9Samx5UDUxNXVaNDZXSGF3dERjNnNMUlVrNnN4UEVMZkNiOW5md0RGZFdrOXBvbHFkaWllTGFzaE9NOVJsamtEc090ZU8rTnY4QWdwbDhHUEQxOUIvd2hHa2F0ZFR3d3NodWJlTXF6L1VuMngwOWErVnYyamYybVp2Rk91UytLL2lUZnRLdTVoWmFQRTVDeGh2dW9xbkdWSHpmTjFyeUg0Y2ZHWHhCNG04YnJaNkY0WHNmOUpuWDdKYStUdTh0Y2pLaytoSFg2Q2xoOGo5cFM5cFhiYk02dU5Tbnl3UDBVK0NuL0JUL0FPR21yK0lXaTFUVnRVc3JsNXdGaHY1Y0tSbnBuT3prNEJCcjJ2OEFhRStEbjdMWDdXbjdQMTE4U2RPOE9hWERydW52RU5XTmxFc1VkL0JJUVBNWVl4dURBY2pIQXhYdzNjL0JtejhUNkZiM3V0ZUZJbnVmS2pFc3NHeFdWbVBWY2NuakE1NXIwZjRFZUhmRnZ3NDhNNjM0VDA2NnZiN1M3MkFSd1doWmcwREt3SkRaNFplUm5ucWVLMXBZR09IbnpVR0tWZFZJMm1qNTE4Uy9CR3kvWmErTUZ2cG1rWDUvczdVTHVCNFpaQ014cXI1WUVudGdxZU8yRFgzMThQOEE5czc0ZlhmaDlMWFU5ZlF6THZUejVMZ1pBQUcwWnowK1hPZW5OZklIN1N2aFcxMTJOOVN2N2JkS2o3bzFNaHpIMHdBZWdHQWVEeUQxcjFid2ovd1RwK0YydC9zcjNueHhYVmRRaHZkTDBaNzY2aCswdVluMkJjcVNQdWs3eGo2Vno1cmhLV0pxUmRXVm14NFN2T25GOHFQcHFIOXAvd0NHQjhOcGQ2aDQwdEVDVFJOSEc4NHlPT1I5NGZMeHhXcFkvdDMvQUFHdWJ3eDNuaW16ZGtrd3JOT3BMQmM0NzQvTHJYd2Y0RS9aU3ZQaUpHMXg0VytIbHpxRnBia0pOY1BxTHBHSEpIeWxpUUFRQ2Y4QXZnMXQrTS8ySDdMd244TzlXOGVhcDRWaHNUb2wvRmJYMEQ2ZzVZK1lTRmNBOXVCOWQxYzBNa29SMGRRNnZyOVRzZnEvOEMvK0NoWDdOZWcvQjd4Zm9KOGUyZHRkNmw0ZXVJYlpGbFVlWk1VS2hWQWIzK2xmbDErMWRaZUdHK0o4djI0UTNyM1dub1V0bFpTcGR3UUFNWjQrNmV2UE9hN240US84RTh2QW5pcjlpN3huKzBUWWx6cStnSkhKWVF3M0RDTlVXVlE1Y2JnYzdTRHdEaml2bi94TnB0NWI2elkzRjFkT3R6RzdReExQdTNTdW95cmMrK0NEWGJnOFBLamYyY3JuSmk1dWJUYVBwSDRHZkJiNGUvQzN3WW5pL1ZJTGRyaDJSTHk5ZFZ4YmdxSEtydTR5RkFBR1R5VHhXN3J2L0JUYjRIZkRwanB0bHFrVE5GL3FXdDQySVVqZ0RnNHhqbkhUbXZGdEU4Yi9BQkk4YWFWWWVIdkZ4a2JTN1lxazl0R0dUUHlxUG03SGdIR2VlcHJJL2FaK0czZ08zK0hzdmpYd0Y0VXRyKzZnVW00dGJPSlNZMUhRbkJibjVoa2UxWlN5dU9JbmV2TFVTeGJndmRSN240VS80S3NmQ0x4VDRxdExyWExTMHVYMDlpbW5MZFJIY0cya0E1TEFua2txTWtaQTRyM2JTdEcvWmIvYlUwR2JSUEdXbldmMnU5dFFUcWVqUklzdHVyakc0cDkyUkFTeHh3M1BXdndxOFFmRmUwMUs4RVYvb1MyNWpjZk5iamF5NDdkc0d2YWYyVFAydVBGbndoOFUyZXAySGlDYTUwZFpRdDFBMGgzd293QUxkZWNjVkdLeUd0aFllMXc4bXJHdEhIUXF2bG1qMXIvZ3ByL3dTVThiZnMyNjNCcnZoZGwxSFJOYVlUK0hyNjAzRzF2SWlYM0twUE1jaTRYY2pjalBIRmZMUjBQeDcrejU0ZzBxZTMzeGFoYXdlY2ZMYmpCWTdsSkI2Y1YrL1A3Ty9qdndWKzJYOEU1ZjJlUGlQUERKRHJrQXVQRFdxU3VwK3dhaWlueVhERDdvZkcxbEhVTWEvR1QvQUlLbmVEUGlCOEZmaS9MNFExL3c5SnA4MWxlM05yZEdhRUxtVUVNNmRUeGxtSTlpb3IwTXB4czhmVDlqVjNXNWxpcVNvUzU0bmMvQkQvZ3FaSDRPTVVIaVMwdWJTYUtQWTRSUzZONjg5VjcxNnpyMy9CWElTNk8xM284YjNyeTdmTEpWZ1NjRDVUay9kNHgrRmZtRmErTFNKZzJvV29rQk9XWWRhMmRWK0xNemFQSG8rZ2FhdHVGWU0wemNzY2RzZEsxcWNONFNkVG1VVEtPWjFJeHRjK3FmakgrM1Y0azFKTHJ4bDQ1MXByblY5UmpNZHBaQnkza3drRWlQQlB5cG5xUDhhK2U3clhyWHhKWlhIamJ3Y0dqRWJlWnF1bHEzL0hwSWVrcURPREdTY0RyZzhIZzE1cHEzOXMzY2k2cHF6eVNOY0p1V1NRNUxBY1ZGcDJxYWhwRTV1dE52SklKR2phTm1qYkdVWVlaVDdFR3ZhdytDcFllbHlRT0dlSW5PZk16NlI4R2VPOUU4Y2ZCdTQ4SDNseWphbFkzQSt3MnNYL0xSU2VTZU93SjVyN20vNEpkK05udVBBbWthVmYyVFowU1dXeWNxdzdQdVUva2V2dFg1Wi9CUFViaTA4V0ZZMmI1NFNPRFg2VGY4RXN0WWxXNTF2UjQzQWNhakZJUCtCcDJIOUsrZnorbnk0ZG85UEFWT2VaK2gwZXBzOXhhMzloSkcyVks1SnoxQllNZVBmcjdWMzN3ditLZXAyOGt1a2FicTkxYkR6a0NhcmJSL05ieUZpRmtYbkRFRWRnUlhqdmlYVnRLaTBrZUhJYmVZMzF4R1JHOFFQeURjTU5rSHBodTNRSDJyby9BOTFxT2pyWnBkMkpXTHpsdG9vK2ZrWUJzUHU3OC8xcjg5Y0pjMTBlelpXc2VUZjhGZVBBWGlYd3g4Y24rTW5pSzNpK3orTXJPMXVialZMTlhNTTEzSEVrTWdJSEVUSFlHeDA1T0srUDdYVXRIMTlyclMzOFVDZEhzNXJlMWh0UXJPcVB5emIzSEhmajI0cjlWZmkxZWFMKzBuNGUwM3dEZDY2bGhyT2kzR2JwWjBWNGJwZHFwd0NDSE9TQUFjNHJoOWIvWU4rQ09uNmVtdDJHbFd1blgwQVJWdlZzWWg1bklCM3J4bk8wWVB1VDNyNnpDOFF3b1laVTZpMVBObGdYS3B6UlB6SzBiNGN3K0dyRWFSb2VxYXJkUWJ3RWpsaUdPUU9TUURna1o2OWNqcFhYYVA0cDhmeHlRMlhoM3c3YjJXbDI0QWhqYUhET1Z5MkN4SEhYa1o0cjlGcHYyUXZEa1ZpOXBGNDM4aHJpRll4UGI2VEVOa3cvalhqakpQWDJxaDRzL1paOEhhRloyczJtUmk0TDJSZ3VMdElsRFNTb3BJWnV1M2NUakFHZURWZjZ3WVY2SXQ0ZWEzUHowK0ptdHhhOWFhZC93anVqVDZMcUZyS1htdjBCayswcXlnYlZVZS9RbjM5NnArSHRXOFUydDNGTHFFRWx3aTduYUUycEFZZjNDVHhYMTVkZkN2KzB2RUVFSHc4K0hMNnlMVzdpTnl3aFdPSkVKRzVRU0J1SUJRNTc4OGNWMk43OEExdW51OVFpK0d6eWJuUGtuZkZsMEhRL01SamtqRmEvMjFRdHVSN0Z0bnd0NGdsOE8rSTlkbTEyUHdCY1JOc1ZKSnJhZkhBNHpqR01rZTNyV1BhL0QvQU1PV3V0Mm5pT2JUTlJld3Q1QTE3Yk5icXpPakxqNVdCR2V2UnV2cFgzL29YN0xFK3ZhaThWNzhHUEpqM0VHZTZ2WUFINEczN3BKNU9CeDYxc2EzK3hOWWVSRDRYMDN3eERFTHlZM016d01IRWNTbkRJd0dDM0pCNXFGbmxGUFJqV0Z1dGo4KzdYUWRQV0dPeDhQM21xcGFvakNHS0cxOGxWVWtFQmdCeWZydzN0V1o0YStENjZWcTBseGZyYzZoYnh1V2dTU3cydW1DQ1NTdyticGl2MWwrSGY3Q3Z3czBMWExCUEZQZytDNGh2VUFsalJWWVJNTVlHTUFrWkE0NmNubXZYZmh4L3dBRTkvMmZQRjN4UmswblZ2aC9ESHBEMjRrRElGSG15Y0VvTzRYTk9sbi9BTFNxcVVOV3laNFNsQ0xsSmFJL0UxUEMwbGhKcW5qblRQaC9MTmV3Z2NYYnN5d0FZeXlwam5weU1kdmF1VytNWHdrOE9lT3ZoVC93c1ZJZ3VvV2R5cVRxQWNHTmdCa0RnQmM5Qlg3dGZIUC9BSUpVZnMvL0FBNzhPZUxmaUQ0TjgyS093MEtXNVd3bENTZVNmTGtMRGNRVzUycmpJeGdZOTYvRlA0anozMnYydXZlRy9ERWJRcmJSK2RORW8yaWVJUHVIQkhVQnR2Yjd0ZlNZUEZWdmF1bFdWbWVmWGpDVUZPbHNmRW5qM3dQRnA3dExDZ09HS2tqOUs3djlsUFJaSW1sOFJXNzdUQk5qZy9kSzgvWDAvT3F2aitNemFkZldVOFJXU0VFRU53MlJ4K2RkNSt4UHBDYXY0RDhaV3NlaENTVzNSTGhMekJ6R3BIVEhmT1BwWGRHSDc3UXpsTDl5ZlRldGZIZUg0bGZCeFBoMXJUQ2VmU0puVzNrY2NpTmxBeDZrOUsrYVBGWGhuUkpMTnBiUFM1QnFRdVI1TnpHMkVDWkhCQTY5cU5KOFdYZWdlTG5zNTJkZk1sQWRTY0FaT2Y2Q3RuWEx5MmlzNEx0cGwybTVQbU4wR00xdFZsenF4bFJpMDdscTlVNmxGWUphc0VualVCeXFnYnVCK2RWN3ZWZGEwUzdodkZzUDMwY2k3R1U0NUdldnJUOVFnbDAyK1FSRTdpVVpUMHlEeU1maGl1bG5oc3ZFTm50Z1ZOOEZyKytHMFpERTQvbjNyaWFQUVdwMEh4RCt3K01QQWRwNGtzQXJHNHRGTTIzSHlTQWNyN0huTmNQNGRjMmZoU2UzbmZHNjZ3QXc0TlNlQzlaMXp3OWRhaG9WMUFiaXhrblpRa2pmNnB5UU53OU9LdWVOZFB2OUh1bHQ0OVBpVzBhUHpJNUlXeUdMQWR4NzU0N0Exbk5hYW5iUzBSekhqWFMvS3Q0cnlGamdBQm45S2o4TFhxNlZyV20zRXAycFBJRURFWUhOZFFtblczaXZRcC9EOGtwV1ZiZjVjRDV1bmI4elhtdmdtYTlYVjI4RWVLV1pqcDkvNWxsY3R3MkFjWVByV1VWcmMxay9kc3pzUGpkcGx0QmNQOWlRZk1NdHM2RDYvbUtla3NXcWZEM1Q0SUJ0ZFhBT2UyRFdsNGdsdFBFdDQ5dUUzUDVPSFE5eitOWlVFTDZYcGtkcGN1c2F4dmtCK0FBYTZZczQ1eFo2UDRlZDVkRUN5S1g4dVA3cDdjRDI2VjU5cmpHOTFyekpveW5sRWtBL25pdS8rRmR6YVhta1hWMUhPSHpuSFBRWXorVmNCNHdTNU41ZVhOb25JWnNFRGpOYTlEbGxvN0hEZkVieGpxZWtlSjdlZTJrY1EyYW1RaFQ5NWgwNy93Q2NWOWkrT1BpQjhHdmpCK3lkNE4xendWcEMyUGlLejAzN0pyNnhyaFpXVlJpVFBRa25QOHErVUl2Q3R0NC8wUjBkVkZ3akhjRzY1clE4UFhuaXY0ZjZLZEJJSXRRU1F2YnR5QjJxS09yMUNyRjJ1aDNqVFN0UjhONmYvYldsU2tTd041Z3dlNC9rSzlQK0hueFYrSFB4NC9aOThSZUF2aUQ0YmpUeEhiMlFmUXRUaGJESktnenRQcnVQclhtMHZpYVBXTkpuanVGSk1nMlpiZ1pPYWk4Q2VETlMwUzliVnRObE1rYXFUS0Y3Wi9ud2E2bzJpY3pWMmVPZUdVaWw4ZGFnMXhnYnROSlQ2alA2MXo5cjRZdXRYdWRSdllWTG1LNFI4RHQ4OVc1YitkZGR1WmJkbVIxSVRmN0Excy9DelViTzBnMWkwMWs3Q2ZMOHQyVE9jdmdpdUhBLzd0RTdjd2YrMVNQU3YybFBBc25oM3dMNEQ4UWxWUDhBYURCb3RxNHlRQjdjOG12UGZpMzRkMXV6OFFvdDNDNkNTTGNxY3J4ejdjLzB4WHBYN1dtc0pxSGh2d1RvZW5sVkZ0SSt3TElTT1NwSHQ2WTl1S20rTStzMi9pVHdWNFk4UVh0bEFMMXJGbzdoRTJqY3c0empHY2s4L1N1cDduSFNkOVR6THhycmsvaUw0VmFhMXlDMGx0SDVEc2Y5bk9Pdk5jUWpXNmVYR3JBc1kvbVFkcTdEWGJQV2RPK0g0bG50NHhiWFY2eGhPQm4zL0QzcmhiUUxCYytkazVQUStsYzFaWE8raEpKbXZPaWYyYXJ4QW1OUnlUNjB0aW9FMFVpZzVBSEZWazFXU2FiK3pva3pHeCtadlN0UFFWdEpOYVZYaytXTlJqSTZuMHJsbjhETzJsNzAwYU4zcGR6TkpITEJicVVZQU5rWXllS3lmRlhobVcxS3ltUEpKL1d1cWx6Sk9yRnRpUnZoQU9uMXBuaTIyald5RHRHVHdBV0ZlY3Frb3pSNms2TVhUWndTYVNHdXNiUGxWZVBZMUhMRWNzcFloR2I1Z090YWMzazJNMkVrM0FqSXdlZnhxckw1VW9lUWpHRGtjWXhYcFJsYzhseFNaYXROWDhaMkhoVzU4UGFUNGhtdDlQdkhEM05ySDBsSSt2Tlp2aHpRcmk0MUdOYmo1dm00TERyL0FKelU1MXUzaGdBVngxSHlVM1ZmR3JUUEF1azJ3amRBRHV4M0EveitkVXBTMk1wd2l6NlkrSy83TDhId3kvWm9UeG5jNitHdHRTMCszMUtJeHFXRzRNMGJKOWVuUHBtdmxPR1EzclpkbUNmd2h1UFN2YVBnUjhaUEdYakh3ajRtK0ZmakthZS8wMmJ3L085a3R3ZHd0REdBMlYzZEFUbnVPYThidFVoaW44b3VNQlJnajF4WFlrbkZIblJiOW8weTNGSkpJOGRyT3pjY0prOERwWFMrRGJ5dzAzV29yblZ0cm0yM01JaUJpVGpwK3ArbGMxcHYyaWE5SklIbHh0bkpXcmRsSkZKcXJTSTI3ZG4rTHBSeTZHblE3VHhmNEtYd1hxZHZwdHBaRFVYMVd4anU3TVFnbkNTODQ5U1IvU3VhOGJhUnJuaDZ5VmRVMFM2MCtVZ01odUl5cGNZQkhVY210dndkNHAxM1QvSFZscXRyZUswbW54cXNabTVDb08zTlAvYVYrT2VyZkV5NHQ3SFZuc3dMSXN5RzFqUHpNMkNjc2VUVU9Na3pubTBlUTZ6TTJvM3VuVEsyU2ZsWUE5ODErd2YvQUFUWjBxM0dpV0dwYWhJd2kwM3czTGNEWkxnTTdiWTFCemoxSnI4WlV2M0d2d1c4aEpDM0EycVBjLzhBNjYvWkg5aGUzMUM2K0FlcDYzWTN3Z2tOalpXeXFHQ2h3QTBqQTU2RDhEWHkvRmJ0UmdlemxHdHpiK00zamJSdEUxNjQvd0NFbzhRRnJWcmxqYnozVS95SVF3d3AvQUg2MXptaGZGYlFkVDFaTFBUYjJMeWJxQXQ1aVNoVVZzY0RPU0JrZEI3L0FJVm1mSDN3aHBmeEMwYTgwM1haUHM4RUx0TVZaOXJiZ2ZsY0tCbHU0OTY4eCtEbndqdXBmQkdyK0ZsZTZzV3Vya05wbHhLcmlSR1Vyc2JHQmtmeno3VjQrR3crSGVDNW05VHFxNGl0R3Z5clkrZ1FiRzAxaytKZnQ4NUpqRVhrSjkwOGYweWVLdTNmeEQ4RitHditKamVYYXhwSU5yR1NROEhKMmdISFE5SzV2UnJhOThJNlRIYmVJcnhma2ozelhzcnRpYkNBc2VjOCszWG12Sy9IZHczaWFlTlRMaUJkelcrVnlDb1lsZTNRNXE4TGwwYTBydll5eEdObEJXUjZqZjhBeDMwUHcrQzFscEYxcVZsZU4vb1Y3YXA4cmtOOXc1L01mVDNyeEEvRC9WL0UvaW5VTld1TFZHYldwM1l5eUpqeVFXM2M4SHNlMk9tYTZOdkczaFB3ejRDc1BETGFyYi9hb2JnTVVhVGtBOHNTQWVtQ08zZjJyTjEzeEJaWG1pcGRhSDRpaml1NDNCZ2ppY2ZLQmtoTWNjNDc4OWE5NmxScFlWV2d0eng2c3ExZDNleDZab2VrNnhvMWlrVGEySllZWXdFUWNad293TzJlTTgxdGFIZkxkR1FSeUt6Ymo4NVAzVDZWNGw0WitNWGlMU3l0cHI4dm5CaUJKY3FuSy9YUHRuODY3RFMvRWF4V2o2OVphNFV0M081dG1UbGYvcjhqRmVQaXNEVTVuTkhvWWZGUVM1V2VpM1YxZmFjUmVhZEs1TXB4S3BRbmR5T1I2VmlmRWZRdFMxVFJ2K0pOcDQzRlJrQlR5aE9lZmZOWkd1ejZycXZobU8wMDhYVVF1UWd1TGd5WW04czlsSFljWnpWM3hWOFRaL0NkanBWb2xpMG9ra1dGZDNMRlFvNE9lQ2VjL3JYTENuS0dwMk9hbXJIZy9pMzRMZkZHWFdiaTk4TmVGWWJYOXdIbSt6c1AzampuNVFUNmRLOUgvWU8rR25pYXgrS28xZnhscHJSS2tZaVJyazhseXdKd2VSam5xSzlQME8rMWU4MVc0ODJ5OGhKMFVLeGpHVlpSanIwems5c0N0KzJzSXJTVlZ0bktzRkc1MUkrWUVkajI2RGdWMzFjeXJWS0RwdEdOTEJRalVVMGQzL3dWamhzYm45by9SZEswcWRESlovRHpTbGtrUTV3V01qQWR1MlB3TmZqZCszZnBibjQ5M2dubmxrSDJLQmYzcCtadU9sZnF0KzNMcU5yRjhjZEM4UTZuZGVWRmYrQXRKazN1djNqSEc2SGtuKzhLL04zOXJQNFRhekpKcFh4UVNacjJQVTdVczl5cTVHOUhiNWM0NDQ3Y25pdmZ5ZHFuUVRQTXJ3NXNRMHo1VjFqUVZ0THByZFZHNGRjZGpXZC9aZHd6WVZDZnBYb2llRHRTMW5VeVV0V2trbmNrYkZKTERQWUFjVjArbmZBclYwWkpKZEduVkQ5NHZFUnQ1NDY5ejJyMjNYVWVwenFqRjdvOGFnOE42bGNTZVhIQ2M5czFMRjRXdnhmUTJqeDVNc2lxTUhybkZlOFhId0M4WVQyazl6NFk4SzN0K2tNakt6d1dyY01PZS9YZ0hwNlZ5bmhqd0I0enZmSDFwcGw1NFAxUlpZNTl4aS9zNlF1QUJua1krbjB6VXJFM1c2RTZNVTlFZmZuL0FBVEsrSDBuaEw0UHZyOWpCdGh2YjR4ek91TXVGVWdMd01qT0QvM3lhdjhBL0JVejRrL1licTI4T3BlazZQNE0weEVhSVlBazFHZGQ3dmdrL01vS2oyd2EwUDhBZ2x0NDMweSt0dEsrR1BpRUlCRjRuV043ZVpndkJKNmpqSkhQQkdldGZQdi9BQVV3MWU5bnRmRlBpZVhWY3BxdmplNmpodDl5NUtLNXh1QVBCd0FBUFFHdmtNUFFsV3phVXA5ejFxMVJRd3lpajRpOGNlSnRhOFphdytyYXZOdmNrSkdxL2RqVURoUjZDdnJEL2dsZit5bHBmeGg4YmY4QUNRK0xMaVNLeGdqYWVZUVNiSE1DY2JRZjRTN0VBYzU0T0srUUpVUTdpeHp4OHErOWZkUC9BQVM2K05OcDRNMVMvd0JLdTd4SVJjV2tFQ2hteGxBUVFTYzhmTWVmYXZmenlyVm81ZS9aSG40T0VhbGZVL1I3NE5mQno5blB4RlBaK0htK0dXaEN3a2tFZm1rc0pGMmxWNWtCenY4QWZQZk5lTGZ0di9CZUg5bmY0MDNIaGp3UnE5MG1rUzI5dGY2T0dZbDRvWmM3b3l4SUxCR0F4K0ZlbGVCZGM4TmFacWNsbHBGNFVqbFZac0NVWlJDUWVPY1pCSDZHdUsrTlh3cStLSHhqOFVUYXY0aThZUVhjS3RGQmEzcm5jLzJkTWVYOG82WUp3VDc4MThUbFdJbmhzVnpUbStYelBWeEdHNTQyaWo1dCtKR21YZnhmK0ltay9EZnczYWIzZDQxdXA0a2R5M0lVNTlPck1mYzRyNkgvQUdzdkZtai9BQUovWnowcjRMMldyQ0pOVXRSSnFzQ3lqYkpaMjZnaU00YmNCTE1FWElQclhRZkRyd0g4RS8yV2ZCdDE4VC9HT3F4TkpiUXRKZTMwekR6U1NNK1ZFTWJpeFlZWEhjOWVhK1cvang0NzFIOXBUeEZKNGkxcUl3WEdyWFFsdGJCZXRscDBRUGxSbkpPQzNWaGprbk5leEdxOHl4dnRYcENCazRMRFVlWHF6MnY0RTZ2WmZDNzluendwcTkzcmJJL2lIeHJHOTlzUCtzaFdITGxodXdSbDhzTWMxOURmdFhmQkx3M3FId0Y4VmFSNExzdzBmL0NMMjJwSlA1ekQ1Uk9Ta20waFF6N1NOeDdaTmVCZVBQaEZMb1dvZkQzNEwvYXRyV21oUlhiNWwrVlpMZzhkT21FQVB0WDBsOE90VzFWZjJycnI5bXJ4ZnFVc3VrZUtmaHRGcFVSbFluYTgwTWdqUDNzRERxdko2NUgxcnozVm45YlVrOUxtaml2Wm5tbi9BQVNDK0srbStNUENmaS85bUh4MWNpQTZ6WTNlbmVUTktXV0tjS0VVOWNqNWxHVDZaSTl2bW45c2Y0TStLL0F2aUNmUzlSMFdTeXU5T3ZJN2U4dDF6KzRsUXN1UVg1Wld5ckx0eXBCT2V1YXd2RjNqN3hKK3hMKzFFbmlyV29KclMzdU5UK3llSlkzVmdZTHVPUW9KOXVjN1cySEo5ZHc5Sys0dmlINGorRm43WmZ3Z2h1OVd2WXhxdzBnSkJyZHR0WnloQUlTVlIvclU0SkJISUhjWXIwWVZwWmRpbTUvQkxxWXlnc1JUMDNSOGJmQVcrOFAvQUIyK0ttbWZCN3hKTkpCbzFqWkNiVW80SDhpVytrQzRDTVFjZ0FZeU8rRFgyMzRTL3dDQ2JuN09uanpVb2ZoNzRZOFBqdy9mM3NlMngxZlRMdHlFY2diTjZzU0pGOVIxUDYxOHgvQlg5aVh4TDRLK0ovOEF3dFB3OThUdEFFY053U0lZSm1hUmtMQTRZTjdIME9NWVByWDZIZnN0V2drdTdQeEhkYTZCYzJWd2trWWR4dEI0SUE2Y2ZMMTZBREZlVm1tWU9lT2k2TXREYWpoMUdqYVMxUHdkL3dDQ3JuN0ZPcS9zcmZHRFY5TDFUVG83ZS8wM1ZtczlZanR3UkZLV0c2SzRRRWRIQnorTmZLM2hiWEpORTFTTzk4d2hWT0dIcU9NL3BYNldmOEYvdjJoL0IzeDUrUDhBOFJQRW5oWm9aYkJ0VHROT3NyaUlnck8xcWl4dklDQi9leU05OEd2ekNSdHNueXJ6bjlhKzl5K2NxK0NYT2VKWGo3T3RkSDYxZjhFbXZqTHJPdGFOYmFKWStNbzdHNDBlK2daWmJnS1dOdVQ4aEIvdkxuUFBZR3ZVditEbEw5bHUxOFVXM2h2OW9id3pITEtmRk9oclBlc2tXRSszV2hFY3JBQTdRWGlrVnVtVHN5YStIdjhBZ2w1NHVzOUM4VVJXK3B6dTBWM2F4QXFralpCV2NnZE1nQW5HU2VNRHRtdjF2L2I4aTBYNHQvOEFCUDN3SHAzaVM3amE3dFBGajZkdWxtVGNVbHNwa1BQWGpDRTQ5QnpYeWxEL0FHTE9KUld6UFduKyt3eVA1MVkvaHpxMGx3VUVSd0c1OXE2N1RQZ2NsMlVsdHdaRkNrT0FEd2NaOS9VVjY3cVhnRzB0ek9saEVzaEVoVUZWeUdVWjV6ajA1ejlLMWZDWGdqeHpMZk5iZUhkQ21hUldKeDVYM01EZU01SFFnY0R2WDJQdDA0N25sZXdhZXg0bDhjUENnOEwzMXA0Wit6Z1BwMm1ReFNxRDBaaHZiK2RlVjNFRFJTRUZjYzR4WHZYeFk4Ri9FTmRXdTcveEI0ZnZaNUxwMmtNbms1TERPQnd2VGpQSFhGZU82NTRjMWV5dldpdk5KdUltWnNLcndrWTUrbFZSbXU1bk9HaHNmQm5UM2Z4RUxsMndwQVJTTzVKSEg2MStpSC9CTkx3OXFsMzhRdFp0dEpuOHJNZG5oc2c4NUg5SytNdmdiNEowNlQ0ZjNGN3FCeGZwY0NTMlF1UnRYY2luajNHZWZZMTkrLzhBQkxHRzB2dFUxcldHdVlveEplckZHNU8wL0l2QjVIVE9LK2U0Z3FKWWVUUFF5Nk5wbjJ3dml6dzNQcmw3NGFrOEl5eW5TaXB2THNOR0ZBWlZLeURPZW9CeHp5YTZpMzFRK0o5TnRqNGVodG5TeXVkMS9HQUdjbkdOcEdQbDY0NjRKL0dtYVo0TTBUWGJUWGJLTVlPdnBFYjVvbWJjNFZRcEk1d1JnRG4rdFlmZ3I0WlhQdzU4ZVhtbzZacVJOdlBDNW10Q25ERGRrRTVPTUJSd2U5ZkJ4Y0pJOWwzUjBtalN5UzZ0RFBQYmg5a2p5OHhZOHI1dWNad1QwNkhqazEwTno4VXRCMGZVMjBqVjJWN21SbEVLU1I1ajJFRnNic2tEYndTU0t3YmV3L3M2NXZmR1dwWDBYOW1UbzByK1pnTEFnR1RuQTV4a2pqM3pYbkhqMzlvTDRhK0xQQytzK0VmaHA0cXRkVTE2NDAyYURURnM4TXl1Nkt2eW5IWUU5K2NWVkxEU3hWUksyblZrenF4b3h2ZlUxdEwrTVA4QXdtM3hndXRNOEJlS2x1cld6eEdiUVM3aEV3SVdROHI4d0xIOGVjVjdWWVcycDJHalJQRklHTUppbGRkMkMzSkI0N3FCei9rMThUZnMrZkFmNHUvQno0bjJQaVhWdElrUzBpa0tUektTVlpDb0djQWV2YzlNSDByMlg0bS90bGFGNE0wMlhTTkpuaGVZTEpiRzVjajVXVUg3cTQrWmNFYyt3NzF2ajhzVXNSR0dHZDBjMURGdDAzS29qMW54UHE4L2h6dzVIQnBWb3FlZGNPa0U3RGFFM0xrSEFIUXRqQlBwN0dzN1RHOEs2cmZXT3NTZUtMbG50ZGtjc1VkMlBMbnlDUG1YMStZNHg2WkhXdmpqWHYyeHZHK3BhVk5vTCtPSmJxS1RQbExLNnBnQWdnbnZucngyQnJnN1g0M2ZFRFR0U1pyRFVaeThiL05OdUxBc293dnIxQjZZSHRXc2NocktIdlMxSmVOaTNvajlVTkhzOUlTM1NPSWJRRkJabFlqYVFNOFo2RGlyZWlQY3Q0Z3ZkWDB6VjBuVVdjZHRaV2txQm80SkZKWm1KR1RoaVZGZkRud2gvYnVnTXRoNGQ4YjM1YmNrU00waEFPY2tkUnowN0huM3I2aDhPL0ZId3pkNlJGNGc4UHlSQzB5Qk1MY2dFcDY4OStCeHp6WGpWOHZ4bUVscXREcmhpS2RSSHQzZ2JVdGFobTIrSmRRaW4xRDdPR21lMWdaSXZtWWtlV3VjakEvbFhTL3N3L0d6eGxySHg3OFJlQk5iK0g5N3B1bjZmY3hIUmRZbHlZZFJnWlJsbEo0R0c0NDVHZmV2Q3ZGM2lieGhGcmVrWG1odkZiYVRHUk5lM0JoM1NUL044c0lIQkM0Yk9SMEl4a1Y5QWZDRHhocGwvTnBkM3VDeUl5RWhRM0FJenQyOWh3RDc1elY0T2FvMTR6ZTZhRlVYUFRhUFUvMjVkVlR3ait5dDQrOFcyRUNKY3Q0WmxTWmdDR2tBUWdBNDY0RHNCOWEvbkorR2VzdnFQeG8xTVI2N285Z21wMkY1WnJMcTZsb0pKU3hJUVlIQk9Sak5mMEFmOEZYL0FCSTNoNzlncnhwUEJKc054cHFSQTVHUnVQcWU5Znp5L0VUNGJSNkg4R3ZEdmorMXVXZSt2OVh1NVpTQ3h3VmI1QnVHQWUrTWR1OWZvbE91cW1ZMzhrZVBTank0VitwNGY4ZnZDR3JlQy9HbW9XbXRUMjBza3hmZDlsenQzWnlSampHTTRyMnovZ2t2b2x4NHgxajRqL0RlMmlBbjFId20xNWFyZ2xuYUZqd0IwenROZVJmSGJVSlBHZmllQzUwZ3gzTXoyZ2FaQVZYRFp5M1UvcFhvMy9CTHY0djZYOEJQMnBOQzhmNnBLZ3NIbkZ0cWtaQ2tOYlM1U1RnOU1aRmZSWVZxVlpJNXEwV3NPN0hJZkhyd2s5bGZTZUlkQnNUaTBsMmFnRXdmSzl6MTcxVUVVM2lMNGNSek5LZmxsSFE5Y2Y0L3lyMi8vZ3BaOEpiL0FPRFB4NDhUVy9nMmRtMExYN1grME5KZE1Nc2x2TWR3SHBrWjdjaXZCUENOM2U2UDRQanR0U2pJWjJPRko1eGowOUtkV1BKVWFGUWtwUVROeDd1OHZQQzFoWU5PQlBweWxVdUNNTklod1FENmtIdlc5YXgzbWthVEpyMXRNengzbzNIdnRLZ01SK2Y5YTVleXZaRDVUU1FZUnpnQVk0UDVWMXNpcGErRDViS1M2RGxrWjQwNjdma09jZm1LeGFSMVJkaUh3RHIxdHFGcC9hdDhvVVhoWnpqakIzNDYvaG10alZiWkpsaW5qdVBNalkvSW9KSVhnVnd2dzJ1WUpmQk5za3dLdEVqTHR4am5lVCtJNXJ2Tk5lQ1RSekNrWjJpUDVTMzk3aXVlUjNVSmJJd3ZEK3V3YVo4UlVNZ0pVL0szQklHUmlzSHhYcDFqYWZGYVNlMWNiWkpSbHM4REo2ZEsyTEdHMm52UDdRS0F5ZVlRYzlSem1vdkYraVRhL3dDQk5UOGNXRnVzVW1uM0NRdnp5UTNHZjA2MWpEVzV0WHNyR1RxOS9lYVZyRFR4eWtoNUI1UUhJS25QTmVpZUxwL0RIamp3L0RyTUdscGF6aTBRU3dKMDNxQmx1UFd2RXRHMWZVcjFvZE8xUXMwdHNwUWxoMnprSDFyMUMwdkROYlRhV2lCWkdoUTcreDR4bW1xaEVxYmF1WGZoMXFWcHAvaDI4V0lGSEhBVWY1OUJVZ2gwL1U3WE52Z000eSs0ZEQ2Kzlabmc0blNwcGJhYTJQekU3ei9UL0pyQThiL0VtMjhDYXRKQjVETUNBeFFmM1QxSDh1SzY2Y2s0M1BQclI1WkdycFhnelZOSWVhOTNNZ014MkhwbnYvaFd2ZDZUZjZuWkd4aFJXbDJIbGdPM2ZtdlgvZ2xvM2diNDcvc2w2eDhTdE51bHQ5VzhPYXMwTjFZeThlWWpBRlNCam5yWG5tbjZacVYzcUtRYVFBMDI1c0xrYzhmbDBxK1ZSMUpqUG0wN0hPYVA0SWkxN3dOZFBJbXlaTjNsN1QwYkdlMzQxNTk0S3ZmRmZoelY5UVc3dnBQczhVVGI0MlBCUFR2WHBuaHZWYi9UTEMrMCtlSmxjU09HM0RwN2MveXJuOVYwWTMraDZocU5uR09KUUpTTWNWZTVtMVk4TDB2VElKTmZ2RU9Db1A4QUVlbitGVy9CMWpKclBpRzcwbUszYkxtTlFjY0Q5NkFNanYxcWpvZDVJL2pLOGdjc28yQWpJL1d1MCtEczl0YWVJTGpVakJISVk3aTJMdGpwaTRVbnJYRGdmNEVVZEdaLzd4SXNmRy9TTmR0ZkhXaDZYY21ReFFTaElsSnlBY2djZmxYSC9FTFUvRm1sM0RXMTdPL2xST3dpUmpsVjU1d08xZlR2N1V2aFhUbDF6U2RjOGtidnRTeWJkbk9BU2VjVjg4ZnRHK0l0TDF1NXVMdlN3RlRlUUNRTThmOEE2NjY1M1VqaXc3WEswelU4YjZoYTY1K3pKNFd2NFdqYVVYczhkd2taNVVnOThEZzE1R1pSWjNNYnRicTI3b2pjVjJPbDJIaVRTZmdIYlNYMm56cGFYK3J5UzIwc2lIYTR4aklKN1Z5RjNMTGZJRDVaVjRSODJCeCt0WTF0V2pzbzJzU3gvd0RIMDhxcXNlNzA2VnJhSThWdGNDN2xqeUFldzYxaDJzMXZLUHRHOGUzTmFXaVRpNVQ3T3paSWZLMXkxZmdaMzRkL3ZFZHMxb3R4YnJxQ3RoVVRQbG5vQUJtb05hMUczMURRWTdoUmtPQU5oSFBCTlhOTXV6RkFGa0NsU21DeDZBVmtXVWlwQXRzeWNRek9CbHVNY2tWNGNaU2M5VDNxclNnY2xQT0drYnpZeUczNDZWTk5aaThzaGJXdkVoZjk0Y2RGL3dBbXJXbmFCZGEvcTB0cllSaDNZc3dIb0JUZkRXczZLdXR0cCtyeW1OR0pqWmgvQ2MrditGZXRUYmxGSGhWWEdETU83MDlJZ2JRMm9PT1BNQjUrdGEzaGZ3VEpxVUlrbnRXQ0t3L2ViTThaK252VVd1eDJ0aHJjMXBCS0pZVWI1WFgrSWY4QTZxMGJQNDkvRW53NXAzOWgrQzdHempRWVhlOW1IWStuV3QrVnZZNWxPS2QyZEw0RDFqVWZEbXZhdFo2UGJ4eDJVM2hXN2l1Y1JqTERZY0hKeDN4MDZWNVpFazg1RWx2OTByOHg5RFhzWDdPMmp0OFd0UThSYUo4UWkwSGlPOTBlWCt4WkN2bHh5RFljb0VBKzkwK3ZOZVBBWFZqSE5ZeWJvNW8zYU54dE9RVjRJeDJJeFhWQk5SU1p3eW5HVlp0RVZtMnAzbXBHeXRweUY1eWQzODZ0YUhhM0ExNksxRStOMHdRdG5wazFONGJzTDZLWDdYYlc3RWtja2cvV3RDMXRBc3I2cE9BR1dRZktwR2M1NjFhWkVwTmx6VmRJbjhPK0lyblQ0Ym95TWh3V1FFZGVheFBGdWhNdHNMMXlSSG5EU0FkNjZ2UVgwMjkxT1d4dTh2UEtjbDI3RGduRlVQSDg4ZHZvMCtsVzdxVWpkaWNBalBJTk42bVRXbHp4dEo3ZTQ4WFFtMkpLRzVRRGQ5YS9aZjhBWWIxcTlnL1pudnJheUVMSzBrQm04NERHM1lBeHoxNEJyOFpMU0lSZUpvR1RvTGxmNTErdzMvQk5QVzdEVS9nSjRoMDI5K1pZV1VPdUNDd01mcjY1eCtWZktjWFIvYzB6MjhsZGxJMi9FOXBJdnhGR3BxZ1c0Z3M1UUM2QTdzc2VjRURuMHdLZ3RiTFVOZTFxME9vWFJneWQvbXhuR0ZDL2wySTlNOUtzNndvc1BHRXQzTGUzTnc3NFZudW55NUh5OEFEdDFGUWF0NGgwL3dBUDJ0M0dMaEZ1MWdaYlhwa2trNEFCeHdLK2VvUWxWaW9vOUd0T0VFMnpOK01tcjZOb1doWGQzcWwyOHR2WkFQT0ptNFRMNVlESEJQQVA1MThsK05mMmhiUDR0ZUlsc05COFFMWldrS0JCQmF6WWRsQis3NmpnNEF5ZXRlaGZ0SmVQZFcreTZWOEsvRUd1VzZYZXZLODAxeXo3Y1FKeHR5RHprbkJ6MzcxOHNmRkQ5amZ4enB1b3Q0aDhEWGJUcTRhVUlyYldCeHU0WUhIUTV4bk5mWTRMQ1U0MDFHVXJIaFNxdHo1N1hQYWRFZXo4UFRyTFlXUXVXeUZsYVg1ampweVQ5TzJhOWo4QVdIaDNWN2NSK0x0SUN0TGc3b29TY3FlR0tzdlRHY1o5cS9QL0FNTy9HUDR2L0J6WFk5TDhUd1RYRWNFZ0xXZXBMZ2tBOGJXUFBiajYxOWkvc3EvdHFmQmJ4M3FWbDRmOFZhaU5GMUM1dVlrWmRUSThyTzhFdHZQeXNCMHd3L0VWMHp3YzRhN28yaGlhTWxacXg2NzhSUDJkTlQ4RTZKRnFkbERQYzZYY3g4N0ZZelFuaFFNNHhJT2UyYTUzd0JESll0SllUUUVxMDZKYmdjcTNVODlnY0FjZTlmcFhaZnNqK0QvaUgremJvZmpid3Q0aFRVSmJQU3A1aGN3bEdXU0lnbGRyS0Q4MjdEWVBJQUk3VitkK3NYRWZodjRxYTE0ZExJWUxpSkd3RVVHTzZSQVNGSDhPNGUyYTU1MmxGd2U1ejRtaW9KVkluYjIrcHpUNmpIWUMwWnpKYkZna2ZJNzVYMnhUZkRXaFh2aXJTTFB4QnJWZzFsY3hUdTBWc1Z5WXlqWUJQUGNENlZrYXg4UmYrRmJXN2VJOWVzZzBUbFltWkNBeU13eUdBT1FNazhZOWEwdEo4VWVOUEUyaDNuaWZ3M3BVYkxEQ1pwTGVYQTNqYVBsQnh5MkNUanB6bXZBcjBuVFoyNGFvcWtVMGROSGU2bEhadUpJSWtsdDI1bEdQbXhqSnhuSFByNkN0TzErM1NlV1o3bFpuTzBoazVVanFjY2RzR3VhOE1lSnJIVU5RbnRwa2szaTNpd2tvSUFWMUc3b2NjZXRiT21USHhCYXZZYWM3VzdRbnlwSkdIT0JuT0IxNlZ4U2FSNkVXeHY3WlZqSjhTL0FuZ3ZXL0NPalhPbzNXaGFOUFlhOExTTnBHdFlsbTN3eU9CMitjK3VPTTRyNXcxM3dyZVhudzIxRFJmRm5oKzZmUW9nOTFGY3RndGF2Z1pLWUdEbk9NREdNMTljL0NpYlZ2QnZqeUswMGp6WkhtbGpFYnVTZk1WaUJnbmxjYlY3K3VhOGcvNEtUVFdQd3N1TDd3dm9sa2tlbmFsZFdjenBHakVRTEs2dThlVGpHQ3ZUMHIyOHN4cjlrNmJSNXVLdzZkVG5SemY3TW43SWVnNm5aMjJ2NmxwQ2FUWVN4ckxEREhFR3VKVU8waG5rYjdoT0R3TVY2WDR3K0l2N0xId0UxTnJUVnRHc0pwb2xjTzh2bFN5S3d6OGg3bFRuT2ZjOFY2L3dEQUx3VFlmSFR3Qkg4UGZCT3FwQmVhcnBOMTludlVsQThrUTJwWmNaNEp5UUJuSFgycjRkMUg0SmVHOUQxNW04YjZuNWx6dkRUeTNVZ0pZNFVNZWNqa0hPQWNIT2F3ano0aW8zVW0wamIzS1ViSlhQVWJmOXRuOWtvTTFuWlcranhtU1RNY010Z1kxM3QxSXprRWRpTzlkejRCMXY4QVp2OEFpVjRvaHZ0T0EwcS9sazMyK3E2Qk1kcUFFWTN4SEt1TWo1Z0RuQTlLK1V2alJwUHd0bTA2TzRTR3hpdFlaQ0RkVHhMR0c1NFVjZk11RGtIZzF4Znc2c2RGdmRVaXVmaEY0MWlzZFFoSThpSzF1dDhVeHlEaDE2cVNTQng2OWE2dnFEY09hbk5tRHhLY3VXVVQ2YStQMzdQbmkvNE8vSG53MzhWUEJtcXdXdGxyR293UGVhcnBKSWd1bXk1ZTRpTGNMS1FEdVE0SnprWkJyNUYvNEtIUzYxL1o4ZGpEYjN2OW14NnZKUEY5dEFES0pOeFRlUjFKNUl4d0FldGZhLzdOMzdUaDhYYWovd0FLWitOL2gyQ08vc1hDWG1qNm1tMkNjRGJod2Y0WDJnNFpldVJpc3Y4QWJIL1p1OEZYM3hDMHZTOUUwV1RWdkRmaSt3a05oYVNLWG5zN2lJcUpiVGRnQTdjZ29lb0RIUGVyd1dNVktzbFZXcTZrMTZUbkM4VDhmNWl4T1FEa2ptdXgrRjNpWHhOb2QwbDc0WnZYaHZiZHd5SEhFb3prTHoxT2NWOTllRy8rQ1RQaER4THJFY041NGVzTkZ0SnB5Zk0xUFdHZVlwdVhHRVFjRUE5eldmOEF0My84RTA5TS9aZzBYUjA4S0pidEZxZW1YVnhEZUlObXdRNUIrOE9jN2t4azU3MTdFc3p3ZUpxS2k5V3ppaFFxMFZ6bmtYdzQvYis4ZDZQTEZCNGt0WlE4RUxxN3dOOThucUdCN0hKNmV0ZXIrR2YrQ2xtdWF0QWZEZmh6d2pjVDNkeGlQYkxKdFF2anF3SFVIdUJqcFg1N1IrSzlUc2k4WmJlU2Z2U2NzUHhyVzhCL0ZIWC9BQTk0c3ROWCswNUt5Z1B4MUI0TllWc2l3c201cUpzc3hxYlhQdk9ieEZyL0FNUmJkdkVueE0xdVhVSGdVL1k3RjVOc0VEYlFRcXIxTGdqaml1eC9aLzhBaGxxL2pUeFREQkhaU3pUM3QxRDlwZFZPMnlzdzRZZzhEQk9BTWR1M1d1WS9aN3RQQS9pUDRZeGZFSHhKZGk3MUc3TFRlUjV3eEVOdzJxQm5rNEhCN0FHdmR0SStPbmczNFVmQysrdlBER25MdGl0SGxublFFRUhBUHpNTTVKUGJQSE5lTk92SnAwS1ViSFlxYXZ6eVp0ZUxQR1Y5OFNmMm1OYzhYYVJNMTFiNkpkMjl0QkZHMmNSUUtFNUhkY0JzL2hYYS9HUDRsYVBvbjdabmdueEc4NXM3blYvQWxxYkNZbFZLWEVEczZEY0Izd1JnZGVNNE9hOFEvWUsxZnhMck9vYWo0bDhTV3p4cHE5MDByelN4SGxYSUxjdHp0SUk1SGRmYXU5LzRLdWVCOVMwVDRSZkM3NDFhQlp5eHk2UTE3WlBjSklkd2FHUVRMMTUrNXY4QXFNMXh1bkgydnMwOVdhUDRlWTZ2L2dyUCt6bjRVK0t1ajJ2eDAwM1JIbDhQZU5JUkpxRXRyQUVGdmZiUjV5azUrVmlRSkZHUG1LdHhtdnpnMG54diswMSt4UmVSMm1rYXJkYWw0VmxsSDJjTUcyS0QvQ1RqTWJZL0RtdjAxL1l0L2E2K0d2eGUrR3EvQ2Y0MTJNR3JlSE5aMkc0MDY2a3dWWUZRczhMRS91NUU1d1FjOFZ3My9CVWI0VS9zeC9zK2FYb2xsOE1kWlhYdEkxN1E1cmlXTFU3bUthYTBsamJZRHVVZ3Vyb1FxN3VtSzlQQzRtTldQMWV0RzdNSjBuRjg4V2VDL0QzL0FJS29mRE95OE94TjRrOEhQYlhvUmQ2SlpIY1dKNU80RURvQU9neUswUEcvL0JURDRrZU9QQWt2dysrQ01kL1l5YWxCOW5tMWFUOTNKSEdkd1pFQU9NbFR3ZW9yODVuK01tcDJPcDNDUGFvNkpLL2tnS3VVK2I4dWdGUjZaOGRQRzkxNGdzM20xYzI5dkhkS3dqaCtWVjVIUEJ6WFQvcTdoMVAyaVhtYzd4N2Z1M1BXUDJpMzhSWC9BSUt0M2wwK2VYVHJabmhqdXBsT3lTVU14WTdqalBCUGJJcjUzbHRneFZZWWlDUHZFOXpYNkVmc2xlQ3BQMmpOTzhRZkQyeHU3UzUwKzZsVjdqU2RXY2VXeGI1aThUSEpqYkE2NXljak9lYTZIeEwvQU1FSlBITjdKYzY3NGJzTldndEVsTC9abmhXVlZYKzZyakI3OEVqb0s3S0daWWJEdjJVblpveHFZZXBVOTVIekIreEdMand2NDMwWFdydVNXSzFsM3BkT3NaYkNNeEtrcm5sUXlnbjJGZmM4Zmp6NDcvSGZ4ZG8zaEx3ZHJSOFNXR2pPa3NNVWlORFlxMkFwYVFkOHJ6dUF6a25GZVcvQWo5bHA5VThXVGFicCtteWZaTkpsUzBTMzh2YkxPNGRoc3dBZHB5RGtlMWZUbmpqeGZEK3lIb2RwNFA4QWgxb1VGNzR4djQva3RmS0RSMmlrYk43QUQ3b0lBd2VlQ2E4ckhWSVZNUnpRMWJPeWhHVUllOFA4TmZzc2VGZmhQYlgzeEgvYXc4VmVHZEp0N3JVaXVtNkRvTml0dGJRa3NHT1hjczhqWUdObzRLZ2NjNHJyZE4vYXcvWVU4R1djbWwrR1BFT21RK1pFMFVjMXNZMGFJT0dVaFNGd1ZJSUdUendPSytPL2lKOE12akI4WGZHcStJdmp2NC91ZFJsdnB2UGEzZTRLeFJ1U0ZLcXVNREFISGY2NHFwNHUrQ1h3VThJYVd5NnJjVzZNaUFoanpuRFlKUFBBcVhsOVNxcjFLbXZrTjR5RWRJeFAwSThHK0p2MlZQaTE0YnM5TWswL3duNGdnVllsV2U4c1kvT0lYT01OSDBJREFEUEpKNzE0ZiszQi93QUUzZmc3SDRhc1BpdjRMME9iVDlFMVM4K3hUWDJtekVyWTNESGVGYU9VY0l3enNQWFBmcFh4cDhEOUQxalcvajlvMmkvQWpXWllBa3l5WDAxdGNGb29VM0RkdTlSMDY5T2EvV1dEVWZEa2Y3SC9BTVNQaGo4UWJ5T0dPMzhJVytzV2N0enRYeTd5R1pGajJrZ2dNek1BT2NrTng2VjVsU3BYeS9GeGdwdHBteTluaUtMbGF4K1RmaVQ5azJ6K0R5K2ZmZU5sdTdhV0thYUtLT0hidWlqUWxTZWVjbmIwNkVuclgxdi9BTUV4L2czWitFUGhGWmF4cmVuRDdYZTdybG1ZY2pMQmhuMjJqOGE4eTFENGVhdDhYZkh5UzJ0ejVlbVh0eUxSYzRIbXhGOXo3UmpKQXhqQXhYMi84UGZDYStFUERFRmpvdHJ2amhoQ2lBS0JoUXBVQWpxQnhuOGFqT01aS2RKVSs0OEpUVWRUdlk5ZThONkJwOXRmNmhJdGtVbUVLeUtmWGpiakhUQTRKNDVxUzExeXl2dFYxU3owYXhudTcyT2NMUEtjSkR5TUtBdzRZWUpQMUZjanFWM3BHbzYxRm8xMWRXMXkxdEdKbjB3c3J1emIrR0FBNTR6am44ZUswdmgxYStNOUN0cjFkV2VLV084dTVMaTNpT1MwZThBQmNuc0FSalBQRmZPSmNxdWRyWlIrSjJ2YTM0SitHT3A2VnBuZ2E1MWxMcTFsaWF6aHVTUE1TUmNzVG5KQUFPT09hOGYvQUdGLzJRbjhHYXRQOFh2RWVqWGR2ZEhmRHBHblhlMW1pVnp6S3d4bjdtUjdZcjZZMDNTcnU5MWFZWERGaExieHNKaW9HSEJ3UU05UFNySGhyWHIyejBuV1BFY1hodVlXV2x3VFN4M0VzdXdPWWtPVUhxVHdjMTE0WEYxMUg2dlQrMDlUbHIwNE44OHVoNFQrMzMrMVRlL0NEUVpQQ2ZocUdHM2xNTE5xTjVDUXpwRnVCWmVBTm9QM3lUanIwelg1aDZWOGZiSDQvd0RqYTdzYjN4eW1teFJueTdQVDBmWTgyQ0FNTVR6a2dIa252WGZmdFMvdEtMOFdmalByWHc3OFU2NnlYVTB4RjdkSVFBWkpNSHljcm41UUNCais5bmtkYStXZml6K3lUNDk4TFd6ZU1QQmNjdDNieHR1SWl6dmp3dTdJT2NISHNhKzZ3R0JvVWFmczNwTHVlWTZzK2JuYXVqNlcwTDRMT212dmVYOGR4SmJpWWduZWVjNUc0Y2s0NCs5N1l3SzljMFg0RGF4ZCtFeDRoOEphZGR3UENZbSsxV0VrakFuSkErVWdncWUzME9lbGZDM3dIL2JqOGVmQ3VlTHdmOFRMZWZXTklSOWorYWNYTnV2SStWaU1rRE9jSHJpdjJKLzRJOS90S2ZzM2ZFUFVMM1ZaUEVXbGFuWVBwOHkzR2czNm9KMStSTURheEcxZ09qS081cldwZzZ0T1dyME4xaUtNbGRJK1EvRlBndlVkR3ZoYTZuNWxycTZvRldjSXlpWWc0SVpjWjNmZTU3MTdKK3lQOGFadFBtL3N6Vk5Sa0JoSmhpaGxPN2tER0dYam9Sam4xcjZKL3dDQ3R2N05QaFR3dmRXSGk3d2ZZSlpRWGVsd3o3N2NLQnVVZmVPM25uSllkOHFjOTYrQmREMURTOU8rSThXbzZUTVZOMmlQTkVxc3A4M0pEZCtyWVB0elhMaUtVYXRDVVdRMHJxU1AxTzhKL0Z6d3Y4UWZEYitHOUsxd2krYUVxSnJSYytTL3lxSE9BUm5JNE9hOTQvWmgwS3k4SzJsdHBWc2JpOG5MSjlwdXJ0eTBrcGJIekVqZ0tNY0FkTTRyNWEvWmdzdEswNzRjVzhlbDZhb01rSmtsOHRDdTVtRzRuZGpQYnBYMVI4SDlYdXBMclREWVdhenJKSkhHalRIeTgvTUQxR1FldlQvQ3Z6NnBTVUsxbDNQVWhLOFRvZjhBZ3RScVFzUDJBZkVlR1A3eG9FQzU1SkpJR01WK0JlcnkzdXRmRHFPNDFuV2JtS3l0YnVRV3RpQnVpVExBRnNaemdqTmZ1TC93WHc4VEhSUDJIUnB6c1ExOXJ0ckNXeG5HTnh6OWVNL2hYNFErTHZHOGY5bi9BUENFeFJGbWd0MTNZVWxWMzU2ZGp5UnlENml2dk10aXF1SmI5RHlyOHVIKzg4YStMdW5RV3QvSDlsWmNPeDhzb2UzR01ZOXNmclhCK0MvRVd1ZUYvR1BsR2FRTEhJSGpYZGpHQ01kL1N2US9IOWtxZUlJeTYvY2pHVko2WTVOY0g0am4wMCtMWXBJOGZOd1RnODE5SzR1bks2TVl5aktObWZwUit4ZjhRZmhuKzNCWTIvd1YrTkdwd1JhNXB2aDY0dHZEV28zVWhIbVNEbFl5ZVNUMHhuMHI1dC9hVStGSGlENGRheGQ2QkxwVXNDNmFXOHp6SXltMzVtWG9lbnJYbFB3ajhVNjE0SDhSdytJTlB2WnJlYTF1RW1pYUdUYVJnZzVCSGV2dWJRL0VmaEw5dkh3VHF0eDRsMStDSHhaWTZIdHR3RVZSZE1neVF3QXhuMXp6M3J1NTFYcDY3bkZLbTZGVzYyWjhUZURieGhxbW02ZGZUZjYyVmdjbnZuaXZRdkdjY0dtS3FXczRZZVVSbGZwa1ovU3VMaDhKWG1rZkVDTFNyMklpVzB2bVhHY1lBYnB4WFYvRmxZZEtsU01PQWprRlJucUN1UDVpdUtkMDdIWkZwN0dCcHFybytrMk52Q1Z6SktEZ2U1SnJ2b3JzeHhmSkJoQ09kbzcvQU9mNVZ5R282WXNkMXA5dmFNZ2FLSkN5YmhrOCsvVWMxMUdrM3NWaERCUHFqWURzSXl1T1FmOEFQRll6V2gyVVcxSTU1ZFkwMncxaWEzbExJc2pEeWd3UFVrZDYzZEJTNjFQd0I0bjBSSHdrK3h0dkhKVWtqOUtxZUtyTE1VTncybWI0cmlZbEhVREtNRzRQNVZwL0RtUTNHa2F3c2FjcytDeDVIUTFoQmFzNjYycVZ6eTk5TE1HdUxjeGdIekVWWkNleEdCWGJ4U0JkUVc0ODBCZnN2SS94SHBYTWFvVmcxU1dOc3FWY2dFanJ6VStuNnY4QVk1WllKd3h5b1VnbmtDdWY3WnZweUhiUVJtN3ZyU0VRQlV1SFZQT0JIeWtsUnorZGVjL0huUjlPL3dDRXV1dExRNzJ0RjhoaU1nRnh6V2pxbnhQZzBJbVdlNENpS0lHTnNuNVNNNDUvU3NlSFhyVDRtNms5MVBJbjJxOGs4M0x2dFdVNXdNblBwbm12U2l2Y1BGclNmT2UxZnNjTXNQZ25WL0FZaE1jZXIzTHJ2NVZSTXFvUjM1M0RkOWExOUowaldmREhpZEZtamEyZUJ0elo1SUFBNUE3Y0h2UjhMNHRCOEovQ1piYi9BSVNEVC83Y2sxUHpiYTJpdjR5NDVBend3R0dVcmpxYStxUGl6K3pOb2MzN0gyZ2ZIQTZwTk40blMvZTExNkJiWFpiaUhneEVPUGtKQ2hlUVQ5NDEyUm9TbFRUT0w2ekNGVzNjK092Rkl0SmRaa1d5aHdMaVlsNWNERE54elhLK0gxdnJlRFhOR21iY0VtR2NrZE05djhhNnJXV0l1NVE3RGNyRVIrbzVybWZDdXNEVTlZMWY3VXUxNVd4akhCSTlheTJOOVdqNTJ0TDlZZkZrNlN4Zy91dnZFY2dacTM0VTFTUFRwTlR0Q2tnQ051RTZZT01FRURCNjg5UHhyUDF6VHA0UEdjNncvZDhra2ppb3JUVjVJclBWTkdqdC93QjdMS3NqdmpPRkhHTWZqWEJselR3NlozNWxEL2FHZlozajY0OFBlTXZDUGhZMlZ5cm1iUVJNV2VRajV3cDR6MEp6L3dEcnI0LytOR2t0cE45ZVdyTVdDc09OMmNqT2Uzc1JYMFBvV29XNStEdWoyZXV4U0w5bjBxVlk1UVd5blFqOE1ITmZOdmp1V1hVcDd5S083TWtiZmNiSlk1RmQxVldhUEpvcHU1NlhCOFVMbnhKK3k1QjRCMVdDSHlOSVlOWk9JeHVIK1BVMTVBbHpid1EvYTFrM0t6RUZWQUpEWS84QTExMEVabDA3NFdOWmtFZWFCa1Z5RXgreVdsdkFwNGtMRnVhd3FLNk8ya3JPeHE2eG92aEt3bmdYd3pya3Q4a3NJZWQ1STlnVnllVkgwcUxRNUlvZFpXTkcrVW5EZTFRV3FLSVlwbVhiSEUzem44aFNXSGxSNnNyQjhvMG9ZSDFIcit0Y2sxZUxSMzB2ZG1tZC9JMEZ0WmsvYUZBQTRHZWF3UWI2NnRKejVvSEoybnVLdVhGelpYVnlBakJ1QnU1NHF2TEpFbHJjUndTY0RzTzllVlRnb1MxUFlxTjFJNkZQdzdMZjJNcG5qbVpHSEc0TnpqNjFXMWEzME96aGsxbmZHMGd4a0JzNUpyTzhRV3pYa1gyYU15eElwR1FId2M4VkY0TzhIM0dwenZvOXJNdStiTW9XV1lLQ3FETGNudmpQRmV0QkxsMFBDcko4MWh5VFRYcEY0ZUFBTXBqdFRvOVkxRHc3cUVGL0JacEs1Y2xZM1hJd2U1OS84S2d1NUZONHRyWXVVZ0hET1IxNTZmU3RLRnJlNm1RRGF4VkRnZDYwanVZU2o3cHUvRHY0a2VQUEZmam13T2w2U0l0VHRCSlBadmFMdFltR012Z252a0tjK3VhNDZiV2RSOFJhcnFIaUtiU2tFbDljTlA1Y1M0VmQ3WmJINDEwbndvOFZhcDRKK0ltbWVLOUVDZmFkTnZsbFZuVUZUZzRLa0VZd1ZKSFByV3I4YXJEd2o0SCtKRjFZK0hwbzViU1NSTHFGSVR1MkxJTjJ6cHpnbkhGYnBuTkdGcEhPSHhRc1ducGJXVVcyYmJodmw0OTZyUTNVbUVjdWNzNEpCSi9sVTBOenB0N2MzTnhiMmJvMHZRUC9BQSt0Vko1MmlrQ0VES3NDV0hUTlVodFdaWXU3blU5UDFtTzdnaFpKZ3k3VllIbnIxOWFuOFhKY1hWaTh0eEFJNUdBTWlKMEp4bi9HbnpYZW9YOXhCcW1zellaU29pUWNmNUhOTDRtTEd6WnBQbUxya1k1d2ZTclZrUlA0VHlDNHpiNjJqR1BBaWwzTjlBYS9VTC9nazM0eGdNUGlUUXJ5WWJMblM0TGlNSEk1WGc0eFg1a2VLN2FXMHZuRHB0WjErYmprVjlyL0FQQksvd0FlTHBQanZTYlNaaVJxV256V1o1SUxNT1FQMHI1M2lpaTYyQmpLSjZHVTFPU2JpZllmeEhlM3RQSEF1dEsrMFN4T3pGNUd0d3NXU1BVL1hyWG5IaW5RTDNVZkdZOFEzVjBTc0toVmlVOERCL2xYWjIvakx4VjRwMFo5ZDhlK0hocE03WGN5TlloOGhZbGsycTJTZUNRQWZ4cUJ0RGJVN2o3WEZLV2lkUG15MlFjbmpuK2RmTjVaTDJVVXBIVmpZT2N0RDRYL0FPQ2czaUsvc3YyaXRHanU1WEZ2YjZIQ2k0eU9ya2tqOGNWdWZCSDRpM3VoM2x6cCtzNi9ZcmFOYm1STFhWcGlVbVUvZTJ0L0NjZEQxQlBUMDZYL0FJS1cvQk85MW5SZFArSnVoMlJkOVBVdzNPeFRreGs1Qi9Tdmo2NDhmYW5kV0VOanFFbm1mWjFDcEl4NUE5T2ErcmRPV0pwUmxCN0hGaDZrYWQ0eVB0S0h3NSt6MzhkdzlucTE0anlSTzVrMG01QTh4bjJiY3dUQmwzamQwVW5JQTcxNUQ4WS8yRTlOdGJpNTFMNFQ2aGNKR2tvOHUxMUJsQnh6bkFKM0tNampxVDYxNVQ0RCtKYmFLWmphVDdKSll4R3FTZE9PbVBTdlh2QlA3V1hqWFFOTXQ3QzcxS080amhDTWtkNFBNUk1FQUZHSXlwd09NSHVhdW5WeEZCMlk1MDZWVjNSQit6MSszeCszbCt3TGNQNFk4T2VLZFUvc0dkREhjYURxNGVhMGtSZ1YrVGQ5dzR6Z2crOWV6L0JINHlTZkgzeElmSDEvcGphZStxYXM3UGFPY2lNN0R2Mms4NDUvTElyak5iL2FqK0dQeE04TXdlR05lOEJNTlhXWUJwNDNFMGJuSkhHN0pCd3dVRE9QbHJ2L0FJTStGNDlEaEdxcmErUkhiV1lFY1NqYmgyNTdEMHhWVnFzYWtlYTFtWVZZdU1PUytoNzNxZnc5OE4vRkhTNzN3M0RjTTlta2lRU1BidjhBTjVpNXh6ampHMEhCOTY3YndScFhoRDRjZkM5Tk5nSWY3TGlMTXpMNWp5QVlQZk9NWjZkTStsY2g4T29UNFl0cDlZdEV6SGRFeVhOcklTZDU0SWIyT000L3JVMXg0aTF6eERyTXVwYWg0S3NZckcyaVdYVHBJTHNzOHJnY2wxd0J5QU9QOXJGZk00dWM1eWFPN0NVNDBxYU9sdkUwNjh2MHY3YUxNaGkyWlpjRitNcjA0NmREVm1DeHZJNVMwVTNrekJnUzRQR0R3VGpGYzc0ZTErNjhRMlM2aE5aUEF1NCtWQVFNZ3FCa0VqbnBuMHJzUEQycVJYTS9sdEhsQytHWUtlVDk0ZS90WG1TVFIzUmFMRjdmK0pORDBHKzhXZUZiNnhrMW0yc0hYU0RkUkF4TElRQmdnSHJ5U0FldGVKYWg4TGZpNThZclMvMDM0ajZGZmVKNzNWTFdXYTdlS01veUhiaytXSEhHMHFTcHdPRHdUbXVqK04vN1JtaWZzMmVJYm05OFA2S05ZMUdDME1oc0NOeVdseGpJWTlNc09EZzlzMWpmc3VmdHY2NThXdFJuOFN6Nm5idGRYdHlSZEZ3cXZHNWtEQUxrNFJReEpBOXZmRmVsaFpUcFUrZTJoejFaYzBySTg0K0d2N1MzN1hIN0trSnRmRG5nK0YzdEVlMGp1NXI1cmVlTWNLOFVzYkRPVlZjTUsrWmYycGYycmZFK3A2UEZCZDZwQTJzWEYwWm5FTGlRUTd1V3d4T1JrRmVvNDZEZ1YrazMvQlJlNCtIWGlQNFBlRWZGcTZ0WlhldmE3YVNRNjVBSFFTU1hGc2YzTjF3TnhMeGtxeFAzbUFZMStOMzdVdWlXdWdmRk81MCswc1hnYU9DTVhhdGcvdmlNdHlPdmIycjZYTHNOaDY3VTdIbllxdlZwcXhpK0l2ako0MjhSNk5Kb09wYTdjeTJrb1VQQkpLU28yOGpIUEhQdFV2d2cxYlVkRDF6L0FJU2JTOVZrdDd1eGxpYTNXTThzZDNwanRpdU1yNkMvWVE4S2ZCSFZ2SGdpK1BOdXgwdTVDaUtaWmlubG5kMTQ1L1N2V3hjcWVHdzBta2NGRnlxMWxkbjMzNFMwSHd4KzBaNEw4QmZFZWE1R2wrSmJLSkZsMUNDTldhVzIyNEtNb0hJRHFUejBEVjlDYUI4UFBFSGlUd3hyUGoyem5YV2RWOE02SGVYMmthWSszTHlsZm1HZVNma0FZWTVBNzE1NThLdkJ2dzUwaXlYUy9oZjRnaXZ0T1d6VkxSa2tCTWVmdXBuR1Fja2NuR1FEWFRmczkvdG9mRC80WGZ0RnhlQ1A3YVdlSzBuK3lYWWtHNUp0d0N5cHVQSEs1NTlqWDUycXRldmlISzJpUG8zeVJwV1I0dnEvZ0Q5b2J4UjQzVFJOTDhlTGY2aGN4Unp0QllNUkVOOGU0TGxSZ0JWNTk4VjUxKzNOOGJ2akZvbmc3WE5IK08yclBmM1duYWNtZ2FNc2NKV1BiOHhiYmpISk8zTEVISUZlMC90T3I0dS9aRy9hNFR4ajhMTDEvd0N6MHZZTmQ4SDZnTXlSVDJjaEx4NTM4RUlXTVpHT1B4cmdQMit2QitrL0gvNFY2cjQ5OENhUk90bjRuZHRac0lHWm1hMXZGSU54YXV3NHpHKzRyNnh5QTE3dUNwUWpYalVaeFZwdVZKeFB5bHU0SkF4ZGNzZ0FJZkdCaW9VSlZndzdITmRSYmFCZDNHcFBvOHNSV1NWdkxaTy9tQTRJeDYxbTNmaERVYlNkNFpveWhSMlZsYnFDSyt2alZpOUdlSTRTM1IydncxL2FIOFZlQ2JRV1Z2cmR6RXFnTEdFSUlVY1p4bm9lUDUxNy93RHMyZkV1NytLbmpIUWZBZmlQeHJjWFduWHQ2SnRRc3k0U0ZsVDdpWUhKeVRuSHZYeDNlV005aSt5VEI5R0ZkSjhKZkh1c2VBL0YxbHJtbFhMbzlyY0xLbXc4NTZISCtlMWVkak1CVG5UbE9sb3pyb1lxU21velAzSjhQZUZORThQUVdVL2hzMnR4aGtBc1lJd3ZtRDVzQmNIbGNmZ2VlOWZRM2pQNE1lRmYya2YyRjlhMG54enExcHBTZUdaVzFrbTVJTWFva0RHVkhLamNBNmxsR1J4a0ExOERmc1hmSEszK01XbVhHdXk2a0JQYXd4UnhvMHdYeWpzSjNkZmxIYkhyWFNmdDEvdFE2N0I0SGI0RGVCZFVtODYraUUrdXBCTVNzbG9CKzdoWTVBVXQxeDNCNkd2Z2FkREZ5eDhZcmU1NzBwMC9ZTm53eEkzaUx3UDRsdjd2NGQvRVlhWHBuMnFVV2tGKzJHOHJPVjlPZHVDSzVMNDAvSExWOVMwMlc4OFVmRTJmeEZxc3NKanRJTFpqNU1JUE9UMkdEazRIcm11TytKbDFyM2l6eEhMYWJKREJiTjVheEhJQVplRHdPQVBUOEJVVjM4T0o5UHQ0VXZJd1JORHVHQjFJUFQxelgzMUxDVTRTVTVMVThHZGFiOTFNOHBtKzFOSnZrTEV0emtqcm1tRlhqY2J3UWV0ZHZxM2hlSzFZeUNNWUI0R08xWU56b0Y5cVYyc2VuMnJ5QW5hdTFPK2NmMXIwVlZqYlU1UFpzK2kvMkRmSEh4TjBqNGhXTCtETGhrdkwyTXhXeENCdjlrOEhqR004R3Z0L3c3KzJ6KzAxOEcvalJZK0VQaUQ0aHVJYkRWcmxJN1RVYk5wQWtUT3dBRXNiZkk2SGFRMkFEMUE2VjRqL0FNRTB2aE5aK0NQR2RsNHcrSUZvTGZTdkQraHZMTmZYRVJaRGRTc1FGWGo1c0RrWTc4VjlJZUliWFRmMnRmakhwOTlwV2lHUFF0SXZsa1M3ZTFBTnc4YmpQSTRIQnp4MEhhdmtNYkhEMWFzNVdQY29PY1lJK3MvaDFvbnc5MERTQjhidFM4TGJkU3ViaWFXNjB1eUxCSmRRYmFoY1o1VldCWmdSMHp4eUs4dytNbndiaDA3NGY2ajhkeElML3dDSVBpaTVLVzFrNnFScGxzeUZnd0Rja0E0WDVkd0lJeHlhVWZ0eS9CalJ2SDBmd2xqMVovTnRaRmptdUk0UzhDeXFRT1dQQUlBKzlqbk5lNWZGL3dBSi9EMzlwTDRGUS9FclVmaVFmQjBudzJNdDVxTjhza2dodTRKWXlmSkc0cXFObFI1Wk9TTThjWnJ3Y0xQRTA2L3ZMME42M0s0SDROZnRiL0ZMNDgvREw0c0pKcVBpKzVqZVNOcHJKVW15cXFXeVFSampudDJ6WG5QaVg5cVh4bDR4OE0zZWk2KzBwbG1oV09HV0dZcXFjNWNrZjdXZTFld2Y4Rk5yZXo4VytNTlA4WWVIYm8zRnFqelFnSnR3VlloMWs0SjY1d2ZURmZKcm9WSUJIYXYwUEJ3cDFzUEdUV3A4L1Zjb3phUFlmMlcvMmkvSGZ3UDhkSjR3OEo2ckY1akFSM2RuZVJsNHAweU92WEI5Nis2NGZpUCsxYisxYjRFKzFXZW5XbzB5NGFPNGxzN2U3RWF6K1h5aU83YzRHR08zcDBKN1YrYVh3N21paDhSUkxLT3JER1RqdUsvWW45a216OERhZDhFOUg4TjZacVMyMHM5c2t0ektqQWIwMkVrNUhJR2NnL1U5YThMTy9ZMEt5bTQ2bm80SlNxVTdYUEZQQXZpbjlvbjRYZkZEdzdjL0czd1cra2VIb0x4SUk3cXhaV2lqZGhnTTdqT0R6M3I5QzlHdk5QUGh5SnZPYVNORVErZDV1MVcyamR0VTl3ZTMwNjE0cCsycjhUZmdEOEYvaEo0YWoxclRQdGtPczI3VzJwNmNJbGtsTVpYaWNET2Z2WlVjRGhRYzVJck4vWS8vQUdvdmgvOEFFRFFyYnd6cDNpczNQMkFGYkJwWHhONU8xdG9JSjRkQVFNOS9wWHpXUGhQRlVsVlViSG8wclU1Y3R6NmswWFM5RzFpTzM4UncrSDRGbWlRZVhjbTJWWkY0enRKSEIrWEp6bnYwNXJidWRRaG0wOTROTTJOTzhSOHBaanRYZHhnbmozd01WeHZneTgwZTIwWklyVHo3a3duZExjM0RiOTdGY0tPRGphT250MEh0dFhPcTZiZDNKdjJ2b3ZMTWIyc0xTRFo1emtOMExaT09BTThkQlhpVzExT2hxeHJmRC94UzE3Zk5wbXBhYjVGM0hhRnBJRmNNTnB3ZHdZQTltSno2NTlxNmo0akRXUEQvQU96OTRnV2EyQ1hVMXQ5blJWSnp0a2tBSkpBeUR0STUrbGVmYXNrV2d3NmMybWhWa01KUko4c29RajV3eHh3YzU0OXE3TFQ3ZEw3NFZlSk5FaE54TGYzbG5KY0VUU0YzYVFBT29CQnhnSGpGZE9GNWFlTGhQelJoVlRsUmtqK2VENHdYMnFXdjdUSGltYldpOGR6L0FNSlJjbWNpUWcvNjA4alB0aXZvSFNQakI0VDBIUlMybWY2VnAwdGxGSGMyZHdvWXhPM0JkU09BY2M1TmN2OEE4RlAvQUlTWFhoRDQydjhBRnZSb2kybStKUUh1Sm9sTzJLN1VZWlNleElBUDUxNEhvL2oxNXRMT2kzRXhFVDdSa251R3ozUHZYMytKcHpsTlZJbkRoYWxOMHVWbjB2OEFFYjltRDRTL0huUUU4UytGaXZtelFMdHZkUEdaTGVUbmNzNmpnWUJ5VGpIVG12blBYZmhMKzBIK3lsNDNpOFllRHRRdkluMCtmekxiVnRLbEk0VnMvT0ZKSUhISVBGZW4vQnI0azNQZ2VjemVHZkVza054RXVXbmpmRzhuQklQYnFCbk9hOVgwUDlvdncvNGp0ZjdFK0tHaFJEenVKZFJ0WTlvS2s5WkVQM3M1WTUrbnBXdERNT1gzS2hsVndydnpRT3E4UGY4QUJjalh2MmlQaDNwUHdxL2FPMFdOZGIwNndlMHQ5ZWlYOTNkT3hJRFNqcXJmTVIxd090U1hrZHJZNnlmRWVrYW5EZFdyRFR5bHhidnVXUnlwM0JXSnpuT1NUZ1pPY2NWNGgrMFIreDU0TzFWWS9pRDhQN21DM3RybVFNL2tTYjR5Q1QxNCtWdU03ZXRlNi9zMWZCdlh2RVhoS3o4SjJ2bWYyZHA0akJRRS9PeUlUd2NjQWtrODhqUE5SaWZZS0xuRjZCR1UydVJvL1I3OWx6V1V2UGg5cHhnaFNja0JVaVp5ck5oY1o1Nlk0eWNkNitoLzJVZmhqNHh2UDJpN0R4dnF1b1hscmFDeUt6YWJIcVBtV2M4bkcyUUtlUmpkeVJuSkZmTW53TzBUVVBnNzRGdGZGVndaTG9XelJsb1MyRElHVUlRb0pIemZod08xZmNIN0ltczZ4NGkxNnl1cDlQdExTMUFPWUk4Tkl6N1ZPZDM5M25QRmZubFpRZUpkdTUycHpVRHd6L2c1RDhXUjZmOEFzeStFL0RVYzRTVzc4U05Pb3huNVlvems0UFhHYS9HcjRaUTJHbzZoNGk4VGEzY1cxelp6UjIra1cwTWhVelJYQmtES1J4MENJMlRudlg2aGY4SEhmalU2bjQ2OEYvRGJ6aHR0TkNudW5CZitPYVRhUHh3djg2L0wvVGZEdmhqNFUvRTZId2hxWHpMNGc4UHBlV2trdVdKdWtabFpSM3p0SXh3RFgydVRRYjFPS3M3VTBqZ1AyaGRFazhPK1BydTNrUWJkbVUyNHdWOWZyWGlDMjAycStJSjlWTVJDUUVrQW4zcjJiNDQ2RmZ0NHRrMVdPNW13d0JaSFlraGVNRDZWNC9xV3JMNGMxa3l1UjVNcDJ5NDcrcDVyNlNSejA5VHIvQ3VyeWFvalJ1cHlnSUJBNmdERmJQaFh4cDRwK0dWMjNpVFFOVm1nVm5aSkZpZitFOWNaUGZwZzA3d040UmZUZkRjdml0WVJOWjNBS3BJdk8zUElCL09wYjdTSUxyUUoyVWJsSUp6MkI2MHFjbW1iVllYalpuc0h3ZjBLWDR4YWJkNjRpcWJ1Q0V5aVJtd1N4d2ZUQnllbnBYbi9BTWFKTmZieUpMdUk0Z2wyTVFBQmxSN0d1OS9ZV3ZOVEdtYXpwZHRjSGN0cktReDV4Z2RBTWVnckU4ZG1hYlZieXltaERJOXlXSWJCTFpKQkdUMnp6VzlaSnhUT1NqZm5zWlZ6Zld0M3IybTZwRkFkc3RrRmQxUEdlblN1bzFPMnRaTk5OM0ZNcFVCWFViaWZtSFllblVWd1BocTZtbGxhMHZSbHJVbFFQUWY1elhjNlMxcTluY2xpQ0RId0NUbkhQU3VPZGoxS0sxSTU5VHZack9LQkpma3Q1QjVqREI0d0FEK1hITmJQdzN1N094MEhVUE5LSVduSkRFZmV6a1Z6Tm5HekxlMjhkd0VFa1JDYit4SFRJK21BS3Y4QWdxM250OUt1bDFOdDhja1J4SHZ3UXdIREExaXREb3FTNWtZZmpqVDFPc2ZhMGpBWjJ5RkhidjhBMHJsdkVlclFXSGlsN2FTUUF2Q3UwODRydVBGalc4VjFheEhjclN3SzI1eHlmcWE0UHgvYlJ0cUNhanNHOVFBQ1IxNTRySGx2VU43MnBEZmlkNEU4QmE5OE1MdldsMTYrWHhBaEJzN09ESGtzUGw0YjhQNjF4SGc3UXRVdmRDR25hallTV3BTTm5obkJ3V1pWQjU5djU1K3RYL0hYaWUzaThLcHFjRnlZYm0xbVhmRTJmbUdQeU5lM2VPUGhCZCtIUGhGNFc4ZWVHTGMzVmxyV2dDNHQ3aUtMNVZmYXdkYzljL04raHJwcnpkS2xkSG1VWUtyV3N6anYyT3JqOW5YVy9penBuZ1g5b2FLOTBQVGRUdkk0RThYNk5lR09iUzVtS2lONUVPVWROd0pPQjZlblA3QzNIN1BYeFA4QTJldmdENHkvWnA4VmZFcUx4YjRlMWpSWDFqd2xxN3I4Nk5HY3NDR1lqY3lrSEs1em5pdndvOFVhRHFYaDZ6M2l5Y1NQOHhQS2pna2pucjZZNzEraUg3SmY3Ym54Qlg5a3J3UnJueGMxeWVXMTBMVXJ6UU5OMUtkeS9uV3ZsNEt2MExGUTRBeVRrS2VhOUxMNjhhbEhVOHJNc05LbmlFNG5oMnFhTmZXUGlDNVNLNUxLcnQ1cXQxSHQrRmN0b1ZyTnAydTNnVWdxMHBKY2R4L25GZGFtdDIzaVB4anFnMGk0UjRENWpSeVJrRVkzSEgxT085Y25wa2Q3WmFyZXd5WmVNVEhCYjFKN1ZoSnJuME82Q2Fncm5oR3V3M1MrTDNuR1FHVmhqSGFybmdud2kycitOYmlFeXFFTmkwckJ4MzRyZTByUUl2RS9pK1d4dWxDQ0sxWjFZNHoxcWJ3Sm9OckI4Vk5RV082VnhiV29DZk54a3NCakdLOHpLbTNob25mbTk0WXFTUjZONHI4VldFM3cwdHRBUzNXRjRrS0srRkc3OTBNNEhZOU9mYXZJUEFWbjhPTHU0MWV3OFkzODhFeHRpMm16eGpLaGdlUTNwa1lyM3Y4QWFKOEJ3eWVDdE4xQ3pnRVpSaXI3SXlwZFNnSXoycjVZOFFXbW82YnFjY1FRb0pwVEFEdTdFWUpIclhxMW9ua1lhUzVEZStJOEVHa2FEYjJjVXF0Rktjb3lEaGhqclhuVnpyVnJiM01XVWU0Q2o3cWl1bzE3VXRPdlBBbWx3cGNscnkxTEpjcWV3eng5YTVTejJyY3JPWThEY0RnZDY1Wk82T3RKMzBKWS9GNnkzWXRrMEc0VlpHQXdXNjVJcmU4VFdsbm92aXVMdy9hNmJQQTBWdWkzalR5N3YzakRJT2VNRGtVdW9XZHViQzIxRW9NNzFPQjJ4eVA4bXUzdnB2QXVwL0dHMDhWZUpKRWJTcmk1czJ2cFJodHFSZ0J3Y2s1QjRHQldjVkZsejlyVGF1enlxL252Tk8xTWVYY050SkFJVnVleDVydGZEVWx2YzJTdTY1d09wNmpqUDlLMWYybE5VK0YzakQ0cDNIaUQ0WVhNYTJOeEVnTWNTbFUzcUF1VkRFbkpVQStuTmN2NGFubWd1cE5KVW41RTVZbXVHdkJPVmtlbGhxc2tyc0xtdzFEVUxXLzFhR0FtQ0I4RnNkS3hZNzZGVldTU2NFNCtWVDJQRmFVdmkvVXRKanVkQmhZQ0daajVpa2RmZjhxNXRyYk00UXFjNHl2TmQxS0ZxYU9Lck55cU0wMkp1Z0cyblBHUlVjMGpQcWNQMlRLdEcyMXNVbGhmeFJPcjdRNFE4cmlyVWJXNjZuY2FnSXRxeURLREhTdEZHeEVub2IzdzQwTVhmak8yczdpNldLTzR1Ukg1ak5qQlk4RS9RMWkzMmdYMy9DYTZrZGFuUG0ydHpJamJpRGtxU09uWVlBL09uYWQ0am5nMWlPS0NUWXl5SzBrdWZ1a053Zndyb1BpSnAwQm1nMXF4dXZPaDFDSVRtVVo0Zkh6cVQzT2Z3cHI0akhXNWwrRzdLVzhGeE8wa2FxdWNocXpMelpjWHpCWW13Q2VSMEpwdW5BekM0dUliby91VC9xc241cXNUc1dSR2pYYngxSS9sV2lSbkszTll2MjlpcytuL0FHcHBXT3djS3g2ZTFSSk5xTW9RMnhKQ3VHK1laNmRQclZ0WnpOcDBLMjhXMTFHMlk0N2V0YW5oUk5CdGZ0VWV0eVBDSlk4V3M2TGtLMlIxL09sTFliU2FQTmZqSHBhMit0ZmFaTWJ5aUJnU09Uai9BT3RYcmY3RXZqUzI4TGVJL0Qyc0pLQWRMMTJOcCsrMk10MS9FTWZ5cnlyNDl5VzAzakM0U3h1MHVJRWRGaW1pSTJzTm5hcGZnSHJIOWwrSS9zYzB1MUx6TWFaejk5UmtINjF4WStuN2JBdVBZdkN5OW5YUit0L3hRMFJQRmR4OWthNkVWaEU0YVIxT1RJQ1R4OU1ZK2xjcWROTWVueWFKYlRUUmlHSU9qcEw5NERvQ2ZlbWVFL2lMcWZqTHdSb2VxM1VRRWQxcEVMUzRQMzVFRzArL2FyVXQzSzhraVJJUGxRNWtQVmV2QXI0bWxEbFo3ZGJVYjRrdU5HOGErRUY4UGF4bzZSdzNNWGx0RStDRGpnNDkrdk5mRUg3U1g3QnVvNlZxazJ2ZkR6QWdsM090c3c0UE9NQTl2cFgyNXJ0Mmw3cFVSc3BZVmtTVlNva2JCWVk1Sjlxc3g2QmFlSmJMK3pKNEl5aGJlV1U3dUFDM1VmWHBYdVlYRlNveDNQTHFVVzVYUitUbC93REEzNHhhRmROSGQrQ0w4TW5CS1I1SDZWcytFZjJmZmpkNHVLVzFqNGJ1WW8ySVBtM0RiVkE5ZnBYNlVmRUg0UWFSRGEzT3VQckhrcDhza3BaY0xzSEE1UHNTS3FlQlBDL2hxNGlZYVpjclBHcStXckIrb3gyNzlUWGU4eVVvM3NqQnhsSFErZFAyZGYyUjlBOEUza2ZpTDRqYWxGZVhRRzZLSGdMRy9HQnoxK2JIUGF2cGFQd05iWHQ0ZEV1TlZTR0dObGFXYUJWSllNRGtjRHRuSFBwVlB4WDhHWUUxSzExSkpwRWlFNGFWRlRQUWdZd2V4eFhlK0hQQ2xsYVJYSGlHUzRmZkpGOHkzSndRdU4zUThuMHJneEdZVTNIM1hxVlN3OVNjN3ZZVFFQaDdhTmR4YUxiYXpleXF0cUpFYTZ3UE1jWjZlM1BmaXQ2Znc3cUduYWE4OGRvdThUTEdvQkF5VGxTM1RweFZQUzllVyttanViZWZDUkF0R3l0enoyK25lckhpaS84QUVtcGFWY25TWi9NYmRtMlFIRzdCR2Y1blBjMTRGU3JPck05U01GRkZxYVRTN09EN0hwOFN5enhnSXlLbzRQT1c0eDFxcDRvdU5ZK0d2aEc2OFM2VFlwY3pUNmd1bjZlWno4a1U4aU0zbVNjbkFSRlk0NzRybnZnZGVYT3JlUEk3YnhlN1d0bmJxWnA1YmpqTzBiaU1EL2dSNDU1RmFYeDM4YTZSOFVQMlNmR2N2aFFYVVVsdHJGdkpQYnl3R05vYmRubGhFbzVBeVZiOHdQU3Q2V0hjcXFVdGduVVVZT3g4SC90SS90T0xCcVY3cFBnRXBxVHh5bVRVZkVGNG04U3lnbmNRY1lPZi9yZHE4SjhEZkhMVy9DMnZQcStoK0w1Tkx1cDVOMDdSb0doa2JQVXAyUEpyVThhZkNIeHhmRzI4RmVGSWJxOXZyKzZLRFQ0WXNTVE12eXF1T3JjN2lDZU1WNVBxUGdyeFRwV3ZTZUd0VjBXNXRiNkNZd3pXdHhFVWVOd2NGU0QwSU5mYzRiQjRWVWVVOFdkZXFwM1BvU3ovQUdrL0V1cytKTFhVZGM4WjNHczM2TCs1WXY4QUpGZ2pHRjZEcHlPOWNuOGFMRFVmR2M5MzRwMW1IZGQza3FTU2tnOTg4ZlFkUHd4VmI0ZWZDYWZ3N2JSZUl0VGtEU0FaQ0QrSC9QTmIzaXZ4TmF6VzM5aFNRb2QrVlZ5Y1l4LzlZNHE2Vk9uUmRvRTFYS29yeVBOdmgvOEFEclNieS9iVVBFVWpHMHRsTE9nT0RJUWVnOTYrNnYyUS93RGduZHJYN1JIaFQrMVgxVFJ2RDhMd2hySzFrdGk4ckE3ZGhkOGdMa2tkSytFcmpXdFNHdWpTNDVRSVRLRktwL0VEakg4cSs4UDJUUDIyRDhLOUJ0ZEU4UWFoL1oxM0Nxb2hsazJCeGhSdlU5Q01kajFyejgzcVltTUU0YW11RnAwK3A2WCt5OThJZkYzd0c4U2VKL0FiM3NqWFRUbU5Bc3BaRmFOOXBaYzlSZ2dqSjU2ZTljaiswSjhDdkJud3IrT2ZpRFRkRzhaLzJicjl0Y1IzV2oyOTFlRXgzMDhxSktVWnR3OHFRRGNldlBGZXRSZnRpL0JDTzZYVTdXOVhXcjltTThWcFpIekduazNJZjNqZmRWRGdFa2NnWnI1Ni9hVThjNlg4Y1BIVjU0azhVTkpMZGFnLzJqVVo0ZHlMYlhQbWJWUkdCd3lLZ0NqMStocnk4TFJuVWs1U1ZyblJPYWl0RDJhNStJMTk4VVBncHBudzkrS1hod1hsNXBGeUpQRCtvZjYyV0NOeWQ4TEVIRHF3K1lET000SXhnZysyZkJuNGQrRFp2aFlmQXZqQzNmOEFzKzdFY2dNSkcrMHVBZHNOeERrQmR3WEljRS9PaEk5TWZDdHArenplZUhyYTN1THI0elNXOGN5bzRpdDd4d1FEa0RiOHg1R1BUNkN1NzhKL0JENG1lS0xWTGJRclB4UnJrYXJHeVhNMTNKRmJzdWV1NXlPT3VDS3FWQ0dIZDVWRUNuS3FyS0pGKzJSL3dUYlBoTHhCRDhTdmhkcU9tMzB0eEtzMW9MTzRVUlhoVWdGWGp5REJKMVBQQnhqTmZKZmp2OW0zOW9mKzBKdFZ2L2hiZlp1cGk1RnNFWmVlZytVNC93QWErL3RKL1pRK1ByTmEybDdlNmJwbG1TTnlOZlNURUVISHpZNjhjajNydnRDL1lnMEMvdElvL0dmankvdk55QWVYWko1U0ZoMkJiSjRCL0RtaVdlNFdndFpYTFdCcVZPbGo4cGJmOWozOW9IWDFXSlBoOU5DcmtZYTZ1b284YzQ3dG11MitGSDdEdXMrR2ZGTm5ydnhnbnNScGNjditrV3RuZWlTUnNyOG80SFBQNDhWK3B2aGI5alg5bjZPM21lVFNMaTZhM0pqZHJyVVhZN3h5T0IrUElyRWsrRmZ3TDE2L2Z3OTRhOEVXVnlGa0NQNWU0bFdIUFgyNkErdFpMaXFFL2RqRjJLL3NocFhiUGlUd0g4Si9FdndhOFZyNGgrRkh4Tld4U1pGOCszbC9lUnV1N2xRZWg2SEdSbkJyMUVhaDRMMVM5c3JTVFhwMzFQVUx4YmpWZFd1R3o1c2dPVlVja0xHQXhHTVpCSEFOZlpQaDM0S2ZzM1NhVEhGZC9DL1RVdW84SThNc0orK3ZiZG5yL2hXdGMvQUg5bWFIVGhxVGZDM1NTOXNGa0NwYjRZalBzZTNXdVgvV0REUXE4L3NuYzErb1RjZVhtUHlxMXI0SGVKTks4VTZuY2YyQkxMYnZmVFNRM0MvdkRJcGZJT0R6bjJJSFNzYlVmQ1hpMjkxUkxUVGZDdXBUUGE3bGlqK3hzY25KSi9EdG4zcjlYdGErQTM3TnV1YTNMbytqL0RXQ1F4cUpMdTR0bWtSWWc1QUdTVDZjOFo3aXNUeEYreEw4THhMSmZhWDRpMVRTSEt0dkVNNnpvaGJnY0VaNUIvUTEyeDRxb1MwbEJveGVWeld6UHlpOGMvczdmRWU1c0pQRkY5NEMxSFQ5UGltQzNMaUF0czZEY2U0SFBYcHpYcW43TjM3RlduK0xkT2g4VjNHclJyWWlQZW5rTWp2OG8zYm01eWgzWVhHRGcrdGZlRnQvd1RuK0lGL0V0eDRSK09OaXptTkNWMUN4ZE1qUFFsQ1F3QXgyeHdQU3VFK0luL0JNejlwSFJKa25Yd3haYXRhVzhjcCswZUc3bnk1WEdjZ3NGMm5QT2VoeVRYUXM2d0dKanlLcHl0OXlIZ3ExUFcxeVA0amFKcXZoWDRjYVZkYU40ZGpPbTZBbjJmVXRIUzN4NVNoZ3dtemdaQzVBT0FWejdHdGY0YWZFNkxXUEJUK0dmQXVuMitreVg2N2RRMWJQeXd3YkFHOGpqYUdPN2ozem52angyZndMOFlQaDVyRXVsUDQzOFE2USs1eGRXZCs3U3h0dU8wS1VsL2g0d1JqME5Kb3Z3VzFYWHRJamd2OEE0cHNiYVpCTE5wNncrU3BKbHdkKzBncVFUd2VtUGFvV0Q1MWVNazBKVnVYUnF4WCtIbnc1K0Urc2Z0WjNrV21lSVpKTkpzTEcxazgxV0RKTE03bmRra0FtTGVNazQ2NTZjVjdEKzFQOE94OFR0YjBuNGFhVjhWYnJTL0Q1MFNPU1JMWEUwVDNheU9vZVFrNWxWQXd3Q09NOUJYejFxeWVLUGh6NDRpOGIrSHRJYTl0cmUyZXkxSzF0V0tOSmJCaVE4Zk9PTS9qZzE2LzRJL2FtK0QvakRTN096azhRMnRwTlp5SzBjTi8rNWFCOERkbEhHQUFCbkk0eVNjVnk0dU5haldVa3JvMXB5alVqYTlqamZpSi93VDYxYjRUL0FBei9BT0VqOFZlSDcveEI0VjhRT0xlMzhXSkVZVGEzQlViZDBXY0FFZzRZbkJ4K0Zmbng4WC9CSGhYUlBFTjlvc2x2TFpYbHJNNmVaSGdwSVFSMVhKeGtjNUI1elg2M2Z0Vi84Rkh2QzJwL3M4YWYrejM0Uk1GNmdsdDV0VXVZeVdqaGhnYmNpakhBY2s3dHd4eGl2eXorTnd0Zkh2eHR2cnFDUllvcnVmZkpLNDJZWUtTZUR6K1pyMk1veFZhcW56S3lQUHhkRlJlaDQzcGs3YWZmeFhBNDJOazE3djhBQjM5cW40amZENk9PUHc5NHZaclpNS2JPN081UXB3TUQ4TWoyelhqZmlYd3JkNlpMSktpYjRsSi9lTDBJNTVyQ0x5QWdCaU1kSzlTdmhhT05qN3hqVHJTdyt4OVpmRlA5cStQeEVsdjRqOForSVlyeldpcXBiMmR0aDRyV0lmTnM1T0FwSi9ERmRCNEF2Tk84UldjSHhXK0M5ODJtYTVacUpMN1NvM0lGd293U3dBNlo0L092aXpjNVAzcTlQK0JuamJ4UDROMUd5djhBVFRJcXgzS2c0WW5lckhvUjB4eGlzWllHaFJ3L0l0aTQ0aXBVcWN4K3YzN0hIN1ZOcjQ4OEtXNThSdUk3dTJ5SjRwRXlGZFZBeU9tZWY1NXI2VW4xWFJmRXRscHFhakRFc0dKSlVqbGJhcU9laDR4dHlCd1BmOGErSlAyQWZoNy9BTUpKSjRuMTJIU2hJWVpvMnRZMkJYTWhBY2djKzFmWEhpYnhoNFcwbjRjVGE3cWx1UEx0N1JYTmxLVWpJbVhLckQ2Z0hJL0E4OWEvT2NmaDFUeERVRDNxYytlQ3Vkc05MMUZOUFcydEpvNzE3WkZYeS9OTzFTQmdxVzZFQlRuQXJaOENhMXFsamVHSFZiWHlwbmFRUGtERzNJNys2L3hmaDcxeG5oNzRvWG1sV002YXpvRVVDeW90NUliREpYTEtkNm5CNUs4TGtjRWc5YTAvQy9pNjQxdXdudXJ6U3Jtd09aRmhTNUl6TWdYYXJnOVZISS83NnJ6WkthWnBaV1BLZjJxUDJEdkEvd0FhL0RXdmVHdE9VVDIxMGpUcnBqNUwyMHhBS21Od1NGSXljQTErTi83UWY3R2Z4WCtCL2lhL3RFMFc2dnJDMG5lTVhNRnUyNVFPekRINGZoWDlBT25DUFVKN0c0c1owRHV1KzR5ZHl1Z0orWnVNRWdxTWR1TTE4NS9IalNyYjRaL0VXWFd0ZmlzdkZFR3B6U2tXRThBamVKeVFlQmpqYjFCNjV6WDIrU1pxcThGU3FibzhURlllZENmUERZL0R6UjlTOFFhVGRlV1JPckFzRmpLa0gwSTZmcFhjK0hMRDR6ZU4vS3NmRGZobTluZG5WZk1GdVZBSVBIekhvT1JYNmNhdCt6L0I4VWJpNytJUGhYNENXRnBIY1M1Z01WcXJnWkdkdTdqNXVjOUR3RGs4aXR2d1QreGo0cXU5UnVMaldZWTdTTWlUN1BESEVRR3dCeGpqalA0MTJZckhZU2xOOHlWeTZNcTBvYUh4YjhJZmdoNDgwSFJWMC94RnJzMTdxRnl3YVBUbzVtTUZ1Y3JnOG5rNTdqcDN6WDZSL3NmZnMrMy9BSWIrSHF0citsVzR1YlNWa251ZnRDNGtrOHNGeHdEZ2p1ZStUaW1mQ1g5aTd3L29maUQ3ZnFGeVpGRXZtZVR0d0MrVklHTWNqOFIzcjZNOEtlSC9BQXJvM2g2YlM5TVNDSzB2TGlaSFJXQUJZZzVISG9RTUN2bTh6eldOU255VTlqcm9VWkoza1ZQaHBvK3RKcXYyanhGWjJIMk9PUS9ZYksxblp3aTVEYm5iZ054K1ZmWG43TGVoRzIxOXRTaGVRV3pXWjhtM2FVTUVZOFpCNjg4ZTFmSjNoMUI0ZGlTWFVYSzIwWUtLeXhsaU9tQ0Y5Y0VmbFgwajhOL2lGNGYrSDM3TnZpMzQwb3NrRWVuK0g3dTZEWEtCV0FqZ1lnWXlNRGNSaXZuOE5HVlhFeHVkVld5cE5INU0vd0RCZWY4QWFVMHY0aC90bCtKaDRSMVNPNnR2REZyQnBnZU9RRlRMR0NHeDlIWmdmcFh4UjhUL0FCTi93bVhoaE5ZdWRSWjlkMG5GM1kzZXdxUVZWZDBYeWprSDY4MVkxL1VIK0pmanU4bTFHVjV2UHVwZFJ2Sm1Za3NSdVloc25xZXB6MXpYVCtCUENOejhSZkQ4MTIybXhXOW5FQ3RtcUlBMHpBS0NTZVBsOWgweml2MDNLNkhzNmE3czhiRlRTU1hRNXF4K0lmZ0w0aGZEODZscVZ1MGVweUlmTVRZZnZjRGdEdG5nMTgvL0FCVTBJYnA3cTN5UXJIQ2dZd08xZTgvRmo0QTZyOEsvRU1qNlBwN3JZWEVZbGlVQXI1ZWNaQXljOWNtdkh2SDk1WnI0ZkZvU3ZuU3lZM1k2L2orbGVzNHlUMU1LY290WFRPcCtEWGkyN2I0ZUhSR3Uva2VJckxHeHp2eGpIWHBXL2JMY2Y4STNQQkZzR2Y0bUFKeDcvblhuTVdpNjE0R3M3TzdKMkpQRUR0RERIcmcvcFhVK0Z2RXMrcTNxMjB3L2RzY0tpamduSTU0OTZ3ajdzOVR1bDcxTTltLzRKMi9FcncvNE8vYURzUEJQaVc0Rm5wV3VPYlRVcjZLM2psbVJYSVg5Mkh5cWpkM3dTQVRpdGI5czc0VitOdmcvOGJ0VjhPeVhDU1cwTjR5b1doQTh5UGR2UmpnWUdWT2ErZTdpNXZmQUh4THROWll5UW1DN2pjQUU1VWJnM2F2c3I5cS94K1BqMThNdkRueFd0OU16SWRGdHJUVlptUEx6UmphSDVHZVZJT2NuTmRVbnp3UE5zNmRaVzZueTZTc2VyZmJGT3haWWZuVG9NZ1pycWZoM3JGbnFOektidzVSMUtnZE8rRGptdVluc2Y3UWxnRzhBeHpFeWRzNUZXZkNwR242NGxrU1FTd1lkY0RKcmlucWV0VGRqc0x1MjhIeGVHZFd0TlR1dFppMXNvbjlpaXlNWDJVOGpkNSs3NXg3YmZXbmVIaGMybmhXUFVMbEMzbHVZM2xIYkkvbFdmNHRpVjlmdDloM0IwQVpzOGNHdGZ3WnJkam8yb3llRi9FNjQwclYwMlNUSEdZbmJnTVBvVCtsU29seWtZM2ovQUZHeWxPa3lTT0N4ajJnODg4OUs1L1hiRzF2UWwzS003RGwxejJ6bW4vSERSTlE4RGE5by9nN1dWWkxpMzFVb3JFLzZ5RnZtUng3RWQ2UzhRTGQzVmtrdVRHb0pVSFBCSHBXY290TTNoTlNqWTgvK0kvZyszMTYxdUpkRjVnWUR5c0E5Y2M4ZlVWNlIreU4rMWZCb0hnaWY5blg0cUo1K21HUm0wZVdjZjhlNU9Cc0J3Y0FuT2F5ZkRVWlJIMC9VTElHQmllVlhIWHZYblh4MCtIbzBpNWg4UmFGOGlPdzVUcm5xRFdtbFdIS3ppbEYwNTg4VDMzeGxvdmdxL3dCQ3ViVytlM1NLQmxjM1ppRExHdjhBZnhua2M5UGF1ZThRNno0RzFqU05KK0hQd29rdm4wdTN2Sk5rbDNML0FNZkJ4aDV0b3dGREhoU0JuQUc3QnJ4L3dMNHorTVJzRG9VR25pNHRMaVB5cFB0a085UXB3TW5QY2V2dlhyZmdEUjUvRDF6YlNUd0NTYnlnR0NEQ3FPT0VIWWNacUtGR2RDK3VncTFhTmRxNjFPbXNyZUh3SFllYnA3bFNFMnNTMlQweCtQU21lSHRadDlYc0xxU0Vaa2FjQnpqdWM5YXFlTzlSTnpDNGJLTUYrVlQxL3dBODFEOEc3S1NUVGRSTnpHdzNYU2Jkd1BQWGl0NFBVbWVrVHpueGhPbW0zME04RXBSNUxkZzBpLzUvQ3M3d0JxTU5oNGgxclZKN2x5c09rTGNLcUx1TGhabzl3NmVqYzA3NGpYTnJjcmFpMW5Iekt5NUhUcHptcVh3ekZ0YytNYit5ampFb2s4T1hzVEFkT0UzRG5JN3FLNHNxZit6Uk9uTy85OFo5ZmF0cm5oUHhaOEt0SHVaUlBiMnM3Z1BkTTRMUi9LTUVyM0h2NmZTdmx2NC8vRHUvOFBlSzRKVFB2aGVVUEJjUktOcnFjbklQVHAyNjE3SjRCMTNWUEUzN0x1b3lXUUJuMGlaY0x2R0FOb0JPT2VlMlBhdklianhQcXRyR0lmRzdQYzZkTE9VbWhrNThyZGcrWkdUOTBpdlpxNnh1ZUhoN3FUUjQxY1QyNHRIZ0QvZWtPQU0rditUVVZ2R1VsWEp5TUE0clYrSVBoWi9DV29Hd3p2VXlueTJCenVVOHFmeU5aMXFGa2xqSWtHNGdEclhESldQU3B1OGpmZ1NTOTBoa3VtSVdBQmh6aXNPWFI3aGI1SHk4c01oNXdTT09PSzZLU1Bab0YwaVkzRURMZTFWclhVZE10ZkRqMkY1YXlOZlNYY2NsbmNoc0xIRUJobFA2Vnp4azFjN3ExT01yRHRCMEhURTFBTkhDVGdnakp6elJEY0pwM2pPNFYzd0N1T2M4MW9hUkRQRGVKS29CVS9OMDR4MnJNdmZLYngzSkpJY2dybmtjZEs1NFhsVmR6YWFqQ2tyR1Jya0psMWg1VUoyTTM5M0ZUV2NjTFgwZURuQTU5dXRXNzdVbzd5K1pJUU5nYkFCWHJ6UWJKWTdneVFwZzdlbU9wcnZpOUxIbnpTVXJtTzhNTU03aFJqNWpnNHF4TE04M2x4UXdub0FSajNwNnh3eUh5SmJCMWZQTFo2RVU2YTluaWtTVld3Vk9CZ1Zvbm9aYzZaTllhSTl4ZEpDMFpWMkk0UFd2UU5ZOEgzV3FmQ1RWYjZ5Y01kQldPN2tHYzRnZGhFeDZZenVLL25YTldjVi9lelFpM2hMM0RxTmlBRURBN24wSFhtdW0wclIvRlBqVHcvcittU1cwZHRjeTJLUVdzVmxtT0tRSTRMSXd6ODI3ajhhTlNIS3g1djRZdUliS014TWZtYzVPT2NqaXVndGJTMTFESkpHMVJ4dDlhNVI1WmJYVXhwOXhhUEZMRzRTNWpkY0ZHSFlqdFhWYVdrUGxzc2JiVUk0eldpYk1kWEs1WTAyMlpaSDhsbFptUWdxZWxXWVlCZVFvSlFUOHUxa0l4bkZRMll1bzJNMENuOTEvRUJXNW9temJidzM5Z3JvWlBNWXJ3WEI5NmxzMXZvZVllTHZCMDl6cXNkb28ycE80OHM0NC93QThWVCtHSHczOFdhMTQvaHROTWdadnNWeDVqc000RzBqQStYT1N3NEZlMVMvQmpXUGlqNG90N2JTbGUzdGcrRmpSQ1hmTFl3dkhKN2VsZlpud0IvWkU4SmZBandyRDRyOGM2WEhMcVppODNUOUtrQUxCdG94TktDT01FY2l2TngrWVVjSlRjVzd0OUM4TGg2bUlxSnJaRkQ0VFRSYU44TzlNOEphcEJKRmNKWXFITHBnd3VXUFhQTmRmWXIvWmRxUE9uQkxZSlluZ25ISFdwRnRvdFZ1cGIrN2kvZlhEbnpWWlNPUnpqNkR0OUtwWDJuSnE4andmTThkcmNiRkNIN3cveUsrV3B0U2JrejJLcWNYWWxtZUNHM2tsaXRJcEZjZ09HVGpCeDM5OFZlMGhJdEt0R2FMTUJhUEQ0UEh6Y2NEMngwcWdscTZ4RzJTTXZDcFJaU0FUdDVJLyt2VTkyOTNjMlpoMHFFU0tXVWJqajFCMi93RGozV3FuVWlsWkdTanJxVWZqVTF6WitBYmx0UjBpUzhFcUpDSW96amZrZzl1bkpySitCUHdvMXZSOU10ZkVzMm9MYlF6bENkT3dUZ0hHTWsvN3VmeHJwUEZONCt1NmJEcDl6TnNVb0NXVmNiaUF1ZjVWQkg0dXRkQzhPUTZMZTZsQUd0UnZWUzRHN0dPT1QwNW9WZVhzSEZJaWRHRXA4eloxbmlQVzlFOEkzZG5mNm5Jck85d1lMY01vd1h6bko1NmZXbTN2aUgvaElieTNiVVlGa0JSb3ZMajZINWUvUFBQSDBGY1pkNmhwSGpuUmZKdTcwT0lyZ1BETjVuSUs5d0FmN3RYYmFLKzBpM3RyK0YyZU5aUXU3T0Njakhya2MxeVFqRzJ1NTBSa2xvaTlOTnBjTWsxbnByQ0ZFTEtjTGtFNDdkZWdHYTUyUHhCNCt1N2Urc05GbGtGd2tMdEVydzVDaFFPU0QxeXY0OEdvL0d2eEM4TWZERFQ1QjRwMVpSZEpJNWpqeGxsUFFqR09uUDQxNTk0UC9ieDhMNlY4U1VsWFNnTGRGTU1rOGdDbkhZNVBIVEl4WFZSb3R1NlZ6S1VveWRybkthbDhWL2pYNFY4VnczbmllY2Fsb3d1bGFTOXNGMmphUW9Zc0I4d09DZU9uSE5mYm5nTHg3OEp2RW53VG04VStQVFpYTUdzV0gyR1dPM1pkMDZ1bUl6Z3JobVYxSFA4QUNjNDROZU42TjhPUGduOFVJNDVQaEg0eml1cis4RWdtdGJ0d1VsZHlEdDNmdy9lMjRQWDlhK2UvaXo0TStJSHdBK0owa0VWemUyV25RM2tobTA2WXNGc1p1Zm5DZzhJT094NjVyMUhSaGlZcDA5Skk1V3BVcGU5c3o2WCtIdjdBWGhQeDJsL3F2aHZXYnV3dTRvaE1MK3dSWko3ZFVKTUlEWUcxanV5V0REQURacjRrK09Qd3lqMURVTG54THBkL0pxdC9ZM2pXK29UeWpmTkl5RUlDNUJQSkFCSDBPZXVhK24vZ0IrMWg4Ui9CM2hqWGRGOFBhcnBON3FXdFdwczdXOGd1dy8yUkRrRmxVOGRINEI1NDQ5SzFmZ0IreWo4S2s4UCtJdkZIeHIxRzl2bHV0TUxXa2VuWEcxa201SWt6anB1NEdjanFPL0hYUXhVOFBIOTZaenB4ay9kUHo2dWZFK29XMFRXVHh1N0ZDQWlxU1QyeGdmU3VHOFRhVjQ5bG4rM3Q0VzFOSXBXL2NTdFpPQnllT2NldGZmM3dvL1pEOE4rTWZFRjM0aWZVTHF6MFN4bFoybTJSaDNPY3Fxc2Z2SEE1Mjg1SjYxMVdwUy9zNlgwc2VsYWJxRi9JdHFwV1I3aTdZdHVYb3hEY0VZeU04RWp0MHJyam1FYis2cm1VcVQ2bjU1L0E3OW1qNHVmR1B4ZkhwK2orR3JxSkVsQm51N21JcXNYSTY1SG9lMWZhZmpMOW5MNForRi9ocmJlSGZIVWtGNWRScXF4R1Bsdy9LN2tJQStYQTlmV3Q3eGQ0dDhNVGVNTEd3K0NtalRXRXR2YXRibHJaMlpyeDg1QkF6bkk0NStncnZ2QW43TXYvQUFsVUM2djhZdFhsS09BZjdMaG5LbGdCbFRLK2VNanNPbWE1Y1htOUdsOGExN0ZVc0pVcTdIejk0QitHK216NjNENFYrRlhoU2E2dkR1RWNkc2hkK3VNdWVBdU1ldVByWHVmaEw5aHJXZFJ1eHJIeFA4Uld1bmladDhrTUg3K1pqa2NFL2RIR00raHIxandOcDNnYlJmREZ4cGZ3enRvTkJra0VrTUZ6YjJxbVJKQjhxdXdibDg0ejE5K0t2TnFOOUhwRWNPczZtZFF2R2l6ZFNoUExESGI5N1lPQU9uNGl2bmNSbStKcnUxUFJIcDBjRlNncnoxWlorR3Z3SytBZmdxWjcvVC9Ea1dvWDFpVlVYdXB5Q2VRc29EWkFQeXFlRHlCelhXNjM0ODBmVFpyYWJUckpyaU5WSWtodDRnWkRHSHdBcWp2N0FkSzRTMzE2MDB6VVk3ZWVCNDRMaFZ3MGZ6YlhCR00vVWMvalROWjhTV1dpNnRiM2QzY2lJTXdhRlVjSDVnblAwL2grbkhwWGt6VTZzdmZkenFWb3JSSGErS1BGa1BpTHdmQTJod1hGcmJYTWllYkplUU5DMGFyZ2xSR2NObkxBY1Z6M2hieHJwOTVxYjJpNnhlWE1Hd3l6eW1EYkdpNStYSkk0emdqTmNKcm54azBhMHY1THEvMVhjSmJkU3dkd3hSME9BUno5Q1QzUDBybTduOXFId2JwbHZPcTZwSEdrN3NaSXd5aGR1QmpvT2VWSDVWVWNPbjBGenM5ZDFMeHZvdHRxZXNhZW1yRmtOOWlRUnEyU3BCR2UrTWUzV3VkOEllTVBBZmdQVzMwN3c3YU5BOCtXbHVaMzVKQVZpTWtqSzllbnJpdm4vd0FUL3RWL0Q2SFVZdFV0Yi95THVFRVR5THdIR0IxNUdXeUJ5UHlyekx4dCsxNzRjTTUxTFM3dVF5MnplVXNjVTQzTkgzNXgxUDhBSTEyMHNIVWE5MkpuT3AzWjlwd2ZGdlMxdHJtYWUvajh4N3Q4WVk1enpqdnhqMnpWK3grTjlyYkJMWkljcW8yek1yZGVjK25QV3Z6NWwvYkNtYUluU2JqV1lnL3pCSkxkSkVEWUE2OWFaNFgvQUd3L0V0bGR5Vyt0UitaQWNrU0ZDckw2WkhRMXIvWjFhMnNURjFWMForakVQeGR2TDdVbHRORXRtWVhzU084K1FFaVpUakxuSFBGR25mRUlhdjR2dll2RUd2cWd1N05SWlJKZ0VZSjNLTzJjWitYM3I0WThPL3R2MjVlU0syMVB5OTUyc3ZuYmNqUHR3RFhTVy83WHVnenBhbmVvOHR0eFpYenR6d2NZNTdudldVc0hLUFF1TlJzKzZiYjQwNmg0Zmhqc3RFUG5wQ1ZRTkVDVGdjNEhCeWVjOGU5ZXIvQ1g5b0c2MS9UMTFaUnNCWmhLSCs4SEFCeU04azlmeTZWK2EzdzMvYUZzckx4QnF1cXhlTkhodFpaZjlEdDQzREJHWWc3L0FKdXc3SHJYdEh3MS9hSDhKRzFqOE4vMjF1Z0piWk5LeHlOM1ppdkdNazlQU3ZOeE9DaTNxanBoVlo5NTZyTDhHL2pSYkR3LzhSUEExanE4VEtTNzNNSUJRWkJ5c2dBSTR4MzZtdktQaUYvd1M0K0FYanVlVi9oRDhVTlQ4SzMzektkT3ZnTHkxNmtrWXp2VmNzRG5KNFd2TFBDZnhROGVlQ2RTazFId3hxMEY1cDJxeVJneHRLV2FDSlU2RGNjSFBBL0FlbGR0b3Y3Um5pRFRMeE5SdUdaemxqTktHT2ZtSUdmVHB4ZzBVSTQzQ3Y4QWN6WkUvWlZQaVI0VDhiLzJCdjJtL2dkZHphenJIaG1IeEhvNGprYisxZEFZem9nTDlXaVB6b2VoeVJqTmVNVzJsZkRUVmZGM2tlSXZCbW56enh5NGtsdXJjWjNqNVJ1NkhPZW9yOUo5Qi9hanNKN2V3aTB1V1JtVWtYQ1kzWmpIemdFbjM5T252VHZpbit6MSt5WisxSG9FdXUrS3RGdC9EMnRxVit6YTVwK0xlNWhsZHYzWmJhQXN2SkpPZWVhOXJENTlXcE5ReEVicnVjZFRBcHE5Tm41Q2ZIYlRmaUg0YzBTLzBuWGZDVnBiMmtNNGx0N20waUNwc1BNUUcwamN1RkNrdGs0QTQ0eWZENXZEWGgzNGpKcCtreGFoWmFQZFc4VHJOZlN4T1Z2WkhmSUxsU2VBQ1FPT3hyOVBmMnF2K0Nkdnh1K0dzRVMrT3RJLzRTVFFiSkdiVHRkc1lXYUlvQ2Zsa1hyRzJPTUg1ZVQ5YStXZkRYaEg0VWZDTDRuWHJlTnZCMXZQWVBabU9ONVlkNmdrSEpDNStYbnQ5ZlFWOVZoOFhoNmxMbm91NTUwNmNsSzB6NVI4U2VBYnJ3WmFTRHhicHk2bHA2U0JJci9TNS9NallqZ2RPbkhQUHFLOHZrOEE2ajRrMWVXRHdubzEwNmwyWkluUWxsUUFra2tjZHY1MSt1UHdvK0YvN0oveHU4Tlh1bjMrZ1I2TmQzY3AreDMrbHZreGs0STNSbkt1dlRJNmpIUWptdUM4S2ZzM3Y4TFBFZDE0cDA3d3ZZM05qSFBKSFBxdWwyd2RRSCtWZzRCQlU0eWMvd0FPSzFoajZjTDlHUkxEdWZvZkVQN09YZ0h3ejRSOFphTy9qendyRmZUYWhkUm9Vdll5RmhVc295b0k1UFhCNmNlbGZhWDdTWC9CT2p3MzRIMDd3LzhBSEx3anBFZjlnU1g4TU9yUTJwM2lKd2NnZ2pBRzRFZkxqQTNDdlJmRjM3R0h3NC9hQThSYVA4VFBCOFkwTFNkTDBkSUxpSzNndzBzcWhtM0FybktoZ004Y0RxY1V0NSsxM3JYZ3FDYjRjZU1ibTE4VFI2WmNPbHJCWUlwVGFqS0Y4eVFyMUNnWXdQWDFyeXNiaXE5ZW9uUloxMGFOT25HMGozTDluVFRQQS83TDM3TjB2alB4VklMVkZSOVMxTmo4akYzQkt4b0R6dXh0QUE5Ulh4eisxYisxMThkdmlLSXZHWGgyeVhTTkt0cDBsaXM0TUU3QnVDTmNid0MyUU1rRFBYMnpVdmpMNDYvR1Q5cC94alovRDNSTFVKRGFUckltbjJ3Wm9JbTRVU3lFWjh4MTU2OEQwcjFqVHJUOW5QOEFaajhMeGFwOGFZcmZVOVZNUWtGdmV4bVo1SFB6SGJHZWlOakFKOStLNFkwWTBaYzFWWGsraHM1MytEWTYvd0RaMC9hMjhEZVBmaHpZM2VzcmN3Nnh1aVRWa3VMVGY1RERKZGd5L0txYmlDT29CTmZTT2hhbmIzMHdlSzhTY1MyNjRkSERLQ2Z1bklISVBCUDQ1cjgvTlYvYmYvWmZ1UEhjZmlmd0o0TDFIdzJaYmRvdFRzcmkySDJXWmgwZEF2eXFHR0F5RVlQWHFBYStsUGdaOGR2QUh4TzhKdzNmZ3ZVNHdzVVEzaUZ6KzdLNEl3dlljbkhxZXRlWmpNSkpOeVViSTJoVlQwUGNOSzBHeHQ3dS93REZ1aTJWMWNOUGMrUk1MYTZKQ0l2TEZSMFhudjcxeGZ4NS9adjhRZkVpeEdxK0dkZWdGeWtmTU4yaERTRmlEa3VPK0d4elhXZkR2eFZQNFA4QUQ5cG8rb2toQ3pxYnJKR0RJK1R1QlBJMjVOZHRxSGlEdzIyam01OFNTUmd3MmhTYmUrM0kyN216eC9kR1BxQUs0TVBXbmhhcW5BS3NGVmpabmxYN0s5aDRvOElmRG5VTks4VDJrQXVMalZaVmhnanVCSUdSRjJnNUJ4aGlQVHRYcFVrV28zdHFrbHhhUm80VDk0STJHNEt4NVByd09LOHZ2dmlwOEw5RHZVdGRJMUcwaVNLSVBISEhQdFZTekEvZEo3NEp4OTd0VzFwM3hlT3V0SmI2ZnFFRHFTVWVWU0RrazRBNTZqbnFmU294Vld2WHF1cEpGVW93cHg1VVozalR3bDR1MWo0cDJ1cEw0K3ZZZkRLNmFtTkdzSS9KWTNTdmxpOG81S2tiZmx6NjE2Tm9pK0hkRzA1ckZkTkZ1c1V1NEJDVHZsNjV5VDgyVG44K3RaSGg2SzUxclJ2dDlwdFF4TnVaVmJqNVFNOGRoNy8vQUZxME5Oc1h2RWFPYi9qM2tRbnlzNTNoaVFjNDZZSGIycmtselRlcHBzYXRscU9vVy9pdG9wMUFTS0pCYXhzVlptWUhMYmpucURqcG12V1BqRG9maVR4OSt3VDhUL0FIZ1VOY2F0ZGVHSnZzOXREdURTSnd6QWMvM1FlUDhhK2NmQzNoRFZiUHhSZjZqSkE5bnBrRjF0c0lyYWJmSmVLTmhrbWxKSklCUFFEcGduSE5mUnZ3TitKYy9nN3hGWnRiM09FM0h6WXBGWUI0ZWNrNU9EbFZIV3Q4UFVoaDY4VzlpS2tYS05rZmh4cC9ncTgrR0dwVDZyZmFaOW84MWZMbFJVRzd5Mk9TQjE0SHpESnAvaGY0b2FkOExMM1Q3dlh0UG1YUWJtWUxETXFaRnV6RUVxM3ZqUGF2MkkvNEtILzhFcVBDUHh1OEgzZng5L1ptMGhFdUo0MnVOYjhOMmtmRWdJSmtsdGdNQU9NOHAzeHhYNUIvSDc0UmVQUGhycGJhWkRhTU5PYWNOTEpKYWhrTEFrY2dBN1NCalBmcjNGZnBPRHhNS3ROVHBzOFdyRzdha2oybjR0NjU0SCtKM2hxS2Z3NWN3M2IyMW9uMmhvVTNGU01ZRzNISFgrZGZuNyswbkNOUDhjVytsMlduTXF5WEFDN0R3eDNFQUFEUFd2WXRKK0ovaWI0VitPOUYrSTl5aE5wcloyWDBIeTdHWkdDc1NPaWtqbkdPTUNxZjdhL3d3MHpYcE5JK05mdzJuTnhwOTV0YWFOR0pOdFBnRUtUMHdldjFyMUkxZWVHcHpRbzhsU3hONDgrRHR6cS9nUFRQRVR5c2Rsc2diZy91eVJuR01mVEgxcnlRWHorQzlVL3RLVi9raGxIbWorNXpYcHZ3YStKMnUrTU5UMHp3WjR6dXpCb3kzTVoxQ1lMdGJ5emdFNSt2YW5mR245a0xWdkVtbTY3NHUrRTEyK29XSzNhYkxaUG1ab21kOWhCNll3RndldkJ6MHJLVk55WE1qc2pWNUh5c3FhM3FtaS9GK1BTcitOWXpQaFluYVA4QWlJNkgvd0N0WDFaOGEvZzNybnczK0hXalFRV1Z4YjJFK2tRZVd6bkNTakFMWUJKUHA2WUhwMHI4Ni9oOXIvaUR3VnFiYVZxS1NJOXJOa3hTWjRaZU1WK3NIN0xuN1JYaGY5c1A5bEhYZmcvNHN1WS8rRW8wVFJaTGpSbWw0WmxqaVhjb0FCendPaHJXaTR5VFRPZkZSbkMwa2o0UzFpMm0wMjR1WVlTUUFCbGwvaElQdlZhU1M4VFVkSjFKYmRKVTg0TGNIT0NWNHh6V3ZlMnNtcWF2ZTZaWlFNN1JRU2tLRmJMWVhKNkRvRG11TStISGkyNDhUcmMyOGtSRDJrdnljREpYUEdmeXhXZktyblhHVjBtZXFlTTdhS2VlMTFUVDVmTWl4ZzQ2TDNHVFdiOFJJYjVmREgyeTJpd1ViSWNEb01aeit2NlU3UmRSdUowZlQzbTJ4eThBa2NaNHdSNmVsWFhubnY4QVJwdEgxQ0JoSkZsWFlqR1IyUHY5S3lhMU5sNWw3Vkx2NGQvdEEvREh3dmNlT3ZHOFdnK0tQRDd0YWZhTHFBbUsrZ0hNYk1RUHZEcHpYajNpRHc3NDE4Sy9FbGRZdE5adHRTc21BVjVMT2JkR3lIUFArZld1bDFuU3JXMjhMZWRITWp1TGtqeTFJeXZ2MHJzTkk4S1JhdDhPb3IyS3lVU1FnYm14dDQ2OXV0SnRQY3JrYTJPSXRkVkVGK1FJOFJ2eW94bkpyTjhXaVhYTEI3VVJaSWZPekhBNXJUMVRUWjRKbmxLaDJoaUxNb3dOZ3pWQzMxQkpaZzRYbGo4eHhYUEoybG9kRVljMFRlc3RMdWJmdzViU1IySUQrV0J1SUk2QW5qL0gxb3UvRkowbld0TnVabDJwTkNGZVFMa2puL0pyc3JDYXh1L0R0cGFYMEIyTytHRWFqSVhGY2ZjV2ZoNjR0N2pUVWlNMGtWd3doM3JnZ1o0L2xYVzcrenVjaWpIMmxpMzhRTlJiKzBJRlNZQStXdVFBTy9jK3RiL3crMUZyUHcvTXQyY2dNbzM0L0xQK2UxY2Q4UkV2RGRXOTNMRUF2a3F1MVBwVzc0ZGFHODhIdmJ4eVlreXJZenljVXFXcG5XU1RQTVBpUjRlc2RNK0dXbDZySGo3U2IxZy96Zk5qSFQwcUg0TzJ1aytHTlNieGZxTnlpd1M2WGR3eDVQSmthTGdEanYwcWY0ci9BR3RmRHRwWTNCSUc0dWtmWWNWaGVGZFM4UDZSYVQyMnEyLzJpUmRKdUhnamZrSytRTjNzY1Z3NVA3MkZUT3JPbGJGczlzL1o5K0czeEFtK0VlditKdEt1V2V3bHRUdmloSVlIYU04anBuQnhuclhsL2ozVDRyNzRmdGVtK2lodUxLNWFPU055QVpGSU9DcDV5Ulh2UDdBK3FSYXA0TjF2UmRUdkhFRjlwemdSYi9sTFk2NEo5cThZK1B1bDIybWFKUHAwTVNEeTcvQ2tMM0JJL3dBajNyM1cwNG5oV2Nabm0veGh1eGQyT2xUQ1VPZjdQajNQMXlRUFgxcm5MT0tQeW92M2VNZ2ZNSzY3NHc2VGFhWDRlOE9KSEVRYm5TdzdqblBXdU4wS2VhVy9ndG5rRzNjQUFhODZxN0k5SERheU9odmJxNDAreGdnakEvZU9GWlc5S3BYRnBFSmZzNnR3cllCN2lybXNXWG1hekhpWEtKakM5TWUxVkpGSzN6QUE4dU1nZDY1WU5XWjZFMDNNMGxMV1RwYitjMjBLTjJLUjlIbHV0Y1c0aFV1b2gzTXlxZW45UlY2OFMxdGRUTnZkcmhER3Jldk5aWGlieERkSWtMNk5kUGJNRTJ5YmY0aFdkRjgweXNSN3NVaW1sdENkWndVd3BmNWx4bmovQUFxbnEzaU84dDlYbGRMSVJRWjJCbjcvQUoxUG90eHFybDVycVliaXZVTHpVODJwNmZiNmZjVzB1azI5Mjh5YlExeW03eXZkZmV1MWFIQlBXSWFYZkM1eGRibGZuaGNnNC9UaW5SMnVuNnRxZmxYTm9Rb1B6R05zYzlQOC9XcU9uckJCYmlLTlVqSkgvTE1jL21hdlNYYWFMRkcwUXpOSXd6M3pWNm1DUjNQd2laMHVMNjNsMDE1cjJWZkxnWldYOTFFT3ZCUG9jL2hYZitHTmQ4TStGdFBrOFJhaGRwNVZ2bDJDRUU3aGc5UHIvS3ZGN3JXYmEvMEMwdTdIVFBzVnpFcnhYTnhGSWMzREE1RCszWUhIYXE4ODEvQjRkUko1bUgydVU3SXl4K1pSL25yVmN4SEttelgrSTNqcnd2OEFGTHhyTjRqZzhNUjJiTU5xdkNNZVpnOE93OVQ2MWsycyt5MmZmd0VKUEFxdGJKYjJhYjF0c2s5Y0QxL3BXcG8xbGJhcnVzWXp1WnVaZ0JnZ2NWYVYwTlI1ZHk1NFltbXZZeGNQY2dXMGttM1lPckhJNEpIVHZYcjNoL3dERnJYOWxhZm8yZzNOL3JGNUtJN1RUMGpPN09TQm4xT2NIMC9uWE8vQXI0ZCtKOVExSmZCM2h6VHpQSmNhZ3NrV0lDemJoZ0RCNTQ1NUZmcE4relorelhwUDdNK2xmOExkK0s4MEdvZUlMcTI4dlRySGFBSU1qcU1qamtucGpBcnc4M3pXbGdJY3ExbjJPbkNZU2VKbmQ2SXd2Z2QrelJiL0FMT3ZnQ1R4MTQxMDIxMUh4cGNRL3dDaVdzZ0hsV0xNT29CNnVwQlBIcFVrcHVjUHErcDM1dmJpNUpOeTEwK0dkbndNcVFjZ2RlS2Q4U1BGV3ZlTGZGc1hpZTE4VTNKV0tRbExBa0dIWUQwQTdISklHZlROYzU0aThlNlJMcWMybDJseHV1WWZsbnRrSkppTGZkem50elh4Rk9wWHhGWG5xTzdaNzBuU3BSNVlLeERMZDI0QnRycU1DZnpXRXJyMExIcjI1SEl4K05XN2dhVEhhSkxwVUlMVzg2RjBISG5BOEgweWVLNVpTbHhxMTlyRjNyTWlxMFN0Sll0OTNlQU9RYzlNZHZhdkpQakwrMXY0ZjhFZWJvUGhjL2JMNVpNSkZFYzdTTW41aU9uMEZlalRwVmEwdVdDTUhVcHhWMmVzZkZiNGw2UjRLc0pwRUNXOXNwTzVtT0NRT25PT25GZk4rdC90cGkyMWVXeThHNmJjWGNpc1VEd1pDWjdIUGJwMUdLNVhYZkVHdCtPdk04Vy9FM3hTSllZN2NTLzJTc2dqaUNmM3M1K1lnWnJ4angvKzAxcE1UZjJSNE0wRlJGRXhEVFJNWWdTR1BBMjV5cEhmZy9Tdm9zSGxGMTd5UE1yNDJLZWg2cjR5K01ueDI4VjNjazYrTDEwbTJaR1BrUnRoa0hjRS9Tdk1mRXZqN1Y0YjB5WC9BTVk1SnBzL09CY2s0UDUraHJ5WHhSOFNmRVhpbVROeEt0dkVBUXNWdGxSZ25PQ2M1YkhiTmMvdVpqbkpKSnIycWVXVVlyVkhuVHhrbTlEN3UvWTcrSUhqdSsxTy93REJlcjM3M1J0N1pMMnprTW94SkhuQnhucjJyN1grRitqZUlaTlVzcHRkdUxQN0pGS3B1L1BHNUFxcVdKSUhPQUR3YzlldlN2eWIvWnYvQUdodFUrRnVxMnQwVjg5N0lQRXF0THRNdHUvM29zNDdIQkg1VjlVSiszamU2NTRBdk5PMHJSOVF0cElMTFpMZHZGdUtJM0FYSjZaT1YrbU9LK2N6SEtxNnhONmEwUFFvWWlFNGFtciswUDRQMXBkVnRwdkVHbXkzTCtJM251dEt1Rm0vMTBIbXNnUFhqQUFKR2VRQlhpRjNjZkNUU2xrczlWTTBGMHJHS2NNNXlqWndlbmJyV0Y4ZXYyd3ZpaDRnaTBpMWUydHRMdDlFUVI2UmFaRFRScnRBSkl4Z1o2OUs4SjEveHg0ajhaK0pKZGUxTzh6ZDNVMjZReERZQzNzQnhYczRIQVZZVTF6bkZXclI1OUQ2NS9aZjhjeWZEYjR2V05qWmVLR3VOSDFsdkxNUWx5WXBNWlZqMStiTzNrZXZhdjBJK04zaFBUdjJqZmdWYi9GcVBUMW0xM3cwc1duZUpwRWlBT29XRWpDTzN1eUNQbVpIS3hPVDJaU2U5Zm1SK3g3NE1zWDFpMzhTZUpkUVdhU0ZnWTQybEFFWTRPVG5vUlg2RS9BWDlwendaZmVLNFBnbjRmdW83MkhVdEQxR3oxdVpOcGpTQTJUc054SXhrU0lqQStxakZlVmlyMHNjcFErWjJVNUtkQzBqNU4xajltZUZkZmJ4cDhJTmZ1dEcxRkptM3h4RXVwbHlNcXlZNHlmd3hXdkI4V3YydnRFdEg4SjZ6NGQwclVJNFZkVGN2SThHNVFPU1Y2ZDg0SGV1dnVmRmVvNkg4Vy9GVnhZV3hjeVNKY3BDRGtjb3JzcEhHQnllM0hBckN1UGlyNHJ1cm1XU3p6NXMwWGtQYnlvWk54SXdnVEl5M1RIcWZmTmVqTjA1UXZVUnpSVlRtdEV5NS9qNSswTStseWVHdFIxbXkwU3lqVjBlSFRVWmkyY0hxZU1ZNzl1Zld0cjRHL0JuNG9mR0hXYmk3OFAySnR0S3VaTWFucjk5R1RHV3ljaEFPSGJuakhUdlhvL3dKL1ltMUMvdEl2SC9BTWY1WkxUUzBJbGkwVXNSUE92VWVZYy9JdUQ5MGNuSE5mUmVyZUl0QTBMUWJiUWZDbW5XMXZweTJ5aTBpdGtDeHhnSEF3QjA3ZTVyNXpIWnpTcDNwWVZhOXoxS09Day9lcW5tdG40QitHWDdPK2l3eDZEcHB2Tlp2cGtoanZMeHdacDVXd2VXSi9kampzSzZtMTFPNnVaRlc0amZCajRrVTRCSzV5VG5qT00vV3NXUFI5YThVYTlkSFVvMG1zb1pRa0VFMkR2STY0YlBIQTY5dWVLMDdWdEkwZTFPb2F0WkMxamlIN20wTW1kNUFBSllmM2VlbGVOSnQrOVVkMmQwVXRvclEydE8wM1FML1J6Y3RJZ2k4a3EwaUFyNVo0eUI3OS93ckY4VWE3NFE4SVN5M01lcUpKYm0yUlZrZVFNY0FZYm9lcEo1SGF2TmZqbisxWFkvRGUxRjVvV3AyaWpKU1JKc0NLTmRwVVBnSEJ6eVBldmpmNG8vdG1hM3JFTWx0NEwwMGs1SVc3dXM3UjM0WFBybXVuQzRMRVlyV0tzaUtsZWxTM1o5YytOdjJxUERuaFcyYVVYMFVjYWo1WjVuQ0RQWE9LK2ZmaW4rMzU0ZnVaR2p0SkxqVXBVT0ZXRGhUOUQyRmZKWGlueFo0bDhVM2o2aDRuMSthN0xOa3EwaENMN0FWaVM2K2lKc3RnRGc4RURGZlI0ZklhY2JPV3JQUHE1ZzM4S1BXL0gzN1Zmam54WnZnc3RKanNvaTJWTWt4SndPM3BYQ1hQeE04WTNZM1hldkZlMzdzZHE1ZVhVTHU1VE1nd0ZIQUZMYnRJekNXNkpDTDBCcjJhZUJ3OUtObEZIQkxFMXBhM05lNDhRWHQyV2xmVlpTejlUdXhtcWx6cmx0cHRwSkxkVHZQSTR4SENKT1BxYXpwTlFraWRzeHJnbmpJN1ZEUEhIcU5xeGNiV1g3dnZYVFRwVTR2WTU1MXFrbHVRM0hpUzZrL3dCUTBrSTlFbmIvQUJwSXZGT3R3bmZCcTF5RDA1bUpHUHhyTmRXallxd3dhRkc3aXUza3AyMk9aVHFYM09nMHJ4UExjemlLOXRUSXpkWkltS2tmNDF0UjZsUERKL28xNWN4S2VtWHlEWEo2ZFpYa3I3SUZZWTlPSzI3U2VlRUJMa0hBNEdlb3JpclFwMzBSMlU2bFMyck4yMDhiK0x0S20zMjJzRXFEbmJKME5kZjRiL2FUOFgrSG1FbDNCTVBteUpMZVk4ZmhYbmhpaGtZeUxKejI1cFNsOUpIczM3Z09pbXVPcGhzTFZYdlJPaU5hckhabjFsOEl2MitkVHR6RnA5enFDT3FqRExLeGpmMStoTmZSZmdmOXJyUS9FbWxQWlRoWXBKWWRtU1Z4empuMzcxK1h3U0xidW1oZEdBNHhXeDRjOGZlTGZETTZ0cDJwdXlLY2lOam5GZVZXeWVtN3VrN0hUREZyYVord3ZncjRsYVV0dEZQcDExdU8xQUFyZE9NRTVyMW5TZmk3QmNOcFY1TkhCTWcxRlhrWHlRNjUyL0tNQS9OMTZkc2l2eU4rRWY3Wi9pYlFKSTdLOXVOdTBnR09WOERyMlBhdnJINEtmdFRlRGZGQWdodXBQczl4d1ViemRySzJSOHc5VGtlMWZQWXZCVmFYeHhPK25WakxabjZqK0FQMnN0WDAyR0FhOVpwZldYbXh3WDlsS0F3Y09lU1dZWVBUSFBPSzVIOXNQL2dsdjhIdjJrSkpmaUYrempmMk9oK0kzUmpjNkpLMytnYWhrL01CeCs1WWxzZDF6M0ZmTC9oMzRqNjNmNmhEZXQ0cjh5MWdqVVdkdkVBcEwvN2VPdlUxN244TXZqbjR1MHZ4eDRiMUJUTTZvelFNMFRobEVMaktzNnVRRHlUNkRpdk9wVjYrRGx6MG1WVXBRcUswajg5ZmlGOEV2akoreVo4VTdqUnJqUmRSOEs2MWFITjlwOHlGb1pWTFkzcU9qUm5IQlVrRWNjVlU4RWVNZjJ0ZEExM1VkZDhJL0VlMUF2SGtrazAyV0w1SkV3UVZDbjVRUG13T21lbmF2Mm04ZitEL0FJRS90cmVCMDhDZkdmdzhobXQxMjZUNGdzV1JielRKVHdERkozSFV0R2NnL2tSK2FuN2J2N0ZQeFQvWTk4VlE2ZmR5L2JOR3Y1QkxvZmlHd1J2SnZvMUxjQVorU1VBL05IM0JKR1FhK3d5M01NSm1jUGVWcEhqNGluV29QM2RqenJVL0h2N1R2akRSN2J3ZHI5bmI2VUowVnBZdE90L0tOd0NjSGxSeGtEa2J1MWNsOFVQaC9iZkJ6d05jYXJxYzlyY2FwZVRyYjJHbnd5QTVuYnVSamR1VUVISko3VjZKNGU4UStLdmlCb1Z2NFdobWhpYXp1RXhkenliRlRiaGNZSnljakhVOVFjVjVkckkxL3dBZGZ0T2VHZmg3NGpubXV4WXE4dmxTZ2NzRTNMd0RnWUFVODljRTEzempUdzBXNG81NmNxdGVhVFo5ay84QUJOdjltWHdmcGZ3WDFMeFJyQnQ1OWNheGx1N2szQXc3c0lTd3p1WUhBWWdER2M5eFg1Ly9BTFRYaU82MGl5MVg0c2VPYmorMGRUdTU1V2h0MmxVcEZsemlQR09NWTZDdjBUL1pMK01md3MrSC9pdUR3MThSdGR0ZFBhRzVhSzRTK2tFWUdYQUk0QkFCVDd1ZWhCcjVHLzRMay9zNWVEZmhKcG11Nm44SlBHVmhyUGhQV1o3ZldkQnVySFVVdUNrY2pueklHS3R3VWJKNlk1NHJ5TXQ1cTJNY3A3Tm5vWWh4cDBlVmJuNSthZCswYjRodk5iLzRtdGxiUFp5dmhyZElnQ0ZKNkN2cVg5am54SGMrRWZpam9QaWp3dnFERFN0WnVSQmUyVzRsUVN1UWNmVURpdmdTT1ZvWmhLcDVWc2cxN0Yrejc4Vi9GZmhuVTdTLzBoL09qMHU3UzVOb1R6eDFQMHI2UE1jR3AwR29JODdDVi8zaTVqOXd2Qkh4UDB6V2JpeWgxRjNXemVkRkloUUZ6ZzREOSsyY2U0RmVCLzhBQlM4ZkVIeEQ4YUxqNGQvRDd4NWRhWnBPazZOYkcvamhiYi9wRWc4d29TRG5JQndSNkhwaXZHUGh4KzM3NG4wMzdQUDRVOEh4M2R5cWI0UHRVcE1TdHVKR1ZIREtBVDhuWGo2Vjh5L3RRL3RxZkY4ZUx0WWd0UEVVWDlwNjFjeVhHcjNrVVkzeHUzRzFEZ2JBQVNBT3dyNVRMY3B4VTY3YzQyUjYrS3IwWVF1bVdmR1hncnhycE9wVElQakpjSk5iU01yR2E3SklLOGpPRyt1T3RYL2h4KzAvKzBkOENkUVRWYkx4VC9iTm5FY3RHMHhiYVdPZWU0OWErWmIvQU9MZmphKzA3K3pKZFNDb3psbmtSTU81UGN0MXBuaC80cGVMTkF1b0o0N3haMGdtV1ZZTGhBeUVnOXg2VjlWTEs0U2hhU1RQSVdMU2xvejlOL2dGL3dBRmRkUDE0LzhBQ0tmRUtHNnNMZTVsSW5GdStkb0pHUjlNWnlNZHEreVBBZjdTUHcvK0kwVmsvZ0x4S3Q1YlNSb2s2eFRaMlJnY1pWdm1KNS9YaXZ3cXVQaXpvM2pyWDIxalc5SHQ5UHU1Mkc1clFiVURjZk1QU3U0OEdmR1R4NzhKdFl0OWQwYldaekFoRFJYa01oRERIVFByNjRyd01idy9GMzlub3owS09NVFdwL1FQcE9zTHFWamJKcHl4disrVWZleU1EakpYMDdrZDhWMG1sbld2RGNGNWRNc1YvSmV6aU8yZU5TcGpoWUg1V0E2QUU4ZTlmbUgreWIvd1ZoTWxqYTZOOFVZdk5pWHkxL3RTMUdTbnpjZVpIL1d2MFA4QWdyOGZ2RFB4anRVLzRScTh0NTRFc1RjdmNxeTRZc2RxN2VjamtEM0JyNG5HNEhFNFNvMU5hSHAwNXdtdEQ2eS9adytQVm5vMTFENFcxN1Zpc1ppeCsrajRWeXhBNkhBQjRHQU0vU3VkL2ExLzRKMS9EbjlwcXcxTHh2OEFDM1Q3R0xVYjFIYlZOR21RTGJYMGhVRjNqSUE4bWJCQXowSlBPT3RlUzNXaCtKUTh0dDRSMTZMVFp5VHR2RGErYTBKSkI0SGNrNUpQc0NPbGZSM3dCK1ArcXRxTTJtK0xXUkdoU0pET01CYmhWVmR6a2RtSjU0NjVycHluTTZtRXJKU2w3cHk0ckRxYTVvN240TGZ0eWZzVi9FRDRmd2FscGsrbFhSbDBDNmxraDAyNGoyM05vT0M2bFI5N2JucWVvNlY4OWZEVHgzQnFPalNlQnRlMUFHMm5rVU5iVEhoT2NLUW81M0RhQi93STlzVi9UZCszMSt4RDRYL2Evd0RoWGRlSi9BTVVGdjR0Z3NpYk81UWdEVUVBejVNdVB2Ti9kYlBCd0R4MC9tKy9haC9aSThYZkNQNG5YMTVINGJ1dEwxU3kxSjJuc0pvMlhFaTRPTWRWWXNEbjErbGZwbEd0Q3JTNW92YzhpTDk3WGRHUGUvRHU1MHo0WGp4aHA4UmllYTVaQ1Z5cE1lVGduUE9PQmcrMVQvc20vSC9XZmhwOFdyRHczck9xQWFScTB3c05SVzhiTVNwSVNxeUhJT0FwUFVkdlN0SDRPL0didy9xZWdXUGdMNG01aHRFdVJieVJ2aGZLamZBM1o2L0t5OVBRbjFxTDQrZnNxYWw0SG5QaW53cmRwZldTNFlUUWs4cnQzREo3SEdEanJ6WFZUbWxHeE5UK0pxY3grMXg4RU5jOERmdEZhM0RyR25XOGFTWFVqQjdBQXd1cHl3ZENPTnB6bkp4OUszZjJZcmp4WDhMdkYxdDRzMFRVWkl2TGtESzBKenVSaGdnOXVRUUQrRlpVWGorKzhYYVYvWm5pVkRlVHhSQkRjenNTeXFCZ0hKNVBCYmpvSzZud2pwS2VFYlhTNGRZdWZzNzZyYmVmQVhkUnNRdGdkeVJrTDN6V2F1NmwwZEVwTjBlVm10OFBqY044ZDM4bUNJRzZodmlrTXUzbmRFeHdjZ2c1UGZ0aXZLZmhHK2ozZmpCMDhRYVFZMmtkbzd0clZ0alA4M0REUHBtdTUxUmIvd0FQK1ByVFZkS3VjQVNidHlzRGpjQ0NNOStEWERYRzN3ejQ5a2xWQ3FTVFpRcnh1eXhQODYwWk1FMGpzL0NxMmMzaXQ5S01zZ1NLY3JDWFg1bVhkM0E5c1ZldklOWXMvaUhlUVMzTG0yY0tJNFNlTWVsVk5Oamt0dGV0ZkVTbjVKR1V5a2Z3OSt0ZGY0Z0ZuZlh4MXF3a1dTTmRxeVNCdUFmcWZyVXV4cXBIQS9FTzFYdzlxY1RPdTFMam5CejErbGV4ZnMySnBQaVRUSmZDK3B5TEN0ekMyeDVDT0RqcHpYa1A3Vk1yYVMvaG1XMFBOMUllUU9vSHJ4MTVyc2ZnZHJSaHU3WlpXMnFGR0Iwenp4V0VucWRTMWljdDhTZkQ4L2hmeHpjUkpNVEdQTWpKWG9SempIdDByajdNUkFLbTBkU0diSEhldlkvMm52RHkyOEtlSW93RmlkZVh4anQvTHBYa0hoNWJXNmdjeW5jcU4wSFVBOTY1cWttcEhYUlM1ZFQwVFE5Wmh0a3NyU0hHMVVPY2dkVHh4WE4rT2JOdEkxaGRaczBKamtsQWtJSEdlT2F1MnRoWVdObEhmWGs1WHkxR3g4OFk0NC9uV3JxdGhhYTVva05nTU1lSFAwQVArQXJ2VWs2UndWSTJxWE1IeDFmV3QzcE5yTkVRMjVCd0I3Vk5wRnBJTktpMU8wZm91Q0IwL0dzalhiYVhTckpJM0dkaDZIdnhXdjRhdXZKOEtUVEZzN01uYWUxS2taVkZ6TTRMNDlhcERGRnBrRDhBUjhranBYRHhyWVhsNjBZNDNhUmNLQ3JIcmpqNjF2OEE3UU53MHdzb0Z5U0U2R3VObHRyeXprc1p2TkozeHZHeWNjN2w2VjUyU1hXQ2lkZWR2bXgwajZIL0FHWnRTMG53emFhSFlXdXZvV3ZOTzgyZU1OZ2h3eHl2MTRybS9qTmZYYzNqelZ2REVHbndYdHM5eGhQTkJCQmJCQkI3VnczaVBRZForSHRyNGMxMkxVRmhrdWJVVFFlVko4d1hQR2VuZjlLNlhRYnJXZkVIakxTdGUxQzFNc04vS2lOY0JlcmdjNXozNzE3U2xvMGVLMG5xY244YmZGdW0rTWJUUmRLdGROK3gzZWoycHRMdUlObERnakREL1BhdUMweUNaTDlJRUFad1JsZ2VudlcxOFNnOEhqblcrU1FMMXNZck44TFF0UHFUVGo3cWNzTTg5YTRxenNtZDJGVjZpTnpVSXQxeEJERzdSbkdkemQ2cDZiTTdhMlVjYnNQeHgxSU5hOHl5UHFNUm1Yb3Z5akdjVm5Rd0krdmwxR1BuNlo1cmloTFJucTFZY3MxWTFkV2U0dUhOd01GeGhlUjBGYzFyeXdwcXFScElNZ0RkejBOZERjVENSbXpLQmlUQTU2NHJrdGVLdmY4QW1SY2d0MUZYaDkyWTR2WkdoQzd4aHBVT0JqazFFR2lXeUVxa2JuYzhFSG1wWW8zaXRta1pkK0lTZHVldFFRckdkSGdtTVJEZVljZzEySm5CVXR5azZXd1dBbU5Ua2pOVUdsbnZkUWhoMk94UUVnZ2RNRE9UVitLZHBDbHRieUtDeHg4OVRhWGJYK2s2akpLaUtIWkdRa2dFRU54bjlhdG1CdTM5elp0OEwvRC9BUFlZU1Y0eGNIVlhYSjhtU1NUNUZPUnhsUmtWa0pacnFjYTNGNWRrUEdvQ0EvZEE0N2RxN0Q0ZitFNXZEbnc4OFVYT3QyTHJaYXJhV2k2WkpLcllrbkVuVlRqQklYSXoxeFhINjlaUGJDS2RpRmpHUXkrdlNqcllWdW93TzdjN3NnSDB5VFhYK0R2RHV1NlpyRWVsMjJrRnJpOVJkekxsbWJmamFveDNKNXJFK0d2aDlmRkhpaUx6d3lXMXBtYTZibkcxZVFQeHI5RGYrQ2IzN0dVbmpqeEFmMmdQaVRaQWFiWVhMUzZUYlRML0FNZk15Z0ZPRzRLcVA1KzFjT1paalN5N0R1cE42OURvd3RDV0txY3EyUFMvMmFmMlhyRDlsWDRUMkh4djhmYUxIY2EzZG1GYmZUQ1ZFaUdUdVFlUmpxY2RxdmZGbngxcnV1NnF6NmpkQTd3ekNNbktLcXFTT0JuSE9UK0ZhdjdSbnhKZlUvR2cwdlZOV1V5d1pXMXRSY1lDcnU0MmpBNEhQUGV2Szd1K2lsbSszMlpjeURFWnl4S2tFNUhIb1BTdnp6bXE0MnM2OVhkbnYrNVJoN09BL1NkUmp2bmwxQkgrUnBHSHpjQk1qT2NWeUdwYU1iVDRxNmg0OEY0cVdGOW95UlhSRWhCRThUSEI1NHh0NysxYlY5Zlc2V1RSMmtLeFFJeEtvcS9lWUtDZWNjaktrODE0UjhaUGlOL3dzRyt1dkFtZ2FtMEdrd0V2cTExRzMzd0NUNWFrRDdweDFyME1KUmM1NmJISlhuQ0VUSS9hQS9hUGs4VDZqSjROK0ZzclhCM21HNDFaRU94UWNIWW1CeTNCR2VLNHo0YmZzOFdIaW54VGJXMnArSld0RmxtUDJtNXVZZ3hZZzVMWlBUUFFBMTZ0OEgvZ240OCtKZmhXTHcxNFowV3gwclNESmg5UXVvaXVRSHlEbnE1SVBVYzQ0N1Y3Tm9uN0tud2Q4SFdNY2Z4RCtMZDNlVHRiTWswVm5KSGJ4a2tuR0Jrc1JrOFpQV3ZkV0x3ZURqeXhlcHhScFZhMnJSOGhmdG0vc3MrSXJEd2x1K0htdExyWWh1TU10cEx1WmhsdHdHMGxTdURrZXZQcFh4NWQrQi9FZW0zSnRkVzB1YTNkVjNHT1pOcHg5Sy9hYndqK3piK3pKT3N0dnB0NXJHNldSMmxrajEzYzJkcDRBUEJ4bjJ4WE0vSHYvZ25GcHZqZndoUDRqK0dpSjRwZ2d0dDExcHBnRVdxMjZBWmVXSXJ4S0ZIVWRmclhWaE9JTU5mMmNuWTU2K1hWSDd4K09zdWczRVl5MmVlUjh0VjV0T21qYmJIbHVjWUE1cjJ6OW9YNE42aDhNTllXR0ZDMXBNekMzdUpJdGhJQnhzWWQyNTZqZzFlL1pxK0IwWGpyWGRPdm5nRTh0N2VDRzFoWWJ0cFhCZVFqSDhBNXIzNVlxTk9qN1J2UTg1WWVUbnluRWZEajlsLzR4K05yT1B4RHB2aHlXM3NpUXlYVTRLN2hrY3IzcjJxKzhJNjdvbndSMURRN3N0YzZnalJocFlVeVRzM043WU8zQTV6bjhLL1NMd0UvZ0Q0TGVBZEU4UDZYNGMwK1hYZFF0Rm5qbHZvVkpodHcyeFdDc2NGaVFjcmorVmEvanI0Vi9DMzRoZnN3ZVA4QTRuK0xOQjBodFc4UGFaYjN0bHExbGEvWm1uZ2FRUVRXc3dRWWI1WDNLVGhzcjF4WHo5UFBuWHJjdkxvZWg5UjlsRzk5VDhJdkVMNmpjNm5KSnFja2p5NXdUSWNrZTFVRmQ0WlJJaElaVGtIMHIzSDlvMzRlNmJwSGp1K2F3UkJGRmdsd2VHYmFjRWVtY0Q4NjhiMWExVVRoa0hKNElyNmVuVVU0cG5sVkl0VFBadmdqZlhmeEYxUFMvRDJpMjF5bDdMTHN1MnR5UVBMQUc1aWMvcjByOUJ2MmJ2aDE4SmZDWHdPOFZlTVBEZXEyMXByVnJvbHpGRkZKT1BPODE4UTQ1R1NDckhwd01Hdmk3L2dtOWVhSHAzeEdFMTNhcnpZbVB6aWdKVjJmbnJuQXdPVGppdnFiNHA2WDRJOFBlTzlhOFdlRzljalpKNHdZN0RMRllaaW9MOVJ5b0lIVEF6ejFOZk80NUo0emsyUjZWQlNkRzV4UHhOdjdMdzVxVXBmV3ZQdnBFMnVzU2ZNdVZYQ1ovaTZjWSs5elgwQit5Vit6V1BCbGxGOFlmaWZZck5yOXhGNXVsYVZLTXBwOFp5eXN3UDhBeTFQcC9EbkhXdVMrQUg3T2FYYnhmSEQ0bTJHZDdtNDBIVFpsNFBVcmNTQTkvd0M0djQrbGU1VCtLTDk5T0FXd2FjS055amNCSzJPQWZmazV3QjJOZk41em1QdG43Q2k5T3A3R0J3NnBybm51V2RWK0pnMTJPNHRaSVpWeElJcmkya1RsOGpDay9VRTFTMHVQRXRzazlzNVdPVlVXSkZKSjZub2VvNTYrMVYvRDJqYTM0czFLMjFDMHRjYkpHVzlsbVhDTEVvQUR0NjhucmowNlZYK01YN1FmaGI5bmZSRkZ6TkhIZkphbFZrajI3MkFPVzY5QWUyZWE4aWxGUlNoQlhiT21XcmNwTTNQaUw4UWZCUHdwMEdhMnV0WGpEeGJ0cEkyRm5QM2p5T09TT3RmQS93QzAvd0Q4RkFkVDFuV0p0RDhBRXlPakZIZFhKUTQ0NTllZzlxODcvYWcvYXc4Ui9HYnhMTmJ3WExRV29iRWl3c1MwaTU0QlA1ZS9yWGgycitJYlN5bWFPMGpBbEk3ZlgxOWErcHkzSmsycWxaWGZZODdFWTNUbGdibmlUeDU0ZzhUNmkycitPTmZsdTVHWW1PMzh3K1hIM3hpc0RVL0UwbDh2bHdrZ0RoVlVZei9oVkszczcvVTVmUG5CQVk4ZzV4VjJlenNOUFFBN2QyT3ZCcjZTRUtkUFNLUE1jM1Bjeko0N200Ym5jQmpwNlVRMlZ2Rnk4Z3hucFROUjFxT0ppQTRMZHNWbVNhMU8yZkxPMEhyWFRHRlNTT2VVNHA3bTQ4dW5wRnRJem5nSGJWTy8xQk5najh3YlIwd2F4cGIyNW1HMTVTUjZacUxKUFUxckdqYmRtVXF0OWpVR3Eyc1M3R0c3OWFobTFhTW45ekdRS28wVm9vUlJEbkprczF3SmprcFRvSjQ0eURzNkhrZXRRVUFaNEZWWkVwMlpyMmZpRVc3Y1I0R09TTzlQazErQ2FUSUcwSDByRndmU2lzL1pSTDlvem9vZFp0U213c3A2ZFRVOGQ4MGFCNHhuM3pYTFZZaDFLNWhqOG5kbGZRMW5PaGZZMWppR3R6cTR0WXM5b1NSbnlmNzQ0cGRsdGRPWHRaUG1IOFMxaDJtdVJrS3NpcmtjQU1PSzBiZTR0cEUvMGVWWXBPektlUHlyQ1ZOeE4xTlRKNUdtakI4MGxobjd3Ni9uV3g0YStKSGlQd2hOSExaM2p2QXBIUnZtV3N0QkpsRm1qODVqeDVrWjRwcytueXBQNThBejZ4NHpXRlNGT2E1WnE1b3BTaHFqNjkvWjEvYlRpZTBpMEhYdFFrVlRnQ1FQaDA1SEk3SHBYMkQ4T2ZqZEJxM2hNM3VpWDBFazdNaXFRNXlNWVhjM1FZSUlibnBqcFg1QlcwSmdZVDZmTVVrSFBsNTVyMlQ0RmZ0TGEzNE8xS0cwdk5RWVJvUWptUWs4ZTQ5cStiekhKa291ZEg3ajBxR0tVMXl5UDJFL1orK09meFJsOFJ0YXZwRU5uWjJjd1UzVHk1YVpsWUtDRjRBR01mTU9tNCtsZTZmRXI5by9TdmkxcU9nL3MrZkdQNGUyZXMrRXZFeDhxNnUxbUMzTnBkaGdxUEN5ajVaRUJMQmhoc0tUakdSWDU5ZnMrL3RGMitvV2FzWncwazY3bWhMNERnakdWNUI2bkpBcjZSK0JueEoxUFVkUWZ4THFXZ3BZR0tkWmRLaWt1dk5jU0FmdkpTTTRVTjJJN01SWHpjSTFNTEoxRm8wZEhJcDZNNDM5cmo5aWo0ai9BTEhQakNQeEJwZHhlWFhoWFZKZitKWjRnaWl5a256RXJiM0NrYllwZ004OUc2ajBIeXhJc25oNzlwWHcvd0RFdlZ0UWlhejgvd0FpNGsyZ1lESWQyOGpuY1NjWjdaejJyOXMvQVh4bytIM3hTK0VsMTRGK09IaDIxdjhBUTdteWp0OVJzcmlQZUpFZjVRNTRKM0tja09PUWNIT2EvT0gvQUlLVS93REJOVHhQOENQRUVQaVB3ZmNYR3BlRXRVa00vaExXc241WEc1bHRMZzVBV1plMzk5ZVJuREFmU1lMTktXWTBYQnYzano2dUhlR3E4M1F6ZjI1L0Nud1kxMjYweng1cmZnblY5Mm9hR2t6Nm5vY2hpTzlkdVFWNlk0UEhvTTErVjM3U2Z4dHZOVnViL3dBQmVENGRRdHRHbGt3NHZweTd5cURuQXdBTVo5dlkxKzQzL0JQVDQxZkNQeHg0ZDBEVFBpOXB0cmNhaDRWdmNhcnBkN2FobW5Qa0dJYll5Q1hMTVF2QkhCemp2WDQ3ZnR2ZUJ0R2Z4NTRoMVRTZE9GbWgxYTdLMnBRcTBXSjN4R1Jra0ZRUVAwcnN5YXlyT01scWpMRlQ1bzZIeTNwK2lYZXFSelRXaWdyQUFYeWVlVGpwWHBuN05mZ0hYZFg4Yy9ZYmFOa0xRc0hETGtPdU9SakdEeHo3Vnozd2RpZ2ZWTCsxdUFDeXhoMVZoMTJ0eng5SzlMK0QzamFYU3ZIUDlsVzZLZ25jUXczREFCa0x1RnlDZlFmeXIzTVhpS2tYS0MydGM0cUZPTGFiUGZmaGo4TWZGUHcrMTc3WG8ydWZicEE1UVdVZHFaQ29KQUlQSERkZ2E4cC9hZC9aZjEyMDF1YnhsZDZOUEcxKzVrbDNSTXZ6RTg5ZWVLL1czOWxId3o4TWZobDRDai9zN3c1Wlg4MGFCNTVaNDBkcFhBR2Q1YnMzWWVveFhyL3cyVDlrdi9ncGQ0QjFYNEpYWGcrMjArOXVZNWJHMXZGZ1ZiblNkUVdMOTA2TW8rNFc0S3Rudlh6V0c0Z2NhM0xLT2w3WFBWcVlOT0doL050NGg4QlQyQ0ZJWThsZnZrRG9LNWE0dDVMYVV4U3JnZzE5Yi90TmZzN2VNdmdwNDl1L0RGMW9LdEFsM1BCSk5zTzJLV0tWb3BZeVR6a01wQTQ3OUs1cjRXZnNnYW44WVBGTmpwNDBlN3VMdSttVkxYVExOVG1ZNXkyV0krVlZHY3NjQUFWOVQ5ZGhCYzB0anlIUWxLWEt0ejV6MGpSdFcxeThXeTBld211SldPQWtNWlkvcFgxUCt6Yit5VjRxOFdlQkx6VnZFbW9UMlV0cXlrYWZKQ0h6R1N1UVIxVTRJUFRvQ1JYM2wrenQvd0FFdFBoMzRQMFMzWHhKcTF2YVRCTnR4Rm8xdUpHVnlNRU5JMzN1d1BIQi9PdlV0YS9aTC9ZdytFZXFSUStOZmlqNGwwNjV1Rlo0Mmd1NFdDamJ0SkF4eUJ6MzQ1eFhoWW5pR2hVZkxUNkhvVWN2blRWNUg1aC9GRDlsL3dBWGZDYTZqOFNlRDU1R2kyNzFrdDBmWkp6MUNuUHlrY2dkY2dqSEZlamZzZjhBL0JRcng1OEF0YnQvRGQzYXhMRFBPcTNVY3NoU0c0NUkyaC8rV1pKWSsxZm9acEg3QVh3cStMdW52cUg3TTM3V0hoL1hid0orNzhMK0xvRnQ1WmlReENySUNWSkJQREVmalh5QisyeC93VDI4VmVEOVV1OVA4US9DdTc4TTY1RTJZbzIrYTN1MXdjUEUrZHNnWWduS2s5UldYdDhIbU1QWjFOelJlMG9TdXRqOUwvMlVQajlwbnhjOEMydmllOHZvSUwrOGplU2F5UzVVdEQxS3FlU1NObzNBNDRIcURYc3NYaURRUENHalMrSmRaMVNEVDdTeGc4MjR2NVpQTFRieXlzV0k3NEE0NjVGZmdMK3pGKzBCNHcvWjk4ZFcramVLWjdpR1d4dWdiZHBaVEc4V09DakhQS0VBZ0QzN1YreTN3WStOUHc4L2FNK0cyZ2FuZHgvYlBzbDBMcTRzcGlRbjJzRWdFL1BoZ3U3ZHRPVjc5cStMekxBUEExbW10R2VoUnFxcXJvK3pQMlMvalRwQ2FmcU54UDRsdUoxMU80KzIyOW5lQmw4bENvTzJNSG5rSEk5YTh3LzRLZjhBN0NYZ3Y5cTM0ZVRmdEFmQ1BUSUovRVdtUm4rMW83YVBEWGtTY3N4QUdUSXVQeEZRYVI1ZWxhZERmd3ZIRzlyR2t5UzVBWmRvSUNnakh5K2xmUkg3TlBqM1RwSGZ3L0lJMGcxRWViSEdCMFluQkI1STU1ejlSWGRrZWFUaFdWR1Q5MW5Kak1Pck9wSGMvbU8vYWsrQTZXWGlNUDRldFJwdHpITUV2OXhJVnlGUHpBZmljL1dyUHc4OFYrTS9oOXF5YUw0cTFHRFYvRE9xSWtTM3NjdTlFQjZNQWZ1RlZBNE9PQUsvVlgvZ3QxL3dUbHVQQStyemZIbjRaNlFXOE82ek1XdjQ0VkJGaGN0azdlZUZSczhIMklQYXZ4dCtLT242MzREakYzcFVraVdieTdaTnI0VldIVTQ2RHVNMTkvUm03Mlo1cmZPcm82bjQ3L0F2L2hYYzhXdjZScXEzZWxhbkI1K20zTnZJRGxHVW5ZeEJJeUFlUjcxMnQzNE84UGZGTDRUNlBxZmcyVXRlNlhZUndOQXpFdUdUSUtjWXdDY0VkdWFwZkRxeDBtNDhBUHArc1IzYzFucnRrczN6cVNiTnczQlhIR05wNXdLei9DTnJyUHc1MStMVnRBdS9Oc0xtZFVjSXdLc1NRMnhzOEJzYzQ5cTdrMFl1Y290SmxXNHNOUXRMR0JkVXNITEVBUGtuS2tISEpQZnBYQmZFT00yMnRXMTJiakw1MllsNE9mNml2ZmZpWjRVMEt3K0k5MWFQcWlYRVF0NDVQOUhZWStjQWxDQjJ6bjg2OFkrTE9oV2s4QWtzNDhMSExtSWs4bGM4ZFBZVXBMUTdZVFUwWE5FOFNNbW5DMmxpYVQ1UUNBT2V0YTN3NWVieEplemVFTGJ4VmJhYTEzSmlLZStReVJLYzRDdGpsU1NldnRYSGFOZjNjZDdBaWtCVnh1SkhVSGluTGIzUGhuNGhyZndsekZkb0pGSlBVK240R3NpM0d4dS90RGVHUEd2aHpVTk04TmZFSnJTNG1zTVNXbDNaVGVaRkloSDNnM1UvajdWYjhIWGtrVnBGZDZYTHhoU3JkY2tVdnhDdXBQRTlyYlhOeWZNK3pXcjRCUFFWVCtFZW9SM3hhMHViZFkyNklGSEdPS3dsdWRFRytVOWExTDRwNmZhZUZqNEkrTGZncUcrMGEvczM4clU0MVl6MnR5Ri9kOVA0YzlmclhqTTF2b3VtMjh0enBUWlM1QlZNQThrRGo4TzllejNtbXhlSi9BQmt1TGNFd01WSUk0eVAvclY1djRnMEd4czdHSVdxS0lsZkxBZHUyYTU2dG1iVTdwbWZwN0o0bzhHVDJzY284MkpjZ1o1NE9lMzFyZXNZSkk0N2RJbnp0dHdHR2ZhdVE4RGlXdzhWM1doeHpqRWlaSVBUR2Y4QUN1d3VtRnQ0cGdsM0JGTURJQUFjZDYwcHU4U0tzZGJtVHJOcForSXA1dE1FbTJSTTRPTzVOWW5ocHRVczdxNzBqVkhXS0FBaFdIOFZic1V0dGJlSTVQTStWWkd3VG5ybXQ2NjhCQzR0enJWcGJMSXBHUmc5TTF2SFE1cG5nL3hrdVladkVGdFlTUmZkUWZOMkZaUGgzUjduVzlkWHk3WjNUVDFNODdLcHdpZzRCUEhBNXhXdDhUSW4xRHhmcDhVRUpmNU01SEpHUFd0djRCZUN2RTNqVHgvSjRac3I1NHBkY2dsdE5pWUFjNXlxdDdad2E1c25TK294TmM1ay9yMDJjbDhldkRFY3N0bnFtbTNDcWtTL1p2dm5CMmdFRVo2YzEzbjdMMTJiL1Q1ZkJzODZ6WGFxdDVhQlNHWU12VUE0OUIrdFV2MmsvZzE4VWZnejRTZ3QvaVUxcEo1bXBFV3YyVzUzTUFBQVdQcG5IR2E1ZjltTHhtbmczNDBhZmNyQmhaWVhqWkNUOHdaU09xMTZxc21lUGR5MVJTOFhhRFByMnVhdEN6UXhYUzNqdElrMGdEZGVtRDFyQzhFMnh0OVN1YmJHV1lFSG5PU00xcmZHZlU0N3I0cGFqYy9aVlV5M1JMUm9TTVpKL1dzN1FvclMxMVZabzFaQXdHNEExNTJLV2pQVHdPczB6b1psalRVWXd5OHJCblBicFhOeUFOcjF4SUdDQkRuR2U5Ykd1WGpXV3FyNVRBeHlSRERFZjA2MWlRd3JOZFRrdmxpM0JQMTZWeVU0dmxQV3JTWE1pN2V0SHVlRk9kbU1jOThWejJxNURidW5QVDFyVm5raWU1dUg4d2hRUU9QcFdSZFhIbXhNdU1nSGhqVzlHTFJ3NG1weldScXhDV08zYTRrR0YrejhmalRJV2hrMDVJMU9jT1RqMHA4TWh1dEpMTTI3RVlHS0lMQmx0WTJEamJqNWdLM1RPV1M1aHVsNlk4K29CL05HRmJJQXE3TGRmWkxpNHVHK2J5a0pVbm5uMHJPdWJ0TGVSVlJ5QmtiaUIwcVNHMkdvNmdsaEF6cWwwNnhzV1BldEk3bUU3STdDMjhkZU1OWThBNkpvSGlMVWZ0R2xhZGR5bTBoUkJ1aExIbmNRTXNQUVpOWW5pQlk3dVNLRFQzOHhYUFVxQWNuMitocCtqYWRQWWFtaXZMc1JKQWpzUmtEbnJqOEtqMWU4TnY0K244TjZJRE82T3NVQVFFN3BXeHdPZW8vcFZTdEZPVDZHVW5OdmxYVTl4L1lhK0Iyb2ZHajRzV0h3ODB1MUwyRU1pM09zM1FYaVFMajVTY2NZR2EvVUQ0a2VJWCtFSGdkUGcvNGQwaDRiU3hzNFRIZjJyaGRoSXcrNWY3eEdCNjE1di93VEovWnd0UDJhdmdCZGZGZnhoYXgvMmpxRnY5b1puQURGZHBJQUpISVp1TWRTQlhNZkVQOEFhQ3NkVDhXM2RycW1vRjlWdkpESWJLRlNmTFZqOG9iKzcvV3Z5N05jWlV6WE1Hby9CRSt0d2xDR0R3aWIzWmpYMm1hTnIycHZyZXAyWDJ5NkxueTcyVWt2bklJeCtQOEFNMVVqdXJpK2creXoyYlF6UlA4QXZHejk3c0FEMjROR2wzOEgydHJ0NG1WV2JDdzdjcnlPTUVWbmZHTHgvcEh3dThNU2F4YnVzbXAzbTZMVExmcXpTa2Y2d3FmNEZISnJwbzA1TnFDUnp6bW9weVo1NzhiTmV2TlRiVXZCL2hUeEpEcDBWbXJOck4wUG1kVGpKaGpJNzdSblA0WXJPK0FYd24wdnhONFkvd0NFcHZkQ25mUkk3dHZzc2NoS3ZmT2pIZEk0L3U0eU9tRGpOY2Q0TitIWGlINGdlTzVmZzlwZmlJWDBPcnp3MytzWGZsaGpDcFhkTms3dURuakgwcjZaK0oydWVIUGdKOExZTk8wS0cxanVoQjlrMFVTdW15SUlwVnBtNCtZRHVmV3ZWci91RXFNTjJjbEw5N2VwTFk4OCtKZmpueGphNkw5Z3RQRStuK0VOR3RtQ3kzTTBvU1Y0MHpsVVgwSUl4aXZJOWY4QUhIN05XdU9saGNmRnEvdTdwbEg3OTNtUU9ReDc0OStQU3VMMW40dmZCclJwYmdmRW5YYisvd0JiYWZjMXhjS1psWXRqSUF6OG81NDQ0eDBybS9HZnhTK0Ezait3azByUUZXSytpZ1psWm9naERxQXcyc0J5dlhBNjE2dUd5dmxoelNSeVZzWmVWb25xbmhpNjhUK0JOVWs4VC9CYng5Y2FsR0FXdXRGdVpUS2x3bkJiYTNZK2hyN2svWU0vYVFUNHAzbHZOcDgwMXZmMjAyTGkzbWtKTnMrVndjNCtaZXh4eGdleHI1ai9BT0NiL3dDejU0RDFud1pEOFV2R3ZpSHlwbmhlVFQ3WU9OaElJQ2J4d1R5djE2VjlJK0NmQ2ZnRDRhZkYyNThSZkMvVERJdXJvZ2FiTENOWGNwNWthZ2tramR1YmRuUE5lRm1Nc05VNW9MNG9uZGgzVVNUZXpOdi9BSUs1ZnNVZUFybWJRUGlwcFBoZUtIU1BHOXZKTGNXOFVKQzI5L0VSNTZLQjkwTUNIVWRqdXI0ajAvd1RvLzdObnhiOExlRk5OMDZVNmJmNkZPa1Z6SzV4SGR5T2NqY1JqT0FBZStEbXYwVi9iMC9hMjAvVXZnejROK0I2YUpaYWxxMGVyWFdzcVpibFVNY1NSbU5jSHR2Wmp6M3hYNXZmR2o0MG40cUdiUTlTMDg2VnJOamNlZGJRU1NnYnBRRkFNY25VZzhnRHYxelh0WlpHcmlzdjVKOWpocjh0S3ZjK2dmMnpQQTNqUHg1NEE4R2ZGSHdwZFRwUFl3dnBXcXlXN01rU0V2NTF1K1IyT1NPQjNyeDN4bk44WHRXOEJqNFErSS9pemNSYVhjU1Ivd0JwUlcwWHpUaEd5cXUzb3JaYkhRNHIzUDhBWkErTzJxK09QZ0JOcFBqRHcvWmkyTjJMQ2RXVUZwU2hYTEtyQUZTcEJ3UjY0cjA2ZjlsWDRMYXpwSjhWNmw0cW4wZTNZZ1hjbHpHWmR4TWVRcHlDQWVNWkhIT2MxNTFERllYQ1M5bFZXcU42a0t0UmMwVDh1ZjJsZmh2NGk4RCtLWDFQV21hODAyZTNWN0s4OG5DVElvSEF4NllPVFhnR2s2YzNpM3hjbWxOcHN1THVYWkVzQ2tzck5qa0R2WDZhL3RsZUtmZzM0bCtHT2krQy9Ebnc2dlluc0xpYXl2Tlh1WndzbDBwUEdZeGxSdDVHL0FIeTQ0cjV1K0gzd24rRmZ3NDhRcDR5dGJlN251NEgyd2ZhVlVvc2pBYk1aNDVPY2owOUsrcXcrTXB1bGRIbDFNUExuMU9WK0Zmd1F2UGh6RlBxbDVyRXd2MERMRGJRRHlpcDR4dUo1NUNuL0pyNm4vWkorQzUrSWxuYy9FejRuNmNnOE9hQklFaWlLbFRxRTY1WVFndDk1Rnp5UWV1UFd1WStIM3dtMXo0cGZGMC9ET1BVd1loT2JyV2IyTlJpMmpHZk01R1JrWjJLdlFuMnI2L3VqNFk4UCtEYmY0ZitFN0JJTkUwdUZiV0d4R0Z6a01DN0RxV1k4bjN6bXZuTTZ6Q3o5bEQ0bWV2Z3FDakRtWlI4YitON1c3OFB4YWpwTnVzc1BsaG9ZRlVBa0RoVndNYmVNL2xYTWZEN3c1OFRmR0d2dHJXcVhmOEFaY0FKWldJTFBrRUhJVTU0d1J6K2xhbmt0YXp3NkZZTXJTeGxTeWdINVNHSXh6eGtnOFZyZVBQR253KytFUGdCdmlWQkswRTBtbCtXMEV0eG5rSEJVZTV3MmUyT2M4VjgzR0hKRHUyZHNaT3BLNzJSVCtPMzdRZmhIOW1md1BxYzJzMzBMNm5JNVcxaVVxTXhxRGpwakhKNkhzZWEvTHY0M2ZIajRnZnRCK01MaVdTNW1kWjdnN0F1NGduSjdEc091S3MvdE0vSG5XL2p0NDd1OVZtMUtSclVYSkVVVzdLOVR3QjZkSzVuVGRmbjhMNlRQcEZocDBBdnJxSGJGZHFQM2x0bjd4LzNqNitncjZ6S01yV0doN1dvdmVmNEhtWXpFdXJQa2hzWkdzUzJQaEtGdExqaFc0MUpNaHVjaUlucXpFZmVKL1RGY3ZwdWl0TE9kU3ZqeHZ5UTN2V3pkNk9OT3RqY1hsMFdtY2t2SXgrOFR6WE02ejRsWXFiTzI3ZDFyNkttblBTSjUxUnFDdXpVMXZ4RmJXUkVWc3cyZ2NBVnplb2E1ZFhwSUxuSFltcWNqdktkOGttVG4xcG1mYXV1blJqQmVaeHpxdVFySEl5M0o5VFNVVVZzWkJSUlJRQVVVVVVBRkZGRkFCUlJSUUFVVVVVQUhTcElMcVczY1BHMkNLam82MFd1Tk5yWTJ0TDhTT2pCSjJJOURYU1dXbzI5L2JlV051OERoNjRIcFZ2VGRYdUxDUmNNU29QVE5jdGJES1dzZHpvcDEydEdkbnFsbkxhd1J6SkNxc0RrT3AvblRiRXdYMjU3aE5rL095UlJ3YWRvZmlpeHZyUVc5K0E2dDFHT1JVV3ZhVTlxNjNtbHlrUmdaQ3ExY2lUWHV6T3BPeXVqMWI0Si9IN1VQQk41Rm9IaUc2ZU9KWkI5bXZFYjVvam4rVmZkbjdPM3grZ3ZZb2JXUzZJdUhRS0Y3TUdHM0l6N1lKRmZsM1lhakJmUi9aTDRoWEgzZWNWNno4QmZqaHFQaFBXTFhRdFExQmxNVXcreVhSSkdSbjdoUDh2U3ZDelRMZWFMbkJIZmhzVnJ5eVAxeThPZkgveHQ0WjFDeDBmVG9JNTlPbGNQZkYzdzhmemdmTHoyeHhrY1o3VitnM3dJOFVlQnYydC9ndGYvQUFTK0xGc2IydzFteC9mK1lvODJDUW5FYzZNQjhraU1BMmZXdnllK0JmeE0wYng5cGNFRjNjQ1BiYmdYTWF0aVFrOEg4RGtaOWNWOUMvQ2J4bHFYZ3ZXZEgwdnc3NGsxQ3pzcE5TaG11aGJYV0N5UmpwbjB6K1k2OUsrUlVZNGVxcWtOR2owS2tIVmhabmkzN1Ivd2srUFg3QVA3U0Y5bzJpaU43N1Q1MG5zTlFFYWxiKzJNbTZLNFJYSkQ3dWhIR0NHR1FlYStNdjJ0ZkJ1dStMOWZ1dmlIQmEzRXI2NXZ2R2FTM0tndXhKbEdGeU1aQkl4MjcxKzlQN1dYN1B2aHYvZ3BSK3k3RGRhQTBTZVBmQzlzOCtpenFTb3VZOEJudFhJR1dSOEFyend5ZzhjMStKL2p6U3ZpSnB2anBQQVdxd0VXT2xYY3YyalRibUw5NGdEa1N4a2NrWVZXR0NlSysyeXZFVThSRG5XNTRWZW5Lbkt6UHp1dE5TdnZDSGpHYVdPUGNVbGVPV01keGs1RmU1L0J6NEFlSWZpQllueEpaeXZCSk1kMW1jRUVOa0ZUMDlhK21QaVoreUI4Si9pQnBNWGk3UXRHc3JEejdWYnQ5MGFoOTdGOFJFRnV2eWJkdytYSU9UMHJVK0YzeEcvWjA4TmVDby9oUHIvZ2VleTFtM21FVW10UnQrNjNod04yUTNIeW5hQmpCeG11M0ZZdURlMnEzRlJvdGRUbHJIOW9IOXNiNE4yVVdqNmxQcE4zR3lCWWJuQlppT01IQTY5Q2VuSnI3YS80STdIVnZoL2ZYZnhZK0pWK3RqRDlxZldOV3ZMa2xJNDFVYjNjNUdBTVpHZjlxbmZDRDlpbjRDK0k5UnM3KzlMM2M1UlpJeGZYUWJmbHVDRkdlUUQrSlB0WFIvdGxhTDRtK0JQaFBUdkFmaG53SjlxOE1hNVl5dHJVNWlhT0tTVUl4aXMyWmM3U1FBeEJ4a2dlOWZOMWFtRHhWVlVhS3M3Nm5jbFZwdzVwSGp2akh3TDRKL2FndFBISHhnMVR4dG9taHcvMnhxT3QyTmxxWi9mM0JtbWVaRWpYam5hZW96eWNkNmovQUdCZmgvcEY1NFgxTHhwYkpIYjZoclVyMjBWekdtRGFXZ2JDUm9RMkYzUDZjNUZmTVRlQnZpaDQ2OFVpMThMWDM5aGFiYmlaYnk1dmJzcEZiK1VDN3B1T1JrcW1FR01nZ2M5YTkxL1lDK0tzR3MyMWo0Vkd1dkhiMjBoaWE1Q3FwVkRJckRLais5bm5IZnBYZm1jYXF3Vms5aU1JNFNxbnRmN1VuajNYZjJmTlBzL0FIZ3pWak40ejEyQnJpQ1dRckttblFqS2x0ZzVMT1JsUVI3a2NWOG42bmErTmRmMXVTKytOL3dBV2RWVmdyS0wrNWtKUWpnREJZS29Ya2dqUDhxL1NENGYvQUxPL3dROGZmdExQNHErS2x6ZWFrTlcwMjFqMDI0ZS94SEFJK0RGeHlWRERJQjVHZWNacjVnLzRLdjhBN0x2aGo0WC9BTFVzZW42dnJzOHZoeS84UHhham9LM0V5S0lGOHhsbGpiMXd3Qjc4R3ZOeTJwaGxGVWtsYzJ4S3FYdWZPcWFwOEJQRHQ2UjRjL2E0dWJDL1dSUHM3WE5zelJCdVZHV1U0NmNnZzhkT0srMS8yTS8yeUQ0MHRJdjJiLzJxcit3OGYrRWI4RWFYcXB1UE1tc3hzSVdhQzRPV2pZWUxiYzhEa2NjVitYbnhKOFkvc2w2THJ4MGE4MVdPNk1MTXJQWXN4S2tIcGxRTWpyanZXZjRIK052aHp3UDRqZzFUNExlSXBwTEZaQTkxb2R4S1NBZHVDOFpQOFF6d0QzNml2UXhPV054OXBEUm5MQ3VuTGxrZmUvOEF3VlIvNEptUmVHa2c4U2VBcnlPNnROVHQydlBCL2lpR1BDYW5DTS82UE4yU2RjamNQNGdkNHh5QjgrZjhFOHYyeVBFUHdPOGNENGYrTjdpZTFpaHVSQmZ3U3Q4NEFJQlBQVWcvbXZQWTErbW4vQlBYNG9lRFAyN1AyZXRYL1ozK0oydENUKzA1WG4wRzVJQmZTOVFDcjVVNk1COGpGbk85ZXdKeGtIajhwLzhBZ29CK3o5NDcrRVh4ajFmVmJuUTJzUEUzaGZWSHN0YWhTTWhKV2pQeU9PTWtNTVlQZFhybnBPbG11RmRHcDhTTjNGNGVvbXRtZnQxOEt2aUQ0TzhYK0dyZlY0OVN0MmdraFVoeStFTVlBemdjNUhQclhYK0R2SFBpSHd0NGd2ZkZXbTI4NTAwQ0FXNktUdkNKeXpyemdqN3AvSEZmbVgvd1NVL2E5MHp4dm9zUGdMWGIwR1dOUTJtQzVZbllBUUdoT1NNYlNCOVJqZzErZ25oN1dXdWZEZmxlRmI1Ynk4dUpYaGhtblJsUzNMQWNNdUJ1QzR4K1I2VjhWV3dzOEppSEI2V08rNm5FKzFyUzI4TS90U2ZCalZmaHg0LzBwSGgxUFR2TG1obEFZN1hUNVpCa2RRM0lQYkZmenlmOEZCLzJSL0Uzd0IrTS9pVDRZK0tMSm10NWZOZXljUllWc1pHUmpvU3dCSHMxZnViK3paNDcxM1NkZHM0dFI4UVFYSCtqcEJjUVF3QkJLU2VYSHVHSkdLODQvd0NDeUg3RXNQeDUrRVZ4OFZ2REZtbjlyYUhFdDNLWTRsTFRSb1NYeC90YlgvSmZhdnU4cHh6eE5CY3oxV2pQRnJVL1lWV2xzejhGUDJiUDJqN0IvaGhkK0F2Rkh3NHM1dFEwNHZBem1YWVNtNEtNcmpJSUdSbjJGYmY3T3ZpU3l2dmkxSDhLL0ZWaEIvWnV0YTdiM2MwcEFWN2FXSlpsVW9SeUZZdU1qdnhYbW54ODhKYWo4Sy9pVGJlTnRLaEs2ZGNxc04rMFhBRFk1NFBRa0hyNmcxcGVDdFQwK0x4TE40djArOUN1bGdrdHRJcmRIVWc1ejBIU3ZwYVUyMmtZVkl4bEI5ejFmeEg4TzlhaThWZUx0UzA2THpJZFBmYVdYMEpiamtEQTQ0UHRYa0hpaTZ1WDgzVDc5TXUyVXlSMHdSL2oxcjZNK0JQaVNMeFdOYmdPc1c4cDFhMllyNTVHL3dBNE1SdEJQYzdobm5ITmZQOEE4VzdIK3lQRzF4cE1hQU1qNEpKOXlBUHIwcnJxUVNqY3l3dFJ1WEt6bExGN1o3bEZWczdjQ1RCNUhhdWoxenc3cW11dzJtcTZNSXBtdExXV1I0MllibVVkY2Y0VjU5clZ6ZTZMNGwrelJxZGt5aDE1Nm4wNjEyL2dqeHRhWGxnSU5Yc3l6UXRsQXI0SzlpUGZrL3BYRzJ6MDdxUkY0SDhVeGE1ZVQ2VnFGdTBaRUcxR2JvZng5YXIrSFJlZUh0Y25XSmZsUjhsdmJkVDU1TGVDNGJVSUVDWk9SNmdkZXRUUk41eUpmSzJUSWVjQ3NXOVRhTWJJOXk4QjNWdGUvRHpWN1dVRGVpaVFLZXVDT3ZGZVk2NjE0SkNZb3k2RnZtUW5HM3BYY2ZEQ0dhNjBlNG1rbUlkN1VJVkhRNEJ4WExhdGJ3d1RYRUY3UEdpSURtVm1IVDYrbFlWRnpIVlRzbmRubk5ucVVPbS9Fa3pTeE1vZU1JM0hUdFhhK05kVXN0STBvK0tXam1uanQ5Z1BrUjVQUFg2VncrZ1MyZC80ak0wa2lQR3M1VkdJejN5RFhlZUx0Vk50NE4xS3dWRldHWDVIVmh5Vjl1ZmFxcHBvbXZxamxmRU4zZWk1c2RTc0xkekZjcUJtUmNZNkhrZHE3ZjRkK0tnZFdqMEMrdXp0ZGZsUmoxUFN1VjBFMnVxYU5ZUVhjek1ZWHdvSjZqSHIzclA4WjJGeDRaOFRXWGlTeG5aR2ptQjI4OU0xMGMxdFRpYXVjZDQvdkpmRHZpVFQ3cFJ0ZnlTQUQzSC9BT3F0UDluL0FPS0wrSGZqZG9tdVQvSjVONlhJVGpBMjkvV3MzOW9pRzBYWGRMUzJ1RTNHUDVqa2NlOWNUcGR0ZldYaUdJUkg5NHVTQ0JuZ2c5SzRNb2JXR2lqb3plS2RhVFBWUDJ3L2poTDhWNElMVTNBbEgya3NNY2RDYTRIOW5PWFNyejQvK0RsOFF4b0xlUy9XM3VOK01iU01ET2ZyK2xVTlg4SXl5NjJkQXNkU00wc2R1SlpHa1E0eVFDUU94NDZHcVhnSzExZlRmaURwendSK1ROWjNpeWwzWURhVk9jbXZWakp1ZXA0c1ZGUTBPcC9hSDhPMlErTXQ1cGVpT3JGTDJTSEcvd0R1dnhqUFFZOWE1MndqYUhWRlFqTHh5YlNTZTROSjhSOVQxYlYvaVhjYXpCcUhtVFN6K2FTcmM3ajFQNWQrOVY5SnVaWjd2TXEvTTA1TEVub2M4MXpZcTd1ZWpnckpvOUVIZ25TZkUzaWpTN0M4OFJXOWhCY1djalQzVndma2oycVdBNzlTSzgxMXFDVFRyaWF6U1RMQnM3bDdnSGcvaU1HdWgxaTR2VzFDTkpKQ1ZTRVlESGcxalBxRDNtb3pQZVd5bDFRQlRqb0JYTlNmdW5vVjAzTXpyZVZvOVBhSmxKSkp6MXFvMGFtM2tjalBmYldzc0NDRjJ3QVRuR0J3YXBUV2R4NUxQSEdjWkdlMWRNTnpncXhhVnhzRjNlVytqdEU5bXFJZXJ1eHppcnpYOGsxaEY1Q2tLd0Noc2RhejlRbHRXZ2p0YmZ6Q3dYREZ3T0Q2VmIwcTVsanRrdExoUGtEWlRpdHVVNStadllkZmhZb0kwTVh6QTVEWTQ0L3lhNkhVTk1pMGl6OE5hdnBFRFMzRjdhdGNsUXVjdXJzb0g2ZnBXVnE5ckJCKzVhNFdSZ3VkaS93bkgvMTY3WDRaUlJlSWJyUm1MTC94STlIdTNsQnhsUUhKWDhjdFZ4MFpqVVRNd2F6YitIN0Y5VzhRYVhLdDJvTW01MStVZERqbjY0ejdtdlJmK0NjZndNdlBqejhmNHZFbXEyWmVLM3Uxa0laU1ZhWjJ3bzZIN295ZndyeXY0OFhJbDFXejBEVEx1U2VXZjcwWWI5QjdHdjAxL3dDQ1kzd1dUOW52NFlhTDRuMVhSR2ErMUcydWIwWE9BcXhPa1dFTC9peHgwOWE4UGlQSExCWUZ4WHhTME8zTE1PNjlkU2V5UFgvano4U2RZc0ROOE1OUHM0N1hROUlXT0pHUndIdW5VS0NUZy9LcWc5UjYvU3ZtaUh3QllOZnplSTFCbHZieThlVzVmWjgyd0hJNzhENmUvRmR6OFNQRUQ2aHIwMDkvZGhwMm5kNGxqQVBtT2VUZ1k1d1Nmd3hVZmcyenRvd1hqVWwzaytjTm5rc09tY2NDdmc4REIwcWZNOTJlN2lKODlTM1lYdzVvR21YZGpOcWVwVGVRa1FaNTVaQ2NSUXFDeGNramtBWVBhdmtiNHBmRUdIeG40cTFiNGpQTTQwKzJEMnVob3dLZ1c2NXdRRDBMRVpQUGV2cFQ5c0R4Vm9uZ1Q0TXdlRUc4Mks5OFNUbExoSXg4NldTSDVzSE9WRGRPbUNNMThrL0dyVmZEei9EN1Q5SDhINmZKRjlydUk0QnVVaG1HMzZZNm50WDFPVllkeXZWa2p5Y2RVdTFDSjlCLzhFOVBoYnFWM2JmOEpzMFczVS9FMXlSRVpDcEVVSFB6REo0T1JrZmhYRS84RkEvaVpwdDM0MzhTM2NYaUJ4by9oOVJwR21JenFSTk1nL2VFY25ySmtISFhHZUsrbVBoRUxINFIvQjY3MTNmR1pmRC9BSVFMMnJoRytXWFlWSFR2azlPdzVyNEYvYVQ4SnMraDZScU90bVJyWXp1ODVmT0hsWWJpV0p5ZVNlbnB6M3E4dmdzVGpwVlo5eXNZM1J3eWhFK1EvRld1WHV1YXZOZTNrek1XbFlnTTJjQW4xcWhiM010dE9zOFRrTXB5Q0RXMzRtMGlHZlhMaVhUb1dXQnBENWVWUHJXVk5wVnhIdVlMd081R0srM2pLSExZK2RjSjN1ZlYzN0xYN1gxcjROOEsyUGdqeERxclc4VnB4Qkl4d2hVa0hCSTVIWCtkZlJaL2JPOEM2ZHBNZXNIeE5DWGcvZVJKYlQ3aTVQR0ZVZFByNm12ekJndTdtMWJNY2hIUFB2VzlwdnhIMVRTNDR4WVdOdkZKR3dienR1V0pHUFg2VjRlSXlHaFZxdWE2bmZTekdjSThyUHZ1MitNZmlENHplTUx2eHI0dDFrVzl6TEFzVnJhU3liREJhS0RnWWJvVHdTQU9mcldCWS9BalZmRzNpUzcxbUd5YWUxTnl6Vzl6Szc0TERQQ2pHYzlEK2RjRit5SHJXby9HenhITjR1OFZRUjNkN0M4VUVjZUFzYlAxM09vUElBeng2VjlYYTM4TC9pYmVMYWFSSjhRMnN0UHVnWUVUVGJVUmdNdjhJYkhIeWpybkhJcno2bUpXRG45V3A2SFVxVHFyMnNqRitGOTVhK0MwaitHTnJxb1o5S2s4MG9zd1V0TklDY0E5UWM5c2RxK2dQaWQ0NitOWGdQNEwrRy9IWHdnMER3OTRrOE96QXdhekRmeEVUUjNrYm1RUnN4UHlxVnlWT2M1NkRGZkhQaXo5blIvRDNpTjlROElmRVdLRFZJcDlza3MrcHE4aGNOd2VNRWtqanIrQnI2dS80SnlmRkNMeEZyT3Jmc3VmSFN6aC9zenhqYW0yaWFaeDVTM1BsL3VKa1BJVW5rRWpuTzJ2SnhGS25TbXFzdmVYVTZxZFZ6anlvOFo4YytMdmg5OGNiOTlSOGJlQmRROEp5cGM3dFRrczRQdGNFc3BRNzVBZXpNY0FBbkhCUDB4L2lZL3dDaytHVU9uZkQzd3ZxcTN0dmVpNnZmRU9yc0VrbFpVejVDS0QwQjY1eHdjZGhYbzN4S1RSZjJNZGU4VGFIY2kyMXZRdkdNVjNwVjNwRjVDUkpCY3BJZkx1SXdXQUVrVHJoWk9qS3g0NzE1eDhHdkRFdnhzK0xOam9PcFd6UG91ajdiN1ZqZ241VU9GVEpIVmlCa2R3RFhxS3BDalNkVG90akZSZFNTaWoyUDhBWkcrRWFmRFB3SC93a2ZpOVJGclBpb2k2dTBsRzB4UWN0REZuSHlrOVQ5ZmFqeFplM3ZoenhKTHFYaFhYN3k1c251eWJpQmszZ05nTXhCUFhrTmowNVBVMTJIalB4WkhZNnRFODhiU3gyODZxWTloT0NkeTdlbzRBeGo2ZTlYZmczOE5MUHh4NHJYU2JXQVA5c25lS05EZ2NPYzVHUmpBRzRnK3ByNWIyejl0TEVWRDBucEZRUmY4QWhYYTZScEhoVzcrSVd2V0p0WTFEU3pUemtISHk1Q2c0NUhKNytsZm50KzNOKzAzcUh4bThiM1hndndoSzBXbVJPZk1XSW5BaVhPQnh4azhtdnFUL0FJSzUvdE5lSGZoSHBrWDdPUHdvdTFSYmFQeXJ0NEdBTE5qRGREWDV5aURYTERUV25tVS9hdFljdDVoenVLK24wcjE4andVc1ZQNnpVV25SSEppcS9KSGtqdVV0R3RMQ081QmhpOHk0KzdBbUJrZTU0cmZQaGkyMFBUcE5YMWFWUTcvTXdZL2ppdDc0WStDZEwwZXh1UEVmaVdiYTRVc3Uvd0NtZS9ldkl2aTk4VUp0ZTFlZlR0TGt6YW94VTRQRGMxOVZGU3IxT1NPeDU3Y2NQVDVwYm1INDU4WE5xZCs5dFl1ZklSaml1YkxZK2JIWHJTYzlRZnJTWkpHTTE2OU9uR25HeVBKbk9WU1YyS1h5TVlwS0tLc2dLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpbFVaTkFFbHBlUzJrb2xpWWdpdXAwSHhBdDFBSVptejZwNmU5Y2t3d2NVK0M1bHRuRWtUa0VIdFdWV2txaTh6V25WY0hib2RucWVoaVZmN1VzWHlWNXhTMmtpMzF1Wm1rMnpJZHlFSGtFY2cvNTlLajhOYTdEY1FCSkhBN01oR2MwN1VZQnA5eC9hRURaUTU0OU0xeEs2bHlUTzI2YXVqNlcvWlYvYVh2OU0xYXlhL3VHTjNhaFlicUxQRTBZSXczdWZXdjBUK0dmakNQeFhGb25pclI5UmpkSmpJSVl4S01zeFhKR1BidjZWK0x1ZzY3ZGFKcWtPdTZhNVNXSnd6RDJ5TTVyOUNQMkZQajlwWXRMWm96R3lUZy9abWZyYXluQWRRZjRTUlh4dWQ1YjdHZnRZYk05akI0aFZJY3IzUDFZL1kyK04ydGVCTmNna3Y5U1pZVEtnZEF3MmdGengvdlk0QkZlYS84RnJ2MkpOTTBEeGRwUDdZL3cxczFoOFArTVpGdC9FcGdRWXNkUlpjck1PT0VsWE9mOXNmN1ZlZS9EN3hkSi93bk5zbGpxT0ZrZ1NTSldsMmhDT1R4N0RPUGV2ME0rRXA4RS90ZC9BUHhMK3lyOFU1dzlwck9sbUtGL01CbWdZbk1Vb0krNjZPcXYrR0s4L0o4VjlYeEhJM3VMRzBlYUhNdWgrRS9qNzRsZUh2aGY0OXRyUHc2TFhYMHZvSTJrRTZiakhNV0dWQitVaGlRdkFCSFhPUlVQamlDL3dCVHNWOGR2K3pwYVJXYlRxNDFLOCtVT054dzU2WlBCSHBqSHJXMyszait5RHJ2d1c4WWE1OFAvRmx1YmZYUERWN0ltK0p6KzlLZEhBM2NoMHc0UG9hN093dmZCdnhCOE8vRDN3NFBpTGQ2M0E5b3R4ZDJWNUlxSXJMR3FIaGUrVUs3U096SCtLdnNNUXFmcy9hSG0wcHR5NVR1L3dEZ24vNGg4YStPL0dNT20vRS9UbTBMUjdlSUxZTmF5RmNuNVNTeGZxQU5yQStweFgxZDhRUGc3NDMrSy83TUhqSDRSMlB4QXNOWjFheThUV3Q5b1VWektxVFhFYUtWWkM1NjVVQVkzSE9EMUZmTFY3cmR2NEtsWFFkTzFxMDBObFhmZGFuZWtJdHNHWS9JaWtBTVN2T00vd0FxOG44ZVdQaER4QnFpNjM0WC9id3ZyWFZUSkhneVhJRVJmSkE0RERqSFR2Nml2bG9VS2p4ZnRxZWlQU2xKZXo1WkdGOGZ2ZzU4Wi9nM0JxUGhQeGQ0VTFDeGE5bVpibHBvaXFURnQvM0dHRlliU09jNTVyNTY4SytMZkd2N0pmajYyMVh4RnAwdjlrM3NvZXl1MlU3V1hJT3c0UHlrREJ3ZjhLL1YzOWlQeGY4QUdYeFJlLzhBRE9IN1RUNmQ4VXZBR3NXUytacWw0aXBkNlcwcTdVbVNWeGtGY0xuM2JnOFYrV0gvQUFWcDBENGkvQ0g5b0RWUGhiSTdIU05IMUthMFNObzR4dVpXeXJOdEdjR05sT2VwNTlLK2x3OVdPT2k2VWp6M0dXSG56byt5L2d4L3dVVzhKNnhkUStJTHZ4SkFHZ2pPeGpNRldQcXdZNWJqM3J4Ny9ncmwrM2o0ZCtQM2dXMHV0TDFWWkpOTTB4dE0wbTdWeUduZVJ3MGhYSjVRQUQ1dWh6aXZnSHc5SjRsbm5pRnJwS3hBcUpDR0IrWSt1UFg4Nms4ZWVHZkZ1djJxWHVzNmhKTkhDb1dPTW5DUit5cjJyTERaSlRvNHRWTDdGMXNmS2RMbHNlV3l5TXo3czlldk5XdEgxRzZzN3RKYmVka1pXQkRCc1lPUnpSckdsVDZiUHNsNU9jY2ptcWtiTWpjQTgrMWZXV2pKZVI0cWJVcm42UGY4RWRmMnV2RVB3NytLOWlsM3JVZ1M2dlk0N2tIbkVnWkR1QUhBWXFDZitBNHI5SWYrQ3lId2U4SC9BQkFoOEUvdE4ybGxDTFA0ZytINU5JMTZjUmtCdFF0NHQ4RXZBKzgwWkl5ZjdnSGF2d3AvWlE4WWFoNFMxbVM5dFkyWVEzbHRLRHVZRElmYWVSNmdrVi9RRDhTN2pUdjJndjhBZ2tCZGF4ZkJaYi93aGZhYnJsdVhUWnNBY1JTNEl6akt5T0RqQnlDZUsrQ3g5TDZobkNuRGFSOURTbjdmREsrNlB4UCtGSGo3WFAyY1AyZ2x1TE41SUkyMU1TUnhsaW9qbEQ4ampBR2VuNDErN0g3TS93QWJ0SStPbndpc3RhOE4yOEUycFNXcWtsOFJwQkxnRnprOVRqQjY5dWxmaVA4QXRvK0U5R0d2WFY5NGREbTV0Mzgwc2dZZk5oV3p5TWduSit1TWl2cmIvZ2o3KzFmcUVFTVBoUTZwNU8rUlNWTGs3V0pWU1FwNHpuUDROWEx4RGhPZWlzUkZlcHJoSnEvSXo5WHZDR2wrSXZEZnhOMDd4YnAvaU9WN2VOVkVzRnhKa0ZTeExNTUhCQTlUMHI3TDhGNjdvM3hNOEZTMkZ6R3M4YlF0YjNjVGpJd3k3U09ldkJQUHRYeEwvYjkvWWFMcCtwUWFaQmVvMWlVYTRMWWs4d0FzRGowNjhBZHVCWHBuN0hIN1Mrb2ExOFRMbndwNGk4TDN1bDJsNU45bjArYS9jQjdwMUpKYllEOHZVOCtsZUZrbUxlSHhpVGVqMFplUG9lMG8zVzZQeVMvNEtRL3N2Vy93MStNdmpQNEkrSnJUWkFMMmFYUjJNZVE5dkt3WkNHd2VSa1kraEZmbnA0RzAzVjlKOGJYSHc3MWUvYUdQN1EwSVp6akNsZ0J4MTVyK2hyL2d2Vit6M2E2MzRBMG40N2FWYmlLNnNYRnJmenhMbGlvSktuMDdZOXdjVitDZnhiMGpUN2p4KzExcFdGdUV0RW11V1E4bkhUazl6d2MxK2xZU3BGNkhodTdqZEhzWDdPbG5ZK0Z0ZS80UnJWN2tBaTZqd1MrM0tzM1VlZ3dCK2RjMSsyNzRXbStGL3dBYVBzOWdDOXRjb2swSUtuQURkQWMvU3NUU1BFMm4zMTdwbHhGcUd5N2dLUVM0WUF0dDZObjY0L0t2cmI5di93RFpsUGpmOW1ud2YrMGg0UDIzc1Z0cGlXK3JHSlNkbnlncTU5czllSzl1M1BTME9LRXZaMWRUODl2RjJvaVR4Qm85MDUrYWNZSEh2MTkvclhRV3RxMXJyQWlWZHBlRGNCbkFCNm1zYjR1M2VuYW44US9DZW42SHBzYVIydWxvYm9SQTRlVXNTVGpIb0s2WFdiNExxdHBJVkFCRzNlZTRPYTRaS3pQVnB6dnFjOHVzNmhjMm1vMkVrSkFzN25BY0RuYVQzNXJvckRVYlgvaEVkL21EeklIQkdUMUdhb2FMZWVGZEE4VVhzL2lDeWUvdEorSjRJcE5yRDZIc1IyclF2cmJ3aThRdnZDbjJzVzhoeDVWNlFXVGpwa2ZlSGF1ZVVkVHNVOUQyTDRMM1l2OEFRbUZ1UXpQRmtnbm9jZGZwelhLZVBMYUs0TWxqZUV1WGtPWWp3ZXVhM2ZnUmMyMW5pRWtybUk3QXZyai9BT3RXZjhUTlBqbHVIbEh5TjVuTEFuMS8rdFdNbmFWanBXc2JuajNsd2VIUEdjZGhiMnorVVFwVURrQThkRFhwSGl1M2sxYndwSkpBUm1ZZ2hUakk0NzF3VnpxTm5KNG5HbngzQWJ5OFp6MUgrZUs5Q21sOG5SSTQyazJyNWVjZTQveUtaTDFpY3g0RVdNUEhaM1lJa2psSVk4Zkw3ZnJXNzhTdE1odllyWlk4Rm1mZ2c4WXJtRWx1OUc4VlRSaDhMY29ra1k0L0xGZFZlcmRUV2R2SkNva1dPWDVzK2g3MW85amsxVFBCdmlwZHByTjhtcGc3bUNBWkhRRHIvU3IzdyswTFVmRVdwdHJYaCswUzZtMDB4U1N3czMzaG5CeG42Z2ZqWEovMnBkWFBoS0dhNGozc3dDa3Q2WnJiK0Qwa1VIamZUcmk1MU40UmNYYUxLQkpnRmNaL0hrQ3NNRERraHltbVlTOW9tenZORGcwVHhOOFlQRk9sMkVpd1NSNk1peHJrQTdnTU5nREFQdm11SytHdWlXMTU4WFp0RTFTTWtMRE51Qko1Y2RUd1B4cDArbStJby9qdmZ4K0U1VysyWEc1b2xpQitmKzhBUHc2R3B2Z2xlM2RqKzB4YTIzak93YUdTU1NTRzZqZjVDaFplYy9XdlJVZmZQSmhzY0hxUmhoOGNUeHh6RXh4WExvckRnZ1p3S3ZlSFlKenJmbGlZc0RJVHlmZW5mRkx3L2IrSFBpZnJPbldEQnJkTDl6R3k5TnBPYW04SUxIYzM0MkhsT2NuaXVURVhzejBjSi9FVnpkMVNOaHFtRVBQbGZNU09sYzlkeXJiWDd2TktOaHpsZ0s2Qy91ay90U2VWMjRTTEdLNWZXb3ZOdU44Wnh1NmM5SzRxSG1lbmlkTmlaSHRtaUlzNUdrUDhPNU1DcjNodnd2cXZpU0NXNmp1bzl0dkl1NkkzQ3hsQjY1UDhxcW9wc3RNVDUxSkhQT09LeXRldVo3bTFXSzJCSFBKd2E3SVBVOCtyckUxZkZ0M2NhcDRna2t1TGRHZEZXTm5pa0RDVEhBT1ZHMFovem1xeGxaUExSbDJsR3pnRHJVbWphTmE2YnAwZHplYWtxcVJueUVHZlNvbzkxeGN1MGNmQkIyOGRCWFRlNXhyUXRsQmVUUzNpSnpJTnY2VjAvaEo3dndUNEM4UStJUE94TmRwRHA5cVJ6Z000ZGorUXJuTkdtalJIRnd2M0RrRDFyb3RhbnRML0FQWnk4UTZ1MHc4K3gxT3lXM1VrWi9lRWc4ZlFVVTd1ZXBGZHJrSWYyVWZDRjk4ZWYyb05Kc0w4TlBESGVCcE53eis3UXFmNlYreDNqalhiWDRjZkNxRzAwK1dJZlo5R1NPSkEyM0piT09CMTZDdnpxLzRJdS9CNjU4U2VMOVo4ZVBEajdMWk9rTHV2QllyZ2M5dXAvT3ZzL3dDUC9pRWF0WVdGcnExaWJDNE1NVVRXd3c2QmdPb0k2Z2pISG94cjg5NGxyUEdacDdPK2tUNlBMYWFvNEpTNnM1Zit6WU5YZ3QvRVpaa3VnQTZUWU83Y1R6eG51Qld2SC9hMTNkMkdrNlpwVVJsdnJ5SzFsbUw0RWNaR1hicjJBSnpWQ3pndFpOTGhpaWpZUnhvb2lZNEJMQWNkdWxZUHhXK0lzM3dyK0VPdmVOTGVSWWIrNHRqb3VpU3V6WkZ6Y2dpV1JTT215RVNIUFlsYTVxRk56cUtDUVZKSkp5WjgxL3RPL0cxUGkxNDkxUFhXMUJZTkN0SGExMDJTNExJaVcwUjJJUnovQUJINWo2RTF4ZmpTNjA2WFVQaDNwdW02NUhxK25UNmlyK1lxZ2xHM0xtUGN1Y2owejZIaXZCLzJudkhQMmpXYlB3NXBWMlJEYng3NW9vM3lyTjBCT0RnbkhxQjFxaDhDdkdsOWJlSnRPdDd4eWJlRFVJcmhRU2RxTUdHVGozQnI3NkdFOWpncitSODlLc3A0ay9ZanhCUERaL3M3ZUtYdW9RMXJxR21XRUVBSk9Ya2Fia0JRdUQ5MDllZUIycndldy9abDhmZkdlMWswWFZ2QVZ2YjZZU2ZKR3JYSGx5dGtydGJDZzdTYzhIdDA3VjNscnFYamJ4SHB1bWE1YjI4WTBEU1ZXZkt5QU5MY09SaFFEOTRLRzdyeG1zLzQxL3RLZUx2Z1Y0ZDArKzBQd3IvYW1yK0lKSGowbXlaRHRWRUFXU1pzaklBYjVWNHgxNlY4dGc2bGFLNUtXOXoxY1NsSjNaOGQvdFlmOEUvL0FCdjhDZkhGNzRUdU5PdWJIVWJKVmE0MGEvd3orVXdCV1dDVWNTeHRrNFllbk5mT3gwWjJlU3dhMjJ1cEt2a2R4d2Z4cjY0K08vN2Ivd0FSL3dCb2J4YmFhOThVTFZGbjhPYUt1bDJ5eHdnQllveWRpTVJqZTI0bnFPbWNkYThOaDhHd1gxamNhck02aTVrbDMrVUIxM2M5UFRrYzE5VmhaMTNUWHRkenpmWnhsc2VUeitDUU4waklkb09NZXRZK3I2SEhaQVNSTjh2ZXZYZFg4S1g4MWo1Rm5DWHVKQ05vV05tUFhwaFJYTTYvOEtmSDBkcytvNmg0V3Y0YmNnYkdmVHBBdWUyVGp2OEFwWGJDdFo2c3hxWWQ5alcvWlUrT2Mvd1M4VGk1dWxKdG5tU1FmTHVDc09NNDc4RTE5b2VOUDI1L0JueEsrRWsvaGJSTHVYKzBGTVVzY2tDbFdVSWN1ZlFBcmo2ODVyNFArSm5nelJmQjJnYUpkYURMZFR6WFZxVHFFczhCUlVtenlxNTlNNC9DdVFnOFJlSUxNTUxiVTdpUGNEdTh1UXJrZDY0NitWVU1aWDl2ZlVxT0tuUnArelo5Z3Y0MStDUGoxV3N0T3ZaTFM1bGJFY3N6c0hadWdiUFFubjlLN3I5bXJ4SDQwOEFlUEl2Q3VyMzhrZ2dtVzcwUFVkK1pJcFVBWmZtUE9DQndQWDZWOEgrSHZHbDdwc3lSWExib2QrVGo3eThna2cvaFgydit4M3FtcWVQdE0wclNrak10MXA5OUhkUlhzakRjMW9lQjE1TzF1T3ZjOFZsaTh2Z3FiaTltT2hpUGV1ajFmOXRkL3dDMy9Ia2ZqRmJGNU5TdlpEZVQzRnd6YmxsbEN1eWdaT1l4amQxUHpGdm9QU2YyWHROc3ZnejhFRjhSZU0xK3o2cDRtbSsxenZKRTI4d2s3WVFlbkhWcTh4bkdvL0YvOXBYUmZoakxiR1dCN3lLTzhrWWJpc1NaTWg5QmpucDE0OWEralBpWTNocnhINDV1N1JMU002Yloyd3RyU0IxSVJZazRQQTZkTzNHYzE4eG1kVGtVYUNQWndhdW5VWms2MWVXdDZUQUxaWlVralU0WG5jM0pCQjlLOXM4TTZ6b1g3UHY3T09yZnRCNnRDbHZJbG5KRG9wNHkwaktBV0F3Q1FBQUI2YmE4azhINkxhZUlOVHRiR3p0Y3VTcVF3c1NBMkR0RzBZOXdSWEYvOEZxZjJoMzhPV2VpZnNzK0Vyb1c4T2s2ZkZGZHh4dnc5dzZaYk9laFVaL092SzlrOFhYamg0OWR6b2JVSVNtZm4xOFJQRnZpZjQ4L0dUV1BHMnIzVDNLaTVlVm1jNXlBeElITmFYaER3L3FQaWpXLzdUMU9BaTJ0VUVWdEZqcmpyZ2V0TDRkOE1XK2ozS2FCcGtSZTd1RlZyMElNN1V4MFA2bjhhNnZ4NTR4OFAvQ2Z3RE5xVThTSmNlVnR0bEE1TFk2RHVlYSs2cHc5bEdOR210anlWeXU4NW5qUDdSL3hEV3dtL3dDRU4wYTRLbFFmUEtIcDdWNHF6NUIzSGs5YXQ2OXJONTRnMVc0MW0vZmROUEtYYzU5YW8xN2xDbEdqQkpibmo0aXE2MVMvUUtLS0syTUFvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQXNhZGZ6YWZjclBFZWg2VjIrbXkydXRXd21VRExMZ2ozcmdLMS9DbXR0cHQ2c2NwSmpZOVBldWV2UzU0M1c2TjZOVGxkbWRHTFFXc3JXN3J3UmhoNjE2WCt5NzhRcC9CZml3K0hMaTZaTFcvUDduNXVFbEhRL1U0eFhBNnRHOXhwYTZuYU1vY0Vic0hQNjFCcEYxTTRTOXRuSzNGdXdkQ0QwWVl4WG0xNFJ4TkJ3a2VoU243T29tZnNoK3pCOFFkSzFyd3ZhM21vNmJDMTRJOEdabUFaZHVNOC9oelgxdCt5UjhRWDhDK09VOFJ3NnBjTDl0dW96UE52M2twdXpnREo2RVlHUjNyOHJmMkt2anBkYWo0ZGdsTWdPL2liMFZ1RlA1RTUrbGZmZndQOFVhUm84bHRlNmJxZ0dvemIxTnUwNnFXYmJuQTQ0K1lqQjlmcFg1dGlxVThOaUg1TTk3U2NmSm5xMy9CZXY4QVp4MHp4YjRQOEwvdFdlRnJOUXVxd3BvdmlsN2RSaDI4c3ZCS3hPTXNWM3g1NTZLSy9NTDlsNzRieGVGZkVrcG11VW1YUnRTWlN4d2QwYkw1a1hDNUpHVkF6eGtraXYydjBqNGJhdjhBdFJmc09lTlBnUDRxMTE5VDFhNjBwcnpSSkpoa3dYY0tpVzNDbm9NT20zSFVaTmZraCt6eG9WOS93MFBQYmFqcXRyYndYc1VTYWhwdW9SRFpJMFVnQ3FDTTRmT1FUeVJqM3I2ekRZeFl2TDdkVHhmWit5eEZqblBqbmFhcDhZL2lIcXNmaUc5bVMzMDJhT0l5U3NVOHB3V0NoemdqTEVrNTV3Q01jMTgxL0czd0Q4UHZEVjFQSHB2aU8zKzBJU1k5bHlIQklQb0Iwd2VPK2M5Szd2OEE0S1NmR0RWZmg3QmRlQjlJTUl1ZFcxUzR1YitTMEpRZVlTd1JBQVF3VkZVZkt3T0MyTzFmQ2tXbzYzZGFnTHN5eU80SklaZ1RuUGF2WndXR3RoMFoxNnZ2Nkg2WGZzVS90LzJ2d3A4SjZmWWVKZkVJdDV0TWhNQ3pzK0dBVjhxeHlUdjllbllHdk92MjUvSFY1KzEzNDAxdjQzYVhaWlRXZGFXZU1PaXFmSmppV01PZW1OMjNPUmpyWHl2NEp0UGlKclZpaDBMd1ZGSUZ3UHRKVFBJd2VNbkhRZEsraWZnaHJlcFdmZ2k3MDd4RllwUEtRc1loeU0vdzVBOWp6eGpOVGhjRlR3K0lsVXZ1Vk92S3BCUnNlY2VITkdsdG1sc3IyMUN5Sis3anlNWkE0SDgvMHF6cmphSEhDZFAxU1ZVa0lJR2VCbk9QOCsxZHZlZUhaWjd3YXVmRDkrRDVMR1VDeUpBT1N1T0I3MTQzOGFkV3RsMUc0dUxUY3hhUGF3SktzQ0JuSkI5c2ZpYTlMbWk5akdjVmE1eFhqbndGZno2ei9Zc0Z1Skx4M1hiSEdRU1FlaEdPTVlyMW45bmYvZ212NDgrTXQzSEJKZHNaM2o4dzJObEh1WlY0T1hjL0tpOXM5cThNdGZpSnFFWGpIKzNwcHk4bmxDTUZ5Y2NMZ2RUN2ZuWDBWK3pqKzN2OFJ2aGdsd3ZobTJqbHRTL21YY1VVaFNRcWNidVFmbUpHZU9udHhYTGpxdU9wMHYzS0Zob1llVS9mWjZwOFFmOEFnbWo4VXYyYmZoTmUrTnJud1BldFkyV29SeDZoZjI0RXNWdkh6aDNjWjRPUUNRQUFjZGMxK3BIN01Pcno2dC93U0ErSkVkdkEwc2NYZ3FTTVNMS2RoTytOdlE1SUovR3ZNLzJBdjJvZEYvYUIrRTJwWGVvM0gyclI5YzArZXoxbXp2VVJuY3NnRHFkeDJxUnllQU1nQWdaRmVwK01kRzBmOWlYL0FJSmMvRWpSTGZXbnVMWFhWZzB6VEM0TzhyTktwQ0VLZW9qQjVQcHp4WHhGZkhTeFdKaENxdmZUUFpWR05PRGNkajhxZmo1OFlQZ3A0R211Tk4rSWxwZVhsNWR4b0lWdGtEZktGQVpqazljTWVmYnBYbFA3SG54Z3R2aDM4YnJHNThPMzhxNmRmWG0yRXV4VW9HSTI1eDBZWXJ4ZjlwM3h3L2l2NHZhbFBiekV3MjdlU21CdEdSMTQvVDhLei9oanI4MWpxc00wSkFNTWdraitZZ0JsSU9SK1ZmWTRqQXhuZ0hHWFZIazA4Ui90R2gvU1o4S1BpOVpmRUx3RDRmdE5QMVVMUGNHRU1FTzExa1VIT1JqT0JrWkgxcjZDK0gvaEhRcmI0bVdQaXkzMSs4Ri9wY2ZrMjJrTGNxc0RQdUdIS2s3dHhHVDdnSHNLL09UL0FJSnNmRlNYeHA0TTBxNHQ0NGZ0RnRJdHhiVEhKdzVWUzNmbmpKOVNSWDJ2WmVMejRSdEgrSUZyYWVYcTFpcnl5RzJqWnplczRVQkFxamMzM2lPT0JucFg1SlZoTERZbHJzZlJ2OTVUUHJ2OXJmNFYzSDdSZjdKK3UrRTFoVkx5ZlRUUEFzbUNWbFJkM1VqcjFyK1pENCsvRHlMd0o4WkliN1Vyd29KWjdqU2I2T1FmZGRRUUR4ejFINDEvVTc4R2RlZzhSL0QxTFZuTGJMY0k2dXBEY29NZ2drNFBQNlYvUFgvd1cyL1puMVQ0ZmZ0SmVLN1N3dDNSUDdjR3FXYXVRUVk1TWs0QS9FMStoNWRpZWVuQ2Q5MGZQS0hMVWxGOUQ0VW5uMUxSOVphM2hsZmNrM3p2dUkybFNjZHZURmZlWDdHUDdXWGpUeEY0RXVQZzE0ajB3Nno0ZFcxYzNjUWJkc1E0Nkh0eG5qdHo2MThVZkVsUENxV2tXb2FQSk9ablRGMDBzRzFkMkJrZzhEditsZDEreDk4VW92aDVxbDNkek52aXVZV2luaVk1REFqMDkveHI2dkQxWktWbWNtSW93bEc2M1JnL0hQUnROc3ZqZGY2djRmMDdacHlYTExiamVHVkZEWjJnalBZajJxZlY5SnQ5WjBTUFhiUndvaUM3MUJHZW4vMS8wcnAvRlBnUFNmR0Z0cmwvNGJ2Q0pYM1RSMnZYanJ4ajhLNCt3dnByTHdGZDJ0eXhRaGNiVDdFZjV4V3RhS1R1UERWYndzY3NOUHRMZlVMcTNrbHprODVyVjBrU1d1bE5hczRNYXRsVDZWU050YlhjeVhGczQzeVJmTW1ja0VWYjBDV3d2cmE1ak0venhrcndlaC95SzRwNlNQVFZwVTB6MDc0WmFpdW4ycVhhT0FBT1A4SzZmeGpvcWFqNGVpMUNNNU53R2JBNjVHVFhubndydXZPLzBHNlluRFlBSitsZW1YOFZ4Tm9xV0ZuY0FDTmVGYm9BU1A4QTY5Y3MzNzF6c3ByOTJmS3Q3b21zYUwrMERMYStZeGpsaUVxRDFCSCtJcjJDZUc3MUhSRm1rY3hHT0xjaWJldlRQVDN6K1ZjbDhRZkRtcDIveEgwanhRa2Fzc3NNbHVXWEdTMGJnSFA1MTNZUTJkbk40UHViV1F6cWhZVHh1Q2hWc0huSjQ3MVYweVVySTRmWFpUZTNGdGZ4U0V2Yng0T0QwR2E3ZncxZXh0RkNibGdWZUVZVTQ2MTVub3NDUDRobTA2NXUzQ0pJVktBZFJtdTMwMVZqaFdDS1hjSWlRT2VSem1qbUpVVXo1N2FQeWZCV254dkVRU1NEdUhXclhnMDJVZmlld24xUkhGdWg4eVJSbk9BR09lUDhpcjNpdElEcFdtV2tTcVNqL01vSHFCMXhXcDhPWXJPNjhmYU9tcDJYbTI0RWtjNmhRZmtJSXp6NlVzSzdxNWpqSTJqWVQ0Zk8yaGZ0RitHdFQwSy84NVpKWTJSYmdBZ2dxZHlrSGpIYk5iZngrdkF2N1QxejRpdHJVVzdtMWpsOHVNQVlJQU9lQnpuRk0wSFR0RnYvQU5wanczcCtrWENDTHlnV01iSCtGVGpIMXgwN1ZYK05kdVI4Y05SamdmZjVOcXd6akxZNTY0Ny9BTmE5R0xQS1dod25pYlVtMXJ4QmNhdmNObDVaUzJEem5tcjJwL1o5RXNiVzZzMENQSXczRkY1SXhtc2gyaG5rREsyUnR4bm9jaXRzd0xmYVRDWjBKYUw3b0pOZWRYbjcxajFzTkZPTjBKY0czbk1sMVp5NzQzaTUrdUt4N3EybGxsanVDM2xvZzU5NnVhVGZ4V2xwZFc3anFma3lEelZYWEc4NjFpUlNRT3BXc0lKcVIwVkpjMGRUTDFDNVZKTjVjL2V5QURUemRlZHNkN2RrR1BsTlB0TFMxbFlTVEx1MmtZSkZXOWRqKzFNcGdUNUk0eDhvOVR3UDUxMVJ0YzVKWHRjcVhOeERicXNrcjVVZGUvMHB0anFzY0RPOERZV1E0NUhQTlhMendyWjNmZ3R0WGs4UzJTM3ZuaFl0S1ppWnBFRzNMREhBSFBmM3JBajA1TEN6aGJNalBrYnhzNjhucFhWRmFIREozWjBjZm11Wlo0aUZFUXljSGp2V1RmOEFpbTgvNFFQVy9DSG1zVXVkU3M1Q01kTmpQL2pYVS9EaXowUHhYZFNhYnJNbDdGY2JGTnZIYlJLeFlaR1dJUFhIK05jSGR3S05jdTlDakxNVGZxbnpydEoydVIwOWVhcjRZdG1Ncnlra2Zxdi9BTUVnZkJscjRDL1pRMUx4aGRSQVBjUnZJc2hVNUkyRUFmWG11aCtLTHo2dHFWaEM4KytTT0F0a29Rb0o1SXgyT0J4OUszUDJYOUYxTDRmL0FMSytqK0ZJOU14SGYyRWNrOGl0amFueW5QdU01L3JXSDRobHRiL3hiYVJOcDBnZ0FKTXB4c1UvZTJuMi93QWEvS3BUZFhHVG0rclBzWnJrb1JpdXhWbDEyNXQxVFMzdENkd3dKUStBVjRHY2R1dld2R1AyL3ZGRWxucjNoTDRVUnVkdW1hSTJyYWlBeHdibTZPRXp6akt4SVB3WTE5Q2FabzAvaWZ4SlkySzJtTjl5aUNObjV3ekh2anAvaDNyNUkvYk04VXJxZjdTWHhEOFN5RStUcDE3OWl0aTJUbExlSllWQXlCM0JQQjVHZXRlNWxkRlN4YXVlYmlwTlVHZkIvd0FZNzJ6MW40amFwZTZaYUdHRXo3RlVucVZBQlA0a1ZXOEUrTHIzdzFOTFp4YlREY0lWY01PUWNjTUQrRmFQanZTblNhVy9lTlZNMGhZZ2M4azVya1J1M0J1ZmF2MENNVlVwY3JQbW0zQ2ZNZnFWK3hyOFkwK01Qd2VzZEF1ZFFZTWdpKzJ4ZWJqY3lZUTV5VHpqYWE5aS9hcitHa1Y5YStEL0FCbEZiRjdXSHdNYldCUUNGVzR0YnlUN1F2M3ZsSldXSjg5d2EvTmI5aUg0NDMvd284VlJMTVNiQ1dVQzREWndxbkFKNllCNzU5cS9ZTHdIWitIUDJwUGdmZmZEN1JMcUNiVjVvenFmaGQ1M0dKYnNSbEpiVW5HRkZ4Rngvd0JkRWovRDRlcEI1Wm1idjhMWjcwWDlZdzZmVS9KLzR2YVhxT21lS1kyaWhpaXNyOTN1bWRWQ2lWOTVYQng2Q29MV3prMWZTMWpCQ1MyNmIza0h5Z29BTWsrdU1jVjc5OFcvZ25xdXM2SnEyaWFuWTNFVjFZeW1XeVY0Q0pJcEJoQ2pLQ0czWkcwcmo1Y0VtdmpueFA4QUVueGo0WXVyL3dBUExwaldydEUwRTRkU0dVSDI3ZGErcGp6VnFhY0djY0p4cE44eCtobjdCWDdQWGdMeE40Vmo4ZmVPV0tXY2hQMmFHM0lXU1pRUWZNZHowWDVUd01kSytydkN2N1BYN0lmeGduZndqcTNndS8weE4rSU5Wc05YYzNHL09GWUJpUWNaeVFSbkFISGV2ejYvWWcvYkhpdC9obmJlQkpycElidTNqRnVSTVNGWUEvS1FTUU9qSDhjVjd6NFovYUwwTFIvaVpvVmg0YnQ3blVwTlR1RWE0aWdsQUVUc3lGVDh1UVdKUFVrZGNFTFh4bUpwNW5ERXlrM29qMDRWS000cEk1ai9BSUtkL3dEQkt2V1BnM2RSWCttejJ1cGFYcWx0OXMwRHhEYVErVkhmMis0THRsVCtCbFBET3ZJTEJtR0NTUHpKOGMrRExyd3RxejZOZDJja0UxdWR0eEhNaFZrWWRWSTllYS9vVC9ibCtKdGxybi9CUCt5dkwrRkx5NzBMNGdwYmFmSEtoRzZHNXRwUkpHUVFWUDNmbUF4WDRnZnRZTkplK05JYjNVdEhXQzRlei9ldWhHTGphNVZaT0I5N2FCbk5mUjVOanA0bWxkbm1ZeWlvTThHa2dDU0VkZzNIdlgwNy93QUU3L2lKcStqK1BQSy90QmxpdGRQdUI1ZVFWMkJkMkNDZWVUK0ZmT1Y1YmhtSlh1Y2sxMi83UDJvNnZvMnRhbU5QdW1qTTltWW1JSTV6MStuRmV4aVdwVUcyY1dHVjZsajlEdjJGN1QvaEkvRlBpZjR4M1lCTnFwdExLYmtFUElTekhQQUJBd0s5bDhTbzAxckxxRmpaZWJLTXJFaUhIbWxqa0VucitWY0grekw4UFY4SGZzemFSb0x6VFFYR3NPOS9lUEY5OGh6aGVlK0ZBcnR0S3VOWjFIVTdYUnp2YTFnSVZIT2R6UHd1U2VjOVFhL044VFAyMk1tNzdIMUZOS25RVVVlNmZzaCtGdEwwNlM0K0tIak95U0xUdkRkaytvek1TU1c4cE1xdVNlbTg4WTlLL0x2OW9meDdkL3RPZnRYYTE4UWRhbkp0amZTM1Vrak1jQlF6WVU1NmNiVnI5T3Yya3ZFRGZBUC9BSUp2YS80bVNVVzkzNGt1UlpSaUpnb2tqalRMNEo5U0QycjhsL0J0cHJJOEtYL2lTV05BMnNYUmhXVUVaWmNrc2Y4QWRPZVBwWFR3NVQ5cmlwMTViTFJIUGlwTlUxQmRTOThKYkdkdkZHcTY4MFJkSlpUNVRFSDdnUEM1cnd6OXJENGd4K0tQSGorSDlNdXQ5cHB1VmJIUnBmNGorSFN2ZlBHM2lTeStDL3dtdS9FTFJoYmk0aThxMlJoeVhaUU0xOGFhbGVUYWhlUzZoTXhaNXBXZDJQcVRrMTl4Z29jOVJ6UEl4bFJScEtDM0t4b29vcjFEeXdvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2dFZzVIYWlnVUFkdDRMMVEzMm12WXpQdUpHQUNlbFM2UXN0bnJCdEdYaHljNXJsZkRtb05ZNmltSHdyRUExM2YySVNoYnFGeVNWNjl4WG5Wb0tsTy9ROUNsSjFJV1BhZjJLUEhLYUI0cXZmQnR6Smhib2xvTSsvL3dCZkZmcEw4QTlaczlhdnRNMVNWU0xnUWtseGtOdlVZT2ZVZE9LL0lqd1BxMTM0VThiYVJyMXJJeXExd2lzd1BQVVYrbS83UDE5NG0vcytNYUhKWkxMZDI2VFdzMTFsbFRlUUdKQTVPT3RmRDhRVVZDdnpMcWUzZ3BPZEt6Nkg2U2ZzSytQTmUwVDRtSnFPcWVLNTU3YVVpS0d6SStWVURaNzljRFA0Q3Zrcjl0SDRRYVAreVovd1VYOFM0aGp0ZER2L0FETmQweVI4N1Z0cmxES3lnWjZCeEluUVk0cjEvd0RaeTFIVWJLUzNrMXpYSTdTWGRHQzhjUlpXWWpHNEFkUGI4YWcvNE9EZmhOTHJmd1YrRi83UStuek0wNXNaZEExUzRqVEhtS1Y4NkVua2Y5TkJ6NjlxNHNocXIyN3BON2tZeUZtbWo4Uy8yaHRRUHhtK0ltcCtOYmVCUXN0M0tZSURIa2JQTUxBZDg4SHJubXVWdGZEa043WVBwMnQyTVZzWXY5VEtpQVp4ajczNGZubXZSZkVmaEc1MDJCTlYwYUErYzB3U0dNcDhyNDVPQ1RnODF4M3hKOFFyWmFXYlMrc2ZzMDZwZ29tTUU4Zk1EWDZGQjJTaWp6clIzWjBYaG54WmErR3RJajB5MGtpU1RaeEtvK1hzUjJ3ZjUxOUxmc0Uvc3QrSnZqbnJVbmlyV1pIdGRIYVJoRThjZTZXNGZJR1VCR0F1Q1FUWDUvZUgvRUdwYWpIT0pMZ21PMllBQU4wREhIOUsvWVAvQUlKMjY2c3Z3cTB6U2ZEWldXYWQ3YTFpalY5bUNjRWt0a0JlZXZ0WGo1MWlhbUdvcU5QZG5UaEtjS2p1ejZnK0FuN0NuN0YxenFFZmhEeDc0RzFHR2E4VWlPN3VkVWtpa1hlQnlBQUJnNUp6MnhYd3Ivd1htLzRKV2FQK3pWcXNYaWI0WjNrdDNwdXJXRXQvcEUxeEd2bmJZemlhMmNqQVlnWUtucWM4MTdUcFA3ZU9zNlQ4YjlXMGo0bzZtTk1HbmFuTEJIYlhVK3dSK1hMZy9PU1NNWU9NaXVTLzRLYWZ0OGFIKzJyWjZWNForR0Z2SnFlbStGZEt1WXBkVU1IeTN0MU1RVzJzZUNGQUFKeHpra1Y0MlZZakh4eFNqTzloNHFGTnh1ajhRSnlRL0FQMXoxcjFMOW1MUUgxclhibHlDMFN4aEhYZmpPN2dqK1ZVdEwvWnArTGZpalczdDdmd2xOYlJOT1E4MXlOaW91Um5yNkE5TytLK2xmZ3YrempCOE03YTAwRHd0ZFNhdjRoMXAwaGhoaWhHV2xjRmVGUE94ZVRrNHlQcFgzR0p4Rk9GRzdaNUZLbE9WVFErbmY4QWdrZDRNMVd6MGp4Vm9jVnRKR2ttb0NUVDdsWTNLcE1oK1pSeU03bFBZWTRPYTlsLzRMZGZ0SDZiNGMrRmZnMzltNnh1eWJxeGovdHJYbGtPU3AyRllFWWc0eUJ1UDVWN2IreVY0RCtISDdDUDdOa3ZpajRvM2NFSTArd00rckdSUWdsbk81bmhRbFFXTHNFVlFEMk5mbE4rM1Q4UVBFbnhaK0ptdmZGTHhIY01rbmlpN2t1QkFmOEFsaEMzRWFFREpBVlZDOFk1cjRMQVlaWS9PSllpM3VwbnZWNmpwWVpRZTU4TmVJcDdtKzFhNDFPNXp1dXJoNUR6M0pKclE4RlhMd1gwZUQzT0I2OFZmOGFhVllwNWh0Z2NJL3lmS1JqMndheHREa01GMm82SGRuY08xZm9FbjdTalk4Q0M1YXR6OVB2K0NQOEE4V1hzTlJpOE82a3p0R2RzYTdSa2dNQVZQNFlZVit1M3d4OFIzVTJ1V21wd2FOSDlsRm9YVzVaaDVtL0lQQzQ0WGtEOGEvQ0QvZ21KNDJYdy93REVpd3RaSlFGdUZaQ2QyUG1qZmNPZTNCcjl2dmczcVF1ZE4wN1ZyZVVUS0xsRzJBWkJRakFZNFhwZ2NuNjErUjU5UjlsajJmVjRhU25RUjlsZnN0NjBZdkVWL3AwckJUZFFSeUxHOHB3ckpsVHRCNm52eHhYNTAvOEFCeFo4Tjd1NitKR2xlSk5NdGxFZXErSDJpa2tWQnhJam5BNmZlNTZacjdSK0JVL2lmVmZqSlkzV2xYUzJOallXMG91VmFIYzkweGNqWU9PRkhCQkgwUE5mUEgvQlhMNExmRnVmNE9heDQ0K0ovamFIeENMUHhCZFRhUGRXK21lU0xPd2xRbUNCc0hCZFNEODNPZXZldTdLY2I3T2pHRDZNNEsxSC9hRy9JL0RYVzdkYmo0ZTNsaHExMkU4cEdLbVFEY3BVZ0FldVA2bkJya2ZoSjlxdFZhNG1TVXFHK1J4eVR6emppdXUvYWJzYmZRZEFzTGpSbS9kWCtET0VSaDg0QkxBL1hqaXN6NE0yUnVkR2U1U1RlRWozRGRuZzQvOEFyVitrUmtuR0xSNWppMWU1cHdlSnZFL2gvd0FSMmQxcDRrK3pUTVlad1R1ejdZTkhpdVh6dEtuU01FZVpNQmtEakpPZjYxa3o2N2V0NGhGZ21DbjIwa2dMbkdmVDhxMi9HZDhrV2pXMEMyU0F0TWhMRHVBQitmOEFPdDIyOXpGUVVUa3BJWjlHdWJXYVJqeEtVYm5qM0grZld0VFFvTGFHNXU1Z3UwUEpuSHIvQVBXck84U0dhYTlqQ1A4QWVseXFEc1RtcjEzYXo2ZnJNY01wMitjZ0lVRGo2Vnp6U3VkMU52MloxR2ozSjA5UmVXUithT1FHVDZaNi93Q2ZTdlZ0QTFtejFIU1lMcEpNZktOeHpnbnBYbEdobjdGdXVHVU9oaUdWUFExM2ZoS0JaZEYrMWVVVUsvTXE3dU00L1d1T3B1ZDlCdmxQTy9IK3BYa2ZqdlRQRFdQTVZKYnU1UUVFOFNTZ0w3WXd0ZEJjNmxkcDRoTWtqSE94UVNUMEhiMi8vVldiOFMyTmo4UXRCOFJDMUhrK1NiYVptYkpYNXVQcHdhditQb1pkTTFlT2VDNkJGeEFKRWNEb1BRVUl0YjZuTmFuNGRoZnhiSnFVSklFZzN2MTYvd0NSVy84QURhR3lrMXFhRzdmS3NoMjVQSFdxZmhpZUhWbzdxQ1YvM2dWdG1lV3FoYTZoY2FHNjZsSDhvRSswalBKOXFkaFBjOFd0bXVwZkM4MnQzTE0rMlJTZ0o5SzZ6OW4zeEhBL2lXQy9ObVpKemNiUWc3YmoxNzhkZnpyRXViZDlMK0drRHl4SDVuNXpubk5NK0NtclNXR3NRM1Z2TkdoajFDUDkzSTQrWW42MHNNN3AyTWNiRnFKMDNoWFRiVHczKzJKYWFicU1waHRudXNCbWt3RkRqSTU3ZGE5RjhRL0IyOXVmMmt2RVdsMmg4M3lOSE45QThhRnlVeG5JNDVIMXJ6UDR0YWZmSDlwQ0s1QUNoNDRXRHJ3TnVPdkE0cjJINEJlTGJDMi9hUG12TGU1bVpwdkRWeGF5a1Q0SUpUSFVnNEgwcnZocXp5WEcwYm56UE11M1Zicjl3cU10dzN5Z25HYzlPYTJMRFdZV2hTeUsvTXd3Q1BXc1R4SEhQYmVKTlJnYTQzaU85bEdjOWZtcUt4dXpiYWhGSTVJdzNGY21JaEhtdWVoZzVQbExONU9iSFZXaXVJMVFzL09YNDY5eFVPcTNnRnlJVWRXWGJ3VjZDbWVMR0J1dnRCQkJic2VvRlpheVhFc2lGWXo1WU9Na2RhbUVWYTVyV255eXNiVnVRYk5WYUxibVRKYkZUM1dyUzZVeTZqQkVIOHVSWHdSd3dCemptb1RmeFE2YUVlSGUyQmhjZEt5dFdqKzJXYkNXUndDUHVnOEQvT0t1UHhHTXBYaFpIdUh3KytFdmczNHorS1V2L0RPczJTSkZZcEpxSmx2b1kvTGNubkFZOG51Y2JlUitOZWZUL0QyNTFieE8yZ2FMcWRySlB2bFNFVFRySDVnVnVnSkpERWp0M1BTdUowcnd4ZFcxcTk3YjNPd0hoZ1Nja2NlL05XdFAwMGlSVXVMOGJqMHl2Qng2VjJLVWJIbHRWWXZVMXJLNG0rSHZqZUs1MU9GNEd0THNDNFIvdkx6eUQyR09LcFhkaGJhdjhicnlQVFpCSkZMcnlHSjBPUXl1NnNNSEgwL1dxbmltK3QvN01leWt0ekpLVGhwNUhKWWR1RDNIV3JmN04xbTk3OFVyQzNNTzhSM3NUN1c1enNZWTY5dWF4eE0rWER6ZmthMFZ6Vm8zN243SVhtclJXbmdIU2ZET25YNk5ObytrVzF2cUZ1ckFNb2tRRkdQNUVkSzRTV0dTNDFFUnhoMUxra2xjNFVnOEVEdDA3MTUzOEU0UGlkNFdtOFIrTWZpMHMxdGU2NUdnc2JWMzNCb2k1YU1nRG9vVmdvN2p2WFlhWnFqWGNUWEVPcFNJWGNiWFVqaFZPZjVWK1lxa28xSHFmVlZaTnBIcDM3TU02YWo4VnJaOVd3QnBOdlBlenlOdDNiWVk5eC9EaXZ6Vi9hcThYM2ZpVysxelg3NGxiaSsxSnJuOTNrSzNtVE00eWM4OWY1VitnZnczMDN4Q21yZUxQRU9nYTJnaWkrSE9wL2FFY0x1VStWdERjL25uT2EvUHo5cDN3REpwUHdzajFxeGsrME5McXNTdkhFaGR3bXc4bnJ4bm5qamtjMTlKazNMN2U3UEt4OG1xU1NQbjd4UnFFV282TUlKaHVtRDRac2VnNHJwUDJlLzJRZkhYeDF2ZytsYWZLOFRmT3NNSy9NVnoxWS93RHIxNVBhcW53OCtIdXZlT3RkaHN2N0N1SmJaWDNUc1VLcmhlMlNNVjloL3NUZUw1UGhyOFY5UzhBYWd3aXM5ZDB0SXJOeVdBam5qeXlMbkl5VHp3T3ByNkhNTWJQRDBXcVQxUE93dEJWWjNrdERtTlYvWW8xbjluM3dqYTJIeEU4Q1RXTUhpSzJrWFRiMXdDcGtUQUw3eU1mTHlmY1lOYkg3SlA3Uy9pL3dDQkhpVmZodDQwdTVvVGF5azZkYytZUnZWU2NGVDAzWnh4OWEra0gvYWo4QWVMVXY4QTlsUDlxbUNmVGRQYTRhNDhOK0tIdGYzbWt6Wk8wdVRrdEMzUTR5TVpCeGl2TGZpNyt5bDRwMFZIazE3d25ENGkwSjBrZlQvRW1pem1XMm00NGtXUk0rV2VlblltdkRoSjRxbGJFYnZxZWc3VW43aDd4OFRiRHdqKzFScDZlTC9EK3IydW5lTG1aWHZrODBKQnFraThlWTIzbU9jNSsvMGJrbm5tdmx6NDEvc3g2ejV4azhXL0NlNkUwVElHdVlMTXlxYzhFNVVFTm5BdzNIUGF1TnNQRVB4YitFR3V0cC9nYnhKTmRSTEtGaDAzVVVZU0RnQUtIWDJ6alBZVjdwK3psOFIvMnd2MmhXSGhuNGUrR0xsTG0za01EbTVtQVRlbkpSRzQ5VHdlT0swVThWZ2FkMUpPSkhMUnJ5MTNQQ29mMlMydkpyZTI4RytETlRWNVFxNVN5ZUlqNThEZnhnRDFJN212b1Q0Ty9CRFJQZ0RwMm5haHJkekRMcnMwclNUTUpRd3RvL2x5aUUvUVpQR01WelB4SC9hVi9hRStIV29OYStMTkF2Mk1jN1d6eDJ3M1ptVmp1UU1vemtFRUhBd01WNXA0cCtKdnhlK0w5MlUxcU9YUmRQYUpoRzBqNG1kQ1NCanNveWVTZjFwUyt0WTVXZWtTMTdIRDdhbnJIeHovQUdxTHI0L2FURCt6NzRBZTJHbjZUcnI2dnFtcFhsd0k0R3V0dmtvZ2RpZUVETjBPQ1NQZXZpajlxRHdoNGowTHhFbXBhdkJQNWNyTXF6dXZ5c1NRd3dlbVNHQjRyNlcrQ1h3Z2cxenhQRjRjc3JlRVc2M0MrWmNHTW1OWEpYY3pIYVN4NzR4WHJYL0JRbjRKL0F2dzNQNEw4TytFYk8ydXJYWHZDRUxhOXBjMTc4MW5lUnlCUE9TVEh5UElvRFlHVk9NSEdhNmNMVXcrRHF4b1FNS3NaNGlMa3o4ckpsV1Z5cmdBbGVCWFovcy9hZStxK0swc1lGTHlYVnpIRXFnZFNXeC9VVnpuanp3OWVlQy9GMTU0ZnZiUjRuczUyallTTUN4VE9WT1IxNElOZXhmc0VlRFU4UWZHM3d4RkpENWtVMnFpWndSMlRMZit5MTYrT21vWVNVdkk1TUxCKzNzZnBMcW1xV3ZnalRZdEx1Yk1pRFRkSWdnaWtEQUFTYlFNYzlPYTB2Z2Y5dTFEVmpkWCtqQ2FMWXpTaEg2TmtIbnJ4ZzV6Nml1SStQZXJ2ci9nTFhJUERjenozaVgwYW1PQUhjQXJqUFhqcC9Ldld2OEFnbng0QzhTZkVEeGhwbGhxYzl2Tlp6M0VLM0ErMHF4VmR5WnpnWjlnTytTRFg1ekdLVkNkVjc2bjBMbDd5Um1mOEYvZkhWNThOL2dYOExmZ0RhamE5MW9yWDk5RVd4aVNUSE9CMzVQODYrRnZBM2hpL1h3N29PaFR5TmNHTzEzalA4TzQ1MjRIcDJQdFgxVC9BTUhEbmlPUHh4KzNucG5nYlRabGt0dEMwVzF0ZkxUb2pFRmlNYzRJeU9LOEo4RFhGdHArb1gyclNzclE2WmFiY01PQnNHVC9BQ3I2UEpxVWFPVnByZVJ4MUh6MXZKSHk1KzN6NDJqbThaV1B3MjAyVDl4cEVBZTRBL2lsYi9BZnpyNTdycGZpL3dDSzUvSEh4SDFqeFRjTmszZDlJd3lTY0xuQS9TdWFyN0REMDFUb3BIZ1ltWE5XYkNpaWl0ekFLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BVlNWWU1PeHpYby9naS9qMUxUVklZK1lpRUFaNHpqSE5lY0VZR2E2cjRhYW1iZTZlM0xZN2cvbFhOaTRjMUsvWTZjTFBscVc3blJQY3Y5bjhzcVdhM0lrUWpvQ01WK2lmN0hYeERieEY0QThQM1F1TXlKaTJtZjdvd1ZCcjg3bnQ0N3FlZTN0NU5wa1FqNm5OZlpuL0FBVGp1WDFUNFgzV25UWE8xcktSbVhHRGdnakdmVGpJcjVIUDZhcVlTTSt4N21CZHFzb242WS9DbjRnTHBYaVN5dFkxQVF4cnVYWmtERFpBNi9MWDBGL3dVcjBIUi9qbi93QUVsdkV0L3RXVzQ4S1hGbHEwT1VKS0JKVlJqdHdmNEpHNDlxK1VmZzdmNllrOXZmWHBTNGQ0bGZCTGRTUnRBd09lY24ycjYyaDFwUEduN0l2eFcrRjF6WXMzOW9mRG5VSm9WTE00Wmt0MmRjNDRMZktPQWUxZkhZU282R05oSkhYaUZ6UTlEK2ZENHFhbGJXZXQydHRiUnRDbHNHZU1oc0ZtSjZnWUdCN1Y0bDhYUEZWN3FjcHQ1SlE1UEdSejY4QUN2WC8yMFA3VzhKNjdwdXRhYll5ZlpMMjBBTGxDRURubkhKUEpCcnhUd0xwdXIrSi9GdHZxVXVudk5Fajc1Q1kyS2NmaDlQcFg2ckJ4akRtWjRNMjNLeDBYd0crQS93QVRQaUhhWEZsb2ZoeVpJcmdiM3ZibE5zYW9vendTT3ZPYSt2UCtDZUg3Uk92L0FBQytJN2ZDNzRnU3ZhU3d6Qlk1cFh4dFlFQkdCeU9NZ1lQMXIyNy9BSUpQZUl2aFo0bjBmVXZEM3hQdExlTVhMTmF6VHZIbG9FSTJJTTRPQmsvZjQybEJuSTZZSDdYZi9CT3p4N2FlSUxpNHZKWUlabXVIbThIZUs0VzNXdXEyN0VtTkpKdHdqTFk0eGdFbkcwRVY0ZUlxd3g4NVU1NlcyT21tNVVUNnUrUEg3TW53eC9iRjBlNytMWGdMd2haNnRyRjVHMDJ1NmJaVGlDN2l1UW1HbmhQU2FKdW9IVU9UNmtENVV2OEE0UHdmQmc2aHBrL2dYeGRGSUhhSTJ0M29NcWhTeS9LZDRYZ2pISnpnZ1lyemI0WC9BTFFuN2IzN0tHclI2UHJYZzdVYitLeUlXR2UzYytZVkpIOFBJWUVZSkF5RG5QclgwSjRJL3dDQ3ZQN1FueFAxNnorRThIdzR1aHFHb0ZFUjlUamFHTkVKQzcyem41VG5uQTR4eFhJcFk3QnAzU2FYVTBjYVZaNk04MnNmMlgvano4VUd0bDhMZkRsOU9obU1idHF1cXdlU3VNL2VLZmdPZ3orZGZRM3dOK0JYd1gvWTBzYnI0cGZGYnhORGUrSW80TVRhcmV0dGp0VWZKWkl3Y0hJd1J4eno5SzU3OXFQNGwvOEFCUWo5bmkzMHE4OFQvRDdSSmRMMSszRGFYckZscUVqd09HSEtuSUJCd3JFY2RNZXRmS3Z4Q24rSXZ4dzEyMjFmNHcvRWVLK09WbWcwaXpmeTdWUUdPZUJrc1JucWZTcG1zYm1NVnpTVVlsdzlsaDN0ZG5wZjdYWDdVUGpYOXVUeE5EYStHSTdqVGZoOW9sMTUwY0lMQjlSZFcvMXJEbjVWVS9MM0ZTK0VQMlAvQUJKKzM3NGtzdmgzOEkvQkgyMjkwZXpZWHQvTmNtQ0luQklVTTJjdGpHMG4zNDcxeHVnK0dmRjJwV2I2ZjRlalN3MHlGZ3Q3cmQ1R3NVVU1ZR0d3U09RUWQyQjFQVVpGZmJQL0FBUzQvYWorQWZ3TCtJTmo0TThMNnZiM01DN20xVFV2TEJ3Mk12UEk1eDh2Umw5UDByb25pS1dYWWRRb0s3TW5DZUltM0kvSXY5dUQ5aXp4aCt6YnF0N1lhdlpYTU1tbFh4czlVMDI3d0o3R1plQ0c1K1pjOUc3akhyWHpYYVFHSzZWdHVQbTZldk5mcS84QThGYy9pdm9YN1huN1N2eEQ4WGZDaTBNK2o2bkVMZUYxUUJibDdlTlltbUJ4bmxsQjZjZzV6WDVaZUlQRG11K0ZkUmJUTmUwZWV5dVVZQm9ycUlvUWZ4L092ZXdWZVZlaW5MYzRKdzVKbnQvN0kydFhXamZFclE3cTBtZFN1cko4cW50SXBIOUsvZUw5ajN4TmVhNTRXdDJ2WFdPTklrU05VQUxuQzVMRDBBSkp4N0N2d1IvWmlHM1U3ZTVVRm5na3Q1R0lKeU1UN2ZUMEpyOXdQMlZ0Vmdmd0hwMENUdWdtUlU4OUZPMGtxU2Z4d2NWOEh4UlR0WFRQZXdFbjdPeDlZL0RQdzdmV1hqUFJ0VzAzeFBxSit5Nmp2dUVhVE82TjJPOVdQR1JuQUdEeDlUVzkrMzM0UDhYNi93RHNFYTIvam5TN2UydnBmdEQzVnRETDVnQ0I1ZkpKYzR5M2xoUDA5SzVINFVhdGNXK3JKcDhEL3VJcENpNWtERURjQngrSUp6OWE5ci9icnZEcXY3Q2V2WE9NbDlGeWVldUVZZjByeGNJNHFFdGRWL21pcTdhcXd0MVovTmorMDU0V3R0WCtEMTQxcENETnBNZ3VJMEFKTzFXMnQ3ZEIrbGMzOEE0cmZWdkIwN3ZGSGJTdGFuTElCaGp0WEJ4WHBHcitiNHBPcytHcEljL2JMR2REa2NiaVdBNmoxeCtWZVMvczN5dGRlRTd5MHNiaEdudEJJbHhFSlJ2akl3dVN1T21UK2RmcXVDdk9oQnZzZUxpWk9NcEpHUy9oYlg3VFhtMWw0QkxieHprRm95UFU5ZnovQUVyUzhTYW5iNmhaeFd6dmdvd3h4d0txZUgvRSt1VytvelEzcTR0N3E0WVJsMlVuNzNiMC9yVWZqVjJzOWp3UmdobjRJSCtGZDdTT1dNMjlHRnpvV282bHIxbmI2ZkpGdlp4aFhQOEFPbWVOMjhRNlg4UUcwN1dySXdHMFZJd29IM2lRR1AxNE5WTlcxVzgwdldyYWVCanVWVklIdlhmK1B2R1hoajRqNkZEYlhHbHJCcmRucjBrczh5Z0R6Ylo3V0JVQndPekkvd0NacktTVE91TW5GRmJ3OGh2TGNFdnl5Z0lPM1N1dDBQVUh0N1JMRmZSaHZBKzdYTmFOWXdDdzg2QnNCVkhDOXUvcDdWcCtFZFQzMklhUUtkc3pCVlBKTmNsV0ozNGVhMktQamQ0dFF2bHRKVkpieUM2aHV4OVJVbXYyd3ZFMG03ZVRkSkRweFZnRHo3ZEtxNnhxRXR4NHk4cWFCZkxGcVFwSFVBKzlSM1U3eFhBU1MrWEtSN1ZCL3UvMUZaTFE2TDNaemQzUHJlbGFzTlQwT0hjK1AzeVk0QXlPdWZ4cTRpMzJ0YWE4NnhCVjh6Y1ZVOURVK2wzQzNHb1hWdENBVWtRamVPRG4vSjYxWmcwWVErRWJsN2VZaVJMb2JSbmtqK2xVMWN6Y21tZWQvRWFIN1A4QURhMEVJQkFJQk9LODk4QzJkemU2c1lJVWZKUXlLQmtBRlFlZVBTdlJQaUE2d2ZEMndXVU1QTW0rWGNEeVBhdWU4RDZuTHF2ak9HYlRkUGpRQ0pZWFRBSUNuZ25INC9wV2VDK0VuTW5vYlB4VTFGOUs4Wlcyb3lMSkw5bnQ3ZU9TVlNmN3VTTTUvV3RMNEkrTzlHMFQ0MUxxVWM1RnViVmxPMDg1WmNZNit2SDQxMW5qVHd6b2ZqY2FoYjJDaWE0RUVad0lRdUdDYmNFOUFBY2ZXdkV2aE5vdXFYZmpxKzBVUWszUzJzckt1ZTZISnJ1aE84ckhrLzhBTHNaNHZBVHhmcWw2SmxaRzFCOXVHQkdDeFBhbXhvSjc2Mmg4ckxOSU1ack4xTTNSMWk0V1VQdVdaaXlrY0RCNlZ1ZUZ4QmQzU1hNaEdZMUFUUHJYUFh1M2M3Y0cwSjhRWWhEQ1NwWGorRWRhNTNScjVuSXRweG5QQUdQdTExSGpHd0Vsc3hZOHNNcVNPU2E1elRZdnMxdkZJOGF0SnU1d2VhZEw0Q3NUL0Z1YUVsMVkyN1BGTE5saHhnQ29MbTV0NDlQZG5qQlptQVRqanJTM1p5QzZXcXNXSHpOU1g5dkdtbVJsbUdkd09LQ1ZxU1JmNkp2ak1uTXZ6SE5JYmRwcEFVQnlveUc3VS9VVUN5Unh0Q3hMUmc4K2xGcE5jeXhzdHZLVktMeXZyVzBkakNjZFRIOFZwRmRoSklybFkzQUFZT2Uzclc5K3l0cUN0OFk0bFdNRUdRWllleHh4L091VzhSeUxIdWxuakRoUnl1ZXRhZjdLODhoK0trTFlPR0lHM3Z5MlA2MW5pbGZCejlDS0x0aUluNnIrS3RZc3RhMUZMRHlnd2hzN2FGSTJCd0JzRFlVYzQ1eHhXSnBzcmFYZnZiM0JPSC8xU3RqbjV1bUFlVFQ5R3ZuOFE2eGU2bmMyWVVXZmxwRk1YdzI1WXdnUEk1R2ZTbzlYOE5XdXMzcHVkUWttTTZ0aU9UelR4em5qSFljMSthd2k3cyttcTJ1ZXNmQm96UWZEYjRyNjZ3aldOUGg5ZUxHQVIvSDZIYjNIZXZuenhoK3paNGowdlRmRFdxK0NaVjFhRHhKcDZTVy96c3JSektPVlppTnUwQS8vQUtxOXYrQ2MrcVcvd1orTDNoNi9HK1JQaDNlVFEzUkFCZEZUT01Ibkl4bjhhK0FmRy83UlB4eCtIdXNhVjRzMFh4SGRQb2VtL3VsZ013S0p1Kzl3U1R5R3lPZU9LOXpMSTFKUWx5YjlEemNTNDh5NXRqN0grSFg3UEh3NCtFMWxONHUrTENSK0l0UXQ0Uk0ybVd4QzIxdndPTVp6SXdJSXo5M0ZQL2FFMGZWUEVXbTZQclh3eThGYUFZVGJwYzJWeHB6SXR4QTN6YmRqY2JBRzdjMTRSOE1QMnhOSzhlYWNKYmp4RzJaQ3ZuVzd5Z3lIQ2ZkNVAzZTJPYTJQRXZnRHdsNDR1TGZ4RWZFbDNwRWh0MVdjV2Q2d1FuSXdTUHZidVFjREk1NHJLRkRFdXM1WWhzNkpTb0ttbFROM3hjdmlUNGw2VUxENDFmQm1HOHVyUXFzV3M2ZUREYzhFNUpaTWh1L0hjbk9LMGZoRmE2MzhIcFU4UmZDYjRwYXRvbzNiN2pSdFQvMGkwdUQ1bktPbVBsT0IwS2drNTdWeUY1cGVoL0M4R1M1OFUrTGJtK1pQTmcwOFh6cS9UNVhiSzRVWno3MWw2UHFIeHc4WjJ6WHR2bzh1bldpWEEyWFYrNndraFQwTWpZTGdBODRGZWpGdHhzbm9jVXRHZTEvdFBmR3U3MVQ0ZHA0bDFYNGU2THBlb0xaeUkxellXWUR6RmxJSndlaWxwSE9NOEVEQUZlcC9zRWZFblRQaEw0ZzhMM2RoRXF5VzcyanlMSERra3MyV2JxZWVjWjk2K1A4QTQrL0V6U1ArRk52NEgxVFc5S2x2YmVRUytkYnpiM2tPVk9EanFRdVFENmZoWHVmN0szeEI4TDN0L3dDSG9Jcm1JcnZ0SGE0ODQ3VkE2RE9lbzRIcG4zcmd4a0szMVplcHRROW56TXUvdGpXL3cvMXo5cmJ4c0l0VHZMUzNrOGEzNmVYYkw4cmZ2UTRKeUJnWnowNEpQTmNKNGorRXZoelNaQnFGaG8wV3EzTGxpOFY3cVlSRXd4KytGQjNNTzRCT1NlSzR2OW9MNDA2ZEorMFA0L2sxWFI3aTRodWZGZDdQSGRXMGJNeWZ2c2dnNU9PTzNPYVcwK04zZ3JXdFdqdGRBOGRXb0RRS2tNV3UycmZJK2NjOGNIR0R4MXp5ZlhzcTA4VlRweGNkckVROWxPVFQzT2h0aDhWTE9Kb3JQeFI0ZjhPV3lIYVRwL1ZNYzUzNEp6eDlUK1ZhR2sydjdPTjlhNlZvbmpueGRxdXRheExkaDd5NXRKekdVVmkyRlV0eHRHY2NIazlxeU5aOEZmRTZIUVQ0a1Q0SitHdkZPbVBONXZtNk5NOGh3ZWNzRWtEQTRLa25CN1Z4R2pmRlQ0THA0cDg4ZkQrRHczZVdBY1NySmRTT2pTS2VQbGxPVUk2RE9PNXBRdnl1VWR5bkZSZGoxWDlvL3dENEpnZkNyWHZCVnI4WlBCbDIydStIeTBjRi9jeXhtRzUwcTRZQXBIT3c0WkhIQ1NkTW5CNml2QmYyWHZBV24rQmYyb3RLOE42VFpORkZZeFhSalVuTEFLamR4M0JPT3ZhdlUvRjMvQlJDRHcvOE1OUytGbncyMXMzVjlyTVMyZCt5SXNpTEVHQjNFdHdUbmJobHdSdEZlYi9zcWVLTG54YisxZERxT3B2YnkzU2FMZFBPMXZ3cGNxT1J4K3ZyVzhxdUpsZzVlMEloR0NxcXg5VEVRb3JJaFhCSmFaZ3Uwc2MvcjByNkUvNEpjZUVkTzFMNDZKTmJhUVZhQnZOa21FYktGNVhCSXpqbmdBY2M4ODhWOCtUWGQyK29HTzZzWW9nZVFPUW9IR0Nmek5mVDMvQkt1M3RyRDQ3WCt2emFqZEFTMlZ3a1VVWkNxdmxxc2hJQkh6Y0tjZnpyNWFvLzlra2RxWHZvK0JQK0NrRTE1NHQvNEtjZUtMenppMGNXdWhKQjJBQVBIL2pnNysxZVgvRkx4QmIrQ2ZnYjR0MVJQM1VzeVNvbkhVczIwWS9PdS84QTJucnZXaCswZDQ0OFN2ZWpVTlEvNFRtNVNlYThSVEkwU01jQTQ0eUFCMkhldkcvMjZkVXQ5TStDVTJuUXljM0dwUlJnRThuQ3FUWDJlV3d2aEtNUEpIbjFLbks1cytLcG1aeVhZbms4MUhTa25wU1Y5V3RFZlB0M2R3b29vb0VGRkZGQUJSUlJRQVVVVVVBRkZGRkFCUlJSUUFVVVVVQUZGRkZBQlJSUlFBVVVVVUFGRkZGQUJSUlJRQVVVVVVBQTU3MXArRkxyN05xNkV0d3d4V1pWalM1ZkoxR0dYMGtGVE5YaTBWQjJtbWVrV1M1dklyaUlkd01acjZqL0FPQ2JPcFBQcXZpUHc0WkNjeE95cDBIZi9Ddm1MVC9KS3BJN0JGWmh0OWp4WDBSL3dUV3U0NFBpenEwY3EvTEpiT0dBems0T2VNZTFmS1p0RytBa24wUG9NSC9IUDB1K0RGM1pTZUY3RTNraTJza0FScmU0bWpab3crN0F5b1B6REdlUGF2c1g5bUs4dEw2MDhRV1Bpa2FiNTBtaFhGbWtlbjIwb2grenlXelp6djVMNVk1eDdqb0srSXZnenFhV2ZoYXgxb2tUWWNtMmdLTHVWbFlrY1lPZU4zWGl2dGY5a3lEWFBGMDF4cW5pblNGdGt0N1JvWVZLN21ET3BaZ1MyTjN5c3c0NmUySy9QcDZWWTI3bnB6amRNL0p2eEJiZkRqVTlHaTBYVi9EQzZ2ZlMzWDJYVDlNRUc1NTVBV0FBRERxT01uUFFBVjZKOE8vMkVQRE5uNFhmeHA0NHQ3U0dlT05iaE5KMCtOVmhnSjIvSzJTQ1c0SXhuQjU2Vjh2L0FMU1h4YzhjL0NmeDlhYS84T05IUzVPZzZ0ZVNYT1VhUlZRU012VFBVRGtFZjByMWo0SC9BUEJUZndUOFdOQVRTUGlCNGtqMHE0U01xdGhkUWJvVDhuSDd4VGxodUxmS2MvZXgycjdQSHJNSFNqN0w0YkhuMEk0WnlmTTlUMmp4ZDRNL1o3dC9peExxUHdRL2FQOEFEdmhQVkZ0by90dWpYckZWUzZVYlRzK2NiZVQ5M0xBbkJPYTl2K0VtcS90UWFaWXA0TGcxbjRYZU1OQmwzSmVXTjRaVmd2RUJCSmtYYTBSWUxrbDlvSncyRFh5ZHFXZy9zMmZFR0p0ZWkrQmsvaXJWUkVwY2FWcWNrU3pPUmhGT01ad2NuR09jY25JelZ6NFplSS9pYjRWMXczZndpL1pjOFBlQ0liU1Z2TzE3V3A3bGhiaEJoLzMxdzZvZHJOMFVNZm1PQlhCR25PMTR0M0tuRkoyUHVxMC9ZbitIM3hDOFB0NGcxL1ExOEpYSGxNN2FQNGQxd2FqYU01VWJIUlpsekVDUWRxcVRnZmpYeEpwK21hSDRUL2IxMVB3bEZiUXZCb1VsdlkyMGd0Z29JQkJkaU9tMGtra2R1Y1Yydml2L0FJS2s2ejRIbWF4MUQ0emFaNGd2SC9kWEVIaHpRbm5TRWhnQTNuT3dVdHR5dTQ1T0FCaXZuTFRmanRvM2kzOXJPUHgzSHFPRjExMGxrZWFNeHRJNGJCWWdIalBYQTdWYzQ0NTRXZnROckNvK3lqV2pZL1YvL2dvdko0VzFIL2dtMXBQalRVb0xlOHU5RXRBb2ttalIyVXh5STIwYmM4WVVqdHcrRDFyNCsrRG5ncjRLZU8vaE5EOFVyNzRlNlZKUGJFTW5tVzVSNTdoRStaU295TmgyY0hvT2UrSzdmL2dvUiswVjRTMGo5a0MwK0hWblBISFByODl4RThLcVJoRmlSMlluZGpoMFFMakdRRDF6WGlQN09IeDk4RWFoOE83RHdGNFY4WDJpUjJNREdXd2htUmpNMjNMS1EyQ0FTU1FPY2tWbCsrZVhRbEJNdjNQYnlUT3UrSXZ3SDB6NHZmRHhkZDhiNlZPMHNFcGEyME93OHlLQlVEWVdNSWlqNXltRHVJSUtyazllUEwvRG53djhXK0U3VCt4dkNud28xblQ5T3U0Q0x4TkpzVlNhYU05Vk03NUpVcVB1aGVSbnB4V3Y4WWJ2WHRHamZYdkVmakx4U3VrU3liUHR1blArN3NoS2M3WGpUa0FBWlBybmpOY3JkK0F2aUhydWhueFI0UytPUGlIVXRGYVFJdXFhYnFUekpDRHp0bFhPNk5nRGtnam9Pb3Jvd3NKeXAzYk1hcnRJOWQvWk0rRGZ3UjhWZU5KdkQveGUvWmwxblM5SnRMS1I1dFR1dFZtVWlRcnRSSk5xL05IZ0FnRCs4Y25nWitqdmpUL3dSSy9aUi9hVitHcmFuK3o3TGMyV3N3d3JOYjZSNGpQMm0xdk5xTGdSeXNvZEdJeXFrNUdUeU9LK1NmZ0Q0WThOZkQvV1UrSUd0ZnRXYWpycm9BeTZlOTZpcXB5Q1JLc3JrN2dUbkFHTWdWM254ai80TFI2Qit6emEzRnQ4TmRTWFVmRVVwWkxhM015eXh4dndGa1pWRzBBRlJ4a21zbld6Slk1Um82eEpsQ2xLRjN1Zk1makg5Z2pTL3dCbjN3dnJIaWFTemt0SmJTZUMwbHNMaVRNc01xM1RvNnNNSDVnUU9lTWdpdnZmOW02ZlQ5SytHZWw2bXhYY3NjVGlFQS9PZG9YQTRJNHlEbjYxK1pIeE0vYXQvYUkrSlVFemZGZlZaWjRQRm11cHFlV2pURHlzKzVzRlR4MUdGNjRITmZwZCt5cmF3WDN3eDBreXJ2TFdxNHpuYjl3SElBOU1EaXVYaUZWTFI1OXpzd2RrdEQzSDRWZU01cmJ4VWx0ZW56Rjgvd0F0VUtuSzVjRlJucHprODE5Ty90VHpTYXArdzlyb2tZakdsejhaSGJ6SytiZmhMNGFXOThhcHA4UGhvUVIyTzJhTzlaY3JLQW83RVlIWWRTUnVyM2o5cjY3di9EdjdDdXRXVjdjQnJtYlMzRFl4amRLV0lBL1FENjE4OVIwdi9YVTJySk54OVQ4QVBDV3FRMnZqaThTV0ozZEpKUmxWendKVHh6MDROZWUvQVh3SnBYaG40MWVKUEdVY3crelhOaGR1b3lRSXBESVR5Vno4dVNNY2RXcjB6d2w0bjhLYVZjMzFockY5REhOTmVTUEdIT0MrWkNNWjU5aitGZUplSFAyaGRTL1ovd0QybHJUeHJwOW5iWDhPamErdDRscGVxclFYQURNMngxSndWT0J5Y2pJNzErdVlGcFlPQ1haSHoxZFhyU1BTdkhmd2o4R2VIWm9wZE51LzdSU0czajJYMFZzNnh5dGpMYlMvVUF0ajN4WG1HdjMxdGQzZzAveU1LallHN3BrZjByNksrTTN4Um44YmVDTko4U1gwY0ptMVd5VzZrYUJBcUF5c1hHQU1qYnljWXhqcFh6cnIxbkhjWDV1cmMvT0d5K1I5SzlIN0p4UStJeXZFRnNIMTJLWmNFQkJnWTZkNnM0dVo5ZGE2VWJRMFNGaDNPT2xaK295dkhxY2N4dUF3d01ZUFN0WFRsVzV2QThURGFzWTVIYXNKYm5vd3M0Nm5TYVRxczF2cGJxNmhEeVc0NTZlbGJPazZmYjJHa1dOMFlYSmxsTFNLblVnL2pYSDZsYzNTeE04UjRQM2dCMXJ0MnZ2c2ZodUc0REJSRmJCc0RqQkFOWjFGN3AwVUV1WTU3VzdSSWZGRTJxdzNHVWlqWmNFZC93REpxbmN5dTd4M2l4N21JeGtqUDBxV3gxQWF4YXJlcjh6VEFsampHT2M4KzFUNklMWTZsOWp2NHhnTCs2K1lISnJsc2Rxa2tjL3BtcXJhZUtYaEFLNVQ1aU9ncnJkUG5XTFRab2xJWVRTajhmZXNUeEhvRWR0clYyOW5FQVpMWldCQS93QTRyYjhIV3hiUlptbVVNcTR4dTU3ZGZ6cWtaemZ2SGxQeE0xYzZuOEw5SnNYdDFBdEptQWtBNUk5NnhmZ3JvbjlzZVA0OU9SaURNUUZPN0dXT01mMHEvd0NQTGVhRDRlV3NqSEt0Y0hhUGFzejRQNmhxRnY0emgxUzFRb1dqVXhqT0N4WEIvd0FtczhCckF6ekJ0U3NmUUhpMzRhK0pQaEFyM2VxUUdHTFVkUDhBTnRuVUhZOGVEbmpHZURqajg4VjVCK3p4STkzKzFyb1VhVzZ5blVkUWt0M1VBYldEb3d4MHgxR2E3ZjRrL0VueHRKOFN4NGMrSUYxTHF0a05FaWowMjN1Ymp5MWlWdWpESDkwNTYvMHJ5ZjRmNi9yUHd1K09taWVMcnVOVm1zdFRpbURzQmdnOGNEdjFydWpGS3E3SGwzZnN0VHJ2MmsvaGdQQVhqaldvN3F6U0FOZlB0NTRJT2VuSFQzcnpUUkVXTzBtWkpkcW5JVWpyWG9uN1huakxYUEczeFl1dFl2NXRzYlFvMFZ1bUFpcjJHQitQSGJPSzh5MHRwVmtZUk1aRVVra2pvb3JLc2pxd3J1ZE5hUGJTZUZSRHFPV21XVW1ObVBJRmNQYWlXTy9tMnNUbHpqODY2MlFTWE5pUkNma0M5QjlLNVdLTXc2czhiU2dFbmsxbFNlNTBWMXNUZWJCTEkwVnpkbUpod0FPaHAwVnZES1BJaWtMZjdYcFJmUXdNTnpya2s5UlVtbTJwdEwxVEk0QUk0Qk5XeVk3R3JzWjdXSkxtVHpYVmNCMkhUcFRkSHRIVFVTcmNvM0RZRlJYWWxaR0tQaEMzSnAxaGZSV2UzZEtTYzhNZld0SU14cXF6T2IrSU5oUFkzZ2oyTXFySVdiUHBVdjdOdW9yWS9HUFRTMGZ5VFhhQWpIKzJLMmZqaHJFNldWdDRkYXl0NDJqalY1WGpPV1lrREFQcFhFZkRHL1RTUEgybTN4ZkFqdVYvbUt1dEhtdzAxNUhOQjh0ZUorcTN3LzFIVWtsdmRPMVlvRWxsZVNHV0lESlU0eUQrSHAwclJ1YnlDd0V0NUh1bFVINUMzSEdNZyt2UVZnK0dMbzN1a1dXc3hUc3drbERHTlJnWWVKU01rY2RRZnlyZnVyMjFqdEZNdHhER3NvQ0tHWUx2T2NjQTlUelg1cGEwbWo2YW83MlBZUDJZTGFMeFhiK0t2Q2dIejZ6NEIxUzFDN2VkeHRuSS9wejlmU3Z5Sy9hODAvVmZEdWdhYllwZFNDQ1c2Y1RJSDRaZ2k5cy81T2EvVzc5aXJVWXROK1Ara2FMZDI1a1c5bGt0Wk5pN3R5eXJJdVBUamNmenI4N1ArQ2dYZ2V4UGdqVmJGTFQ3UGZhRjRwdVlwWW1pMnQ4a3NrWlU4OVFCeWZiRmZROFB5VWE5bWVYbUVXNmVoOGFhTHI5OXBWM0hQRmN1QWg0MnRnajZWOWRmOEU4V2g4WS9FNkxXL0ZPdXkzTm5wWlZyZTN1NXR5TzV4Z01DZnU0Qjloelh4dUluNjdUajFyMEQ0Ry9HM1Z2Zy9yVFhkck5KNVVwQmJZM2NjZnlKRmZUWnBoSllqRE5VL2lQTHdsWjA2bnZiSDZZNnpxZGo0Y212UEVGMzRjdGRmOFpYa3J6MmRyZFRCNExTSUV0SEkvOEFGd0FRQmtnRDNyNXY4V1hueDMrSlhqeTZ2UGlGcjF5Z01qaDRFY3h4SXVjQUtpWUNxQmo2aXNqNFdmSGh2SDNpc2VKZFoxNENJUS82UVRJZWVEaE1jOVJrRWU5ZlRud1krRytsNjBHK0oveEJ0OThERVMyV2x5TnRWbHpsR2M5Q01jQURyMHhYemxOTExxUDcxYW5xUDkvTDNkanpyd2oreGJQOFRmRFUwZG5vYnZieVJzcmF6cWR3WW9vMkl6bENPV1BvZndxbm9ud24rSmY3T1Z6YjZYYWVNb2RWMDIxbVJZYnUzeWpRZ3VHQ3NwT1c3OCsxZHo4ZXYyek5TdDcyVHdCOE1OUGt1SjdQTVR4d0lZb29GSEJUcmhlaE9QVDByNTQ4VitOUEVYaVhTNXRZOGIrS05Ra0RTQlRhNlJ3cWs4NGVRNXh6Z2UxVkQ2M2kxZVdrUnQwYVBxZlh2aCsxL1oxMTM3UG8zaW54WHFGcHFsOURtNDFYU3JsWkFaR2I1eTBiNVBHT3ZYazFIOFgvQU5nM3hMZitFTHJ4eDRFazB6NGc2REV2blR6NlhiYmRSdEVBeVg4dFJ2NFVaTERJNTdjMThZZUh2QkdyYW5HdXMrQ1BFdXNRU2dLVWttdVBPQk9Sak9PUnovOEFxcjZoL1ltL2FiK05IdzQ4YTIzaHpWSjdpM3ZMZGg1TXNUbGZNVW5xQ1I4d1BkT1FlYTFxckVZYU4xSzY3R1VWVHF2VGM1RDRZK092SC83TnZpYTF1OU52SnJqUlpZMXVMYVJ6a3ZENWczSTNPM2V1M3Y2R3VkLzRLRGVOL2hmNCsxcVR4UjRVczRiV3p0OVBpWnIzeWxTVzRrKys1ZkhENEw3U1JqSlhwanA5ZWY4QUJRWHdCNGYxendqcFA3UTNoRHdaQmFXWGltTzRUVk5EaHMvM0duYXJHMjI5UlZBQWlTVldTNFZjSEhtUDBBcjhrdjJndkZlcTIycHorQ0xhMWtzN1B6aE85czAvbUU1SEh6RHF2VWpQclhSZ0tVTVRWNTQ2RTRpYnBVOVRpTHp4dnJQbnNOTXU1TGROM0hsdGdrZjVBcjZlL3dDQ2RHdXkvd0RDMmJQVUpKQ3pOcFV5UG5rdDYvVTE4amM1cjZkLzRKMzNDeC9FMnlnT1F6V2N3RGZqbitsZWhuRk9Ld01ySTVNRFVuS3Zxejd2OFZyNDN2ZGF0MTBMVDQxdEl5czBsNno4dUNSOG0wRWNZOUsrelA4QWdsUGN3NnI4WHJXd1dIeTVKYk8rVldPRjJocmR1QVByWHlOb211eFJJK2p6cVE4TEVwSVY2cjY1NzlxK3F2OEFnbHhxU2FQKzA3b01mbmJJTHE1TVhJR0hMeHVPK1Bhdnpxclo0Wng4ajZEWjNQeisvYTcwKzcwVDlyLzRoK0hIajh3eGVQTGxXT2NybGhuaml2bTcvZ29yZEcxOFBhWnBZUDhBcmRWbmRoNjdRQitGZlh2N2ZQaExVdEovYjUrTE5sUGRnU1IrTnBaVGtBa1Jram5BSFRCRmZILy9BQVVjc2JodEg4UDZwSXdJZWFSbko0SloxVnp4MndTUitGZmI1VFo0ZWkvSkhrNG5XTTdIeVdldEZCT1RSWDB4NGdVVVVVQUZGRkZBQlJSUlFBVVVVVUFGRkZGQUJSUlJRQVVVVVVBRkZGRkFCUlJSUUFVVVVVQUZGRkZBQlJSUlFBVVVVVUFGU1dweGNJZjlvZEtqcDl2L0FNZkNIL2FGRDJHdHowcEZ4YVc1M1k2SEhjVjlILzhBQk0rRmg4WU5VdlNqRllyS1ZpUm5JNHI1M2o4dExTSm1nM2d4RGdIcDA1cjZpLzRKazJpUWF4NG4xcVVFR1BTbklPMDg3aW9GZkpaeTdZQ1hxZlFZTFd2OGo5Q2ZnYnBGai93aTF2NHdnZU8wanQxemNHU1JRQmlUa2t0bkdjNEh2bXZ1bjlsYWU0c0xLVnJ4bGVGckZuR3hnMndpRmpnRUQ1ZmxJT08rZURYd2Y0YitHOWo0MytEcy9oTHhRMXpGWlQzU1hNc0ZwY0JYWlZZTUFjOVFjazR4MnIzTDltL1RmRnZoN1ZJdkdOajRvMU1lSGZESGhmVko3eUdZU1J3RnhadXFSL01mbjZGZ2R3eDJCSFQ0UDJLbk5TYjJaNmM1YU5INHJmOEFCUUR4enEvaGk1STBTOGUzbDFYVXJtUm1YaHhHWlhiYnoyeVJrZTFmSzJqZUpidTB1NDVvNUNzeXVDSlEyRHhYdlgvQlFTK2ZYZkdHa0phamNxV0JjNFhnbGptdm5LZTBtdHdHZGNacjlhd2RPRHd5VDdIeWxXY28xbTBmb04vd1RqL2FCMEhSdkU4ZDM0dGsrMFdPbGFlMXpNSkh5R1JDSENZNUlET3VNajFyMDM0dmZGcjRnZnRhK0w1UEZQeEgxeTdoMDB6ZVRvMmhXMjd5NDRqeXFSeDRBZDFHM0x0LzlZZkJuN0tsNTVQaVZyMjQ4VC8yZXNNTEFGb3Q2eTVBK1Vqc1QyUFk4MStvWDdCdndPL3QyNXQvSGV1MmFUU2xYa3NMVlZUWmJXOGE3ekpnNUFjZ1pQNTE4NWpJMHNCV2xMZDlFZXRUY3E4VVJmQzM5Z3ViVUxhUFYvRVVGaG9VTTdMUERIZTI0dTd4eHdSKzdKRVVYVThZSkFyQi9haS9aTDhLZUViWFRmaVA0QThkWFZ4ck9oWEFrK3pYSWkyM2NZSUJWUkNBQVFlbVQwQnJSK09QeGUrT2Z4bjhWM25oVDRVYW5Kb0dpV0U3UkMvOGx2TXVIVjhBRGNBRGpQVHJtdm5INHJmQ2Y0amVIYmlXKzFuNHVhM2RYTW1kN1RTN3dTYy9OaFNjakIvQW1zS05ESDR4Yzg1V1Q2RlNsaDZEc3R6NlUrR2Z3VitLZjdaZDVCcW1zK0x0RXNJdE10MnR0RTB2VzcxbEYyN25Mc3ZWUU9tQ2VuU3ZQLzJrditDYzNpTDRXNjN1OFhlQXI3dzVxRThpbXcxR3lsS3czWEdkMGNxZnU1QndUZ0VON1Y4NWFENDkvYUorRzAwWGlQd2g4VjVYbHQzREd4dVgyRWdZeGtIcVRnVitnSDdCbi9CWERRUGpKb24vQUF6YisxaDRkc3RXMCs4VVEzT2s2a1FOeHpnU1cwZy8xVWk1K1hHRGtDdHBmV2N1aGExNEVPTlBFeXZGMlo4cmVDUGpyKzAxK3lwY1FtODFwdkZ2aGVOREZxRmhybHQ1aWlEZHRkSExBc0FSbjFBSlBITmZkMzdFM2hmOW1ENDh5V1B4aC9aeDFtMzhKNjdMUEczaVh3SmZ6cTJtYXJiU1NCWjRXVmg4aDJ1UEtLOFpRNTJVbjdZbjdGbmd6d244TllQaVA0V3UwOFNlQXRTaWNhTnFsM0NCTlpTSGVUWjNoeHRqYmFlSEErWWpzUml2eXQrRy93QzBGNDMvQUdhZmluZC84SXhyMXhCYVFYa3YyWklwWDJyaHVkcFhCT1J3UjA0d2F6ZE9PTmg3VEQ2TWNiMDN5MUQxRC9ncGg4T3ZoejhFUGlYNHoxcnc1cmMwbHRENG51YmJUYmRibFQ1cStabFZ5Q1NjY2pPVDByNGF2dmlicjE1Y01Va0VLdVNNeGo1OEU1eHVyMGI5cFg0bGVNdmpUTEw0ajFlNGRiWmJ5U2FHS1JkclN1NTNGeVBYNmV0ZUttQjBiTEEvVDFyNkxMc043T2d2YWZFZWZpYXN1ZTBkajM3OW1YVkp2RXp3K0c1eE80bTFpMU1LTmNFeHEyY0VoU2VDUndTUFFDdjIvd0QyZWt2dEE4QldGcHBkd29PRmpWOEFiVjI3Y2dFZFJnMStNUDdBUGhaOVYrSW5oeUI3Wm1XWFZQTjZrY0lvWThkT2xmdGI4R1RyTnQ0WWpZV1VlUkFJMVVxUVhJNTdkdlR2eDlhK0Q0cXFMMjlsMFBjd0tmc2syZS9mQitlVzI4UjI3WDl6TmNSN2g1cFpUOHBCVUVqMEJJNmZXdTIvNEtTZU9vZE8vWkpXQ09jdWw3TkNpamZ5VldNdWVuZml1RCtDRjliYWpxVVZ0SkNCS01DZUZseVNUeG5JUFAzdW50WG5IL0JaWDRpZUl2QmZ3a3NQQ2d0MVhUNHRHbnVsbmFYTFBNd01ZVGIyQ3JtdmxjUEtWU3JHQzZ0SFhKWDE3SDQwNjc0ZnVOZXVZTlNpYmZKUEtTbTFDVzNHUmlPcEdNWTU5alhLK0N0ZitGM3hRK0lXbytHZmpucEVlbjY1cGlOQmIza01qTEhOSEhqSUlYUDd6Z2tkaVRYclhnM1R0SGpzSUxtZVJmTThpUEFHTjZ0dXlOdkI0L3JYbC94S3MvREhoLzRxNmZyMnMrSGtlWFh3ZyswREJhRjRwQXBKSFBVWXp3T3Rmc0dHWEpUakh5UEFxSzdjalcxVFhkUnNiYlQ5SWQ1LzdLdDdieTdRU09jaGR4SVBKNHlPZWc0N0NzSzUxaXpzYnZJeExHUU1EMTlmMHJwdmlZSmJyVGx1SU1ZUlFOcEhJNE9RQjJHRDByeTNWTG00V08zS243cFlFNTlxOUs5b25EVDFadjhBaVFhZURISmJhYjVJZFFUODVPVC9BSi9sVmp3KzZyQTMyV1FCMVhrRTlSeFdYZjZpUElnZ2wzY3hxYzQ1cXg0ZmVLeVI1Z1Njc1Z3T3ZyVVdPeEt5T2dzeExlb0ZXSDczM2lSMXJxSXJpMTFMVDMwdU9SV25OdVY4b0g1c1kvVHIrbGM5NGJ1SVlZdHBZNVlCa0JIWHBWN1NacE5Oa3ZkYnRKQXQwTGRraGJyZ25yVVZMV05LTTJwV0tYaDdkb3Zod1djME9Dc3pnTm5rRFBmMXFLMWpsdU5RV2F3a3krYzVCcTVjMnNwOE8yejNTTTB6cXpTRURyazlUN2M5cXh0RmtFZW9LOXZkYkc4NEtBRG4vUGF1UjJ0b2RpdTJhY3VyM1Z2NGt0cm00c2hJaXFGbmpjY01EMUg2OWE2cXcvc20rdVhmUzFOcGJHRUg3S3I1QWJqOUs1RFZJcmlQVXYzemJ3K0FHYkhyVzVwTU0xaklHYVVNQ094NHpVM05tcm5rL3dBUnBaTGZ3SFlLNEJYZTVBelhOZkRhL21iVWJPRlVLcUoyUmNkV3pXbDhTczIvaDYzbkRsdHlaMms5UHBXVDhIN3Bielg5T3RHQUd5L0J6anFEVVpmcFNPZk0vd0NLZXovRUpvZFgxTFMwdW9vek5GYmVRWHNaMWthTThNZHlqb2VUMTdWeEhpYTg4TTZqcnRwNFVnaGorMFBkQnhkdXUxa2JCeXZBRzdKR1IrRmJGMWQyT25hRzJzV1VLcE9QRWwya3NxSVF4VVl3Q2M4Z0FuRmVXZUs5UVlmRkt5MVN4ZHBrZTRWbUVLa25PYTcwL2ZQTWt2Y0xuanViVTVOWG1zTll2amN6d0FRck1UMVJjWS9yVkx3ZEpGWTZ1WVpWRFJTeGxISi9uVC9IRjE5djhTWEYwekg1MzQvejYxbW41R2lqKzBiQ3hHR0hhczYycHZoblpvMVloZW1hYUNNa1FxNXdmWG1zTFYvcytuYW1selBiR1ZOM0lCeFcvRmJ2TlBERERka29vNUhyV1g0eXRqYVNBa0FuUFRIV3VhRHRLeDMxVTVVN2dYdHBwTTIxdTJ4c2JWZnFLTlNodUZaWlNRQmpnK2xacTNOM0RLazNuQUxqZ0NyZDdjeXlXVzVXN2MrOWJOSEpCMjNMb0NRcEhGUHVaU3VRYzV3YXpyaHAzdkJhd0ljTXd3L3A2R3RCSkYrd3dsM3d3WGdHczY1azIzT1ZmQjYxVk42aXE2bGZ4MWJ5Nm5JMDRKTzhLYzU2Y1lJcmk3Q2VUVHRkaW1IM29wd2VmWWl2UnRTdHZQMHo3YXJBaFY1QnJ6UFVKTWFwSytNWlk0QUZkVVBlVFJ4VlBja21mcDk4RmRZbDFuNFRlRy9GbHZlbzhZdFk3VzVnY2pHN0FLdDE2NEpIdFhWM2J0TGVXbDhtbTJSTnBPU0dNSWRsNkFzdWVtVG12RS8yS1BHSzZyK3p4SmFTU2JsdHBVM0RuUEJ4K0ZlNkR5SUpQTm41aWtoVmtHZDNQNWVwRmZtdGVIczhWS0w3bjAxK2FtbWVrZkF2eFpONEErSVdpK0szYmN0cHE4TXlNeWNrQmpuSFFEQUhIdG12RmY4QWdxTDhMb3JmOXJINHJlQmJJK1hCcWVwTnFtbTU0akVkM0VrNnNNanNXUDYxM21tUEJQZS8yaWp5UnlQZ0pGNWlnSWg1eXZyL0FCY1k3OFVmOEZDTE83MVhYUGgzOGNuaUxSZUlQQlkwblU3a1p6OXIwK1Y0aUR4Z0V3eVJ0L092Unl5ZkxpVWN1Smpla2ZrcnJQZ3IreTU1b2JxNWpKUmlvQXdSeHgyN1o3MXpkMVlTUlNGQno4MkJpdlRQakhwWC9DSGVPdFJzWjdjcXNjN0dKVDFaV09RZnB6WEZhSkcvaUR4QkZhR0hLcys1Z09wQTdmbnhYM01ha293NW5zZUU0S1RzZlNuL0FBVGsvWjV0UGlOclgvQ1E2L2JNOXJheUNZaklBWXJuYW5QSFVFL2hYMlo4WGZFOWw0QjhEUTM5dEVIdkx1ZVNEUkVYN284c01ON2MvZFUxeUg3TVhnU1A5bnI0TTIya3hzSkwvVkJ2dUNWSHlGb2NsZmw1NEhBUFRtdTcvYWErSHMyaHhlQmJqUzdVUzIycWVDMXVyYVViOWp5U3l1am5KR01xM0JBNisxZkV6cXZNY3pkL2hUUFlTK3JZZlRjK0VQaTM4WDRmaDFaNmhvZHFBTlZtdTNrZTRYNWpKSWVkeDV5UUNUak9hOGM4RS9HTHh4cFhpaGJ5TFVubEZ4S1B0RUVtU2t1U01najlLMGYyb3JIVXJYNHhhdmJYb1k3TGh0bnlrREdlblA4QUt1RDBhWDdGcVVWMGNaamtES0dIVWdnaXZ0S1ZDbkhENkxvZU5LcEtWWFUvVjc5bWZ3TjhKZkFmaG5UdkVmeEk4SzIrczZqSWtjajJabDJRd3JJRk8xRlVqZGpCNU9DQ0FPL0hiYS84Ti9namZmRmExK0tIdzN1cnEzdDRiTVIzR2d6Umg0Rm02QjQyeVNnT2VtY2oxelh5MSt6NSsxYjRlOFhhSkRwbXVhc2tONFlpTGhMaHdDVGdjQTl4a2RpQ09mV3ZXb1BpMW9IZysyVytONWJmWldKWUQ3U29CejFIR1NjbkdQV3ZnS3NjYkd0SlNiMVBvSU9pNEpvOXEvYTErT21tYU4reUpxWGcrL3M0L3RzL2oyMnZkTFYxSHlBV2JKT3dJUEc0ckZ1STQvTTErUzM3U0czWC9pUExmTms1dDQ4N3VveU00Nm5OZlRIN1FuN1FtbWZFYTVndEpkWFdUVDlORE1MZVBCZTR1R0l5RlRuQ2pqSjlPTzlmS1hqYTVHcDZ4ZVg4cTdIa2xZcW1QdWpQU3ZxTW1vMUtPR3ZMZG5tWTJVWnowT0UxT3pqdDVRc1I0NzE3dCt4SHJrZmg3NHA2RGNUZzdKYmd3TmdaenZVZ2ZyWGh0NUc3U3NBY25QU3ZidmdONGJ1TkU4SzZmOFI1Y3FsbnJ0bVVHUU1xWElKL1N1L01YellOcG5OaEZhdGMvUkcxdHRXdTRtdnRNdTdlTjFtVkFrL084RGpHZi8xVjdwK3czNHRIaEw0KytGdFV1TnlHMzFpMmVlV1FqYUJ1d3dIcmpkNjk2OENndjVvTEpaUVJKNTBtYllBam5JeUQwOTY5SytCK3EzMmxhbEJEcVdZM2hsRXNUcUJsT00vNStsZm5hWE5HU1BvRzlDWC9BSUxJZkR6L0FJVjMvd0FGSmZIV3VhYSt4ZkVtaXhhbmJoUU1sbWlRTmpCLzJhL08vd0Q0S1V5emFwNFkwSFdMaVV1OHM1Wm0yWXlTZzdkQi93RFdOZnE1L3dBRnlmQ1QzSGpENE5mdEsyMldzZkUvaEJMTzZ1UXB3Wkl5QTRZZ2Rkci9BS1YrYXY3ZjNoRzIxYjlua1h0anA3aVhSdFNVdXpIQU1MWUNzTThudnpYMWVTVGJveFQ2TTg3RXExTnRkajRKWVlOSlFUazVvcjY0OEVLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDcExOUE11NDA5WEEvV282dGFKQTF6cTF2Q3A1TW81cFMwUTQ3bnFFRWNqV3FXeTRQN252WDIxL3dUUjhDT3Z3VjhRK0tIWGExOWNRV3NURTQzYzdqNmVsZkZObkZKSXM5MkpQa2hqOHNESXl6TnhpdjB3L1lyOEV5K0d2MlVmQzFpMXVRMnI2bkxjU2dSNDNLRTJnOU90ZkQ4UVZlVEN4aDNaOUpsc0U1eWw1SHYvd1d2TmY4VStIcm5TcGJtYlRIdHBmczZ5VDJITWhJd0NqRG9QbDYrOWUvL0VyVTV2aEgrd1g0OTFxOHUxKzFXL2cyOGlqbWpaZ0MweUNKVlhranEvSHZrZTFlWitFTFMydE5iaXNHM3VrTVNiZ3JiZm1PTSt1M3QrVlFmOEZYZmlXZkMvN0V0dDRIc1dBbjhWYTVaMlNiVHlZSTIrMFNZNFB5L0t2cCtWZkZVb3lyNCtGTmR6MFoyVk5zL0ZYOXErMGxmWDlMdXBpWEJzQUJ2SG9jZWxlRGVJblhlWTBIQVBIRmZUbjdZY056bzkxNGN1SXRGUjJqc3kwczl3allaaVJ3UVFCbm44Ulh6UDRvUi90RHpUS29NcmJpRTZBbkJ3UGJtdjE3QzZKSStWcXBYYk5QNFhhdyttYW1qQTRBblFzYzR3TTErNTMvQUFUSzhUYWJKcVhobUNIVm80RGRXa3RyNXpQa0F5UUZVeXBJQkFPT0QrUnI4RmZET293V0dvZ1hSeEhJTnJNRDkwOWpYMmwreWIrMnhxZmdpV3k4TGE3cWpReFI3Vmp1MGsyTHRHTWM4NFBicDM1cng4K3dzNXRUaWp0eStwSGxzMmZxSit5bjRQMFQ0WmZGN3hBUDJoL0IvaDd4bGJUWHNrTVZ0ZjJ5U3JFUktkOHlxY1lac2h1UVNjRVpya2YrQ3dmd0srQmVqZUJOUDhWZnM2ZUdJZkRscDR0MHk4anU5TXRpd2hndllRcGpraVV2KzczTEo5M2tEcUFLNW53cisxUjRRZndkRGVXK29obzVRa2htYWFQZUh6eWQrZW5HYzR5TUN2blA5dlQ5dDJ6OFZlRjFqMGZXZnRObm9OdGNMYTNBZkludlppTWhPbVZVQURQcm5tdkN3TmZHVk1Xb0pPeDJZbWpUalQ1cm41eHlmRlR4L0hxUzNWMTRvdlpaQTJHRTl3V0J4Z0ZUbjZkYTlWK0hlcHQ0d2xnOFgrQ3BUWjYxcHJpY0pBM085Y0VGZlJ1dlBwWGdkdzhqeXN6bkxNMldQcWE5Yi9aTWgxSi9HdTYzamRvVVhkTGpKQkhUbml2dHNaU2hLamRuaTRhcEpWYkkvZlQvQUlKRi9IN3dEKzB6OEJ0VStGUHhHdElkUjB2WGJRMityNlZjZlB0ZmFxRnh4OGtpa0dRRWRNZ2cxK2MzL0JTWDlqcTkvWk4rTy9pRHdaYzJCbnNZNVRQcGQ1UEY4dHhiU1lhR1JTY2drak9jQURjclY3Ri93UmExUFV2Qi93QVZmRTl2cHF0SFp5WDZORVBNSVh6TjN6WUdPdUFLK3FmK0MyZncwOFAvQUJjL1pWMHo0d3cyaXZxbWd6U2FWY1RCRzN2YnpSdkxiWndCa2gwWlIvdm4xcjRUTDhWOVF6ZDBMKzdJOS9FVXZiWWZuNm8vQ0w0eHJhYVpxemVIN0s2YVNPMmpSZ1hJd1daUVQwNFBVWTlNVjVXWVJQcUhsd2tNV2xBR2ZyWGZmRlhVcnpXcmliVzJVN2dxcGNqQUcwNEFISDRmcFhIK0NOTU9wZUk0ZC9DSTI1emp0bXZ2dmdpNUhndFhrajdYL3dDQ2JmaElYWHhJMGwzdFNmN08wTzZ1cFQ1WklVdWZMWFBIQjV4K1Zmc1A0STArd1RRN1N6MDlrWlk3WmQ4a1k2RUlEem5rRWx2MDVyODhmK0NZUHd0c0o5TjFYeENvTFhNaVcxaXJlV2NOR2krZEpndVBVcVBRMTltL0N2NDJYOTc4WHIzNFZhTDRYM1E2WEdHMUcvdU1xaXlIQUFqUUQ1aHdNL1UxK1Y1NDVZakZ0TG9mU1llMGFLVFBvTDRWNnJkNlQ0dHM3dlJOSG4xQ2NTYm50NFdJSkFZREpKSTZEa0d2bC84QTRMdGZGSnIzVG0wdkR4ZVZwdHZBc0Vnd1NYYm5uSEp5ZXZmQjYxOWpmRFd5L3dDRVBXZnhOcUU2UEVMZG1uUm93cGhDOHNRQ1BjZ1k3YzlxL016L0FJS3pmR0t3K012N1JrUGhpT0JrdFpkUVF6Ym1PVEZieEE0SjR3UVRnKzljR1MwSFd6T0VlMnB0V3ZERHVSNEpCOFA3c2VIN1h4SnAxeVV1WVVVSkh5RkkyNTRIZitMb094RmVQL0Y2VzMxYnhWNFcwNkczODZhRFZidVozd2RnakdQNGVnQk9mWEJ6VnZ4VjhhdGQrSGFYSGdodE91TDYra2QxdFo1QVRzaWNoZ1JnOUFPQWV4SjdHa3VmR3VrZUlQczk3cDFqSkFZNEFrVWNxZ0hrNWM4RGpKT1NCeFg2eEdENTFZK2RsVlNwTkV2aW1SdFYwK0cwdEhMWitZeHFCdTU2L3dBeFhuK3NSTERNdHRKSGdCdVF3clJ1ZkdPb2FUNHJTZTNmN3JEOTMxQUdhdCtKYjZ3OFJhdEJjelFLbkNsMWpIWEhjMTIzdWN0S1BVeUxsb0cxVllnQVFpRGdqcFV0c3dodUdJUEJZN2VPS29hc0RGNGhXNVFIYVNNS0JXaXJXK1ROSzRUQzVBYi9BRDcwanJSMDFtMFZ0WTI1YUxCSzllbVJtckNNOE1naFY4aHhuSTc4VTJ3MU8zMVRSWVNZdG9qRzBESEpQSE5VdkMwa2t2akdLUFVGYWUzVitZczlxd25kUkx3L3ZWVGU4VExMcDlqRkRISnVMVzY4RDYxNTVKRHFkcGUvMm5EdUlqdUNjNXdCWHBQeEgxR3h1WEVsaEZ0RWFoZktISkF4WEptL2lnU1BUWkxObE12ek1TdnJYSXBYUjZiaFozTGR6cTBkMmtjc3BCQUl3QU1kYTFkTnVnSndRMkRnL0tlMVpzZW0yMDg5cXEydUdNb0RvVzR4eFZzR1JMcVpSQ1YvZVlRNFBBelVUZGpTbmFSNXQ0OGdpdWZoYllYek1OM2xkVDFQV3NqNEhhSEZKcU5sZWlWUDMxK1Yya2pJd0t1ZVBwSjRQaGhwVnVTU3BVWkdlTVZGOEJKcmExOFdhTkhQRWQvOXFobkdjYmxPUGZwL2pSbDJsSTVzMVY2cVoxTmsrbTJIaHJYL0FBenFrQSswVzNpWjVZZk1RZ2xIQTcvaDNya2wwM1NIOGZXa1VtcC9ZQ3hiOTdHeHpHZWR2UWM1d0JYckg3UVhnMkhSTlV2dGF0b3NKZjNkdWdPUzNQbFo1NHdTUlhsZWc2YjhQOVg4UVRTWCt0WE5yZXlNM2x2TWYzZWNnWUdQeEdLN1hyTTh5MzdzNUx4RkpkRFZKa25rV1ZsYzVkZS92N1o1TlVmUE04MGJzQ1NPMWRoUDRCdTJpMUMvUHp4d3lNdTdid2UvNFZ5a0ZoSXNrd0dmM2JIT2FWUXZEdld4cVF3RXRGSkhLVllNT2ZiMXFUV3JlMXZtbFNVRmlGK1ZpS2sweC90Zmt4UnFGS25ra0RGV2RUaWpFY2l1MjF1bTBkYTRuTzB6MW94YnBuRzNSUTNDUlo3WTlxMHBkUFpMRVRKSjFHY2VsWitxV2dqWVNiaGxXNEFxL0ZMY1MySURzZUIwcnN1bWp6cldsWU5vbHR3eGNCaDJxbmRuYklvbGpJNDVOYUZwQ3Jyc0orWmp3YVRWQkdGQVZBUXZCb2kxY3FjZmRGYVdPVFNmM1l5Q3ZUcFhuUGlLMkNYN3VnL2k1cjBEVDJGekU5a0JoZ01xZTFjbDR5MDhXMC9URzlpQWZXdWlEdEpIRlhWMGZSMy9BQVR5OGRSMitsNnQ0UmxjTVRINXFSSCtMR01pdnJIUkxpRHhKZXh6cmN2YlN4cVBKMi9NdU9DQVIzcjg2ZjJWdkgzL0FBZ2Z4V3NwTG1VcGIzTXBnbU9UMGJBL3dyN3grSGV1NmxZRzZRMlFNeVhPeU9ZNCs2M0lPT2NqSDg2K0x6ekRleHh6bDBlcDdHQ3ErMW9KZGp2dFJYVkxZTlBKYnkvYUkwd3BSdmxiUFRCUFE4MTZGNHAwUnZpdCt4SjRrMGU5SDJyVy9BT3EybmlhelNOQ1N0cElEYlhnR3dkZzBUdHovQVRYbE5qZDZ4RnJNZHliK1NReXJpV0pzNC9BZmh4WHR2N0FQeFY4STZKOFpyVHcvd0NQSWxmUlBFVVZ6b1hpT0NYY1JMYjNhdkZKdXg2Qmdmd0JyejhQSndxcG0xVlhnMGZuSisyaDhHUEVIaWV4MDM0aGVGOUd1THp5WVBzK3EvWmszN2NZS3Z4Nmo5Szg0K0ZYd0g4UitGL0UzaCs1OFg2VEpiUzZ2cTl2SEhiVERhd2kzaHNrRVpHZUQ3ZzEra1hqYncxci93QUUvRjNpcjRDM3lRMm1zK0Q5YXVOUEZ6ZThDNmdTUUdOdHBKM2JvOWhCSTZFNHI1aytKVnRyUGlQNG8rRnRRMW81a0d1d3J1UlFBcWdjS3ZPUHk3NXI2K1dKbFBDdExzZVBHS1ZWSHQzeGJnMVh3RytsK0tMWm83cXllNFN5OGxtQ21HWEc0TmpQSFhIVHNmVVY3UDRYMFBUL0FOcFh3Sm92dzcxdjRnV0hoL1ZkSHVKSDhQNnBxTnFKTFJJNWlwbXM3aFV5NFZtMnNqRElSZzNCREhIblB4QzhJdDQwL1kvOFIzZ3ZHanVJZkY5bWhtakRHWFpKRElGWUZjaGVWd09PVFh4ZjQ0K01YN1JId3BzSllvdkY0bDA2M0loTTBraGltVGdZRFl4dUl4NzE4L2dNSldxTDJsTjYzUFJyMUtjVnl6UFovd0J2TDloSFRQQmFYT2thbjhVZkR1dDYrZE5sdjdDZlJadHlQNWJZa2h5RDg1d3BLdDNBUGZpdnp0dnRQYXkxQjdjZzdnVGdHdlpJZjJrdkc5OXJUK0lyclY3clVMNHd5UjI3dXhXS0lTRERjZlFtdlBOYTBEVWI2N0dwR0RjSnNaWlIzL3BYMXVFOXZUamFvenlad2pOM2lZTm5lNmxwOXgvbzh6NTZrcXg1cnBMWHhkNHYxQzJGbEpxYzIwZ1lWV1laOU9uMXE3NGE4Q1RhcGZ4V3lFSTdOaFN3Nm5QVEhldlRkWThFV25oVFRJTk51dExoKzFzb2tpbFhHSFhiazUvTHBubXFxVHBTbHFqV05Hb28zdVY3WDRTYTc0UjBuVHZFZXJXYmtTb0haOW1lMjdiMXowMm12T1BIQlFhbGNHQ0xhcGxiR1IwSGV2dWI5a3I0Q2ZGejlweTBYU0xEUXJhOWhoQ3FyWGt3aVdNbmJoRkpITFl6Z1o3RWMxNS84YnYyRVBEbW5mRUcvd0RCYzNpaWJTdFZ0SnBFdWRNdUUzTUdVakpVdGdFY2s1N2pwMnFJWXJEdWZJbnFpSlVwcGFvK09ORDhOM2ZpZlhJZEpzRi9lU3Znc2VnR2VTZmJGZlpPci9BUy93REJIN0dxYWlJM3k4dHZjSGtaVk41WEo5T21meHJuUGg1K3pkNGE4RzZ4Tlk2TnFFbC9kck0wTnhmTXVNTHRPUWdBSXh4bkorbGZRejM5NTRvK0VHcStCNWRXaHU5TXR0TWxodDBWTXNabFVNU3BIVkJ0R01ldGNPUHhLa2xGYkdsQ255dTdLWDdNdXRhaDRxOElhWGY2aGR5TzhWbUZYTGNCbCtVL3lINVY3VHBPdFE2VnJNYVhramtDM0R3bEI4b2JvY25uRmZLbjdIbnhBTm5lNnI0STFJZVUxbmQ3NGxJNU1iblBYMk5mVGVsNnRiWE1FaGVWWFYwK2Zqb004bkdhK1R4VUpVcWpSNjBKWGhjKzB2MnJ2Q2tuN1FuL0FBUnB0UEZ1bjJpM21wZkMvd0FRcGRSdHNMUEhhczIxeUNNY1ljSDB3Sy9OWDQ5ZUhrK0ovd0N6NXFyV0M1a3ZQRHhrZUVaQkVzT2M4ZHpqOUsvV1gvZ2xacUhoMzRuZkRyeGwreko0dUlsMDN4ZjRlbmhqaG1PNCtac0tOMjRPMGh2d0ZmbS9xWGd1YjRYYTFydndiOFIyZmtYdmhuWHJ6UjlWU1ZQbGFOc29rbno4bk9CMDdDdS9LY1J5U1YrdjZHRldLblRsSCt0VDhkNUVhTjJpYmdxY0VVMnV6L2FDK0hGOThKL2kvcm5nbStVZzIxNFdpWmhqZEcvenFmeU5jWlgzOFpLY1UwZk5TaTR5YUNpaWlxRUZGRkZBQlJSUlFBVVVVVUFGRkZGQUJSUlJRQVVVVVVBRkZGRkFCUlJSUUFVVVVVQUZGRkZBQlJSUlFBVXFmZUZKUURnNW9BY3hHNC9TdGp3UFpOY2F4NS9hSlNTUldLVGs1cnRQaHJwaXRaVHp1dVdsZFVpejY1L3hyT3RMbHBzMW94NXBuZWVDdkR0ejRpOFI2VDRYMCtGNUp0UXZrUlkxNy9NQjZmalg2NmZEWFFyM3dQcFBobnd2cGx2YTNFZmh2VDBOM1ozRDdUSVNtWENaNERnYzg0NlY4RmY4RTIvaExENDUvYVdoOFJhemFodE44SzI3WEZ3ekRnbEFlTTQ2NXI5RC9COHNXdVF6YTFmd2J2N1Nsa1lnZzVVc1NGNmpnYmU0cjg0eit1cW1NVUZ0RStud1ZOMDhPMitwNmQ0WXRQRzJ2UzIzaUh3UHFkajVkOVBHNWt1MDNwSkFHSXhrY1p5RHdPVFhnWC9CVTN4OWE2cDhYZkFud2xrdWc5dm8ybXRmM2cybGs4eWRncWNBNDRSTTQ5Q2E5OCtCbmg1dkNlcHZaNlhlencyVnl1NXRPbGxPeFpEdEdFSnhqKzlnQWRUeWErRy9qMTR0MUg0cC90UCtOL2liTVdlMXR0UWx0N1IwaER4K1RicjVTY3FjRG9jODE1K1QwRlBNT2ZzYVltZkxSc2N4KzFCOEI5TytLL3c0dWZHZmcxSkpSWjNadEk3amE4Y1VVaERIbk9SdFB5Z0hJd0FSWDV4K085SDFIUk5VdU5JMVcya2p1b1pDSmxkY2JTQU9QcDZWK3RuN0sveGUwNjA4TWE3OExmaVBZS3ZoM3hJSFpydG0zTmF6RUJWa0FmSXdBYzdoMHJ4ejQzZnNyZUJQSDE3ZWFkNHQ4TlhFcjJzaFdIWE5ML2VPNmtnSVgyakRmTGc0NjE5L2hjU295dEkrZnFRYlorYVdEbkZhdmgzVS9FRmpjS05MbGt4bjdtTXFmd05mY243UHYvQk1Ed1A4V2ZpVkY0TzBEV3JXN3ViaTVFY01PcmFuSFpJR1psQ3FUSVJ5YzRIb2FmOEF0ZjhBL0JOZnhyK3paNDR1dkJuaWJ3dC9ZdDdaUnhDNHRwOE1IaGJHMmVKMStXVlcrYkRxY0hIWTEzdkYwWnZrTVkwSngxdWZMdmhyWGZpRHEwY2VuVzBjNTM0SGt3aDFERDM3ZEtYNGxEeEhKWlFXR3RYaTdZbEd5MmpiNUZPUFQxeFhwOXBvdHA0WXRvYmV5dW5qbmlzMlM2azZHU1FNY0Vjbm5HQlhsdnhQM1c2U1hVVnlYM25MTVNPVDFyT25TcHhuZEkzbktUalpzODhoMEtXNjFlT3dFaXI1a2dCWmp3TW5yWDNoK3dIK3pIOE92RVdrekcxK0prTmhjTkdwdWJxUzFSM3lRQVZRRWpCR1NEbjFHSytDUDdSdTRMd1hTUDhBT3B5RFhvSHd0L2FHOFpmRGk3VzQ4TjY5TFp0bjUwWnpzYjE2VmptbERGNG1qYWpLd1lTVkdFL2VQMXIrRitqK0UvMmJiOVl2QzNqYVZMZFY4eTl2Ym9JSEtqRE96ZE1Zd2NEcnpYdjNpTDRxYXY4QXRhL3NHL0ZIeHFaMmkwNjFzNEx6UnJlTmxLckhhM0s0Y2tuY3VWTGdEbnVCNlYrT0NmdEllTnZpbHByMkdyK0tvcEZsQk1salp5SE1wd0RseWVUMHpqcFg2MmZzVXhOYWY4RXJmR2VuNjlwMDhKdWZCbDY4TXN0b1FrZ01ZSUljZzVHZnVqaitMNlY4TmpNdm5oS3NLbFIzbGRIdDBxNnFRY1ZzZmlGKzBCWVhYaEx4M3JQaEtIS3hDOU9Wd1FHWE9WeG42MUQ4SS9CdDVMY1cycHkyN0dLNGxDcXhIRFk2amo2VjlOL0dQOWo2VDQyYTFiZUxiUFdvOU5uZTNRWHNNa0JiSzRYNStnNXdmcGl1dytBLzdPZmhyeDE4V3ZEUHdoMERZMm02U3l6YW5jaGlNcXB5NVBHT1RnRDY0TmZiWXZGUnA0TG5iNkhqMHFUblhzZmRYN0Rmd3ZnK0czd24wVzN2TFpJbmJUUmNUSXFrWmtsK2RqajZCUjZjVjlGK0dwOVF1OVdScjNRNGRqT1dqM0psaU1ncVNlTy80OWE0bnc5QnAzZ3p6TDNVYjJPTzFLUjI5dWpxRldOQVNNRVp5Q2NIOCthOUw4SlhzSG5RenBwMGx5RkFVQ0w1aHVQVEJ4Mnp3ZmF2eVBGWWlVNnNwcyttcDAwb3BHdjRsMERWZE8wQ1g0bGE5NDMxZXowSFJMVjVYMEtFb3R2ZnlBWS9lc1J2ZEFlZ0dPVjU2VitRbnhMOGR6ZkYvd0RhRTFyeGxCTXNnakxReEZoeTBzNzV4Z2drL0xnWkZmcUQvd0FGUGZpdWZocit6by9odDVsZ2FXejNTQlovdkVxeDI1eitQVHVLL0UvNGwrTU5YK0h2Z0tMVnRPOHlEVU5WMUVYYk5HU0FHTEVvTWdmVEhmazE5RHdoaG5Wbk91L1JISm1WWGtwcUIxSDdTaG44SStMYmV4dU5CV0c0MUJmTWt1V0h6eHdxU3F4WkE0ejFySThQYVJvbXJMRkhlazI1ZFFCS2ZsejB3T2xUZkhHUjVQRkZsL3drT3FyTHFzOWpCUGRLZHVJM1pkMnpIT2V2SHZYUCtML0U5eEJhV3l3MnZrcXFESlRnTjZZL092MFduRjJQbkttOWptZkcxbi9abmpDWFQ3ZVVTQ051R1VkYVhTTGw3dlg0ckthNlNKR1RCa1lnQWY4QTY2b1hGK21yYXdyU1NaWXJnTWVwcVo1STlQdlVtWkZKM2NCaGtIbnJXcHBCT3hldnBHdGRVOGdnT0ltMm1ST2g1NHdhMlk5T3Q5U3RRMHNmYkl4eGl1ZnU3bTNFL3dCcG1UYU5nVXFPUUs2aXhraXRQTG5pSlpKTFllWHVIVnZla2FORXlodE44aXpnT0VaY0VEai9BRDBxNzRIV01lSVhQR0ZCSnorTmN0cWZpQzRrOFd3UVdxL3U0ODd2YlBXdXU4Q1cwaytzM0NwRzJDbTR1QjAvem11ZXZKS05qcXdkTjgxeTA5OXBFdDllYVhGT3B1USs2UmU2TG1zL1VQTXU3eUpaSVFURTJOd0ZabXR4eDZWOFR0UXViV0VsbXRsRHNDY1pwMFdyK1hkQ1NUdWVWeFhLa2p0ZDJYNyswdUpOVHQ0bEorWmNMczQ1cXpwaWFoTE04TXR6c0N0Z3F4em5rVWwzcmVuMjE3WXpJcFlpVEJVRG5GV1Z1cmxyaVNWSURzZHlRZlQvQU92U3FNdWpBOGErSTJwS1BBdW1SN2lUdFhybXEvd2lzbWsrSk9sdGJYR0RKSXA0YkdPZTM2VWVPelozdncwMDZRWUR4dUYrdjFwM3dKRVV2eEMweHpMdFVUSnU1d2NacWN2VjRmTXh6UDR6M25XdkIxMXFlcGVLSTF2VnVJVTAxYmhvWkZ6c2tqWUFnWjRYQWJHUm5qRmZOUGlhR1BTOVhua2hqSUVOeXd4a2RRYzlxK25MRHdwNHhrK08zalB3Wm9OcTExRStrUGRib21EZ1F2RWgzNXdjRGpuOEsrY2ZpaHBjMmw2OWM2UEs0Wm81VzN1cHp1UFBPZS9hdlNzbEk4cGF4TnZRUGlpUjRGbjAvVFBEOXF0eUhKdTU1WFp4SW1PZ1RvRG5uajFybk5PZ251Tk9rdVJDRmFUSmVUdCtHZTFaZmd2WExmU3J5NHROUVVpS2JnNUZlaitCL0RGenEzZ2ZXTmYwR3pTNWhzQ1B0TW4yNkpYaURkRDViTnVjWXowQndhenFhSzVWQmUrY3BwaW1GMTNERzA1TGV1UC9BSzFYSmZMdlRNMk01YjcxWjluY3JhM0RSek9XZVFsVlVqcHhXakptd3VtdFkweUdqQkIvQVY1MC9pUGJoWjB6a3RldG10cnNvblRmOHpaNHF4cDBVZ2xMTk1ERjVaS2ozcHZpWGY1aHlPdk9haGhrTWRrQ2hQSE5kVVhlSjUwMWFvelcxT3h0NE5Lczd2VHJnUEswYk5NZ09TUFNxVnZHOXhwamlVL3ZPY0E5NmtzcnVPNGJKaXcyM0JJNkVEdlZYelJEcUJYemUvSHBUV2pCcTVYMCs2bXM1VEl5NFpEa3EzZjIvS3B2Rjl0NGUxZlNJcnZUR25GL2tpZTJtUWVXRjIvZVErdlN0R1hSSnIyUTZoYld4WlZqK2Rod0t5YiszMndpVzI2eG5yK3RiUmR6a3F3WnhHbkxOWmFsRmNvU0hqWU1DT01FR3YwUCtBSGplMThZL0NMVHZHRThxeU1scUliNVNjWVpBT2Z6eG44SytDTmQwaWUyczR0WEVHSXJ0VzJQaitJZFJYdm43QjN4VWlzNzIvOEFoUnJGd1Z0dFVoTWx1emRkK0JrRDM0eVBYRmVibm1HZGZDcWEzaWE1ZlU5blU1ZTU5YmFacWs5MWJxTlBnUjVXWUNKbVAzT003ajZqbXRyVEo3alN0VWh2dE5DUm1KdzVsVVkrWWZ4WXp5ZXBGY1I0U3ROVDAzeElkTGZWZnRNYVFLWUNINUl4bjZrLzBycko1WGd1dnNqUjVrZE4yd0RqSHFUMkgrRmZITFE5aWVwOUlmdHUrQWJiOW9INERlRVAyNC9EZHFsenFWdmJRK0hmaU1rVEJjWE1JeGEzVDRQOGNmeUVuSnlvNXI0RS9hUzE0M1BoNncxYXh0dnNkeHBtb1F5R2ZjTVlEQUVBbm9SazhlNXI3NS9ZQStOWGhlMzEzV1AyZlBqUzVid1Q4UXJIK3pkVmpsK1lXY3IvQVBIdmRxVGtCa2ZIUFlWODAvdHpmc2srTVBncnJ2aW40VmVKOHJMcHM4a0VUcHlKMFlaaG5SczVLdXUwOER2WDBXWDRpTlduN09XNTVkYURwMUZJOXMvWkl0SWZpajhHZmlCOE9iYUlUM0dxZUN6cU9sUWtGM054Wk1KVjJxQ0J1OHZmanZnbXZ6cy9iRzhLM3Q5cGx2TmNXalJ4blVXa1dKVndpQmdTQmpQWCs5WDFSL3dUWS9hVXV2Q0RhRDR6YS9SZFI4UDZ1bGpyR2pTVzI1N21JaGtrQlVLTjI2TWxkdVJ3RzlLNkQvZ29YK3pINFJzUEZGd25naGZzL2hMeGRFK3JlRGI1a1lEYTdaYTFkc1lTU0Z5Zmw2N0NwenpSbHMzaE1YT2xMcnNhWXhLcFRVMGZtcG9QaEpKSS9NdDE0alFlWVQvRC93RFgvd0FLNjJ4OFBxdWxtK05za2lXMTBNSTJPUWM5ZmF0T2J3anF2Z2pXTGl5MW5TNUlsU0dRUHVWaHYyZzhnNHdRZVByeldMcFhpbDlRMGt3dE1JU0xrSElBK1pSazlmWWZ5eFh2VGsyN2tVSERrTDF2b2w0bmlPUFUvRDltZC9tTHRoeDFJNEo1N1Z1L0ZId1g4Ui9GRStuWCtuK0dyd1IyZHBJOTJGalVDUElKd0IzNEdNZHNmalgxUCt6Rit6ejhOZEY4QzJmai93Q0tHclNpZS9pRWlXZGdVREtqOHJsenlXT08yRFgwWjhGLzJmUDJhZmkxcjhkcDRPOFZ6NkpyTnl4anNwZGMyM05qY3kvd3hTc01sQVdPM2YxWFBRMTQ5VE5LTWExa2REaEp3UG1QOWl2NDgzbWxmRHhmQ3ZnTFZqYWVJTEdkSjRka3hScFdUTEFKOHdQekVoU09od0s2MzlwQ0dENDIrUGo4YXZEV2pRMmV1Nmpab212NlMrSUxpenZGVUl6eHEyTjhiNVhIM216dVBIRmVaL3RoL3NpZUp2Z2g4Y05Wc3RHdDdyUWRSMDIra1Y3VVNFTkROdUxiRklHR2pJMnNqWStaV0JybDdEeGgrMC9xNldtaFhYaWFDNmxRSXR2TmRXS3RNQUR3QTIzT1JucDdWbkhEcU5SMTZiM01KVkhPS2d6cVBGM3crMXp3bjRkbjhSYXBxME1GMWR1SUk5UHQ1ZHp5U09Cbkw4NGJnOStoSDByMGU0MGE1dXZnL3dDSEUwVFRJZEZrdHIveW52NDQrSGpNV1EwaTUrZmNjakpIWTlNVXp3LzhDL0UrcjZOQnFQeE84WHphNXFrYWJiTFRyYU1CRlpqbktyamxRUzNJd1JYc0dwVCtEb3YyYm8vaGY0ZHRaVDR6djliVzZuMDRXZ1AyYXdoaklYNXpqQWZkMFBUa2s4R3VPdGlWVnF4akhYVXIyYlVMbjU1YU5xVVB3Ny9hUUN6QkJiNmdXZ01rUkpqWThsR1gwQkdNRHJ6WDFYNEYxL1V0U3ZmS2h1SWJjVDdWZDVXK1ZGNXpuOFJpdmtUOW9mUWRVdGZGTjFQYnhSeDNWaGR1L2x3eUt6UlBHNXlDUng5TWRRSzkwK0RmaWVMeHA0SnN0V2l1UVd1SUZra2pWeDhycndSMjc1cTh4b0pxTTBQRFZMcmxaOTEvOEUvdmpMcW53by9hTThPNmxjYXR1dExlL1R6cHpqQWlkZHI0OXVldGQxL3dYQS9aL3N2aG4rMDVvdjdRV2kyMnp3ejhUOVBFR3FUUm96SWwrZ0JXWDB5UnNidDNyNDkrRnZqZDlIMUdPOHZaOW9nYlpHeW51TTQ5ZnBYNlFlQ3JqVmYrQ2puN0VXdi9BQUQrSjJqR1BXL0Qxai9iWHcrMVdaZzhrN1FLU1l6M0RZeURnZEc5cTg2bTFTbWpaMzNQd2Y4QStDcDN3cGJTNWREK0pGdnBleVVTeWFkcXNxZ25McUFZMkp4amtBMThkVitySHgyOE0yZng1K0N2aVA0YTY1RURmMmlDRlRzTzRYRVovY3k4ak9TQVVQMHI4c2RaMGkvMERWYmpSTlRnYU80dFoyaW1qWWNoZ2NFVjk3bDFWVk1Panc4YlRjYXQrNVZvb29ydk9NS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29IWHBRQTZLSnBaVmpVY3NjVjZ2NExzRnNMTzNXTkRtRmZOd1A3M1lmaWNWeEh3ODBNYXZyRytWZjNjSXk3RWNDdnEvOWl6OW5JZkhuNDY2VDRJdVl5dWwyb0dvZUlKOXB4RGF4ODdDY0VBbmpIdXc5Szh2TXNYSEQwbTMwUFJ3VkIxSkt4OVQvQUxBdndhMVQ0YWZBeUc4MUc0VzAxWHh0S1pIbG1UbGJYSEI5OXhCUFBPRFgwTGRPbHRiL0FQQ0p4WEtSU1hGcXdpdTdJNGxSU0I5d2RpRG5yVlBXdGEweTd0Ym1iUnRNYUt5c0JGQnAwVWE3UEtpUWtEQXpnamFBVGlzbnd6OE92R3VvK1A0ZkUxeDhSSU5Rc0htRytFeGxIVlNRUW5QSDhYR1BUbXZ6aVRWZXBLck43bjBiZklsRkhwUGpieHJwMzdMbjdPT3UvRkxVTll2TDYvaHN2SzA1Nys1THkzRjNLdmx4TGpJUHluSjlndGZCNHZmQ043OEhibUc1MVBWRjhSNjNmUnBIR2RzVVd6Y1hkeWY0dDJUeVJuM3Izci9ncE44U0xUV2ZHSGhMOW4yeTFMYkJwVVoxVFdZNDJLQnJtVVloUW5vR1ZBeEkvd0JyOGErVnZGMnQrRHRIK1BXbGFQZmFpTFRSNDQwUTNUS1dRUDFPUjgzR2V0ZTlrK0Y5bGgzVWExWjV1S3FxVlRrUHBLLytISGhmNE8vREw0YzNualMxbmpzdkUybHl6emFwYTIrSklwSTVmN3VlUUZJeU1kQlhVNlo4SzdLUFJMclZQQnZ4ODB1NjAyOWpOMXVFK0hoQVNUZ2h1a25ZQUVaeWZsNHJzdkFVM3c4L2FIK0hXbWZCWHhiT3VyNkJhWEc3UXZFZWlETDJUUGdZbEMvZVFya2tBNTVGYUh4by93Q0NMbmpEd244T1pQaXQ0RXY0TlcwaUNEN1FaTkd2R2VSWVJnL05Fd1k1N2tmUWNjMTJVOFRDZnV0MmtjczRPTDEyUG56OW5UNEJhSjRBOGZ3ZUpIOFh4YXBmUGRIekhSOTF2QkZ2REtnZHZ2U3RuZGd0aFNUMkZkeCszcDhmRi9hTDhhUmVBdkJGeXVwZjhJbDRJR21YbW9obGRQTzgzelBKMzVDbllEajhlSytkZkczaHp4N3BHdGY4SXQ0ajhiNnBzdGtLejJWcGlGQmc4REtqQnpnWVBxT2VsV1BoZDhQYi93QWMrTDdQNGFhTHJrbWxhTk1vbjhRdXE0ZlprcnNac0hPN2dkZStjVlVhRlNuVitzMVphSXZuak5LRVZxZVFhMzhJUEcvaUN5STAwUmVZdi9MUHlqbmpqYmtLUjc5ZWxlSS9FejRlK0w5QXZIc3ZFMWhMQzQ3eVlLdVBWU3ZCcjkwL2dEK3paK3lSNFowKzAwelgvQVdtWGlHTkZrdkx5NkxUb1JnRXNWSUs4OFpBNDlLOE8vNExHZnNRL0NyNGYrQ3RFOGRlQWJWRjA3V3JpYTJnYVhCbXM3bEl2TTJlYWR2bXhOR0NSdU9RUjNCcXNMeEZoOFJpUFpXc0ZUQnpqRzUrSzJyZUhYc0pDbHhFVjNESUI2aXNLWlRES1VCeUFjZld2WnZpUG9HbjNPaHllSVl3aUJOeVFSb294dFVqMDl5ZnpyeU9EVEx6VmRRRmxwMW84MDByNGpqalhKWWsxOVBTa21qeTZrWGV5UFIvMmF0QW0xVFdMbThqaFpodFNCRlhxWGRnT3g3ZGEvZFBYL0ZPai9ESC9nbkJyL2hlV1ZSSE40WGpzb1Zrakl3MGpJbXdBbjJMRDYrK0svTFQvZ25wK3pKNGc4YWZFYlNkSSt4cWJiVHJoYnpWWjVFL2RpUWZkanpqOFNNNUdLKzl2MjFtZThoOE1mQnJ3dXBsZzArTnRYMSt3Z2RRZklpWEVTQWtucnkyTytEWHhHYzFWaXMxaFRpOWoyc0hUZFBEdVRQSXZpMThSL2gxNFcrQ0duNmZwZHZGTnJUUnh3d3RHdUhqY05saVNBZHk3VkhUOWE2ei9nbmQ0WDFPRFJOUStLMnJXR2RRMTZaMWdKVWhoYmdoeXg5QVJ1NXgxeFhsdW1lQTlKK09IeFNzL0RPZ2FZcTZUSEVrK29zd09QSVFiU1FNNEJPY1lIMXI3VCtEdWgydmhxMldiVHRPdC9zTmhhZlo3TzBZZ1lDNVVzUCtBbnI2OWF3ejNHTDJLb0ptdUJwV201czdxM3V0QTEvUkpudXRIaU5yTnZKRXIvdkNoYjd3enowNkhQclhyUHdEOE9UV2NWcGRpUm5zMEs3QThwTHFvd1J6ajd1TjJLK2UvR2ZoL3dBV2F0ZVdBOEhhOUZwc3kzUWtsdFhnM3czQ0RBMjhjbkc0OERIUFN1eThYZnRhK0ZmaEg4SHI3UWJQWDAvNFNsYlY3ZE5PYVVlZmJ2OEFkM3VyZEYyaklKOWV2TmZEWXZEMUp4U3A2dG5zUWxGUFUrWC9BUGdzbiswZmErUC9BSWhXZncwMFBVQzhEVGtTYlN4L2RSWkI0K3VSK0Zmbno0ZzFTKzhmL0ZHdzhDU01nc0xBZmE3czdlUWtlZGc1N0U0L092U3ZHM3hJaStJM3hFMW40aCtKTDd6YmZ6R3RyV2FSU1E4U2xpNzRIWEp5Y2oxcnpqNFl3eDM5L3EzeEJtWXhmMnpmTXR1TjJOdHVod09mUW12MUhoL0FQQllDTUh1ZlA1aFhVNnJaZytNTk84VVQrT3JvMnNNOTI1azNSeVJvV1lEakErZzZWcy9EejRpK0g0ZkVjM2c3NGhmQ1NYWFlibTJNRVV4dlpMZVd6a1BTWWNjZ2Vocm9mQlh4UHNQZ3I4WFpkUThVcEhxbWs2cGI0Uzd0eUdrZ2JKS2tyMXovQVBXSnFQNGcvRkxTZkduak9YV2ZEK2xHMmh3UEtjeDdTMk8vSFkxOUJIUkhsTnVVano2LzBheTByeGw5bmdrTElzcFZDeHprWnlQMHArdXpDU1dOM2pLbFdPM1BmNXYvQU5kSnFiRzYxNzdRalliZUNUbW8vRTBjc1poVWpodWR4NzgvL1hwczdJS3lKdFFTYVNBWGFoVEdtQVJrY0QxOSt0ZHJERkVkRWdsZ1h6RjhvRldIYmo5T3RjaGFUUUpKRGJqRFpDZ3FSbk5kV3VvTmFNMW11QW0wQkV4am1raXBvNWZUVmU5OFR6WEVhY1JqQkpGZXVmRGN2WlhEWFRxQkhQaFdIY1lyelBTdFBrT3B5VGhzSkpKZ2dEODY5SzBPQlliR05JcnNDU0laVUJ1bjRWNStJZXA2V0Rzb21MNDIrekR4Yk5jaTJ4dkF5UU90VVZ0YmVTZENrSTNOMDQ3MVkxMmE0dXRUUDJ4d0hKd3ZUaXRDeE5sYlJDSmtET28rVDFVMUVkaloyNWptcDVGajFkTjNHRGdZSFN0alJyL0V6d0ZtY1o0M0RpbWVON2RMV2V3dnRQZ1FGcHRralk5cXFMcURXYzRRRUVIc2V2V2g2bWtEeWp4ckdzWHcxc29VSC9MWFBlcS93cTFtL2g4WDZmSnFMTEtxbkNCb3g2akE5NjFmR21tSW53eGdsM2d0SFBuSDUxaytHcnZSWTlhc2RSMEt5dWcwY1VmbVIzRWdPNllINWlwR01BanA2VXN0a25CK3B5Wm44U1BYUGhYOFROUTBmOW95UFViYWFTekY5REpZdUxadjRHVmxDODhZeUJ4N0N2Sy9pc3QyL2orOWt1NHlDdDIwYmJ1dVEyT2ZmSE5kWDRiakdyZkh6VFpyQmtzdmtpbmtEU0FsU0I2ODlTZlNvZjJockhSWDhWNnBjYWV5aVI3Z1NoMEgrc0RLTTU1STRQdnpudFhkT1h2bm13WHVuQitQTkhzTFR4UktiQ0VCVHNPMGNZeU0xSm84YVdkeTdSZ2JsVWJUam5IMS9Dbzlka2p1dGJKV1VFbU9Na2crdzRxZU5JMUx0RzJBeTlld1ArY1ZGUjZHMUJLOXhsa3JYT3NxOHVTNDU0UHBXaHFkNG91a1NWaGtxTURGWldsdmVKcktDR0hjUzN6TVJ4MTYxZDEwUlI2dEhNcUYxVlFEWERQV1I2Vk5ya01yeFhGSXFDVmVoUFFDcXQ3Y1c4ZW1STEhiSGYxWSsxYm1yUjI5OVovSXVYNCtUUFArZWF4YjFZaVVpa0lCWCtIRmEwNXZsc1lWYVQ1cmpkSHVIWkRLVTdjS2ZTcStvTURxSzdPR1k4RHBXNW9HbVdkOXFzTnBQY3BieFNjTTdFWUhwN2MxYjhZK0dScEZ0SmMyS0I0VW0yeFhTcmxjZzlqL0FCWkg4cTFpN3N3cWU0dFNoWWFyUEpCSmFSWERJRkJES0c0TlZ4emJ5UVRSQW5hY0QxcG5oMnl1YjYvYUJFSkxJeFlxT29vdWZ0TWR5cFlNQ0cycUsyaXJIUE9Ta2lySHEwRjU0T3VmQ2VvMllKUzRGeFl6NDVqYm95bjF6bXNYd3Y0am44R2VLZFA4VmFkTHRsdEoxTzBkY3IvaU1qOGF2ekdWSnBJSFVnN2o4d0hlc0hYYlB5WTU1Y1lLTXBBOWpXdktxa2VWN000MU4wNTM3SDMzOE5QR3VoZU03SFR2SE9uUGxydUplUkpqYS9jSHRuRmVwWE9xeFBhcGMyemhHVlFHWTVCS25zZlhwWHd0K3h2OFZXZ3ZMajRaNmxlN1Z2VUw2ZThyY0xNQjBBOVRYMXg0UDFuUzViU1BTTHE2YWU3alVlY3VEaENjY0hyeDFGZkJaaGhKWVBFdUwyNkgwVktzcTlKTkhkYVhxdHpwdHhIZFdjZTNCSFRKRGNFNUE5UjFGZlRmeE1mL0FJYkMvWmNQaVFOOXI4YS9ES3lFV3FScWN6NnBvSVB5ei9LTXlTMnpIa2RvMko3VjhwYWM5eGFXRjJ0d1Yzci9BTWVKems0eDFydXYyY1BqZDRtK0IzeE4wM3g1bzJxRVNwSnVNZHhob1pBd0lsamtHY2VXNjVSZ1FjZzFqaDZrcVZSU1JOU0NuRnBueWJxR3Rhbit6cDhmMThhWFdtbUhSdFhrV08rOGlReHJGS1J5NFZTUUdJK1lIcnpYM3BwWHhxK0VQaWY0SWp3UDhZdEJ2OVU4TFg3aVhTTlgwZFEwMmlYMk5zY2lGM0NyaGNrcVB2WlA0OHAvd1VHL1psK0gzaXpRYlg0cy9ESFJ3ZkFQakl1TE9LTExOb1dvRDVwdE9rSis0VXp1aUorOUVSam9hK1R2Z1Y4ZnZHbjdNdml4L2hIOFE0WTczUkx3YkxVYWdwYUM5dHkzM0hQWnNEQUk1SHIwcjI4UlRXSlNyMC9pVzV4MHFuTGVsUFk5ZCtLSHdtOEg2bERMYm40eTZGcWxuR3FyQ0RES3JMSGdzREpHeTVERGdIRFk0UHBYeXo4Vy9nZjRJOEphUGVhOTRKOFFTWGx3cEQzRnZEQXdqOHRzWnhucGc3am4wRmZYdXErQ1BoTDhUclIvRW53aXZaWXJtV1BKOE9YMDhrNnhzcVlJaGxCNUJKd0ZrQUlDOSt0ZWF5ZUUvRHVsNmhxTmw0d3RGaWt1WjJMSmNST21QbFlENUQxemtqUHBuaXQ2T0psYXpabktueVMwS3Z3Ry9hSjBmVnZoblphWHJkNUMxNXB0c3R0Y1cwamZkMlp3d0JJNEs5L3BYcW43UHZqaXkxdnhKY2FyWjZVc1N3eG5kT3ZLWks3Z0IyN1pCendjVjQvL0FNS1I4RWF6bVR3UjhMcm00bFlCVGZiWklZRVlnYlhMRThnRWVsZTBmRG53MW9udzQ4SFd2aHpRL0xlVUlHbm13TXZLM0JHU2VSeU1mU3ZPeFZHalR2S0wxWjAwNnNwT3pPOC80S29lSkxIeG5ZZkRINHRXNndIWGRaOEx0WjZ1WGRVODZTMGxNY1V6a0RQM0cyaytnOXErSnZpUnFYaVBTOU5zdkczaFh4NXBkeHFHbTNBdUpOTDA4RW5iZ2JzdHh1d1QrdU0xNmorMC93REcvVE5lK05sbG9HcDZxcmFmb09sUTZkYXJKSUpJZytkOHBLOUdHVDE5cTVxejhGNkQ4U3ZFbWxRNkxCR0k5U3VZNEw2OHRvMldCVVlBbktqbmo2NHg5SzdzS3FsUERybk1LdHVlNlBZdmhIKzBOTDRuOE1SNnhiVGVSUExhcXhrbEozUWtIY3lwbnVNNUF6NmNIaXZIdkhQeDA4UTYzOFZiaUNIVkpvTGVHODhwbzRHTytYSnlYWWpHVkpDNUdjWXpYb254VytER2wvRG53eENuZzYrZlQ3L1VCSzltbHVHYnlMUGxBN0Ria0Z0b3gvRlh6UDhBRlJQRS9nUFI3L1UzMVdlNHZkSTJ5dERlMjZxOG9Cd1hCN1l5QU05OG5HYWpBNGVqT3M1Ulc0NnRXU2dybnVueHU4QS9CQmZBZWxuNGZhTkZwK3VYVm95YTVIRmVlYkZjQUJTc2czRWtQdWJiakFCeGdad2E4TStCZmpDZjRmZU1yajRiNmc3QzF1NWpOWVBrOGtuTzBESEdmVDYxNE5xSDdSWGliVTljaTFuVVBPYnlJL0xoaFM2WXJHdTdJMmxzbkl5Y2MrOWFkbjhWcjN4emR4NnpHREZxMmx5Q2UyQWNuekZHTThrOWVQNTE2VlRMcXlwdFMxUnlyRlUzTzhUN2FYeE5mV0Y2K2wzOTQwRWMwU3lXaW80SmVYUFFucitGZmEzL0FBVGgvYWJ1UEFmakhRTlh1dFFKK3lhc0JjeHVNazI0VGJJQ1RuZ3IxNDVQZXZ6NzhGK0tOTitMbmc2eTFpWXEweGozRHkyMitXMlJrSEh2bXZVZmdMOFIvd0RoVE92dGQzN2lXSzVzNWJWeXh4Z09vVU1NNEhCN2VvcjUyVkp1OGJhbzd1WnhkK2g5ai84QUJVdjlsalF2MmMvMmd0Ty9hUStHdW5yTDhOZmlTREpPdHNoTVZuY1NmTTQ5Qjh4M3I5V0Zma2Qvd1ZCL1pyUHd6K0k2L0U3dzVhcTJsYXpqN1RMQ3Z5ck1lVmZJNHc0L1VHdjMyL1pQOFErQmYyNHYyWk5iL1ltK0xlb0kwbDlZdEw0V3Y1Z0M5dGNybll5bnRnamRnZGlSM3I4NGZqSDhBZGQ4VmFWNHUvWTArTjJrdGIrS1BDankyeUNVZk5KRXVTc2lFam5qRHFSMUI5NjlqS01aeVBrWno0aW1xdE0vSG5CRkZkQjhVUGgxNGgrRS9qdlV2QUhpYTNhTzYwKzRhTml5RWVZb1B5dU05aU9hNSt2clUwMWRIaVdhWVVVVVVBRkZGRkFCUlJSUUFVVVVVQUZGRkZBQlJSUlFBVVVVVUFGRkZGQUJSUlJRQVVVVVVBRkZGRkFCU29HTEFMMUo0cEs2cjRYK0RYOFM2N0Y5b1VpRUhsaU9QY24yQXFaU1VWZGxSaTVTc2p0Zmhobzl0NGY4S3ZmWGx2bWU0YlpDaEIrWW4rZGZxdjhBc1A4QXdCaS9aNi9aM2cxUFhiTVFlTGZpRkg5cnZsa1Q5NWIyR0Q1YWVvSjRKQjlmUVY4cC93REJPWDlrTlAyZy9pNlBpSDR2MDVrOEMrREpCTmNNNmZKZFNwOHlwMCticHo3VjlwL0d2OW9QVHZEOTFkZU05ZmhWRlJQSjArREdRSWdmM2FBSDZIa1YrZloxaTVZekZld3BhOXo2ckJVbGg2SFBJMXJUVTdDM2t1YlNDZUl5Z3lCckNOeHU3QWdjZFB1L2xVdmhTNmo4S2VGN3Y0c2VNYmMydWw2REhOUGNiUVJsVU9kZ0dNbkxrRE9jNU9PMWVGZUZmaWxZK0p2R2R2NHp0YndpVzV1UTB5bmNEZzU0Mmc1QUk0UHZWcjl1NzlvRy92UENWdDhEdEJDUXlTUkpmYSs4VGpHd2pjc0pJSEdQdk5ucml1SllHcXFzYVNXNG8xNHRPYlBBOWMrS1dqL0VUNGxhMThZL2lXbDg2NmhxSm5rK3hJV1pza2JFTzdvb1FBWkI5ZnBYWWVNclg0VWZGcjRZK1RvdWoybHVza1diYVRlUFBSK0NDVzVKSEo5TTE4ZC9GSDlwNjYwdTdrOEllRHJNcEJibGtudUhiYXM3OHF4VlJqNVNPaHJJK0czN1NmamRkWGowWjlaTnBCSzIwM0lYZVl3Y1p3RHhqMnh4WDJjTUJWcFVsYlpIak92R2RSM1B1WDloWDRnTDhPbG44TjY1cU10akZiM3hDdmJzeU5JMjBydHgwSk9PUU9TTWVsZmIzN1FmN2QveEIrQi83SjF4cEhoL1VIZ3UvRWR3bWthZkZHcmtmTW1aNWRxTnRBRWFsU09DTTV4MnI4anRSZzhmNlBGRDR2OEFEdmkyODFSWW1TU1FlVnRNWkFCM1lYR2VUL2pYNllmOEU3dmlaNEcvYjYrQitvZnNxK0w3TkkvR2NObExmZUV0WGVKaWJiVklFTGJDUjFpbEIybFNUa0JnZWdyd2NiZzR6eE1hMTlGdWQwS2k5bTR0SHlsNG44Wi9DTHgxNGR1OVd2ZkYrcWFkcnNFSlNDTklWa3RycFZJRzNBd1VKSWJ0NisxZG4reHBxUGhtKzB1NjFDR1JHa3VyNlJKWmg5L2FvNFRJNmM4NHJndkV2d28vNFNrYXJiM1JnMFhVUmRUSlA1Mkk0L01MYldWbEdRR0RidVNlM3RYRi9zaytLTHo0WmVOOVU4RWF0ZkQ3VERlUnlSQVhDN1dCeXBaY2NBRUVIOGE3Y3doT3BnV29tR0hhalcxUHRuNHkrUHorekg4UnRPc2ZGVU41ZXczdG5EcUVFdHBINWd1WVpEMDVZcWNNQU52Ym5weFhtWDdVZjdhdHgrMGpmZUZORjFIdzVQcC9oYnc4ODkxZEpNR0RUUE1oakxFZ2pZaWdoUXA2WlBVVjlOZUdMLzRTZnRWL0JldytFbnhCMXkwc2ZFZWhvVzhLYTVkc0F1RGpkYVR0a2tJemREMklCcnpUeFQ0WTEzNEZhSHJYZy80bGZCcjdYcG1wMlRXczh5MlJlQ1pTb0FkWmtES3k4RWc5ZWhyeU12b1lWSlNla2tkVmVkUytteDhaZkVuL0FJSjE2bDQ0c0Z2UGh0NDN0MDArV1Jka0VwYTRSc2pPVmtYbkhQR1ZGVlBoaCt3dDRkK0htcVdlbGVMdkdPa2FVOXhJQmVhdmNTYjVGakcwc3lLZUU0M2NuUEl4WDBGZWZzK1dmakdPelB3ZDhEK0lITnc4ZVZzMWtWRGs3U1M3QUtvNEFEQTQ5UUs3VFJQMkovQkhndnd5UEczN1NmaVNDM3RySDk0ZEtodXcrMHFTMjJlWW5IM1dJS0x5U09uT2E5UEZaZzZOSGxVOWZJd3BVbEtkMmp0UGhWcG43UFg3T0h3dHVkZCtIbmlDRzUwMndzdk8xVytRcklacGR2UHo0QmtMZFBscjV4dVBqNXFWNzRtMW40ejZoZHpSWDJwbG9yRzJ5d0tRc3BDeHFEbG1YQUhBN2sxVStNSHgvdFBpY1U4S2VGOU1YUi9BT2pNb3RyU0JESDlzS1pVT1NPRDh2SUI5T2Zib1AyVVBnL3FIeGE4WngvRnZ4RG9RUGh2UTV5TkpzM2hLcGRYQ0g1VzZFYlVKQlBPQ2ZvYThyQzB2cVZPV0pyYXlaMnphcldoSFk5Sy9aaStHOS80RG1qOE82L29zaWF6NGtzSDFYVVhpUHkyVUlZQ0tCandRM1BmSDZWOUllR3JDMU5vMGNJWDl5U1pSakp6NzQ3Znp4WE1lSHJEVTdiVnJ6eERkeXJMY1hPRStVRWhZMU9RZ1BkZVRYUjZBNXZQRU9aN2RrbUdVa0s4S1Y5U2V2ZnJYaFl1ckt0TnpaMTBxZklySTczNFhlRzlKdTljZlVXc1J0Z0JjaDFCQUo2SEJIVC85ZGZFMy9CVno0MStIdFQ4WGYyQjRSRnV1cFRRZjJaYjNjU3FzakFrbG1MRHNPZWZVMTlYL0FCMDhjNlo4Q1BoTmUzcTNSVFVMK0JuY1N1TjBNZTBrQUVIUEdNMStVY0YvclB4NytMRi80MzFxOW1Oc0pYajB2ZjBFUWJKYmtmeGMxMDVGZ3BZdkY4NzJST01xS2pUODJZUHhJaHQvRDN3dms4SStHMFc2MWpVRmpzdE9zbzJKbmRuQkpjS0FPb3p6M3JQMHNQNFo4SVdlaWFsYXRiUzJkcXNVMEVnd1ZjREp5QU9NazFZOFYrRGRSMFg0NGFUZWFLR2Uvd0JLMVcwbk1JUXM1aUpPZXBIRzFkMlBjNXpWL3dEYVU4V2FUcnZqMlZQRC93QTZzdVpIQzR5U1RuUEE3NHI5UHB3VUtTU1BscWs1VHJXUEsvRW1qMmQzSkpxeFFySTdFcVEzVHZXajRWU2FiVGpCTEt1QjkxbjY5c1ZOcWx2SGZXY1VLREVoQUFCd09hUzFzZnNXbW1PV1RrajVoNzFhUjBLRmpEbSsycnFwaURoaVcrK09hdGEwdDNQYlFpUlc2QUtXSEpGVTVYbnM3eGsyN2o3VnQzMnRSWHVrV3R0ZlJCV2lZcWhWY1pIcWFpV2h0SFZFZmdyU2pmYXBGYXl1UE1CM0lDUHZFZHEyTmMxaDROZmppdWJWSStkdlRweHlmNThWeTBXcTZucFBpRzF1TFJDZGtvSzdSbk5hdmp3eTZqcnNjdHEyMHlFTXhIYWtwSkxVY2syMGR2OEFDN3d2TnJsamRheXM2TUliai9WdWVTUHBYVFI2TFoyL2lSSk5oWGRBUUd6dzN2WENlQXRVdTlIakJzcFNRdlFIUEo2bitWZWlHOFhWOVB0ZkVVREJYMmxKSXNqY3A5ZnhyenFrazVucHdwdU1FemovQUJ4TGEybW9RelhENGppM3lTTURuZ2RxNWZ3NTRoMVBXZGFlNzhxU09LUnNvMmVnelhSYW5ZVCtJZkVEUTNLN2xTUEpUc3dGVGFUcGxuYlN5ZVNpcEhHQ0dVcmpIV21yV0Z5dHNzNnd2MjdUa3RwSVN4VWh3d1BCUHJXVGFXQXZOVFNLNU8zSE9EVnROUTJYc1dtVFRBSTMzWFk4REpxL05vTWtHb0M0ZVVibFhkOHA2MUVqb2hjOGsrSW1uWG1sK0Rab0xtWGNHbTNLbzU0ckIrRjluYTZ2cituYWRjM0t4ckpNRWQ5Mk51ZnIrRmIvQU1TOVMvdFR3MlFXUExBY2pnY1ZsZkJQdzZ1dGEvRFlxMjEvT0IzYjhET1IxOWF5eW0vc0cyWlpzbDdXeU9uOElhUW1uL3RHSFI3YTVNc2FCMWhkZUFSakkvejdWYitQdmhpOTAveElWK3puWk5IbUxieG5uR0FCMnpqOHFnMXJUYm53bjhXMDFLeW5oZTV0TGRaNUlWYklHVG5hVDlPOWRsYi9BQkc4Ty9HWFdvN1ZvUHNtbzZmYXpTdGJNQVRLd1VmZHgvdFpPTTE2RC9pSGxMK0dlRWEvWUpwV3N4blVGYU5XQ2lRRHNNalA0NDVydHZqR1BoOWFlSlJZL0RjYnRPajArRmZOQko4eVRhTnhQdm5QdCtGWUhqUFFMMjd2TDdWNUpjeHdYclJzR1laSFBRRHNQOGF5ZE8zUnNFbTVIUUVtbFVlaFZDTGJEUVpwcEptVXlsZG1kcEJyWW10eFBibVNTNFJTZzRaaDEvOEFyVmxhR3RvdXAzSVpzS3FuYWNWb0VyTlo3Wkd6eHh6MHJocVAzajFhWHdHZGIzRTl6cXZsWktyZ2xkbzYvd0QxcXlkWWp2N2ZVSFAyWXVwYmw4WUJGYnRsSmEyWk4xTXYrcEhCYm5OZFg0d2kvWjcxSHdCYnY0ZXU5ZHVmRWpxdjJscmhBbHRFZTRBenlPZ3pXc0YxT2F0SjdIRWFMSnBkL1lTeFhUVExjb3Z5YlFOZ1BibjYxWmo4ZmVNdEU4SXovRDI2YUI5S3Vya1RsSllBMGtiK3FQMUh2VmF5MDlyWFRwakFBY2pqSEZPMWJmZWFaRklZL202T2NZcFFxZS9vRlNrNVExT3IrRWVzK0UvQ2ZpUzA4VWVKN0l6MlVUZjZSQXVOenFlT0I2OWF2L0dtUDRjYXk4SGpENFYyTjVCcDF3Y05GZXBob3BSeVVCNzhmclhEYVE5bmNpMmkxUGVZWXBsTXBRODdNODRyMXY4QWFNK00zd1I4VCtDdkRudzIrQmZoK2UydDlMVVNhaGMzU2JXbmw0QTU3OXE2NHl1Y0ZTTFRQSC9Hci8yZGRXZXIyT2k3SXJ1M1NhQjMvd0NXblVOeDdHc0c4MEdieExwdHk5aHpONVFaVTlTRHlCWG9FUnR2R2Z3N2w4TkZOOTFvazdUV2pZQXpieUg1eG5xU0R6aXVLOHk5OE9UK1hDaERRUy9ObmtaSCtJcm9pemxxcnFjUHBWL3FQaC9VSWRWczUzaHVJSlZlSjFPQ3JBMTlxZnM2L0U3L0FJV3BwZHZyMm1YcVI2dFk3VjFPelk0V1pPN1k2WjlLK1N2aVg0VW4wWFdSZnhRTUxhL2hXNnRqampZM2I4RG1wZmd4OFROZCtGdmptMzhRNlJPMkZiRThSUHl5SjBJUDRWeDVwZ280N0QzWHhMWTB3V0tlSHFjcjJaK2xNV29KcUVpelI0S0xIOGdCNHgxL3c2MFhNc2VscEhISmhWdVp0cGZmdEs5VCtIQjRyemI0WWZFS3k4U2VUcituYW51MC9VUUhqaVp2bGpmK0pDZXg5cTlEdWRYMHpVTEtRcW9NYXFUSHZHTU4xQkE5ZWdyNGlNWFRrNHkzUGVsSlNWMGU5ZnN5ZnRCZUZmQ1U5NzhKUGpIcGttcmVDUEU2SmI2N3BaTzU0bUJ4RmR3c2Z1WE1UZk1yZ2VvNUJJcmpQMjd2MkdiZlRXR2pOSmJhM3A5NWFQcWZncnhQYkRFT3IydUNBKzcvQUpaekljSzhZNVZ2VUVHdkpmRDV2cmU0U1F5a1R5SVdkaStNa0hJYjZnQVlyNlYrQi94NDBIVy9DRWY3T0h4czFHZi9BSVJUVnJuejlKMWRGMzNQaDNVUUFrZDVBRC9DYzRsaTZPaFBjQ3V1aFhsUXFYV3h5MWFjWnE1K2NPbCtMdmpsOEV2RWlXT3ZDNDFLemczTGJ5cTVqdVlVQS9oSXh2d094N2l2U3JIOXRxSy9ndFlMM3h5STNRTG1MVVlRSGpPY2RXUWtFRHZrakpyM2o5by85bGp4TDhPdkh0ejRKOGY2VmJMOXFqZTVzTlhzejVscGYyKzBrWE51N0RFaVB5Y0E1WEdDTTE4ay90SS9BSzM4TGVGcHZHSGhEUVgxUTJzb0xUVHJ1akVZSURNQjFJNysySzl4WWJEWXhLUzBiN0hGN2VwU2RwYW5zV3ZmdHArQUw0UTZhL2pHRXh4ak9FY25JQis3dFhDanBuaXVWK0lIN1lHbFNhSmMydmd5NE1jeFFodGJ1VThvUURJR1VYSHBqcjByNHRzYi93QVJTYW1VdExWRWxjN293a0orWEo1MiszK0ZUWG1uNnRlU3RIcWQ1Tks4Z0l3N0VqZDlQd3JhamsySHBTNXBPNHBZcVRXaU5UNHZmR3E1OFgzRnJwMmp6VENHeWtlUnJ1UnlaSjVXUExaejA3anAxcjZML1luK0w5OWQ2UWxqZTNrWmtXTXhyNWpaSUJ3RGdIcWUvdHo2MThmNmpvVTlyRXR4dURxM0J4akl4eFc1OE5QaVJxL3c3MVJMbXpkOW04TSt3NEk1N1Y2V0t3OGF1SDVhWnpVNnM0MUx5UDFYOFpSNjdyUHhXaDhSUHR2TkExVzJ0STFkSkQ4c1VjYUJvUzJTVTljajA1cXYrMloremorejVySHdqMDM0cC9EUzYxRFJMcTR1NGRQMTN3dnFsOTlvallUeEVmYUlKaVF6Z3VDcFJ1QjE0cjVtK0dIN2NtaFhuaDJIVHRTMVh5SGpVWUROc09lUGJucDI5YXRmRnY0OCtQOEE0bWVHWWRUMDJXZVBRN0M4V2U0dUMrMVo1RndGUlFSbGhscy9yWHpXRW80eWhpVkZxeU95ck9uS252cWZFM2pIUUY4T2VLYjdRbGJjTGE3ZU5XOVFEeCtsVTlOMUM2MFhVNDlRc1pNdkMrUVFPRDZqOHE5WStKZndNK0lNbWx5ZkZCOUY4K0M3TFNsWTMzeUJTMkErM2pqUGY4Njgvd0RoL3BuaDNWdkd0bHBmak1UcFlYRTRqbmEwWUJrTGNLZWVBQWNaOXMxOWhHcEdVTlR5SEcwajI3OW5UNHJXZmc3VjRkUDFJNDBqV0dFbHM3ay91SnU0NllIUEZlNmF2ZGFycnJSM1VpQzFaRkxSeFI5Q2dCM0U0eU1rbnJnZDY4MHN2MlpiSFZ2aDlQcC9nNlo1QmF6TTBVeFl2c2tIVDdxL2RZZC9UT2NWMFB3WDhWUHFHaVhmdzU4WXgrVnJOckEwRWNzeTRNaUJzQmgzWngweDB4WHoxZUZOVlhVaWowWXpsS255cytyZjJYZjJtOVMrRXFMZCtHZFJ1NTljZ21TYlNFdGpueTVGUlZVdTJDU0FUeVIwSzhqSE5mZVB4eitHV3QvOEZIUDJmdE0vYTYrSDNodTEwajQ2ZUFZekhyZGhwN2hvOWZzWTg4Wjd1T3FqSlBKWHVLL0lyd2JMcVhnMitPcjZiY1BielJTbEkzUVlaVkJ5U0I5UjM1NXI3MS80SnZmdGYrTC9BSVU2NVozZGpxb3ZvL3RBKzBXbm03eXlOL3JnUVQzeXBISFVjVjVOYU1xVlgyc05qcG95VWx5eTNQaW4vZ29GK3l4YmZ0RitDWCtObmdmU0JZK0xOSDNycmVrTEh5d0dTNHg5NG5ka2pQVHAwcjg0cm1DNHM1bnNybUV4eXhzVWxqZGNFTUR5RDcxL1RoKzMxK3lKYmVPdkM4bjdlUDdLdW14M1Z0ZFczbS9FSHdoYktDUnhtUzRSRjdnY3NNZTQ3MStNbjdlbjdFMWpyZGkvN1Jmd090UE90YnhmTzFmVGJlUEpSemtzNnFPaDlSK05mVDViajRWNGNqZXB3WXJET0Q1bzdIeExSVG5Wb3lZMlhCVThnamtHbTE2eHdoUlJSUUFVVVVVQUZGRkZBQlJSUlFBVVVVVUFGRkZGQUJSUlJRQVVVVVVBRkZGRkFCUlJWclNOS3ZOWnZvOU9zYmRwSlpHd3FxTTgwYkFsY2ZvT2lYZXZhaWxoYVJzeFk4NEZmU3Y3Tlg3T25pbjRyZU9kTCtFSHcvc0RQZmFsS0Z1WmlQa3Q0djQ1R0lIQUF5ZndyblBocjhITlQwMmV4OEplSGRLZlVQRWVyU0xIQmJSUjduVWs0NkRKR005YS9TYjRIL0FuUnYyT1BoS2ZEOXJPSnZIV3VXNGw4UjZtcEc2M2l3U2JlTnVDdlRraXZtTTZ6VGtqN0tsdXoyY0JoUDhBbDVQWTlUOEsrR2RNK0JId3d0L2czOEozdEUwU3d0bFNlNG1qdytxWFlZK2JJelk0QndRUDlrVjV0NHd1UGgzOFF2QzB0OThUZkMwU1h5elBEYTJVY2pGV1pRUUhVZy9LTTkrMmFYWHZpWGJYOHduc0wrYnl6QXFHMmRpQ3pjNE9jWk9PY25GYnVqUmVEdGI4TTNQaW40ZzJzVm4vQUdYdmVhZWRpc2FScWQ1Y2JoeU1BWkg4VmZMMEtjcUh2dFhiUFNxVlkxRnlyWThwOExqNGQvQTd3ZmZmRnJ4UjRLaWpqMHNoZEkwOHpsbXZiM2tSd0tDUVNvYjV5d0p3TW4ycnlmUTcvUy9pVForS1BGM3gwa2x1TGJXYldjNmpKYmxsbWtlYjVRWVZQQlpPZG93UndPMVEvRm40dFdueHg4U1IyOWhITFkrRjlKZDAwYXlaZHZuRUE1dWM0eHVZQVlIR0JYYzZGb253YzhkZkIrWnZDOTh0eGRhZnRtdnJlYytWTEU0WElLNVUvTHVJd0J6OHJIRmZTNFNtNC92WnJVOHlyTktQSWo4MS9pOTRlYnd4NDV2ZEFnMUkzdHJadnRzYnNxRjg2RHFqWUI0TzBqSTlhcC9EdTNXNDhYMkVUdUZEVGdBc2VPditlSzlaL2FyMDN3YjRuOFhhamRlSGRlaG4xdlNTWTlSZ2pKMlg4UzdSOW9qNEdaTVozS0I5MWM5alhpdWpTVHhhdkFJM0lZU2JWd2NkYSttdjdTajZvOHhXalVSK3gvN0RYd1IvWmw4VytFTFBRZmpMb3VwYXBETkNxeU5vektEYjUyY2NZSjY1L1BqcFhvZjdKdndPMHI5bFg5cytieG40RVc3UGhUU2RTUzYwelZMeUpmTmUzVUZ6NW96aHRxS1YzWTR5U2M5Sy9QNzlrUDhBYmMxejRWeFcyazYvTk5ENUhEeUlHSmZiamtBRUVIR2VlOWUzZkhuL0FJS2Y2WnJQZ085MER3cGF2WmZhcmRvcDcyYVErZExFY0V4eEp1SlJTT0RrODErZlZjUG1FTVU0clpzOStEcE9GejVjL3dDQ2pYN1FXcStPdml6ZVIrRjc5clRUN25WTCsrZTN0MzJuTTF5N0FIQk9QbElPT21lbld2QnZCUHhROFNlRmRhaTFhejFXYnpGUHpNN2tsaDNCeWVhajhlNnpxM2pmeEpkNi9kQWg1WDRUb0ZVZEI5TVZ6Y3RyY3dPZmtLa2RhKzRvVVlmVlZUbjJQSXF6bEdyekkrMS9neiszcHAxbnBzZW5lSU5XdXRPbFh5MU1zYUdXSTlza2prSG5pdm9Ed2ovd1VuZnc1cE53bWcvSHB6YXlRTW90RHFKS3VwWFlReU9PT09BQitsZmxNdDNjUWphamxUbk9WT0RWNncxM1ZKSkZ0VW1PRzR3Qms4NEgxOUs4eXJrVkdVdWFMc2J4ekRTelIrbk43L3dWSWswelRZN0xSdkVlb2ExZUlBa05wWTd0ampJT3dzTUFBWlBiTmNaNHc4ZS9GcjlvMXY4QWhLL2pMNHpHbmFKaHB0TzhPd1NrUnlIQndIUDhURWNoam5wWGtYd0IrRloxajRjUitNZkVOOTlqa3RsRFJ1eUxoMUIzQUVNZXBJT0Rqb1Bldm9QNEQvQVhXdjJrTmN0bGF3ZlNQQytudnR1OVM4ckJ1Q3A1UkR5T1FjOGNESnJncTRmQTVlbk42czZLVXEySmVtaU5iOW5QOW0yLy9hRDF3UGUzczFsNEowdVpUcVZ6R0J1blpTVk1FWUhCTEEvTXdIR1Q2aXZydlh2RE4zWXBvL2d2NFRYdHZvYTZOdHpGSERtQnJjTHRFTER1VHdkMk04Zyt0WSt0M05uOE1vcmY0WC9DM1NJWU5KMDJ6S3NvSVpWbHhnN3R2M21PQVNUblBOSjRWOFY2eG9GNTlvbDA5NzU3MlJVbWFKaUNweUNCanVCei9Ldm1zVFZyWXFibkxZOU9FSTAxWkhUK0d0YXZmTy8wOUZXUllBa2tVaEFWWFBIQlBvTS9rYTlDOEk2YkQ0ZGprOFIrSjR2SWp0djNpQWdBazR5RkE3TDgzYys5Y3JjZUhiTFhkV2lGdGNNSnJpTmx1RlFZWWdaMnR0QS9JZXZQYXZHUDI0ZjJzejhJL0JSOEhSYThkU3Znb2pqVjVCdWVRZ2JVeG5xTzU5QlhsY2s4VFZWS25xMmRhY2FjZWFSNUovd1VTL2FtdS9pcjQ1SHdvOE8zbm10TU1Yc3NURnZMdDF5RGc5aWVnOXE4VThNNjNwUHc4MUNBUTJ6T3JQSGJ4d3JnQjJjaEZHU09oNy8vQUZxNE45WTEvUUx5OCtJSGlDRTN0MWRrM0YreGNFa1p6dFVuUEFBeFZueHQ0MlBpTFZQQ1VtbEdmVDdLOGtUVXJ5Nm1ReHRHeXRoVkhISTc1NzU5Sy9ROHB3RU1EaDFCYjlUd01aWGRhcGZvVnY4QWhQdGY4Qi90ajY1NG5sMHFIVXhaM3J4M0NTRDkzSEdJd05xbnBsUmtBOUNmeXBmSDJ1ZUYvaUo0bXVmRXZoMkEyaG1jTTlsSWNsV3dNNHdBUHdBOWEwL2lOb09oM2tPcGVKdkJOd2p2TGFuN1g1UXlTZDJjN2hqT1Fjbi9BT3RYbk9qU2VYcUt0REpqZEdOeDNkK3ZGZTl0RTgrRVU1M0V2OVF2b3I4UVNEL1VPRHdPYzU5dTFXZFJsdzd6cTVKY2J1dlNtYTVaelIzd2VJSktraEJhVlR4K2Y0MDY4OE8rSXI2U0NQVHJLV1lUS2NlVkhuS2puK1ZKTTZrWlFraW52WTNWaWY3eFA1ZjRWcFhkdjVlblIrV1E0YVFuZHR6VlBUSVZnbWUybGc1Qkl3Qjc0eDdWb2ExcFUwZW1tZU9WZ3EzaXFRdklBSTRyT1RIR1RSWDAzVExwbWwxSzJ1bFg3S25tSGY4QXhjOUttbXZwTlgxQ0cvdGt3cGlPOERCMm5IUFNxbXFYTUZqWUhUb1pDU1ZHNSttZVBXck9raUhSdkRjMnB0THU4d0VJTTV4bXNaU1NScENEbEs1M1BoUzFzcmJ3aEhmbU1HUWc1eU9UejAvU3I4R3BHT3lXL1p5dmxrZHUzSCtGWlZwZEpwL2hDemlBSVo0Z1NwSFhOYlZsYjI3K0hERExiYnhJdVdRanFjMTVyMW1lN3RTc1kxek1rbmlkTHEyMVFRdENnZFFyL2U1NlZkbTFSaXBsbGhBV1hsOW93V1BIL3dCZXVhdWJHSzkxL3dBeDdJeHlKZ1lWdUFCWFQyZHRjYWpiZkxDR01mUWdkVFdqZGpHbEZ0c3pkVnNXMVdRQzJ5Tmg2bmpHT2xKNFAxMitkNzJ6bmN1c0RZUjJ5Y2R2NlZCUEhySjFGNXJ1RnJlQ1BPMk1ERzdwK1lyVThPL1ptaXU0VnR3c2pna3VCZ0gvQUJwSk5vcGFTUEt2SFd4dkNKeUZHR0hJNm44cXkvaEROSGIrSXJOb253elhDL2Q2ajZjMWY4U1JiUEJMek9TUzgrQXBOWi93dmprUGpMVG9JSEFMM0s4WnhVNWE3VWJHV1orOVcrUjJsemFEL2habmlCMUJKTUVZQUFQcG11SjBhK2Z3OThWdE8xT1dab2tUVVVFaEhaR0pVbjhRYTcrKzFKTkwrSk91elNZTFlqNjhFNEFQNFY1L3Ercld1cmF1TlF2SVFwanUwY2hlUGxEZ211NzdkenkxWjBtaTU0bTFTM3RkYTFDM3RXSnQ1cnhpaURPTWhpUi9NODFVdHRMTHdHOFE1N2pIWWRhMWZpcG9tancrTEwzL0FJUjI1U2UyKzBoNFdRay9LNHlQeXF0NGZ2SWJXY1JYQnl2YzQ0eFVZaHRHK0VTYU1qUm9nYjJlSXhuTGs1K2xPdVpuanVEYVFqSUhCWmhnVk5IUEYvd2xGeUxBZ1JIcHhUZFJpWjV0eE9DVHdlbGN6VnpzV3hjMER3VHJmaTB6Mk9teFJ6eXdSK1o1Q3pCWGNEc29QM3o3VnoxNnArMUxaUUVqeVF3ZEN1enkyQnhnakhYaXRtQzl2dE5sV2V5bGFPU0hHeVZXT1ZJd1FSeldQNGdoVzl1cE5RanR3Z21jU09pdG5MWStZL2llYTBwdE9OakdjWHptOW9XbnEya3kzVWt3eWVkcDVBNHFoQkcwNno2ZXlnSGtxMVdQRFdwd3ZwTG81KzZ1TWs5T0t6WmJ6N00vblFTNFlucUs1SUtTcU81M3o1WFRWaUdLNWJUWkNraUVLY2dqM05XbTBlMEdqeTY5RGNJTU9Ba2VlVG1vTHhWdlVFNHh2R000cUtRQ09OZHVkbzUyNTZHdTJuTFU4K3RUdXJtMThLTlRqMGp4cmFycWs3TGJ5dTBOemc5WTM0UDE2MXJmRVB3S2RGOFZ6K0V2Sjh5NVJqNU1hREp1RmJHeGg2L0ljL2dhNCs4ZVdGdnRjZVF3d2VEanAwcjBqUmRadFBIM2d5MjFhTHpEci9oaDFXYVJUZ3oyVFpHNWozWkNTT3YzZTFkc0dqeXFzYkVYeDc4TzZQRjhBdmg3cTlqQUo3cDdlNXRidVNOY2hDc2h3akhIRFl6Z2UxZlBZdG4wL1ZCSGN4bFRuREllb3pYMmZyUGcyMDFiOWp2VXRGMGlRUFBwMXhhK0lkR1JuTHlOQ2hNTnlPT0N3NjRIOTBtdm4vNG8vRGpXdFgwalQvSEZqb3JpTzd0eDV6UnJsUzRKWGRuQTZrZmxXK3h4MmJaYi9aNitMTGVDZGVQaFR4RmNNTk12WlFIREhtM2svaGxIcDcxOVo2TDQzdDdjSnArb3VvWWhTa3luNVhVakc4WlBwWHdGcWwwN1NSQ1czTUZ6Rkg1Y3hQQWNnOEg2MTY1OEMvajYxMWJSZUFmR0Y1NWNrUi80bGw4NS93QldmN2plb0pyNTdNOHRjLzMxTmVwNjJHeEt0eVNQdG14aTAzVXRORUdsdUZrR0NKWEcwQTV4L3dBQ3lLb3lhdnFFRjlIcWM5L0FJNDV5c1lpazVEZ0gwNkhPY0grbGNIOE92R2w0R05scVVoWW9jdnpqOFJ6NlpydXJMUTlKMDRSUVdhaVFPcHVWbVk3c2svd2tnOXErZmpGZFR0Wjcvd0RCNzlyTHdyNHM4Q3A4QS8yanRBbDFqd2l6bGJDNVFnWCtqU01OaXpXa2grN2o1bWFJNVZ1OVkveDIrQTJ0L0Evd3ZEck50SmJlS1BBZXNTaGREOFhhYkNXdHJoV0xGb2JoUCtYZWZuQlJ1RDFCSXJ4dTJOblBldkpabjU5MkF1U3Z6Yzhpdld2Z3YrMEg0NytFRU12aHRiaTIxWHc1cWtSajFmdy9xVVBuMmQ3R2VDR1JzL05qb3c1QjZFVnRTclZjUE84ZGpLZEtOUmFueVo4U3YyZi9BQWw0STFsL0dPaDZTbjlsM2VkcGpHNlMxa2YrQW5zTW5JUGF2bmZ4TnB5V2ZpSzVraGlYS3lQNUtLMlRqSkhXdjFpOFFmQXI0Yi9GclJwOWMvWjN4YjNNOGU2NThDNmhQdmxpd0NTTFYyNG1RWkdJMitmdHpYeDM4Wi8yT3RQMXJYMms4Q1kwUyt0NVdoMUxUTDNjaU00WTg0YkJqY25zZU9PdGZSNFBNYVdJalp1ek9LZEtWTFZvK0k5VXNiaTBsa0JCUE9OdnJ6V0xjd09Cc1dQbmR4Z2RmYnBYckh4RThFWDNndlVXaThRNlM4SlVGY3NweEpra1pVOXh4MS93cmhMTmJDUkhrbGdMT1R0anlwK1R1Q2Y4OXE5VlBsMk9hVnBzOVUvWkkvWmh2ZmkzcUthM3FGeERiMmNUNVVUUnRJZUJ1M2JSeHQ0T1FhK3didjhBWlkwYlJ2RFRYM2luVXI2OXMwQXQ5TkUxdThFYnhZS002WVRHUnhqQnljSEhwWEVmc0tXTmxKOExKYnFmVGtYVW9ZM24wK1dXTWhKQW16Z2pBK1pzWUhPU01nY2RQcjc0Yy90cmVFZkZId2V1L2dmOFFOR3Q3dXh2TFNTMHQ3UzVoSG0yY213TWtrYkxuQlYxQlhqako1cndhMWJGU3hMYldpT3IyVktOTkpQVStHUGpoK3ozOFp2aE5hUStJZmg3cnQ1ZWVIN3Z5eWxqZEl6eHJ1RzRITFpHemcvTngzeldKNEUvWlE4RWZGWFFvUEZOOHR4WmFnemx0UlMwd0VEQU1TdTA4Y3FCOTNPT1NlMWZUWC9DNWZEbXEvRGl4OE1lTERDOGRsRVZpaFpBUzdCMjI5OXhVYmp4NzR4aXNyd2Y4UDhBNG4rTk5WbHVQaDM0RGowN1Jaa01TdkxBc2NhakcwTjdaVWsvTDcxZFRNSTBvKzg3QkRDU2s5RWRoK3puOEd2Z0ZvL3d3YlEvTmtzcmlPRWJMaExzdVdiYXFtUWpIenFNdHh3UWM0QnprZUwvQUJpK0EycTN2aWk0MUR3KzJuNmZmYVdWZXgxQ0o5alR0Z0dPT1JCa0RKem5qOGEraXZCbjdLbGxwZWxSMzNqYjlvWFJkQ2hXSWxZSTVESTRCYmNWSHpBWTR4V3hkL3N6L3M2K01yWjlLOE4vdGNhRkxlR2RRaDFLMWRJbmZKT2R5azhjOVQwL091RlpwaEhKcHM2SGc2eVdpUGpUU3ZpQmMrSy9QMHZWOURHbVhrRm9mT2dBR0paQmtOSUR4Z0hKUC82cTN2QnQ3NHM4RTY5RDR0OE1hMU9zcXlxOG0xdHVBQ0dQSjRZZW41MTc5OFcvK0NmM3hEOEw2R2ZHOXo0YWoxclNvVUppOFFlRzd0YjIyWkNXTzV6Rjh5bkhPV0F4eFhqOXY0VDFEU0duZ3RMSjlSa2pSa3R4dEdBb0I2OWMvd0M3N1Yxd2xocTlPMFhjNUtpcTBwWGFQdTM5bXIvZ29UNDY4TDJOanFYd3oxZXplWnYzV3ZlSHRRY0dHNGlPUys0WXhrZzQrbGJIN1dYN0M5eG92aGE0L2JDL1kvMHhkZjhBaDdyeUc1OGFlQllGM3phSEsrVExMQ2d5WGc1SngxVDZkUHpvK0hmaXZ4TDRZMW43YmFnTE9yakw3U29YdnRHT280SE5mZnYvQUFUMy93Q0NpdC84SnI5RzFHOUIwbWVWWWRYczdpUldYYXd3eE9mNFR5TVY1WEpVd1ZibWpzZEVLcXJSNVdmbGYrM0Ird3ZiVzJuei9IMzREd201MHVVK2JyR2lSTG1XMEo1TWlJQjl6UFgwcjQ4Y05HVEU2NElQektSME5mMCsvdHAvOEU1Tk8rTFBoTmYyci8yRTlPdDdoTlNpTjFyL0FJR3RRTnMzQmFRd29PQVA5bjhxL0dyOXJIL2duVi93bXphajhRdmdkcHIybXNXc2ovMjU0VnVJekhKSEt1ZCt4U0FjNTdWOVZnc3dwMW9KU2VwNTFmRE9EdWo0Vm9xNXJtZzZ6NGExR2JSZGQweVcxdXJlUXBORFBHVlpHQnhnZzFUcjFEa0NpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBbzYwQ3VqK0hudzM4VGZFVFZrMDdRdE5sa0JZQXVxSEdmVE5KdFJWMk5KeWRrVWZDZmhQWFBGMnJSNlZvVm04MHJ0eUZYb0sra2ZoZDhEaDRSbHN2RFBoclFIMXp4ZnFqaUt4czdXSXU2dXh4Z2djZ0RpdWwrQlh3RjFheDFlMytGZndwMEwrMnZGbW9NcXp5UlI3bzdNRTQzT3dIQkdlbGZvWCt6OThBUGhUK3d2b2Nlb2FwcTF0clB4TTFrQkwzVjdrb3kyRzhZS1JodWpqMXI1ak5zNTluKzZvNnlQYXdXQTA5cFUyT0MvWmsvWmQwNzlrZTViWHZpSmJRNjU4VTlRdFBOdTM0ZTM4UFFzRDh1ZTg0eDI2Q3FueEYrTXJXbmlhZDlUMDZXOEtHUXpYTUp5U1RrNUdmcDBIWE5iSDdVUHh2MGp3Vm84aStFM1J0WTFTVS9hSkpYVjJZc01tUWdaT1BUOGZhdm56dzROUThZNmd0N3FlcjNNa3puekhHVGhqbk9mOTNCUDA1cnljSGdwVlplMXJQVm11SnhjWSs1QTlFc2ZHZmg3WDdyL2hJZDhrTmpLU1c4NkxhVlpSems5aHllbkZWL2pCNHl1ZmpocHFmRGp3SzduUjBtRW1xYWdFWmZ0WlVFckNweHltTWRldmVzS0hVN20xczd2UzRuNE14aWpnMmpKRE55QmtkQVZCSGM4MTJPbWZEYjR2ZUl0R2d1ckRSclB3NXBrWUROZlhEQ0RjQ0FEZ2ZlSzRQVEdlRCtIb1RoaGFUVjJjdE9WU2EwUnBlQlAyZXZoVjQ1K0RMYUpvL2hpOW4xaXhrSnZwSUFrYWJGeWNuSklaZkx5QU1aeXZYQnhYbWZpMzRNeitEOU4xTzA4RjZISmFPOGM4SzNSa1lnT1YrUVI0eU9tUmpPMzVqd0s5TzhHNmY4SGZCRjJrWGlEOXA0d1RtRmtZNlhaUEl1YzR3RzM5QmprZld2U1BDbmhENFIrT0w1cmY0ZC90WGVHOVF2WjVIOGpUZkVkb2JYem5La0hheHl1U1NPVGdnanJ4Vnh4dENNdFd5blFrOWo4UnJ6KzI5RDhTdTRNc045YTNaem43NnlLZVJqNmpwWHFqL3MyWHR4YTJueEwwTzVRNlJNa056TEZ0WXRBN2ZlajRBeUF3UFRvTVYra1g3UW4vQUFUeDhFZUg3cSsxdjR6L0FMUDBNRjVyQ2cyM2lDMmtiN1BPU0QrK2ltakpSaXpBY2NaSHBqbmd2RTN3WGgwTDRYWFhoL1IvRHJ5U3BiQ09CSTRtWVJBN3R1NVFTcE8wQWJnVHdUbnZYcnh6R2xWaXZaczVuaFpRMVo0Wit6YjhGUEh2eEYwYTh1TksrRXNHcjJsdklCY1hrZ0FlUGRoV0NsaU54SFkrbyt0ZEY4ZXYyQlBFM3c3MGhyN3haNEx2ZER1cDdZWHEydDliTmJ6R0E0K2RNamJLbzVHVjdpdW0rRVh4YitKbndvMVMwK0hVdWhOcDBFY3BqTVUwWldSZzVESHBoVDNIUEJBeFh1LzdSdjdTM3hCL2FDOEIrQlBoUjRqdXNuUzlTbEZqYytVdjJtS043Ylo1UVk4Q004ZklwQTl1TTE1czVZcjZ5ckxRM1RpbzJ1Zm1FL2dpNXNicVdLUUNTSWNDVFp5VGdIQjc1ckUxend6QjgreU1ER1MyT3g3VjZyZFcwc0dwVFd1cDJpaVMzbGVIeTJZZmVCNkg4anpVR2lmQ1h4OTQzMUs3aThPZUcza3M1OGg3MlZOa01ReU9keDlqbjNyMVBhY3NkV1p5aXJIZ3Q3b0Y1ZTZ3bW5hYmJQTFBLK3hJbzF5V2JQUUN2V2ZnYit6Ui9hZXNKZWVQN2hyWXhndXRnZ0cvSUFJM2s4S0QwT2E5eStDMzdLRExyVVdtZUVkSy90M1hib2Y4ZjhLL3U3ZFd4a0x3ZHUwL3hISEFyNjgrRUg3S2Z3OStDa1MrSnZpQWtHdStJQVZZVzJTYldKejY5ZDV3T1MzcG12TngyZFFvUTVJYXMxdytYKzFselMwUnlQN012N0hHc2VQYk8wMXo0Z2lUUy9DRmszK2lXemdSeTNnVTVDcW94OHVDY3NlbzZWOVZDSHdwcEhoa2VGZkN0amIyOWhHaTI4U1dxZ0tGejJ3Zm9DYTQrYnhKcVBpUFI1SjlTdkdOdVQ1S1F4bmFGQVhHQUJuMjQ3MU5vTmhGY0d5c0Q0bEVJTjRwa3Q1aUMwL3k4Z0g4T25GZkc0aXJXcjFPYW96Mlk4bE5jc0NMeExEWng2aVRZV2trR0MzNzFSbFhJUFRKUG9EeWE2WHdINFRpbFNMVnQrMkVRN28yWEp4MWJjZllZUFdxT2gyYzJwK0pwTk0vNFJpUzN0b1VNbHhkWEM0Q3NYMjdRcEpIYzQ2bnFhcWZHRDRzZUYvaC9va2trVi9IYVcxaXJOS1E0Vlc3RUE5Y0FEOWZldWV0VmxPS2hEY3FqQzhyc1g0ay90STZYOEovRGVwK0l0ZDBDMDA4MmlPbGhkeTNBWm1VSC9XYmUzY2puSnppdnpGK0tQeHMxejR2L0ZGL0dlb3lTdmJSems2ZkRNV080RnVaQ083bnIvOEFxcjBUNGkvRm1mOEFhazhYWEQrSlBFSDltK0Z0UGRqYldnbDJOZkZRZm15Ump0MzlhWHdEclg3TjNnbnhmYmFwSDRkdmJxM2p0bk53WnJkWDJ0dCtXVUFqbm5nSGdaQjRyNmJKY3VXRWg3U2E5NW5KbUdKVDkxUFE4bzFyNHBXbmlyVVI0YnR0TW1qTm1obG5rZU1ENWdEbFNQUTU3bnVhNDN4cjhRZkZQaVc2V2ZVcnBpSVVXR0tKZmw4dEIwVmNkQjE0OTY5UitOWGkvd0NHM2ppKzFEeGpvMmlXOGMwN2lHMWEyWlFFalRBeXlvb3l4K25mbXZLWGhzcnRKYnE2VGI1WDNBUnh1L0d2cUthVzlqeDNQbU5Md1o0dDFuUmJCNzRUT1lHalpYVnVReThkalVsbnJsaHFOc2tsc3dTUXo3V1VuMnhVbmdheWZ4QjRaMWZ3KzhNY1ppMDlwN1ozSUJ5Q01qbnFTS3hZZkQzMlczUUdVQTUzQUQrWHRXMHBhRGhEVTdPemhaclh5bE81UVJ6Mi93QTlLbytHZmlkNG4rRDN4RHNQRXR2Y2ZiTE9HVFpQWVRBTXJSc1BtQTNjQTQ2R290SzFPUzBqaHNIbDRMQU56WFErTVBCdWs2enBLWEZqaktweGp2VXhrckczS2RQOFZmSFh3NThlM0Z0NGc4RWVIWWJBc044NktCd1QwWGoyNzF3cmErOXZHME9xcVRCZFlWWHg5MXhqa2RqM3JPU3doMHV6amhTWmk0YjVpT3cveml0VzYwMjQxcjRleFRXN2cvMmRxckZ3QU9WWWV2WEZaU1pyQkptSDRwUjVwa2xoWDcrUGw3ajVmMHJhZzBXNHZmQzl2Ym1GbUFkUzNwV0pyZ3ZYZEVkQ1ZIYkhQU3U5K0gxMjdhU3NWM0VGS2dZT1BwNjF5VkpPeDJVWSs4V05ma2hoZ3RiZnk5cXhvb0hmSEhwV211dFBGYlJHT0w5MlJnbmpJNHJJOFdTbnl4SXd3QjBBN1ZvNkxKYVhta216djV0anZEaU1kTWY0MWdsMVBRNkRiS09POXZaTG1HSUZlaE9Ca210SHdCcUsvd0NrUjNTNGVOempjT09lTS81OTY1dXltdXRNdUJheVhxQUI4SEo2OGo5SzdTMThQekpaejZzZktNVThJSzdHSFBIZkgxRlRVZGtUU1h2YUZuV3ZqWjhPdFo4Tk40VDE3d0xjTGV3WldLOXNTdTFqbmdrZXA3MXpla3BieFcwOTRwWmQ0L2RJd3hubi93Q3ZYTlprdGRjOHk1VTRhVWphUjcxMGozSSt4S1lDR1hqT08zRlZ6V2lyQ2lydDNQSnZpVmNSMnZneTB0Z1BtZVVrbkhYcldkNE1zSkxUWDlQanV0T2NPZGttUkpoaUNlb3gvbm10UDQyUVIyWGg3UzdlTG5jcFp2eHJDOEFTUEg0bTBwbmxadDB3QnprOXFuSzFmQ3ArWmptVWtzVkplUjJtcjZSZER4aGYzNURKRTFzck1aTWpKSUF4empJelhCYXZERkJleUpHUUVaano2NXIwbjRvMkhpUFY5RDB2eEZGS2lRcmFZaWkrN3Uyc2VlUDFCNlY1cnJVOGQ0VWxGbzZTcXY3N2MyUVR4eUs5S2NVdFR5cWJUallyd1d0M3A4eVhCdldLdGo1Yy9UODY2SFQyWVpWVUgzY2dnY0N1Zm51L1B0MExLUXluMHJkMGNzOXZ2TGNiT0I2VnpWRzJkT0dhVXJHUU44R3NOTEV4NWJtcEpycDU5UmFLU2JZUW1jZE0xRkRjeEhYUXMyQmxqaXFtc2VkSnE1bkF4endBY2Q2bEs2T2h5Tkc5dTFoc2tWczdzODhjMHN3Z0VTdEx5R1VZWEZWWkZFbGswWk9jREFBNjArM3VHZlNZbEs1Wkh3ZU1ta2xZVXBXZXBIWTZaZER6V2huMndzZnhOU1hXaWxVSlJzOGRjVm82VnFGdEhHOE1zRGVkcytWV1hnVmRpYU83MDN5Y0FGVys4SzRxdFp3blk3NlZHTTRYT2Foay9zK1FSekx1QlBjKzlXZFowdHhZcmZ3TjhwUElIV3FPdjIwdHBmYmtKSXpuZFYyRy9ONXBmMkR6Y2tqSXJxZzI3TTVhdGxlSkJMZVdrK2x0WmJUdks0VnZlcnZ3MTFtYnczNGxPcVdqQXI1UlNXRWpJWU1vRFpGWXJKNU1oamRlVjRJRmFlaTZkTm4rMm9wWWdJamtvNzhuOE85ZDBaZFR6S2xOU1pxZUV2SDNpRHdaNC90ZkV2MjZSNGJlNGJmWnlPV2plQjJ4SkVWUEJVcVdHTythNjM0cTZkNHIwUDRoVDZUb09venk2RHFNSzNtaHdod1l6WnluY2dDK3FrbERqb2E4OThXU05OZkM0aUFRTXFrQlJqSkhmaXZZZmh2cU1YeEEvWitWYm9zK3BlQjlZaCt6bk9XT24zVGJTRC9lMlRoU01uamRXOFpjMGJISlVwY3JQQlBpQm9OeEhPNzNWbzBVaWtCa0s0S25IVHBYSkdLVjVNRUZKWS91T09NNDZWNmI0eTF6VXRaOFJYZDVxZUpIa2xaWFZsNmRQOFA2VnkrcWFYcDQwbzMrQ2wxNXVGVUwxSHJWUmxaV00xRjduYWZCSDlvTzYwdThnOE9lTHJ4bGlWdHNOMlQ4MFp4ajV2VVY5VWZEM3g4VXVyR1RXR0Z4cDBoQjNLdzJzcmVoemdmU3Z6OXY0WG5CdW9GMnlyL3JFSEdSNmoxcnZ2ZzUrMGZyL3dBUEl2N0MxUWZiTk1iZ3dTbi9BRlpQRzVTZW4wcnlzZGxNYXI5cFMzT3VsaTdlN0krLzd1WFFXdTJrMGJpM2xmTUozNXp4eHp6Z2Z5cGJhMjFEKzNwUmJYMFVvaGkrZGQrV0h0ait0ZURmRGY0cTZicTJuTmU2ZnJSa2VkY1FSQS82dnBnNTZlMWVoZUZmSDJsdzNMSnE5cTZYc0EybVdJNEVvYkdkM1BCNU9LOEdXSG5DNk9wVk9mWTlSMGZ4TnFObmVSdm9tb1NtNFZ4NWJSTVJoODV6a1l3ZUJ6N1Y2MXFYeGo4SmVON08yOE8vSDN3NE5UdWxoOHUzOFU2YXdpMVNNWXdBNy9kdUZBTGZLK1QvQUxWZUw2SmZhZGE3ZDhwVlF1NVhSZDJXNmpPUGIzcXg0aXUxMUdFM3RreGhXS01FUm5DN2xKeVRrODFsUWcvYWhWbHl3TlQ0dy9BVDRSK0w5SW0wOUxuVC9GR2tlUko5aU5ySjVGNWFsaWNiNEhJSVlaQXloWVpKQTl2bW5ULzJFL0FrRStvM2hYVW10N1l1KzY0Y0p0VVoycmc0endDRDZDdldiN1JyanhNc0kwdStYelEyRVh6Q0dPRDFKNjV5ZTNXbklzdmhzRFNmRkd1UGQrWTZ1WVkzTEtxNHhuUFhHUGV2cGFNcXNZMnZjOGVWUk42R2I0SCtIY0ZyNFppdEl0Umxnc1k3ZlpCRGE0VVJoVHV5V0dBUm5KRmN6NG04VWp3ajRvbDhPZUZMWVRhbk52aWhkRG55bGNBRW5zY2pQVSszU3V3OGZmRUxRZkEzaGliVU5EdXpKSk1ubHBhdTRERnl2eThIcU9mNUdvLzJKL2dWcmZ4UitKMm55dkF0N3FtczZqSEhieFNjanpKSEFVY2pnQThudHhYUGpzWkRDMFhKbmJnc1BMRVZGZlk5Ry9aKy9aZDhIZUFmQ00vN1F2N1JPcGlQU05QS2xMYVE4VHk0eWtDTGpEeUhxUU9BSzRYNDgvdFZmRUg0dVhFbWhmRHFUL2hIOUFqUmx0NDdZYlNFd1FNa2NjcUQwNkUxMTMvQlFEeGJmL0VMeHpCOE0vQ04rMFBoTHdwSTFobzhKWXI5cWxCWVQzN0RITE80YmFleTRGZU4rSnZEV3ArRUxpTHd6Z3A1OWxIT2ttekRGTnBCR0Y5Y2tZNjg5SzhMRDRPV0svMm11NzMyUjZkZXVxUDd1bWVicG92aVRWUmQybXMrTmJ5Wi9PMlJyTGRsZ1NNNHprOGRzZjFyS3VGMUx3ODRrL3QrNlM1SkNGSVp6bFQwSkk0eHdSajhhNm5WZkNPc1c4UnVGMFdhSW5INzRodXA1eUJqUFBZMC93QVQvRFNhejE0YXBEYTc0cnkyamt3SXo4cjdSdVU4K28vT3ZidzlDbDFTc2VaT3ROYTNPOC9abS9iYytQWDdPWGlTMlRUL0FCamVKQ1BMZVNQenZsZVB1Q01rUGtIQlVqbXZ2anduNE0rRHY3ZXZnSzcrTHZ3ZDhQNmZwZnhIMGUzZTg4UStGckdIWmErSmJWRkpta2dqQS9kM2FLUzIxZUpBRHdEelg1YzNlbTZwQmN3MlVGdjVrY0trNGtHV1lIME9jaml2b2Y4QVlDK052akQ0Q2ZHUFMvR25oaSttczMwdStTWVJra3JOdHhsVHgxWmNnK29OY3VPd2tjUCsrb3V6UnBRciszL2R6Sy83UWZ3dTFmd2g0dk4wdXBhZkpwV3FSdmQ2TkpwYktWWkRqOTB3QURLd3p5RDBOY05CTmZJdm0ydXJTUmxHRE50WTdYSEo2am5qdG12b3ovZ3NYOFB0TCtFM3gvcy9pUjhLcmNSK0dmRnVtMi9pblJMYUhKU0NLN0JNMFFCK1ViWmQ0QUE2R3ZuRFE5VThQK0tyUk5kdHBOOE0zM2t4dTJFTDkwZ2Q4bkZiMDV4eE9IVWwxTVpSZEtwWS9Tbi9BSUplL3dEQlJXVDRmNjNwbmhyVXZFTWNsaTBFZHJQRk96U3NmbUhVZG14ZzRIMTY4VjlFL3dEQlZMOW1iNE0vRXJ3cGJmdExmRE10b3ZpbTUwaTV2WXRWc0xURnRxSWdpTXJSVHNBRkVwQUpEZDloRmZqTjhJZkZWcDRTOGNmMmhZV1VvMnpob2dYUElCQitYSFE0QjVyOWV2Qi83Uko4YWY4QUJKWHhmSnJ5dTB2aDVwWUlQT3lDRWNiUUFTY2s0a2JtdkNyenE0S3BhTDBaM1U0UnJSdWZpbCszTjRNOEJmRkw0RzNmeGd1ZkRFTnI0bjBlN1dGOVVzNDlrZDVHUXArY0VEYzJHem5Iclh3Z2NnSElIV3Z2WDlzWFh6cGY3S2MybVJKREFsN2Y3OXFLQVcvMVM0K21WYjZjaXZncGlDQ0I2MTl6bGxTVlRDcHlaNCtMaEdGV3lHMFVVVjNuS0ZGRkZBQlJSUlFBVVVVVUFGRkZGQUJSUlJRQVVVVVVBU1dzUm51WTRSL0c0SFB1YSt4UGhoWjZINGIwcnc1OE9QRFRpd3VkWnRvNXRRdXdnOHhFTDdUdFlkQ1IzcjQ5MDV0bC9DeE9NU3J6K05mV2ZoczZmWmFyNEo4Ulc2a3lKWnlXODBoUE9Wa0RMazU5RCtsZVBuRlNwRER2bGRuWm5wWmJHTXF1cCtoTmpwSHcrL1k4K0MybDJId0oweUM0OFMrSnd4dmJ5VmxlNmhqQXdXempPOXNaem5GZVhlS2ZpZHBlb3dXMmovRnJUTCtTZDNXZHZzY3hFcTVCK2JuNzNiMjVxWHhTYnJ4RGVXSDJhK2tqZExGVmhWWEpLOXh6bjI1OWpYUFdQd3A4Y1QrTkpicnhaTTA2elJnMjg3RWtnY0VxQU9CZ2RRYStQd0VZcUNsTDRudWVyajV2bWFXeU9OMWFBK01mRWFlVmJ6ckZHY1dtZnZESjNmTWVwSE9mL3dCVmRKNHkxZTI4TjIyaitGOU0waFpOZnZwVEZhUlc0Tzl3Y3Fmb01jKzlhT3M2eDROK0hldFM2VmNXWm0xTlZZdkhFb0VjZWNmZWJIQ2tjMVUvWWJLZkdIOW9QWFBqRDR1YU9TSFNpYlhUSTNIN3FORk9XSTQrWG9PUi9lRmU1aUg3SEQ4eVBLdzFOMXF1cDZSNFFnOEYvQjd3NDNpVFVOS2cxanhVWXR0dXMyR2hzbTI5V1VucXJMOU92clh6NzhUZjJtZmliNG1YWGZEK3VlSUpkVXNkVFlGWDFLRU0xcmhpTXdiVCs3R1NWMjQ3ZmpYMGI4ZWZoL1o2SjQydnRJdXJZdjhBMmhkL2FkTWdoWXpmYW81UVFyRmlQa0dlL2JQUWRhOGw4US9CdFRxNHZibnczSGRUaGpHMFV3eERFeGRzTVdBeXlnQTVPZW9IMXJEQndnMXpUMWJOY1JOeGZMRStmTFR3anFPcDJ1cGFqNThoK3lXN1RmUGtCbXprWnlRT2d5TWQrMVlWN1plSTdlR1BWdEp1SjF1WmVTNlNZS01PZWdQQkk1RmV1ZUl2QmQ5NFVTVzIxTFRaSTBTNzMyc2xuT3BqS2s1T01mZUIvaHljOEhwMXJIMWJTN0s0OEhUV2s3TEdVa0VpQVlMTG5nQTU1MjR3T00vWEZlcTQwK1hWYUhOQ2N1YmM5WS9ZUS80TExmR1A5bXZWNHZoTjhiN2VIeHY4UEx1WVFhbG9PdW9Ka1NQTzBsTjJkakFFOU9sZmRuN1Uzd0k4RTJmd2wwVDl1SDlpeTdYVS9oaHIwc2Y5czZPLzcwNkZjbHNoU0NPSXNuQVk4cVNPeHI4YVBpWm9tcTZSSXVvYWhwYVM2ZE1jSkxBZ0RLY0RCT0RqZHRHZm9RYS9SZjhBNE4wZjJ3NDErS3VxL3NDZkdPYzZsNEsrSmRuTHAzMks2eTRobmRNUnR5TUtUMC9JMTUxWERLbEpWS2VpTzZFL2FLek1qNG8vQXVMNHRRMi94UDBieEFsdmJ3VzNsM1p2Q1dNQXdBRkd3WTdra0hQSFBhdVhtdC9CMXRIWTZicGQ1TUpMRytobGh2TGhDZzNGU3BES0RrNXgxSHJYc1dzM3ZqWDlsVDQ3ZUx2Z1pkcXpSNmRxbHpwVndza1BteHp3N3dxbGd3eDh5bGNNQnhudlhuUGovd0FKNjE0VzFXVzB1TkZoamhrUXlMS3NaSG1xZVVZWkJPMEZnTThZeDdWNmVGcWUzZ216enNURjBwbkI2dDRmOEkyZmpCNU5SK0E0dU5Tbm5adnRCKzdNMjRFUHp4MHdjbk5kMXBud1FieDFiUVcveEY4ZWFINGUwOUo0eXVsYVRPczg0d09tMVRzUTV3RG4xTlVKdGZhKzhFVGFScjhRUkdoYUtPWnNwZ0VBYnNIa25wejB4WG12dyt1cGRNMWoreDRiZ3ZkTTRLQ0JqdlBPQmdnZW1NMU9Mb1NuRDNYWXFoaUVwTG1SOW5lR0xENGJmQlR3bkg0UjhCYU9oUzlKZjdaTE9EY3l5Z1lmekdVNUpPY3FPYzhWbDZ2YVRlSklBOHR0QTdEQWluZWM4dnoxQjk4OFk2aXVDK0duZ0Q0cTZqcm1uYTNkYS9HOXBicXhGcmQzVEFsV0dOdklBeVNRYzlmeUZkN09IMDI4YlQ3bUhMb3hlU1NLWlcyOFpHV0djRG42MThsV28reW0zZTdQWVZkempaYUl1MlBobXkwdlJFT3FYSWprTDVNN29SRWhZamhTQndCbWtnOEtRRFY3UFVyNjdWSWt1MG1TNEVuQzRCSUFQQUFJOU1rVlBjYS9MSjRhdUxQVlk5OFJnZFdpUE9keDRibjZkcStldmpuKzFGNE4rREdscm9sbVh2OEFWQVdGcHA2VDdpcjdzNVBIeWdaT081QnJ6MVRyNGlweXhSMXhoQ0VlWnM5aytQOEErMGY0WStHbmh5NTFYVU5YU0Myd3plYUpEdVpqMUM1NXljRUR2MXI0UytJdnhnOGMvdEhlSVBNMWRwYkx3MnM1TnZhQWtOY0FjN245c2M0cmx2RTN4RjhVL0dyeGlOVDhmYWdiZ3hJWllkT1VrUlJxQjBBN25qOGFuOElmRVR3MUZydW0ydXUzWjA3VFRlckhmM0JUNTQ0OXVHYnB4MzRyNnJLOGxoaDBwMUZkbm00ck1WOE5NbTBkaHBlaFRXT29XVWIycVgwa2xsS1RuQ0hnQWdFN2djZ0Q2bjBybnZFSGpLVXBkZUV0Q2pWWnI1REUwbUJpSkQxR2NET09mWWVsTXU5ZjhOM2ZpSzgwclE5Yzgrelc1ZU95dVdHTjhXNDRiNjR4MTk2d2ZGVStuK0Y3aVNiVG1NazJDWG5QWEhIQTkvYjNyNlZRam9lVkp6bTdzcldQaG0zMFhTNU5NdWIvQU14bEpET0NTT25iL0dzMTdJejI0MDRUL09aaHNYUGIxOWFyeDN0cjRtc1piMyswakJOR2NHQndTWlR4ejE0cVhTOUxtc25TL2tsWXR1eW1UeVIxcTdKSTBoRmsrdDJGOVlSbFlwV1JZVndRR3dTT1AwcUR3MWMzK3EzQWdqL2VrbkJKUDA2VjFmaEdBK0tOZi80Uis3aFZtdU5QdWdNbm9WZ1oxUDVyNjF4M2dtM3pyRUx0T1V3Z0xGVDByT2RtanBoRnBtOXExdkpiM0tXd1FxeWRmVVU2NHVmRUZwSkhIRnFiN0dZQmt6eC9uaXJNMm9hUkhyd2puMWlGSmMvTDV5NUI1OWF0M3Q5YjJPb3JOcWNNZkFCUm9td0I3NC9Pc3ZoUnR5M1k2eGUwdjdTZEhpMnZnN2dlTVlGVy9BV3IybHRZYXBZYWxESThVNUNveURqek04ZlQ2MW5haHEya3EzMm5TcjVYZTV3a2lkZG9JNjFjdjdOclRTa3N0THVnK1hWL2tQVWtjOC8wOTZpVXJJdUVIYzBwZEgwVlBGOGVuZUlKVGFMbGNFb0QxNzhmalhhK09mQ1hoL1E5RXQ3dndwcmtOeDVpZ0VKOTcxNzE1a1pOVDFieEJCOXNWaUVDN2lUWFphNWRxYmEzdEptQ2hnZWZwWG5WSzN2V1I2dENnK1c3SzdxTHhyWkwxUzBTc1BOWmY4YW11VTAxTmRFZGxPQ0NvMkFFOWFvNlRlUzI4anhHWE1hOEVIclZxVHk0Slk3eVczWGNyREFIYW5DZDBPV2huYTFvOGcxZG54eG5JeDJycmZER3BQWWFSSXM3NGJBOHNIOEtyMitoNzRmN1NhYnpGa2JuUE9BZWF0VGFjc2RtSlYrWEJHUjZlOUZSM1JWSTVhN1dUVXZFMXBCTkZzRE9Td0F4emovUDVWb1R5cG9aZmZJUExKKzZUeG5QSDhxbGt0YmVUVjdjV09HbVIrQXZKRllmaWUxMUhXTlJZWElhUHluUHlqajYwS3pSbTUyYnNlZWZHSytta2gwMks0emxZZWhOVmZCTnhKZGE3cHEyaVJveVRncjVoNDZVdnhtdW51OVhoUmx3STR3RTU5cXp2QlZ3OEhpQzFVTWZsM0VIMHdwcDVldVhDeE9iTUhmRlNQZnZqRFoycWZzMWZEMi9rczVvTHFkTDJEVU5pZ3BKc20rVnVPK0QxNyt0ZlBtb1hFY1V4aTh3RURoY0E4MTdEOFNOWThVYVJZZUdiQmxEd1JXd1pMZDIzS0N3eWNqUGZyWGtQam93eTYvTlBGYmlNdTJkZzZBL3lGZW5QVkhtVTA0cGtrRUVDNkRMZHVnSk12SEZXN1J5OXVHaUpHQnlCeFVHWVl2Q1E1SkpmUEFQV3JPaFBCTnBaa0pDK3hGY2xSYUcrSCtJeUxtTmpxOGNxZzh0eVJWeS90SW1sWUdSRllJV0xPMk1EOGFMS0ZienhEQkFEdzhuUTlNVjBGcmVmRHV4dmRhaThZYVZlWGhrMHVTSFNKTEtZS3NGMldHMlJzL2VVYzhlOUtON0cwcFdPYXRENWNvaS9pWlEzSjdWSGZYTTFqT3J3UkJrUEpCSEdhcFhHcGYyY2lHQlNDbkJEZEdHQVNRSzB0UXRqTFl4WEpJSVpRUVBXbGV6TGpMblJkME84VzRtTXQ0M3pPdU1rZHFiYVhjZHZOTkUwbVFHK1hJcURUcnlHQ1BjeTVLOVRpdEd4UzNlQXpKc0JkdVJ0eWE0TVFsenRzOWJEZncwaXZxbGltcGFhenFRU0IwSFVWeXRqY1RSem1HTjhHUEp4bXV5bmtqc24reGlMYXJEazRybHJteWZUZGIrMVFLZG9mY0NPOWFZV3BGKzZ6REdVMm5kRWl5QzZScEpKRXo2RThtaXlrRWx3VEl4d295T2EydE04UWYyYjRlMUxTUXpoTCtHS0tlUENFRkZrU1RHY1p6dUJJSXh3U0RYT0tkekh5MnhrWlBQUFFWM3haNXM0dTVvWE14dm9Rak5sMC9pOXE3UDRLdnI5cEpjeDJEQmJIVVF0aGNUbHdFV1dRaDRjalBIN3hGQUo5VFhCMjI4eWxteVI1UjR6V2g0SDFTKzgyNTBxMWxrU1c1Z3pBeXRnTExHZk1qWTg0NmpINDF0RjJPV3NuWTIvRkQ2ZE44UkwrMmJRZkpFays0VzZudWNaR08zT2FiclBobXgxV0tSa3RoR1Z5UEx3ZURXWjhSWjVYOFNuVm9MMW1GM0ZIZHE0eGxkNmdrSEhmT2ZwaWwwUHh6UGJYMFYxY2g3bFZqMlRMY0VIZjdqcHpXeWR6a3MyamtQRVhoVzcwMTJualJsd2VTQldUcWZoaVlXd3VVNGNwa2pQV3ZXZkZGblphaGJKZTJHcVc4NlNya3hMSHRZZE9DRDlhNXVUUXIyU1dOREFIVjFLcU1jRDhxMFVwSWh3MU9KOEplT2ZFSGdyVUZ1TEc2Y0JXK2FNdHdSWHY4QThQOEE5cUQrM05HT2h5MnR1SlpOb2JmRU40eDZOL25yWGlHdCtEcmlDZVNJd01yZzhnaXNHVzN2dEpsRXNUT2pLYzVVbXNhMkhwWW5kV1lRcVNwTS9RM3dsOFM3Q2ZSYmFTOXVJaHRWZmxadDIwL1gxcnB2RUd1M3R4b24yOXdKTGRsR1JBd0kvSEE2OGoycjg4dkIvd0FkZkd2aFdkRWZVR3VJVVlaaWw1R0FlZ3I2SitHUDdRZW5lTXRPamswdWY3TFBBQjlvZ3lTRDB3ZHRlVFZ5K2VIZk4wT3RWNmRhTmoxUmRZMUtOSTJIbUlZNU1HVEozcWNrZzVIYm42MW9wZmE0OTY2YTdwa2ZucENHUjdoZXE0Nzd1M1U1K2xkMThPZkQybFhHbHg2L3EzaEtLZTdlQkhoQkh5N2hnZ2tkODVKK2xjZDhaci94UmRhZGRlSVlFQ3kyOFJKUVpVYkFPVkhxQU00cmFuTk5IblNoYXBZOGorSitzYW5lZUxURmIyeWZaN0dNeVBFamZLckhwMzlBQ0srMnYrQ00wVjFkZUtOYStJRnhGKy84UCtEZGMxTzFBeDhzMEduek1qZGVvYkIvQ3ZnVHdiNHpHcGFEUHJHcWdOY2FoZE1Tb1UvZEJJQStsZnBaL3dBRUtqNGR2L2lrdmdUVnJsSVlQRStqNmhwRHN3eC94OVdza1kvOUMvR3ZtczZxM1NYbWZUWmZTNUtUZmtmSS9qalZmSFBpcnhuYkNYYzBEMnR2RmJNcUEvOEFMTlJoc1pPRHVKUFhxVFdyOGFyeXgrRS9oSFR2RmZ4SjFVLzJyYTJhRzEwK1lBQm95UVFUdVg1UmtrZ2taMnFmcFhzSHhXOEE2Uit6WjR4T2hmRVBUeU5SMG03ZlNyeTEzWUx5UXk3Zm41NGpLS0R1N2JzOGppdmhmL2dvSjQ5MXp4QlBEcU9vVHVzT3EzMDBzVVRIQmpoR1FrWlhKd0FwQjI5TXRrZGE5L0N3aGlxTUlyYlE4cXRlTldVbWVZZkZMOXNUNGovRUZ4QmIzN1dFVWJEWUxSaWd3dlJjRW41ZStQVTFqK0JQMmxQaXhvZXQyNXVmRkZ4ZTIvbUJaTGE4YmVyS1dISFBJcmdMbVRScEwxV3RyZWRJZU40WndXUHFSeFVzOWkyajZyR2t1VEhJcVN3T2VOeUhrR3ZlV0dwVTZYTEZIbmUxbEthdXo5R2RKK0dGN3JmaC9TL0d0dDRkTXRsZHhMTHRnSHpBbGR3Qno3Yys0NE5hbGlMbXlnc3JheThNUmFWSkVnODRRWjNUTUFXRE5ubFR6Z2Uvc0t3djJiZjJxL0NIaVg0ZWVHL0RwdW94Tm8wV3k4c3dWVjVHSUNxUnlEZ1o3WjY0eFhvM2lieC80QXViSjlRMTY1aHQ0WWdvTXJINXNEcjk3azljQURwWHgySXhjb1RsVGxGM1BYcDBGZFRUT2ovNEtCK003ZlhQZ3A4RWRMMTI1emNXL2dtNmhsU1hETjVKdkhNWTZlbWNmVVY4WS9CSzcxN1JQaWRxWGhHZUtaYmVSM1dKSmV6bkRMdEI0QjZWci90U2Z0VmFsNG0xUnZGRnpKSEpiYVhZSlllSHJDVnp0U0pCKzdHT004a3NTTytPOWNuK3lGZitOZmlaOFJkRzFEV1pQdEQzR3NQY1RUeWRWaVFFeU9UK0lVRWNWMzRERHl3bUE1cWhuaUdxMWUwVDZCOExXODAzaWhZTHVFWVF5cmhVeGpHVDE0eHoxL3lLKzlmRWZqU3g4QmY4RW5QRS9oNyt6SkxPNDF2V2JSVmwzS1lyamZMRzI1RDlGNkgxNEhGZktYaHZ3dm8wRjNyMHE2TExOZFhJOHF4bGpPMHdrdnkzSFhnZzhmalhlZnRXK0xZTkwvWVk4SCtHYlMvVjU5WDhSc1hoS3NIWm9vdWNnNUhERmVsZlBaaFc5dldoeTl6ME1KU2NJTzU4VWY4QUJSU1Z0QitCZmhQUkxwZ0pyNWJlNEE2N2d5UEpuL3g0VjhWVjlZZjhGUE5XdDROUjhNK0Q0SERHd3RRck1EbjdrVWFZem5wa0g5YStUNis5eTZISmhJbytmeGJ2WFlVVVVWM0hNRkZGRkFCUlJSUUFVVVVVQUZGRkZBQlJSUlFBVVVVVUFPaWNwSXJnOGhnYStrZkNPcXRlZkRldzFWcnNtYlR0UWhsMk4wMnZoU1B6RmZOZzRPYTlpK0htc2VkNEF2b1FUdmp0bFpjS1RqYVFhODdNcWZ0S1NPN0F6NUtoK2dYaE8rMVM4MWV4dTU3ZFNKYlNJUTdtSEpPTS9YZzlLOWZDWDluQ2wxcjBWdkJiVzJuM0Y1TmNiUVJIR2d5U0JnZ2dOZ2NmalhpdndkMWVIeEY0QzhMYXRiM1NMTE5GRW01c0FaS0FaSlBVaXZxWFQvaHhkL0VueFBmZUJiaVJaSXRXOEI2cFk2YXNRVk0zS1FlYmpBWURMTWhHVG5JUFRtdmhJVFZPcHkrWjdWV1BNMjJmQ1B4WE41WTNkenFVR3FMUC9hRWNyeDNFSXh0K2NqdmpCQXh4ejByby93RGdsQnJNZHhwT3FlR0p0U2xNdC9xeGhFTUxLSlpkeTRPMW1HQVFRQ1IzQXI1dy9hbitOdmlyd0Y0NFBnNjN0QjlranRseEZQR1YyNWZjeFZUbmJoczhmV3NYOWxUOXBsL2hCNHdHbzJsNFlvYmk2U1JwR1lnSXdJUHpZN2N0eUsrb3gxQ3BWd0tjRmM4ekN6VUt6VFAyaDBiOWw3eEg4VFBpWmREd1hwZWwvYUo3UzJFMEZ4ZExGTlpReUZ0enVzbTVnVllxQ3lIam5zY1Y4MS84Rkl2QWZ4UStDdmhmVHRlMExTanBNV3F4NmtsbmUzU0lHdUliTzQyeVNLTVpHNGtkUjg0NUhHYTlQL1poL3dDQ2xmd2ZudjhBUmRZOGIyVnBlR3pWaXMwc2JNMnpJS296S2ZuUW5qazhaeVJYalA4QXdXUS80S1dlRC8ybWRjMHQvRG1vUnZaK0VkQ3VyU0czZzRqTHpIOTR3MnNRRkFDSU83RSt4cndzQldyU3hNYWJpenF4TktLZzVKbjViK05mak40NThSYXhOZFgzalRWWnkwbWYzbDJRQWZiMjlQYXRUd1A4ZC9FT2x0RmE2OWN5MzlvWEFieldKYVAzQjlSamdWNXJMSVpaQzVIVTA2R2FTTDVVNk4xRmZlT2xCeHRZOFJWR25jK3VCcU9sK09mQTZHMHVBVldOR2hrak9NSGxkemNBRTU0eGs0eU8yYTlQL3dDQ2ZkcHJIdzkvYjk4RWF0NGIzTmNXbmlIVDl1eHlNa1Nwa1pCSTY4NXp5TTE4ei9zMmVJSUpkSjFIU2JobkQya1gyaTBjSEcwRWpPYzljbkhBOTYvUW4vZ2hOK3pYcm54NS9icThKeVgxazAxaG9sNnVwWGs3cVdVSkVTekhjZjhBYXdCOWE4TEdwVTR1SjZPRmxyYytzZjhBZ3RQNEZmNGZmdHhhcDQ5a3N3OFd2V0Z0ZGhlY000aUN0azV3UHVlMWVYK0N2R0VIeGgrSE1Hanc2SHBsM2VlRm1Gd0o1bVJXTmlWMkVFQVpZcStDQm5HVFgxQi93Y0IybHI0aitJY0tXREw5bzAzUTBNckRHNGZNeEMreHdUWDU3ZnMrK0kyc3ZFVXZoU1MzWnJYVXJhUzN1V1BCMlkzaHNNd0hWY0FuMU5lVmx1S1N4RXFkK3AwWXVqejRXTS9JcmZFZTAxTi9FTndtdVFEY0xsMWlqVGhFQTdLb3pqR0FmUS9TckhoblFQaDVQYVFYK3MrV2w5YVhDU1doaVJoTVpBMjFRRkhCVTR4ODJlU0tnOFMvSFN5OFphKzJucHBzZG5FR2FQelFRY3NjTGdLVGdBWTdjZGNacnJmQU9oNkJwRjVaNjNxRnNzVWFTdk9MaG91bXdjOVFmY2pISGV2YXhkVGxwczhuRFJ2VXNlalh1czZScUVhelc4QmpSYmNTelF5NFIvbTVBWlR5dlRzTVZ5ZmlQeHg0VThHMjdlSWt2SWJMN09EOW9kWmlpdURrQXNXKzdnVjh3L3RGZnRaNmJvWHhPMURXZkJzczg5M04rNGZ5NXo1WmpYQUEzZDhqSkpIclhoL2liNG0rTmZqWGZHTHhmcnUyMXlUSFpRbGhIbkhjRGtuT090ZUJES3NWaUo4MTdKbnR1dlFweDh6Mzc0M2Y4RkFEclNONFIrRmJ0ZlhUN1ZmVldCRVVaQXg4b1AzanpnZHVQclh6cDR4LzRUTFQ3eVBYUEVlbTNseGRYckt6M2R6RTJIL1RJeGpvT2F0VC9EalVyYlRGYnc5YlROZFF6Q1NVU0pzK1hHVkNqako5UFd2UXZGbnhoMWZUdkNFZWxhL29rRXMzbEtYV2RlWXBTT0hUQTQ2RG50ejNyNkxCWmRRd3kwV3A1OWZGenF1M1E4ZjEvd0FRK0x2RE91d3pSd3ZhVHhSQldSdnZxckRQUHFDTzVxeEJwNitJclZydlZaLzNqakpBT0I2L2xtazhZK09ibjRrMzc2OTRuZFZ2eXF4WmpqMkt5Z2NZRmFYaHJ3OGRlRWRoQmZ4UXMzQU1yNEF4WHBTU2laVW94bHFaVmw0VCt3enBjMmJtUkVjYmlDT01kSzZ1Tys4QmFwbzJvYVo0dTA0aTdtdFFOUHVWT0NqanFEOWF4dFFzdFE4T2k1MGFMVUk1TmtoOHlTSjhnL1N1VzFxVyt2VGg1bVlyMHdhaEsrcG8xWXRIdzFiMkxFMktqQlBHMWV2UGFuNnRkeUxFaUdMYUVUQUdPUWVCVHREZyt4Und1K3F1Wkc1OG9ya0FVM1hQTm1iTEFPV3dNTDdVbk95S3B3WnAvQzNYSU5PK0kxaE5KY0JVQW1WMko2NzRuWEIvT3VjMHFDYlR0VExXN0VZK1hqdmc0cnFyS1h3ZEpxNlhsdG9SdDJqalFaM25od01FL3JXYzhkclo2dVpMblRQdE1aa0o4c3lGY2duZzUrdmF1YjJsMmRhcDZHRHFta3lhbnJmMmVSTXRIODBoQndSejBPUDUxSnFmaHVhUGJzbWt4NVlLcXo5YTFOTjArSHcvSlBLeFo1TGxqa3QyQjVBOSt0YStvYWFxMjhGd0FWTDIyZm03L1NwblVScENrOXpNOEFhREplSUxueTl3U1lLMkIwLyt0WFM2bFltejFhMjhoQ3FxNEFYL0FEOUs1MzRYK0xMblNyaTYwaTNnU1FTVGdsaU9tRFhaVGx4TC9hazBRZnkwSjJjWXpYSldxV2RqME1QU1RqY3V4MmNiNm1qNVVGdUFDTWRLaThVMjEvY2ErbHRGa1J4eFpCNDZtdER3M0hhWDluRHFkeDhzaTlVSjRHS3U2MDFnTDJQVVhsSGw0Q3ZKMTRyZ1h4bnFOcjJSeGtDNmhGcWYyVVF1enEzeWdBbm5QQTRyWWtoMVpaTGV3djdDYUY1TU5INXNaWElIcG5yV2pKcjlqNFExSmZFZmh2WElKbjI3bE1XSEtIZzRJUEdhNWJ4WDhUUGpEOFJOZHQ5ZjFmWFpibUt4eXRuSEtvVlFPaEFBSGV1K01JS04yZU5LcFBuc2tkMHNVNTBrZVRNUVZPY0E5Y0gvQU90VXNjam0wV0c5bjRRRHNlVDIvRHJYRCtFZmlsZFg2WE5ocUZtVXVsYmI1ZU81UEdhNkx4TjRsajhNdzJQOXFhSlBJa3hBbXVJbS93Qlh5RGpINTFNbGQyWjBVWmU0MmN6cTNpVFZ2QjNpcUxXZEt0MmtTTnQyR1hnanZtdGlEeGZINHdtbDFVVzZ4dE8yV1FEZ0d1cDBLUHducVBpUkUxV3lYN0hLdXhndzVBUElPT3cvd3FucWZoZjRkZUdKWjViUHhSYkRNcmJZVElDUUFmOEE2OWFjbnU2SEx6L3ZHZUgvQUJvaDh2VXJNcXZEd2hqamsxSDhQZnNOeHIrbTJ4anc1SldSd2NIa0VmMXFQNGw2b3VwNnJad1NBN29yTk1uOEJVSHc1RUNlTTdKWjVOaUxNQ3pZNmMwc0VtcUVVUmpXcFY1TkhvUHh4dS9FYzl6bzBzKzVvVjA5RnRqRW1GTEw4cEdSMXJ6clhXbnU3eFhsVmZNSUdGeGl2VWZqZHFOaGQzOWxhZUg5Vm1rc29ZOFFwS09GZHZtYkh0WG1tb3d0STJBbVdHTU1PMWVqSzdSNTFMWmlTWEJmUkRZT0FNSEIrV3ByQkRZNmNxbGVHL1dxdDVaUHBkN0pCUE4vZHhuM3EvOEE4dVFSeGtxY2pucFhMTkk2YU1iTzV0L0JqUjF2ZmliWVhhMkVWeXRyS0o1SVpvaTZNZ3huS2pxTUdtZnRIZUdIOEsvRmZWZEx0TkpGaENMb3VrU3lBakJ3U1Jqb09lQldUNFMrSnZqejRiYXJQZWVDTlJXMGxuQ2czSWhET3VDQ05wT2NlL3FLb2VKZFYxVHhEcmwxcldyWFQzRTkzTDV0eEk3Y3U3SEpQK2VsUzBraHhUYzJVN3E0ZWZ3L0ZvSzJzRFJpNGFmN1FJLzNvSkFHMG51S3NXdHc4dWxKYVNSaktEQ01hcW9VUjlqSG92M2FuOHNDMUdXT1E0eHpXRlNSMlVvb3BTM04xQy9rQ0pWcXhwMm8zRnZkeHNIK1VIN3BwK3YyeXg3WkVPT09mV2s4UHBDa2dtbXRkLzE5YUp1UHNyczJwS2Z0VWt6Y25qYlVKVmNwOHdYTzNwaXFzMmh5YXVraVJOKzhYSlJSMVA0Vm8yc3ZtU2JvblZjRGxLTGVTNnN0UmU2MDY4TUxJcHc0WEpHZnJYbHdtNHl1ZXBWcEtjRERYU2JrNmM2eUtWMmdnWlhHT09ocm5yVlRhM1R0STNISXIwNjcwKzIxTFJHblNacFpRcExGMys4ZTljUGQyQ0xNWkdqSFhPY1YzNGZFYzdzZVRpNkRoWWhzUXVYbDgwTVFwSVZCeUJXdDhNMmlnOGJhZmNCZVB0c1hHelBCWUE4ZCtEV0M4dDNIY3ZOQzVVbmpBOUt0NlRxTjNZdEJMRmhaSVpONlNmcVAxeFhvcHF4NWN0enJ2aS9wZWo2WkFkQWpZTHFHbGF0ZFdrc0pCRENEZVdRbnRubkZjRkN6Ui9LdVFRQVNjVjJueHFrdTlVOGZMNHl1R1dPSFhiS0hVRTJrYlN6S0VrQkF4enVVNXJuNHZJdU5HamcreFJxMEx0bVlIbDFQVFAwcmVMME9aNk1sdGJ5QjlrSmRVT3pPV05iT2xXNW5hU0RUWlNISXp2SnhqNlZoYWZaVzgwcVR5U3E4d1hFY1o2SC9BRG10bncvcUZ6cHQrQkxBb0lPR1VEcUsydG9Ka3VueGpVZjlDdllOOGhsQU1qREo5SzAvaXo4S2ZCbDFEQy9oTkNnVzNCdUdJenViakovV3B5Ykp0V0dvVzFtMngwQllyenRQcjdWc3JKcG1vV2NsdndQUFF4STVQSVp1aHgrbFMzWkdjbzNQbTN4SjRkYlNMaG9rT2NIQkhjVnYvQWJTdFV2L0FJajZaWjJic3ZtM0tLd0I0WWJoblA0VmIrSVdtalNrZTJ1b1dFeXk3WkF3NUJIK2YxcnB2MlE3QkxqNHhhV3pCU1VrRExub0R1RlJYcXRZZG1WR0hOV1IrZ09qYTdxRGVJWlBDdzB6ZUdNU1dqSWVwVlZHQ2VlT1RYbVg3VFd0K0lmQ0hoclh0S2swTDdNNjc0NC9OUElMQTU0UHNPM1ltdC94RDQ2dnZET3MyK3ZSekdPVDdTU20wWUNsVDh1VDZZL1NzcjlvejRuVy93QVQvRDF4ZFhtamVXWkxSSXdVYk1iN1Y1UCt6MTZEM3J5YUVaT0Z5cWxvMXo1NytEK2duV05Qc1pOaGFLT1BkTG5nQVpQOHpYMVoreUg4YUpmaGo0amgxbnd4ZmZaTHJUTGxMaTNtMzQyU1JIakE5KzM0MThyL0FBRjhYR3owMjU4TzI4WTg2T1psTGdkRko0L0xGZWlhTERxV21TRFY3Rm93ajRFa0ROOTRldlBIVW12bTh4cE9kYVVaSDB1RW12Wkt4K28zL0JRYnduNFYvYTYrRW1pL3QwZkMyM2hsbGtTRzA4ZFdFYWsvWWI5QmhaeW94OHJqS2tuc1ZyOHFmK0NnL3dBTVlQRVB3M2krSVBoK1I1WTlHdThTaU9QNWZMWWJNdGdENXh0WHVmbElyN08vWUkvYS9mNEgrS0p0SzhjcC9iUGd6eEhiZll2RjJnVGd1azFzK1J2QXhnU0lPUWFYL2dvRit4bW53cDA0ZkVuNFhYSjhXL0NIeFRtWFR0V3QwODQyVWNuRFF5QWNLNnJsUVQvT3VqSThlc05WOWxWZm9jV1B3N2xHOFQ4Z0xINE8rTjlSK0Z0NThZN1hUUWRCc2I1Yk81dWpJQVJNd0JBQTcvZUg1MWhhanExeHE2V3NNcXFCYVd3aGp4MUtnazgvbWE5MStOUGhyeDM4RHZCK3YvQ2JSNHZ0M2hIVTlRUzdpdkRseEFUeUZ5T0ErRlVIcDByd0dMelJNR2pYa0gwcjcyblZqVWplSjg5S0RoS3pOSFEvRVUra3pwSm1UNVB1dEc1Vmdmcm5pdWluK00ydUNIRWQxY3pFSDVmdFZ5WkFQd05jdmM2V1dsWHlFSTNKa2drVlNsak1jcGo2NE5aK3lvVkh6TkYrMXF3Vmt5L3EzaUhXL0V0OEpkUXUzbFluQ0puaGZZRHRYM0Yvd1RwK0dHcitIZmgzTDQ5MWtGVzFBdmJhV3JjYllzN21QMFk1L0t2bFA5bkw0TTZyOFdmRzlycFVGcXhoYVFiNU1ZQVhJM0hQc1AxcjlHdkROem8vaG5ScmZ3cHBRVkxEVGJkclpGVHJtTmNFOGY3MzZWNDJjNGhPQ29RTzdCUWQrZVIwR2lhcmNwNGlGdHNWWkRKOGhBTzFTVGdjZno3Y1Z1LzhGSjRkSjhNZUdQaEw0T1NPTHo3V1dlNnVURkVNdDgwU25KWGpHNUNCK0hyVWZ3Z3RQREdvK0tyRFR2RlYweStjOFl0d2lNeEVtL0Nzd0hWUm5Qdmlxbi9CVFM5TTM3VFhnandiRGR4WDM5bmFJdHpjVG5BRzNkSkp5b0pDSGdISFhwbnBYeVBKelkrbEJIczA1V3BTWitjbjdlV3RYR3JmRXV3anVKaXpKcDI5Z3g1QmRpVGtldjhBaFhoZGV0L3RyYTBtcy9IUzdrVURNZGpicXhYcGtwdTZkdnZkSzhrcjlKb0sxR0tQbHF6dlZZVVVVVnNaaFJSUlFBVVVVVUFGRkZGQUJSUlJRQVVVVVVBRkZGRkFCWHIzd0NqaHY5R3ZyV2VNTUd0WkZJUGY1RFhrTmV2L0FMTDl1bW8zOG1tUEpzRXJlV1c0NERBanY5Y1Z6WXBYcE0zd3p0VVByTDlsM1c1WmZoVjRidjRnV2F6a1ZUR2g2WVpnT00rMWZmSHdUK0xjdmc1dEMrSVdsekxjWGVqWDhGMURIdGZ6SEFCRWtmR2VxaGdNOWpYNTBmc2dySy9naGZETFhZQkYrWTRzbmdPcjlPMysxK2RmYU5oOFo5TThFNk5hK0hmRTNoMjBzVXVWakFuREFNNDJxUE1YQUlHMEVlL3plZ3I4NHhzV3NSSkx1ZlRwS1VFZkhmOEF3WHAvWnVId3YvYU1YNGorRE5LWWVGZkZNQTFUUkxsQ3pCN2E1SmtUY1R4dVZpNkhIZFJYd1JabTZpbUgyY0hPTzNjVis5LzdUbjdOWS9iUy9Zcm0wSFRyTmI3WHZBSm0xTFJCSUFIdWRIZGkxMUFQa0dYaFllYWlEb3BQU3Z4ZjhjL0JEWFBobDR3dWZDMnUyNFNTSnlZcFd4c2tpSzVEQTVPUjByNjdJc2ZDdmhWU2x1anhjYlFjS25Pakg4SjY3SnB1blNUelcrb3E0NTh1TzZNY1RESGYwNS9sV1Y0eDhUNnRyVVlzWjNFVUkrWkxlRUVMbjFZbnFhNnU2MFo5RmdhMldFeVcxd0F5WERaQTMreHpqUDhBU3VMMTlrdDVKRUsvUHVPUUs5aU1JS3BkSTVYS1RqWnM1NDV6elVsckJMZFhNZHRBaFozY0tnSGNrOFZIMU5lcS9zOWZCcnhMNHUxMjExTzAwU2FhWnBRTk9nRVpKbGNqQ3ZqQnlvTmExcXNLRk56azdKR1ZHbEt0VVVVZHQrejk4TmRVdC9GSThPNkxaU1QzdW8yNldoZ1JHSkRzd0I0SFhIYjE1RmYweC84QUJFRDlnZXgvWTErQkV2eEI4WTZja1BpYnhGWkk4c1RxQTFwYXF1NEpnOHF4SnlSNzErYXYvQk9iOWxENGIvc3lhN3B2eFA4QWpkYTI5NzR1dVAzMmxhVktBVnRHd0dEUGtZRGdqZ0hwWDY2ZnM5L0gxdkVXbjZucG10WHA4dTR0WkpZNVdHVlRDa0hrWndNRGpBL0N2ekhOZUlITEdXaXZkUHBGZ1ZHaFpibndoL3dVTjhXYXA4U2ZqUDRrMVRVbXpGTzhzVVBtSDVSRXU3OCtCZ2ZVMThHNmxmei9BQTU4U1dPcEtzSlJ0UUVNYXFxNUVZQkJjYnU1endUNml2dUQ5cldEd3kvaXZYZkUrbGFsUGRXNnZKRmFpY0JGSyt3L2k2c2MrNTZWOEMzRHovRlg0azM4R2tYQ3lSYWJGc2kzdnNSU3A1UEhRRUNzK0hlZkVZcHMzeDdoUndkalIwN3dsNFk4UWVLWFhTYkZKQkxjbG54T1Z3ZDNHY2VtYy9pSzlMOGZmQ0cxbCtEMnBTU1N5d1QyY2NEeHlwZDdsazN5TEdRUVNNREZZSHc5K0hXcGVCZkVWNXJtc1NLbGdvYU96Q1M1RWprRGdBZjQ0T0sraTdENFcyMnUvc2wvRUh4ek1Wa2FLRzArek16WndvdUVjOEErNDQ1NlY5Ymo4UkduRkh6K0NoelRiUHplOFVmc3dUM25qR2FLNXV5eUlTeFVSaFdaQnlPdjVaNzRyUStIL3dBTk5CMEx4MG5oKzN1WkxTMnVKVEdMa1cyNUpINE9NNFlucGpISFhrZ1Y2TDQ4bjE2RHhQSzloY284aW55Wklaa0lqSXo4dnVSalAxcm10UDFqeFZwM2hyVXZIN2FCYXZGWTMvbHhrU2cvWlpHemx0cEpIYkgwSkZkOUdjbkJXS3FSaW1jMThUN1NiUmZFTnhwRFRDUzV0cmh2UHVJbU8xWFVuQUJ4NmQrYTgrZnhkQnFuaVJMVHhJUE1pVEFaUU1aeC9uOUs2bjRpK0tiS1cxeVhqakxJWlpwSTdmYUdrUEpINmoyeGl2Skpic1J3M091eUFrRmlGSHJYb1JmTEhVdzVFemIrSU9xK0YvRW5pRzIwend6cGl3MmxtQ1pwd21ONTlQcFZDRzZqczc0Z2JtaVBVZzlLejdLN0Z4WmZhUW14M3lUeDNxdUo3Z3ptTkpNOVNjL3pxWE55WnBDTGlqYTFtOHMvc2hsMHE0TzF1WkZKNkdzUFRwcGJpK0hrUmh0aDNNQ2V3NXJYc3RMMGQ5RXVML1VHY2tLVEdWYnBXRjRWK3dYZHhkTHFNOGtZOGsrUnNPTXQvaFJ6V1JxdHpZdXI2MTN5YW9FQjgwOFFxY2xlbFFhRTk5ck9zSkZGR0JHV3lSanRWYUpaSU1JVno3ZXVLMjlDazAvUzdsNy9BRSs1M3lySDkzSDNUWExLWjJ3cDNDV3ltc2RUdVhlTEtvU0MzYnBWbDdLM2xNRnpFMjZRZ1pIVWdVczl4Y25SaE1mbmFkMkxzUjBxTFJycGJUZThveWNmSzFZdG5aR21tWitwM1VrdXFtRm8vbDM0WEhOZEpxVjlQcStqcEhjUUNNVzl2c1hhdmIzL0FEcksreXJxVThjeE8wbC9tR0IzcnJMV3owNU5HdWJlNzJoa2liaGp5T1AxckNwUFd4MDA2S1NiWndId2ZzRjFEeERPVXlRc2g1N0E1cjAyOGdBV1JYSzRVZk5qdlhuL0FNQnA0N0RWYmlhZFBsZVlnajhhOUJ2cktDVHhFbS9VRkVkd2M0empyamozNS9yWFBYYjV6cXdxU29rbmg2d3VMK3plQ3htUlN1UUZKNyt3cUpUZGhKZFAxR01rcC9BV3lNVlY4UFhFMGR6ZXBGbmJCY01vY0U5TTAyNTFXNGEvRzVzdkxsQzJldU9LempwSTBuSDNEbk5XanRkRmU2aXQxMkIxNEF6MTlQNTEwT2xXODBPZzJTQ0lCUXVjNFBYL0FDZjByRThlNlRmeHd4elFSRWgzQWY4QXorTmJPaFhHcnhKRnBONEZFZXdZOVZISGY4NjZwdHlpckhuVS9kcU5GclY0dkNpYWw0ZTFDMk1VZDQwL2xYeWxzYmhuS3Q2WnIxdS84STZUcldteFc5NGticWZtZERqakdUbnB4MHI1eitJbmhTV0hWSXRRc0ozV1JXREpubm4vQUNLOWcrRlh4Smo4U1JwWTY1ZWlHYUxUWEtiK3NrbU1kdjVWR0lpNXhYS2FZZWFnNUtSWEhoalVkY2tsdHZERnNabXlWUW91ZHBIQTdlcHJpN3o5bkR4L3JlclMzbHhhekxKdUpjUG5rZW5UcUswYnZ4RjQ1OEQ2dzBNRmpxMWtRd0t0RkNSa1pCeU9PaDQvS3U5K0VIeHMrSlhpcngzTG8vaUhTTHkraW5UekVNdG9mTnQ4Y2IyeDJ4am5wWFpCTlU5emdjb3VwcWo1VjhaM0VkMXIwYlc3Z2hiZEZPTzNGWGZBME1WejR0dExPUlQrOGtVYmg5YXBlTHJHUFNiK0Z3Q1M4YXNRZmV0LzROV1dtWFB4UDBoZFQxRGJiR1VHVmluVHJ4K2RWaGJleVZqSEVYVldWejBmNHhlRkxTTFFMVzR0SkZ6RFBzSlU4SGpQNFZ3bDdORi9hY2RqTkNnRVNqWktCOThjWVA4QU91aytLVjBMKzYxSFRaN2lSRWh2aThTazhGYzR5Um4weHpYSGFvWk5DbmpodlZOeEZzVm9KQjE1NlYxTm5IRFJGRHgxTjUxMjgwVGNsMStjZE9uU24yVWp5NmJ1a0pKQ2NmbFZIWDdoSmRQOCtRRUYzM1lOUDA2NUxhUXhWc2NkNjU1blRTbDd4WGdsTG93Wk1rTjF4VXp6QmJ2NXhsaWd3QU9LU3ppRFc3RmxPTS9uV25MNGUxR2ZTTHJYNExkWGd0TGlHR1Z2TUc4RjhrWUhjZktjK2xjN2xkblhhMGJtQUZFdXNzb09NcnhWMldITVJXUEpJNTljVlh1a1MyMUJXd0MyM0RldWEwTkdYZGVzcDd4Ti9Lb3E2RjB0V1VyOS9PaWprVno5M0hJcTdvc2FMWkZPTWs1elZPNmJOZ0l5T1ZCR2ZTcGRKbWtqczhxcEs1d1RXZFJQazBPdkRTWHRkVFVoaHRtMUo0NVo5cUxId2M4WnFid3hiVGFpTHl4VWJ5aWJseWNaN2Y0Vmx4c0dabWJPTTkvNTF1L0Q2RFVyTzV2ZkVVYkg3TERCNWMyMlJHSXowM0E4Z2ZyeFhMT24rN2JPMkZSZTBTNkRvWkREcHNrVGtxb2JhNFBYMDZWekYxdjBwWmJDWmc2dWNwbnFLNk9UWHRObWU0aUtwSEc4bVF6RDd4eldENDFSR3VQdEd6aGw3ZHFXRjVvenN5Y2JHTTZkMFZWdXJTR3haWHNpN0grSVZFR1JvL3RFVVpIbC9NUWNEbW1hTXlYREdGNUdIOXpOS0Zrc2JtUVhCSkFCd1QweCtGZXJkM3NlQzRKNm5iZUo5TW04WWZzL2FkNGx0U1padkNlcXlXRitJeHpIYlhIN3lGangwM2gxL0d2TjRidWFFR0Z5MjBqNXZZMTZWK3o5cjZUK0xMajRmdGUyeDBueFBablR0Vmp2bkNLaHh1amxESG95dUJnKzU5YTg4OFFhWFBvWGlHNzBHNVViclc0ZUdVNDdxY1ovTG11eU94NThscUZySkpJMzd0amdkR3pYU2VITGRydUo1WHVnSkFjYlg3MWc2WkhiMnlPOTJyc3JBaVBZTTFyMmw3S2xrR3MxMnFPQzU0T1A4L3lyV0xzU3pvZE92cjdUNTNqU2NFT05wQnE1SWsrbXhDZlU3czIwVG96eHVWeVdZZmRBSGJuaXMrSzRUVzlIZ3RFVllYdGxZK1l2V1VuMXBtc2FsY2EyME0xMCs1YmEyOHZBNmNkeCtsVE5oWW9mR25UaDR2MGVMNGc2YjluampsU01YZHBHd0VpeUQ1R2M0SGM0UDQxdWZzVStFanEveEJqdW9wTmp3UnRJWFljWUE0NjF3ZmlLNHR3dHhZM0Z3NmVXd1pBdk9TU09vcjNqL2dubG9scmNQcldxNmd1REhBMGNVaEhJSkFHTStuK05jT1ByZXp3alplQ3BxV0lQUy9qQjlobjhGNmZhd0RFa0RMNXJnZHlUa2Q4OWMvalhONnBZd3dlRm5zbDFCWm92TFB5bHVjN2VDQlhwWHhWOEV0cTJoVDJ5RlluM0w1Y1k2SGFRQitKSGJ2WG4yb0plYXJhdGF4NlVZUElIbDVDL01HQUF5QmpwelhQZ2FzWlVEbnhjSDdacytiZE84U240Yy9FeEx5N0RmWnBKeDV3eHlRVG5PTzJLK25iTFMzMWROTzFTd2xFK25YTWF0YnZFY2hTZWNFL2owcjVwL2FJOE9TV0VxenJHUUk1ekUwalpHVGorWHZYVS9zY2Z0R253MXFzZncxOFkzWk5oY3VCYVRTbi9BRlQ5bEhzYTVjMXdNcStIOXZTM1c1NkdYWW1NWmV6bjFQckVOcG1nK0RMMk5kSlZaemJZaGRQbEtzUUJ1NFBUSDVacnRQMk4vd0Rnb0Q0dC9aajFLWHdCNDgwNVBGbnc5MVErVjRpOEw2aVJKRzZOaFM4T2Z1dUFXNEZjUDR0MUVSZUhabzlQWkhEeGd1dzZINmY0VjVQTmEzRS9uU1F4RW5CYVFnNElQWGp2M3I1ckNVbFdpM1BjOWV1clBRKzd2Mm9mK0Nkbnd6K0pmdzB2L3dCcXY5aGpVMThaZkR2VUlIazhTZURTUE0xRHc0MG5MNGlIek5Hbzc0eXZ1T2EvSm40MWZzdWE3NEprdlBFbmhCbjFQUzQzY3pKRW1KYk5ld2RSMkdjWkhvYSswLzJSZjJzL2pEK3l2NHhzdmlSOEtmRkV0amNRdUV1N0V2dWd2WXY0b3BrUERCaDYvcFgyejQrL1pYL1ovd0QrQ29Ydzl1ZjJpUDJMN0d4OEgvRlcyZ2FieFo4TjFaVXR0VGZCTHlXeW5nRW5uYjBKOUR5ZmN3R1lUd2svWjFIb2VYaU1LcHh1aitmMnl1bGIvUVozVk1xVERJdzRSdlEvWG9LYm9IaGZWZkZXdHg2UnB0aEk4c2paWUt1U2kveE1lT3dOZlVmN1FuN0VPclIrTnJ1eDA3Ulp2RDJ1d1hwaTFQUkxxMVpFODNkZzRCNVZ5MzhKL0N1MitCLzdPMm0vQWpYMHZmSEdoeU9ndDBtYTNsVVBMSXdYTzVqL0FIZDRBd01jZGV0ZlVQRlE5bGVucTJlVjdHU2w3MngwL3dDekY4TXZEbndROER3M1dxbEUxWFVJbFdOakg4OGNaVWpPT295ZVRnZWxkbkhwR21QcXl0NFMxVi9LbGlacjZTL3lSSTdFNEk0NUdTTzJUaXZQcC9HamFuNGlsMUthMGFBeXlsSGlqYkppR2NqR2ZRWjZWdjZScmRsTDR3VzAwcS9aaE5BdTJBb1ZKUFhiODNidVIvOEFXcjUrdFNxSnVVdHp0cFNUMFI5T2ZzcWVGdjdPOFp2cStwWEZyTEtrQ05ieWtBbVBMWjJBSEFBSjRyd0Q5cFB4MVllUHYycnZHbXU2VGVCNE5GMG9XTUhsZ2JReXJ0SSt1U2MrcHJzL0dmeGtiNENmREs5MSsxbENhcnFBYTMwdTF5T1pTdUNRTWNoZS93Q0ZmTmZ3bmcxTklmRXVyZUlMbG12YjJlSkxvU1pKZGp1a2M1d0s4ekE0V2RUR3VzOWxzZDg2a1lVZVUrVFAyaDc1Ny80eWE1SzhtNHJjcW1jLzNVVVZ4ZGIzeE92aHFmeEMxcS9WOCticWN4SDAzR3NHdjBDbXJRU1BtWnU4bUZGRkZXU0ZGRkZBQlJSUlFBVVVVVUFGRkZGQUJSUlJRQVVVVVVBRmVyZnNyNmlscjR2OGlROEYxYkczUGNmNDE1VmpqTmRuOERkY2ZRL0Y0blJzWlR1TTlEV1ZkWHBNMW91MVJIMHorenZyOHVuWDJyYVdreFEySGlKWmZMRERJamR5cC9ETmZvaDRVMG53OWMrRUltdXRCdE5SZUJEdGU3dHk2eFl3eTQ3S3UwSEl3Umc5RFg1VFgzaWJWUEJYamZVUEZHaTJrald6M0FqdkYyL0p0Y0E4OGNIUElOZm9YK3kzOGRZZmlIOE83V0l5UVBKOWtNZm15M08xZ05xamFmWEhOZkE1cGhwKzA1NDlUNk9qWGh5V1o3Vit6VDRpL3dDRUY4WVMrUEp0V21qbXRiaVJZSVdtMlFJRGpjckJ1TWJBeTQ1eU1kSytPLzhBZ3BkK3pUWTZuYVA4U2ZoM0Q1OWhMZXpTNldZV1p5YmRwbkRXck1TUG5pWTR4L3p6WkQzeFh0ZnhiOGQyOWg0WGowcTBnZXpsbElqTTRrSVlmTC9DQUNNNHdveDFBN1ZRK0ZkMW8zaTN3SjRoK0RIamZWdnNjR3FadlBEZXIzSjNqVE5YZ1F0Rkk0MkVoSnh1Z2tBR2ZuVnNmSmtkK1U0T3BTZnRrY09LcnhsN2pQeXlnOGVhdjRYWTZaQ0lybTFkY1BhM1VlK051ZVIxeUQ3akZVTllzZFA4YU1CNFd0Wklycy9lMHFSdHpNZS9rdC95MEhQM1RnL1d2bzc5cmI5aWJVcm40aHgrSi9CR293UTIycUNJMzl1d0xDR1VxTnpyZ25LN2d3N0Rqb0s3ajlrZjlpaXh1MW5YVDdwSlNGVTYxNGt1NDE4aXlRY01zUndkcmNqR09leHhYME9MeDJId1ZIMmsyY2RERFZLOCtXT3g0ZCt6aCt3ajQrK0pYaU96VFhkQnVHZVk3b05Kalg5NDR5T1pEMGpBNmtIc0svUWI0UStCUGhSK3licHYyK1ZiRFZmRjZ3YlVTTUtZTlBVak8xRGpsMU9jL3dBcTBieXcwWHdUNEJsK0huN1A3TkUwNnF0L3JsemdYTjJ3eVBtWWNvT09NVjRCRGY2LzRiOFdYdmh2NHJJLzI1UDMxbkpEbG9ycUZqeXlIMUdPcDcxOGRYeGVMem1UY255d1hUdWU3Um8wY0ZHeVYyZTdlRVBpM0I0ZytMRVhpTHhKSk94dlpBSVhSZHlsdzJRQ3B6Z2VnOVRtdjBZL1lzMUdmVlZraHZraWx0YnJUNTFtZ3ZIMmlQTVorWUhPUHZEcjZrbXZ5bzhDNmxNakNjamNPSm9vd3BMS1EzVmNZNmp2WDNSZWZ0WS9ENzlsdjlsQzYrSk56cXNmOXFheFp0YjZYYmhsU1F1eTRmR2NuQ25QYm5KcjUzTjZLOTJGSmFuVFRuZjNwTStlL3dCdm40dlhXbUwvQU1LNzBpL2hHcVhwZU8zOHNyaU9NWkJrN0hnREE2a2dlOWZLWGhEd2Y0ZzhQNnRQTkJyTGxndTI4TVVtTjhUSE83STQyNHoxejFyem40bS9IN1UvaWg0NTFIeHJybmljTnJGMUw1djJWR09VakJCV01MeGovQUhQTmV3ZUQvRkZ3UENCMW9hU3pYRjNDRWlESEpLN2NESmJxdlU5ZlFkcSt6eVBMMWxtQlNsOFQzUEN6TEV5eE5XMGRrZlFlZzZIcGVuNkZwdGxjYXJIYzJkd2lOYXpRYm5MRUQ3eHgwSTNIajJGZlZmaC93QUUzeWZzTStQTkwwdnhGSEVMalJtblVzb09RbXh0cE9QbEpBNDdacjRhL1pYOFIrSkJxN0xkVzZ5d1RUNDhxUmZsNjUrWFBUaitWZnBOOE1maFplL0duOWxUeFo0TzhQeXJiNm5OcExOWkZNb3U1QXI3ZUR4a0RHSzhqTjZzcWM0OXJtdVhRVGJQeXUrS2VpeExhTE5ITE0vN3hYbWpTUERzR0JKWG9DdzR6bml2R1l2SDBmaEhWOVc4TXpTbU5uVFpMQnRLNzBrd1ZPZW5Icit0ZlJIN1dzeS9EbjR1Njk0UWt0bGVXMHYvQUNJbHgwR3djWnp3T2M1cjVhOGZQZXpmRnkwMXpVOUZTVzIxdnc0RUczRzRORTVYZG4rOTB6N1Y5WmdHcWxOUHlNSzhiU1ppL0dDWjlYMGJUclRTYmNzMlNIVkRrUGtjWTUrbjRpdVkxdUtTdzBpRFI3bTJDeW1NYndlaEpIODY3WFZJYkd6aU4xRFp5ek1pNUFjakl4ME9UelhuV3JYTjllYWo5cjFFdUM3ZnV5MmVGOUJrZEJYcFMwUkZORWNOamZ5YkxhYUVSSXc0a1BBNHF0WjY5ZDZMckFFTVVjdUZNYjcxeUNHLyt0VisrdkdreERGSmxjWklCNHovQUpGWUYrNzJlcEtaMEtxNi9MbnJXVVpHN2dkUllKRHFWbmNXOXJNZmtUS28yVGtZL3dEcmZyV0V5SlpUcUViQmJuQXJwZmhSZlc5anFEWE1zSVlzUnRESmtFWjZVMzRtYU5hMi9pQnJuUjlEOG0wbFJYVndHSTh6SE9PS2lUMUt1azdGRzN0NXJtSnBneTdVOStjVmEwbXlnV2R6RTJWZFNXd2F5a0xSV3dYY1R4eml0cnd0R3R2NXR4T2YzZXpqUDBOYzFTNk8ra3REWTBwYlhUbFNLL2tFcVNuTWErblBiTlQrSXRHMFpMVHpiT2R2TXdQbDYrbitjMWxXNjNHb1F4WEZwZGJCQ3g0ZjY5UlZ1NXU1VHBzaGRkNUkrK2ZwV1U1V1IwVW9ObGZRa1pieU1TWkpCR0Q2ZjUvclhUeGFiRDRsT3UyNXVmS2t0N0F2YmM5V0E2WXJCOE5MSXlyY2xNcnZBOHdqOVA4QVBwVzM0eFNiUzlLTjFaRXhtZFBuYk9DUmovOEFYK2RZSjNrZFUvZzBPTStGWmRZNUYyNFlTSG5IUTEyZDliV1dzVHcydm5PazBiZzV6eDBGWVh3MzB4akJLWlVDRXNTRDNQOEFuTmRET3R2WTZpczNRcXVUL242VmpYa2xJM3c4V3FlcFkweFcwcUM2amtITHlrOUR6V0ROZk9tdFNiTWtKeVBZNXpXNW8rb3BmMjhqclBFakNYanplZTlhR2c2Tm9PdG1hQytraGl1V1BES09HcVlzMG5xckk1N1ZidWJVOU4yUmpkS01ZVWNmaFZUVGRkbFc5Q1RObGtqQ2dIK1ZhWjBXTCszdjdOV1FtTGQ4NVZzY1o5YTUvd0FKUWFWZmF6cWNWakhJSVk5UUt3K2ErNGdEMTllYTdJUi9kWFBNbTdWK1U2SFUzdHRVdTRGaSs4OFo2bjhxNWZ4QkxlK0huajFXekRsb2J3YnRwSTR6MDRyVmtzOVp0dkVibEpGTnRIYkJsSnhuSjl2clZIeFFseW1pM08vSkxBT0FmWE5LbnVWVWczRm51US9hTnVMdXcwZDliamhaclNKQ3p5UlpadUFQWGtZR2ZYaXAvRW54KzhJV254RTBieGQ4R05RbXN0WWlpQ1hyT29LWUlJMjR5UnR3ZW5ZNHJ6ejltcnczOE9QaS9wbXA2RjQ3OGJSNlBxOXJiRnRMU1pSNWR5UU9Wem5nNXhWV0Q0ZGY4SXo0ZysweE11MktRNFpUd2VlM3RYUW84cDU3dGV4NUo4U29WZlY0b1ZZN2t0MUg2Vkw0VGwvcy9XWUx1TVlNVWU3STdZcG54QktUK0tiaU8zWUZVWUxuMElISXFid2RBc21zcEhJQ1JzQUlJem5tcHd2dTBsY2VKU2xWbFkxZkdYalM2MXl3ZFpMQlVtY2hYdWM4c01ZeDcvV2tpczdaOUgwMmE2bFYwTW9qWjI2SGpQWDhhcS9FZlRvcGJPYTdod3NTemtScXZUZ1ZGcFNXOTM4SEo3MDZtb3U5TzF1UHk3WTlaSW5YR1I5Q09sZDZhYVBPZDByRUh4UDBPVFM3dFlZb3dZaUFVWURBSXhXUnBrTWgwNW1CK1hGYXZpZlVMdlZQRGR0NXJsaEN4VXNheWZEMngxa1M4ak1pYmVGempuMXJubnFhMHRaR3Bwa2NrVm9wS0FoKzU1cFpaWkxXOWpsTXBBYmpuUEo3VXNkMGtGc0xlRWZ1d2U1elRMeVZKb04wZkVva1VxVzZBZXZ2V0NqcmM5QnR1RmpIMUFDTFcvTUlJM04wUDFyYnNqRmE2akczQURxUm44SzBiN3d0YmFsNENUeDBtc1FmYW9ienlMblR6RDgyM2doOGpwNjgxelUrb1l1YmFkV3hnZ01tZW1hbXJEbVFVbnlQVWRlUkFYRHh4bkEzSGIrZFd0TERyR2JSR0FCUE9hanVvR0VyWElJSUI2R3J0dFlSQ0FYc2N4M011Y2VsWTFKZTZrZDJIamVkeU9TR0tDYmNEeVRoVkkvbFNhUjVxYXBjckRJOEphRmxMb2VjZS9yVUZyY05jNm1VdUZPSStRY1ovT3J1alNNMTVMTndweGpKSFdzWk54Z2FSdE9xckVkMW9GdXRwdkU3TTVIK3NZOFpxQ1Iwdk5OVzJ1bEpsZzRKeDFIWTF1K0pMQkZXeHVZSXdSSVFyQWpBN0dvZFRnaGl1WFlxQWZLd0JqcldGT3JlMXpxblJzblk1Q0l2WlhubXlJTmhPQVFhMExHNXROVG5NVXdMUnVDcmpISUhyOWF6YjJLNGxtVzFCSnd4SVg4YVcyU1RUcm9YSk94b3psZlk1cjE0cE5KbmcxYnFUUm9YL2h1NjhONnREWnJBNlNGUkxGY0t4Q3NwTzZPUWZvUFk1cWI0bmFKcTJuK0pJZFkxVWh6cStueFgwVEE1M0J4em4zeUs3N3dqWjIzeEo4TFBvN1JyTHFHbVp1dE9YKzlFVCs5aTQ2a0g1Z08yRFhKL0ZqWFgxN3hGYmFYRSsrUFNyR095aFk5UGw1T1BiSk5kYWVoNWtsN3h5RVN5bVBDeU4wNUFOVDJGdGRPd1JaR0tFOG5KeFRXZ2FDZVJaRGtLTTFiMEM4WVN0YVBlQ0NPVnVYZGNnVnF0aVdqc1BER2kzVjlESXF4WkVTWXllTWQ4ODFYdTlNOHVON3lLYktwbmpPTUQrdFAwbnhYWjZLdmtKYWZiNUNoUnBabklqQU9NWUE2MW96WFFqc1h0aHBBL2ZxUXBoZkp5ZTM0VkV0Qk4yUEp2RkdvaTQ4UjNCSFBJQXg3Q3ZyVDloL1I1TEw0TWFoZXBBUkpmUzdJM0dlUnU2L2tQMHI1RjErenRyZlY3Z0dhWHp4UGdSUEgyNzVQclgzTCt5NXA4V2ovQkh3M1lTUkZtdTBNbnlybm9Eeit0ZVZuSCs3eGl1ckx3RGZQSm0xcmVvUXhhZ1lyN1d5MGl2aFVrYkh6Y0QwNTVISHBYRzZ6b211YWo0L2wxL3dBTk8wbHJNaXJOQ0NkcHhnRWM4a2Q2N0E2THErb2VONXRaMW0xdFpvV2JaYndtTUhhQXd3ZTJldFVXMTNUZEI4UlNTM3RuSkc3M1dGZ2pqQlRoaGhqM0FQSkp6amoycm5vS05PR2dwcHprZUxmdGRlR1RwL2dLMDFGTFFJMTdxVXhQSDl4UUNQcCtWZk1lcndSMlU4VjNwVWpDTlZYRXdQOEFHQms0SXI3ai9iOTArSzMrRStpL3VJOTZhYmRYa2p4dDh1V1lBSGpnTmpIRmZCMm02ckxhTVlaOFNRU25FcUgweU9Sbm9mZXZheTV1ZEJ0blBXNVlUU1BwUDRBZnRYbSswQlBoMzQ2dUQ1M3l4V044eEdDT3l0M3o3MTdwWitEckc5c0JjUlR5Q1FJR1Y0Mjkvd0NWZkE4dmtMSUo5S3VUSkNlZG1jU0ljOFo5VFhzM3dLL2FpMVR3cVlQQ1BqTzdrbDA4TUVpbGMvdklSMHdmNzNXdkh6UEtIZjJ1SDA3bzlMQ1k5ZkJVUHBHV3d0ZEtzenBjV25CNDJ5OHNyTmh6NjQ5ZTlkNSt6dDhaZkhud1M4VjJuai80VzY5Y1cxM3A4Z2tBaW1LeXhnWXlUenoyR0QxckU4SzMvaDd4OXBjTjFvODhSVm94dG1pYmtqSXdNZFA2OCsxU1hYZzJYdzdxVFhPbW1TSDdhb0xTUExrSnp5b0lQUGV2QlRqSjhsVFJub1d2cXRqOU5mREV2N00zL0JZZndsQkQ0bU9uK0MvamhZMnUyejFpSkFrT3NsUndrd0hjbkhQVUhwNlY4d2ZIRDltUHgxb3Z4Qlg5bTM0MjZBUERmaXkyZDROSDFQVVBrczd5TmlBZzgzbzRjNUN5WndDZWNWNDM4Sk5iOFYrRHZGbG40ajhLM3NsbGMyMHlPbHpGTGphUWNlWUIvazErdTN3VitMbndRLzRLVy9BKzIvWjMvYWxzSWw4VFIyckpvSGltSlZGeERNQVFyeHlkbjlSOTF1L09EWFhoTVY5V3FjczM2SERpcURsRzhkajhVZmlGOEpmRUh3MzFpLzBmVWRMZTMxWFRXTnZkV3psVkNNQzI1VG5PN0F4eU90WVBnQzJleDhRemE1cjhoU3kwOUdtdTdxZVBhWWxISkFKR09SMEhXdnNyOXZEOWs3NDVmc2VhNmZBUHh2MHorMWRBYWFSdkN2am0zaUpTVE9RRlkvM3Nmd09lTThFaXZqZjRtZUgvQUJuckhneTh0OU9odFlkS3RyZ1JTemVjc1gyNXp3Z0FCTzREQjRBNEk5Njl0MUk0bUp3UWpLazduTWFqcit2ZnRLL0ZXRzh1SkpiSFJiZHZJMHBIajRqaStiTWhIVGVTb0o1NkdxMWpJMWo0ZDFlNXZ0WVZwVGVYTXNyT2ZubDJxRVhISFE1SnJ2djJmSjVOTHQ4M3ZoSzdFbW5XazA1dUl3cUljSVFYNUhHUVF1ZXhVMXdsL29IaEc4K0EzaWY0amF0NG1qdGIyMzgwUWFlVXkwd0lNaFlIMllxRDljVmRDTVkxT1ZMUkYxSlNjTHMrSDlWdUd1OVJ1TG9uUG16TzVKOTJ6VmFueW41amprWXBsZlFMWTh0N2hSUlJURUZGRkZBQlJSUlFBVVVVVUFGRkZGQUJSUlJRQVVVVVVBRmJQZ0c3V3o4VFFUT0RqNlpySEF5Y1ZxK0NHUmZFMXQ1Z0cwdGc1OXhVelY0TXFQeEk5djhBaVFsOXF1cGFwbytrbGhIZFc5dk1rQ0hBZHZLQkZidjdLSHhxMXZ3WGV6K0dMclVHaVBtWVJHWVo1eXBIdjlPOVZmQjA5dkw4Wk5Cc3RTa1AyYTkwNkpaSlN1NGdCV1h2MU5PL2FaK0JWcjRFMWY4QTRXSDhQOWZhNWllUm51WStBeUVITzRZNkQyUE5lSjdDTldtNHM5SnZsZHo3QzhCK0lydnhOT0x5OHM0TlR0MTVrdFpaU29JNHdRYzhIYUR3QlUvano0aWVCOUM4UE1mRHRvdGc5d3EvS3JaWmRvenYzTnlSbmQyelh6cCt6eCswaGMyUHc5WlpKV2E2Vi9MUk10bDN3UUF2Y24xQVBPYStnUGc3K3pldXZRUi9GLzhBYVR1SHNkTWxQbmFaNGJMRlpyM0dXRy8rNk8ySzRLMk9qbDFPMHQreHJSd1VzVFV2MExmdzMrRS9qTDlvcTIvNFNMeERxVW1oZUNiTTR1dFlsNG12RVVrK1RCbjIvaTdmV3ZZVmw4SGFmNFNYd2g0RjBtS3cwR3pneGJXNFg1cGpnanpaRDFZa0x5VDdlMWN4cmZ4UXVQRm9XeGl0RnNORjA0ZVZaYWJicVZqalZUZ1pBeHpqcjYxMXZ3dDB6UnZFU1h0cGZhZUREZHpicG5rYkRGTzZyK244alh5dUt4VlhHVk9lczlGc2ozS2RLRkNITEJGSHd6NE9odlJtd1VZa2JkNW1UanBuNWZwK2xjajhXdmhOckd0K0lqTEJvOGs3cHBtMkUrVHV3KzRmSmtIams5YTk5OE9mQ2pVZkR1bXRKWmFrVGJ4U01mSnVFTzVZbXdPVHorQUhhdU4vYUUvYTcrRkh3ZzhNWFBodncrTFhVTlhLa3dSZVp4QnlDV202Z0xnOUQyNjFuREVWSlYxR2lya3lweFVMejBQSE5XOFpmQkQ0UmVISk5WK0kxdFBaMzlsR1k3dTFsVXFaSkF4RzFGSFhJT09leE9PYStIUDJyZjIwUEUveHY4UU9iVmpZMkZubUxUcmNPZkxoUWNnS3AvaTlUK0ZVZjJxZmkxOFFQaWg0bXY4QXhmZCtJVGZOZTNKZTlsZ3dxcGpBQ3FCOTFWUEhIV3ZGTEh3dnJPb3Eyb1RLYmEwWG1XOHVjckd2MEorOGZRRG12dGNzeWFqR1h0cTJzdTNZOFBGNHlWdVNCMC9nclc3UFMzSGlEVWJzeTN0N0o1Y0ttVExJdWVXT0JrQTgxOXAvQ2J4cmVmMlZwVWNOdWtrZjJkZDdnWnpqQkFHZU00TEgzcjRaVHhGNENsYXkwcHZEdHc0dGZsL3ROTG5iTGNFdG5MSnlNZGdNNTlUWDJMK3pQcWRqckdrMnNGMWJqeUlXUlRFTWJpUTJNWXp4d2UxZWhqMG9SVE9TZ3VjK3UvQm5nNVl2RXNNZWgyNFcwL3M2SzVta1pWVWp1ZVJ5Q1I3ZDYrMGYyWFBqZDhRdkQwbzBud0I4T24xTzFWVEhmWFZ6S0lvaXBLcmxlekhhVGcxOHhlRnBQRGR0NENBOE9DSVhFc0tiTU8yOWdBdVEzVG9QdzVyNkIvWmYrSk1UeFRhSHFPcFIyK3lhR0ZaakFSa2JnckgweU1LYzljazROZm4rYlNkU0xkdGoyOERGUmxZK0NmOEFncHpvUGlGUDJvdkZWM2I2VzRWdFZsTDJhaFFWT1V3ZUQ2SHIzNlY1cjRaOEoyWHhRK0UybTJzZWxIKzFORTFTWkxkbGl5Wm81RitkVnlNazkrVFgxUi93V1c4TVdYaGI5ckNiVWtpOGlIVnRIdEwrUmluTHV5Z09jNXllVnoyenpYeXY4SmIzeFpieXkzV3ZhcloyZW0yR3NPTGRJNFI1c3hERDcyem5hRkpZSHRnMTlSbFZhVHcwR3V4ellpS1UyanhqNG9hTmI2RGUzRmtwbDg1T1BKa1RheUhHZWVQd3owcno3eE85emR3MlVzcTVWWVNxNEdNODlxK3RmMnQvRTN3MnZOWjBadFowU0MrdHRTdFdQMm1BaFo0VkRnQmd3d1crVURodlRtdm03eGM5amEzbHpwV242YUpMUzBqTDIwL0c0cm5JWWtmbFgwQzk2Snh4bjcxamtMV0g3UzR0aTIzL0FHaWZUL1A2VlUxWlRxT29XOFZ5Vk1jUklMcVB2ZEtmcDJ2TlpYMzlvR01Ia3J0QTdIK2RWZFp2b1laMWEyMHk0eElBY3k0NVB0aXNsR3gxU2xGTTNUZXc2VnBMNmpZd3FHamtVS0IwUGJOZEZwSHhxMTI4MDFORWxzTFV4a0JTWGh6bm5yWEQyRjlQY1JyYlR4bll4R0VBT00xMG5oL3c5ZDZ6clVHbitHTENXZWQyVXJEYlc1a2NFSHFld0hQWHB4V1ZScU9yS2hUVlY2SFU2bDRBdUpMR1BVN25Td3F1b1pkaUVBR280TkVzVjBYVmJLYTJKZU9GSklXQndGS25CSi8rdFhvMnErTkwzU2JiVDlEOFcrQnA3SzJBMjNONUtRMGxzY0Q1aWdIQ2pnbnR6bXNoN0c0MCs4dlk0NEk1SXJxQXI1MGNtNUhWZ1NqcU9oK2dQR2E1K2VOUlhpZGNJenB2bGtqejNTRktLMW5IQ0ZWTWc0SDQ0SHJWclU0N2VYU0hkanRkVGdKamdrVkRvMXBlckpJc2lZS2txRjc4WTYxb2EraXZwNlF4c20wY2tMd1FjZXRjdFdhdWV6Q0g3dEhwUHdYaThMdit6YjRvczlSMEpMclVtdjR6WXlyS2dlSnZjSG5IMHJ6ZnhucU4xcU9tcXpXNVNKQnR6akc0NDlheWJiV2Jxd3R6REhJeWpJQkFKR2ZmOU90VDNtclQyMm5HeSswK1pISU9WWVp4MDZWbkYyWmxPRWt4M2htTzZhMDJJRGhRTUFjWjV5YTAvRWtHb3p3c2xoWk5OTGxWRzBaMjhkVFdacEhpR0dLMFdDTzMyc1J3M1lmNXpXM040bk9pV0Z4cWFwdWJ6MUdDY1o0K3RjMVJ5bFVPMkRpcWVwa1dPbTNkbXNOamVQdGNuSkJZZjU3MU5EcUlqdjJWWE9VYkhIUWtHcmkrSmZCZmlob1pydlNKVWxqY01Tclk0SDA3VmdyZDJzRnhMY2kzZEZhNVpvd1RrNHpXc1U5bWM3bXI2SFZXalhzdXFyTkdvQWFNakl3U01WeFBnVnBMU1M4V1Q1V2U5YkxaN2sxMWVoYTlKZVRxc2QwcXFmdkt3R2Y4ODF6VW1rWHNGdmVDQmRrZ3VHd1NlK1QxOU90ZHkwbzJPQ1VyNGk1MGRuYnRxSGlJZ3k0VVd5bGdTTVlyZDhUK0FOR3ZmRDArcDJuaVcwRFF4QXRETHdYSEhUODhWeHR2WmE0L2k1OU9mVVpMUzd0SW9zc295SEJBUElycGRZZ21HaU5aYW15ZWJ0RzFsR0F4NDU1Ny93Q0ZFWTJGS3JLU2RqemJXTkN1ZkNtc1cxMXAxeDVnTEFncGtqamsvVC82MWUyNlY0bThEYWo0RTgvVTlZay90SVJqeTRsVU1DY0QySC8xcTg1dTdXSmI2Q0NSQXlpMmJqcnppbzlCVzJlSE1Ua3NHSUkzR3Q3NkhOR0RrenkyNDFTWFV2RWR4TytjUzNKejZkYTdYd0ZEYWFyNDNzOU1hYU9KWnBJb1dsazRWTnpBYmo3RE9md3JsZERGbTNoVzdhVUFUSFYwS01mN3Uza2RhMWZCTFNYZXVBUUVwSXFzNnR1eG5HRC9BRXBxUHU2ZERtak55azduWC9IUHd6SDRRMTdWdkF0bnJFR3B3NmZxYzBVVi9BdUV1QXZSMTU2VnhPbFdzU2VHSmJpVVkyM2lyeVBYdFhhL0ZYU2JUVDRyY1FhcEhkQ1MzUnc4ZkhKSElxcG8ramFmZS9CMjh2aHRNcWF5bTBESkpGV3BYUXB3U09lMTJLMTAzd3FOTEpKa2xrRHFmUVlGWXVsSXNLa2x2bGF0enhoYzJ0M293bFdKbDhzWUFJN2dEaXNDeWk4elRnN1RCZHg0RlM5aWFTdE1uKzFyRThpQWJnQmhjVVc5MjgwUGt1TW5QVFBhbzVJNDBkUkcrY0xnazlNMUhBWFdVbU1qbnYyNjFDT3Jtc2VqZnMvNng0VGg4WnRvbmptR045TDFtMWF4bGFYa1JPMzNIOWpuajhhNUw0aCtEWDhFK09kUzhKekFrMk4weXF4VWpLWnloNS8yYW9JazBWbkxJOXg1WjNyNVFBNWJQcHoxeDBydHZIZXBhWjhRUENtbWVLcGRQbmgxclM3SmJUWFpYVUJMdU1IRU00SjVMZFZKOXFwSk9KbktyeTFFY0ZIZGxYd0FXNTVyUXRXdVJBWTJWc1k0OXF6dE9XYVMvaWpaUWpPK1NEaXV1anNySkhWdk1CT09WWVY1OWVTcG5yNFM4NzJPWldTZFhrdE54VVAxSXFiUkxOcEhsU1NZZ3hKdUFKcGw0UEs4UWtLZHE4NFUvalZtMDNwZDNDS01lWkNjdC9XcG0wNlpWSldyR3JxYnZQbzlxelRFbU9UT0NlRCtOVkpyb1hWelBCSUFDa2VReEhTcFZpMmFMSFBKSmpKNEI3VlQxaVg3UHFVcjJ3d3NrUUhBUHBYTFNTNXJIYlhrMHRETXU0WHNMa1g4U2hpRG5CRlpsOWR5Mzd0THNBSlBJRmJldHJHTk5Sd2NiaHpXWFoyOEgyY3lER0Q2MTYxSjNSNG1Kanl6dDNOLzRNZUtMbndsNDAwL3hFWm1JdGJrTjVaNXl1QXJEOFFmMHB2eEYwODJ1dFRhclpKaUc3bWVXSWc5QXh5QVQ2ODFqYUhJdHJxSWxKeDgzSGJqTmVpL0ViUU5Kcy9oRHBIaVd5MUJyaWZVcFdsK1FqeTdkVXlza1REKzhEdFlZN05YVENUbEk4eXNsQTh1dGJtVlpYRW56Ymh5VFVrTnFHTE9zdUF2UVZWRXZKWm0zSDBBd2F2MldrMzk1YU5lMmxuSTBTL2VjRVlGZGFNQzNwWG5PbzJQd3Y1MTFNTmxlNmpwYXZwNGZ6VmtVS3lIR1NlTUU5cXdmRGNLS0RaM21teU5JNStSOTJNVXZqWFZkUjBXeit3MkZ3OFViOHNFYkc3SDBvY2JvbHRITytPTkIxTFNmR2R6cGVxUjV1RWx4SW9JNmtkc1YraFB3aDhNemFMOE1mQ1RwRUFrT2pmTW82N2ltZlQwL25YNStHNG04UytPTE5MVm1tbG1TTHpDRGtsdTU3NU5mb2w0ZjFXNDByd3BZYWZxZHFGbXR0TWdSRlFBREJISTQ3MTg1bmszRGtpZHVBcHhjWk15ZkU5NE5KTDZvOGFzSW8zbUVZNkhieVJqNkNzblR2aXY0RjhiM1Z0YW90emJ0TGJ4dXJTeHJoWlIwd1FPVDZEb2UvclVlcmFQNGo4ZDNNK2srR3RXK3hiaHNsbmtYT0ZPUTM2L2pXdjRHL1p4dDdmWDlOdXJqVTFtbFNTS01SaUlLam5jT0FmVHY2OWF5cDFzUENoZW85U0pVNm5QN3EwUExmOEFnb3hETDRhMDdVdkN0cHFNeHQ3THcvWlJDR1dVTjg4cmVZMlBicHpYd2xIQzdBa0RqcFgydi93VTk4Ui8ydjhBRUh4UlpXOHh4L2JTV3EvS2VWdDQxajZudGxUWHlCYjZQSUxOcHlWQjNINVQxcjZITHBjdUZUUFB4RVhLcll5UExrVGhjZ2pwU3BkWFVMNUVwejBKUE5YSm9kdnlzUjc4VlNuakt0aFRrR3ZRaTdtRW91S3VlbS9BZjlvN3hUOEx0VWpzcHJpUzQwOW4vZVJNeEpYM0ZmZVh3VytPM3c1K01lZ3BwRjVxRWFTeUJRRjNZYmNlMk1kZjUxK2Rmd3ArR212ZU8vRWNObnA5b1doUmcxeEtRZHFLT1NTUlhkZU1MaTQrR1BqcGIzd05jc3NWdWlpWlkyTzB1UHZZNXoxSFd2bmMyeStoaXAvdTlKSHFZTEZWS1ViVDJQMEhIaCsyMDdXb2RJVFdRMFJJWTdSdCtVa24wNStsZlhQN01ndm9McXpiUjdtUzNsdDBXV0tTSnlDQXVTdU1kT25XdnpqL0FHZFAydGZESHhKc3JUd3o0MmRJN2lMQ3BNVzJ0Mk9QZnAwNzE5OC9zbER6cG80dE0xcDJpZWNTUlRKZ0NTRWpETGtubkFJNDl6aXZpOHhwMXFkSnhxYU5IczBYQ3BLNlAwODBUeEQ4UHYyb3YyZDd6NFdmdEcrSDdYVTdON0x5cnczaWZMSXUzQWtESGxIR2NoaGpwbXZ4Ui80S0gvc1Vhbit5cjhRV3Q5SjFXNDFud1BMZE5ONGYxVEpiN09XemlHWG5BZnBoK2pBWjVOZnNKNFQ4RmpUdmhIZUxkNjZ0czE3WXRIR2tRM0VCaGtEQXh1KzhBRzdDdnozL0FHb3ZGbW9hZE5xdnd0MSs5VFhiR0xNWDJtNVRJa1FrWkRFNXdSMEhwNjE1Mlc1N2lLTlpRbHFoMU1GU2ttNG54UmNTTm9taDMxeHAxd0VFUGhXNVlKRkt4MnFEdFZzRGc5VHprQWU5ZUFmdEQzMHVuL3N6eXRGaFV1SklvbFl0bG4zU0VuOGdnQi8rdFh1RjNvM2dPQ0x4WjRUMWVIeTU1dEtMYUZjTmQ1WkJubUFwbjUyNUdNOERCOUs4QS9iTTFXNDB6NEk2WjRYallKR3VyckZ0T0F6K1hGazhaNEFaaitkZnBXWHlWYTBsMVBCeFM5bkZvK1ZHUGIzcEtLSytoUEtDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNpaWlnQXE3NGVrV1BXN1YzT0FKUm1xVlB0bjh1NWprL3V1RHo5YVQyR3R6NkRpMW1EdzFxbmhUeGVRU0xTTnZNUGNxSDUvUW10cjRxZkV5ZjRqK05Gc2ZoL3A3U21RSXJPZ08yNEx0eHVYcUZHQU91UGJOY25xc1VkNzROMFdZaitCd01aN2l1MCtHRnNQRCtxMjhFVUt0ZktFKzFQakxSeEVydGlVK25VbXZuSytKZUdveWtlM1NvKzFta2ZSdjdKZjdQbnd3K0IvaHU1K0x2anpUb3IzV0lSNTFwWVNzREZIT1JrTEdDRGx3ZS9ZVmQxMzRsK052SG5paWJ4SjRrdVdCSllSUXBuWkduWlZBOVBXdHZFV3ArQUJQcUM3WXJiWk1rSmJwd09PdjRmaFhJK0Y5VkVWeXp2WXhsbUpDQmwrV01IR1IxeDB6WHc4TVJMR1RsVnFPN1Bka28wb3FNTkRwTkk4VWVWY0ZibVRiNXJaU01nbko3WjljNTcxOUJmQWJTNVUwaVh4WmRYUGxXVWFscEE3Z1pHTThBOEVmenJ3cnc3b3VqYXRNSWRYZFVodG44MlM2NktxZ25QZkdNZEs1SDQ4L3RQK0wvQUlpQmZoRjhISkpMSHcvWmJZTHpWSWpnTU1sVGdqZ0g5S3VHSHFZdVhKQXpsVmhTanpTTy93RDIxZjhBZ29kQm9HbTNIdzYrRUY3SEpLdjdxNTFZSDViZkFJUEl5QzJjNDlLK0s5UXVvdmlSYlNhWEQ0Mmt1cjI0TE5LUkpscG0vdkVIMlBUdUFhK3RmMmRQMk85QitKZmhQVi9BT2t6UjNQaVlxOTNZYWRlRlN1c3hoQ3pwa25LeWdFWTlTd0JyNWkrTi9nRFh2Z1I0anVvZEg4TW0xdUFKWWJXYWFMeTVMZVp2M2NrWkhVTURuQU9NQVY5aGxHRHdtRWp5UitMcWVGaThSVXJ1L1E0blRkYjhGL0NMUTdpTFZHWFdkV2tMUEhwcURFRUIrN2lSaU9vNjRIV3ZKZkdmaWZ4QjR6bnVOYTFtOTh3UnlZU0dNYkk0d1R3RVFjQWNWM2Z4RWdrZzErN3NwbzFrYVB5b3BYS2c3MldOUVNmVWtqT2E4OTE0VCtVMGNZMnhFNUtxTUFtdm9JTkxZOCtVYm93NG1LeXF3N0d2dHY4QVl1dkxQK3lQdHR3RVV4eU03czZrWlh5L1VlNUg0MThSamh2eHI3Ti80SjM2blkzbXJ2b3VvMnduV1NCR01jaVpEZzR5UHJ4L091WE5mOTN1WGhIN3grZzN3THYvQUFyNGEwL3p0VVNOM0xiaWpCbTJJZVYyakh0K1ZlNi9EZldQaCtOVU9yNmRIYWllNFZlRlJqa2pKSFRnREJ5VHlNa0h0WHduNDg4WjJsajQ2dWZDZDM0eGwwTVFTSTBNYW5hczBaQzRrQnorbVJYMFQreUY0djBhMWVIVDdLOGoxaU83bWpTVzh1cEE0aEoybmNoSXgyUFErMWZFWTNDTjRkenVldmg2cWpWU04zL2d1bDROaG44YStFL0h0czM3eTk4SXgyOGliZ1dPMXpqSjZrNElQcFg1dGE5NDY4UjZKZjJiMjlqOW9VMmF5UmgyS2dTS05qc09UeU1kK3RmcWYvd1dEOEplTHIvNFcrRWZGR3JoNTQxc3BJRm53QUZZRU9WOWVlY2R3Qlg1YzZ6cU9ucDRWMWJ3NExWVGVXODV1TGU1VURQazRJbFhvUzNVSEhUazE2bkRiOXJnbGZvUm1YdTFORGtmRjN4UnRQRzgybmVFdFQ4T2pTL0t2aUxmVVd1MlpEdXdwQjQ2RTg1SGJBN1ZuZkVQdzVyZmdQWHBJZFduaVpYdGlwdUk1QThURGtBZ2dtdWQ4VEhUN1RWeEhHcVhBRUNQRTI4RUhjTW5IdDB4NlkvQ292RG5pNTRIdVBEdmlPRDdSWlhVUlZsZnJIamdFRTlPQjJyNmhTUzBPQlUzb3pEaHROUHVMank3TzVFL1BIbGpPUDA5NmsxU0tlRlVTWlR3ZnVrbnJScEVrR2tYdjJ5d2pYYXJuR1Z6a1ovd3FiV2ZFTUd2YW1pWEZ1SWRpNEdHenVQdWFsM1NMNVpObDdWOVA4S3dYOFVIaFMrdXJ5MEVFYlQzTjFickVmTng4eXFNOEFFNHpYY2ZBLzRweS9DN3g3YStJWjRCL1owa2YyVzhnaVFaYUVqZzVCSE9UbXZNRC94OFpodVdWRUlQMy84QVBwWHJIakQ0UlNlRi9oSHAvamovQUlTVzB1cm04a1FSUlc0SENFRE9EM3hua2RxNTZzWXpnNHM2OE81MHBwbytrN1g5cEg0RFA4UXJlSHhlRWcwNXRNS1NYejJxdkI1bU1LQ2dESGtIcDZtdkVmMmlIK0ZXZ2VKclM1L1ovd0RIMzIvUjlXdVd1THJTb1N4anNYeU5vUWtBZ01HeVJ4M0dLOG8wMnl1VGIvdlhkeWVmbVluK2RYZkNVaUxyVWkzcVpSQnhrY0QwcnoxQ25oNHRSUFpqR3BpS2lsTTZDM2dpbjFkbFFjQmNrS01WbjZ4Y3h0Zm1HM0hBUE9lTUd0dnc5TGJSM2x4NWtZRzRmTGtjNHJEdjRTdC9OT29BVUU1elhHNWMwajFKTGxpa1VyeXlua3Y0V1ZWOHBSbHRxOWFYVm9GQ0NWQWVtQi9PcmRvc1NsYnJ6dHhQT3c5aFZmeUxuWEw3K3h0UFlDZTdsamh0VVpnQVdkc0RKclNPcU1aV1dwTG92aG1lL1pXaVhqQWJBSHZUTHFHNm1obXRtRzdiT1JnampQcFh0ZnhkL1pQMTc5bjN3cFozM2p2VVdHbzNIbHBEYndTOE1jWmM1eHlBY0Qyd2E4ajBLeWwxdlY1ZEhlN1dKVElXUU55ZXZUM3JOYU81Q3FjMmxqQnNRdWpYWDIyNmhCUU55aWpwelhYWE9uZUZ0ZjBkSmRPbENPVkFaWE9NTi9XdVc4VDJNMXBxYjJMeUJuaklCMjlEVnlHZUdMUnhiWXdjZmUvejFyVG1UMUo1QmRHdHJLdzFXUDdYZStYRXM0V1NST2NEUHQ5S244VVQyMm1lTVpvdFB1akxZM1FXU0ZuSHFCbnIxeHpXVHBEM0dtVHZxTnphaVdEY04wY3VTQ2VPYTJkZmx0dGU4UE5mTGJ4d1N4UmtvRUhvTVk5YTZveVRoWTRwd2FuZEhaZkd2dzNwdmhMNGo2SnFXaVRLNjZuNGJ0YmlRcmtBTnl1T2VwNHJuNTc5THpWWXBiNXdZOTIxZ0QwL3ovU3NQVS9pVGRlT0l0QTBmQVVhSHBma05JQjh6RXNUenp6MXEwMmkzbXEyZ0tYSlIxWUZlZXB6U25kTkJRczZiSmRTMDZHTy9oQ1RBbzhiYldIY2RxemZBbHFQdGN5c2NoR0lINTFkQVp0WHRMUzhQU1VBbGpqNjFOZjZWRm9uaVdSTEJ2M2JuYzJCMHp6K0ZiWGJpUkZjc3p5cTQwRTJkdE1ZN3RHaWd2U0hBZjVpZU9mcFYvd1BQOW4xc1hBSkdJV0c3MTROWVdzdk5iK0pMcU5TY2ZhQ2NaOVRtdWo4STJNY3QyODBrZ1FpSDVSNmttdG8zNURnY2JTYlJ1L0dmVEx2VEwyMnMzZ2VDTzVzNDVJR2Jvd09PUjdjMUY0Y2FXeitGdmt1ZHJUYXFTakUvd0IwZnlyUy9hR2E1dnBkT2trdW5rV0d5U0tOUzMzVkFIQS9MOWE1SzExSFVKUERkdFlYQUpqV2VRcVBVa1ZjVmFKbks3WkhQTytxZUhiaXlsNU1SWmtQYzVyQnRQbHNmTUk0UTRyZFlTYWZBOSs4ZTVDdWRwN2lzUzN1eExENU1jSVFHYkp4M3oycFBZS2Z4RW9CZTFWSjJLanFCaW1nQ0pnVkpJSDYxUHFzY2ZucnRHTWdjZWxOdUZkYmNNcS9LdmJGUW5jNnVVYmNUTjVJSnlRQ01EUFN2WlAyYWJEd3Q4VTlGMWY0UCtKZkVDNlhxVjFwRW4vQ1BYTWhBU2FSVDVua1A2a25PRDI1cnhHV2NpZFZMYlEzYjBxZlRwcnEwdmtOcmNNa2lOdVdWR0lJUFRQSFRqaXFqb1kxWXFUUnB5YVJOYmErTGVhVlJKYnlzanJ1enlEZzQvSFBOYTJteXJjenRsaXhERUsyZndybG1lZUs5ZWU4a1lzSEpPVHlTZXRhM2htNU1FWldKaVZMRWdIcjYvMHJneGxOeWh6SHFZQ2Z2S0pYOFEyejJldmk1emhRcEpGVGFUQmNYNnRkdkxzVGFkcFhyVjN4YXVuYW5xRWNOaStWV0lDVEhVSHJVR2drMmF6NmM2a2hmdTU5S3djcjBVZGFoeTF5emNJQjRlQ05rbU4rRDJxcnIzbHhTV3pPdk1rUzV3YzFadUxzSHcxUHNUbFpNQUhxT2F5OVNudUxpSzJrbkpKQkFGWlVrN205ZVNhSCtKbWhqczFpQzVIY2VsWVZ0SUlaZVNHVFBJSHBXaDRpbHVKVUFVOFk2WkZaVm1URzVrZHNjRUVmaFhyVVkyZ2VKaktuTldzaTdFbm0zengrVVVVTUJqOFJtdmE1UGgrdW1mQ0x4SjhQNU5YanZwclBTN1R4Vm9FaVpBZUp2M1YxRmdEcnRJYjZybXZHTk9udEZlS1ZaTXlFZk9PcHpqcitncjErK2xYdy9vZW0rSWJPNHhJL2gxb1o0eTVQN3BtS3NwNTZFSDg2M3BQM3JISGlZM2dtZU9yZGFYZTJDYVpGcFNwY0krVGRMeHZIdUt0eFBjV05pYktPNUlVbkxJcDRiOHFvTEdiRzVNOFVQN3NuRWYwL3hxZExocm1aSXJrRlZZY2tEcDlhM2R6ajFOWFR6Tk5IR3U5bDV3R0djNTlLemZIMGQ1RHB6UzNWeXNnVWM4OGl0bnduZTJIblRhZE5aaVVEbUdjbkRLdzlQWC82OWM5OFVMNmVTMmxMZ3FRZHVNOEdyZzNjeHFNaitBQ1M2bDhUdE9TUk41YVpWQXhudVA4QVA0VitpMS9ybHRxT3F6UWhHQXQ0WW9GWUxnYmtUT0NmVGl2aFA5aVhSSXRWK05ta200aURyR3hrWUVjY1pOZmN2aHUwT3NhZE1yUW1PUTNzck5LUmdkVGc4KzNGZktaOVVVc1dvOWoxOEJCeG9YWlM4UFgybitEOVp2WjVTcVJYTzE0eG5rOSt2NDE2TDhBcmkyOFUvRlhTWGE0LzBlTzUrMHlESEFTTUZ6OVB1MTRsOFJmRUZ2NFdXMU56YWlXNDFDNGJ5dC8zWWtYcFhvLzdPbnhEamc4UGVKdFppMFpFbXMvQ3Q4Uk9RQUZKZ1pGNjk4dGtWd3ZDenFVbE80ZTNqR2JnZkd2N1hmaVY5ZjhBRTgxNUpaczM5bzN0eGZOY2tuRGg1VzZlb3g5Y0hQTmVKemFZclhTUmcvZlhJR2NZcjF2OXBpUFRyRHhCcEdoeFhqTkxCcEdic093T1dKTEFEdGdqSFFDdkxiMUptVlpiVmdzaWdBWlBQUE5mYVlXUEpob284cXExN1Jzd2RZMDh3eU5BaHljZHE2UDRRZkEzeFQ4VmRhWFROSzB1YVF1NFNBS2grZHlSanQ5M25rOXE2cjRSL0FueGI4V2Rkc3JTejBhYWFXNXVGUzN0MGpPNmNnakpPY2JRQms1NllyNzYrRjN3eitIL0FPelg0Uk5qYjNGcGNlSVh0aXMxMUM2NHR1QU5pZHdOMkFjODV6WEhqODBqaGx5UTFrYlVNTDdWOHoyUEpkRytBV2tmQy93VVBBL2h0NEYxSVFwL2FWeXhBZVZ2dWxWeDF4MDlPSzhxOFUvRFQrelpMeTdqc1ZsWVJzQWpwa2R6M3h4WHVuaWlNK0tMbkxTdTF6Q3JHU1NJRXV1SEpQUWNEcmcxaEh3VSt2YVpQZEpxRHNrQWFPTnBWQnhqb1QzUHRnZHpYRmg2L3U4MDNxd3J4NXBjc1Q1QXZ0SjFUdzlkL3dCdDZKdWduUnQ3SXVRcEE1L3BYMlovd1RxLzRLQVhIaGpWYmJ3MzRrdVZlRkpBSnJXVnVveU9WejBQRmZMZjdSMnFSZUZXdVBEMXBxYUxjdGNiWllyZU1ESXgxTGRzK25VVjVMNFM4UVhHbWF6RGRhZmNQRE5Hd01VcWs1Qi9yWFppc3VobUdFZDFyMEhoOFRMRDFVbXordGo5bkw0c2FCOFp2Z3RINHE4TDNpWFgrakZKTXQrOGhrMloyOERnOFpyODl2MnVSTi93bnVxck0rNFRlYjV5eWR2bWJiZ2RPbzYrMWZPWC9CSW4vZ3FIcUh3MjhmV253NitKV3J5eGFkcUxpMnY4dVR2Umh0M1l6OHBCd2MrbGU5ZnR4ZUg5WDB2eGRkemFCcWZtMmx4R1pMVzV5TnR4YnlFWUlicWVNalBxYS9LcStYVmNEaitXU3NmU1U2a2F0TzhUNFQxNjYwKysrTDFpamwzRnZjWWlETmdNd0pIUHVjRHBYbVAvQUFVTWptMDJIUTlPdWlvZTd1cnU3VkZiUHk3bGpCUHZsV0J6WG9zR2phaGYvR3ZTN0Y0dGl5Nml6c200WkFYSktuOUs4VS9iNjhSeTZ4OFJkTnNHa0xMYldMdkNjNUcyU1ZuSGZBTmZxbVNSL2N4Wjh6bUw5NW5nbEZCb3I2RThvS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBb29vb0FLS0tLQUNnZGMrbEZBb0ErZ2ZETWRuZi9EN1FMd2tGb2I2TGRuMEpIV3RUNGZYMm8zSGpXNzN5SGY4QWJHWXQxSy9QMi9ETmN6OFByeVdiNFRDU3lYTFcxeEV4SHBoaHordGFIZy9XSWg0MXZJRElJbWEvT1d6eVFTZUIrSnI1Yk1ZUDJVejZMQlNVbWo3TzBIWExTNDhBUXBOdEFLQkhiSDNSanZuNlZ4MnAzbGxva3hoc3RXaHVwMlVmS3ArV0ZNY3N4UFRHZXRLZkVFWGg3d1BhMnpoWHVyNlVZZ1lqQlh0bXZOL0dGOGRjYTh0OUh2UUxSTGdyY3pqcE5KemtaVUhDTGprZCtUWHh1WFlPZFNvMHRybnE0bXBHbkZObXQ0citLdC80cGdIZ2p3eHFCK3hlWUYxQzhEYlhtUFFxTWR2U3ZTZkFlaCtITkYrSGtsdGJXeUtKb0ZVYmxJYVIrVHVJSFhqK2RmQVhpYjRnQ0R4dmNYT2kzTnhGYlIzT0U4dWJCRzA5UmpqdHg5YSt4LzJTdmlyNFM4YzZKYTJlcVNMTmR4Uk5HZzFDOUNDWUVZd0d4amR1UEdTRDE0Nkd2dFlZQllHa21rZk8xc1I5WmxaTStnZmd0OFE3THd6NHNzdFhzSjVOUDFXeWxEcHFLa3F1NVNDTTQ1NVRBK25CcjZJL2F0L1pxOEQvQUxidndWdWYybVBnL29rRS9pUFRZbFBqM3c1WkptU1JrSC9IOUVvR1M0QStiKzh2WGtWOHdKb054TDRZbHNQRGZoMFBxQnZGZ0VxcmtRaGlSdUxBOEtWNHgrTmV1L0JmNCtlTFAySmZpZForSU5GdDVvTk80aXVvcFN6VzF3dVAzaUVaSU9RT09PMWVWaVp6alVWV2x1amVoVFRoeXlQekcrUDNnKzgwSHg5cVNhakVVODZZeW9GSERvMzNTTVo1OXUxZVJhOVpSckU3a0FBa2xjOFYrMEgvQUFVYi9aQitDdjdTZnd5dWYycnYyYUxHMlhSN3dHVHhMcE5tbTZidzFmUHliaFZUazJybjd3L2dZNTRCNC9IdjR0K0RQRWZnYlc3blJkZjB0N1dXTU1BakFCU0NmbFpTTTdzZ2c4ZE0xOUpnTVZERjBWSmI5VGpyMDNTbFpubTBveElSNzE5UGZzSDY4Tkk4ZVdhcXd6SmFSc0RudXJmenI1aGx5V3llOWV6ZnNwYTljV3ZqL1E0VXVCRXNralc3T3dCQTV5T0QrVmRPWVE1OE16bnc3dFVQMDcxWDRUL0NiNDU2ZHBPcGVJYlpMMUVJOGk1dHJrb3grNkdYSzRKNXorUnhYMEQ4SGZocjROOE9XVnA0WThIYWZiMmNOb3lONU1IR1JrREo2azlBY25uSnhYekw4TTMxenczbzlwNFAwbnc2OGtNeU5KWXlXZ1ArdFlBc0d5RHRPU3g1eC9XdnF2OEFadFRTOUx0b05QMVd3bGp1aXpHNWxua3c1WUVIZzl2cHlNMStlWXVkU0VXcjZIdlVZSnRNOUYvNEtMZU12QVh4UC9ZU20wclN0V3Q3cldmRE9wVzhXcldrZVBNdFpHaTZNRHprZ2ZwWDR3K0xwcjNUOUsxTFg3TnlzMFdSR3VPVkxIblBzUU1HdjNHK0xud0ErRlZyK3hWOFQvRkhoTHd6cVVlcGExTXQzcThrakVvMHlSNFVKazhLQVd6NzErTkdyNkJwOTk0TThTNlBMdFM5WkJMYW94d1pDR0pJVURxZWVoOTY3dUZhMFpRbkJkR0dadzJaOHdhZmNtNnVBK29uRWtSOHAyWTRCQjVIWC9QRmFHc2FmYXBhK2ZiWWFWaUR1VHVDUDgvbFRkVDhQendXdDNiSW8zeDNRVjg5VjJyMDZWbldONWZLQllOa29Ed0c1cjdDOTVhSEZCZTRpdTBCZ3M5L1VEN3k1OXFzd1IyZW8rSDViVkFCZFF5Q1FOakdWOU9ENlZGcXFzcDJiOEJ1Q0txV2p5V3R5MkR0WGEyN3JqSDByUjdGTldWeTFCWTNLbU4vS2ZhY2hCbkc4anI5UlhTK0ZQRWNseEIvWjF3citXbytUTGxsQTl2MTVyUDhIK0xXMWE0aTB6VXJKSW9JaUJENWE0d1NBdVNmenEvcE5pdHJkeWJXK2VOMkE0eHU1eUs0NnpzanN3c2VlYU5xeHViYVNaNG9FS3Fwd0NSMU5Pc29GMjNrako4eE9BUjNxdmFTSUp6ZHpUeHF2OFNLT1RWd3pDR01DTlBsdUplRDdWNU5XZXRqNkdqRlJSditIRWp1b25Fa2UyV09NS1d6Z1Z6dXBySWwwMFVnSUxNY0FjREdhNkZvUEk4UFhLQi9MWjIrUmgxck5sc0pyMjFSN2VZTTZyODdFZlRqTll3VHVhMUdpbHBkc0o3NlJVUEFIdnhXYnFObzFwT0pyV1k3bGx5am94eUNEa0hqdU8xYStsTTF0YnVYNWJPYzQ1cUxTUHMrcFhyYUxmYWNZaEpMbEpjODl2OEFHdFlhTXdtcm8yOVkrTHZqM3hwWjJjWGpQeFpkYWl0b29pdGZ0VXhQbHIzeDZqcitkWkY1bytwYVI0ampETm1PVXE2eVJuQUkvd0FtcVhpVzBYUk5TU3p0aVNweHowSHB6K05hOGpYU3cyMzJoaXdXUEF6Njk2bXBGeFJNVW15dHEya1JYZmlFc2o1NEJ4L242Vlg4UTZjME5vV2hmWWZidldyQkk3eUc5RzBBdHQ1cXQ0a2phVzJJZTZVL0x6OWY2MW5CdHlLbEhRemRzRTNoZExPNHVOMC9uQWdZNkQrdFA4OVlZL3NxalBBSHFLcGFPaUMzbmVXVG9tRURaNi81eFZtNkR6MnhtZ0hLSnZjZGVncnZpdFRnbTNxY1hEUHFuZy94MUxwZHpBQmIzanE2T1J5Qm12VExlOG1qMCtON09JeUh6aGxRT3cvL0FGMGZHbFBBM2pMVHZEZmlMd3pwRjdaeXlhWXNkOVBOR3BnYTZUaDFRcnowNTVGVVBCMnQyMXN3czd1NlJIUWJZd3h4azhBYyt0ZFZaSnBISGhwUzk1RVhqT2JVa3VZOWN0YlIwaVNVRGRqSFBVZmh6VjU5VnRidUNLL0RmTzhZVnhqdnh6VmpVYmtUeFcraitJbkZ2Rk0rRW1qeGdjOFo5c0g4cXNhLzhQQm9kZ2w1WTZuYTNOdVFDc2x0UGtnNEhCQnBKZTZhUnFKVDFQRS9Fa3V6eFRLV0dWTEFrL2hYUitEcmQ1L0VzRUNqTFNBYkVVK3BGYy80eXRtR3JlY2h5R0EzRFBUR1A4YTMvQTEwSmZFMW5ia2taWUFPRHlLM3BPOUpXT0p0dVVrZDk4Yi9BQVJyK2s2ZFk2bHFGb3V4ckVNQXNxc1ZIQStZRGxUOWE0SzJsTVhna1hVYWhnbXFsR1k4RGxmMXJydkVWbWkrSGIrYSt2QTBobWFNU0c2M1B0QU9NanYvQURya3JkL3Nud3VOc01FeTZ6dlBQT0F1S2EyTWsyeUc4Z2E4OE5TWExYR0pZdUJHVHdSeDBybWRFM0dlV0psemdaSEZkQmM3WmRLQ29mbUo1ejBCNE5abmgrSHk3NTJKQnlwNU5IMlJRZDVvZGZoTHEyVzVEWUk0S21vbW5raXRnd2NucDFxV2VFQ3laMlVqNXpqTlZiaGxTelFnZy9OeldVVWRqYVExclZ0U3c0bHd5akJVQ3BiT0Y0SnZMajVaZTU3Zm5VQW5NRWl0QWNldU8xWDRKMFdUWnNLc3h6dTlBUit0VkoyUk1VcFNPdFB3WDFPOVc3VVRpTzlzdFBGNDBUa0VTeGtBNVhGYzk0WlFNU3VlVmRjblBYOHE5eitHRm5xbmo2ZXh2TFdiZEovd2ljMXJPRXhrN0FRTStwd1IzcndyUTlQdWJMVnJpMWxCSGxPUVZQZkRIajlQenJtcnR5b05uWmhFbzRsSXQzVnJERHF6eVJuNVRKZzRHZjhBUFNyVnVMVko1cmlLVVNNUnRYSGFtNmtGeHZlSHk5amNzVFVFREpETXp3SGRFM1JnSzgyTGJqcWVsTFNveGx2ZDJ5V1Z4WVhMZ096RWdHalVkTzhuVGJLNUF5SEp6VWQzcDBwbSszaXdsRWJISG1sUGx6VnJ4VHFwdGRMc1ZnaEJXUEl3YTFpazVwSXprNU9MYk9ZMUtWNVozWU1SZzRDNXFuZEFpWEtjL0x5UjYxTGNreVROSVNBQzNJb2dWSmc2bGhnZGpYcnhqWldQRnFlOU80bW10R3QxdUo1UEczditGZXArTHJMVXo0UzBmVllueEJQb2swVVkzWjJsSEJ4ajE1cnlWRU1WMEhYT2QzNlpyMmZ4anJPa1hmd0Q4SWFQQXBTZGRWdkRQSXE5SXlxQWpPT1JubXJocE5HRmVWNlo1eG8vaDNVTmF0WkJieUswa0tHUVJzY2svUWY1NjA0SmJ3MnNqREJtSnhHTzY0cGI2enZ2RHM2WFZwcVB5QWZLNk55UmpwK1g4Nm8yUG5YMTJ4aGpMRjNHMzM5Qit0YlNaeTdtejRSMGVUVnRmczdPeWxVUGNaVmd6NDRISnJMK05kaXVtMktxZitXOHhLL1FaSDlLNlpQQlAvQ0xlSzdEVC9FZDZzSVVSWERORklDVlYrY2NmZ0twL3RZTkcxNXBkellRcWxyUEFEYmplR09GR09jZCs5T203c3lxeDBPeS93Q0NlZmhsTlYrSWgxRndRTGF3bGZJL0t2cnpSTlppc3JwdkQ2aEFxcVNyais2VGc0NS9IODYrYy84QWduVG81aTBmV3RlOHZBanNDcXVvNXlXcjNiVU5GZGRiMCsrbVo0ekZic3pMZ256T1Q4cDlzWjUvbFh4T1pQMjJZejhqM0tQdVlhS0hmRlh3dFplSnZDcmhZaDlwdGh1czNJSk80RVlINDk2c2ZEc2EzNGQvWm44YytKTmUweFlibVd4dGJGU21BWEVrNkF0NzVGVzdmVlRxV0l0UnNFakxiU29RWkpJd00vV3VwOFkydHZjL3M3VCtIZnNoai90WFhyV05tUVpKQ2JwTWtZNmRLZUhxelU0MHVsekdkT0ZuTS9PWDlwbWE4ZjR0M3MxM0V5NWdpTnVDVDl6YndSbnQ3VnAvQUQ0TWF4OFJ0WHRudTlMbm4rMFRLdGxiSkVTODdad0NCNmUxZlF2eGMrRGtYOXA2RHJlcStFVjFSaVpiTzBqZEc4d3pBa3BrOUd4eDdjVjdQOEh0TDhGZnMyK0hYOGFlSjN0aDRodUljcWZMR0xjRWNKRXY5NFl3U0sraXh1WVJ3MUJRaHJMb2NGRER1clBtbHNibmdENFg2SjhCZEFmd3REWnh5K0xOU3NndXBTb1NVMDJBamlCSDR3eDdudDlLOGd1ZkJuaHZ3ZDRydXIzeFI0K2JVSlpaR2FMUzlNekk0VTg0ZHVuVFBYdlI0NThmL0ZQNHZhM2RYdWx3UzZUb25tTTg5N0prYmhubHR4SHpIZ0hqMU9hM1BnZjhQNXZGMTFIWlJhWjltMEdDNFQ3VnFjNmJudkpBY0U3dXJENWlRRnhqR01WODk3R2NFNjFhV3I2SG9jeWZ1d1IwV25hVGNXdG1rSGgzUWx0bTFHSWg4cVMyR0hIUFpUZ25uMXJ5UDlwcjRyNkorenY0U2wwUFNycFo5V3Vnd1NJU0FsTXFSdXdNNVhKSUg0bXZXdjJyUGp6NFQrREZuZjYvb04yamFpSWZzMm1XNGRUNUtweG5xU1QvQUk0TmZtWjhUdkhQaW40aitJN3J4RnJ1cFBOTmNTTVdlUnNrak9jZXdyMGNydzA4WFBubHBGSExpSnhveDh6bi9FM2lYVWZFdC9KZlgwN09YY3Q4eEo1UFg4NnQvRGpTMDFmeFZCYnpNQW9ET3hQc1A4Y1ZoTXJLeFVqa2RxN1g0QjZITnJ2eEVzcktNY1BLcW4wSUxBYzE5WlZjYVZCdGJKSGtVazZsWlhPOTE3d2JybmhXOHM5VDBhMmtodXJXM1NVdnVJTDg3dnhQK0ZmZDM3STM3WE5uKzBQOEYvOEFoU254R3VQTjhRYUhaTTJoVHpOODl6YnFNdmJuSHB5UlhpbnhBK0g4OHV1UTJjT2tYRTRJVlVOdkRuSkJ4Z2ZUTmVhNjE0ZjhSL0FyeDdwL3hOOEV6U0tsbGVxMTlBaE82SThCODU3RVpCR0srV3h1Rm81alF2MVI3T0dyU3c5VGxleDZWNFV1RmgvYURmRm8rYmhwbGNET1Vab3lONDlNSDhxK1l2MnhkWHROVCtOVjVaYWJlRzRoMDYxaHRmTks0M09xL09RUDk0bXZyUHdMZitITlgrTG10NnY0ZmtFcm5UcHB4SW1jUWhrRFlCNHdSdVA1MThQZkdYVWwxZjRuNjVmcTNENmxJT1Jqb2NkNjlUSjRPTkpKOUVjbVlTVGxkSEtrZGNVbEtjZGhTVjdoNVlVVVVVQUZGRkZBQlJSUlFBVVVVVUFGRkZGQUJSUlJRQVVVVVVBRkt1Tnd6NjBsQzlSOWFBUFlQZ3ZxcVA0RTFEVHBFT0kxTEt3NTlLcytEdEl2TlMrTDRoaFZ2TGE0ODJYQjRXTUFNZjZWbWZzNmhOUm11dEhlVkZXU0p3NGRzREJIWDg2OUcrRTJuaTRnMVh4SmFXalRUVFFSV2x1UXVQbnhocytuVHJYeitQZkx6SzI1N1dEa2trenFOVjEvWHZIdmloTkUwMlIxalZRZ25BUDdxRWNFajBKcjFUeHI4UGJUd2w4RDdXV3g4T3ZaelIzYzBDWEx4a0M0UGtrNVpnZm1iMnh4bXEvd0UrRU9zUGNEVXJ2dzNLVVFtZTVlU1JZeElOb0lCSjVIVWRBZVNLOTkrUDhBRGZTL3NnYU8wWGgyQzJ0TER4NUhHV2pMZVlCTGJTZk1WL2hMRmNrNEdTZmF1Q2xHbmhveGlscXlxMVNkZVQ3SDQ3WFNTcGNTTE1wREJ5R0I3SE5kZDhIL0FJb1h2dzkxNUoyeEphc3c4Nk51ZG95UG1YUFJxcmZGSFI0OUwrSWVzMlVNZTJOYitYYU1kQVd6L1d1YjhoNHdTZWxmVXRRclVyUHFlVHl5aE81K25QN04zN1Flalh2aHVLejBYVkN2MjZKRXVMY3Z2eEVjWklKd01qQkk3Z0hIYXZvRFcvRkgvQ082VnA5dDhRdkNvMTd3cHE4Zm5MY3lxUWtnWEc5UE5Kd3NxcXB5QjYrOWZqMzhKUGk3NGgrSFdySXR2ZlNMYnM0M2dQamIyeUsvV2I5Z2I5b3I0ZS9HL3dDRkUzd0MrSld2ZVhvT3RPclcrbzdFZDlKdnVrZHlBeFB5TVR0a1VmZVg2VjhiajhKVXdWYm1lc1dlemhad3EwOU56cmYySWZpMThPUGduOGFkWDhRK0cvaTFwOHZoelVyZzJwOEQ2ckp2TWtFaFlNaFp2a2x3dUFGSXlRMksyZjhBZ3AvL0FNRTJmaHY0NitETno4Y1BnVHBYMmp3WGRQNWwzYXd4YnJ2d2xkTjNRRDVqYW5PTUVuWUQ2VjQ5KzBIK3dwSDhOUGlHUERmald6aDhLNjFkRXplSFBGZW5ONW1rNnFPQ2pIZmhjTVJuY3AzTHhrVjZYK3h4KzNuOFZmMlZQSEErQjM3VW5oMXJyU0xxTTJkeEhlS1pZNzZ6Y1l5ckhLelFzdlR1T280cm5wenFZYW9xMUNYcWgxSVJyUjVaYm40cS9GYjRaK0lmaFo0eHV2Q3V2MnV4NFhKaWtYN2tzWlB5c3A3NUhOZEQ4RDFuZ3VMUFZJdHdOdnEwZVdCNkExK29IL0JXL3dENEpzZURZZEtzZmk3OEdYR29mRC94VnV1UENXc1FqY2ROdUQ4ejJFeEhDNDUyNTZnZXhyNEQ4RS9CSHhYNFE4SGE2ZFIwYVVHeHVneG1FZnlFb1FDUWUvNGQ2K25qajZlTHdsMXVlWkdqS25WUDBrL1pYOFVvNjZaTUZXUW9qcTN6RldKSzR5RDZqSSt2dlhyTm40czhUYVA0bmE2azAxYmF5T1pGa013WmRpa0ZRU1R4MXI1TS9ZejhZYXo0a3U3YlJocmtPbDNVQlFpMmVNTkxJTXFCdDZjZXg5YStxTmU4UFRhdXNPbTZoSUhMaFpuYUlGUVNNbGcyQndNWjQ5cStJekNrNFZIYzl2RHkwUHRTUHhSSjQ3L1k0OGEyTnZOdVI5SkZ4YnNOMlR2Z1lrZ0RQOTNOZmlOOFNyUnRZbXZ0RnR2TWpublpvb1dYUG1GejBBNmMxK3gzN00zalN6cy9oaGVlRWRSdFpaRWw4UFBhb3FzUVNSdVhxM0dDSk9PSy9JbjRpUTZsNGQrSStvM29qOG1henU1WHR3QU9IVW5IZkJ4ME5QaFgzY1hVaWE1aXIwVXo1ejBlMnRwdEMxR0s5QldhRzVmelRMbmNDRk9SNzhpdUtzQXY5cUdTUlJqSndBTzNyWG9GdnFpZUU3elUyMTd3dkJxU3ozVE96elRGQ2NNU2NZOWNrMW1lSmRZOE0rSU5ERjNvWGdyK3luaFkrY1JjZVlINEgwNXI3Mk1HcFhQSWpOT0tSeFd1S1d2QjViRGs4QWRxNjc0SjZKNFJmeHA5djhlTEhMcEgyT2VPOGRsSjhnTkhnU0hCQitVblBHZnBYSXdzbDlPelorWlFTQ2VvNzFxZUdackRWN2UvOEx3V3hsdXJxRmt0WkRLTnFIZ0hnOWZwVk0wbEpjaFR2OVAwL1JOVmd0ZEV2VXVZcElWa1M1anpoMXljZGVjNHJwNEoydWRISThoUzY5SlFPVHgrdi8xNjV0dkN2aW5UTEtMU2RSMENXT1N3WmdydEVWSVVuSkRaOXo2OFZ1K0g3eUsvMGVTSzZVd2xCakNqcWE0TVU5RDBzdFNiRldNM0tyUEhKeUJqYVRrakZiT3Avd0NpeDJGdktBbzI1UEhJckpzYkpmUENvU0EzRzRkQlczYzI2VC9acjZkeElMZE5nSHFhOHFXc2ozcldOMHd0ZldhUk0rV09Ob0grRlNYMmpTNkJwVFh6cVZEUmtsRDJPTVZuWG1vUzIxdmJ6V2hhT1FzQ0hBKzZmNi8vQUZxdGVNZkZXcmE5b1NXMm9tSnRxajk5R3VNOGQvVTA0clVpbzduTVd6WERYc1V1ZmtaTW5qZ0hPYTNHdFhqdmJaN241U0k5NENWVDAzUVd2STRncmw5cWpKWG9POWF0K3R4SnJrVnRjb1FVdFRnVTIwbUpYYTFNVHhUWk5maXptU1FFeHlNSGJIcWM1cTk5blh5RjJ5WjJLeEtrOHJ3S2Vxd3lsSXpJRlVTWTVQZW9aOVNpMCsrdVlyZTBrbFJ3QjVpcWR1Ty9QZnJTbEtVbFlsZTY3bFBSeEpMTElKSkQ4azNBQnFmVTdWbWlhWHkyQnhrZlQxcXZZeHh2WTNWdzhwVEU0MmtkK2VsVzd0N3hZc1J5bG8yR0N4SDA1ckNLZk1hTnB4TUh4VlozTmxaV3R6WldUTEZLbk1nSERFR3ErbDNEaTJlRytjbFpVQ24yRmRKNHJGeEQ0QjB5UkI4cG1jRU42ZWxjdmJ4eWhSSVl5ZW5BSFExNmEwaWpnU1VwTkZtK21taXNMTzBTVStXV2trQzVPTTVBNmR1S3ZKNGNoMUcxRHhwdU8zQWJQM1QxRkpIYmFYcm5oblVSTGZMRGU2V3lOYXdPMyt0aU9kd0dPK2F2ZUIzbXZ2RDByUXYvQUtra0E1eWEybnJBNWFTU3F0SEphMW8rcWZab1pJN21SeGJTa0tvZnA5SzEvRGwzcU0rSXJuNy9BUGV6akhTdG5VenB1bFdLM2VvT0JpWGVJeWZ2SDAvcldYYWVKTFM2MTAzRUVJU0tYR0JqcFNVbnlpYWo3VTg0OFFPYmZVYm1EYm5NekU1TlcvQlZ6SmFlSnJlZVJ5ZHR1WEdQVUFrZnlxSHhuRkpKcnQwMGNaTVluS2g4Y1ovei9LdEh3TkxhdHE4RWQwaUpoTml6U25Dcm5qUDYxdmg1SjBJK2lPS3FuSEVUU095OGVhTkpKNGN1ZkVGdFpGWklya2VjN1RISkJBYkFIMDVyaWJHOGU5OE1Sd014VWk2Sk9PbWZXdldmaWsxanAzaG5XL0RkbmNoL3M4MEVrVjJvR3lWV2dHWFRnWlhJSXpqRmVXYVpZTXZoQ0srTVlDR2ZxQjFyUks2TVlzajFWbEZoOWlpandpTHl3L2lOWmZoRjQwMVYxYVVOaFQ4b1BOYnQ5YVdzbWx0TmEzQWtMSmxoamtIRmNwWUNmVGJ1UzVSY0ZNNXdlZnJTNkJIU2FadmF0RGNMcFltYTJNY2JNU29JckJ1QWJpRUtyaFNHeUFSWHA5bGUvRHJ4VjhMRjgveEdscnJsaXJHYXl1RStXZGNEQlFqalBQZXZPNyt3Rm5MR3pyamVBeWM5cXlqMk91Vm5xWjg4allHU1BsclR0QXQ3Y3hyNW0zY295MmVtT2FwWDMyUVA1MXpDNzVVQ05VYkhQSFdydW0yaGEzRTIvYWRuR08xT29sWWRKTnlQWC8yZHZqRFpmRHZXb0lieXdTNnRWRHhUSWNiZ3JFQWxUNjlhNHJ4RGM2Yi9BTUo3ckUrbFJ0SGF5WHNoaERqNWdoYklIMTVOYy80ZVMvczUwblZjSWtvSmNkcTBkV3VnbXVYTTZnWWFRTmtkK0s0NVNiZzQ5enVweGpHcEdadFIyR25YbG52RGg5eThqT2NjVlJoMDZPMnQzaVFqYUQ4cFBhcWR2TTlyY2VWYUZ0cmpuMnEzWm9rOXZJNWtiS3Q4dk9jVjU3ZzRkVDBlWlROaXkrSU9vV25nMlh3ZmNhZkRKQTc1V1YwK1phNWJ4Q3BtdFlnLzk3aFJUOVV2THFML0FFZEVBVmVDU08xV0pKSW4wZTNNc081aXh5TWMxY0xRa3BDNWVhTFRPUGtoamduTE8zQVBPYXJ0S2l6bWFQb1Q4b3F6ZnhSZWE2dVRrc2NlM05VcEVZSFpnNVhqY2E5cUR1ajU2dmVNN0lkTk9wTzl3Y25IVDYxNlZMYXkzSDdPdWxlSnZOREN3MSs0aWVFbjdpc2lrSHIvQUVyelJTakFRa2RlaFBibXZjdkRuaEt3MVQ5alRXOVdEZ1NhWnFTekI5dTdhU3dBemc4WnoxeHhSVWx5TkdNcnlnenpiWExoOWI4T1IzMXJaT3F3dHRta1Zjci9BSjk2eTlDdnJtMGFZeGpKSzVVNTZFSHFQMHBOTjhRMytpV0w2ZmFYUkVFNEFrVXJ3Yyt4NmNVa0NNaEVpU1pMZGg2SC9KcnEwWmdrdVUyZkIwOFdwK0xyTlBFVjFMSkJMS3YybGk1M0VEanI5YXh2amw0aGoxblgzMGkya2sremFmZFBGYUk1eVF1Qm5uSjl2eXJiOEdSMkM2K05RdVFWUzFoOHg5dlhqclhML0VVK0h0UThSbVBRWkhsYWE1WnpJeDZvMk1MOVJ5S3FLVVhjeGswOUQ3Ry9ZRzBJYUw4QmIzWFp0cXRmWGlSSUdPTndHTTQvSE5lcytMTHE3dFZHcFdrQ2xDMnp5c0RHQ2M4NXJ6MzluM1NkU3RmMmQ5QXNiU1ZZRU16M0UyY0R6QnV3QVA4QUd1dHVmRVJsMHhOTWxQNzZlTlFzamRTeW5vZWVwNHg5YS9QS3RWenhzNWVaOUZ5SlVVaWJTcjI3djNVL1lZb0dWZ053SDNqeDAvblhyQTBIeEhyUGdiUnIvU2ZEdDFmMlduWHMxM3E4dHRENWd0WWxpT0hmQU9GOTY4bjFEVDcyenRZcExDRWhBaUdRS0FHR2NuQTl2ZXVrMGI5b1A0bC9DL3dkZmFGNFQxQ1NCOWRpR25USnlmTWhrd0RrRUh0MzY4MXZDWExWVWwwT2FhdkhsSC9iOVZ2SkovR2Q5WldxS29lTFJMZVVIeTRRU2NTRWQ4NU9PNHJpMmowRFNaWlBIR3U2cC93bGVvdXhIbHlzRmhnTGNqYW5mYnp6N1YwM2lEVEY4UldVZW42dnFyd1dpYlJKRmFINTNLK3A5T3RRd1h2d3crRXNQMjVOTEdGSkludlhNbVc5UGNnRTRIdld6eEh2T1Qxa0NwSlJTMlJrWFdtZU12SEVRMTM0aE0xaDRmU1R6Qll4SUkzbngyMjV3RklQWDByUjEvNDZhVjRWOElYTjJIZ3R0TDBtMXhhUXhCa1hmZ2hRdlRQWHI2MTU5OFRQaTc4VVBHcXlUZUc5QVcwdEJLQmJ5M3lsM2RjNEcyTWNLZUNlbk5mTy9qSHhycld2M2JTYW5mWE55MXROdGs4OXh0eU9QbFFZQTZmcFhYaHNGVXhVdWVxOU94bktjSWU3QXd2aXg0MzhRL0VyWHB0UzFLV1Zua0pFYVAwUmV3SDBIZXZNTHl5bHRyaVJKbDV5Uml2UlJQR3QvZDZpNm5FYVlWZmV1STFtVmpkUGRNbk83Z2UyYSttb3FNRW94Mk9ERXh2RzdPUXZWeGNPM1Q1cTlmOEEyTE5JWFV2aWhhRjRpd0YzQ0FjZStmNlY1SmZyNWt6U2JlUzJjVjc5K3dSWm1EeDNGcVJqSkVMU1RObk9NSWhHZnpOYVkrZHNISTVNSkg5K2ZWL2lSdFcrMngzdGpLOFRRdXhqQ241bCtiay9pS2o4TWVGTkU4V3kza2VzUUxKSnFPOXBCS1NmTUJJQjdkUm5ISEdhbHZmRWVtUzNFa01KODI0U0lreEt2S2dqcWZ6SXg3VjFYd0g4TzZyNDg4ZmFKNEp1MlJyT2ZVRVdQRVdObzNCanp4bGVEeGtWOHpRazZORnlaMzFMVHFKSTg3K0UvaDdRUGd6NDQ4Ym5UTEdPZExSTHkwZ2E2d1VWVVNNWjU1UEovR3Z6MDhZMzUxVHhicW1vTW9VejZoTEp0WG9NdVRYNkVmRnFLS3h2UGlYcU9sekdHenRiL1VkOG9pd0pUNXUwS0Nld0NaNjl4NlYrZFY4M21YVXJsdWZNSjU3NU5lL2xUY3Fia2NlTjBzaUJzNCtoeFNVcmUzVHRTVjY1d0JSUlJRQVVVVVVBRkZGRkFCUlJSUUFVVVVVQUZGRkZBQlJSUlFBVURxS0tWZnZENjBBZDE4QmIzeWZGMGNCT0M3REJQUWNpdnBUOWx2d2plK005VjFid2xwZ1R6WXRUWlY4eHlxamRrWTk2K1hQZzBmOEFpdExaQ1FBWEI1K29yNjEvWmcxYVR3ejQ2OFd4TzdXeHVaQktxeU1DZHVCbjhjTndmZXZBemE4THRIcllGYzBiTTljMC9ROWM4QzNnOElhM3BONEw0WUFobm1LeG9wQU81TUg1Z1J6K3RmUlhpYTJ2dGEvWW84V3hhM2F5T0xIV05JMUVYRG8rd2p6bWpMOU80Ym9UeFhLK0gvRjNodjdHMm1mRWZUWmJuVERJSHNOUVZRSlFHMm5oaWM4QTlNNDlSM3IwTFFmQVhpcng3K3o5OFJyQzA4YzNOM281OEozRW1tNlRQRHRraWFFaVpXWS83cWpvZWVlT2E4V3RYVW5DVDBPaW5UY2JvL0cvNDZhUEVueFYxMUxjaGdOUmNobEhHTTU0elhHVGFZQ1JqdU1aUFN2V1BqeDRYYlQvQUJwUGV1dnlYU0NXS1BxY01PUFgwelhuYzFteU95dkUrYzhLZTFmVTA1cjJhYU9WMCtwenQzYW0xbGVFYzdXd1N0ZXVmc2gvSG5VUGhCOFFJSWJ1OWtYVGJwd2t5R1RDcVRnQi9xTzFlZjZyQkxxVEc3dUl3SlNBTnlyZ1lBckxpUXd6ZVRIQ3huM2pZNk4wNmRxcXRUcDRxZzZjdXBsQnlvMU9aSDdsK0RQMnVmQ1h4Ty9aVi80VmI4V0xCdkVlajIrb1FXOEtxY1hsa0dCVkxxMGZsbGRlVHQrNlR3ZU9LNS80bi9EWHgxOEtmQlZ2RDQrMHUwK0tmd211Mkg5aytKWU40dWRMTFpJVm5YNTdXWkZPQ0NkaDR3Um12eXErRC94MytLZW1hM3AvaFN6OFh5YWZHQ0VoWlRqRWluY21lL0IvVTVGZlovd00vd0NDay94Ly9aL3VVOFBmR0RTWXIzUnRSMlEzOXcwS21HOGlZQU1yZ2paSXBVQVlJRERKT2V0ZkZWOHR4bUJiU2ZNajFJNGlsVmZZKzV2MlRQSFB3OEhnSFYvMmN2RW4ybnhEOE9mRWtlZjdQMVhBbnNKR0kydWhVZkpKSDk5WDRPVjk2K1ZQMjUvZ05yUHdYdU5lMEdLOVRVOUNtMGFlNjhPYXlsdGczZHZnQTdpTWJaVjJnT280SjVIV3ZwajRRajltejRsZUdvdmkzOE5MNlhTcmViRXo2Vll1SnJlS1IvbGZhRDkwQWtBcndmUWNBMDM0NmVGdEsrSVh3OTEzUi9HbHBMcUZ2TnB0eTFqRk5JVEpaUDVJWGVqYzlTQ0QwNEo3MXhZSEhLblhhZjNHMVREcWNibnlqOEpmZ3BwdmlLNDBiVlliNlcxYUczdDVHRnBMdGQrQWNaNHhqR1FmclgxdnBMMnRqYjZaWVdWNnpUckY1VExLM1ZObWNzVHdUeWErYVBoOXBrRXVvMk9tNm5OY3hRVDJjZHVrRUV4allmTHRQSUp3Y2NqL0FPdlgwUG9PajZKb1dpMkdpNlZKT3NOdXY3dVM0a1ozWFBYY3hPVzVZalBhcHgxWjFhaktvd1VFZlZYN0dMK0VySzUxSFdQR043R3NkcFpNNnlTTG5IQkxrQlRuT0IwN2NWK1Uvd0MyamRhSmMvSGJVOVE4TE5qUzlTMVc0TnN4ajJia1BJeUR5RHozcjlLUDJPdkUybmFiOFlkSzBKN3RKVXVUdGtqVTd1Q080NkFuSFgzcjVFLzRLMzZEWmVGLzJ3dFEwK0hUWVlyYTRsanVvaEdvVUxrYkMzSEFIc01jODFHUVRWTE5PWHVhWXYzOE16ODhmaXo0ZHZMdncvRDRpc1hWWVJxNWlsVU1OM09jZnFjWXJDbDBpZlMzbjA5OFk4c011QWNFRWZwVzE4Zkx2VVBEV28zL0FJVVdTUXdycUJsUmNjRGpJT09lUm1zU1R4Q3ozZHBjNmdpc1BzeXF3Ym9mclg2TnFlQkRjNDVYanNkU2xqSkFWOGdIQnFIdzVaYXlOZWpsMGRtU2FOaThiQTl4ei9UOGF2OEFpUzQweHRSTTJtV29DdGpjcXlFN1R4ME5kTDhDZEN1dkVYaXVadnQ4UWl0N1Jta0RBYmprWUFBK3BwdFdOWHNVeiswZjhVZmlmUDhBMlQ0ODF4SjdXM0pTQzNodFVpVlR3TWtLQm5welduNFYwK0NUVHBwRGhodklKOVBhdk10SHR4RHJ0emJSc01DNmNBNTYvTWE5VjhINlpLdmg2NmtXUlZCaEU2STNCS0U0UGJuOEs4L0YyNVQxc3RmdklYU3JhSldLakRnSDVsUDZWb3p5UTNWeEpvVm1wQmp0Mm1aMnh4d09QejcxbVc4WDluWHNWM0NTMGY4QWR3ZWY4ODFQYk9aZFd1N3d6WVI3VnVBZW5QdFhrYVhQb0czYXhwUlF6MjFuQSt3dnRYNWovU20zTU1WNXByU2hjbnNNMXRXVnRCYytHeGN5TUNxb2VPL1NzTFN4SkhmQ0NWeUl5dVFHR1BTam4wSTNlcGQ4SFhyMmNxd3ZIeGo3cC9EbXA5UnZCTjRwWXZFWS9MdE1GV0ZVYkZFLzRTaU9PSjhER1ZBN1ZkMVc5RXV0WGFrak1FR3pkaXMwN3pMc3VVd29SY0RmZHlRTjgwNTI0SGJQYXVxMGZ4OXEwZmhhNThLWEVFRFFTSVZSMmlHNWVCM3JuZjhBU0xZeE9zeGFOeVBsWWZLT241MVBZejJabWtlYVRCODBiRkFGYk9iaEc1azRjMHJFa3VpUnhhV2JmcHVZTVNlbWNWYnM3R0tTemtqdVZBV08yZGxMZW9HS252N2VLT0VTTXpGY2NvT2NkT2Y1MVYxZVN4a3UzdHJPNFpVaHNNdG5qNW1QMXJocFZHNTNPbXJUU2ljNTRsMWllOThLUVdEd2JSQk5uNjVyTThPenBjU3RKSy9DcUMzeThEM3E3ck50UERwaHdTVllnTXhISFRvS2o4TUhUTFBSN21aN3BEY3p6Q013RmY4QWxtRGtrZjU3MTY2a3BRVFBNVUhHYkRVUEFPdWVLZEMxVHhmNGJpOC8reVNwMUMzaWJNa2NKeCs5MmorSDFQYk5WUEIzaU84MFRTdnNWc3drdWJ0OXlkMUF6ak5YcE5lOFIrSFpKcHRDMVdYVGpNa2x2T2JSeXBtaE8wRkdIUXFWR0t0YVpwVmxCYXF6MlN3eWlBTXo1QkJiUEJ6WFJPYTVFamloU2s2clpRMUt4dVp2OUoxV1l6U3lEbm41VnlPd3FuWjJNVnZJb1U4eG5IUGZOYXVvcWx2RUwxcFN6TWZtQk9ldk9LbzI1UnJ2ekZCNS9Ta3J1SmRvUWtjajRtMUpZbjFYUndnSkdwbDgrMlRVM2crelc3TWRzNCtlVnRpZ3RnWlBPYXovQUJ4WlNSZUw5VVlQOHB1SHd1ZXVhMGZDMStMRmJNbGdyTGNxVEprREdmOEE5ZGJZYTNzSXRkamhyMzl0TzU2TDRpMXlmV1BoMnVqNmdUdnM5Tit6eE80eGdJeHd2dmpQZXZPOU5udWo0UHRZSGszTEhPd0M1NjEzM2p2U0cwdlNiaU5Zak0zbXR0ZTNKZENyZ0hKYkhZMXhQaDNVTEE2Qk5aWDlpQ0N4RUVtY0ZHNFArTmRUU1NPR0Q5NGl1R010aEt5RFk2QVlVY1pBckZuaEpUN1M2Y09tQ0s2QzFpc3pwMTFkenhDU1JrSWpUSUdNOTZ3NUlqRFlsSkpNa0RvL2FzamRJenJkVEMvbUU1NXF4cWs1bFdFaDI0R0FwN1ZYekZ1RGc5VDFxYStjbU9QY0Jtb1pwRlhSVDFFY0JTVDFyYzBxSS9aY3MzUlBsRlpGMkZTWEorY25HUmpwVy9iRmJTMFI1QmpjQVB4ckt0TDNUcXc2OTVpNlU4c1JFWjREWko0cTFxbW5STnAxbnJzTW01cFhhS2FQT1NyTDBxR0JHaFZ6TkQwR1ZJTk10cm1UeVJHNEpVeTVDNTZHdVZ1MFRxU2Jta0xiNm10dUhaUmxpY0FZclM4T2xSYlR6dktvTzdKVmoyK2xZTVJWZFVtU1VZQU9Sbm10dlFrMDE0TGllU056SkljQTU0VWV0Y3RhS1VUc3BOdVpWdTc0TGRQRW9EUnNlV3hXaloyMFU5bEVJaU5xa2x0M3BpdVp2djhBUjlTRUVEN3dHd0JXL05FZFAwbVcvRnhsaEgwQis3eG1sT0hLbzJMaFVjbkpISWFvaXRxRXF3S2R1ODhnZEtnMUNlMysxQllJOW9XUGFTZTVxZXp1d1ZrbEpCWmllTzRxbnFjWWpiZDBETG5GZXhTMGRqdzhWWnU2S1F5Wml5blBQVDhhOVQ4TCtONTlBK0JYaVR3dmRNMzJmVWtoV0UrV0cvZTdnZS9UanZYbU5oQWx6UHNkdHVPaHhYbytpMjlqcTN3WDFPMTNBeTJ4OHpPZWhVakhUdmpOYVZJcVRSelFWNE04OU1mbUx2Umgvc3FEMDRyUXRGa1FScTJkM2M1ck10eExGSGtBa0dUa2s4WnJXdHBCS2lZWEhQSnJkcXpPZUswTnZRYmZib092MzRRajdQWmpKejZtdk5yTm5tOFF3UkZDU0pGVWMrOWVwZUYvdGQ5YWE3NFhzclh6SmIvUnpKRVFlY3huSngrRmVmOEFnM1RUcVhqZlQ3THkrWHZJMDI5OGs0eFZ6bHkwWlM4bWN5dTZ5WG1mb1g0S3NadE4rRHZodncra2FxLzlteHU2NXhuZDIvV29ZN0cwTjBzTW0rTXE0WURjZmxJN2s0OUszdkVObTBjTmpwcVpWYmV4aFJOb0l3UXYrUnhXTnFOcmNKck50WW1CblFwKzlueGtyN0huMnI4NHAyY3BOOXo2ZWEwUjBObHFTM04zTGJCeXhoVUNSeHp5QjA5c1ZvNmtta2VJdEZ0L0NpYVdVMUJOUWl1TFc4QzRRQlJsdDJPZVJXUGFmWjNsS2FaYjdnd0htYlFjc2VLYnF2eEdzOVBzYnF6MDdSTHc2aHBxSzh6TkV2bGdTZkx3ZXZIUEZkTVl0N0hPMXFUMzgyczZkNGdYVFpMeUpua2hML2V5dTA1UDBISE9hNVMvMDJ5OFgrSTkwazVlenNaWkRiU2hjaVdjZFd4eUdVWkhmc2ZTazhkRFdsMEdYWHRWMUdhQmIrN2p0RE9neElJeXU1d3VDZHBJNHhqb2E2SDRYL0JueGhyMWtuajN3bG8xdyttSWdpU3pXUU41Q1p4ODJUazUzODRYUDRWMTRhbkZRNTJZVkp0S3h3ZnhLMWp4QjRSMEJJZFd0MVcrTUpqdFoxSUJkeW9DbjNDcVQ5SytlN1MrMGlJUHA4cWJ5WkNzcC8yczl6MkdjMTlCZnRkV2w3YkhSOUZzdmtsaGp1YnAxWElZaklSZW96bmdpdm51T3lpc05SR29hdmErWGI1M3E2amgyeHpuUEI1cjZIQlIvYzNNWTZtUHFtbFNXTnRkQVIvZWs0QjlPMmE0TFV5TDB5cGNBSklnd29IVEZlcytJcjNSYjdUcDlSaG0yNXppR1FZd1BiclhqZmlHOFFYN21GdXA1eFhiVFR1WVluWXdydFNKU1FPL3BYMDkrd2ZZMnNGbnFlb3pKbDRkSmJ5bXdmdk0vd0RnSytaYmhmTWszZXZZVjlnL3NQNkNiWHdOcmV0eVJnUXBhSWpJMzhXT2Nmam1zTTBxY3VGcys1amdvM3FNN2UvdDcvVDlWVzcwK0xiT1J2dTFrQnd5bHM0T2V1UHlyNmIvQU9DZitpWGQvd0NON3Z4dmI2WDVrR2hhUGQzOXhJdXhtaEN3bGhrZE51U2UrZmF2bW1HNC90ZlVJN3EwdGRRWTNMQVJtZUJRUXd4OHVmN3VTYStxUDJiTk4wYndQOEcvSFBqclZybFMwSGhpUzNXT0o4QXlUWUdHd1Z6N0RCeGcxODNqcTNMaDdkenR3MU51dHFmTVh4ODFPeDBmOWxqeERxVWNaU1hVSXA1WlpQS0tobmt1TWZpZUNNOU1BMStjOXczNzA0NmJqelg2RmZ0OTYvWTZSK3pSRG85bEg1SzNFTmxBdnluYTVFWWxjamsveFN0K1Zmbm0yT1RnREovS3ZyY3JoeTRWSGs0dVRsVlkxaHhtbTA1aGdaQXB0ZWtjb1VVVVVBRkZGRkFCUlJSUUFVVVVVQUZGRkZBQlJSUlFBVVVVVUFGQTYwVVVBYjN3NnVQSThWV3pCc2ZOMXI2aytGT294M0h4UHVTcmtMTHBZZklIcWdIUHIwRmZKM2hPVllmRUZxN1l4NXc1UGF2cUg0VkNBL0VQUmdvVlJlNkdZbUo3bGR3QS9RVjRlY0wzVDFjdlo5US9ENjh2Tlk4SzIxczEwYmc2ZVhkVXhua2NEQkhPY2V0ZldQN0JPdU40aHZOVThBYXRsanFHalhVTVVUS2Z1eVc3SnllZXhYdDYxOGovQUFidEJZTTZ0TGlQL1Z1cmRldU1rRHIwSDF6WDJiK3lWcmZoendUOFRORk52b0F0MnZMeUtHZTl4dHl6N01BbkhUMjY5cStPeGMvM09oNk1QaVB5QS9hViswV3ZqTzIwOXJVSzFwWmVXMlY2bEdLbmdqMUhOZWJ5MmJYMFFFOFpNbTdHY2Q4VjlXLzhGRFBocnB1ai9HYnhMWjJsb0k1Tk04VGFqYnlBZ2diQmR2anFlZUdINTE4ODMzaGRyR3lqRXJqeldiZDdqalBwNlY5Ymg2cW5oWXk4aktOUDk0MGNGcTBFdHVHaVZNbGVLNXE3V1dPNTgrSElJWUhkNlY2UjRnMDYxa2Y1Umc3ZW1PdGNUNGhzV3Q5OG9UQXowcnV3OVJQUTVjVFNjR1YvN2ZtajFDMTFHMVl4enhsVDVpbm5JUEJyOUNQMmQ1ZkMzeHYvQUdmNVYxaXhndkkwdHdsMXB3aVVubllydVcySHlpT3paeHp6anJYNXZHUU5kRGpJM0FCZnhyN24vd0NDYTJqM3V2YUxjYWFkYW1zN2VlV09GMmhVT0czdXFoU281MmxpQjB3RG5QVVZ6NXBHTUlSbWMrSGJrMmpzdjJRZkhlcS9zdS90RFhud2g4VTZySi9aTitSSllMTFBsVWM4Z0FvU0NjREdjYzE5NGF4NG5pdmZDbDFjNlZaL2FtYTNra0Vscm5BeU9BZlhyMHI0bC9iMi9aZjhUNkJxdHY4QUdQdy9kVzF0TlpxV2xzN1ZsekNxU0hBQlZSaGhrZ2dnRTRiSEFyMzM5aWY0aVQrTlBETmxwMnFYaEpscy9rUXV1NW1LZEQwd0R0OWV1YStRekdoVGRSVjRkZHoxc0xWYmp5UG9ZWGh2eERiYXV3c3ByQ1NLNHRwVlpHMjQ4c2pHUjc4RWMxN1g0cGpzWXJIU2svdENHRTNaSGxGbjVZWTY4ZHVjWkh2a1Y4cGZDLzRwYTlkZnRCK0lmaDNxQXQ3aTBodVB0Rms0QVV0Qzc4QWp2Z0FmVEZmVDl0NTk5Wnc2b2JxMkYzYUppMGQ0QStPbkMrbWVlMWNHS3BUcHlTT2ltMDBlMy9zMTJHbjZiOFJORTFld3RsaGUzdW8xRHF4RzRaNHo3NDlmV3ZEZitDNi9oNjYwajlvUFNQRndPMks1MDF4SUJ0T1NyZC9iR1NmWEZlbmZzL2VJdFdoOFJXTjdjMzYzTEpJcGZ6SThCU0dBNHpqSUg1ODF5ZjhBd1hZdFU4UjN2aG5WN2FVT2tVQ0xPTjZreHN5czIxc2Q4RUhIb1I2MXk1ZE4wODVwczFxUjVzTkkvTmY5cVhVZmgzSjRiUzAwcVJMaS9tY1NTeW1JaHR6QU54N0FmTHdPb3J3L3hpclFhSkRkeDVBRVlCSEFydWZqdHJUUWVJRTBtYlRvbmMyMFNMTzY4cUI2VnhIeEJ1YmlEUjRiY1JnSVFCZ1l5d3gycjlSNXRqNSttck01UFFqZGFwcVd3aG1BenV5Q1FQclhyM3d6aDBiU05EOFNhbEhxVVFudGJWVDVQbVlkVjVKWURISXlBTURQV3ZNL0NXcUpIcE43cCtVaGVSZGl6aGZtenhudm5tdlQvR3Z3SzBldytEdHQ4US9oNTR3dE5TbGgwMXhxcW9USExFRGc3bUdjRWZOczU1SlUwNVNleGRROFB0TGxuMUQ3Uzh4VmpNU1FwNUlKei9uNjE3SjRmMUxWTDN3MUdMaStNb2dzUmJSY1kyeEE1QTQ2OGsxNG5iMnNrSkhucWNuN3hyMmJ3bEc2K0RvbldRWmRSako1TmVmanJxbmM5WEtmZXFwR3BCOW5rc1ZrbWk1QUEyQ3NwN2xOTW5kcmFNczF4QVV3VzZldFhvSjVyTE0xd1Fxc3ZHZWdPT2xVTDVQT2hnblVuRzl4aFJ3T005YThTazc3bjB0WkpiSFMrRjliRWVqU3dwR0NvVERiZ2NEZ2ZuVTBTUTNsakVZdGdkZ1FoVnNnSHJYSzZEZm8yaDNrQ1p3SFZRMzQxdklrSzZaRWx1U29SdHd3ZVRrVnExeW5NbmNyYVJZWEo4UlJUaVg1US9Qcm1yZDlIRkZjYXhLVHlSdDk2cytCVTM2bTBrNm5DTGs1enh6MXFscS8yS082MWFUYTRFc284ckl6eG1vVHZJMGVrVEl1SG5zTGUzemRPeUFFa04wSEZGak9Fa1JGNUpJSXg2NXFmeFZCR3VpSzBIVENqbmlvYkI3ZHJ1M1dHUlhYNVF4R1R6V2xUM3FUYUlTYXFwTTZuVTdpZTMwNW5kZHhXRExFSG9LeUhkN20zdU5RaDRTNGhqQzVJSjRCem10blhDeTJjMGU4QlBLeHR4N0gwckd1OU8xUFNkSTArOHViS2FPMnVZaTBFcnBoWmNOemc5eDFyaW9LOFd6cXJ0cVNLZXJhc2JMUzFzWmJaV1hJTE1ld0dQejcxejBUVzhkOTV0dEo4cFhJeWUvK1JXbDRubVI0MVdQTGtqNVFCaXMrNXM0VWp0cFZoWkdLWWRTZnhyMWFNYlFQTnFTOThuMVNSWllvaVdKeXd5YTZHWjRKSWZMYVQ1ZGd4akpyRDFWWUcwcU1ER1JqQkZidmgyeWU5UXRER0dFY1lMcjZWbzdtTVd1Wm1WcnR1WU5MamtWU1FTZm1QR2VLcjZWQjV1bE5jcW01bGY4QWhIVDYxTjRydUpYMDBXOGo0WGVRUHBVUGcrM3U3R1VtT2NsSk9DamM1NlYxUVg3dTV4VkgrOHNqaS9pS2hieE5kVFp5R25KQUZaV3BpNy9zWllyY2s0WUU0NDR6M3JWOGNpVk5lTWhPU3h5QWExUENFdWlDNGlzYit6THRjV1VxQlNBZm56a0g4Z2FqQk4vVjRtZUx0N2FTTHZ3NStNR3Q2VjRhajhDM1ZzaHRCa3l5UEdOMlNRUjFQWHRuMHJFdjBFZmgyODFDM0IyeGFrQmtaNEJydFBpTC9acTYvSlkzVnJiV01kKzRrU1NLTVpDaEFvQkk5ZWF4dkNzbWgyM2gzV1BDK3F4Q1kzVW9raGxDOXgvTHNhOUI2bmt4VnRVWjJtYTNwVWRxc1VzUmE0bUdlVGpBNDRyRDFmeTVybnlFWVlmN3VPMUxxTUVWbnFRaFE4cW55Z1pxcXozU3ltZG5Vc0Q4bzY0Rll0V09xTGJpUVJSdERjL1psbEJBYkJxemZZanVrdDlnd295RFZhMlY1THd1RytZbm5OVzlSalBubzVJSXhTYUxnMlIzQmpaMWRTQ1N3eU1WcHFyWGpxSGxLaGNIYU8xWjExWnlXVS9rM2tMeHRrTUF3T1JuQnE3RzhndVJFR3dHWlIxcmxxbmRRYTZtaEdqbVc1Wm40alViUm1vTkhkNUl4NWtlNzVqZ0FkS2wxQjJ0cmE1US93QWIvajBvOEh6SThCamtPM2E1T1NLNXBmQmM2b3l2VVNJZFhFVU1rbHdyREI0UHIwclE4SXRIY1F2Q1RnWnl4UGFvZFp0TE11Y3NNYjkyRDNwZkM3aTJ2Ym5ia3FRQ0FPL3RXTld6cEhUU3VxdXBTMVd6aXN0YnhHMlFXNHgzcTdyRjZEcE04UnlNdUFUbm9Lb2VKTGgzMUw3UkJ3d1BDMGhrdXZzalBMaDk0NVQ4S3ZsVGpGc25tNVp5U003eU5FWFdKRjBlZVdXMTJydE02WUpPT2YxcURWUmJ6VEpFMlZqeWN0K05UNk5EQ2swbHhLb0M3c2NqcFZmV1Y4c3NZMVloL3U1R1B5OWE5Q0R2VVBHeExjWTZsSllvTFNSdklrM0tEd3g3MTNQaGJROVhUNFJlSVBHRmpjb2JTTzhoczVZczhqZU9HL1N2UFdnZVpRckVoc2NBZDY5VC9aNy9BTEE4UjZKcS9nYnhScXN0ckZPNGxWd2ZrM3FQbHlQcWZ5elhWWTVPZHFOanpuWkxCWlBFVTVXWG5QYXJtblNHWXFZeGtyeXc3WXFQVjdXLzB6VkpiWS9NcXlFQmlQdmdIZy9pSzFiT1d5UXdyYTJRamRsQ3lNT2R4TmJTczBacDZEYi9BRldiU3IyQzZ0YnVTM2VTS1NQelkyK1lLd0l4K05PL1pkOE9ueFQ4ZDlCMG1SQzZuVkVibm5oVG4rbFp2aWk2dU5EMUtQOEF0T3o0ak81WTg4TUNPMWVqZjhFKzdHRFV2MmtMSFUyakFpaUx5N1R6amovNjljK09xT25nS2o4aUtDNXNURSsydkdVYUhYcHBZaGw3Y0JVWEgzaUJXRGR5MzhVSlpvTnpTbnB5T1QvTEZYZkZHdHl4bTkxaTB0dnRMeTNUQkFoQjJxTThrWXJCWFVvdFV1b1o3YTRMS0k4T0MzdDdmbCtGZkJVazFEVStnbkpOMk83K0JXa0crajFPOTFxeEFXMGhMaG1UUEFCUFgzd09LOEt0TmExVFdmaXV0cExkU3hycUZwSTVqeVFDTjUyOEh0akZlN2VIbzlSMG53TjRoMVBUNVpDMzlsUG5ibllOM0hicC9TdkFQaUJmd2VEZmpUNExXVzVoQ1hlbk5CTXNad0N4eGpJeGtIa1Y2ZURwdXBSbTEwUnpWWktNa2oyNzR0K0FQRTkxOENvTFBUN0dLU1o5V2s4aTV5RkV4RVJZRWtjZzlza2pwWERmQkQ5b245b2o0RmFwRExiZUE3aVZaQ3Nmbnd6RUpLQ0J3VHlNWTcrM0ZmUlBncXp2dml0K3p0cjluQmFlWmUrR2J1MTFSMDJnRHlCbUdWaU1FdHRCVW4yNXJ4YlU5TjFEUVBGZWxQcVY1SHFHblc5eGNYMHEyeU0wYk9oT3lNaFJ3U0IwT1JnODEwWmJDTlhETlNXcU1LemNhaHozN1VWeDQ1OFQvRVJQaUY0eDA3VDdlYlVMU05KdFAwMjFkSWJJcng1VzlsQ3N4eUMyRGo1ajNyNWcxeTdubjFXKzBHUi8zbHZjdTBLSU1LUVRuTmZxRjRaK05lZzNYN0hYaWJSUGlQNFEwNi9XOXY3YUN5Vy9oUlVzektTKytKZ04yZXg3cmhlRGl2aDM0MC9CSk5PMUVlSmROQnMvTmlMV2tkeGd0TWhPMVZDbkhJSktnODl1bGV2ZzY4Wkp4N0dMbnluZ2ZpYVJMWFNXaW5JODRFa0lSMHgyeDJyem5YcGJZUWI0WUFIQjVZYzlhKzFQZ0I4QWZIdmlwUnAraGZCeTcxdWU0T1pIVFIzdUMyU09QdTQvSTgxaGZ0S2ZzTkxvK3N6NmJyL2hDOThGNnEwZm1qN2RhUGJwZ25hck5DK0RzNi9NdVIrVmRVTVpoL2FjbHpDcXB0WHNmR01Ka3VKVWlQM2lSdEErdUsrNy93Qmw3VGswMzlubVV5NFZyeTVJTDQrOEFQWDhLK09WK0UzaTNRTlh1anEya3VMYlRIWXpYYXJtS1Foc0FJNXdIQkk3YzE5cWZBT0hVSWZneHBmbTdWaWxMU0FNUjM3a1lyaHp5YTluRkx1WGdFN3lPazhQVzVGNUZabVlEYXBmblBKQVBBejI2VjducWQ2M2h6OWhEeGZxd3VBc21wNjVhMlpqVWN2akxIa1pBNmUxZUcyWDJVM2haTlNqbVJ6Z0xGd1FjYnNZeHpqOHVLOWQrTmw3Y2FWK3gxNFQ4QjJNcU9kZjhXTEt3VWtBZ2NEajhSajhhK1l4VW5VblRqM2FQU29RVVZKcytYditDc0xIdzk0QThLK0Y0WndWTXE3bERFa0ZMZUVIUE9PdGZDUjQ0elgyZC93VjA4V1NhbnJ2aGpTSldWbUF1cDJjT0NUbDhEZ2NEZ0RuMHg2VjhZVitoNE9QSmg0bythcnU5VmpaTzFOcDBuYW0xMUdJVVVVVUFGRkZGQUJSUlJRQVVVVVVBRkZGRkFCUlJSUUFVVVVVQUZGRkZBRSttU0xIcUVMdWNBU0E1L0d2bzc0YjZySGFlTFBDbW95QWhVQlFISFAzdW5IMXI1c2liWklyZ2RHQnIzWHdmcVluc05EdVZPR3Q5U0NidjdvZVAvRmE4ck5JYzFJNzhCSzB6N2MrRkZ6cUZ6ZHlzWVVmeTVTUWpnYnVveHovQUo3MTlCZUUvRmx2WStIcmp4Y2w0MGI2YTZTMnNVQVliWlVrM0FZQTVPQVRuUFN2bi80WFQydm5JQUJ2dWJlTjB3Y0ZtK3RlNi9BdlM5WGsxRzlqOGJhTUxPS1ZOMWo5cGNQSEl6RHR6amNNRG5IOFhTdmdLN2FwTkh1Umd1ZEh6OS93VmoweVVmdEErT3BkTnRUNUUvaWVXNmFRS2YzYVRJczJjbnA5L3dCYStRYml4dUk5TmdlZU50MXhNZGdjNUlBNllQY1lyOUl2K0NnVWZoMlg5by9WSnRUZU43YlY5TTB1ZVpRaGNTQjdWRmI1aU1BNVFISTRyNUQ4Y2ZDZjRaZUhmRmxtczNqQjd6VDNpRHhXZHJFWG1BeWZrWW4wem5QSFExOVRsdnZaZkJ2c2M4Nm5KWGFQQi9FMDhGekxEdHNSR2thN1NRQ054cmlQaUFZNGJVbFZBM2ZkSUhKcjlDUGdmK3dmNGcvYUJpazFENFpmczY2anEwS3Faa2FhWGFaTURkaGNrYnM1NHg2VjVMKzA1K3hQNFhmVWJudzNINFUxTHdYNG9zSkNseHB1cGhsamxJL2hLUDhBTXBKemdqZyt0ZCtIcjBPZXlaellqbmtybnhCb2VrM1d0YTViNmJZUVBMSk5NcXFpS1NlVDZDdnNINFEybjdRUDdQMXI1dmdxMWh1ckoyV1F5MldES2dHMDVJeUc5T09RVDFxait4eCt6YnBOdjhYN1RUZGZpVkx0WmloU1ZrMzVHUGxDdGtaYm5GZlNmeGUrRVA4QVlIaW9lRXZEenJISE5BbHhibnpJMDJxNUpLblpraFJqUEhYNWpXV1B4Q3JWbFN0b1k0ZUhKQnk2bm1Iajc0cS9GZjR6K0ZwSXZFM2k2emFDRzBlZTdzb2JZSTY3U2Z2S3FnNXpsajIrYlBhdmMvMkViR09QdzlwVnhJb0MvWWlONWY3b3cvQnllZjVWNHBPZkRQaHkxOFMrSHREbU4xTEpwNHRXdThmNnlRdWQ0VnM0YjVzZ2V1SytqdmhkNFIwajRTZkFLSHhsYWFvWXRSdE5KbFc1c1NpRXFmTDJxT000RzV6Z2tkUVFUMEZlTm1GT01ZUnB4WFU2c05keWNtZkwzdzM4U1NhUiswbHBWeExja2ZiZEY4dHpnNWNxN0FWOXRlRWRjYlVKSWxFZ2trM3FBeEI0NVBPQmpiMi9PdnorbGhYdzk4ZlBEcGtmYzhMRzFrQkdNU0FiaU8zT1NhKzdQaGF1bHZmSnJscVhFc2tTaVZBck1qdHh6Nmc1N1Z3NXRDMGw2SFhoNUp4UGRQaFROWmFINHRpdFZtTWtiekt3V05Sa2tzTXR3Y2NZL2xXLy93QUZnL2hscDF4K3pUWWZFclI5S1NLYTR2NFo5UWtSU0RNeGlFWVp2VWdLUHlyem53QmZ1bmlTSkpMb3hZdVIxNEM0YjM1emcvOEExNitpL3dCdmlHMytJSC9CUG03UzAyeUcwdGNsd0RqOTNuMTVKcjV1TS9aWmhTbDVvN0U3MFpJL0IvOEFhZjA4TGZhTDRqakEyM01iSTZnODdsUHJpdWErSUhoNlRXL0QxdDltNGxZTGdzTVp6NjVyc2Yya05KMVNLZlFsaVpUYnpYY2cydmpidXprZTRHS3gvakhhV2RqNGRnR25YeU14akFKaTU1eG5JTmZxcW5lS3NlTFRncnM4bnQ5QTFIVGx1TGU1aFlQYnovT2QzM2V0ZW0vczYrSklkS3Y5ZXN0WVV5V2MyaVNKSWpIakdlY1pQSCtQT0s4MjB1OTE2RzN1TGY3UTVqbS8xb2JrbjhUWG9uN0xuaS80VDZiOFNob0h4c0VrSGgzVzdPU3d2NzIzR1h0RElNSk9PL3lzUWZ3eldtckpxSzBUQytMUGhQd0RwV3BXRng0RG1tbXRyeUVONWx4SnV3M0dWWTlDZUQwN1lGZEY0WmVFNlZaMmFEQkRnRURnZEs0bngxb0VXZ2VPYjd3aG8vaUtMVTRkTjFDU0sydjdjL0pjeEE0VnhrOGJoeWZldXE4SXp6cGFvSmx5RUdRUGZINjF5WTdXbFk3OG9iVlkyN3J3YnJ2aWF6dms4UFNxeDA1UE51RWVRQUJDZW8vTDlheDlBZlZMTzNsMHJVbWpsR2ZsUERNTVk2VnBUNzFqdkwwM0xoNWxHNU4rQVZIT0NPOVkyaVR0ZXF6TTVEN3Z4QS9Hdk1wVW91QjdkYXBOVmRSdWlzbGxGZldrMGdINzlldkdlVFhYMm9samlpa1NNTnV3RlUxeU1XbFIzR3BYdHR1R1dSWFhBNU9LMWIvVlBzSWlLeUhhaWprTjAvemluVWdwT3dLWExHNTEvaFB6bzlTdUJMR0ZieXQyRjRGYy93Q0s1Mmd0M2R4eTAvR0IxR2E2Yndxa3NrVTJvN1FJMnNjcWVPVFhQNm5lYWRMWkhUNVl3OHJ2dVRjdlE1SE9mcFhPbysrMFhVazFUVE0zeGJjaWZSRmdSQXVFSElIUHRnVmkrRVpvYmUxUzRrZlAra2pDWXlSaXZRQjRWOE4rTWZod1p0RGJ5OWZzQXpUV3JOa1hrWHFCMlljY1Z3V2lXczBFMGR2SW1IODdJVXI5MDU1QkZielNWQnBHTVp1VmRNN1RVN3FLU3dsZExjU1BLTnFDVGdKbnVheXBOVm10N2Y4QXNtNmtsZFVnL2RicEN5cVBRRFB5alA4QU90RzQ4NmVQZ2JTcTV3RDFyRzFnSlphNnR1MEhCdGdjN3VQclhEaFV0anV4VDB1Vjc2QmRRdElwVUlMQTRPM29LcDZ0RThMUlJFYmsyOG4xL3dBS3RGY1FOOWxsS29HejE2MUhxcGxqU0tTVG5CSEZldkJXUjVOUzRsM2FHV3loUFQ1aHRCclM4RDYxTGI2NWZSS01vaXFwR2VLb2FuUEltajI5NmtaQ2wrL3RUL0RWbmNXVTkxY1hxN0pMdU5aVUdlZHBxckl5VDFEeHZFb3NSZVE0eVpQdStsUitBTHFTU2NyTSs0QVlBUGFsOFYzY2sybkZIVGF3UDNjZTFaZmdxNzJYYmhXSU9lVDJyZGFVekdYOFc1ekhqK2NqV0l5dlVEbHZ4clM4TEpCUDRxMGtENWNIT1NmcWF6ZmlCRk5Gcm0yUlBvdnJWdnc2UkQ0aDA2N3U1RmpqanhrWjU5Y2YwclBCZjdyRXh4OS9yVTBkNSswcjRhT2pUYUZxS1RtVko5TkJWeWZ2YlR4akg1MXlscm84a3R0RnFFZVJISWgrZm5nZ1pOZGw4U25Ialh3bFozc0ZsS0Rab2RrWnhnUkVESjkrU2ZvUHBYRVBkNnJwWGhwclVNVGFzNEc5aDkwLzdPZTNXdlJkN284dWswNmJNTFhMcTJ1THZ5SW9SbE1xSk1kZWVQMHJNWkowbDJTbkdSdzJhME5lMGx0THZvbEYxSE1rZ1ZrZUpzZ2lxbXBzeXpBRThDczVibTlLL0lRdzJzc0ROSVRrc2ZsSVBXbVgwMDBjMzN6Z0tNMVllNVJMTm5VNWRDQ0ZQZW5KSEhkeExNd0c1bEF3ZTFTYVJINmhxdDdxK29pZlVWSmwyb0IvdWdBQ3BvN2pGNGpLdnpCaGtrY2RhdVIrR2RVT2pIeEcxbzV0Z2RnbUs4RTQ2RE5VYlNhM2FVV1pZRjNrNWIwRmMxWFZIWFNkbWErcVNFUjVPMWhJYzQ5OFZCNFVQbGVmTUUzbER3bU90V2Rkc3hBVWhWODVRZEtyK0VkdHJlU0ZlY25wWEpwN04zT3hOUnJSR2F4cURYNFpwWTlqQWNLT21LdGVHbmVPQjdtUUJzakZXOWV0TEpyZVdTTlAzakhyaXM3UWJxYUhmYkFnbGMvU3NuYVZQUTZkWVY5VEwxbTRNV29Gbk8zSnpnOXF1MmQ0czF2SXR1dVlsajV5TytLcTY1WnkzK29qY01FSHR4VnJUN1ZZUTBONnpKSHQ0S3J4VzlvcW1qRk9mdFgyTTJ5d05NbUpYSjh6dFdmcjNpSy8xQ0tPMXVXUm9vQmlNQk1FZmxXb3R1R2h1WXJTUWxPdVdYQnJtR1g5NjJEbmtqQnJ0dzZUYlo1bU9WcEl2YUovcERLWkRsc0hHYTlDdWZENy9ETFE3NmUrajIvMnpwME56cE12STNFUGh4MTY0cnp5MGZ5Q2hpWEJBR2NDdlZQR2Vyanh0K3p0b1VBUjN1OUF2NVlmTnhqTUQvTUJudnpXN2Z2SFBOZTVjNE8vMXh0YkVhM2NZRFJjSzJPV0dBTUdwTFpRYlZKVk9aRjZxTzNwV0xwNVlTaG03ZE0xMFBoNmVKYnVaNUk5eU9od0Q3MXZiM1RtY3REbmZIODhyMlVHNlV1VDFKT1QwcjJmL2dtL3A4bDE4UmJ6VUJFY1c5b2ZueDB5SzhMOFgzTEc0RVBKMmtqQjZkdUsrbi8rQ2F1bnhXT25lSWRiY0RKWHk0eWUrRlByWG41eExreTZYbllyQkxteEZ6M3BaZFBHbDIrblhXZjNsdzU0SkJJNUJCUHBXUlk2WEhwWWVhelZuVE96YXZRK25QZnYrbFM2bks4a1Z1alJreU96YlNNZ0E4OWNVNUx5NGpsaXNIZ1FXcEJDaFJ5V3hqcjlhK09pdmRQWGx1ZGxaK01kUjhQZkNEWFlHZU5EZFMyOW9aU295VkxGbUhQYkM4MThVL3RPZkhMUmZFdnhVVFI5TTB1SzJ1OUVBOGpVNG13MGttRU8wNHpuR09DUGF2cXo0c3pUNlI4S2JDU1Z2TEdvZUlINXlCbFlvZWZwZ3VLL05qeHhxc3VxZU50UzFjeUVtVy9rWldIcHVPUDByNmJJc09xbEdYTWVaajZ6aEpXUDFjLzRKNy90YmFMOFBmSG1rZU9OZXRJNy9RdGJzdnNmaUxUMnh0dUxlVlRITkcyZStPUVA5a1Y2TCswNzhHN2Y5bUQ0azIzeEw4Q3lRNi80QThUV2t0eDRZMVY0L09odUxkODc3ZDg0Q3pSOEl5OVN2UFN2elYvWTcrS2M2cEo4UGRTMUR5a0o4eXpZUHRJYzlBT0R5U2EvUlA4QVpTL2E4MER3MzREMVg5bi9BT1AvQUlVajhUZUROUzNmYnRBdnJrTE5aeWhNTGMyc21jd1Rnbmc5RzVCejByalZLV0F4RTRQWTJrL3JGTlNXNXdHdnphOTRuK0FVdW4rSElKTmx4NHNSWGlqWUJGS3E3WVkveFpKR0NCaFFNVjh6L0dQWC9IZWsrTTdkZkVsL2NUUTZlOGNOdkRJeEtwR0g1R08zVDlEWDNWb253VDBpOWhGOSt6NTQ5cy9FT21KZHRjMitnYXJjTGI2bFpubkt2RXpCSjlxL0xsRHoxd0s4MStQL0FPeXRxM2o2QzR2L0FCUHBDK0ZiYUdMWkpkNmtGRWpNR0xLc2Nha0dRNVlESXFxR013dE9FbzMzTVhTcU9TME56d2YrMDk0d3RmQXRsWmVHOVpsdEl5cW4vUmkwWkNiYy93QUI3bnA5Syt3djJUTmMrSFg3Zkh3eXV2MlhmajNPYnZWR3RaWi9BUGllN08rKzBtOUNaRWF5a0VtRno5NkppUWV1T2hINStlRW4wN3dCNGFIaGJRYjFiNlMyaENtV1ZBSGxVRHV1ZW5KcnR2MlcvalY0aStHdnhJMDN4YkRjRzJsMCsvUzR6QXVGQVRKT1FlT25HTzNwWGhxbkpWSE9POXp2c25DelBFLzJ3dkE4SGgvd3hxdmgrVzNSSnJHOWVHUVJrN1ZrUjlqWUhQTzVTZTFhMmhRdm9Qdzg4STZZc1JaSXRPV1M0SUp4OHg3OGpzZnhyaS8yay9pZGQrTW51N2pVaUpKdFoxbDVqR0JuUG1Ucy9icDFyMGVDMW5UVHJObUtCTGF3aGpFWklBR0FQekg4czE3V1lWSmNsTlMzT2JDeFVYSm9icCtrQStJVzBpQlZrZHJxTnJkbHhraGlNRTR6bkE3ZTlldi9BTFhOd21reGZDdndWcDdoMnNyUjcyVkF2QVpVWnNrZEFSc3J4R0dmVXZFWGlDMHN0QmpuV2Z6VmlpbWpEY1pZQUU5KzQrbGU0ZnRCMm1tV1B4dDhQZUVOVnVUTkxwdmdhNFdJeWtreVRHMjJya2duQnk1L0xuRmVkR0NsajZSMHFWcU1qODcvQVBnb3A0aDFIV2ZpanBjVjdkR1FSYVVDRGtZeXh5ZUsrZTY5aS9idnV4TCswWHErbStmdmF3U0tCaXE0VUVMa2dldlhyWGppOU01cjlEcGFVMGZNVGQ1c1NUdFRhZEoycHRhRWhSUlJRQVVVVVVBRkZGRkFCUlJSUUFVVVVVQUZGRkZBQlJSUlFBVVVVVUFGZTEvRGlHQzgrSDh0NnpZa3RwWUowQi8yWHdmME5lS1Y3SDhNSXplZkQ2K2ppbEFkZE9kMVhJSEtFTi9TdUxIUjVxUjFZUjh0USswdmhSZmFoY1hWaE5ieDd0dHVvd1IxeU90ZlFud2M4U0l2anVUUzlTMHVONEh0VWpqaGtPOEhQQllaNkhIUDRWOC9mQU4yZlNOSjEyU05IaGJUVE13REFHUXFNRlIvMzFYdS93QU5OUnZkZDhZeDN0M3BMV3dYYXE5eUFNWUJQNDl1d3I4NXhUNVl6WHFmU1FhYlIwWDdmV2dXT24rTFBDZmpLejAyTnBiL0FNRlFqYUZISmdtbGpBT2UyTWRxK1JQaE5wT21mRVQ0MVhHdGVKdE9qYXowOWZPbGdWQnRtS3NRcUhjTUh2bkZmYWY3ZnlhVllhRDhOTlF1cGRxTHBkOUE1a1VxSEN6cStNaGMvd0FSNUhhdmp2UlBHbmhLMStKbXVXZncvc1JiYWZOZEpKRGF5U2IyenRHU2NjaGNuT2ZwMnIwY0JXbkxLWTJPU3NvckZhbjF2K3ovQVB0RStMdkR2aW1LNnQ5UWZURXNwTmxwYTJUYlZqVU1EdHdEMXdQeDRxLy9BTUZRL2l6cTN4NTFId1Q0ZXZmREZtK3FXdWdTWDB1dlJRNHVKWVpHS0xHU1B2S3BVdG5Kd2ZldkJadGVoT3ZXMnZRWER4eVM3UXhrYnkxV1FBSHQzL3dyNms4TmVIZkRmN1RYd2owaXk4SStMTktqOGIrSGJlVzFPbjN0K0xaTlowOW04MVJITzUySlBFeGJDc1FyTElSbklGY3VIcHpvNHYybDlEV29veXA3SDV3ZVBySzM4SGZIaHZFM2htK2xQa05iTXM5c3JCaklxamNWejFCR2VUNjE2MzhVZFJ1N2VaZmlIclBpYVM3MWpWckVSV3FNd1g3TkZzSkpHMCtoSTdjZzRyMkw0bS9zWC9FeldvWmRHdlBoUFBhYWhhTnNzN3E1bmdpVU9COHdhVGZncVFvd1J3YWdnL1pWMHY0ZnRiK1Avamo0djAzV05TaktmWWRHMDZUZmFXNEp5QzdjbVYxT1JrREF4M3IzSytZNGFuRG5iMVJ5MHNQSnV4d243SVg3TzhYaXp4UTNqRHhkcDd3NlZGTjUxaFp5QXI5cGx5TnMwbVFQa3dRQUNldGJYL0JRZjRxK0QvMllmQmgwendUYXBCTGZSdGUzOW9aZzRZSVQ1WlpkMkR2a2IwNkExNmJwM2p6d2w0YldlZTl0MmVhVmliU3dZQ05wTnZKZGlCa1FaQjVQVDYxK1dIN2V2N1NkejhYUGkzckZscDEwV3NSTVlpVlBCMnRnQWM4cU1jWnJueXlOWE1jWjdTYTBSV0pjTU5Sc3R6ai9BSVRmRTdXZGUrSmNGOXIrb1N5eVhHc1JYVE9XNk9Yd3dIUEdRMzZDdjFLK0RHcTJsbGJ3MnR6dWFQSkFDRVpicCtmSGIycjhnUGhsSzFwNGtndjEvd0NXVWdZZmdRYS9WZjRJNmgvYTYybC9aVGh6TlpST2hCNEo2OXVuUTFmRVZOUnFxMjFneTZibFQxUHBUd2xhYVA4QTJxbDNwT21ydjNBU1N6U2VZUjB6Z2RQWCtWZlZYaXZUN1R4UCt4SjRtMEdTQU41ZWpYWVZCa0hjRUxET081QzE4aytCTHdRWGNkcnFMbUh6b3hORzRJRzRaUGNkT0srcHZoaHFaOFlmQmZ4TjRHc3J3RGRvVXBTNWNEQk1pRlRqT0NRQ0NjKzU5RFh3V0xpNHpoTHMwZXZUVjAwZmlQOEFHYXpzUEVXbGFPbXN4TjVjR3J5UnllU3dESmxjZ2svU3VhK01IZ0NhSHd0YmYyRGJ0TGJwRW8zb3BLNDI5Uit0ZDErMFBZeStIYm5WL0N2Mk9TZTVzTmNpS1FJeXE3TVFRZW1RdktuTmNmNFkvYVMxdndyWUhSNy9BTUU2Tk5FaENuN2Ewa3JENWNZT0NNVit0NGYyYzZFWDVJOEJ5bkdiU1BCOWFoMXZRWUV1UHNicWtqN2R6eG5hZS9IRlZKSWZ0Y2tjOHlGU01jRVkvd0QxMTlZK1AvMndkT3RQaHNudzY4UmZzNmVETHRMNk1TUjNCZ2xWMEJHTnluUFVldGZNM2pLYU82dVJlV1dtUVdTU3VDTGEzenRVSHNNODFzK1ZMUWZ2eTNSUTA2R1NEV2Z0SlE0VURBN0d2UWRNbXNGbHQ1UE9BTTZmS01jWkhXdUhtbUl1UkVFNkwxOUs2cncwMFYwK25XcytDZDBtelBmQXJoeFM1cWJQU3krMEtxT2cxTzJWTEdhNFNZYmwrNEFjODFRMHk1ZTl2VnROVHQwRE5qWVlodHowNit0UWk1a2l1cFkySllGOEtOM0JHZTFOdUo1cldhTzdqeXJJZUIweFhtVW0wckh0VjdTZHl5Tk9rdC9GelFxeEtlVGhsNmZoV1I0ekRXMG4yU055Q3I1WEI2akZhZWdYK3AzWGlPZTh2N1lJU0ZWRkhkVFVldldFdDc0K2doVlFWK3o3M1gweG10WU4rM3MreGxVVjhQZGR6cS9DR29Ud2FXcWVheGJ5UU5oUHRtc1crdW81dGRSVVRERnlHNDQ2VnZhWnA4VVVKc1JJQTRoenU2ZHF4RXRnZGRna09NYkNUdTlhNW8veFd6b25lVktNUklyK2JTM2trc25kR1NiY0hCKzd6VnU3dmt2Vjg2enRJdlBJRGlUYmdrOFovRTFXMUtkSTdTNlI3Y25nN1dJL25VWGg5cDV2TEVqamVxbjVDZTNyNzlhVlNUNURPRUxWTEYyODFtUDdOQ3Qwd1NSdnZLQlRQRnBqdk5WaWtpT1ZGc0FEVVY1OW11ZFRQbklHWlA1aXFsL2R5ejYyWTR6dFZJZXVheG9xMHJuUldkMVpqTEMzdVJFVmVRRjVaUGxYSTRBNzFCclZ4SmJ6Q0tVWklHUDBxL1ltR080Z2tBNnR0T0QzcXA0NXRSRk1KUjNHTUN2U295dTdIQldpbEM0KzZ0N3JWZE10b29TY0JzSkdQVTExZnhBOEFlSmZCZmpiUXJPL3NaQ3R4NGVNcktpSENxcDVMWUhiUGVvUEF2aHJWOVg4SUpxdWpXYlR6UU9yZ0twSkozWi9sWFc2OThVUGlEb3ZqbGZIZmpMVDdlK0duNlhKWlhPblNLRWplQjB3OGVleE9jNTlxS3RWUnhFWUk1NmRLVXFFcDlqejN4SGFSVFdwREtNTU1GZ09EbkZjNzRac1k3ZlViaEZJSVJzWXJaMW43VGY2RkRxVnBJUHMxd205QXA1QTNIQ0U5eldMNGNoYnpKNVNTUG42RThpdStwRGxwM09DaFU5cFdVVG4vaVVYdU5lVUhJMnBrR29kSzB0cDU3SzhUNXQ5NzVlTSsxYS94VGp0YlRYZHdDNFZNRVZVOElUTE5xVmdKWEt3eDNZbGRTZmJyWExsalVzTEEyektOc1RNN2F3MXdhWnA2VzJwdCs1WFRMcklQSXlRUXZmMUFySHU3WHhIcW53MlhVclB3ODc2WkZCaTV1NFYrVlR1L2k2NDYxMG5pdnd1MnErRzd6WGRKS3ZidzJnV1JsT1FwSnlRUFRyMHJpOU84YWVKL0RtZ3orRExTLzJhZnE4c1NYY2JBSElCR0NwUDNmdzYxN0UxWkhoVW5xMGN2TmVpNXZZcllRTEdzUUFBVTU1cVBVSUk1dFVFTFNCQXc2a1V6VUVleDhUM0ZyazRqbUs1SjdkaFJxYmd6aHllM1VkNjVadG5iVDJLbDNHYmFTV05HRFpHTWowcTRrQ3BaUlNNd0JicG5vS2huaFY3WXl0NlZaQytkcDhLdU00NllIQXFaU1hLYXdoN3hyNlo0NzF5MzhJemVCWHVGZlR6YytjRksvTUc5ajFybmJXVkxYVmw0SUc3bk5YTkp0Rm0xQm9TK0RzWThuanZXeDQ3OEtXMmplRjlCMTIyZ1BtM2dZeXNBY1pCNHpVYzBXckdqakpPNU5xczBjZ3Q0Z09UakI5S3FhSS9sYXRMYnlKOTEveFBOV2RXaWE2YTFaRzhzaUlaK3RVL0RYbXRyMHZudHVZQW5KTmNITGFETzI5NjBUYTFWZ3NiVEZNcXlnWUhYTlptbFFSZjIwVmRzSVZ5UUJ4VnJYcnRvb3lGSTJrOUJWRFRMeUpMbnpaRHRaaGdBMWpUdjdJN2FqVHJvcjZsY1FSYXlXamJLQnVjanJWNjgxQ0dhMWFleXNwbFZZK1hNZnlnNDR5ZTJhejlWZ3pxUVlnWVlnNDlLMnJUeFZydmh2UmJ6UmRQMUJJckhWSUJGZXhUd2h3L1RETG5KQjU2akhldGxGTkl4bFVuVHZZNSt5bHVielNaWkN1ZGpIZHNISkg0VnlvSSsxTmdZeXh3UHhyMTZMNFpYMW40Y2p1OUMxUkVtSHpPNzh4dXJEb1NlTytLOGllTjR0Vmt0bUEzTEtWSkJ5TTVydXc3VXIyUEp4aytaeFJhVndzWWpaT1YvaTlLOVErRldxMk9xZUZOYjhKelEvTWRGZTZnQllZWjQrdkhiNWU5ZWFYRUo4eFVDNUJHRGdWMXZ3NzFQVWRDa24xNnppUCtqNmRQSEo4dVFxdWhIekhwam52MHJYZGtUYTVEbEk1cERJSEtyanRnZE85YkduU3BiUnZkUmtaVlNjZTFZTU1tNXdzWjVJK1lEdDdWc1JReXRwODRnQitXSThnVjJyUkhGSjJnemtQRTE0Ymk4SzdBUG4zY0QxcjdWL1laOElhWmIvczZYdXVhZ2pKSk5jdXdrUTRKQXgvOWF2aUxWQVpMOEwxT0FEejFyOURmMmRkSGk4TS9zNWFEYTVJTjhESklweHlEaXZDNGpxV3dzWTkyYlpkSFZzdTYycVJXU2FYcFR2Q0ZVRkhKK1lzZjgva2FvNk5mYXJOYWtYMTBFZFR0WlNveVJ4ODNIMHJRMVZMaTZ1N3A3cUZVOHE2SVFnRERJT21mb0txV01kL3FtdldzTWR1dmxxY0tjLzZ3WXh6MjZIaXZtbzZRUFVlcktmN1UxOWRhUDROOEk2TDlxZGl1alh0ODVjNUc1M3dEd2ZSQitGZm5WZXhFM2JTREozTVNmWHFhL1F6OXVPUDdCNGtHbS9hUVA3RzhEUWdvU09TNmxqakEvd0JvVjhDVFc2eW9aQXVDUmc4ZGU5ZllaSjd1RXVlUmpJODh4UEIzaVc3OEthM2I2MVl5RVBGS3JFZzlzLzhBMXErN1BoeGEybng5OE1hYjRtOE02d2xsNGpGb3NjVjN1QVM1UFR5WkIvZTkvU3ZnVzZ0VEJ0SUJ3ZTJlOWU2ZnNXZkdLWHdqNGhid1BxbDR5V3Q0d2V6ZmNmM1V3NkVjOVRtcnpiRHVwUjlyVDNSbmhLcmhMa1o5RjZuNHo4Wi9DblZVMGY0bmFUZWFOZG8yMk83SmNSVEhPQ3l2Nm5GZERmZkVxNzE3Ukk3cWJ4Tk5lblp1aExYRFNucjBCNktlRFh0WGdYeFg0TitQL2dtTDRYL0hhNDArM3Q0UGx0Tlh1TlBXZGhqaFVreDgrd2tuNWhrakpOZUUvdGUvc1FXdndZanVialI5QXY3YWVLekYxYkpwV3FIeUwrRmgrN2tnT1NIamJuREwzQkJBSUlyd01OU3cySWQyclNPK3BPY0Vac1hpUFNkTDhWZjIxcStzcENiZTJWVEU4bytaajF6emtqOEs1NzQwL3RkK0dmQ25oNW90TzBoWkpaLzNiU0pjN1NRUnlWSDB6WHlQZS9FN1d0T3ZKbmlzbWptRGtFWGNyTzZZUFE1N2l1VzFyeEJxL2lDNk43cXQ2OHpuZ2Jqd0I2QWRxOXFoa3k5cHp6ZWh4VmNhbEhsaWZSMmtmRkMxK0pQaXZSTkpzOUxlS1A3Vkc3UlRIUDBBeCtQNDgxOU5lTUxSYm0yaVRZUzZxb0FYSTkvNlY4aS9zcTZJTmI4WWVISkdVaGttWU14NHlBY2ptdnNYeFhKZEpxME5oWTZhWjBaRVlUUmpPNCtuNWsxNCtiU2o5YVVWME96Q1g5bGMwUGhsNFExZlUvRUdtZjJacVpqbWl1NGdvRFkzRXNCK05kaDhlOVR0ZkVIN1cvaVMzdkhHM1JQQ2l3QWxXSURIeTFJUFBYbkI5YzFEK3pWYlgrby9GblJOTGppTVplL2pNaGNZQXdTU01Hc3pWNUxPKytQdnhiOFUzVXU4eTZoRlpST1Z6Z0NVTTNJNHh0akFyaHdmdjVuRy9SSFJVOTNEcy9PSDlyWFcxMTc5b1h4UmN4N2drV29ORkdyL0FNSVFBWUh0eFhuSzlCOUs2SDRzYW9kYStKbXY2cXpGaFBxMDdiditCbXVmK2xmb2tQZ1I4dzl4c25hbTA1K3VLYlZDQ2lpaWdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUs5WStCTHJlYWRMWUU4bUtWUWZUS0VWNVBYcVg3UEU5c3R5NlhTZ29YMm5qT004ZjFyR3VyMDJhMGY0aDlYL3M0NjdkWC9nUHczS3QwVyt5bVNCd1c0NUhIcDZWOVcvQnpVVjB2V2JXZldJWEpjb1lZaXU3bkk0L0t2aUg5bTdWTG5UZkNFeVJzemZZdFF5RXowd3hGZlpQd3MrSTZUV2NFNzJhenVvUGtxeW5JWThqQUlQNlYrYlkrbS9hVGlmVVVta2t6MVQvZ3BFTmQ4WGZzNytFL0dLV2tVY1drNnRQYlN4Uk1GTVlraUI2OVFkeUhIWURGZmtoNDkrTEdyL0MzNDZYMGtjY2tIa1RwNW9CeTJNQW5yMlBwN1Yrd2Y3UXN1djYzL3dBRS90UzFHL3N5ODJtK0pyU1JpUVFzYU9HWEo0R1I4M0dlMk0xK09IN2EvaHUrUHhGYnhuSEFYZ3VMRzFXOWxRTHNqbFpHMmRQN3dRNEo2N1RYcmNNUWhXd2txTSs1d1pvdVdxcHhQcHI0YmZIendEOFgvQkwrRjd5L1MzTnpBSTRpa256bzRPUVJrODljWVB6WTlhOUUrR3ozM2dMVG9ySFIvRkN5SnRLbGpMdFU1N2hTY0E0d08xZm1Cb1BpTy84QUQ5NGJ5MUlZNElLc1RqbjZFWXJ1ZkIzeEk4ZTYvZWZZTFNlZmE3Y2VYTEljZnIycjBxMlRUcDM1SmU2YzlIR0tkazl6OUxwL2l0UEZKY1gvQUlsOFdReDJ5UkVPOXhlSGF3SzVKNUl4MHpnZW1PbFozZ3Y0N1hIajI2dWRLOEgyVnpyZGlzVENhYTVUYmJuNUJ0TzdBT01qSXgzSEk1cndmNExmczczSGpUd2pMNG0rSlZ4TmIyY1VpazNGMWNPb0NLZlJoODJRZW9IQUhTdnFidy9xZnduK0VId2Z1TmEwMkdMK3pMSzNTVzRtYU5Ca0lONGpVRWZNR1lxQ1I3MTRsYWhRakxsM2tlaEdjN1g2SGtIN2JIeGEvd0NHZXZoM1BvWDlxTFA0MThTVzUrMWxUajdCYnRrckFnNm9SbmtlL3ZYNXFhekpOUGZ5M0Z3eFo1SkM3TWU1UE5lei90TC9BQkYxSDRyZkVlOThiYW5xTHp2ZXo3bU1oNkU4L2h4Z2ZoWGozaUNNTGR0c09WQXdEOUsrcnlxZ3NQUzgyZVZqYWpxTXNlREptVFVHaUhSbzJQNlkvcWEvUzc5a0RWYmJVdmh2b1R6TzQyMlN4c3l2emc3bFA2VitaUGhXVXhhM0VjWjNaR0Q5Sy9RYjloZlVsdWZCR25lWmtzc1VpQmNjWkI2Zld2UDRoaGVDWnBsOG1qN1E4Q1gwVUZ0YndXa20rM3RZaEZFWlhMN0NNOCsvK1JYMlorelhmYWQ0ZzhFU1JRMnlSVEMxZUdiQ2hBd2FQQXh4eU1ldnFmV3ZpUHdyZmFhbDNhMlpSVWtsWWVVVlRLN3dRT2c3RDFyNnovWmkxclZ6ZGkwMC9UaDVUbzZ6YnpqTW13a1lIQSs3eGoxUHRYNXZtR2xJK2l3NzVwSDVMZnQ4ZUc3MzRiZkdEeFlOTnVnVE5jMnpxWEczNVM3S2VNOEgxNDVyNS9tdFFieHJTN1FFdXVGUEdBU09jZTFmVzMvQlMvNGY2M2VmRWZVcjI2RFFDKzBUejFWZ0FRUTViSk9NSDJJUElOZklGenBuaUt4MVJJTHJkTklGUWZMeU1ZempqL1BGZnBtVTFQYVlDRXZKSGkxMXkxMmgvd0FVYnNDWFJZSEJJanNncFlrOU0xdy9qZTR0aGQyY1N5bmFHQndEMHJ0UEgwWmxsc1UxQzNJOHFMN2pEQnhYbkhqaVdLUFY0Mml6dDR4NzEzTlBtRzdLQjBPcTNOcHExM0dGdDRpME1ReVNoVW4ySkg4NjJmRGVwK0hwamJ0SHBWekRjMnBKRXNOenZqYkl3Y2hoa2RmWHRYSzZIZHhPMGtrN0FIeXVNbnBYUmVHa2krd2VZWXVlZTFjMWJablhobGVTTmFLT1NYVjF1RGRncVd5d0FwMnJPbHhxWDJlMzI0R0Mzc2Fib015M0NQR2crWld6bnBpcXR5MnpXNWlqN1FGcnpJSzlVOXVzMUdraTVwZDRXdlo1SFE4RUFGZWd4VjNUYzMzajBUQ1RKV3oyaGg2NHJOOFBPRTAyYWFRZkx2T1NRU0t1ZUZOaTZ3MTRzdUMvQU9LdVQ1VzVHY1h6UVVUdHJMU0dGMDhtN2hMYzg1NXpYSzZZSnBkV0RUSDdxdXE4ZE1HdXkweSt0M3ZHaFE0SmhPU2VuVCtkWTE1bytoYVpCWXphZmVURzlubFlYU3ZqWW96eHRyanB5dTNjNjZudThwbTYxYWZhTEtlVmpob2szRVo2VlN0dE84eTJpdXJlNVZXMmo1OTM2VnFhOFA3UDBlL1dlVUZpbTFjbnFQclVIaGp5VHAxdElZQnNJQ3R4MzYxYzAvWjNFMG5WS1YxOW9zdHpyWkc0Y2dFc3ArbFNOYndMSVRJQUpXdHlmY0dyL2lLMlcwblNTSmRvQXd4SHNheVhlTzZrTHFTZDN5aGhuZ1VxYXVyb2lkK2F4QkNseERBSlRJUUk1aGdEdFNlSTVKTlUxQVF4ekswWVRzUFgxcXl4dDdhd2UwVExneWZOanRXWmZ6S3JMSkV3WEl3RFhiUmpaM09YRS9BZlFYN0RuaXZUU0p2QWVwYVNoQXQydVJkdmpMWUtnakI5QmtmaWFzZUkvQXNWejQ2dGY3ZGgrMERWNVpwM1ZnQ2lydTJxdUJuSXg5T3ZXdWUvWkUxUHdscXZqQmRJRHRaMy93RFpzaXZISSswVEVua3BqcWZhdlZ2Mms1MytIWGdoUEZPa1FSaTRzaDluaWZCQURTTHRCNUdEZ3FUZzk2OHJGS3AvYVN0MU8zRE9IOW1OTThQOERlSXZnOXBHamVLdkJHdktzRjFZNnhjcllHZFdCbGl5UXUwOGdZUHZYbE9oUksyclhjOEV1WXQ1OHNEcGpOV2ZGL2luU1cwTDdLTFJaN2xnVExJVXdRMmNrazlUeldiNEV1YmcyenBKRGdsamxzVjlQTy8xZXpQbDhMRC9BR3dxL0dGWGx2bWRlQ1c2NXJMOE1NeVQyOXV6SExMeXhOYlh4ZWdlRm1sM2NNM3BYUDhBaHBMaHRTc0pBQ1E4bTNINEhyWG5aVTdZV0ozWmxyaVpIb21sWCt2Nlg0QjFIUTdabGExdjlTVUZ5Y2xRQnlQWEJyamRjdGlsOWJvU2NLNElZK3hydWROMUEyM2crTzZuakx4RytMR01BODhjL3dDZmF1UThWMzFsZFR5M2xqa2NnN1c2cCtQNDE3VTNlSjROSkpTWnovakswdG9mRkV6MnQ3NTZ5YlhKQTdudFZPNXQ4NEJidHg3VloxaUkyK3FKQzZCaVkxWkhIb2FqMU1HT1ZSQ3U0RlIwRmM4bWRjRllxYXE4OXBieFF4SE80L054bml0ZTFTQjlIalplcXN1VDZWblhDUVhNWHp5Z1NLT00xcTZKYmc2U3FkdzNldWVxN1JPbWhyTVhUNExWNVdKUWdqY3B4MUh1S3QzdmlLNjFYdzNwL2hxNkViQ3dkdHJPUG1JendQZnJXZlozNVcvdVU4dmduZ2luM0VadWd0eHh1R0J4MnJCdG82dVhtUmRubUxRbzF3d1VLb0dNOUJXZlozaUxxelQyVGNBY3RpbDF4blM0amhZbmlQaXEvaHRWYTRtY3JraHVBUjFweGl2WnNUazVWNHhSYTFtNnVqRDlxTWdZWjZVdWsyalhWMGdrWWJTZ0lJUEMwN1VJMnVWbGpnaTJqNzJDYXJlRTVESnFxNFlsSUVPNEU1R2VhenN2WnM2TlZpRmNzM3NWdC9hd1dBczRUcVNPOUdvWVczbWpkUmh4bE04Z1V0MUlpYXMyQmd0NkNxUGlPOWtGdVMzQTNEQkZUQzdhUnRVNVZGdG5SRHh0ckVmZ3R2RG9XSVJoQ0EyMzU4Y2Q2ODBVT3VwQnU0YzlhNmlXUTJsc29ETVZaUjh0Yy9lUUMzdUJJV3p2NUFydXc2NVcwZVJpNHg5MW90eGIydWQvcjB6MHJ0L2d0NG0wZlFmRmQzWmVLdE1GM3B1b2FMY3dUMnVCZ3VZenNjZTRiQnoxcmtZV1JJRjNMOG9BeVQycTk0WWdaL0Zsb3NmSmtZZ2M5Y2cxdlQrTXdxcTFNNTZPQXBjTWl0akJ6ajFIRmJNODBVV2c1aW1ram0yOGorOVZDZXpNV295ZVQvZklQSGZOVzlZUzNoMG8rUktaUGwrYmpHSzZ0MmNUdDdNNHlKWkx2VmtpWUZtYVVEOGMxK2xIaE13NlQ4TlBDZWh5UjRNZW1SdVJqMUh2WDV5ZUNJRjFMeHRhV21OMjY2WHQvdFlyOUlkVXQ1TENDekFCWkxQU0l1ZzZmSjlLK2E0bG5yVGdkdVhMOTIyWVdwZUpOSzFtNW5nMCsybkNSU2tOdVRINVZmOEFDbHRGY2F4Wm1OVzNQTW0wWXdNazR6WE4yT3N5MmxsUHFFOERMR0dMWjQ1Lyt2WG9Qd0VzZitFdThVYWRienB5OTVHUWNEUEJ6anIyRmZQemsxVE83YzhkL2JsMVJQRVh4ZzhVekNUSzI5c3RxZHA0QWppVlI5YStQWDAyRllSRm41d3h3VDB4WDB0KzBUcmtsenEvaXpWN2tncmNhbE9JM1BKTzZVZ2ZoZ1Y4K1hPbnM5dUxpREdDaHdneG5BR2Z3cjdiQUwyZUNpank2MnN6bGRSUUJ5cktPRHo3R2p3OWV5NlhxME1saTVFd25VeE9Hd1EyUmptbmFvWERGbndXejBOWjRKOHpLRWc1Nmp0WHBSWE5Uc3ppZWtybjZJL3M4K001ZGYwQzB1TlQzTGMybzhtNGpmNVNzeWRSZ2Q4MTlsL0NMVlBDL3dDMlI4SWJ2OWs3VzcrM1R4UnA4YzEzOE10V2xPM3k3ckJhWFRaR1BTQ2Zia0RQeXlBRWRhL1BqOWxyeFhhcHJkei9BR2hBWFMvc0xPN2taa0p6SVl3c25ROFpLNTQ5YzE5RitHcFArRVcxclRmaWY0Qmx1WWI4YXpHeXJHU1dqOHRzcXc2a0hkN2Z5cjRYRS83TmkzeW5zMDdWS2FUUGpmOEFhNi9aazE3UTExSHhSTHBIOW1YT2pYTHhlSUxLV0xhOERJZGhZcU9TMi81V1A0MTh0bFBud0Izcjl5LytDaUhneTArSmZoL1FQMnVmRDNoMk45TzhhMkg5bWVQTFNHUDVJdFJDYldaaHdCNTBlU0NmNGxyOGZQalg4QXRjK0czeEFrMFRSN1dTNjAyN21KMHE3VUZneUhrSXpBY01vNi9uWDErV1kyT0lvYXZWSGxZekR1RlRROVYvWTYwOVUxM1RMcWFNSFpadXk4SGhzOGZuWDFNZFNuczVvTlhDRVpiYWlad1R5ZWNmcFhnMzdOK2lTYWZvdDQ4VWdUK3lSYVErWXUwdVdiSlpmYm5IMXIyUXpEVjVvcm02bmtsVlB1QkZ3QU9NNDk2K1R6QmMyTGxJOVdqWlVrajNMOW1hMHVaUGl2cDJyeXhuZENzc3JGVXpqWkd4emdESDQxNHRvdmpHM2J3bjQyOFFTc3l5M3V2MzA3dXlNZHdTTW5uMVBOZTgvc2thMWI2VmJhOXI4c1NnYWY0Y3VtamtteHUzR05oMzZnNXI1MjhWM0duYWQrenZyZC9DRWpaN2JWSjVXQUl5V0lYSjkrbjYxT1VKVHh6ZllyRlhqaG1mbkZxdHd0MXFNOTJwUDcyNGRpRDduTlZpRHhnZE85T1lESUlQSko0cGNmTDAvR3YwRmFKSHpEM0kzNkNtMCtUb09hWlZBRkZGRkFCUlJSUUFVVVVVQUZGRkZBQlJSUlFBVVVVVUFGRkZGQUJSUlJRQUQwRmQzOEY3bHJlK2Qwa3dWY0VEL1AwcmhCNjExZndzdVZoMWVTTnpqTVl3Y1ZsVzFwczFvL3hFZlIzd2FrMUczdHZFK242TmFDZTVXNFo0SURqNXljTUI5ZVRYMWY4QUFhT0syMFN5MUxUbHZJNS9rSlc0a0w0YkFKemtjWXdlZlRGZktId1J2NHJEeDdxS0tTaXoyc0U0Qko1d0JuOGVLK3NQaHByVStpZURIMWkyMFk2a2ZPWUMzUmdIQ2x1U0R6MC9yWHdPWWFWcEkra3BxOEV6N0R0NE5OOFdmc1ovRURRL0VjNlhLTnBUWExiaytVT20xZ1Z4ME83UFhwWDVnZnRWZnN3K052aXI0VHM5VCtGeCsxWFJzOHphT1pOdjlvUlJ5RXFZU1NBMGlOSXdLRGpZTWc5cS9UbjltdDIrSWZ3RDhVNk5kMmtrTW1vK0g3b0Mya0cwb1RFU005T2MxOHFmRFB4RGF6ZkQzL2hIdFNzRW1mVDdvU3h5SmNsR2lpSUtTWUhKWWQ4RCtJOGc0cDhOMW5DdlVqNTNNTXlpL1pSWithVnYreXg4V3JlVXI0bDhQTm9xam9kU0lWMlBCQUNETGM1NjQ3MTlGL3M2L3M5YWFtaldHcFE2RWtLV01UU2E3ZU9BL21vQ1J4azQzSGpqc0I5YTZQNHpsdkdQeGl0L0JHZ0xNa3QzZXJERTVZdTBZKzZRYzQ2QVpJSEhUcWE5L2s4SHhlQlBCMXA0STBIU0ZUU1k0UDhBUzdoWkFubXY5M0o1Nlp3ZnpIYXZZelhNcHhqN05iczQ4SFFYeE02SDRhL0RVK1BmRDBLWFhsdlp3SVBMc0kxL2R4N1Q4dkdUODIwajJyNTYvYnE4WGExcHEzSHczMDBOL1p1bXRpOUVKMmplQUIyNDJnWVAxRmZXSDdLT2hlSmRROFIyRWVtYTJQS2ttaVJ4dUdTQ1JrWU9PUGxHRDNKOTYrUmYybXJxYTE4V2VKYmZWSWl6MzNpUy9pWmprYmxXWXJnOVFCZ2RmclhrWlRCVnNkYVhROUtxN1VuWStOL0VGbmEyc3FQYTNmMmxTQmx3bUNEZ2ZLZmV1VDF5QldET0JqQjZHdlIvRmZoK0N5V1pUTjE0VlZPUU9BUVQzTmVmYS9hK1NoYmRrNDV5SyswcE5YUEZxcHRHYjRlSVhXN1lFOVpnUHpyN20vWUoxK0N3MGxkTXZHQUZycVpIenFlalY4STJzeHRyeU80SFZKQTM1R3ZzVDlqKzl0N25WYi9Ub1h3ODl6YnlSSEpITFlQSjlPSzh6UDR0NGRNMHk5KzgwZm9QNE9YN2NIYU4yeEtyUnJMZzVVSElKWHNEODJjKzFmVG43TGwvL3dBSTE0ZldHUFZaRm0wK0ZoSGR5eGxtQlZNQXQyOU1mUSt0ZksvdzB1TmJoa2plODAxSjBiT1BKbHlGNXdQME5mU243TTNpZlQ3L0FNZFcrZzZqR3NIMjJMRWZuNEN0MEJKNUFPUndCMk5mbCtZdHVpejZYQ1c5b3JueWIvd1Z5MEJmQTJ2V3R6ZHpOTzF4b0VTZWFVR0NXVmlRdU94WnNnRTlNNUhRVjhJYWZmWE9zaTN1ZEpqS2kwaldLY0U0WldYakdEOWVENjErb24vQmFid2ZhWDZhTnFOMUFva1MzaFZTUVQ4b1lrRGpnSEF6eHhnR3Z5ODhlK0hydlJ2R1dwdFpNMGF6eTc4THhuSXorVmZlY01WUGE1VEJubVk1Y3VMWko4UnZqVHFtcmFUWWVGdFg4UGFWZXdXcUR5cncyb1M1WHA4cGRldmM4MTQ5OFZOUE1GN2EzOFNZU2NjWjZWdjZ5MXk3TERJbU1uZzRyTytJMXkxMVpXZW15cUI1T0dEMTd5K0t4ejFQZ01SRktXMkZsd3hIU3U2OE5vcDBDRzdzMUxydHhLajlRUjNINjF3bW02ZmNseWR1NEFjSHNSaXU5MHBXcy9EK3lOdjRlbitmcFhQaWRqc3dMMU4zUTdEdzljV2JYTnRjeXhYRGRZbkdReDRySHZHRnJxTHRkTGdub0NPYWwwQzZsVlVubUdGODdIc0trOFlxdHpmcDVaemlNNUsxNWxPMGE5ajJxeXZRdWl2NGZ1NXBkUDFDTkp6NUt5Z3JHMkNLMGRRdVBMMDVMblQxMnk3bENrY1p6V0o4UG1paTBlNGpualp2TWtQUFBTdC9Tck1UM1NzKzdiRXdiT0NBTWMxMVY0M2VoeTBKMmhxYlVXdTZnTldnMGxyTlVhS0FNOHErNEgrZnhxdGRYRTExcjluYUE5Smw1UDQwc2VxUTMzaU81bWsycVJFRVVFVmt5eUsvamkyZnpkdjc3ZHRCeGdZTmNQS2xKbmE1YzBFL00xZkgxdnZ0WjFkanVEOGNkUHdwZmgzRkROcHNkdk5KeWo1NTdZcUx4ZXNyUnV0dmNaODJibFRWTHd4ckVHaWExTEhKR1Nvd0JnWndhVTVYb0dtaXJYTlB4QnE0WFVwNGJ5MWJZcllVNDZqaXM3VHBkTVc0OGdraGcrV1gyN1ZiOFIzOXRxY3l5V3luREg1Z2UzRlkra3hpVFVicWR1TWNLM3BUbzI1RVpWWlAyaGF1Yk54QlBjUlBrZWRuQTY0ckMxYUFQY3hwdUlQM2dBZmV1Z1NhV09DUllNTGo3eGZvZWxZYlJTM0Y3Q3hiNXR1M0dhNjZUc2N0YlZHaHBTdmJYMXJkMjB6d3pSRldoa2lKREtSM0dLdWZFbjR2L0UveERleGFSNHI4VjMxL2EyNUhsVzl3NHhuams0Nm5xZnFhanRvRC9iRnZHb09WNURBVmsrT2JXZUxVQmRzeGJjdUJ6NlZWTndsVzFSbk9FbFFhVEh5K0hORzFUU1o5U3Q1U2pTTnVNYmNsU1I2MVY4S2JiSzJjRERqek5vNHFlT1hiNFdta1VmZEdEazlQcFVIaE5CTnBHMlArS1hKeWVsZGRXWDd0bkpRaHlWa0w4Y0pvSjcrZUNIZ1F1aUU0NEp4elhMYUZyVFdkOVp4d1c0ZnlwKy9ROFlyb3ZpMmtqdFBOdHlHbFV1Zlgzcm12RE5qRExyR25DZTUyQTNxK1lTZnVqMXJ6OHMvM1dKdm1TU3hVajBXMnZ6cVB3eDBYUXRCZzg3VUw2K1pmTFRCWlNDZXZIVG5yNlZ6SGpMVGIzVE5WajBON0tPTjF3azBzWnlHT09SV3Q0Zm0xRHcxcXRycjJodDVnZ25ZUllCWUhjU01BZjU2MWorS2RjbXZOY25XOHQzamxlYmV4a0dNSFAvMTY5cVY3SGcwMnVabUZxeGtXNUVlTjdScnN6MTVxdmR0TkZHanJ5VDNyYThTWE5yUGRSM2xuWjdNeEFTQUQrS3NnbHBJdWNaUnZsQkhXc0dkY1VRc1k1WkZEcUE1SEZidWxySEhwb1U1WWc5QlhQYWlTalJOQ01NWDZpdGpRYnFXT0Z5VGtuMTcxaFdpMmpxb1dVaUMzU0grMFppQ2VUMzdWWXQ0MmlzNVpaemxRMlFEMkFxbEhjSW1xdkt4eG1yVTBkNUxwc2s2a0JRMlFCM0ZZdmRIVEZ0SjJLRnpMYzZuckVOdloyRHl6U3NFU0l2OEFlUEhmL09LMDlKMCs2MFM2bjAvVmJZd1hDeWZ2RTM3aXArb3BGK0lsOUg0Sms4SFEyRm9nTXdranV4RVBPSHRtcU9odmRMUDV0enVMTU4zemtrMXRVVnFkam5vWGxXdXkxcXJ1RVpWSkRFa1o2VkxvZGxCQ2dTRjlyT01zZldvN21lSzRrZFdHUGxKNXFUUTVJb2pHWFlmTjcxelRkcVo2RWY0dHlLKzgyUFZsaVdYSUgzaUtxZUtyTUpZQ1pHNDNEaXJlcnhHRFZNZ2ZJK01BVlgxZVlKTkxiU1I3bFVncXBxcWU4U2F6U2pLNHBranZMWkl3dkNvQitOWXV1aFh1NFlvRkc1T0Rub09hdTZkUE1kMlcvQ3MyNmRwTDh5Ri9tQk5kZFBTYlBNcnlVa2RKNE0wRzQ4VjZpdWhXeUF5U0xrUXFmbWNqSEE5U1QyclIwZndQNDg4Si9FYlRKZkVXaVhGcHA5dHJzTnRjWFZ6RHNFckhKS0RQWGhUMDZWenZoelZiM1NOV2kxVFRycG9yaTFtV1NPVk9xdGtjMTdsKzByKzBCNGc4ZmFGOFB0TThRNmJGREo5cmE4KzFRdGdPM2xpSWxobkc0bmtudm4ycm9wL0VjMWVUNVR4Q08yRnRjTTA1NWNzUUQyeXh3S3E2eElpYWU4YnRqSTRIOHEwcFRGUEdpS2VZeVZjbnFTRDJyRjhZRlV0UVVIT090YnJWbkhQNEIvN1AraFBydnhlMG14MjcxZStUY01kUnV6bjlLL1E3Vzc2VzdsMVdMemZMaWd0RWhSOGZObkdPOWZEdjdFV210ZS9IdlRKaEVYV0F0SWV2R085Zlhmam54SGNOWlg5eThld1RYUVVnY0U4MThseEMrZkhRWFpIcllDTnNLMlAwbnc3SEpwTTF1czVsamRQbVFuTmVrL3M2V1dtK0Q5WWJYNUgySlphZGMzaHpqSjhxQjJ3TSs2L3JYbCtoZUlYczdRekFxUXlnUksrUG5PT092MHIwRFFYa3N2aDU0cTFWSkFKVzhNem9tRGdabDJwZ0hnRDd4RmVSeU9VbEh6TmIyVno1RytOdHpxOTNvTW4yaTA4bzNQNzFzb04wbVFXendPbVQvT3ZLZEFOd0NWaGozYmR3YmQweGtjZW5yWDE5cnZ3MnNQRS93dDFUVC9FdWxtMjFlRUtkR3ZMbVlyRmNPZHFzdU9RMkJudU9PZ09hOHA4UC9zMndXdHBkV3VyYSt5dkt6WmF6aHlvSFlBOSt2NVY5MVNjWVVZcHM4eCs5SjJQbTd4cGIyVUY0eTJzVFJsVCs5RFBuSjQ2VmpXVnJOUE9xcEdTQ2V3L0N2YmZqbit5bjRnOElhTy9pZncvZkxxVnBDTXpvaTRraTQ2a2R1b3J5RHd0cmNmaHpYclcrdmJkWjQ0cEEwa1pHUXdEWngrbGRxbW5TYmhxY3pTOXByc2ZkdjdOSHdwYlIvQWFlSnRScy93QjVKcGtVRnRnSExEYm4wNkVrRE5kZHBYeEcxTHdocTF2NFUxUnlrMXdqTmFJeTVHMGtGdS9QdDlENm12SHZCSDdWUGhueERwc1UxNzR3ZXppdDRsU0t3amtWRWlBQU9BQ2VuSFRuOGE0dnhIKzBuYmVKdmpkb00xaGVpVzFzN2p5WGtWczd0NUlZNUdNOWYxcjVGNEhFWWlyS1ZSSHFLZE9sRldkejlXUDJNUGpIOE1QaWRCcXY3TUh4bVVQNFo4WnhpMU1yeEFDeHV5TVFYQ25CMnVyWUdlMlBldmxMOXFiOW1tNzhCUDR1OEQ2dm1QVS9DT29YRnBONWNuQWFNamJJaWtiaXJMdGJQQXcxU2ZEN1VZOUgxQkpiVjNqMkh6QVV5Q1NlVng2c0NCaXZRLzJvZGQxZjQxUTNYeGpzcjJTMm44UWVGN0Y5U2FOMU82NmdSclNReUFZd0dFYUZ1cDVyUEs1U280dms2TW5GV3FVcjlUNWIvWnI4TzJIL0FBcVh4TGRNQVRKZXdMRnZHVGxVempQSHJYZWVGNXJyVFNHdFpONm5BWWJNai9QRmNGOEZiUFV0TitIZGhEOXFFWXZyMlZ5bWVHMjRYQi9LdlJOTnR0Umg4dHhhQmNBQWs4N2pnWXJueHJjc1RKRzFGV3BvOU84SlQ2MW92d1o4ZitKZnRNZHZIYitIWDM4Z003dVFBbzlPdjRHdm5iNDk2amE2Sit4ak9IbUFsdWRPZmFEMUplWWYwL3JYMGQ0NDBoZEUvWS84V2FtOG1YMUdleXRWUWtjczBvSlVEdC85YXZsMzl2MjFrOEYvQWl5OFBKZEJDOFZwQThJd09jYnp4NmNpdXZoK0NsVWxMekl6R2JWRkkrRzJIRzREQnlCajFwRkxBZFRqdlRsVXRnanBpbEtZWHJ4WDNDYVBuVkVoWVl6aWtwN3B3V3pUVis5VkVpVVU1MTcwMmdBb29vb0FLS0tLQUNpaWlnQW9vb29BS0tLS0FDaWlpZ0Fvb29vQUIxclo4QzNiV3ZpQ05nTTdoaXNhdER3ck1zR3ZXOGpZeHY1elVUK0JsUWRwbytpZmhacXlTL0VDeFcvaHpGZDZTWVRoc1pLZ2taUHJYMmY4SE5XdGJmdzNFbHNlRWxHSXdEbm5uSkk5eFh4ZDhMWW9iN3hqNFlSc29KYitXM1orL3dBeUVpdnJINEN3eDJ1bHkyRHV5K1ZLUTdodVJoaGtkZTRBcjRUTjBsVzBQcGNNNzBrZmRQN0cyb04vd2tCMGVTRWdYVnU4Y2hHQXB5bTNuSTkrSytFdGZzZkZmaFA0aTY3WTIrb0MwdGROMUs1aXVwTjQrZEVsWWVVb0gzOGtyeDFOZlgvN0lYaSt4MEQ0aUcxMUhVSTBpVzV6RE5JMjBPbTVlTTg5TTE0UDhTOVU4RjZIOFZ2aVBxR3JhT2w1S1BFVjJiRnpDV1VKdkxsZ3VjRWc3TUh0blBhdURKSmV6ekNTZlZGWTVjK0dSOCtmRHQ3RFF2akMvd0FVZFltOHkyT3NIVE5LQTJocEplVEpKem5CR2V2djdWN0w4VFg4VjYxNGd0WGJXMHR0TmlpOHk0dG8yK2I3L0dTT280N25IZXZHL2gzNEsxWDRtVGFYYnJQNWRwWVBMS1dadVJMSzUzTnpuUFVEUFhvQlhxbjdUbGhmL0NUNEg2ajRtMUs5WTZ2ZnBIWldTNUlJTGhUdFhnZEFDVDZacjBzVEJWc1haYm5QUVhMVDFQWXZnNTRxMEg0V0piZUtiL2VrbG0wTXNDeG5jWGtITzBaR051T1FlbWE4TC9iL0FQaERyWGhlMDBmNG8yVG1iVGZGeVNhN1pOR3VIaTg2WnhKREp4OTVHeG4xelhCZnNXZnQyYUg0SDhSSjRSK1BscXNzQ1NadE5SdklpeVNKdUIydU0vTHdBQWE5di9iaS9iQytHLzdRM2diU3ZoMThNNVlOVGtzNHhIYncyWjN4V3NQVnlYT05vNTQ2WXJERDBNWGdzelh1NlBxYVNuQ2RHeCtlZnhIMDNVckhWUW1vUGwzaVYxQ3NDTUVEQXJ6bnhPcXgyakpMamRYcnQ5NGUxTDRpZVBKTlBGOURBSG0ydkpNM3lvb09PbjRmalc1ckg3R2xwNGkyUWFkNDJsa1pyWXY1NjJaOHNPTTR6enlQUWl2c1lUaEYzYlBKcVJrOWo1ZHg4L3JtdnFqOWpIVlpFOFp1cktjdHA4VGhkMk1sVDY5alhsSHhSL1pJK0wzd2p0azF6eEI0ZmttMHVSd0UxQ0JQbEFQM1N5bmxjak9NaXU2L1pmdU5SMFQ0amFaRHFkczhMWGNFa1JqWmNFOGJoMnJMTTFDdGhkSGNNSHpRcWFuNlAvREc3WnJSMHV0V210WkpyTXJwb1VCMEZ4aFFDd09TZVQwNEh5bXZjdmhUNHM4Qy9BL1NGOFNlT05ka3Y3MXBZM2FTVmlKSlpDQTIyTkJqNU1xUjN4bXZuMzRYZVRkV1MzYzhwSStYWW9iQkdNbnQzcjBleCtCK20rS1BGMmplS290UnZmUHRwVVZJSTVmM2JZd3d3cE9RZUNDZS9OZm1lTWpUazNCN0gwbEtUaTB6di84QWdyZm9taWVMUGdCb2ZqL3dwRk5iMjUwNUpUQksrNlFxeWxrYVE0eXJFYmpnY1l4elg1WS9FWFZ0TnZyeTJtakE4MjR0VUp3dlVIakpyOWEvMjZQZzM0bFA3SWNlb3o2OWQ2ckRGZlhVU2k4SUxRdzRPeE9PbUJ3RGpnREE2MStUdnhGOE82WlkzbWhQY3JpR1czbHRwWkZVakRLNUE3OGV2MEZmVmNKelVzRTRMb3p6OHgwcXFSNW40bldUN1phd3pJcEc3QVpSeWE1bjRtV3NzR29STnM0SzhDdWg4VlNKYWF3bGdKL21pbjJsam5IR0IvS29maWFrRnZmV3R4Y1dwa2k4c0ZpblkvVTE5Rko4dFN4TnZhVWJuRTJVMDF2Y1JRcFB3Mk4yT2NWM081RjhQTkdyZmRUTzcwcmpZSXJOYjM3WlpYQVpYYjdzZ3cxZHA0VW04UHkzejZWNHZ2cExLQ2UyMnczTWNlNEkzYklGWlYxeklyQ3R3WlgwUzVqTUVGbkxKbFpiZ2NrOU9mV3RQeExNbW02Z3l5dGdBWUI5UWEyTHI0SFFmMlJGcm5oUDRqYVBxY1VCM3RBazRTVmUrTnJjNTUvQ3VhOGZYYTNVaVQrVVE2cHRjbk9NaXZOZEdYdEV6MXZicDByRVdrK0liZnczRWJ1ZTNEUmtuQXpnOWV0ZXovc2dmR0Q5bi94ajR4dWZoWDhlTHlMdzNZNnpadXRoNGthRXQ5bG5VZkpHMk9na1BHY1lGZUoyV2lTZUl0R0t3c0NzTU82WnlPRTY0eWNVV25nYlIvN1J0Yit4akxyQkFwZGlCaG1CejI3ZGVhN1kxS2NJdm1PS3RTcTFLa1ZCNkhybnhxOENmRG53ZjQ4dUxMNGJlSlJxdHZGTTZpNGpPWTNBWWJTcElHUVFjNXJnTHVLV1B4eGFva2YzbDVZSDJOYURhakp2aFdiSTVWVWtQVHRUTHlaZitFd3RwTUJpaXQwNmREWG1OODBtejBuSDJhVUxrR3RYc1ZyZXBDMHBKMzhqUE5URFRvNVpublZlTnVXOWF4ZFhsbGw4VUlWQzVhWEcwbml1bWlXUzFpdkxsZ3JvTGJoUjJPYXlyTGxwSTZhY3VhcTB5amN6MittaUYzSERjZE1WQnZXMTgyZUJnUkoxSW84WFNSWFdtVzRqR3hpQnhqcFVFTUppMG9SUnVXTzNqTlhTWHVKbU5SL3ZHWGJlM2E0dHQ4b3lPb0hiRlp3dFVpazh5TnlBWk9EM05UYWZyVDJkc3kzaWNZUE9Lc3pXd2UydG50dm1XWG5qMXJvZzdJeG43eExwWDJsZGFoOHlMY0NNWUZWL2lIYk1iRkxrRG81QngyclMwdTBadFhpTXR4NWZsZ2tZNHJPOGQzTXoyYndLQWN5SFBIV2luL0dMbW5HaVlqU3l4K0Q1R3hnTTJBY2RSVm53YkdJckhZUmdFOUNPdFZ0VTN4K0RvcEQ4cW0rTVlIWTRyVTBTMFU2ZXM0WURHQ0FLOUNwSDkyZWJDZDYxaWo4VFlVbXRya21YTEtGZFY5cTVEdzZZaDRrZzNNTUxLTWl1MDhVK1ZjMzJwaGh5SUdBQjdZLy9BRlZ3WGhmQzYzQ1g0eTQzSEhiTmNHWGZ3VWpmTlA0MXowajRWNmxaMk05N2EzWGhkTlNFTTdORDVreFR5c0gyOWlUK0ZjajRna3Y3bnhJTGhFYnlwRzNmTTJWSFAzUjdWMTNnNFdHaFhtcTRuQkJuRzBBOWVEMzRybXRlRWxsTkhQQkp1ak9mbTY0NXpYdE5xeDgvVGo3eFR1STdaeThLdmpqN3VheHRVYUszVUNPWVk5cXZYTi9ETGZLSVQ5OVJtc25YaUVrQVJjODR3SzUzdWRrUjRoZTVaQkk0eUJrQ3RIVDNSYlZ5amplQWR5OTZ5MDN4S0prZkJBNUE3VmNzNDF0N0NTN1ppUy9idlV5VnphbTJpbXZuVDM3QUp4bm5GZEFzcXBvejI0WW5DYzUrbGMvcE15TGZrazVCUFN0YVc0RWx0S3NLbkREZ2tWejFGN3lSMTBwWGl6QnRJMGt1SGxYUEIrN210YXh1czRtY1l3Tm9GWk51WjdkSmxrQUw5VkNucFV0cmV0NUEyZ0VIN3hyV1VYSXlwVFVXYU56S0d1ajVJd0RIMU5McGJNTGlPR1FjRTRMZWxWa2JjMkZrR01IalBJcVhTcDkxMUZIbkFEWkpyR2NiSTZvVFVwRjJGSkRxRHJjTVpOcjRUZDFxbnJzMjNVV1p4MU5hWWlndU5SemJ1QU9yVmlhK2R1c1NzcHlBTUFWRkpYbVBFM2pTMUlZWkliY203RDg3OENNanQ2MVJ2WkI1MG05UXBEY2tDblh6dUxZc29QOEFoVEk0bXY0STdvTU53K1dSZnAwTmQ4VlozUExxejFzV05PakxYVWNSa0lMT2gzRnVuUFd2VGYybDlGdjlKMDM0ZWVXTjBRdHBXamxVY1pEcDA0OWdmeE5lWVcwbm1PdTNJeGpjdyt0ZWtlTWRkMUxYdmhuNFJzTlhRTTFoY1hRdEhmQlpvOW9QUE9menJTSHgzT2VyckE0NkJ4TmVPN0E3UzVZWSt0WUhqdTltbVltUlVBRDdSc0dBUmorZGJXbFQ1ZVhkSGs0S2pqdms4VnpuamFHNHRaSTRyaUprWmp1Q3NNWkJycGl0VG1uYmxQYmYrQ2RPaHgzdnhLdnRWa2NLdHJwc2pCajBCSXI2TzhTeFdKMFNOTGxTeG5rM0ZWL2lHVHpYaW4vQlA3dzZFOEsrSnZFanJ0LzBNUkkyUFh0WHNHdTZsR2tWcHB1emhJZ0FSbkF6eG5QYnJYdytiVlBhWm8xMlBhdzhlWENJenRVczlNbnVJSllKeUJFb0lpVnVtT2grdk9LOVMwSzMrMGZCYlZJWk5VVzJXNWF6dFRjektHK1Y1bEp5RHlPRlBhdkdiNlBWWTlZTjdwVjVpT1ZCRVQyUThjOG5uLzYxZW5mRXVPLzhOL3M0YWExdGJscEx2VmZPZmFTTStUQXpEcDIzYzFGS0tsVmlpWmFRYkxvK0hQaGZ4NXIwZDdxL2lPYXkwYlRNbzhzVGhXaytZa3F2QUMreDY0cjBId2Y0Ni9aaytIZDVhV0ZsOEVkUDF5MnlnbXVkWnZKSkdsSVBzUmduSFVWNGpQcG5peld2aDVwR2hXV29OYk5jd3JQT3hZNUpPV3gvbm11S1h4VXZnVHhFTkg4ZjN6UW1WRDlrYWNuQVBYSi9IUGJpdXl0UnE0bVR0TjJYUXhwdUVGN3lQdGo5clQ0Qy9zK2ZFajltbWI5cEg5bkhTMjBLYlM1WXJmeGY0VmVacG9FamxHRXVvTTg3UStBeW5qRmZqYjhaUERGcm9Iamk0dGRPaUlobS9lUnBqR01uREFaOTgxK2psdjhBdEhXZWovQjNXZkJOaHFLWE0vaWUxaXM1TFJKZC93QzRWbGNzY1kvL0FGMThkZkgvQU9CL3hGOFFlTGJUWGRIOEozVWxuY29WanVXaTJydmRpUUNPTUFpdlh5YVZTRWVXWnc0cUNiMFBuNjUweTVndC9QRFpIZW4rRlh2ZitFanN2c2U0eS9hVThzQTk4MXRlSTdIVU5GdUpkR3Y3RjRaNFNVbmlrWEJSaDJOSjhMcmZQai9USmhDSFdHN1dWd2VtRk9UWHZTa3VSbkRaODZQdFQ0TWZIYlNiL3dBUHhhWnI5c1d1b1UyTXFESlo0OFlCNHlQYysyYTY3NHNmRVQ0aWVGUGc3WnpYTFJ4V043SGVwYXc4TTZvd1Y4TWZROEg4Y2NWNGo4RHRPdkpmaVZyRDNhK1hITnFPTGR3eEFEdG5nZGV4SnJ1LzJyNzNTOVBzWTlMc3RVV1JocDZ4TnA0bjNyYnN6NFVEQTZsUitPVDdWOHRUb3doaW5LSjZ6YmRQVXZlRmRHbmY0YjZGcGNEbU9TS3hqa1U4ajVteXh6NmRhN1RTWU5UV3pnYlZaZm1JNEtNT2VQMXJtTkhtSCtqYWZBcEN4V2tRQ2djSENqZ2NWMkZycHVvM1doVzkvR3JFUXo3U21SeG5wK05lSGlLamRhVE82aXRFZWhmSGtQYi9BTE12aEx3eUowRGE1NHdpZVhCeXhqaFFuK1pGZkpIL0FBVkIxV0VXT2phT2syNHRmek1wSUozQlFFem51TWl2cXI5cHE1bGxmNFVlREprd2tWbFBlekhrRGN6cXZweHdwL0ROZkdmL0FBVS84UVJhdDQxOE5hZEJBSVJGcHJTdENEa2d1MjdQNjE3bkQxTmV5NXU3T0xNcGFXUGx5TmNOa0R0U2xNcHQ5YVZjZ2RPY2RLWHB3YStvdXp4MUhRaU1JQXlEbWtrUTdjRUVmaFUyRDZHa0k0d1JWWDFJYXVWVzQrU20xWWFFZmV6OU0xRTY4WUFxK1lnWlJUZ21Sbk5BVEJ6bXFBYlJTdDk2a29BS0tLS0FDaWlpZ0Fvb29vQUtLS0tBQ2lpaWdBcWZUSlJEcUVNckRoWkJVRk9oWXJLckE4aGhTZXcxdWZRUGdIVjNzZjhBaEh0VFhBK3o2OUUyUmdrQThjMTlqL0N5SzBOcmZTSzZCR3VzcVFTQ1QxcjRkMGI3U2ZDc2QvRy9OdFBCTHQ0eHd3NXI3RStCR3BMZFRYVmhHU3NoblU5d0hCQUdRQ01ucitWZkU1dFMvZUpuMFdGbis1c2ZWUDdPRjNGSjQyc29qRmJzbm1BRDdTTW9Sa1p3RDdEODY0djl1dlRMYndEOGZ2RTFyY3hMYldXcjJFV29vaXgvTGw3Y3FjNFBIektlbkJ6aXIvd1htMS9RdkZ1bjNNdXNRNWx1MThrSXZKVEFIemNlaDZIbnBWci9BSUtnZUhialZQSG5oelg3aTFYeTlUOExKQ2pCK1daWkNHM1lVYzRmdlhrWUpSam1NVjNONTY0WjNQQlAyVE5KMGE2ZXp2cDVWQmFOU0VIeTV3NTRVRVlCempyeHpXVC9BTUZBdmlCcGZqRFZvdkF1bjY0a2tYaDdUaE8wQVlIZFBJVkJ3VkJCd3A2OXE5RC9BR0NkSzhJYTNyVjU4TWZGZW5RbVM4OHl5dFpHenZpbTJreHN1Tys0WTU3a0h0WG1PdS9DcTNzcHZGbHZyR2dyL2FiYVplUk1zc2VaRmxXWmkyUDd2S2dWN2VHb1h6R1VuME9WenRoMGVkM2ovQzJYV1lOTUhoeUQ3UEZFcVRUWEVJSkxqdmdBWjY5YTRmNDYvR3ZSL0IybnA0UitIc3NOaTkwVisweVdNYW9QTElHZW1UbmoxckY4VC9FdDQ1SmsxTUJIemtubzNHT00rbGVPWDlucS9qbnhWTERvc0R6eVN5ZnUxSFlaL3dBYSttcDAxTDNwSGx5bTQ2STlkK0N1aDZqNDI4VWVISVlMelkyb3pHUEJreDBZa3NmeXI5UGYyWk5WOEhmQWUrdGJpUDROK0Z2RTl1b0MzMC9pVzBNL21jZ01GR1FFQndSN1YrV1B3MXVQR2Z3bzhiZUczOFU2UmMyY2RpK1I1aTQzQnNuaHVuUTE5dytHL3dCb0RSZFI4TExjM0dwUmVRc0tsME1pZ2pBTEZ2WEI5cStXenVuaUoxa3FiMFBUd25JNGU4Zm9GOGEvZ2IreHYrM2w4UEcwbjRaYUJiZkRUeDNKRHVzNGJSVEpvK3BTQlRpS1dQSjhza3VRckRCSEdjaXZ5djhBMmx2ZzVlL0J6NG9XdHByV2xYZGpyMmhhNnR2cXRsY1FsZko1OHRnU2Nqc0dEQTRJYkl6WHBmN09IN2Jtb1huajN5YmVlWllsdS9rak9lUnVBVnZyeDE5Szd2OEE0S05lTnJiNG0rSmJ6eGpmV0Z1dHhxUGdXeG5sdVk0OHlQY1c4anJ2YkFHV0toZnlGYzJDbmlxVlowYWowc09wVGdrcFJJUGdYTGZYZHlyUzNPMTBCOGxWSXdRTVk5dTFmVUh3MHVWLzBHMytVWERYQUFMTUZKSUo0QVAxR0srVlBnQmV2ZVdVTjlGSXE3NGdSRVFNbklHY2p1TVkvR3ZkL0FtcmFuNGcxbVBTOVUwNkpyUzB1Y3lNSFpYWTVBeUN2cU8zYXZBeHRPOVZub1Uzb2o2NC9hSDFqUmRjL1k1MXJ3L09nbWthNEtvRkc0RXlEZ2s4alBOZml4OFlZRi9zTmI3VTlLYUVXMnJ5ZVV1NVNHTFpKR08vSnhrY1YreHZpZTNtdnYyWE5ldGRJdEVqaXNaYmNCa2M0WUFCV09lNXdldllFVitQWDdTMmxUeGFYZFc5MHJDZXkxNGdCQUJ0M0U4cnoyLyt0WHA4SlZIQ3BLQno1bkgzYm5oZnhWVzFiWFl0VWhpSy9hQ3JHTWs1QngwTlJmRTY2aW44Tlc4c0tnL3VnQ1AvQUszYW4vRnl4dTdQN0lsMUc2U2VRanE4aTRKWCt0WVhpRzlsdlBEOE1YbjdsVk9lZVRYMlZUK0taMHB4alFNYlM5T2x1N2VHWkJ2YmZ5QjJycFpZSWhKRjUwZzNBQUFHdWE4TDNQazNwVGYwNkExMGR0UEJkM3lwTVFTRHg3ZmhSVVRzR0hhYkoxVCt3YmxmRUZuQ2tqa21QWXc0NUdNMUhydXBycUdselBjcU4zbGc5TzlKYXZKYlR6NmJOMFo4cm4wcXRmUEV0NmJhUUR5eVYzREhVVnlYYk82Y0ZhNk5Ud2pxdXFhTnAweTZYZGVXSjROdHpISXVZNWxIT3hnZW80L0kxMFdnRzN2OGFsWldNY2NOMWJaamdVNUVURGhrejJIY0RzTVZROEphZmFhbzRnaVFPaFE1QTdIYnhWRHdFK3FhWnJFMFZ3V2FNeUZTcmNqSWJCL3B6V0ZaKzR6U2xmMjBUb3ZFbWtzdGhETXhERkhVbkFHTUgvUDZWaTZ0Y3pKNG5Eb2hDS01GdS9UdFhWK01MKzN0ZEIrMFhwOHRTNkRnZE9SV0xyT2ozQ1h3MVNPQjVJZG00dkhHWHhuM0hmbXVURHljb25vWXFNVk5IUHkzRWJhL2Jscm1HQWwrSnJnbmF1ZlhGZFRwenlMYlhVUnVZYmgyaUMrWmJ5Ymxkams4Vnh6cGI2cHJUSXFFYlB2QnNkdjYxMDJqMzhPbnAvWWh0NDBESFBtcncyT24rTmIxNmJjRXJISlNhZFp5dVZkV1FSYWpick5CdVFRWjI0NkdvN2k2Z1dGZkw2SEdSajJwUEUwNWkxbU40cFBNL2Q3ZHBvZ3ZwZ3JSdnBDTm4wUGFvVWVXQ05ISk9USzJxbEwyUlliUURZQjh4QTZmNXpXaDRYWXJmeFdUdHVSQi9GemlxQnZZcldHWVMyYkpnRWdqcFZQUi9FRHdzOXk2NGRoaGEyZ3JveW0wbWRrVWdmVTl6bkFZWlQwQnpXSjRtbFdZNUtFaFpBT2UvYXRhYTZFZGxiczRJWmx4bjB5UC9yMW42NmtVSVpDeWdNb1lISFUwb0pxcGMwcXZtbzJLOWpxTnBOOE50Vk56cDBOdy93RGFEV3RtcGJEV2pFQnZNYjZnRUEvV3Fta3ZkUVFJek9TQ0FBRDlLWjRlMVd6MDY0MUMxMVN5a2UzMVVqa0RrRlR3NDdkelYwWG1tMjFyOWlpZmNUOTFzZlN2Ums3eHNlTFFiVlZ0bVo0cXZKRThRNnJhS3VRc2JnbjhUWEthRkZHSkJkQkF4aUlLcTNmbnBYVWVNb1hoOFJheXhPUUEzOHpYSzZNSm9vM3VJd1RpVDVWK25UaXVMTDBsVFIwNWszN1ZuYlhGL2EzTVZ3OGRzc0JrbUtzaTlTMjJ1Y3U3dTVGcExaWHNaRzBaWGl0anhGcFBpT2ZRUCtFaGgweVJJWkxvc3pJdkgzUnpudlhNRzh2TDNNZHdXSTJFc2NZNHgvOEFXcjFtZVBTYXVWb2J1QU1GTUEzOW14VlBWSGxOd0RJUG1BNkNqTVpLUHZ3UStDUjJxNXFhTkxibzRBSkE1YkZaTkhVbXBGVzNqZTRqZGdQbVZjbXJSazJhZXFET1N1ZjFxS3pXU0lPc1JQenJqR09hVFdia05Fa0VjZXdyRmh1T2hxR3JzMFVySXJhVVBOMUJ3aWdZUDRkYTNid1lLeGJRaW1QcVBXdWYwSkpFdmN1VHoxRmRMZWpiSDVwd1FvSUI5T00xejFyYzZPM0RLOUpzNVF0QUoya2VSbFhvd1E4MVpzL0pheVFRTnRMU1kzTWNack51R0xPd1lZSXovT3JOcTVPbW9EbjcvSkhVVjEyU1NPQ0xmTzBhTjlwczloWnczOFNzMEU3Tkdrd1hBOHhjYmx6M3JTMDRXYzFvUEtJOHpiMHh6bXFGcnE5eVBEa3ZoeTVBTU10MnR6RXpmZWpiR0d4OVJqOHExZkJYMlNKbkY0cUZRUGwzRGtlLzhxNWNSOE56dXdhY3FnN1N5RXo1bVZiUFE4VmlhK01YYzBzZUNBZm1yWGx1MXVMaVc0dHdRRllnNUdNVmk2dS83bVdkVzRkK2dQV3NxRitZNk1kWlUwaWxOS1o3UUlFNzgwMjNRd29XQjRBNlU2MWtRMmpSdXVHWGtESFdsMHRtbG1aaU9BT1FSWGVqeHBPN0pOQm1SeEpKSXYzV0RjOXE5RzFuVk5LOFgvQWl4U0U3ZFU4TWF2dElHQVpMV2NjWndPY01PL3JYbXRyTTBWNFNCaFNlUld0bzkzTkxaNnBaTHVWWjdNRUpuZ2xXQkI2OWF1Tzl6S3BzVzdmUzdtTkNGaFlJem45NHFIayszNTF5L3dBUnA3cWZWNExXNmJjMGNJQXlSazVOZXJXbnh0MXpVL2hxZkFWeDRmMDVZbzEzSmRKYlltUXFCL0VQWEhYNlY0NTRsMU9YVnZFdm15SEp3cWsvaFhUQnV4eXVWM1krdGYyUXJXNzBiNENYTWtmeW0vdnNNZlZSanBYZDY5Y1MybXFwYTJvVmtXQlEzR2QzZkZZUHdTMDV0Si9aMjhPdzdBR3ZKV2tBWWRSbXRQVWhxS2F5Ym02aTJKbmFBU09lbGZubGVvcDQycEo5ejZHT2xHS0gybGpieXlyUGJ4a1B1eTY1NFBJemcvMHJ1L2p0NGtHbS9CN1E5T3RMRXp5eDZMZVhMUm9oNnNRZ3lNY2REWEdRUlhlVGJ3eUJRYzlCMFBwN1ZuL3RKZVBQRVB3eXNZSkpkczZXSGhXRHpVbkFLdnVabjJuOHg5UlhiZ0llMHhTU09iRXZsb3N2L0JqNHRXM3hBOFA2VHFFK3lKN2ZFZHpBb0J3eUhINWtBMTZSOGVmMmJQREhpN3g3cUZzUEQwbDFadFkyK3B3VEF1bWJhYVBKa0I5RUlZZGV1ZUsrR3ZncCswRHAxdHJWN3A5MWJpeCsyWEptdEkwWTdBL1B5OFl3ZWVLL1J2OEFaTS9hTTBIeG5vdWkyUGlIV2JIVGRlME5IdDlIMVBVa0RXbHhhVEVidE52Y0FzSW1kc3BLTStXMmNqYVNSNnRTblBDWWg4Mmx6aVVsVnBhTStlUENYZzc0YmZEdjRreCtIdE4wZVp5TGdEelpKZk44c2JnT001RzdDazhjVjlNMy93QU1mMlV2aUQ0UTFuVTlmMXJ4QkJMbzJsUEpiWGphaXZsU3lEY1FDdkFDNVVjZGlTT2xlYy90Yy9ESS9DcjRwV2ZpNGZEdTcwQ0RVUEtuaDArN2w4NkVrcVEwMXZPQ1VsaVlna0ZXUEZjdnIyaWVLdkduZzFOSjB5K2RZYnJVNHpmdEFOMklEODJmWUFIT01WRTUxSFVqeU93NmFYSzduSi90RS9zcS9CUDRzK0F0UDhaZURZSDBYeEZjTEhFNWdSMmh1bTNITE91TWJ0cWc1Qnh6eml2a2J3MzREdlBEdmk5OUlMaVNlM3VqRThrWElKVW5wajZEODYrMi9pRDR5OFJUMmRyNEErR1hoNEN3c296YVFUUnhDU1NXVEdIY2tmZEIzT1I2RW1zWDRVZnM4YVY0TThWUStKL0h1bitkcWNoRXRyYU1DNnhTRXIrOGM5RDNGZWxpTWFxRkxsYjFNWTBPZVYwVi9oMzhIYnR0QWowTFZybjdETVlZN3EvdUZZYjBkOTIwRFBRZ0ZjbjBCeUs0TDRvK0V0Rm0xR3kwVFNsSmlrMWUzdFlaR2xMTk1WUHpPelo1ejFHT25PSzlFL2FjK05QaDM0ZTJTenk2a0k3eVY4S2tMbk1vNE9jREhBSEF4eFhrM2hIV1lmSG54VThKWGR2ODhFdDQwN3JnN1FFako2Zi9BRit1YTgvQ0twN0dkV1d4MFQ1ZVpSUjNsbDhUWXRPOFRyNFIxYXoyaFo5a2NyREJEWjQ0SjVHQng5ZWxlcStBOVRlNzEwaFpmTWhMQ1JyZkdRQ0RnRGpnOUs1RHhab1BoWFZySm83aXdXUzRSaThMUlJiV0RudmtIMDR3ZW1hNmY5bUNGOWU4WjIrbjZqWStVMExqNUdCSTNZQVVFOXV2VDhhOEN1NmNxTG1qcnBwcWFSMlA3VTJvUzMzeGw4TmFCcDhaVjlPOEdwZ3RuQWVWK092MXgrZGZCSC9CUVRYWjliK1BVbHZJeC8wU3hpUWVnenpYNkVmSDYxYTkvYXIxbDBkY2FicFdtMng0T04yM2R0NTZZNi9oWDVvL3RkNmttcWZ0Q2VJTnI3aERLa2VTT3VGSDY4MTlQdy9IbHdpWjUrWWZGWTgxVThnQ25GZ3ZPTTBuSFkwSGtZcjNqejR4Qm1DcmdkK2FUK0htbFlFSitGUk1CbkhOV09Tc2hKR0lPMGRlMU1XUEhKUE5QS2pHZlNtTVJqSU5NNXdBN3NLR1hqaWtISnozb0RrL0t4cHJjYlExZ04vNFVqQWJlS2t3bzRCcE5xamtFWnA3a2tiSnRHYzBsU1V4dnZWUUNVVVVVQUZGRkZBQlJSUlFBVURyelJSUUFwQXgxb1FrTUNPeHBLVlIzb0d0ejJQd3hjQzQrSDF4RzdqSnR4OG85c0gvQUQrTmZUL2d1UzQxZndMcE1HalhzbG5mVDIwTFIzMFpJTUtrQUU5ZllWOG8rQkpGdVBDemd0L3k3Tjh2cGdmL0FLcStuZjJmL0UwV3ArQTlFZ2dkUXkyUDJaZ2V6cXh4alA1MThubXE2bnU0VjJoWStrZkFWNXFHbnZwOTNiNmxKTzZlV2dlUnZtT01IZHdjZHE5TS9iTCtJMXY0citCM2d5N2V6WnI2eDFxVzJrbEpQbGxERmdnNUJCSjI1NjE0dDhQNzVOUm1PbTJWN3ZqdFhKbjNEbGNuQkhUNm12YnYyaDlMMGVmOWlTMDFhMWg4eTQwenhmQTh6S2piaHZESmxpRGl2bWVaVXNiVGw1bmI4VkZvK1NmZ2I0NjFMd3g4ZmJoSkx4clNkTDlMaUl4T28yQUVIZDduSHpEMXdSWDBoKzJWNEl1TkM4V3cvR2J3M280azBEeHZaTk9KWTBMTERlNEMzVnV4UEN1ci92QU80WUhGZkdmN1QrcjZuNEY4UTZKOFdmRDN5QWZ1cnNJVGs4WkJZRVlCSUpIMXhYMXYreHIrMmo4Ty9pTDRCaytESHhrc3BOVzhHK0lVVTNDdzdUZDZkY3FDSTc2Mko0V2FQSkRLZnZya0hnOGUvaWZhNFhGeHhDK0Y3bkpSY2F0Rnc2by9QajQvL0J1MXYvRXQxTjRTdm1qWjVYWnJlZUloQUJnazcrbUNNbjhLb2ZDajRhZUc5RzhKd2VLSWI2YWZWMXU4WFVSRzFJMXo4Z1hBNU9RTTg0N1YraTN4RC9ZKzhjZUZkV1BqbndKcEVYamZ3M0FDYkxYL0FBN2JmYW81WXlEL0FLMkpmM2xyS0VPQ3JEQXovRU9hK2F2QjN3RzFtMitOdHZCcXZnbTh0L0QwR3RlZHFFVnhhT2tVY1FQekljNHprbkdjRG12VldZVXAwYkpuSjlWbXFtcDlNZkFiNE0vc3lmdEQvczVSK0N2RitnUXdlSzRiUjMwVFZpRmVPN21SVkl0cG96L2VQQVlmTjhvNXI1ejhVZkNyd0hwVCtYb2Z3M3RyZDBkMG5pUzdtQkpVb0hCakRFRUR2am9EMHIwWDRjYW5xdndzanZMKzBtbVFhZGVTejJVU05nc3pLZks2ZENjWlA0ZXByclBoWDhPTlVTUFVQRXZqYStzN0tYWDdPYTIrejNVS0ZyVVQvTzA3QTlEZ2xRUWM4VjVWUEZPbEtYdEhkZERwOWpLZGxIYytidmdkOEhML0FGcjRxM2QvNGZYN0hwdHZkNTJEb01NTXFDZnh4K2xlKytPeHBmeFQ4UTY1OFBJb2JCcC9EWGh2eXJPNmU1UG1UeU9wZG8rUDA3MW4vRi9Vdmh4K3gxNE8xRzRzL0ZFTjg2R1JiV1ZTZ2VZa1pIQUpPY244dnlyNFcwRDlyTHh0Yi9FdTg4WFdPcHlSeWFsTG1URCsvVG4yT0tyQ1FyWXpFU3JXMFd3cXNvMFlLRjlUN3cvWnBtczcvd0FHMnJ2YkdOdnMyMXhuQVVyd1FNOTY5ejhNNjlwR2w2dkRaYWJlRHpURmlVYmprdG5INTlLK1VQMlN2aWU4L2hTeFc5andseVczRkJ6a3lkTS9uMDlLK2xkS3ROSGttZlZSQ0F6NGRYREhKNy8wcjV6R3g1YTBrZWxRa25GSDJkNFA4UVdseit5bjQ2dk4yWTRkTGtrZFZVbk8wY244d0svS3I5ckh3cnFtclIrSm9OREtJK0k3NURNUW9LL2VQR080YXYwdS9aODFDUFVmZy80dThDWExaZlZORHZrZ0cxdm1KaHlQeHpqSDQxK2VYN1VFMS9hNmhheHVoVk5VOE5SeHpBazVKV01qdjN5S09HWmN1T2NTTXhqZWpjK1pqcVZwNDArSEFYNG1ySExMcHJ0SGFYVnR3KzBkQTJCeU9LODFtdDdLWlhndExsdG96czgxZW83Zld1dDB2U3A3cndWZFNXdzNJdHdSZ25QVGcrMWNwclZqTHB0cXNxbkdXR1NNODE5NVVWcWx6Z29xOU94ZzZkYVhOdHJETk9OaUJTYzV4bXJ0dEkxcnEwVThjbVVjOE1PbFd0YnRaVzBqemxHR01mSHFheU5MbmxHbW9zbzNNa3BBSjY0b2Z2Uk5JeGRHcWtkeGZ4V005bjl0aHlKRkc3SVE4L1dxTnRwMm5lS2JFMjFwTThkK3FOa3lENVc2WUZXZER1d1BEOXhFU3pTZVdUaGpuSEhibXFIaDVsdE50M2piaHVocmowVFBTcXQyVmlUNFdlSnA5RTFWclRVMFlwRTVWaDN6d0s3UFV0UzBlNDFXT0hSYmJhSFRjMjVRTXNlVFhuY2VsYWhaZUlaYitTRWlPYVF0RkkyQURuQng5YTY3U0hXODFPM3hKODV5RC9udFdPTGpwZEd1Q2tyV2U1ZCtLRisxMTRSaVJZOXBNeUFuRldJTlExZlF0U3RialNiK2UwZjdLcDNRVFlIQTlEd2Z4cHZqM1RwcHZEaXdvbWRreVpBNm5CcWhxV28zc25pRzF0UXUxQmF0ZzQ5cTQ2VXJVOURzcng1cTJwMWRqOFROT3ZyaDQvR25nVFJ0WEhJTnkxdDludUJ4eCs4aXhrNVBjR3REU1BEWHdOOGFLMTVZYXhxMmlTckx0ZUs0VVhFUzlmNGhnMXdVQ3ZMZGkyQ2JRemZmOU9lYXQyOXUya05QYld6TTNtTHVaMTZBZjU3MXA5WWxhekkrcXd2ZGFHbjhSdmh4WWFIZXdTYUQ0MDAzVVF4RzFJbktTYyt6RC9PYXo3UFE1Ym03aXNidDFzWkhYSWU2NFEvajYxaWVKcjY5azFlM3ZKMkR0c0F4anBXNVphbTE1cHEyT281S2xQa1U4NDZmaWEzZkx5cG5LbzFPWnBHZHFkdEpIY1BZVzdyS0kySWQ0eGxXR2Y1ZTlVL0VsLzRCdEREQmE2ZmZXVnhGanp5NjcxSndPY2ZqVWJhN3JmaHZVZ3NkbkZQRWpsZ2pyMS9MOHE3L0FNTmZGTDlsL1g5TGowejR2ZkN2WHJDY0FBNmhvMXlrNkE0UHpHTnh3YytsZHRDbFRtdHpoeE5hdFRleHkwdmlmdzVQcEVFc2V0UnMzR1VjWUkvRHRWWHhKUGF6MnE2aGJUcTZsUU1nNTl4WHN1bi9BTE4vN0ZIeEpzeEY0Ri9hQld4dUpGekZiYXZENURnOGpIekRCSitvcmhQaTUrekZQOEdMY1hVWGkyMTFLeFpqNU10dE1HVnNmUWtIODZxZUZVWGU1bXN3azF5dUo1cmR4ZWZwMWpybHJPUzFwNWtGd3BKeHkyUWNkT1IvS2xTZVNSVmNqNm4wcWZVTkZSYkxTMnNaVERiWExORTZiLzhBV3lweXpIbnA4MlB3cW5QY1hHazNCczVVM0tPQ2ZTaTZZcWFlNWM4V2FqRlByZXJUVHdrbVZtVk1mV3Nmd241VXJyYlNKeVpnUm10RFdwclc0MW03anVYQUN4bDF6Njd1OVltaXRLbmlPTzFnYmFETHRVbjB6bXVQQmU3Qkk2TWY3emJQZE5HOGR0YmVBZjhBaEVMYnc3WjNjVFJrQ1V0aGdlT1A1L2xYamwzQktkVXVJWTRGaEs3dHkrbnRYVWFhTHF6OFBYRjVNWFFXMnFOR1pDT09SbkhXc1RTYlI3M3hCTzhsemhwSTJMSEhBOUJ6WHFYdWVSR0tTdWNocTBZdDVnc1JVRGRsNDl2dDFxekNHdUxOV2M5QjkzOEtndUlBOTNOR1QvR1ZCejcwc2lUV051SWljZ2pnanZVVDJOcUQxMU52d25jNlZORkxwYjJNRDNEU2hsa21mYng2QTFSOFcyMEVWd2Nxck9xOG1KOXk5cXpiVmt1Q205TUVOeWFudUNzYXpRREcwTG5OYzhYN3gxVFNhS09oSUp0WHlwNEE2ZWxicnlDNWxuZ0dSdUh5NTZDc3J3cEFqZWJjcDFPUldsRkdjZ3NwREJUV05aM3FIVGgyMVRPWHZmTFJuQjVZSEJBRldkSmdNbG9vZGlvQjZqdFZlK2psRWYycVdMRWNzcDJNV0dUV2xwWmFIU2hJcThsaGdtdXFUdEM1elViT3F5ZE5JRU1oTnpjb0FSd3FuazlPMWFXaVdmbFM1ejk3N3ByTk1oazFGYm56RlpwY2J1T25UcFc5WnhwRHNrVWZkTmNWZWVoNnVGcHg1cm96R011bnpYQ0ZlR3p3YXdKN3B0aGlFZ3lYUHlrZEszNytXYTRNbHpLdTNleDJpdWUyYlpwUTJNZTlhVU81aGozMEZnU1NNR1Fzb3lNRWpwVDR3MW5FV1ZRZC9jVkZiaFJESVdZWi9ocDlvWGR2TGtjazRKd1QwcnJXcDViU0cycVNQY2h5cDVQVEZlbWVFdmhVbXNlSDQ5WnRmRXVtbDVGdzFtSjhUQUhHUmpxZUQrUnJ6QzJua2t1ZGpramFTQVFNWXJxL0E4MTdZYS9iWFVNVEF4djVqbkJPQjB6K3RhclF5blp4SXRIdnJmdzc0Z3V0THZMUWZaNUZlR1VzT25YQkdhNFJZUHRYaTViV0k3dzF4dFhIT2VTQlhZZkVPY3lYMXpxU3ErMlNSbVJtUWpPY2R6NjlhNWY0YzJrMnEvRWJTN1lLV0wzaWtqMUdhM20rV2xKK1RPS0N2Tkx6UHUrM2hYUVBDUGc3dzVicGo3UHBVYnN2SUc1aG44Nm9hbnFVTTEyMHFqTENUa0RqSDA5djhhNlB4emJRUlRxNUs0MDdTWWtUQjVEQ01WeWRyNWIyc01ubFlKQU0yUnlUWDV6N055cVNsNW4wY2xhS1IwT2dSU1QrSnJVQzNhUzNsMmlQUEo2am5qL1BXdkt2K0NoM2kyOFc3MTRRS0ZVeXdhZHNZY2hFUlI2ZXhyM2Y0UVd5Nmo0MDBpMnVBUEttdllnVlk5QURrNTVyNTUvYmxrWHhUSnJWNWJRaFB0T3ZUekEvd2xGZHNmb0s5bko0cFl0Tm5GamY0SjhocEs4YmlWR0laVGtFSGtWNi93REFuOXFMWHZoM2ZXMXJxMTJ6VzhST1pDdTROeHh1WCtMQjk2OG1tc2pHTnljZ0VBNXJTOE0rQnZFZml1NU1PaTJUdmc0TW5SUitOZllZbWpoOFRTNWFteDRkS1ZXbkwzVDdnOFFmdGUyM3hoK0hWbjRDUGllOGlzZFB1RnViR3pTKzMyOEV4VlFYU0p6KzVCR2NxaDVyWCtEL0FPME40djhBQlJoVFFmRTFnbDlZc1ZNcGpWeEpIbmRobGJPN29PQ000L0t2bXo5bmo0VzNWajQrajhNK005R3RMcUtaR2JaZDdsVmVPVzNEQjZacjZrK0cvd0N4ejhGdkcvakZkSnZmRmQxb3lYY2pBWENYZzhpTThuamNDY2ZsME5mTjRqRDBjTzdLWG9lclNuS1N1MGRWNHgvYWsxclU5SXQ5UjFIU1BDbW50Q3l0YzNtazJYMldXZFNOdVhJNDU1UEhQU3ZNdmlCKzJSNFYwdTF1RjBhQ1c3WFlFaW1aU2tNUjUyZ3MyY2pCQkdPOWVaL3RkL0Nqd3o4T2RjMUhSL2huOFE3ald0SnNMb3hRMzF6YkNQN1F5L2VLQUVnZ2NFTjNGZk5PdmEvcjl6WnJwdW9hclBMQ3JEYkRKSVNBUU9LNnNOZ0k0aGMwM2N6cTRoMDlFZHIrMEQ4VVBEM3hEMW1IVTlMZTl1Ym9LMzJ1OXVpRmpiT0NGamovQUlWSHZ6WHIvd0N5YmJuVnZFV2h5UGFLQlk2QmN6TjIyN3NLUHA2L2pYeXJhbVdXY1I0M0VuSFBQV3ZycjlrRjRyZTcxN1ZZR0N4Mittd1dsdDBBOXgrWXJyekdNYUdCY1ltR0VjcXRlN1BZcmlDMWExYzZmZGNLK1dSMkF5Ujdqay9wWGUvc3U2RHExdjhBRi9USFdMem9MbEJpVlcrVWtISkI0SUJ4WG1semJhdlpOdnZiZVNPSnBOd0lCQUo2OWZ4cjNQOEFaSmtsMHp4TTJvTUZhM3Q3R2U0S3V3NEt4NUJBUFRnZnJYeE5SZnVYSHVlMUhTWlYvdHJSL2lEOGJQSFdyendCWEhpRENTcjl6eTRsOHNEQjZqT08rT3RmbDkrMFJldHFQeHk4VTNKR1FkWmxVSE9lQWNEK1Zmb1o4QWRWbXVkRDhRK0pMcVlSbTUxQ2FVc3c1WnNNNTl2VFAwcjg0UGlyZlI2cDhTOWR2bE9SSnEwelo2NStZMTlubE1QWjBJeDhqeXNkTG1uY3cwSzdjQ25FcnQ2WXB1M2FNZzBxNEpCejlhOVE0UTNzZU50TVplb0hGVE1PQVIwcHJMeGc5NmFlb0VCalBRdFROdUNTY1lxZnlrOURUV2oyNHh6VktTRnlrUSs3akZOS2hodDk2bUs4YmVCN1UwUWpQQnpWYzZFNGFFWGs0RzR0UXFBSGNEVTdRQUtTTS9qVGR1MGRQMHBxVnlPUm9ZUFVtaGxCWE82blpIVE5CSUdDUitsVU5rUlVCU1JUYWUrY0g1Y2Mwd2RhRE1lSXdUblA0VWhUSjQ2VTQ0eHVCcFZBSzdUUVZhNUhzSW9LNEZTR01kUURTRkJuaFRRSEt5T2xYbk5QRWVQNGFjSXg2VUJ5c1ltUXY0MDdIOFdQcHhUa1RHTWo2VXBHQVZ4MTlxaStwYWpvZWdmRFc2Q2FXdHV5WkRxeUhhUFZUL1d2Zi8yVkowdXZodEhPWmRqMk90bGNodVFyRFA4QVd2bnY0VnNHdFlpQ1AzZHlBMmE5aC9aMzFoOUc4RWVKZ3NPNUxhL2psd0IwSEl6MDQ2VjgvbWtMMDNidWVwaHRqN0UrRGEyeHRwTFNCWW1XV1JpNEFBSko5UFh2MXI2S0hoU0RYUDJPZmlONGFTMkVza09teDZuYUt3SmNtRjFKYks5RGdIclh5dDhFN3kxMWJUWUwrYlV6QUhVRkk4NTRPTTV4Mk9UWDFwOENJOVExbndONG04TzJFelNDNjhOM3NDc1RuTGVTMkJqbmc0R0I2MThkaVl0Vll2c3owS1d6UitRZjdiWGlYeEZGNDV0Tk5YVXBvN1VXUVpiZFpEdE9EMUl6eitQTmNUOEUvanRxL3dBT05ialo1M2EyMzd2SkQ3UUc3c01kQ2VmYXU1L2JhMCsvMUh4RnBXb214WkN0dThUa2pxd0k0NUhKcndDU0tXS1Q1aGdqMXI5RW8wcVdJd3FqUHFqdzV6cVVxdDRuNlA4QXdPL2Ivc1BEVVVkeHB2aTNVTkd2Z3NTUXREZHRiU2R1cnFRc2h5QndmU3ZaUEZQN1h2eEErTjNocXgwZnh0NDZuMVcxdGtNa0hubUppU1d6dWVRRExkRHVCcjhrOUI4ZDYzb2lpMGlsU1dBa1ppdUUzcjFIWTlPbGZVLzdKUDhBd2h2amw3VzF2cFpyZGNiWlZpdTJWWTJZOWRvejA1K2d4bml2RnhlVlJ3L3ZMWTY2T01kVFJudm12L0dEd3o0U2w4cWFPTzZ2TFdSVEd6a2JFWUVZSTR3MkFUZ0RPUnpYbDN4WC9iRjhTYVRZTWtHck9BKzE0bjM1a2NET0FxWTRBejM2VjlRWGY3Skh3TXZmQkZwOFZmaFQ0S3U5V20walRwQjR3czlhdlB0QWhkbS9kM1M0WWJVS3NBZjdwQU9NVjhJL0dQOEFaZThlSHhsZjNmaEMwVzV0WHVIOG1NeS9QRXU3N25QQklKN1orcHFNTGhhTmFWMzBONTFwUWpvZU9mR1Q0cStNL2lQZUxkK0lOV21saFUvdVlHa3lGK3ZxYTQzUkRKL2JGdXlOZytjdlA0MXYrT3RDMVB3cGN5NlJyOWs4RjBvR1luUFRyNlZ6VnJPOEV5eVJuREFqRGVsZlMwYWNZVXVXS1BIcVNjcXQ1TSs1ZjJNdFJhVHdqWXhsUks4VTgwZmxrRUZXV1E0K25XdnRMd1JidHFYMk9lTzM4d2lIYThJOVBYcjJ6K2xmQ0g3RU9xNmZxZW5UUlJ5T2pwZUNSMVVja3VuSkI2bmtHdnQ3NFVlSVp4TENMQ0l3dkVwUDJtWlJ5ZURoUjNCcjg3elNGc1JJK2t3elhJajZ4L1ptOFFhRGJhOWFXS1dqdTdIRW5MY0NRS0d6NmNaR2VhK1FmK0NqM2h5RHdoOFlJdEZzTkc4cTBzNzZXS01LZmxDRWtnRGpvQTQ1OWpYMHY4RHIrYTA4VFd4dnJqYTdoSGE3QUs1d1JoaDI3bjZkYThkLzRLcXlhZkg4WlprdG9Xa0RmWlpYWUtUdGQ0eGtaNDlCWG1aSkowczRTT2pHSlBETS9OWTZEcmZoZGJrdE03V3R4ZVNiV1VqYTJIUEZWL0VYZ1RVTmUwTnRRMHlRT3lmTnNQZjlPdGRScXZqQ1NUV05kOEM2bjRidFF2OEFhRE5IZFNTSHpJanUvSTV6WG4vak85dTlNazhxMnZKbFU5bGNqUDVjZHEvU3FqVnp5S0VXMW9VUEVNSmkwSlVac09xNGYxQjVybXRFblI3MzdPN2c1T1FUNjFvVDZqY1Q2ZTBEeTVYelBsVmprNHFHZlROSXROVHRaYktOMGtJSG1JelpIMXFGZFJaclVxS1ZSSFM2YXd0WXBVejk1U01qcFRyTzBjYVo1aUJlRG5wK3RRM0xpWFJaWkMyR1E0K1U4MHZoZ3l5V3hEeUhCejhwUFN1RjczUFZqYVZqVCtIL0FJOHQ5QjFmVU5MMTd3M2JhcnBXb2hVdWJlN0dIVEIrL0M0T1Vicmp0V2hwdGpwRnRyejNPaFJ6ZlpqbG9VbmJMb09PQ1Ixd085Y3pMYXBEcVoyQUFFOWgxcmMwQzRrdDlYOG9qSWRPcDdVVjVjME5RdzFOUnFtejRzdTVFMHlkbzJMRVNyenpnWnJMYVNTNzF5QTdmdTJqQWtkT2EwdkZkeGJmOEkvUDVmRHZLZ0l4NzFSc28yajFJenNNQVFISXJ6SU8wVDA2djhRbDB2U2IvVlBFZG5wZW5BNzU1UUR0NTR6elhYZU50QWs4TjNNTVNXZTJLV014dG1QSFR2WEk2VDRvbjhLK0tiRHhGQmJpUVFTN2lwSFVaNS9HdlEvaXA4WWRBK0lac2JMU1BEclFtSUJubGZ0bnNQYWxOU3VpSlN1N0hrT3F1ZzhSdzJyeUFoUjNQQnJUdDdtMHVWZWEya0JFUjJudGcxZ2VLbGFYeHF4aGZidHdPdU9mU3RHeDhxRkxpM2pUYnViTE12MC9XdXlVZWFLT1NNclRZbW8rZGRFekhub0JXWnJOekREYXh4dGJiZm02dDIrbnBXNXA4YUdZRjJ5TTRIUFhtcXVwalQ0dGN0eHFpRmJkTHVOcmdiTWtKbkovU3FoSncwSnFMbjFJWWpaM3Qya2R6S0Z3Z0txOFg1Y25tbDFDZTZzOFc5cmNNMFFQRWFzeFVkTzJhOUcrTlBpVDRlZUw5ZXM5UzhBSW4yV0swVkNSQUVJYlBIRmVmWERSeXkzY0RFTHMrNXp5YXVuTnlaak9DNWRpNXExOW9GLzREOEgyK20zaXlYOGQxZk5xRUN0Z3dIelFGenh3R0hQZXNQeGRiMnpMNXUzYXc5UlZ0YkdEVExpS1ZFQXkrNTJ4ak9RT3RhR3ZhWEJxRm9abzAzQWpod0s2Rll4aXJSc3ppdkdFYjJuaWVXSmNrU3g5QlZUU3BKeDRodG5nSEptR0dJeUt0K0labnUvRmpHZFBtUUFENmU5UXdxQmYyalFFQStXU3graE5MRHF5U01xL3ZLUjZoWmVKTkwwMzRTK0lOQnVvWTJ2TDNWVm10ZHlaYm9Ca1kveDcxNXhxSGl6VmJDQXhlVWtaSzR5RXdlbGRCSzk5SnFPbW1iU3R0b1praTNaemtrRGowcWo4VmJhd2lhNHRGaXhKRmpHQndjak5kejBaNWtJNk01Q1IwZTNFcGJIbUhQNDFKSXhhRlVmT1FPTWluWFMyRm5ZV0RXMGpOTEpGbWRIVEcxczFJREhJOGNyQWRqaXM1czNveEt0a0ZqRW04NEt2M3BsejVqaVVJeEFLSGdtck55b1paSldqSUxTWklIdFZXTXU5dks4aDVCd00xakZkVHFlMWgzZ3laSWtsU1E0Mm5QTmRCTkN5T0pFVUFHQTdzOXE1elJGalM4YVBHTjZrWnJmMUM0ZTNBWGNNZVNCazF6MWRhcU8yZ2w3SjNPSTFFU0JndTRuYXh3dWVuTmE5bzBqYVhFbU5wM2pKL0NzZS9tVkoySkdQbTRIcld6YW56ZEREWXhnakJycnFMOTJqejZQOFZqYkV1K29LcTlRZWMxdld0K1JlcEczR0QrRllHanJMSGVqYy9iZ25xYTBZNXBJWkZabHdReDYxeVZZY3pSNjJIbnlvbXY1cEhWbE1ZQ21Ra2NWZ1N4cUxsaUQvQUJjaXVoQVdXMThzdU01NUo3SDBybkx3R0c3YU1udWVmV3RNT3VoaGpHbWhtcFNoVkRXNmdZNmtBVnUrRy9CVjc0aDhJM2ZpS3h2N1lHMC8xbHU4Z0VuVHFQV3VkbVJTNEROOHBIcld0b3lUdzI4a2tVbnlNT1J1UFN1dDZIa1BWbExSbzRoT1V1bUJBWTdOM1hOZXBhVEZaMjNoS2JXOU5sajgrOEsyZ2ZQelJxT1dKNDR6WGw4VVcvVVdhTnQvT0R0SGNtdW84SWkrc0xtOTBXY1NSeWxSSXNiTno3L2pXajJNYjZXTXp4VmR6MnRsTmJ5WGtrb0hVTzJRT25UOHFnL1p4MG4rMVBpdnAyWTl4RndwQUEvMnFnOGZYRHcya2liZUNlUFd1dS9ZbTBqKzFmaXZiR1JNaU03ODQ5S25HVDVNSEorUm5RVjZ5UHFueDNxSSsxWDl3RmFSdk5BTzBjcXFnRG4ycm5GMUFpM2p1TE4xSlpnTmpZd2EzNzI2MUswL3RtNWpFWGt2T3dsM0tHY3JuR0Ixd01aL0VWek52YWZiTDZPSWZLaXFDQUNldi82cStKakgzVDNKdlU5UytGRU4yUEZGcGZndCs0Z2xrSVQvQUdJMlk0cnkvd0NQSGcySFVQaDdIclZ6YjdvNGRJdXAyR0d5VHMveE9hOVUrR2NGOW9PZ2E1cnlBTWJYUXJnUitaemt1dmxqSEgrMVQ5VXNwOVgrR2RqQnFPaGg0NDFFTnpMQW00ZVVWNXl2Zk9ldjByMU10YWhMbU9QR084Ykg1cWFUWjJtdGF4RGJYa3Zrd2pCbGtWY25iNkFldmF2dWo5aGI5bUJmRzlzdmlqWG9JTkowS0dMZEFiaUlNN0FLQjVoQkhUbjhLODdoL1pQOFA2bjhaamFhUFpyRm85bW91TlNFUkpWV0djUmpkeUNjWnpYdlB3NitMWGlYUVBEdXAvRC9BRUhUOTBNN21PRm80dHpxcS9MZ1lQb1R6Mk9UNlY2R1lZMXRLTk01c1BUUzFrZWUvR3J3cm8zZ3o0dXorS3ZoOXFrVnpwTmd4aWE0M0twWld5T0FSeU9PdFk4ZnhZMUVNQmFhbzdQTXhRRGZ3dkdNZkwwSXppdllOSy9aWCtJdnhKMG1YU0g4RVhzeGtMeVRRdzRhU1RhY3FObytiamNNZmxpdk8vSDM3UDBQd2kwTFhZWmRHbVc2RXNmbHlYakZaTFhZK0hYQndRZVFNRVpQUHBVMGxTcnhYTTdzMGQ0dlRZOFAvYWg4UTNWeGUyT2lSeUxMYlF4Z2hFQUMrWWVveHljZTFlRitJTGJiTGhZeU1nSG50WHF2eDE4SWF4b09wV3VvUERKOWx1NHQ5bmNLRGlVWjlUNzVyekR4RmNUeVJocHBBeEE0cjI4UEZRZ2tqaXJPN0tmaC9UTHE4dk1XMXU3QmVyS09Cem5OZlh2N0lHaTJ0MzhPZGNTNXlndUx1TkJKbmtZQk9hK1N2QjEvcVA4QWFxV2tOdzRSemhrVThFVjlpL3M2UXJvM3d1a21LcnRuMUY5MlBaY1Z3WjFKcWhZMHdDOSs1Nm5vbGhMQkVscmNYc3Ntd0tWRWh6dTZZSUI2OURYb3ZnWFZ0WjBuUXZHalNXOGNNV20rRTVwTGVhS01CejVtSXdEK2RlYTIrdXJkM2R0S0NUaUJWeGdqSnIxRFV0VnRyWDluN3hSY013emR3V05zemhEOXhwMUpIdDkzK3RmSVdYTWtldkhxVWZoSDhQTEsvd0RnNWIya3orVWY3TXZMcVdVRnNuT2VvNkVnQ3Z5cThaSkduakhWRVNYY2d2NWdyZGMvT2NWK3VYanUyc2RNL1pqdkxQUWJpU0c5dC9DVFNUVHhmS0R1eXdYbmpwM0Zma0RxSk11b1RTY3NUS3hKSTc1NS9XdnVjSEd6K1NQRnJ0eVh6R3N3QXgvS2xHTWNVd3QySDZVZ2wycjB6WFdjNUtUbE1FOTZQWlIycUpXMzR6d2UyS2tRbk93bkpORmdFUFBIVDZpbTdEbmhnZm9ha0tFRHJUU3VQbnp3S0JqQ09lZTFBSUJ5YU01UFRta2NrS1NEMnFsRmllaUZNeVl3S1k4cWxTdFJFSHBpZ3FTTWJUV2lqWXpjOUJmTXdCZ1VlWUNjQS9UaW03TWNnL3JTNHhWR1lqNTJuTk1xVGcwamNnMEFDTHVHRy9DbktIQUFUOUtSQjBxV1BHemF4NzFEZXBhV2d3K2IzQm95L1phY1FwSkc0MDVGWGIwbzVtVnl0RFVENXlRY1ZKZ0FZcEZBQXdEUmtkS2xqU2R4UmpJcHcycTQ0cG85YVJtUFQ5UlVyVXA2SFkvQ202UzBhU2FWQ3lKT0dLZzhrZFA2MTY1K3ozQUw3V2ZFT2ozVjI4VnZOQWhtaVVnWnlTY242ZjByeHo0V0Z2dGMwWU9PTThucFhwZnd4OFNXZmhyNGhYWWtoWjF2dE9LTDVhL3g5Y1Y1ZVBqZFNSMzRaKzZqNmIrRU9zV21tYVpCZGZhUTZINUltd1NSeVB4SFRPYSt6UDJMOWJpdnZFUDI4WFRLTHlPU09XMlk1VWp5K29HZVR6ajhhK1B2QW1rV0QrRzdHZTBnU01RMmlFcGtnbzMzaVJ6My9yWDBmK3hENHJYUy9IdGpaYWlqSkZIZVpnRzNIeXNRcDV6NkhOZkhZcGU0MmVqUmFVckh4ZCszbEN1dTNOd2xsNFpzN0t6MHZVSFZQc29KMzdpUVdiUFFncjA3RTRyNDc4UWFXME1yRlkrNURIM3I3Ny9ibjhHSFNQRVh4RDBqU1FKRGEzOXgrN1VaUHlUczJlaDZLUlh4RnFyZWJwNWhsdDFETWM3c2ZyaXZzOHZxYzFDTFhZOHJFUnRVWndUQW81SG9hOVErRTNqcVR3ZkpGcVdpeXVZWkdSYjJKU2N4bm9XQnp3U00vZ2NWNXBxRWZsM2JvRDBhdTArRGVpWGVweVhqb1RzQ0FiZVNDVDJQNFpGZWhpZVYwRzVISlJ1cWxrZm9mK3lIKzNYZGZDZlZ0TThUYUFMWnhheDRuZ25pVm9yaUp3RmtobGpKQ3RtTUVkRDE3VjJuZ0RSLzJYNXZqOVA4VWZHZmgzVnZFZmg3WE5Ra3VZZERrMVB5QmFXMHBKWmQ4Unl6eG5sZllESUhXdkh2Z3QreDM0aytKdmh1MGV3K0cxbEZIc2pQMjJmVUh0RkFCenVMTVFEblBVREhGZXphVit3ZjhmOEE0WFBaWEhoendWcDNpZlRMUlo1N2lMUXZFcTNzOXJMdElMaER6dEoyOUFjNUlyNDZwVWpTbTNTbFk5aUVIS05wSThZLzRLci9BUEJPMjkrRy9pS0R4WDhPek5xZmhUeEhhblV2QSt2aU5tVzV0ejk2MmtZNEFsVDd1UHg3MStkYldGekRmblQ1b2lrcXkrV3lOd1EyY1lQNDErNWZ3OC9hWDBuV1BoVnFmN0luN1dQaGlTWFFmdERmWkd1TGRsdWRBdkQ4cVhNWG1jcW93ZHlkQ1B3cjRsL2E0LzRKMjZldmlHODhRNlRxeTJWMHR4NVVzaUJXZ3VBMk5rblVFQmwrWU1COWE5ckxjeFRqN09vOVR6c1JRYWxkSG12N0Zkei9BR0w0d3VkQ3VTeXU5bERJdU05UWNaL1g4cSs3UEFabGZUYk9XQldlVkpBUTY1Qzg1R2ZwMnI0SDhBUngrQi9qNVlhVGJuZWdzR2daUVNkeFVIdjM2VitnSHd4MXFXKzBxTVJ4cXFDRUJreGc1d0R4NmY4QTFxK2R6dUZxL011cDYyQ2xlQjd2OExaYldiWGJDMnViMEdLM2hSSVEyTUJnd0xBa2VuUEhmOGE1Yi9ncVQ0ZHQ5TnVqNHJNV0pKcmV6UElJTFlSaHdjKzFibncvdHBMUjdLOGd1RVdNa0ZWWmdXQXh3Zno3VlovNEtWNlZjYTk4S3JiVmJpRDUyMFMza2prUFViV2NIa0RyOUsrWndjM0ROWVNQUnJMbW9OSDVUZUtKV3ZmakY0aHR0UWw4dDB1UkpHQTMzVktnanQwd1RXZDhaL0RGbXRuL0FHbHBNeU9peHFReUhnRC9BQjVOWC9peE5xZGorMGdJYmRGWk5TMEczbHc2a3JJUXBVam5wMHFEeERxdHJxK2czR2l6d0xielJvUjVSUEhHT1IvbnZYNmpMV0taNFZIbVRhUjVEZG1XM3VZVU12SXh4NjFjdllESGZRZWFQdllKeDJwZGN0N2VKN2RFTzZYR1d3ZVJVL2lLNVcxZlRyOWtEcUpRR0E3ME9TdFkxVUx1NWVzTlVpWXoyc3NSMmtkeFZqUTU0SUxlVjBibFRuUHBVK28zRmpxSy9hcmEwRVFaZXc1cURTN0ZVU2FQb053d2VlZWE1WlJSNlZKeVRSV3VyaFUxR0tWcGNlWWVjOFlHYTZtR0g3TGNSTkRJR0JYcjZDc2V3YndzR24wM3hKbzA3VEUvNk5kUVRZYUxwMUhjVnFSeVd6V3NjTVh6S2luNS9USFQ5S3hycjNkRGZETzlSdGtuaSthV1B3MFM0UHpYQ2JTT3ZXbkxOY3hhaUlyZ2p5ekF1TWYxcXZyNHRyblE3WXZPZitQaGNaYXIrcFdqTSs5RDFDNE5jS1NVRHZrM0tkeUxWSVlYaStRamJ0d0JWalFyeUg3Uzd1cHpHVlZjanJWS1NEZmVSdEEyVmlZYmdmclUzMnVJYTAxdHVDdWNFQmZYMXpUa3ZkRkd6WmdYdXBSUytLdFJzTlFzOXltNEJSbCs4dlR2NlUrS1JyUjNSN2d5Um5vcEhJcXRyRUlYeHRkbnM4Z0pQcnhXaEFiYzNycmdGZG5QeThWMXExa2NOL2VZeTAxR1FTSTFwOG56RERFWklxZThuZlZOVG1hNHVROHNhQUZpQit0VWJLYUd4dVVra1FZODNiZ2pwV2xwdGxidmQzazZqRzg4Z21pcEZMVXVEVEcyTWhqZEY4Z0VCdVhqNDU2VlYxR0xkcUV6dkpnTUFTYzhZclV0TE5iVUxLMk5yTnh4VmZVb29ialVGUUo4cGJCOXFpbnVWVVh1bVBwMHNrTnZMYTNsNFpqNWdNVFk1QSt0V0pkUjFYK3ptdDdlK1pVVVlDZ1ZOZncyVnZ1UlVVTXZUQXF2Rk9ZOUxZdkhnRnNZcnFqSzV3eVZqSTFCV3ZmRVRlYnd3aS9sV1RvODd5WDBUcy9LYmdQenEvcWt1ZFhra1dYcmtBanQ3Vm1XcWVSSEVXWGdsdWZYbWpENm1XSzBXaDIxOTRobXN0RzAvUVV0Zm0vdEpMb1M5aUFPbFlueEk4U3ZkNnBLUEsrYVZFWkNINk1QWDhLMy9GTUZwWmFYNGZubGdKOHhpTWhja2NmbFhGL0VFeEpxWUVBSVVyOHh5UlhjMWRua3didTBTWEZyTmM2WGJhaGVLTnpwOHZINGYwck0xcTVGdUlXaGZEQitncm9kUWtTNitIMmwzeWM3SGFOZ0IzenhYSTZneXozRVpCeTJRS3kzdWRhdEN5TjI2aFpJaFA1ZytaZnUrbkZWNVlJMTAxcEVIM3VvNzVxZlVTa3NRSDhTb09BYWFzY2E2UWRyQXNlY1o1ckxZNkd6TThPeXRQcmFxeS9kSjQ5YTByKzdjWFVnZHVFUWhSajhLenZEcU1kWWN0aFNBZWNWZDEyTUpsZU1sTWsxbk96cW82S1Rmc216bHIvYkl6T1BYOHEzTk1SbDBDS05KQXpPNXl2b0t3THR5Z0tnZCthMzlOd3VpSzY4WUl3ZTlkVlpmdTBjV0gxcXNodFpwRXZGRVk1QndSanB6VzFiUzR1Q1h0OXpZNDlxeGRBVXk2ZzdGOG5uZ210eTFuVTNEUXlTRkRnNE5jZFIya2tlcFNYdVhLcHVJMWhtamRzRXQwNkVWalhRWERQSTJOcmNacmUxalFyL0FFcXpUVWI2eU1jZHpueUhZajUvY1ZoYWdzSnMxMm9mTXprMXJTUngxMjJpQ1VxMjJSZWMrbFhyVzdlR3dZQWtqSFNxbG9GYUVwSmdjY0ExWXRkU3VvVkVSS2JQUXAxRmRhVnp6MjdFR202aGNwZnh5eFJqY3N5dXVSd0NEMzlSWHVuakIvQS94RnUvRC94TlM3R216ZlpWdHRjczRFSG1QSWk4RmNkQTQ0OXVLOGZhU3hsdDlvMHhJMzYrYUR6WG8rbStDclMvK0NNM2l2U2RlUjdyVDlRaTh5eUdkNm8zQkl4MjdtcmFNSEsxN25sbnhZdnRQdXRibWswZEpGdEhremJwTVFYQ1k0emp2WHFuN0E5Z3NYakdmVnBNaFlvanpqMHpYanZ4Qm1oYldwcmEzSHlwTHRISFlDdmUvd0JpR2UyMExRTlIxaTR0dytJWDRLazU0eC9NMXhadkxrd0xYY01KNzFhNTZsNGkxQzRpMDlKVWxZZmJycHlxRGdrQW44eFRkR3VrczVWZnlQTWJhQVF2UTg5alYvV3JxeTFIdzlvN3oyRWF2Wm93MnF2K3QzTmtFZ2RUNysxVmJOYlBWTDJGNHcxc1F5cksvd0I0QmVPZnJYeVNsYUI3UFU5VHM5WXRZL2dINGwxT2EzS1Mvd0NqMnpkUG1MU3JqcjdDdVQ4YmZHdTU4RCtCOU04TzZWb2p0ZTZwRGlLV1ZEc1VFNFB5Z2NuQk9QenJmMW5SSkxuNEdTNkZCY0wvQU1UVHhSYnA1aEErWlVETjlSeml2TWZIT2dSYTU0MXRkQ2h2cmtRYVRDc2VHa0dOMmVSNkE4ZGZUdFhwNWJiMkxremt4RHZVU092OExTYUY0VThFU2EzcjJzTmIvYVhFbHhIdUJlNFpsT1FvSXpqOU9hNTkvd0JvVFEvRDBZajhMUncyaUZTWmRxZnZISkl5Q2ZUNkhpdVY4ZWVJTk5zWVhsMWlmTVZzREdqVE44b3gxOXErZi9pRjhkWlpyMld6OEk2WkZieGhpSHVtUUZtLzNld0ZkbERBdkV5Y21aVktzYWVoOVZhRDhhdFV0L0ZzYURYWnhLN1J5SmN3bHczcGxYQnlDRDB4WDB6NDU4ZitFUDJsZjJVZkVWaDhTcjMrMVBFL2huU0liN3d6NGttVGRmdENzeXhUNmZkU3JnenhGWExvWDNOR3lFQnNOaXZnVDRYL0FCaDByeERvMXZiNmhjb3R4RkVFTW1WVjFJN0QwRmVqV3Y3UU9uZUdQQ09zZUZyRFVRMCtvV2YyVlVqazNiaHZEWkk2Y211VjBLdExFcFFWamRTaEtuZG5rMzdSZmlyVnY3TzAzd2pKZGlXeDArU1UyeXNPU1NmWHIrdGVDNjQ0bGxkaDB6Z1lyMHZ4OXFwMTNWbXVOV1R5bzl4Mmc1dzNPYzhWNXZxT21YMHQ3SWJlMmtlTXQ4aitXY0VaNjE5UlEwanFlVFhkM29kTjhDZkNVUGlDNzFtN3VJOC9ZdExhU000NlAyL2thK3B2Z3pwc21tZkRLeWtuYjVwNW5sQ0h1TW5IOHE4cCtCdnc0dmRDK0QydCtMWjR2TGt1N1YrSEdDRkhBSFQ4YTl4OEo2YXc4RGFQcGNkd3NSaTArTjJkaGtqUEovblhoNXRWNTV0TFk3c0ZIa2dkTDRmVVhNVTBVVVNCeW0ySnBCbmFleC9XdlVVMFc3OFEvc3ErSkx6VkRFa3R2ZDZlUDNLamJJVE1xZ25QUW5kMjlLOGg4RFhaamVmVDU1OHQ1dUZrQjdkUFgzNHIzUFdvTEtIOWxUV1lZQ21MN3hMcDBHNERPUXJsK3ZiZ1Y4L1orMmlrZWpGbzN0SjAxdmlYb25qRHdGNGVtdDBjNlBIWjJ1NXZsRzJNTHdPYzgvaFg1VC90QmZzMGZGYjRLK01yNno4U2VGYnRMY1hMbUc5aFF2RTY3dUNHSFFWK3EvN09zV2hUYVJjWHl2SlozMGx3UVppU0JJQXcrWEhGZFhyWGhYUlBHa054WWFucDF0ZWxzcklaSWxZSDY1RmZZMEtycHhQSnFVdmF5ZGo4TVNreU1RMGVXQis5azVGSW9mSTY1K2xmcUI4WWYyT3YyZHBmRmcwM1dQQTlsRmQzVEZrYTFCanpuNllBcmk5Yy93Q0NjbndrQ0JiZnd4UENHR1ZaYmc0L1FWMkxGUVp6dkRWSW41N3FqQTlLZUFNbkF3Zld2dm0yL3dDQ1h2dy91ZHF4M1U2bGw0SG5aL3lhbnZQK0NSWGgrZTJNdHBxVjh2SEd4Z2FUeE5NYW9UUGdBcVhYQkpOSjVYWTE5eDNIL0JKRHlNSXZpSFVJeWVmM2tJUDlLYjRzL3dDQ1JGMW92aDZMVTdQeDFNYmgvd0RsZzBHYVgxcWwzRjdHcDJQaDFvZ0R3ZjBwckprWk5mV05yL3dTeStJYzBUWEYxNHRqdDFIUVBhRW5wVVAvQUE2MytJc2x2TGNMNHdqS3hrOG14YkJIcldpcjAzMUo5alVQbEVET0IxcEdVbHVEMnI2VDFiL2dtNzhTZE9RT1BFTUxBOUNiWTgxejJvZnNIL0Vhem1NWDlzV3pFRG5NVFZhclV1NURvVDdIaGUzQnhnVUhIUUx6WHJkMyt4ejhTN056RzB0cTJDY2JjOC9wVmRQMlVmaURHMmJpNHQwQVB2VisycDl4ZXhxOWp5dkJ6bkZCUE9QenIxVWZzdWVKbFlKUHFNWXlPb1dtWFg3TmQ3WklHdU5XWW5QUGx3NUg1MVAxaW4zSDlYckhscGJKeUFLY3NtQ053L0t2UTUvZ3BwMEpDdnJGeG52aUVWQko4SGRPTXV5TFc1Y0RydWhGTDI5THVQNnZWT0VES0R5dEtILzJlZlN1NGY0UjJzTWdWOVNZcjY3Y1pwWi9oUllvY0xjeVlQOEFFUlVmV0tYY3IyRlk0Y3VHSEFGSVc0NXJ1cFBoYnBubERiY3VHeDF4MXFxL3d0ajhrbGRRS3NQdWhrNjBmV0tYY0hRckhIbVE3c2YwcEROd1JqbjFyc0lQaFlza2dqTjR4UGZhdGRMcDN3ZzhMMkZvbDNxTHRJeHhrTTFLV0pvd0NOQ3JKbkgvQUEydVRCZlRTUy9kOG8xNkI0T2pqaThhNlBmUjRiZE5qanVPdFptdGFCYjZjcS8yRFpyRkdneTV4eWVsWFBCRW90L0cyalJqa2ZhOXE1UDVWd1lpckdyRnlpZGRLRGhaTSt2UERPcXh3M01GalBiU3N4alFzRUFBSFBYOHE5MCtBWmdzZkYwQzIwM1VLNWZHQ0FEbkEvVDhxOGQ4S3dKTnFnQ3lLcFNOZm1QUWVsZW9lQTljMHpTL0UxbHFTeXEwTnE0ODdZQ2NnOGR2clh5bFdIUENTTzJQdXlLSDdaUGhLWFNmMmx2RjlqQW0yUFZVUzV0eXd6dSswV3l0N0Q3M3I2VitaM2ltMjFXejF1KzA3VjEvMGkzbWtTVUVqNWRwOXEvV2Y5c2RJZGYrS25ocngxbzl3anJyUGhLemRBcFFCbWhkME9SNjRIUWVsZm5KKzNYNEgxSHdkOFpyL1ViZTNkYlBVNEZ1WVpSSHRVNUFEWTRIK2U5ZlJaTlVUdzBVY1dMVDlwYytkYnVVVDNieUFjRmpYdWY3SEZ2b0UvaXkxWFZvbG1oaGtNOXpHeVpCMjlBZlVIaXZDM2haV0xFZCtoNjE2QjhFdmlBdmdiWDB1cDdjR0NaZGt3QjVIdU0xNjJQZzZtRmFpY2VHZHF0MmZwZDRaOGFYdXYyKzBYMGxza0M3TGFOQ2ZMUlFlQUFEZzQ5UGV1RjhUL3RDZU8vaGo0L0VWdDhVN1RTTDJKejVVVzkwZFJrWXc0SHVTQjBIdFhHZkJMOW92d25HM25hdGN4eXhaK1VGUUZBUFhuUEdlQm5xT3RlUmZ0aC90UmFWNGkxZit4dEx0TFM3dVJkZWZKTUFKQkVtTUxFSHdDUmpPZXRmSzRQQlZLbFZ3Y1QxcXRlTVkzWjk4ZUNQMjRuK0p0bi9BTUliKzAxNEgwanhwcHR3Q3NPdVFoRTFHMkczYUpFdUZBSks4bkRaelZiNHhXRnpwK2w2SmJhT1h2dEcxQ1NUU0RxODdtT0NlTUR6TFI1SHdTSDIrWkVSeGpZT0NLL01yd1QrMEZQYTNzRnhaenlXRjBqQUxDakV3dWNqdDJQV3Z2RDlpRDlwYlIvaWJvMTc4RHZpZmVxdW1lSWJkYlp4TWQ3MnMzVzN1VUp6aG81Q0JrWU9HeFcxVEJWc0hWVW10REpUcDFvV1I4NWZGL3diUDRJK09taVg2U2lTUDdSOW5EQWdkVTQ1WGpQSi9McFgxeDhHOWZqdVBEUDdtM0t5d3dwNW9ZWUdUZ1o1L0grZGZNLzdXSGcveEg4T2ZITU1Hc1J2RytuNjVINXFPTS9QNWhWajFKR2Nidm8zRmZRM3dOMU5aZENsdHJTNWpkTjVNakFkQjZlb3h1cmx6ZVB0S1VaRytEOTF0SDBqOFBOV3Q3WFZJNDNUYzdpTlNxNTZFODR4MC84QTFWMnY3WldnV2V0ZkJLenY5S21tSVR3N0tHczVuRExpT2JnajBQekhQMXJ4L3dBQjZvMm1lSUxQQVlMSXlxd0trZ25jQmsrblRQNFY5Q2ZFK3dQaWY0S1dOZ2pNNHVOSDFDM2FaZzNCd0dHZWZYTmZIdCt5eGtINW5yTFdtejhlL3dCcE14NmI0ejhJZU5MUzJXVjRvNXJHNGo5UUd5QjZEZ211SCtJZDFlWEdyUVh0amJORnZRQjFmZ25vY2NleHIwLzlvWHdUcmQ3NEpudTdXM0xKb1dvSmNYREZsTExFY0l4NmM0YnI5RFhGL0VyU1lKck9IN0xNcnNpcTZNdWNrYlFUWDZsRjNveFo0ZE4yck5IbmVyMjhkNXFQbXgyMkRzSFFjVkZyOEtTNmRhcUZ6dHVBRG5wVTk2MnBRYXZJMGNIN2xBQnVJNjFYMVcraFRUUzEzd0JJQ3VQWCt0UTIzSTZueThwdHZaeml6OHkzVEs1QUlwMmwyMHZsWGR4Skx0YU1nQURzYWJieG55WUVtdkNGa0N1VlhzS21zSUhEWDVpZnE0SUpOWVRiVnpybys5SkdSSmRHYlZXV2Rja2REeFc3WVN4eFFzWXh3RTRYUFhpdVZaOW12dVZZNHpYU2FTa3R6SElqSEdJeVZPT2xGYlpEb1N0SmtYaVFUZjhBQ04yVXpCdm52TWxSNlpycHRZUm5ndDVVZkEyam4xNEZaR29Sd3Q0TnRGY3F4RXg1WVo3MXR2RkROWndUUEp5cWc0eDdWdzFXdVZIbzAyK1ptVERPMFZ3VkhkZ0R4NzFFb2tYV3JqVkhBS3hnQVpwbDNmenRxVzhxb0Jmb0ZwZFF0Wko4eUNVcmhza0EvclcxdmRSbTVhc29hZ3dieE0xeE9oQWtVRUdyNVdHM3plRWZlSFk1clB2U1k5U0NySVhDS01BMVlubGphQXV3WlNCazU2VlZ0am1UdTJ5SFdiTldtdHJpRnRpQndXOVI3MXNhVnMreFMzTVkzSThwQWt6MHJMdHJpMjF5eFpZbSs1eGlyV25UaTMwd1dxdVZVbkJ4MHpUcU82Q2c3enVhMXE2dkVrTWk3Z2o1SHZXWGUzeGgxNkIxaUdXbjI3VDZWTlkzclc3N1plY2RCK1ZVTHlZZjhKVFpramhuM1lIK2ZmOEFTczZhdEk2YXpYc2l0NHJiTjR5eHlGV0xrNXpUTEcya2swa3JjUHlEa1VlTHlpYWtQSzY1NXhVbDBYdHJhSW9RRmNZd1BXdWlPeHdUV3JPZm10MmsxTWtqanpEa0g2WnJQaGttdVdFZWZrUmlBQjlhMXRYdUhzTlRsMng1TWtod2MrcVlCL25XSlpTVEM1Q3hyZ2JzdC9uODZ2QzdHT05WanU5UTFTZTUvc0t4dTRnSTRia1laeHgwSDVWZ2ZHcTEwbVBYMWwweWNPREdmTkNqT0QvOWV1bzFjYWJjdytHcktDM2VLNGtrTFNTZEFSajE3MXlmeEl0aERxcHRWWEpCK1g4VFhvTFU4ZUxzeW5vbXNXSThJWE9qWEduUEpLMDRlR1l2Z1Jlb0E5YXc1b2dSaU0vUHZBQjdWb1cxeEN1aHgyQnRBazBjaDN5RHE0UGFzNlc0RDNVVVFVajV3RHgzcVdrcm0wTlhxYWMxMjF0TUlCRzBrakFLcWdaTlFmYkxtMWY3RGZXMGtETnlubUxqTmRQOEc5VjhKYVQ4VmJHNThlQlJZTVdqTXJqSVJ6OTBuOUs3MzlzWFQvQVZobytrdytHdFVzN3UvbG5hUnBMUmxiYkYyeml1Vnl0VVViSFZLYjZIajNoNjFVNmhKa2trRGpGWGZFclI3akhJQmxZYXovRERrWDExSnZQK3JCd2ZXdFU2RmQrSzViaE5Pa1F5b2cyeHlOamRtczVMOStkTUtpVkE0TzVjeXNXMjhBMTBPaUZqcEM1SDhRd0QzNHA4dmdlTzBaeDRsMXlLd0tmZGlIek9lbllkYWhqZGJEUi9JaWxNb01oMnZqQksvd0JLN3AybEJIQlJtMVdEdzBrVGFxeDM0SUovQ3RnaFlydVI4WkdQdlZsK0huRWMyNWtHU2M1eDFyUzFXUnBsOHUzZnkrTW4zcno2aXZWUFlnK1drVTlaMVBVYnZ5cmE0dUhlR0k0aFZuT0UrbFp0MndBS0hxT3RKZVhNaUtzYkVrRHFjbmltK1lzcVNwS01aVUVWMTA0MlI1MVdlckdLNFdNQmVoNytocDZsWkRFeWRRT2MwMXBFaGhRWTRQWVV4Q3BsM2c5K0FLNkZvamprOURSc3kwOHJLZ0w0L2hBNlYwdmhMVzlhMGUxdVcwOGtLVkljUHlDUFExenRyNUhMUXhHSjhja3RXMzRSdDd4NHIrTkpISUZtOG5QVGdkZWEwaXJuTlUrQzV3bmk3VVpOUzFacmlhSkZlVGwvTEhCUHJYMUIreXhvdjJQNE0zdW9UV2dLeUFLYzk4c0srVWI1L00xRmM5V0hQNTE5d2ZCU3dnMG45bld4dGlvRWwzTkhnanZqbi9Ddkh6K3B5WWVLN3M2Y3RTYmJOU1dYVDdpM0tMRnNSRTJLckQ3cHg2ZWxTYVJBWUxOVk1HTnpnRmgxeDIrdFZiclNiNkRkYzNlb1JLdTc5M0ZGMzZkYTEvQ3NFenpRMjE4dVZNaWtEOHErV2svZFBXME43eHByRjFvM3crMExUN2JPWDFLV2JKSkFPMVFwUFhyeWE1SFNYOE9lR29OUzhaM3NjMFFoek1ZN2hnNU1oWEFWU0J5U1dQNEFWMTN4d3RIc3RCOFBRUlNmZDBxNHVIVUVjNWsyOC9sWE1XZXBOOFd2QkVIZ0hTOUJqQ2FaTkxlRzZqQkxYUkNqQU9EampPT3ZQNVY3ZUNwdjZza2VmTnIybHp3cjRxYVo0cStJRjE5aTBxTXJwMEVabTFDOGtRaU9MdXhQWEdBZW5VMTQ5NGo4TDJNa3lRZUhMU1NXMmdKV1MvZFNHdUQvQUhzZGx4MC94cjZOK09PcWFqcGZnU1R3TG9GamFpUFY1ZzEwMDhlMW84SEJDbjEzQWp1ZVI2MTU1OFByYTJGdkw0YThlYUtmSmtWemE2bEhEdGFKeDJZWTVHT1B4cjM4TzFUcEpJNDZrWE9kenptRHdOZjZQQXVvdGNoVkFCS2xzRWovQUNLdDN2aVR5VUUra2FZTEZ4SGh6SEp2RW5mUE5kaDR1bjAvVWJWVWlpRHhSRGFoQzQzWUo2VjUvcjJnM0Z0YVQ2ajVCaHQwT1FaV3dXOU1BMXBHS25LN0J2bGpZNjc0VmVGSS9HOTJOUzFtODh3YnNRMi8zaVNPbkhVZC9ibXZvSFNQMk8vaUo0azBkOVZtK0VtdVdtbEJDZjdaYXlJZ3QxMmdpUnNINVY1NjlLK2VQMlp2RnVuYUw0aWVhV1llY0d6RUQxUFBZZXRmWXZnWDlyRHhOcHF4NkpwZmlTNXR4TkdiVzVzL09ZeDNVTC9LVVpEbFR3ZjVWNWVPcjE2TlMwVGFqQ0U0M1o1eDhidkRlcWZEMzRlMlB3NHN5cnBINWNOelBDdkR1WEhUR2VvWUg4SzJMMi9TMHU0OUkza2VUYlJvTnVmUURILzFxc2ZINjZ1bU5oQnFWa2Q5enE5dkhzZms3VTZIT091QXVUVmNYa2JhNTlwdWJmY3JrYlR0OThWNWRhYm5CTm5SVGowTi9TYkdGYk1UTk9BNUdmbElHUDY1cjJiVTVwTkovWmc4SVc4NkZ6clhqbDJTTWJzc2tNV00raDVZVjQxZGFWRnFGb0prY0l3WGN2UEdldkl6MTRyMjd3eG9GMzhRZkF2d3Q4SFFUQnpwOEdwM2psbkhMR1JFQjQrbnRYUGg2YW5pSWx5ZkpGczd2L2hWOTdvdmhtMjhRYVJaaU95a0NOTVZmQlVsY2tuUFFFbXI5alBZK0ZyQnRidTlWV0syU1BOMnJ2bnlzOXo2RG5zRFhzWGdMUS9oN2RmRGthTDQzbFdSWTNFRTF2YzVYbFcrVmVPZXhQWGduMHJpZkdIdzYrRHVseDNGOTRlc1k0bUEya1BjTklqQTRHM0RaQkI1QTYxOVZLQ3RaSGx4cXlUdWp6UFUvQ09sZU52RU50NHpmeFZZVzhVVWl2QkpMSnVTYnFlUFk4K3ZTdC9XcmpTZkV0bjVkcmVXanNoK2VXM1BQQTVKSFVDbXllS3ZDa2x4RG9OeDRhaWFhelFsSUxXMkI0WHVveHdPcDU0TmNuNC9PbmFycWFMcFh3OHZZbldUYTEzTEo5bkJBT2VRdkE0d00vV3BWTldMK3NWSlBVMU5EMHkxdXRWbGdUeFhZd3lXNm56WXBKc011TzJQV3FXb2ZGR2Z3aHFsekJkYTNCTzBLa3hyRStVUEh0Z1ZsNnRwbndrMHEzTjZuZzgyOTBRQk5NOTJ6RmpuUEpKNFBPUGV1V3VkUCtHZXJDUzdraXQ0NFZ6aDN2QU1aNTlmekhXc3BSZ2FlMm1keG8zN1IyczZ6YVBkMlVNY3NjYmZPUVF4QkE2ZGZyWFJlRi9qUG9QaW5TN2pXYnlSVDltWW9WY2Nid09lL3RYZ0xUL0N5enZwZE44TzZXa29rejVzb3VtRVpKL0hIUFRQdldTbmlyd2RveVhWbnBuaC93Q3hYVWNoSWt0OVRjcEljZzUyWk9SL1BOWktFYmwrMjdudWZpRDRzMnR6THVzekNoUEtESFg4ZTNlc2k4OGNmRlI0QSttYUxidEF5NVZ2UEdTTSttYThBMWo0dCtLdFFqbXNMR0tCaXF0dVl3Z0VZNmZRbjYxbWFWOFFmRjl4YmcyZXRUYjFVK2JDN2xoK0F6K2xhY3ZZWHRMdTU3T2ZHbXU2N3E2NmJxMXB0bjNmS2k4N2Z5UFN1ai80UlMzdlpGRjFieEdkVkJDbkh6L3JYZ1hoN3g5OFFFMUJ0U1MrbGtXTmlXV0hUOEwyL2licHhVemZHYnhkcU92eDd0UmRXYVh5OXhZQUordUNPMUhLMExuUGNyNzRXNjc0bGRZRjhQb2k0d2pyR0FRUHIzckU4Vy9zMDZpdG1GR0kzN01VL1RwWGtWNThldkhWaHEwdG5xZXIzME1lR0t5UlhoQUtmM2x3ZWYxcUc1OGRlTS9GcUxIcEh4UnZua2NqRWNtcUVISUdmNHVuQVA0MURVbTdGcXNvclk2aldQZ3pOcGhFY3QzQzdLT1kzSEkvUHJXVHFQaEY1dFBrMGhOR2lmY01iMFRscThyMWo0cCtLN3JWSVV0N3k5blczZmFMbWU3SlptejdIcDE1eFhmV3V1L0h2VmZJMUx3ZDRRMU5ZbWpHNXBpaXErZlRmanRXbnNKOUdMNnpIcWpuTmMrQ1dycXJ0YjZVNHllaGpyanRhK0ZYaTdUMXlOUG1BSE80Ui84QTFxNnI0azZ4OFd0T3VrUGpmU0xteW1sRzVCSmRNTjNxUUE1SEZjeHFuam54dkZLbWwyWDJocFNNaU16dVNSL3U1ejBPYUZoNWg5WVJ5dXErSGZFS0h5M2hreVB1N2w3MWl0UHFVTng1TThiRXIxM0xYcWplTGZpUHBuaHd5cjhQTFNkZ3dNMnBPR21aVk9NQXFDUU9vOStLZ2h2ZGF2dEN2TmJ1ZkRXbnh3MjBXWnJ1NGlJVVBoZHFyeHp6eGp0bXErcjFDZnJFV3p6Szd1NzE1QUlvU294MENjMDIyYlVMeWNSeTI3QUR1VnJxclU2UGQyUnVicnc3ZFNYSFV0YTNtRlBRbkM4NCtYOCthdXlmQ2J3ajQ5K3lqd2Q0b3Y3ZTlsVkZrc3J1NU81aVQyeU1FNUtnRFBQdFNkR2EzWU9zamtidTBpV0VHV2RZaDJmZmlzKzQxelJ0S2NQTnFnbUFQS0syZnp4WG9IaWY5aC80bDZib0tlSXByK0pZbFJHZjdaTnQycVNRTWdqMjV4a0N2T0p2Zzc0eGlXWXhXYjNDeHlZak5rdm1BSHNEdDY1engxcHh3cWx1eWZiV0ttcmVLVzFobmhzVUtvU0ZWZHZQMHFUVEpKN1R4RnBFNzVCWFVJczQ5eUtkY2VIYjdSM1JJOUFsdHBBaWttU0lnay9RanJ4VGpZMzBwanUvS2J6SVpVbExGY2RDRDM5cW1WTlUxWUZPN3VmYitnMnIydHQ1N1JyS3M4d0RxM1VLQjE5aHdmeXJxUERsNVo2WEJxTVd1YVM5eUhzMUdtdGJ5Yk5qazhNZWVneHo2ZlN2UDdYeEc4dWtXMWtrQmFlZFZlTmxUT2NxQ00rM3pIMTZHdHZ3M3I5N3BmaXdhbHIraHZkV2p5Q05vZ1Fjakk0R09uVS9yelhoT2kxQnlONDFrNTJQV3YybU5ZMGsvQ2o0TjZyNGRnRnBJdW0zdHZjU0s0ZkJXNEQ1SlA4QXZIcG5pdkpQSDJoM254bytKOWo0QjhIL0FBK0hpMjR1TFh5cGJTM3RsYzg1Ry9jQUZqQTlUMDZlbGZRUDdVa1B3KzhjZnNpK0RmRlhnclJHc20wbnhOYzJkMUNmbFA3MkRmengvZVE0UEdjVjVsK3k5bytvejJHcTY5b0dxejJVZ2s4cWE0dHllVUtsZ3VRU1FweDBIZXM4dnhFb1lLVTF1bXpURXhUcXBIamZ4OS80SkQvRXY0YWZEVWVMUEdYd24xUHc3NVpZcHFFY3EzRURaK1pWZGtaZ3JZT09UWHh2ZWZEYTcwUFg1OUd1cGdxUmhoNTJEd1FUeGpyMnI5by9BZjdWR21mQ1h3WDR2K0ZQeHY4QUVRdU5FMXpRWjRIMHpVYmplZk84cjVKQUdCMkhjUmppdnpuMUR3eDRCYlZidWZ4c3M4Tm5lSTRpdTRGTzFDVHczeTlSZ2c5YzllSzlyTGNkV3hFR3BvNWFsS0VYZEh5L2ZhTnFWZ3hNV29TTXA0eWpGZHdyQzFPem5RbHBHM0gxUFd2VmZFUGhHQ0RVNVVqMUhObVdjUVhKVEcvYjBKSFVIMSt0Y05xOWp1TElNRTV3V3IycVVyYm5OT0tsb2Nxck1qYmxPQ085ZXkvc3ovRWEvc3RWaTBwTHA0cGtkZkx1RWZCVExLT2ZYL0d2SHJ5M2EybktIcDFCOVJYUS9DclVKZE84U0ZveVFYaFlBNTdqa2Z5cDRxbkdyUWFNcUVwUXFINkIvdFlRYWg4WFBnZnBQeFIxQ3hWYjVyZUZOVjJBYm1uZ2NSTTU0emxsS01jOG5QdFd4OEdwN2ZUTkZ0dFhLK1dvMmc0NVZ5UUQ2ZTJQenJrL0RmanlMeDUrelZjK0VsQ2x6QVprbUtZK1liQ3hPZXJjZHZldGo0RjNsbXZobUhUL0FCSkJKT0k1RWFJUnlZS2dZL01Zelh5V0xnM1FzK2g3T0drdmFYUHB6NGNlSVYxQzZ0N20vczBiYWllVW9HUUNPbUNUMXI2Vm44VmFGWWZEYlRqcms4Y052RmN5Um1hWnZsSG13c296NlpPT01Iclh5cjRmZ1RTdnMycVc5MnJSTVZLb1FjalBQNTlhOVk4ZVc5cjQwL1o1YlFaOVhaWk5TdmJhTjRZU0VlSWJnUVNhK0x4Vk5MRVJmbWV4QjNpMGZDSHhoMXA5YnVmRkdrV09QSnViRzdpa1hhR0pVRmlCOVJ4MHJ4blI0b3RZOEpXVThiUm9SYXFyaVk0eVJ4Myt1YStodmlUNE8wN3dIOFU3KzAxUlN0aXlUbmRLTjNHQ09lZlZUMDdtdm5nMmRwcVBoV08xMDNKVzFtYU9aa1lnQkMyVjYxK2w0T1NuaFkyN0hoU3RUeERaeGQ5SkM4MHRuSU1TS3h3QjBiM3JuUEZrVFIyYVF5RDVtY0VDdWcxR043SnAxbVhsVytYUFA1VmdlTUxtYWZ5VzI0VUtEdDcxdEdPcHRVbDdsemRpbE1ua3NSamJicmdtcDdPNWhaSjFra080a0hnZGVhemRPdUhsMEZMemVHSy9LeFBwVmkya2pzN05yMlhvN0FjbXNLa0xzN0tNNHFLWnp6M2p4Njk1cFVuNStCK05kcERjdFpUUVN4SU5raWpKUHJYSTNLS05TYzdNNGZJeDJycExtYWFUUklwWW13VUlKSVBQU2xYajdxSncwM3pNNkhWdE9objBPMWdWdGtrazU4cEc2YzFiY1EvMmN0cXNnVjRWd3lrYzUrbFVOV3ZKTGJSdEl1d3Bjck9Ed09hZHFPcXh5NnhpR0YwZGdHd3d4ejYxNTg0MzBQVmpOSm1ITXhiVkZVc1ZZdjBJd2EwSmJvVzBqa0xsQ3ZKcUxVMGwxWFdvcjJWaXpxZHVlbWNWR0xtVXpYVnVZQXlJcEpMZGpXeitGR005Rm9VWjduZHJJbmpVZ01vNHE3bGxSM2VYY3JEZ1ZuYWxkWWxSeENGNDZDdEhUcG9ablMxQlV1eVp5VFdpWHVtTVZ1VTlGanRyTTNCRWhVdm5BcWJTQXo2ZTRsemtTbkdlMU5leW1obGxsQzVBem5GUytHNWdMQ2N5SmtoejJxWlhhSFNYTElpdUpwYmZWNG0zSFkrTUFtblgxM0Mrclc0WHJITnpnZEFlbFQzVnZIZjJ3bDVESTNwMHJUdWIrMHY3YTNzbnRJVWExaENDZEV3MG5RNWJIZWttWEs5bWpBOFhxajNLdS9ISFduYTA4ZjhBWTFwNUQ4NUdTS2I0MkN1OFFqYklQY2RLaG11TGU0dEliYUVaOHV0Vm9ybUV0Wk1vNjhnajE3YWVUa0U1NmQ2eXJOcmR0Um1pVEdReDU3Q3R6eGlzTnY0ajh4QVBsd1NLNTdTaXR4cjByZVhnTXpaVUdyd1d0Tk01OGU3VHNlcVgyaVh2aUN6OEkyK2liV3ZYTXF3SWVBMkZ6alBTdk5mRUIxK1h4dmRhZHIxbjVjMXFXRWlnY0ErdkhiTmRjTmRnMGFQdzdxOXBjWEZ2ZDZiZHlLWmR3S3RrY0VEOUtrdXA5THZOSjFYeEhyTjlHYjI0QTh2ZU10SXhKL0RyWG9JOGUycDU1TEtZYmd2amdOMC9HczJhZlpxUzNqcmdiZ2NEbXJkNWNNdDZydkNTb2NGbHg5NzJxTFc3aTB2THdYRUVIbHFRUGt6UkpGd20xb1B1OXQyeGZya0R2VFpJaGtRdEprcXZHVFRyS0lUSjVaRExqdWZTckF0NFRMNW9Yblp5YTU1V082Q3Vpdm9SS1hzaEFPY1ZKcmQxZFFPVERJMGJkaXJFR2pTQUUxU2VRZGs0R2Facml0ZGpLakI3VkN0N1UxMnBHWFBMZDNJRWswaGNqK0p1VCtacTRBMzJaSTBVbmpuMHFMN01VdFBMRFpJSEpwNjNqSkFrUFRIVTF2SjZhSE5TUzU3bWxvOGNFVTZxVkxiaDI2aXBmRVBsVzRTVkcrVit3TlE2VklzZCtvVnYrV1o0elZpN3RwcjFmS0NndG5JQjZWeFMvaUhxWHZTTWk4ajNiU2NFQWZsVUdFQUtxTW4rOTJGV2ZJY1J1OXhJdTVXMmhRYWdrUkV0MmMrbGRrR2VkVlpYbmlaMXdxbmoxSFNwZE9oODY2U0NOSGFSdUVDRGttbFM2c280RThoWkdtQS9lay9kL0NyZmhRK2ZxcGxTNDhneFJzNnNvNUI5cTJPT1FDT1NDNmRkakJseUdqYnF1TzFkajhMUEVGcFp3NmhvOTlHaWk3MCtWSWJsditXVWhVWUJ6MUI2WTk2NWZiTzBqM0VwTWpPU1dadXA5NjBmQzJubTYwclVaUjhxd3dGczU2bXRWc1lWdjRad0R4UEpxOFVJanpoaXBDK3U3LzY5ZmNuZysydk5PK0hHZzJGd3ZsS0xBU3FwT054SUZmRkhoUzFPb2VLWUxaUVR2bkEvOGVyN3pzSkxhSHc3cEZwZW9DdHZweWo1bE9BY1Y4N3hGSk53aWR1WHh0U2JNWk5QdlJmeHUwb01XZVYzSEkvRHVmZjBycXJDRm9pZ0NZSUlLc0ZyQXNkVDBwYjUzbFRhcnQxOUJuMi9DbjZkcWNsMWVTcTVkUkJJTmd3UHVkKy9YRmVEeTh5Tzdtc2pxL2pQbzJvNm40ZzBxMExzWTQvRGRzb1U4WjNzN0hwWGEvQVQ0QTY3NEMrR21wZkVHS0NLVjVwLytKWXJLZHdLZ3NwNUdNTWR1ZWh3cHhuR0tpOEhlT1BoUDR3bGhmeFl0M1lYbHRhQ0ZiK0J3eU9xQWJjeHQxNzlEWGZDQnZGWVRRckQ5b0xRTGExRVpqdDdMVUxTU0JXeVRqSlhJNk1UbXZab1l1RktDaXppbkZ0M1BuUDRoV1drNi80bGwxN3hQNEFTeWsxTzFMaUZ5REdiaUppSFlIZ3FHT0c5T1Jpdkt0YzhDYXRQcjl0cDF0Y1FwWnpaSlZBUGxYSkxLVHhudDcxOWcvRi80Ri9FM1JmRGNlcFhmaHVIVjlOV0ZBbW82Ukl0MWJrRW5KSkh6S0NLK1pQakw0V2tsdFk3dXdXV0pyU2ZNbTE4WlhnZER5TWNERmVuU3hGT3BHNlpscWxabVI0TytGSGcyd3VMclJkUXVJcnU2bmZGdkp5QkVoeUQ5M1BQSTYxNWYrMHYremQvd2l0bU5hOE82emNYUlFqemJhY2s3aGdjcXhBSGZnZld2c3o5blA0ZzIvd1MxRFRQRUdrZUdOTnVKNFZSM2UrMCtPZmYwT0NKQVJuaitWTi80S21mRkdENDMrUDlQMU94OEZhSG9sMUw0WHQzbHROQ3MxaGpsYzd0c3JLdkJZanIzelVVTWU1WW5rU0ZXbzJwY3grWEZuY1gybHpDN2drYU5rUERJMkNDSytnUDJUUEV0ejR3MUtiU1BFUU55WVdqK3pTTVBtVGtkRGtjOUs4cnVmaEQ0OW44UVQ2ZGJlR2J1UmxkbWJNQkM3Ums5UjA0RmVzL3NoK0dvYmJ4RUdheWxqWXZ0dXQ2WkdNaitYSXJ2ekNkSjRlL1U1Y0twODlsc2V0ZkVpUzV0UEgrZ2VIZFF2M3V2M2J5bzhqWjZSNEhUNlVpM09wdzY3YmFXMWx2dHAzQkZ6akcwOWNWUitPZC9hYW4rMERZTnBFdUxlMXM1VVJVRzAvS3VEd2VuSngrRmJGbFpYcTJtVGVxMDBaM0x1Nlp4MHo3amo4TVY4L2lIR0xTUFNwY3pnMmpkMUhWTGEybmpzSm8zK1ZWTE1CMEJQSEhldnFMNEUrR05iOFpmQ2JUdkYzd1VrVFUvRW5oZTBudDlTOEt5U2dYVXR2SWQvbndMd0pBT2pKMTU2VjhvWEd2VzBOMURKZXhDTStUbHVBVko5TTlxMi9BdnhEMVRTOVlXKzByVmJpMWtqSjJUMjg1Umw5d1Y2VmhDYnB6VTBKYzA3eFo3djR1K0xueDh0OUxuMHpVZmhuNGd0Zm5mekZrMG1ZRkhJT2UzYm44Szg2MUQ0a2ZGUFU1djdOdnRJMXlKNFl5cXNOUGxEYlI5UmpCNTZWdlEvdEEvRTk0WlJQOGFmRWNKSnlpZjJpN0J1Q08rYzlhcWF2OFQvRldxcEJMTjhYdkVQbWdoSkpudXl5N1R6bjg2N1ZtZFo5RE40V0VUbDVOUStQTWVzM2V0K0VQRFdzMnozRWZsTThkakl6c2lqcHVPZUR6eDlham4wajlySHhUWXhXNzZCNGxkeE11SkcwK1VrWlhCOS8rQTR4WFYyWHhaK0lmaDYzbG51UGpKcVlLc1NnTXBPNWNFWjU5YTdYUi93QnB2eGhZV050OW4rTWMxd1pWQlhkSUF4WWNFWUlQcldWYkc0M2x2RkkwcFJ3NmRtanhWUDJkL3dCcEc2dmhxL2lEd2pyODlxMjZhNXRwOVBuR2M4RG5uNjU5cXBYZjdLUHhnMXFhZDdQd05xZHNJcER0aHQ5SnVaRU8xUWM1WVpIVDZISnpYMVBvZjdhL3hGMG0za3VKdkVFTjNGRkVRRmtUWXhHTURwZzllU085QS9iTCtJRnhiZ3hhaVkvTUhVNXpHM09TT2ZUOUs4bXBtV09UT3lOTER2b2ZNdHQrejE4ZnRNMHVLenN2QXV2Mit4Qko1djhBWWMyU080eGdqbkhIMDYxVm44QWZFQ3owYTQvdGZ3WkxmWFdUSENaOVBsaGVNNDRCK1hCSXhuRmZWMmpmdDNmRnpSMmFCOVpXWlZCV0VObklYZzR6M0JxWFQvMjJ2aU5GcU9vYWxjM3NVaHUzODJPTXdLNnh0anFBMmVEbnY2VW81bmpXOWh1aGgwZkQraitCL2lMWVROUHEvaDI1WVRBdDVTS1ZHTTlPbkk2OGRhbjFiUWZFTjFJTG5UZkF1dUpGRTZwTmRKYXk3QjFHTjJ3QURzT2ErK2JUL2dvWHJ0djVGbnIzZ25RTlJpUlAzcTNlbUl5a0JzOWNjbkZWbCtNbjdQZXQrS28vRmVwL0N1NXZJSFZtdWRCZldwcE5PdHBTVkplSzJMYkZ6eWR1TWNWMHJNOFhIZUpuN0tnOUVmRTlqOFVmaUpvMXFtaTZkcDFnSUlZc045bzBwSGZBUFVrQTg5dWVheXRUMHJVYm0xbjFlZndMcFhuM1lLbVdTMGsrWGNPWHhuSFQ4QjdWK2tuaGJ4dCt3QjhRdFhodExyNFVhTFp6R1RDZWJZZVNkNE9jWkRZeDdldUJYTWZ0Y2ZzKy9zYmVMZkZtamFyOEtmRnR4NFhOdmJ0QjRvMFMydEdBRW9JS05HMGhJQk9TQ0FjRVVSekxGVGUxaEtqUnVmbjdxRTNqWjlMaDA2NHVMZU9Dd0cyMmlGcW8rVEo0M011U3Z6SGh2VFBhdFBTdkQzanp3NHNGeDRPMW1JUjNVT2Jwb0xDM3dRT3ZWU2NZNDdkNjk2OFUvQXI5bWM2bkREYTMycTNzRUorWm0xRUFPZXd3T281SFRwWHB2d2MrSWY3UFA3UE9uTnB1Z2ZEV3lubXV4bFpidk53M0FJeHVmSUhVNUlGVkxNc1hCZTd1VXNOaDMwUGtPNHNOZmlrZ3VyajRkYVNMb2JRTG1IUlNyaHM1QndBQVRqOFBTdWMxcjRPK1BQRXVveWFoY3g2ckcwbUpoS3R4THdNOEtCeUFCMDROZm9ScXY3WG1tM2tJazB2NGI2V2hSZ1VKdFV3dU9SL0NPM1ExdDZkKzNmb053YmUydXZBRmxiWFJIek0xc3JMajBIQTl2eHJDZWNabmJTS0tqaE1LZm1wRDhIUGpYTnFVT256VGF2ZDIxcXgyQ1hTWkpHVURCSUVoUThubms4ZmhYcGQ5NFU4YVhud21tK0ZPbS9CcjdGOW91b1o1OVFiUng5dExvQU1MS3ArUldQUlIxT2VncjdpMS93RGJNdXdmN1EwT3gwdTNVS1RMRUxOU2NaNUlLODlQZXVjMDM5dERWdFAxaUx4UkpwR24zTnUwVFc1dHpIaHQyRGgxenlCNkRtbERPYzEvbFFTd21GdHVmRS9oWDltUHg5bzRNMmwrQnJ1OWxjRXRiWFZxNWhEanFIQ2M1K1hBQnp3M0pOYzlxWDdNL3dBWnBvTFc4OFNmQ1JyQ0NDODIyOFVPblhNVUJ4MDNBNURNY0RCN2o2MStpZHYvQU1GQU5ZdG5rbXROTnNrTGg4RVFMKzdKSEl6M0dQWHJYUDhBaUQvZ29QOEFGSFVKbnQydmthMmhsRHh3TEVwUlFvNE9PNXhqZzloWFRUempNbjhTUmxMRFlSYkh4RnJmd2QrS1BpSzJ0TkpuK0ZkamI3UXBSTkswTjBlVCtIQkdNa2Z5cmF0ZjJVZmpob3J4WDBmd0Y4UlRUdGFQNVliUUpRaU8zeTd3d1hPUmhUNzRyN0cxWDl2RFVQRnVoblRmRW5oMnl1QThlUHRCdFZWMHljN2xiZ2crbmV1YjhNL3RTZU1mQldzM05wb25qZld4NWloNHpjYXZKSjVhNXlVNmtESEEvU3FubWVObDBKVkRESkh4OGYyVGYyb2J2VjRyZnhINFI4VlR4d2crV0xxM25LaFEzQXdWd0FNVjZPUGdkKzBoY2FmWTIrbWZDSTJrK251RDlxdDlHWkhsQ3BqYTNBR1BUNjE5RGEvKzFsOGJmRlVVdG4vd3NqVllDd3doVzZPVlhIWElIVWdjbXZOci93Q092eE04UDZuTHFtcy9GUFdVbERQei9hRXBVNVhPUjJOT2pqOGJVZGtaMUk0YUMxUFB2aUI0YjhkcllDRDRsL0NwWWZtVUt6MkJSc2ZYQkFPYzU1cnlmeFg4Q0U4VFhZaTBId28xa0pFWUZwNDlnQlBUQVBUdFgwSDR6L2FRK0tIaTNUN1J0YzhVM2w3RGFSNWlXZkJLNE9PVGpMSEJQMUZlZjZkcnplTGRiYTd1THE3ZmN3OHladWlEN3d3UFRvUGF2U1ZYRU9Idm5JNVVtL2RNKzB0ZitFY2owclRvN1B6TG1HMVJaWlQvQUFZVUtSODNIUWcxcGpWTk9oMUNPMVNLUXlNZG9VTHVEWlBHUUJnZGZ6cld0cFpMN1M3M1E0VlZyYTVrSythMFkza2V6ZW1CV244T1BoL29laDN4S1FtUXMyVDV4M2NaSFQwUHZYSFV4RUl3Y1dWVG95Y3VZOVgrS21pcXY3REdwWENNVDVQaWJUN3NvckRDN28zalBiQTZnZmhYbkg3TTNqS3g4R2VBci84QXR6U2pLMTJKZjdNZEdRR0c3VmZrWWcvZVU4akhUcjN4WHAzaWlPWFdQMlpQRmVrTGRueTBqZ21oVVlZRHkzVTVJQTRPRFhpM3dJMCtQVS9GbGxwa0Z3ZGkzc2FNVG5ia3Nja0QxL0t1RExwUmhoNmtaZHpzeEtibkZyc2ZJbjdXUHhHdjdQNGg2dnFXcWE3ZDNXbzNWKzBvbGxZa09EenRYQndFQjZBVnkvaDc0eERVL0RQOW54YS9MQk45MlN5bGozcVFNY3JuUE9CbXZXZjI0ZjJiZFJ2ZFRuOFUrR1FKbTArOXVMTzZpWW5QeVN0Zzg4QTQ3ZDYrYi9CdmdpOXR2RXNjR3FRT3UyWUs0WWVoR1IrVmZZWWYyTHd5Y1R5M0tUblpuMUI4TWYyY1BpRjhUdmgvYTZyZWVBTCtYU1BPWnJXZXl0Y01yT2NGaGpMRUVaSXlQeXJ5cjlwWDlrTDRnZkRLM2w4UWFSQTJwYVVIYmU5c2hNc0FIVGN1TTdlUno2bXZ2VDltUDQ3MitrK0Y5RnRQRGQyOXRCWlFSTEtxS1I1UlRuYU1IMEpPM0dDUlhzSDdhdHA4UHZpcDhGUERIeGg4RzZSYmFkNG5qMUgreXZGbjJPM0N4WHlGZDhGMnk0Q2lUT1ZiSFVkYThham10Vll0MDVyUTdLbUdYczdyYy9EaXcwZS8xZGNYRVBDdGhTeHhucG50WG8zdzArRXR4SGZRK0lMaXh1R2loa1ZpQkdWQkJHTWp1ZndyNnhpK0Ezd3YwL3h4SW1sK0NZOVIxUzRuTEpEQ25tSGR1QStWRjRVNUJ5ZWxldlFmc2hlS2RlMGV6bjhSV2VpK0g0VXd6eFg4cGFjQVo0RVVZTzBqZzR6WGJpTTBwdzBNS1dGbE04SS9ad2cwM1R2aDVmVytwQVJyRWx6R29sUFBRa2VvengxK29ydlBneG9FemVGN1hXYnB3TFdmb1FBZUJrYzRIcWNWM3cvWms4RzZEcUQyeDhjV2NHbE1oYTZXd3NaZHhPUWVwUGNZNXJMaC93Q0VKOE42ZEw0ZDhJYW5jMytuV3FzTGFXNGhLdG5nbmp0em5tdkdyWXVGVldSMzBxVXFlNTZQNFExZXluOHVTSmsyUktpd0s2L2lNZmoycjI3U21mVWZoZmRYRnZ0akZ2TkJNQWd5QUZrWGs5UjA3Vjh1NlRxT2RHRjFvc3FHZDRmM1JjRXI1blJjK3d4NzE5Ry9zN3dTZU52Z3hxbmh2eE15M1Y4ZExtRTBsckhzUm1FZTVjQlIyd0J6am12bU15cHVLVWtlcGgzemFIenQrM3I0RHY4QVNQSE43YndNUzF5SkNoL3ZiempCd09CME9NOTYrVGJMVE5SOERhZ3RucTA4Y01Pb28wYlJsOTIwTGdyMTZkdWErNC8rQ2lXbldWenBQaDd4RG8xb0lVMUhTNFpsbERNVGhvaDY0TFlJQnpYdy93Q0xiRFdicWZURHJheUNSWTNlQ1dZWVYxR0FjZW80cjdmSjZ2UGhJbmk0eUxWWm5BZUxJaEhxKzJHY1B3UHZINzFjNTRvUjcrSUVCRlpCOTFlbGRENHcwNXJLNmd1cEhCM2taL3orRmM3cTAxdE5FMTNHYy9OZ2sxNlY3U0xhdlMxRThPeWxORnVZSGM0emtacFlacE5UV093OC9oWHpWZXpLdzJVc3lTWkRMbmsxSDRKbnhxc3JzQ1NGT0I2MFNWOVFweTJpYUVzRFJ5Tys5Y01kdnpWdFdpTEhwK3k0bURLUjJQSDZWUmVDTjh6R0xkOCtTcHFHeGtlTFZqYnFmM2NpRTgvd211YXBlYU95RnFjanE0TlNXUnROc0xlUkhLTVQ4NHArcW1RNnZIZGJ5ejc4RVk3VmphUFlUM2wxOXV0NVBtdHNsVnoxOXF0NkZyME9wYW0wMXpFUThiY0tSMHJqY1R1akpNa3RMbFRxYnk0NWpsT1Z4eUtmZUVDRzdsUWJTNjVPS2gwaWI3YnJGeko1WDMzUEE3Vkpyb3RvN2FTSERKS1dHUFRyMG9aczdlenVjLzRoa2Eyc0k1NDBHUVIxRldOSWxFc2FUc0NHSXdhTmNLeUtrWUF4dEdlS2ZwcldzV25rS0FaTS9LSzJUdEE0cnYyaHFLZ2l0bVlrNEl5TStsVU5MdlRZeENPSUQ5OUlTY2owclpoaW12Yk5JbTJEYU00QXJNamlLYWlzQmlHRURZSHA3MUhNbm9iTzhXbVNRM3dGbEtoakE2a05pb3RPbW4vczU1SlkrQ1RqaXJNdGdodDV0K1F1TWs0NzFRV1g3TmJxa1lQeWc4TWVsRWJNYytseUxVNWxsMFZNSWQyNGdaOWZyVmZTclNTU0JXUE9XNisxYUZ6YU5CcGNUeU1ybytYd2V4OUtOQ0VlSGk4c2pQVFBhcnY3dGpMbDk0eC9HNGRQRWN4SEhIUTFoZUhGTDY0VVhxVzdkK2ExUEhlcUErSkpNSm5ZT1RXZDRkMTYvRHJESXlHS0dRbEZNWXlNbjFITmI0VFNpamp4MnRkMk93OGZ5VzEvcDJpV0duV1JpOGw5cmtqL0FGanQzSHRWRFY5UFRSOVNrMFR4Q2tpTEF1WFZlb0pCSXgrbEo4UXRYbWgwTFQ3K0E3V1M3VXFyWUp6Z0VIMXE1NDQxTzg4U3pwNDAxcXhXM2U0dDBTUlVYNWNoUUFlT21hN2xzZVNtbk5vNGZVUHNzYUs4VWdPUjkwakJIcFdlbzgrNlZWSUhQZXJDYkpibG93bkJCSys0cExTS0Y3bkNydDU2NS9TbE42RjBWZVpiVzNVM0FCWWpBNkNwTjdpVm9pdkJIV2g5dHRJQmpnaWtqblNPZHpLTVpYNWE1bTduZmV4VzB6Y05TbFJXNVpTQWZ4cVMrbFcxdWtrOG9TQlNDVmJvZlkxWHNsWTNidnlEZ245YWZkTzF5cGpQWVpCUHBVcS9NWHZUSzJwWEN0STB0c2l4TEtjbU5lZ3F1eks4YXZFNEk2SDYwMjdua0lVTWVGcGh5dG1wUTRCYk5kR2pSeXVYS3pWc0k4WDBjMmVBdnpBMW9UenA5a1l4RThIUFBCRloybHladFk1ajk3b1QzNHFZWER6U1NaR0ZKNUZjc2xlWjNLZG9GZWRVODFUdEF5dlB2VlcrMm9HWGNPbkZXcG9pSERLYy9XcVdweFN3b3hsNDNFRUROZE1OemhyUzFJYlFxVmNEOEswZkNzYXJyS2hqamNDT2VuTlpkdXJJd2tVNFd0YlNJekJjQzdIT0RXNzBPYmN1L2JKSWRSZXlkRjI3amdrYzFwWGw1Qm8zZ1MrRnU1U1c2bDJaQTVyUDFQVHAzdlk3OVFOc3k1QUJIRkxyelJKNEJrRWdCSzNuQXp6Vkl6cS9DWm53WnQ0cHZpTnB5enB1VDdVcFllMmNWOXk2ekRiV2t3YUZVblZFUkZpL0N2ajM5bWZRSXRZOGZXd2tqM0Zab2dCajFjVjlpNi9CYkc1dUdKQ3I1M0RoczR4L1N2bE0vbnpZdUtQU3dTdFFNRFZuVTNVU216amg2WjhyL1AxcGRiMSsxOEoyTW1zWE5vOHl4eEx1U01jdU9uR2VvcUNkN3E2MUpaVmlEUlE4ZVozUFBQOEFPdWpGanBlcDZjcWFsSUVjUmxVK1hJWWZUdlhEQnhUVFpyVVhZdy9DM2liUWZHV24vYk5Kc1o3YkRBU0pLTnBCQTV4Ni9oV0o0d1hYWmRYU1d4dUpXU0tQQVJXUEI1NUhVNXJzTkg4T2YyZmJPMXBhN3dSenNUSGI2Vno5MDEvcHM5MXF0MUNBdzVqVWdjRE5kMUtwVHVjazNLMnAyZndmK08veHkrR3RyRmFhRHE5eUlTb0UwRWtoS0Jkd0pKVThIajB4WFcrS1BpRHBQai9UcnZWL0YyaTZYY1NYUVpYanRZZGpJekp5Y2oxYkdEempGZWFhRmVTVDZZTHhueUdUTDdlM2JBSTZWRnJPcUw0YWdndi9BQ3p0REJRdWNzVHgwL0tpVm5LOFJ4U1N1emZ2L0dXamFiWldsbkJwWkQyVnVFU1BybCtSanFlZ09jMTZ2OEwvQUFqNEkvYTI4SVJhVkxLUjQvOEFEVUxpeXRZczd0YzB4U1hNY1lIM3JpRGxnblYwSndNcml2QjlTdUxqN1pIZTNsbkZiUVhFSWpNalBoa1kvd0I3RlhmQ0YvcVBnWFg0ZFN0YjZld21zcFBOczdpM2xLdUpzN2d5a2Nxd3dPYXVFZlp2bVc0bkwyaTVXZFQ4VlBEbGg0ZjBlYXg4UDZ1WkZBWmJocElrUjI2RWpHTTdzMXdmaEh3M28zd3JzcmZ4RGRReHh2cXNyR0Rhbkk5MkhVWnhYdFBpWDlxWi9pTnA3WFB4SitHUGd6VzlRZmFGOFEzMmtOQmZURUJjdTd3TWdkdTVaMUpQZk5lRStLMjFmeFRmeEZMcGtlQkpuZ2lLWVZOcUg1VkI0d1R6K2RkaS93QnBrbExZNTJ2WXJROC91ZGJHdS90QUxkNk1oOG82Yks4aU9SbFN4SlBKNjU5dUs3aThQMjVmS01wV1JmdTdSZ0RIL3dCYXVKOE5mRGo0alc4c25pMngwMlB6NVlCR3NkNFdVYkRna0hzUGIycXk0K004Q3lTeStITkwya25FaHVTQVRqL1A1Vm5pOE82dFc4T2h2aDZpalQxT2t2Ym56dE5XMENibzF3Q1QyK242MHp3U2tGaHF3UzlrdUJhczNCVVoySGo4NjVTKzhSZU43Q3dFK3BSNkhGd0FZM3ZEbnZ4MHJCdS9qanJtaXNMZVFhVnZPQURIZWRjL2hXYXdkWnExalZWS2NYdWU3VGE1YlcrckN5YUl6UVA5eTRBd1IrRlM2bDRtMDlwRTA2MmNFWjVJSEFyeFhSZmpCNDJ2SEZ4SHA5bEpFdzVJdlY0NXh5YXUzUHhhOFEyVndHbjhNV3JidW5sM2E4YzQvT3NaWUxFclpEZFduTHFleWEzNG8wRzd0MG4xZTVDZVZHRkRBbnA2ajE0SnFnSVBDMTQxcmVRVEZoYnQ1dTdmeVFmVUhvUDhhOHd1ZmlCNHUxSllWLzRWdE5OM0FFcW5KenhuNjFWdWZFUHhibWxrbTAvNFpza1lQbGtTWFNqQ2pQWWNacTQwSy9MWm1iOWx1ajN5MzFlR1NWSTdhYmU3UlpaUTJjRFBibm5OVXJyeDliYWM3SmV6Q04wSUcxajBQOU90ZUlRWDN4M3RraHU3ZndKRkhJaEJSMXZXM0RrMVM4WGZFRDR2enpRNnZyZnc2WlVVQ05wSXJnTXBKNkU1SHA2K2xSL1prNXU1U3hNWW52OEFjZkVQU1oxdDdpSzhBSk8zTGNmNTlxbnVmaUJIYTZhN1d1SnRvRzBLZXY4QW4wcjUvd0JLOGJlUHRiaEdtcDhPcDVQbEpRbTZqQkhIR09LNnJ3ZWZpdHFXZEtpK0dWMHNtMGhGazFLRkEzQTZaUFArY1ZMd0VvUFEwVmVNa2VrSjhVN3E2aDJycGhRQmNLV1BJTloxaDhZTmZ0ZFpsMCt4aWFSbWJjeFZ6aGVucFhuMnYzZnhHOFBPOWpyM2dPNHR5bWMvNmJDL0FIcUR6V0RmL0dtNDhLYWZQZTNYaHU1aVFTYkh1SGRBb1k5QVNQNVZvc0pVYTBSTHEwKzU3YnBmalRVVGNQZHh2SXN3azNBRnNCVG5PUjJyYnN2aWg4U0pyYTlpMUh4WmMzTUY5Y2k0bWl1Wk40TWdHTXFTU3c0NDROZk5HZ2Z0TjI5NWZHRzEwNVpHZlB5cmVxQ2Y4K25yVzMvd3ZUVmJPZDBuOE9YeVJzMldET0NBUHFQeDlxaDRQRUo2eEdxOVB1ZW82MThXTlQwRFcxZXcxTkpKRmZtSWtGVkF4MUdPY2NWMDluNDJ2TldhMTFYeENSSzVBQThzZmNCNXdCNmNuclhnMWg4VnJXMjFDNXRXK0ZkL2VYRTBlVkJtQytVU093eHhrODhjOFVYL0FNZHZFRm9zY041NEcxR0thQmNCV1RJT0R5ZW5USEg0VVN3VmJvaW8xYWIzWjlRUWVKYmFPUHpMZTQzbmphaU56K21lMUkrdjN5empWN3lJd01GQ1JuazVHTytmYk5mS21qZnRpcHBra2tWeFkrUzRadHVSbGw3WXprZjRWTHJYN1RFWGpiUzIwOC9hNWNya3REY2JDdlE1Nlk2ZWxaUEE0bFBXSlh0cVhSbjA3ZGZFWldoa2poaWFZbE1KQ0c0T1FldmI4S3BXdnhLbGxLVzk5WlBiU0pIOGtKKzZvR09oL092bUxSdjJwZGF0cGs4TzJ2aCszTFIvSUFic2xtSTQvRTExZGo4V2ZpenJkd2tlbGZDK2U1THR0SGxPQ0N4UEF6akFwUENZbUx0eWk5clRsMVBkN2J4TEZxT3FORFp5YlhLNWN0Z0JzOU1mblY1TDRSTTF4YTZzWXBjYlFTTndiT09EOWVsZUgvMjErMFBvTjFjV3VwZkJuVUk1VWN0OGtpWUFIUVpCNTcvbFZPZjR2ZkdUVHRSWWo0VlhNY2thTVAzMGd6dTlUeHoxRlVzSmlYMEpjcWZjK2lScVZwWWFmRmRyWkpPeDVjQmhnRUhCUFU1K2xhYWE5YWEzNWV2YWxGQWtxd2lGWGpCQzdRTytlTVY4c044WWZqMDA3eUo0UHdaSk9GU1U4RG5LL1NuU2ZFUDQ4WFZ6RGFRK0JaWTdWc0dTR054ODRCNlo3ZlNtOERpR3RVU3Awa3o2YXNQaXBwTnRjU3dSeXh0SXVWUmtZWngwNmdqSFgzNlZuZUpyNjA4VjNVRjdxZHlnRUVnWXFHMnJnakdPdU9jZGErZjlkZjRqYTNKSGZXUGdBVzAwSkcwbS9JSDBPQjF4Z2ZqU1htci9BQlFpMGxiUy93REIybnhsQVBtKzN0bGg5TVZ0UXdWV203bU5kMHBxMXoxN3hQNC84UDhBaCtJeGFJRXZMbDFWVnQ0bHlGSEl5ZU9SN1ZnK0d2RkRXZXpUTlMyV3A1UGNLd1k1SjY5aGl2Q2RRK1BldmVITlErd1NlRnJaSkJ4OHVXejZkQlNuNDZlTmJxZU5tMHJUbzRueGt6d25DWlBmMnJ1ZEN1NDdHRk9OS1BVK3F0SDhTK0gvQUxQNVVlb1JIYjFLblBPUDByZjBYNGc2Skd4TWttNHFSMUhVZjRWOHF3ZkUzeGJDc3I2WDRnOEt0dUJJaEpkQ1hIUEp6K3RYTGI0Z2ZFcnhSWXBhVzBlalFYR0FyT3VvYi9yZ1k0NEk0cnpLMlgxNXM3cWRXbEZIMkdkYnN0VjhHYXJwWGg2WXIvYStteXhOYmlRc042Z042OEU0L0FWNWQ0SStLT25hRDQwajBteWdTMm1zU2pzdzIvNlFtRitaYzl3Tndyay9oTHIzeG0wYTZnaVNmU3BuUU5zTXJzKzBOak9NanNDZnpxdDhXZmh2NG5zcmRQR2VtbVFhaHA2bVhiR0dBa1hnc3ZUMXpnZldxdzJYT0ZPVVpQVVZYRVJsTlcyUHB6OXE3OW1Id2g4SWZESGhmeGxhYTllYTVwL2p6UnY3Vmp1NDdjSkRGTXo0a2kzcVNDUnU0QndlYStlSCtCM2hpVHdYNGp2WS9EeTZoZlhlbXFta0h5V2FTRnkzTCt4QUhKeGl2VS8yVWYyNS93Qm9Ud3I4T2JidzVvZXRtZlRFbDJRMldwUXJQSEUzQk8wU0tRT2Mrd3IxZHYydlBIL2lXNnZML1g3ZlI0NUpiZnlvZnNtbFF4YlY1NllVYzhnRWVockpZekZZWk9DUTFocU0zelhQRi9nMThMNFBCWGdlMTBxK3RQOEFUeUE4eVNFN3Q1QkcwRTQ0NmMxNlg0UThWZUpkR2FlWHhCNGFodkxOWmNpMXZCdmpmRERralBVRHBXTGFtYlZydDd1OGwzT1dPNHFTQUJqdDI5TVZjOFJOSG83VzYvMmx2dFpGejh4R1ZZRGcrK2Y4YTg1em5VbnpQYzZFb3BXTkhVL2lWcE9oYTFjeTZINEowWHc1Y1NRRnBMblQ3Y0s3SU9oM2M5ODU3YzF5MTc0NTFpN0V1bzJlcS9hNDVHQmR4S1NwWEFCSVBBeHllS3JYbHZwbXJ0ZFc4MHdram1pZU9UZG5sRC9DTWRmYXNqUk5LdFBCMWhINGV0N245eWdiWUdKeVEzNTlNMXZHbHpiN21FNm5LN0k2bnhIcWUyeC9zNnpmZXNpcnV3ZUNvR2M4SG5yK2xjdmFlSGwrMXlRTGJneHlrczRBd0RuMUgwRldubXNyRUh6ZFhrMktNTXNrZTcvOWZlb2JEVTdUVkxkNDQ3NTNqOHpCS2dCZ1BVKzFVNlVvNjJLaFVVaExIN0g0UnNwRjFxWVc5cERMbUdlVndvMm5KNm5KejZWOU4vc04vRUR3eDRqdC9JMFBVWTdoSkpRamJRVnlTdUQyNTQvQ3ZtZTgwTzMxZS9oWFVZL3RWakNvWVcwb3l1OGNFNEo1K2hyM1Q5bkhVTERSOWN0Qlp3Ulc4VUUwWDNJMVhmMEhBeDJIYnJYbTVoeXVoWTc4TkZxUnkzN1ljZjhBd2tId1UwU3prRE5Ob1dvWGVudHZKeGlHYVJRUG01UHlnVjhPL3RBZUxkWjBQU2ZEK2d2QWtsdW9sZUdmeS9uVThLVVB0M3dhL1JYOXNqNE1lTXZDL2dEWGRVMUNPQWFYZStLcm03MHVhT1ZKR2t0NTBXVGVRTWJlV0lyOCt2akhkYVdmQytuVyt1YVVYRmxycklMclB5aFdCQkhJOWVhK2k0ZHFSblFTN0huNWpGeGxjd1BFM3dIMUNMd1JiZU5KL0YybTN4bXR3NlFXMXdDNkFqZ0VldWUzYk5lUDYzcHAwKzAydXBEYnpoVDM5cTdYUkJZUGYzME1tb3VuMmVka1F4eUg1UVRrRS9sWE0rSzVMYVN3SUUrNmVPWTRZak85YTk2UDhXek1ONmR6SHRiVVNhWlBOQXBHMWNzRDJxdDRJWlRjVHpIbmFwNXJYMHU0aHRkQXUwTU9YZUlndGoyL1dzandESkhacGR5U3JsamdDdHFzYlJ1UlNmN3hJNlcwdUxhYXlkczdUM3p4VVduVzRudjhsd0NrYkVHbVRLTGVKOGR6bFNPMU5RckFpVDI3SElqTzducG11TGxSNkQzMU5Id1pNOWhLODBrbWQ1SUFxWHc1NVUzaWk2a0k0SlBIU3FmaHlSWkxWSFlIY3JuSE5XdkNEcmNUWDkwQUFSTVFHSDBybnFKbzZhYnZZZjRPRnBiMzg5OWZUVEJHbllJa1MvZTU5YXNhOFVMdk1zYkJEOXdOMUhGUWFGTXhzWVl2TE9mdERFbjA1cVh4dzBjZGhJME9WS3lBRS81NjFtdFdkRHVxTE1tN3pQQUhaQ01kQUtqdDFhTXJLQ2NacTA2N2RKam1ZRERLT25lbDA0d05DelRKa0wyeFd0dERrY1h6WE5qU2ZOalVha0pnWVNOcEJQUTFtUGVNbXFzcXZqNVRoaDlhaW0xTVdBUk51RWMvS0MzUSt1S3BJWi83WmVTVVlCNkE5TVZQSmJVSlZXMmtkV2pYVnpZTFl5S29CSU8vSEpGYzFyMDV0ZFQ4Z0tjaGh4bXVqdGJuem1pampYRzVjN2pYTCtJN243WHE3eWhjYlRqSUhwVVVWZVRONjd0RkdsNXJ6YVkwaWtoZ3ZDazhDbDBWV2pzeGRTT01sc1lHS2h0VW5iU3VPZU1acExReXBjL1pTVDhxNTY4Vlc3YUUzWkpuTmVLUEp1OVR2SjJiRzNPQ2ZXczd3ektsdnFFWmtUZGxnU08zVVZmOFFJeXBkU0VkWEF6MzVOVS9EME8vVTRZbU9BekRCL0d1bkRmd2tqZ3hiL2V0blcvRmF5MDI0OENXbW9XOGdhZjdZVHRCNkxqb01kcTE5RWwwanhaOEpwNDdxL2lTZTNoNEVoeGhnT3hIVTFIcVBnZzYvb09zUVd1cFJnYWUwYmhKZXJLdzV4NlZ3WGdEWHJuUmRkazAyYkVsb3daWjBrRzRBZTJlQjBITmQ2MVI0OFh5dHN5b2Jsb0owVS93Z3J6M3FiU2o1bDBjc0F1Y3QzNzArNmdzcGJxZTR0RXd2bU5zQlBRVkZvbHlrV29GSDV6NkRwVVZEYkR0S1dwcFg4YUlWbFFNVUI1YkdCVmUvRG9nblZ1TVZMUHFNazltYmQrVURuQkZUMjlrazZrWEVaS3Jhc3dVMXpiSGZwTFlUdzlObzJuMzd6NnJibVdOck1nS282TXc0UDUxa0c2V01CT2R4RzBacWUxbUV4Q01uemdZVVo1eFZPOWhJdU4zM1NPbEN0Y3RYNVJtb1FCSURLNHdld3BscXltRkF5NXdlaEZUWHpzOW1JMUdjbmsxQkFBenJBRkpmc0sxVDkwd2trNW10QWdqdFhGcmpIWG50VExWYzJ6dUR5RDNwbHE5MUZJOEVrZTBrY2oycXBEZmVXenJ1SStiQXpXYWpkbXRTU1NKcnk0QnR4NWcyblBhcWNqRjR5b2w2LzN1YWZla3lSaGoxSFlkcXFwSUZjZ25KcnFoRFE0WnU3SHFONmlOZWc3WTVyWDBSMVZHamtmYmdmS1RXTkM3dE5pTWRUeU1WdGFUWTNqa1NyQnU5cTBaSlBieVRRdVdsYzQ2TjN3UGFxUGpLNGppOE9LTEs3THJMYy9PcDdFRE5ib3M1SHNuRnpwN1JISEVoN2pGY1o0aXVTa0NhYVJ3TGxuNi9oU2pHODBZMVZwb2V1L3NhVzhUZUs3Y1BFQzdYMElRbi9aeWY2VjlINnFIdUxpWDdUSXdmelNBZ0gzdWMxNEYreUo0ZXZZdFV0UEUxc1MwY016UElCMFhLWUIvTTE3MWYzVEdScExpTS82azVBSDNlTTk2K1F6ZHFXTjBQWHd5dFJSbFBjcGIzQlNVbEUzQUtNNXhYVjZaYkpkV1VFOGdCZDJBaUFKR2E1WFRCTmV2Y1NYRnRITGhNd294N252OU9SK05kYjRmV2VDS0s4dUxKcFdWTVJvcHdGSUlHT2UzWDg2aW5oNXppbWpLcmlhZE9WbUtkUTFEUXBaZEtqaVNXTlNTR0k1R2YxenpXUmZhanB1cDNKdHJ6NVM3SEF4d2UyZUtwYWJyT3J3K0piNjUxNi9OMUZMSVdTMWFIYVlqa1lBUGZqK3RUNng0NjhQdko1Rm40VWx1WkZKZEI4b3djWkdSamp2MXJzaGc0OVRocVlseStGRnlUUjlFMEcxRHRjU1l6ekRHTTVHZnAvOEFXcUsrdTlOMVdTTzlXMWtWSXZtZ1dST00rdVB4ckh0L0dOM3JhU2FoZGFEZFF1dTRGV2lPQVB4SEhITk8wcng3NGR1cmxyRzdMUnZuYXNjeVk2NC9LdFhoa3RqS09LbkhTUlg4VngzK3UyRW1tc1dVdXVBUm5nOWpWelNubnM5R2hzTlF6TDVhS3JYQlVrNS92ZTU1cXpjYWJmWHVselJhTkFKcDNrMnhENmMveXFmNGV3MzJ0UGZhSHExcEhaVDJkczB1SndEdkdPMzgvd0FhaTl0R2J4bW5zVGF2bzlqclBoa1dWdmREN1EyMTFRazUzS2NZSTR3TUVHdWYxeU8rMExVN2ZTZzVlU2U0ODBCY2tpUGtZOTFQcFdocHphcmQyenkyMWdTQ3hHOG5QSFRIL3dDcXNMeEpvK3Y2ZHF2L0FBa01Xb2lTUVJCQkE0NEs5d3VhMHBTa3RpNVJUZXA2NTRKOGU2N3Btb3dhL0I0TjB1N3Q3WjFaYlM3czkwVWdYSHlON0R0K05lSi90Mi9FUHhuOFIvRjF2NGo4Q2VGckx3L2lDT0dmVHRBaU1jVXI4Z09vYm5rSG9PeHIyVDlrL3dBVFgzaVR4YzFuNG4wcUJyYmkza1I0dmtMRlRucjFKVWRjL25XVDQ0K0R1czZxaitKbzlQa3Q0aGR6UTJrZ0dJMmxqZjdvWWpHNVFRY1o2SDNxc0xVbEhFTlNDcENQSmVKK2Z1clhYaWk5dUhUVjdxNGVhSmlqckk1TEt5OFl4N1lyR3VWdTVaUzB1NGtkTTE3NTRxL1o2OFY2WHF0NWRySXQ3dnVuYVNVS2VjbkpKejM5aFM2WDhDdEttbUZqcmQyOXZNMGVWYU9JTUd6M0E2L2hYdXJFVTRuRzZVNUhnMFY1cVZ2Q1kxdXBWVnVDb2NqTlB0TlhtRjFERmYzODRoV1FDUXF4SlZjakpHYTZ2NHkvRExVUEFlcGxqZWlhMmMvSko1WlVxZlFqSFd1RFppMG1jY2s0eWE2b2N0U056Q1hOQm4ycCt5MjJnK0pmR05wbzY2azkvcEZwRXBCbTJocDF6MGJ2MXgrR2Erd0lQR253aThLM01Xa2E3OEJkQSt4dUYvMGk1aGJMcUIvZUJ5ZXVNOWVNNE5mbGo4TC9BSTMzbncwMUsydmRHMUdXRmtSZk5EUmhsRERHUDByMXZYUDJ1L2lsOFRkTnNMYlJwb21Td3VGbmtGbkY4N0hnQWVvSE9NZHErWnhlQnhMck5wMlI2V0hyUTVMUGMvUnJXUGhyOEF2aUo4T2RROGMvREhSb3JHYlJJVk91YU5Jd2tFRVJHMFhNTHFwWW9ISUJVOGpJTmZNbHJvOFhpdnhkcUhocTBIL0VsMUFLTHQvSURiREcvd0FzbU1aVSsrT2MxMmZoSFZkZHV2QjBlcy9ESytpSDl2NlA1R3VhTnFNN3hpSkpzR1NJNU9Hd1FDTytTVDdWMDJpL0N5KzhEZkIrNytKbHZvV253aGJ5R3hsYzZtczA2elRMZ1lUSEtqYWNuMUpBNlZ6UnhEb3djVzdzMmRIMmtybmwzaXJ3cjRUK0NQaUNDMGUyUzhsZU1UVHF5cW9qVThrSE9PY2Q4K3RIeC84QWpMOE1ZL0F1blhQaGJ3TnAybGFrc2JUVDNsbzd1VEdGR01nOEVaNUhmcDB4VW1yNkJwdmpmeFBGb3QzcU1sN0M4Zzg2NlJpdU5vWXNTVGdBZHNlbGZPWHhnMURVTk10cE5MdExVZjJiZFhVakt4KzlzR2NKblBwaXV6RFVmYk5Ta1ROOGtiSThXK0pYeEc4YytPTmVtMUs2MVc1OHBTVmhSSFlCVi9ENlovR3ViYlVmRWx4cGNtbHkzOXcxdThna2VKcENWTER2elhxRjVvbHMrbVJYMm1hTHVoR0RNR0hPY0Q4NjVqeEJEcDZ0NXNGcDVYR0dSdXByM1lTaWtra2VmS0xiT0VVVFJTQXFTckE4RUhvYTZud040eDhicnJWdHBtbmF6T3dlUUw1Y3JsbHh4bmc5QmlueWZEL3hGcWxwL2FWdHBFbmx5T0FweHlmd3Jwdmd2OEovRU9yL0FCQ3RQQnkyL2xYMTQ2Z1NNUmlHTWc3blBYZ0NpdldwcWsyeFVxVXVkV1B0NzlrZjRNLzhMYXZyVTNOaEZGYlRxdW56NnJjRWVWSEtEa3NjNXprSEhVVlUvd0NDaGY3TzN4UitEMXJxSGcrejBoTGU0K3hyUFpYTnNBVXVyZGlkcnd0bmxXQng5Y2ppdTM4SDZqSDhNdEMwcnd2NFN2Wm96cG5sckdpdWVYR1F6bGdRRGs1SUI5ZmV2cGEvMDEvMnhmMmFkUStINldyWHZpend4WVNhcDRSeVNaWkJGRVpMclQyWUx6NXNhczZESi9lUktCMXI0MmxtVldPTC91bnNWTVBIMmVoK0RYMi9WTk12TU1EdmpmREpLbTdrSG9jMDdVUEZPdDZnKzk3dnl3VnhzdDFFYS9rdUs5eCtOM3dFMUhVL0VjM2lyd3RwRE5iM1lET2dUYUk1UGx5Y0huR1QrZWE4azF6NFplSzlIdDVyeTkwV1NPS0k1a2JIeXhqSEdmOEE2MWZiVTZ0T3BCTThTY0pRWnoxcGYzZHBjTFBCT3l1aHlHRFlJcjNENFRmdGRlSmZEOEZuNGJ2cnJ5NEZrVldtRFlJR1JuMDc0eU05cThMY0JHNE9mY1VpbmFjalBXcXFVb1ZGcVRDcEtEUDA1OEJlTi9DZmpMVHJiV2hxMTJrcXhvb21TY01YVE9NYzllbjFPZWxleTJQaHZ3bDQ0OE1uUVBoOThQTE81MXUxbFNkWkxxOEQzVjZvVUI0MFFrS3dKS2xSbmRuaXZ6bS9ZNkdzWEh4QjBuUUxueExLTGE3ajN4UlJ5RWhTZmxBd08vUThWOWErQnZpTDQyK0VQeGpIdzQrSXMweHRMa2k3MFMrZ2Z5NUNuM3R5eVo0WUFkUGJGZkxZdU5hbFVhaTlqMktVNFRqcWl0KzBkRmFlQXRUamw4UDZJWXZ0TUxmWm9KWTEzS1F4Um95QmtuQnoxNjRyb1BnTm9HcytFTkxnOFYrSTdxd3VOUnVsVm83TytqVXh3cVF1M3FPdnQxR0s2MzlwRHdQNGsrTjE3cGZqL1RiNjIxZWExaVJMd3dBUnpTZDFrZE9NdDh3WGpPYTVUNG0vRFB4cHEzaERUZkQramw0cDlSdXBmdE03bGdzY1VNSmJMWUIyNUErdWF6ZUkrczAxQk96SzlrNmNydGFIMFRvSitIZng4K0dXcmFMNDErRVdsYWRxdHJwOHMraitLdkQwQVY0cG80eTZwS280bFJ0cERaQUl5RFg1OWZ0RS9Fci9BSVJuUlhHbVFwNThqYlkxWGdGajFPRDF4L1d1dTBIOW9UNGcvczRRMy9oWHhUTElFUlNqckhPeDg1V0FHVVlFNURLZS9KQi9MNW0rS25qci9oWVBpSjlYbXRsZ2lDNHQ0WTgvSjljL2o5TTExNWZocTlLVDUzZEdXSjluVXR5bzV1OTFuVXZFK255UjNQbUpmR1lQSGMrYnNWWWdNRlF2dWUvdFhLMzl2cmJNNlQzOHpiTWo1cEdQTmRocDFtOS9kZlo3QzRpU2NLU2ZOZkNoUnozcm9mQm53b3RmR2VveFIzL2l1Q0R6U1RJWVlOeDNlbnZYc0twR21yczVQWXVXaVBHTGszMWxLVW1abGZBNzlxbTBuVTliaXZJMjAyOW5XUU1OaGprSUlPYTlvK05QN0Z2eEY4THgvd0RDV2VEbUhpSFRwRjNPMXB6TEY5Vjdqa2NqUGV2UGZBL3czK0lseHJUNmJwUGgyNlc3YytWaVMzSThzNUFKT1IyNzEwS3BTbkM2YU1IQ3BDZG1mY2Y3QVB4NTA3dzlwMXhwV3BlRDlKMXk0ZU9OM2kxYTA4eG1RakJ3UTJRU3h6anJ4WDFyNEcxRDltVDRzU1hOcjhTdmhJL2grYVp5MzI3dzVxVXJMRGdnWmFHVXNPTTVJR2EvTkw5bjd3dDQ0OERmR3pTOUxuTW9NZVk1Mlk1QlhhU3dCeGpHZU0xOWVSWFdxM1VBV1BWYm0zazNBeHZESmdqQjRQNUN2amN5cFNwWW04Skh2NGFyQ2RHMGtadmo3NFo2VDhQUGlOcXZ3dzhJZUlnK20yMnVNVXZrUUlaSTNBSUpIQkI1NTZESXJ1YmY0TmVITk9zN0RXWS9FTnpONWtoUlZEQWx3dmNZK2d5SzRhNTBYVVB0cm0rdUpKTGlaR0xYRFNGaS9ISHVTQUsyTkt1UEZWbVlkTGwxd2VUSE9naTNIbEVJSkxjL3k2VmhVbEtjVXhRaEZNNm1IN1RaWGJ4V0Z3YzhnQmdUeU04ZmhVTnJaaTVqa3VMNE5JV1lnbzVQeThWaytJTGJ4RDVpUWVITldNZG14QloxWDUzd2NaUG9Ea1ZVTVU4Vm05bmQ2cGNMTHR5azJTZU9wSkhwUlF3L3RKYm1HSXJLbWlYV2RZdGRMdHpKQ1AzYWtGdXhIOWUxYzNxbmpwZFV0eHFHbGFiNXB0NU1sc1lPUDYxazZqcWZpVyt0NVVodHJZQkFWKzBYSHk3ajArNk9vd2E1L3dBUC9FaTMwYTBrMERVNWJZU1J5c0M5dktOc21lMkQrRmV2U3cwSUhseXJWS21xT3RtOGVOcU1TM0RJeWdrQUtRQ1QxNzFwYUlESzYzZHZMdFZVK2VJREhUbm4zcmhqNG1UVDFOd3VsUGNvd0p3bU55NVByMHAyaGVMUEVpYXUwc0drK1hhM1IrUW1RYlZHZXZwM0gxQnJTcFJoT05qT25WcVFsYzlEL3dDRTlnMGpXN2V3dUlWYnp5UVFUOTBrOWZUdDByMWY0R1g5M05xTVZzbDRranBJU3U1d0FQbUJBeDllOWZPVjdvdXAzZmplMHZwcjdkSHVYRWFjYmNjRUFjOWMvcFhxUGhTWWVIdFdnVkpXS1N1Q0dqSXlEbm52WHorYVllbEduWkh2WURFem5QVSt6Zml6WVMvRWo5bERYdEtjdmMzR2pGWjRkd09SRVUyNXllcHI4dnZqRDRWdUwzNFo2eEV5ZnZiVzRXNTJyeDkxdVQwL0Q4Sy9SZlJaZmpGcWZ3em04UmVEclRUcDlHajAyVk5hZ2t1VEpPMFBsNXlvSXdNRWo2QTErZW54ZDhaeDZUckY3b1Z4Q1BKdTdTZEppQnh5R0lJcWVGM0tGUnhOc3p0S0Z6NSt0L0NsN0xxT3E2NVkzYW0zQVZwRUxkQ1ZCeFhQK0lZZGtLQUFuUDNXSGV1eDhHM1ZnM3cvZUtQZUpycVp4TkwweGpnRHB5TUNzblVyWHdsY1dma1gzaVc1aHVFLzVabTBEcVQ3RUd2c2RmYnM4MVNTcFdNN1I5TlhWZkM5M2J6T0VlT01zbkI1NHJtL0N1TGVhVlp4eHU0eUs2V3k4UTJHZ1dzOXJEdW04NUNwa0tZR0s1NjBNWG5TU3hINUNUazlPdGIxV25BenB5L2VJMUxxYVY5T21WWEFJT1FQYWkzdkhleERTakIyNHg2MVIxQncya3ZJcllCYnFldExaWENEUzFROHVvemc5eFhHbGRIcE9TdVhMS1M0aGdKaERET1NUamoxclU4RTJ6TG9zOGp5RlRKSXhPUHhwYlBVSlg4SFR3Ulc2TmhjQnR2SXpqbXB0SGplMjBOSVNmNEN6Z25udlhQVmZRNmFLOTY0elM1REU5cWlIN3NoeVJuSFdyL3hKa1Y5TWFTTUJneEFKSDByTzhPeUpQYXdTU3huaVZnb0F6M3F6NDB1UzNoK1hlcEdIQUE2MWd2aVIxemY3aG1kZFN5RHc3QVkzd2VNazFMWUtFdEFKbkdXUW5QcHhVVXp4UG9jQ0l2eTdSVG53OXFyZy9kWEFHYTB2b2M2ZlVxM2tFdDA4RCtiakhBR2YxcVdGNXJ5N0ZtaVpjZFQ2VkhKdmNSd1JkVi9pTlMrR21FZXB2Szc1WUhISjVwdCs2WXFQN3c2clRiUjBpaGNISVNNOFo1enpYRTM4cFM2bHVaUU52bWtIbXU2dFpKVURSd2dPempQRmVjYTdkM0NYVXRwc0lIbmt0bitWWllmNDJkT0phVUVkRHB1cFRUV1N4UU1FVWNsU09UU1BjbTN2VGNUcmdiTy9yV2ZwazVGdkVVK1VzNEdUeFducWRsTTdQdWNNQXdLNHFycFZDVzNLbVlPdXh0OW11YmdsU1BNQkMvcldWb3QyaHY0WDI3V0VvNUZhK3V5MmNuaDFpSEptTXZQMHJudEdzWnJtOWlqamtBRFNESE5kV0VzNlJ3NDcrSWQvcTl6cWVsZUc5UzFqVHl5QnRrRHR1K3ZOY2I0UjhKYS93Q0lSZDNHaTZlOXc4YUV1SXhsdncvR3ZSOWZramI0TFh1bjR4TjV3bGMrd0k2KytQNTF6WHdXOGJTL0RXOG44WlNTWk1jVENDRThxN0VkeDNGZGtyeDFQS2hGU2RtY1JOQk5hczhWd3BqZFNWYU04WUk2aWwwdG9MYTdhZWZvUVFEakpCcm9wdkN2aWo0Z1dXdGZFVFNOTiswUVdkMFgxUllRQ2JkWDVEN1IvRDJ6WE9DM01ZMnVjbmpudC9ubWhwdEZ3c25aRmhNSXFNSEJEUHdENlZ1eTNVZHZHSlNQbDhwa0k5TTF6OTVKSEZMREFnK21Lc2FoZHp4UmJaQXVNZHE1WkozUFFwdTBTcFlNOG1wRFkrMVZQTkxycXF0N3Q0eVZ6MDZVYVZHeVhJa1p2bGJuNlV6VnBGRnd5ci9lNjBmYU5ZL0FRU2h4Wkl4T2ZtemlvWjRwV2lXV05ncDljNE5MY3pGWWd5bmpQM2UxUFpYa3RrWXhzb1BUSXJSYWFuTkpYWkxwMm9HR0p4UGwySy9lSnFoTnNqbDNTRTRZNUdLbW1Wa3doR0NPOU51QXJRSUVqTEFZeTJPaHFvL0VUVXZ5akRQTU1LSEpVMUpaV2NkNWNyYitjRUJQTHQycUJYQVZnM1FkYW1oQ3c0WUhyMTVyb1dpT1Y2c2RBVXM1SllSSHViZmhYeDcxdDJkeGN4MnF2QTVHZXBGWVlZR1lzR3lHUEJyWnNwWXZzd0c4ZE9tYUd3ZXhldUwvQUZHYTBBbHVHWkZIUW11TzFxZU8vSzJ4WEVpWEJ5eDdnOXE5YjhHL0RTKzhVZUI5VDhXeFhVQ1EyTWJIWkszek5qMEZlTXBJOTNyeWhVKzlOaFFQclRoMVpsTFd5UHJmOWtEU1Rwdmc2OWxrQXd0a2ttMDlTUTMvQU5ZVjMyb1h0d3pPc0VHRmtVbC9semcrbjYxeS93Q3p0SDlrMFY0YndyRnUwMHRqMStiSXovbitkZGZHMXhITzgwTVFDdS9IR2NkeGl2aU1WZWVLazJlNUJLTkZJNXVHMTEwYXREZWFUZExIQkJnU3hURE83bm9NOWV0ZGxwV3F5WEZySmZlVTdNNzR4SVBsd2M5RFZPUTIybkZGZUFxWjJHMDQ2TjZrMDc0NCtLTEQ0YmVGN1dhMVZQdGtvRWR1QmpEeXQwUDRkYTlEQ3VVb25sNG1qSG5YbVZENHpnMGp4VTF2Y2FkYlgxd2JjcTlqTStSR3VQdnNNWkZkbDhQTkF1L0Vjc2x0WTNGdGF2TTI1VWdpQTNic2ZLQ2Vvd1RqOGErZC9DMGQ3YmF2Y2FyY2FwdnU1WmMzRXN6bjUzWSttZVJ6d1BldlVmQkh4UTEzVFoxLzRSdTBWN3V3U1c1TW9jZ1JyR3B3eDZaNTZmclc2NXBUc2pyaFRwMHFXcU81K09maFBUdmhHMTdwY1BqYUM2djlNdFE5OFpjZVdzMk10Q25VT2NGQm5QR1NPTVZ4dmhENGR5L0hMNGZTZU5kRjAxb3JxM3U1TFozQStWcEZIOExENzV4Z2taNHpYaS94NitJMnYzbGxGcGwzZHlYRTl4SUdSMmxKYVNSOHM1SFA4WEE1K2xmcmgreFI4T1BnQjRaLzRKNmFQK3poNG5raXQvRkUxZyt0dHJLV3lHUzIxQjFCQ00zVXFjbGR2dGc5QlhvMUtYSkJIbXg1YWpkejg0UENQamVYdzNmblF0Y3pGUGEvdTNXUlQ4eEpJRGZsM3Jjdkx1TFh0Wmp1NGxLaGsyN2h4a2ZsemtWby90RytBZEJnMTkvRk9tV3dlZXl1OWwxRkZ6dVFZd01BZFFlM29hNDZUNGdKcTkvWjZGNFcwMHJzVUdhYVJNQlIvZEhyOWE0cTFCU2plSmxDZnNxbkt6YzFyVXRROEw2ZTgxakY1a1MvTXloYzRIY2pQMHJsZFcxMjk4VWFXdDlvMExOTkpKNVVjVEFBODVEWnoxcmIxZTk4VlRhamIyZHZGQkpGS2NPekwwRlZyWFQ3cTMxOHkzbHVVUitZMVQ1UXBCKzlXVk5PQzFPcVV1WTB2aG40NzFYd05xc2RyY2hiWmJlVUFNRHc3N3NrZzlCd0QvazE5YWVHUGlSOFBkRDhFM25ncjRnYVc5NzRGOGRNTlUwUFdMSS92OU8xRlJza2VKeng1aThoazZzcFU5SytQZkZWL3dDR2RVdWRMMFRTMHVGdWVVdTV5bTNadU9RQWZRZW82Q3ZUdmd6OFV0TCtIVnZmL0Q3eEJvRnI0bzhLNm5OdTFIdzdxak9zYk92QW5nbFREMjl3b3ppVkR6bkJCR1JXZGJTMDQ3bTFGS1M1V1EvR1A0WitGTkIwUFVQRW5ncjR5ZUh0UnRZa0RyQmR4eVEzaERMaFZhTXFRemM4a0hqR2FzZnNzL0RMOWxIVk5ZdElmanpiM1d0cVFIdkdpdjN0MmpHUVNJOEVFNEdDRDN5YTJmaUI4QmZoQjhRZkJlb2VNLzJmdmlmZUpjV01QMnE0OEZlTXR2MnlKVVhMZlo3bVBDWEFIYmNxa0RybXZCdmgvd0NCL2lENHM4U2VUb2Q5OW1oV1VHOXZwSi9rUUU4Z0QrSVlJNDlqVnVwS3JTdTNzVnlLRXJJOUwvNEtsZnM2ZnMzK0FQRU9wZUcvZ1A0aWwxclE0TFcwdUxHNnVaR2VhS09lSVA1VHNBQVRHVGpPT1IxTmZtcGVhZE5aYWxKWk9wM1J1eWtldUsvVm40c2ZzRS9GTFEvZ1JiL3RCVytzeGE1NFVtZjdKcTEvYUlEOWpsNEJFdzNaUkQwRWhHTW4wTmZBdnhsK0R0aDRPMWM2cm9VMGw1Ynl4c0pNb1M4TDlDQ1J3ZVQxcjJjdnJMMk5ybkRpSWUrZU1YRVRSeUhJNHp4WHFYN0pseHB0djhSSVp0Y3UxZ3NvcG9udUhjOEFCdWg5anhtdUd2ZFBrZkViVzUzREdSaXVyK0dPZ2F4bzk3SHJzbWt1OXJ1QlpKVU8xK2VoNC9HdW5FempQRHRHZEdEalVUUHJueHY4WnZDZG40azhyd2Rxa2MxcGN5aHhIYnN6S25ZWUo3a0RQNDE2Zm9maVRYdkVmd2oxVFFyYVNRdE9iVzRWVWJHNG8vSGNZNjE0VDhNZkRFWGlDQWVJdFcwZUczdDBJVzJqaXQ4YzhZSUdPbU1ZOUs3VFEvMmg5Sy9aMTFlenZmR2VoTnFHbmliYmRXY2VESjVib1FDTjNjWURkT2xmTnZEcVVseXE3UFNWUnJjNi93Q0FmaEQ0cDZ6OFVWOEJUZUZZYmE2MUlUMjFoY1NTS2tabGRTRkdUOHBEZktCN2sxNHI4WWZoL3dDS1BDZDFySGczeC80YmtzTlQwSzllTzZ0TGxNT0pBVHdUMzZjSHVHRmR6cDM3WDN3OTFiVkYxblF2RXYyZVNPVGRiUnNURThJVWZJY2pIejlPUjYxei93QzB6KzBYZWZGc2FqOFZQRVNHNXVyMUlyU1c4U0xiNXhqWGFEbkhPUUFDZXRkTkdwWFZXempZVXVUbHZjK2MvRWZpcTQwTFRKcmVZR0pqS1YyTDllbitmU3VGc3RWbDF2V283ZWVZK1cwbVNRTzJhdmVOdGExTFc3SjRocHI0ZTQ4d1NLaDZWaGVFcnB0UDhTV1YzSmErWXNkeWpNbTNPN0J6akhldmNqQkttMzFQUGxLODBqN1grQS83SjN4WjhjK0hZUEZGbnBBYUV3ZzJ0cGNFSzBpRWZLVmpPTWc0NjllYWgxVHd4NGkrRW54SVRYZFI4UHoybDFIWVRXVXdhRUpzZmtxT09BZHZmdlhZZnM5L3RNYTNyQ3c2YmUrSTVvQkZ4YkpETHRNTEtEczJuT0Fub0s5Wi9hRnU1dml0OER2N2I4YWVGNG11SXhKSHBIaXV6QS8wa3B0VXhUOVRuNzNYNWlTZTFmTHlyMTNWY1o3TTlTTktLU2FQTE5IOFdTWHZobEwyVzVMZWRLU1d3U3diSFBmakJ6WHNId2IvQUdvUEVYd0t0TGJYL0JrVUM2allhalpYTmxkU3B1UXlSdnU1REg1dHdKWDBJUE5lQmVEN2VFK0NZclpHeVJkc3NoeVFCa24vQUNLNlhXdEtzbThGcnFtbTNjaHVZWklYZUJZMjNNTTdUZzV4a2NlM1BPYTVWU2p6Mk5tM3lsMzRqMnZpRDRvL0ZyVkxyNFdlRENqNnI0aHVMcTMwblRJUE04dnpaUzNsanNpZ3VRRHdNWjRGUC9hQi9ZaCtNUHczK0c5bjRwK0wzd3FPbGFYckNmWjQ3eUlJOGFTTVB1dVZQN3B6aGVwSGZnMVo4RitPL2lacE1EV09oei8yRENWRXNxMmNSU1NVY0U3MnhuR1FlTzNwV2g4WVAyMnZHeC9aNzFyOW5yVjdvNmxGcTkzYm1DQzVQbU5ieXhzRzgxU3d5dlRHYzE2TkxFVkl6VUluUEtrbkZ0bjV0ZkUydzhMNk5yTW5oL1I5RWt0cm14bWVLOGwrMUdTT1ZnMk1xRDA3ZDY1aEZVc1FQd0lydWZqOXBEV3Z4UjFPNGtMWXVXV2ZETGc1WlJuSDQ5KzljaHBMUVcrcVF6WE1aYUpKbExMNmpOZlV3bCs3VFBGbXZmc2ZSMzdKdndyOFVlSTlSZ3V2RDBieDNlbmhDSlR1SElPL0FKR01rWnhuSHYycjZJL2FMMVB4L3JlaWVHdjdWME5VMTNUdFNoZXh1b1FvWmxZWVplL1Vqayt0ZU4vQkQ0dmFwNEIwT09PQ0Z6YVhMcktEWngvTWM1QlhmbmpnOU9SWFo2eCszNzRVMGJ4RnAxaGM2Qkdvc1pNcSswWmprUEFPTWs5TWNkSytXeERyenJ0d1Z6MktjWVJwSzU3MTRjanZ2RGVqdGU2enFNd0NYU3h4aFhJa2hPTWxCa2NuSXgrQXJZc2ZFL2k3VWRJMWZTYlM2YWFUVk5HbnNrc3BvOTh3SUlsalpTZnVuS0FaejNOZUVmRDM0eFQvQUJsOFR6cnFzQW10STV4c3RFZmJzUjIrVjhqcHlUaXZVNTlYMXY0R2E1by9pMkhUMjF6d2pxRXdFbHRjRU8xak9vM05HSldQeXZ0WEs1NFBOZVhDbE9GVzczT3IyM05UNVhzZktmN1NWN3FQakR4REUrdjNkd2dNTzVDb3l5NVlmOTliY1k5cThJOFZYSDltYnJLMHZYbmlRajk3SXVHUEE2Ky9XdnREOXBiNFNhWDQxOGZhdjRrK0ZHcDI4MmxYYzNtV3l5N1VkUStTMFdBQVNRMmNIOGErWnZHWHdROFJhZGVYQXZJaDVCa1lQc09XR2Y0anhrVjlUaDZzZVZYUFBuYm9lWDZOcXQwbDYza1N0dWtRb0NDZTlmb3AreHg4T2ZoYjhPZkFtbitNYm0xc3JyVUJFazByWDlzc3FzM1VnWkhUakhyMnI0NTBINFYrRXB0YnRQQ1dudnV1YnVSQWwxTTRYY3h3TmdPU0IzNlp4aXZzUDRUZnNLL3REVGVFVzFiUjdlRFY3QzBoZVYxMGZYWXBKSTFWUmsrVm5jU29QcCtIU3VUTTJxMFZHTXJGWVdYczVYYXVmUzN4eThIL0FMTXZ4NytEa0h4YThKYWxhZUJQRkdneVJXL2lDMzB5MlkydXFRdG5iT3NTZ0JaQXc1QU9NWXpYenJEb0h3OThPM0Z6NG9zL0VVMnVOQ3ppS1M0dGhGRnU3TU83WndmZXVVMTNVL0VuaFB3ZmRhbFp4U1hkamFYNSsyUVhUSEZ3Rk9UdVhQWGowN210L3dBRCtJUGgxNDE4S3I0dmkwbFJPekZvOUxqZkZ2Q3dJRzBEcVQ5YTVHNTBLR2p1VTJxMVF6TkUwWmJyeEZKNDN2cmJZMDVNZGl4VEJLa2tsdWV4N1YyRVZ4R2tHMW5QejhnNU9mOEFPS2pzcmsrSUxVM1U4YWp5dUNnVGhDQjBHT2xXVElyeXBiWHRyc0JqNEtEa2pQZjEvQ3ZMcVNuVWxlUjF4VUlSc2l0ZWVJTE80dFpOTk4weUxFR2RKVmI3aEdPblBjZnpxZlM1akNYaHZaOTh4dDBrZVZHSnprSEhQNDFqNmw0ZU5yRE5HcjVSblpWMktkeEI5Znh4K1ZRdzNYaUhTcjdUWUVnRnpESmJHSm9wRklJd1R0Sko1UFkrbGIwNmFsRXlsVXNlaDZWZndKcVZ0YlhmeVJYWHlCWFBvUU0vcDByenY0aWVPYm1IWGJyVFliUW90czd3ckkzOFhKL0RwWGM2WFlYTmhZdjRxMWhXaThsczJrUlhHWmNrNHdSMDVJL092bGI0K2ZFblg5YytJSjhKV2VveHBITGhwSm9uNUlQVUFnZE92MXlLNzhIUlVVMnpncU4xcW5LZDZmaXRiYSt0eDRZc0lTeFVORkpPT0VUam9PZXB4MXpYVC9EYjRGYVY0cHNsamZ3MnJURXFBWjR5M1VrNTNBOU9uVE9CWEtmQmp3ZG9WdGFXODE5SXUxZHJDUTlqeVRrbm9TQWErby9nejQ2OEU2WjR3c05CdWJCV0Z1OGZuTnRVSnMzWUl5ZTIwbmtlOWFPcHp6c2p0amhvMFlubTJxZnNWZU90RnRaOVowcTNjeEhjWTR3am1NamJuYm4xUDhxOFExblJQRUhncnhYSGF6ZmFJY3k0TWJIQ2dnL011RDF4NlYvUlRQcGY3R254di9abU9uYWRwVmpwbDFGcFFlQ1dHTllybUNSVVU1VnVqY0g4ajNyOG12MjhQMmMvQ3ZoM3hMZXY0UjFrYWpwdDFKTEcxektGQmh1QnlyS3hBM0IwSzhqcXhicFhUS01ZTGM0M0QydDJsWThCc05YaVNTMVpaQXBIM01xZncvblhUYWRxMTNjWGozRVVvM1JvV3g2Z0VrRVlyemZSTkV2UEQwTnhBYnVhNUpqRWtSblBJQXh3RG5ucCtsZHg4UFo0L0VkdTdTVGlKZ2hWbE9EajNQYzg4VjR1UG9hY3pMd2srU3BZKzRQMlRQSGNlbGZCN3hGcnVvUnRkV1o4TVhobmgyQW4vVWxRVkI0KzkxNHI0SytOSHdxLzRTcnhRRnQxQU10ZzBvVURyaVBQYjJZVjl6ZjhFNXA0ZkYraGEzNEIxM1QxaWpOcTBPM0FIbkxJdTAvTDFIWS9pYStSdjJ5YnJWdmhWcjF5L2gxRU43cGQyMXRFakp1RFkzeDRJLzNjY1Y1ZVJ5OW5qNVFSNitOanpVb255RkhLL2hPeWJUbHRRTE5IMnlSc3Z6QnQzT1BTdUs4VDJjZHRxNjZuRktXZ2xYZDY0NDZWNmo4VC9ETWVtVEI3bWRCTVlrZWVJa0RETjh4eDdaTmVhYXBPa1Z0UGVMaVJZWlFJd3d5TUgvOEFWWDNhV3R6eWFrZVJXSWRZMGxadkNyYTViRU1wT0I2ai9Dc1RRekpQYnZBNjQ1NjFldnIyYTYwNXZuS2p2R3B3djVWUjAyN051cFhZRGsvTnhUcUo4cG5TL2lKbHpXbGFIUkZVTDFseG1vekNCYWo1c0V3amlwdFRaNS9EZ216dUF1QlZKN2gxdVk5M1RZQnQ5SzU0N0hvU3R6M09pOEszeXgrSDN0cENBVElRQVIxclNFM2xXenVCajl4OHExeitrZVcxa3NpdUJtVGdlbGJkekxPZE1aVEdNcW81eHpqai93Q3ZYTFdUNWowYUxYc3lQUVROWjJGbVhISmR6dCtwbzhaL2FaTkZadHBHNlFIYUIycHR6Tk5EYldRamhPM1BKRlRlTFpvSk5DR0NRQ1JqSTVyQ3o1a2JOcDBHalB0MmtUVEVNbk8wREs5aHhTUW84bXF4aFdPd1I1ejJxSzRGME5Jd0NDVGdxbzlNZFAwclMwVUxKcHlpYUIwZmJnYjFJSDUxcDBPUmRFUlhUTGJ2NXlJQVZYSlh2VmJTWlBOMVpyZ0lRU2VRTzFUMzRFc2t4TW9KQ0FLeW5wVmJRcFBJbHl5OVR6Nm1pMW9sSjNranF0Tm1FZDRraVNiVlhKcms5UlR6ZFZ1NTNUTzZROXE2blJZNEwvVVVqWmlvUE9mU3NieEphUmFkZDNVRWVPdkJITlowUGpacGlQZ1JRV09WYkpOc1dNTjE3Q3RHdzFOYnVBbTRKTGpqbjZWVlJaWDBsZktKSEhIcWZXcTFpazhWbkxjM0tsTnYzYyt0Yk9LdVlxVFNNdnhDanc2VW55bkx5SGoxck0wU2FRWDBKSklJa0FHUGV0L3hXRVRTYlNNSG56R3lheGRLbGlTOHQ3Y1IvTUoxT1FLMXdmOEFDT2JIL3dBVTdZZUpOU3VmQ21wNkd0cEc5dEpic3JOSW56SVZ4eXAvS3VJbmxKOFBXNk1wL2R5YzQ3MTJ1cDNWejRlK0hyUTNtbm9EZVN1WVpRZm1BSjcvQUlWeDhnSjBqN255NDZFZTJhNzNxZVRLNmJzV1BBVjc0bmdOMVorR2I2ZUtXNHpGSkZCSVFaVWJxcEhROEQ4TTFVMU9CcldFUVhneGNyS1E2TjFYMnEvOE1yaTV0N1BXZGVhMjJtR0VKYjNHN0JnY25xUFU5S3diNit2THlhUjVwQzdNNUprSkpKUDE3MDVMUVZPWHZEc0Y1VWxJeUFSeFUrdUIzdHhJaHdvOWFkWjJydHBxc3pjcy9PUFNrdkl4SXBpUnM4Y0RQU3VWL0VlbkRTRnhsbGhMZU1uZ0VEazFXMXpZRjNweUNLdFdzaUMyU0dZZE9neFZUVWdKWk1JT052R2FtM3ZYTlZLOENwNVJOb2t2cWVmV3BMbTZuTU1TbGp0VThDbGtaVmdqaDcrdE11R1Y0Q3A0SUdSNzFwdXlHaVdSbmhtVzhFWWNxUVZRalA1KzFiM2lqeFQ0YThXZUhvTG1iUUJaNm5BQWptMEFFVW80NUk5YXdkNnJwcUVITEtPZldxcHV0OEpqVWZoVlJNcG9SQ3JRbk9NazhVM0lrSGxxY2JlcE5FUVVEaHZ6b1V4NUpIUG9SVzdaek1jZ08wQTU2Y0ExcDJKUjQvS3dRK08xWmNaWmxCZkpIYm5wV2hwVFI3OWhCejIrWG1reFBZN2ZSdkdtcFhQZ3Fid3RaMmJsNFZKZGs1d3Zja2Y1NlZ4TmxwWGg5NTdlNGl1Q2IyV2NFS0R3dkl6WFFlRGZHTXZ3NjFJYXJjMmdtanViS1NHYUp4OTRFOEhuM3hYSWVDWW12L0cxbkhzeUpid0VBK2hPYVRWcWJrakZQMzBqN0MrRHVqbTE4RzJTc0hlU1hUcEpITFp5Zm1BQStueS9yWFMvMmliUHk0TlNqS3NRRndCeWVuK05admhQVWJuU05EVzAwM1QxbUs2ZkJIbkdRcWt0dS96N1ZwMkZySnJLcmNBRmp0eVdZZmQvenhYeGxTOHFqWjdTZnVwR3ZITTJ0ZVJaVzloNXFlWUdNbTNvZlg5YThpL2JlMUk2UjQ3MEhTV3VTMGNVS3lzcDduc2NDdllQQ2ZpRzAwTFZXdFpmbVNKZ0R0N0R2WG1QL0JSL3dCcUVvMGY0b2FQRHZ0WHRsV1dXTTVPRDBQdFhxWUJLVjBjT0pmTFVUUE1aOWZtdTdHVFVJWm16NW1RaXZnN2NldnZ4WG9Ydzc4UjNmZytBV0Q1TFg5b2x0Y25hYzRmTGQrbkE1OU90ZlB2dzY4V202MXUxME9lMWtuRTg2SVZqQkpZWkgrRmU0ZkVEeGpZK0IvRCtvK0pialNSSmRYQWFHd0IrVTI4dUNxbmdkbC9uWHBVS0RwVDk0VldxcWxQUTV6d3hwbW4rUC9qNDJ0MzBUTm91ZzNQbVNLZVE1VjhvdnZ6K2dyN0orRlg3VjFwWlQza2M4akNlWWJJVzJuNTBWdUZ6bm9lUHBpdmpyNGZ1bWcrQ1lMV1lCTHU5ZHJtOGN0Zzg1eG52d0sxb3ZpYlk2ZE5IZFc4U3E4QjJCMUpIelo2OGRjQVVzUlZ1N0d0REMzZ3JuMEJlNnJZYTM0OTE2Nk1nTUhrTTVqUE8wa2RoN1lGZWJhY2srcStJWGwwaTBKazNFQkZUcmcvcFczOExMYTd1ZkJsOTRyMUtKMGZWTStTaFU4eGdFam4wcTc4SlZHZ2VLNU5aMCt6Z3VvakVVdUxXZDhNeWtqNWxKNkhtdVpUOTNVNE1URk92YUpGcGswUzNVemVJTFNXR2FCU0ZpSzQ1eHoyOWFqbDFDUzh1SGtGbDVjUlBDanFNK2gvd3JxN3pWSXRhMXE2dWpiS3FFbFlvMmo1YkhiUDlmWTFuWEVOdWt6VzU4dE1FdDVhbkhIMTdkYTRadVRub2RVRkZVOVRNc2JHM2RtbE1YR2NLK1BtQjY5ZndxalllSW9OVUlpZTFFY3NSOHMrV21OeUFrWit0SjR1dUpQRFRJbHVXYTNtTzBsUmtyNjQ1cTk0VE9sUVNLTkkwOWhJd0RPMGk4c2VEai82MUVueXcxSFJmdmFHaloybXRhRTBrT25TaEpydXhjUjc1UUFnYmpuSTRKWEgxelhubmdqeHZxMWpyV3RhSmIzVXF5UlhLelB0YmtxdzY5ZnZZUFh0VzU4U2ZpajRlOEszTXVqZUxkWFMwYWRoSEcwdVZBWWRCa2RNWk5lSWVNUGlEb253NzhXV1BpalJmRWxqcXFYTWJSM052QmNCc3A3Z2RNZzhacnRvWVp6dysycFVxaWpQVm4zUjhOdFMvYUM4UWZBelduOEtlSTlRdS9EVjJSYStKTk8wMjlMWmpHTU5QQ0RrcmdEOTVqclhuc1h3YTAzVUxpM3Y3MnloK3pOS1V1SWJoZ1FTQWNTRE9UZ1lISFhpdkkvZ2IrMWRjNkpybzFIUWZpRFBvZHlVZlpOWno3Q3lrWTJGZ2NINk1LOW5uL2FnMUR4aG9DNmY0ajhTYUJleHdUTThNL3dEWlVVY3NyY25KWlFwYmtrblBYTmM4SFZ3enRZSktuTW9hTDhMUGhGUDRqYzZyNEpzTG1Cb1pmS1MwdHp2RW9RZlB5UndXSEhQRlpXdS9DSFJkU3NZNzJmUjRyZXdnT0dLeEJUS3luQlhIY2M0L0ROUStKLzJqYkxTdk9rUGlLeHN3Z1pWYTNnV01NRzZqUFhISi9PdlBkWi9hSzEzeERZNmhxM2h6eFRDK25XYzZSekxnRnNzUnlvSjRYSTYrOVZLV0lxN0prcjJjTnpzR3VkZml2NHRKOE9wSGJnU0xGRkZDbVc0STJuR09uV3VIL2FsOEsvWk5DZlRWM3lOYnRHbDFPN0FHU1k1SkdlNEE2VjYvOEFOSzBhTFdkTjEyZTdiVW52THVNTFAxTHJqUEdQdW5JUGV1TitOM3hNdFBoOVo2MXEzaUx3VnBXclcybzZnMEYxQnE4SmJ5MU1tN01iQmd5UGxNYmg2VnJnWC9BTFR5dmNWV1VmWjNSOG02ZHBmbGFpeWRSRmtnRWRjZmw2VnMrSGIzeERxTjE5aG0xaVNheVNRbGJScENVQi8zZnAzcmxmRmZpelE5VDFpV2J3cFpTV1Z0STN5d1BNWkNuQUJ3NTVQZXZkZjJOUDJmL3dEaFltcUh4VDRydUhpMG1BQnBVVS9OUHp3ZzlNak9mV3ZYeGRXR0hwT2NqbHBSZFdYS2phOEJlRWZEMXpZVEsrbVd0eGVLZzhtQjF6dkk1YmdEMHdjL1N1bXVQMmUvQW5paWExMVhSdkNQa1hMTkdzbHRFdTdZZVF1Yyt1T282VjlEYVQ0dGsrRTl1SlBBUGhteTBtMWhJQ2ZaZE9ReUZkdU54ZGxaajZkalhySHd5L2JwMHF6MHFLeitMZnc0OEsrSXJWOEpLbXQ2SkdzMjAvS2RrOFFWMU8wRURuSXo3VjgvSE1xbFdXaXNqdWxoSTAwZm5SOFIvZ3A4UVBneDQ5ZDlJaFpFYkx2cDRmZ0FaM3FjRTV4MnI2cC9aTCtKR2tmRlQ0VmEzOEl0V3V3Wk5WZ2ttMDVKWEtySGNvZ0lPQVFBZnZLM3FSd09hOXYrTnY3SlhnTDlwYnd2ZmZHbjltYTVrdWpZUXRkYTc0TXUzODYvMHFQR1h1ck5sNXU3WkJqSTRkT1NRZVNQakhTVHFYd0QrTE1OM28wcnd4elRwZVJ0RzQyTElweElGeVR3UWR3SFVnak5kRlJ4cjArWmJvbW5KeGRtYW1neFcraWVDdFV0cjJMRFd0OHNVY0NNeW5KeUNBTWRpRCtWUTZ4NG84UWEvcFdtZUdiU3pTTTNtTnNzYnNHa0NuSUJBNmNzZVFNOFYwUHhFMGx2Q0hpcnhacGpLTHF4MW1hM3ZiQ2NUL2NSeUoxYmhzRWdNd0k5Y2RhcStGOVkwcUZyUFVwRzh1WFM5R2xtaTNveDN5dTVDa2M0NkROWUtFZVpQcWE4ejJMSGpyeFQ0ZzBMUklQRDJoS3Q5ZmZaa2phNllLVER3MjRjZS9QNGV0UmZDUHdaNEw4Tlc5eDRvK0o3UjZqZjNpTVhTWWdyRXJLZVZ5UVFNOWZUQXBuZ3Z4WmFXZ3ZCZmFlOTlmNmltMVZXSWc3bVpzS0NNRWdrNXp6akZkWDRYMDd3VDRXa1MrOGNhUkZyMm9SbkpzN3FSaloyd0pIQkF4NXJqdm5qMk5hVHEwOEw3elYyU29UcTZMWTg1K0pIZy80QWZFZld6YzZkNGF2THgxOHUzbFNLRnBnaUFzQzRZRGs4REE2QVlGY2g4UVArQ2FsdkpvMFhpL3dOcXFwYlhCQ09zODJQSWtZc0ZEYmhuNTl1TTlBZXZhdnVYNFdmdG5hNTRDdklyVHd2cHVpV2xsRVZNdHRaNkpib29BNkx0MmZNT2U1elgxTDRjK04zN0xIN1h2dzhiNFJmdERmRExTN0M1MUMwOHUyOFNhQkN0dmMyMGh4c2Y1QU9GTEZzSGpJNlZ6ck9xcXFKT05pM2dhZkxkTzUvTzlxWitJM3duMTY5MEsxMUs2c3BMWmlzMFpiNUNwNkVBOFlJNzF4ZW9YOTllWGozdDVPenl5T1dkejNhdnRIL0FJS1Jmcy82ajhBZmlyclBnZlg1MDFDZlE1V2h0TlVRRlRmV01tVERJZmZCSDA2VjhXWGgzU3M1NEpPU3RmVTRTcEdyRG5TUEpycVVIWStpL3dCazNVTmJ1ZFl0N0xUZFNTSzhheVY3YnpwTVJTa0gvVlNlb2JwbnNUWDJqK3o1KzBINGRmVXYrRmFmRjd3cWwzWlhNYjJ1dGFOZWtSQnNLQ1BMSkh5WENnRXh5SGpJQWI1V09QaHo5a2o3UmY4QWlpQXZJUUliTWJVQjVKQkpBOThrZmhYMWg4V1BoTmYrS2ZoL3BuakdiUkpkTzFkYitPelhWUE93dDFFVjNLWFlETzhZKzluT0QzcjV2TVl4K3N0Yk05TERmdzlUNkg4Y2ZBSDRZK0l2RHMzeEc4QkpmNmpvT29TeEovYjJpS3pxb0l5eVhkc01tem1YZ01DQ25HVkpCcnhMNG1mczkrQklkSWE5aDFVWEVFNDJvOERBczNMY2tiZUJ4MzcxNFpvWDdhUHhzL1p1OGJybzJtZU5GUm9zeHBkV1Y2ME1qcjkzRGtjc2VEdzROZXNmOFBEZmkxNDY4R3RvR3I2TDRWdVlycFk5OTNMbzl1Wi9semcrWWlqQndldlUxZE9waTZjRXBSdXU1TXFGSnk5MlI1YjR4K0VENjNkVzJsK0ZmRHpXRXRsT0RiM2Nhc1p2TU9PcEdTQjFJOU1WOUIvc3ArUFBGZmc3eFRwTW12NjA5cExiWGFMZnl4UHQvZDRHOHYwRGNmNDE1L1ovSHp4ZE5KUGRhbGRhWmI3RmRsYTN0RVFra1krVUhnREhCejYxNXA0Ni9hQjB2d2JwRFEzK3JpRnlDd2xEbnpKQ2VvVWRlL2VzYThhdUxhaWxxWENFYVVidG52SGpqeEY0TDF2U3RXOE9hSk9raHZkZnVKUkd1RGlISjVKeDN5Y2MxNDU4TkxDODhCZUxOVDhIWGt6QVF2NTlwdWZBYU5pRGtlM0ZlWGZDZjlxTzB1UEZkenBObkZEWnhYNmVVWmJ0aGtyeDBQWWs5QjYxNkxydmlwTlQrSmZoOW1kQmNYVnJMYlhCVWprWnlwNlYyMU1MT2xRVVpITlRxUmxXMFBhL0FFT3J1THU2RmhIYzJ3SmFTVkp3TnBCemdBbjBQNjFzUkNKNXBMcHJKdkxqeXNXN0hJejIvQTE1L3dDRTMxVHd4YU5ZUVd6VEdTNVBKUFhrSEgrZWE3alNMaldidU0rZHB6cW9HME1YeGs4WS9uWGp6aWRqZDBGemYrZXhpaFl3TVR1RExoajI2RDF4VUdnNlBlMnVyU1hkemVTM1RGQ2tja29QVEdjRDlmenA5NVlYMXBySDJuYXUzeWl4VU1QZi9PYTJQQ1d0Mml4VHJxV2twTElFeGJscEFCdUlBeVFldlhuNlU2Y3VVd2tteXA0NDhlM2R6OFA3eVRVck13V09uUk96bFNRV0lBM0VaUFg3M1N2aS9VZmd4cm54ODhVWG5qejRmK0xZNHpjeXM0am5rS2lQa1lYY09CMTRIZXZ1TDR3YURINGgrRG10YVRwTnpESk5McHNxQ09Ebjk0Vk9SeCtBejNCcjgydmg5OFEvR2Z3dDEyNjA5SmpFek9ZN2kydUk5d0pCNTRPY0hBN1Y3K0JrbFNiT0xrazZ1ajFPNjFYd0IrMTc4THJ6K3lMZWJVWjBpdzZtMllTcVFEZ2NISjZqcFR0UC9hQi9hdzhINmpGcWVvNmZjTzBjVGtmYWRMT0N1VHpsUlhhZUF2MnFKZE52bHZOZDhIMnQ3dlZqSWtOM0pDVGtjWU9UaitocnZmOEFoclA0UWVMckpOQWJ3dHIraVRoQkE5MTUwZDVFRjNaYktzQWUrUHhOYXF0aHBYdkU2WEhFUjZrbndrLzRMTi9IN3dWb0k4TCtJZkRQMnkxTURSeStWY3VtY3JnRWdqMDV3T09LczZ0L3dVZHMvR1hoOXRGMXZUZGJqaGsybEk1b1JLWVdCWERCdTVIellQb2NlbGRGNEQwajRPK0l0SW1sVDRoNkEwbHg4NnBmYUk2TU1wN1p5U2Y1Vm4rUFBDM3d2MGlHeGdzUEVmaCs4bmtuVlBKMDZCdUJqbmhoOTM5UVFheW04TTlVTlNyUldxSlA3VDFDNTBiVC9Gc3lmTGN6cEtOcVl3amp1dlVINjExR2g2VnAwR29UVGFaY2JVWExiVUo1SndjSDB4K1ZaTXQxWTNzdHI0SXRaNGJnU1NMeEduRVlUSUM1T01EQU5hZWp2L1lzVnlTVGw1R1U1SEJHUnp4M0Fyek1WNzhER20ycTF6NnMvWVN1bXNmSDBZbnZIRHQ4cWJIK1hCeGdjK3cvTVY0aC93QUZGZkM4dWovRS93QVF0SEh2aWoxUVR4aGhuSlpkK1Bya1YzUDdMbmoydzBYeGRhalRMcFhlTmdUR25KUElIUG9jSDh5S2IrM3ZvZXA2cjRoMW1iWGRQOG1TNDFPSkU0R0FNTmpQNGNaLzJhK2R3TXZZWnpaOVQzYXZ2NFJQc2ZGdnhMamcrSW1zMjEvcXVnVDJ2MnF4UTIxeG41SkdIWE9PblQ4cThnOFk2SG9rTVYzcFduM29FdTFaVVJ6M0I1QS9wWDBoNHEwdnhMSEZvdWlwYWJqaGdEQ3U3YzIwZE93NDU5TzlmS25qSyt1dEwrSmR6cDJzMnNpckRmc3MwRDhNUm5rSDByNzZsSlNaNDlhKzVSbjBtYTF0bGx1Y3FHSEFQMHJQdDBBVjB4a2s5VFhUK0t0UTAvVUhlYlRHV0tCUmlPM1Z1RUhGYzFHeHcyMzV1YzV4VzB0aUthOTh1UW1SdEZNRXdPR3VQbDlLcDMwa2NVNCtUb09vSFN0TFZSNU9sV3dZOEU1QXh5YW9xRnZWM0RvQjF4WE90enRtL2REU1ozUzNSV0JJTXAyMTA2bDVMWEJsQjJ4akl6MXJsTE41bzdyN0tvQkNuSTRycGJGN1lhYVpwbStVajVqbm5QOEFuTloxNGFYUjA0V3A3dG1XYmw5bHhwOW9yWUxFa2pIWC9Hb3ZFVHpYVEpacXY3dnpNdjN5QlRaRmpIaUN5dW9nem90dWZsUFVWYmsvMHU2S3NNWkhIdFhGSldaMlE5K215SFdZTGFDeFdReGxXWUFJRnF4YjZqSU5DRVZ3K1U0QkdlY1ZUOFZ6U1dGcGJxalpVNXpubnRTVHpwSG9FY2lSdHRsWUtNVTFHOExrdHhVbVZMbUw3RmRTMjhKSlFqSTV6eFV1aVJmYUxyeXl2T09EamluNmxDbHNmTlJQbEl3Um5KelR0RW1DVHM0VDVpT01kcXVTOTB6cC9HZEZvRVRSeVNwS3dUNVR0YkhPYTVqeFBlM2JyTERORHlEamRqbkZkYm9MYjVqOW8yN3NjTXhyQjhXVzRmVUo0SWxCWWNzUjByR2c3VkxNM3hFRzRLeGo2UHJVOTVkMituUEdFVURyNjFxNjdiRnRQa1ptQXczQ2lzWFRKTGRkZUhreEhhbkhUdld6cjE3RkhZeUNIb3pZSU5iMi9lV1JqRnAwekM4YUs0MHkyS25qZTFaR2h5UXJyZHM4Z3lCSU1tdHZ4bEhLK2p3bmV2eXluSXovQURyQTA5SkRjcGNZTzFHQjRIdlY0TCtDY3VPMXFuWGZFY1hhZUVMR0NZRXBrN1BvQ2FwK0tvTFcxMFN5dFlZZGtodFEwamJlQ2ZXdFB4M3F5M3Z3d3RMQmJRR1N4bUphWDFHYXlOYTE1OWMwaTN1dklBMlFnS1B3cnZXcVBNblpTTS9SNzZmVHZCdDdIREV4UzRsQWJnNHo2MWh3N0hZTUR5eTlENjFhOE1lSWRRc3RSbXQyY05FNXo1VERLbm1vTldRcHF2bUltMHN3T3hlZ3FwL0Nad1Njcm8xck5STEUwQ243aTl2d3FoY3lCTnlNaHlHSkF4MDk2MHRMRVVOMnJUa0JTdk9hcFh5L3ZKUXB5cEovR3VSZkVla3ZnQVBaUG9nWHlTYm9Qa1BudDIvcFdkcWN4ODlBR0ErVVpVVkxwYlNUVHZBQ0J0QlBOVlgyVDNqc1JubkFOVVRGNmlYbStLTkM2WXlPTVVUd2o3TWtySDV2ZXI3SkNiRFpJQVFvNzgxVHV0b3NWS0hvZTlKTzV0SmFFRUxOdGFGUWVWcUMzSlJTdTNKelZpek1rYjVaUjh5MHlKa1daaklNSEpyU085am1xN0RXUlJFeWtjbnBVVUtGVlB2Mi9DcDFaUzVXUkNDZW4wcEhGdUk5c0lJYnZrMTByWXhzSkJzSUNnODEwK2dhbE5vbG85M1oyc1pmYjk2UkFjVnpkZ1ZOeXFoZWM5NjdlejBhMWxrdGJkMkFXUWZNT2xSS04yUzlEbDlYOFNSYTVKRGE2MWhFV1FiNUkwNkQwcTU4S2RKaTFiNG9hYloyYWJVZThEUjVISVVackM4VjZZZEU4Um0xbXhzMy9MOU0xMjM3Tnp4RDR4V2w5S1BsdDQzY0FqajdwRlJpYlVzTkpyc1pVN3lySkgwMW85OWNlSE5Nc3JXZTMzZmFiZGdyNTV5c3JZSlA0MVp0cHIzVmRXYTRONmJlMlJEaU9QZ01SNit2MXEzY1IyOXpCcGF6S3ZGdTJVMjhBa2sxbDZ6cU45b1V5bGRPVmJmekJ0bXgzNDVyNHlsTjFKOHFQV3EyaEM1SFlUWFZocWJ4VHF6Qm1LdXVja25CeFhxVmpvbWtmR1Q0VHpmRFh4VzBlNDdoWXU1Nlp5TnBQVWRmMHJ5N1dMcWV4bmJ4TzAwVnlrZHFKSmZMVWdaT1J4K2YxRmRENFQ4VXBkNlpBeVgwY1laVlpVUmh6MndlK2VUelhxMDRUdzB0VHpKVkkxNDZIaWtYN01QalQ5bTc0dDJmaWp4ZDRYbXVkRVdWZ2wzSEVXd3JBNFlZN2pyK3RZSHgvd0RIMmllSlBFOXBvTmxLSmJQVFdMbDlvdytEbFY0eHhqMTk2K3g1dmlicjMvQ016K0VkY2VIVXRNbmpLRzN2MDNCY2pBS0hxcEZlVTZqK3pmOEFDM3hWZkhXdGYwcHhJU0Ewa01wSG1EUEc0ZXVPOWVoOWRnMVptRVZLRXJueWhQNDI4UVg5MDh0dEkrNXpzRWFBOERQQXdLOWIrQkg3T1BpN3h0ZnhlSlBHNnZZYUxHL21TQ2JoNThjN1FPd05lNStIUGhCOEcvQURyZWFKNFh0cFpBTnhrbCtjZ2o2L3pyWXNOWmk4UWFqSXN3a2l0SWhoVUNiVlBvQ0IrRll5clFrdERTV0pxdlJHZHJ2akhRYlhTMzByUUpJMWl0aDVOdkJ4emdFREg1alByWE8rSDdUVUxheHVkUjFHTXJJWExSb09OcTR6bjZkSzF0VjhQK0VMVHhNMm9Ra0x0R1hqM1pWbTQ5ZXYwcWo0aDhTMm1sYWZGZmExY0NHQ2VVeE9vQTZEZ1p4elhKT3VuTGxpT2xUa256TTVTRHhMNDdqTStnT3FQQkZLYmkxa3dONTYvSm5xMmVLeUxINGdhaHF1cXozOTlyY3NGNEFSRHY0ampPZVZPY1p4bjlhNmU0WFI3bVB5NDVDTnpEeTU0SHh3ZWh5QmovOEFWV1o0dCtGV2sydHRDMEVqWGswelpJTGpyL2U0cnVvMWFNSSs4ak9yR3BONk1QQTNpM3hONDUxYVd3dXJKQ2JmaDdwVHdjSEE0OWVQMXIwL3cxWjJ2aG1hYlhkVXR0OE9tMnozTGpIM2dvNEdCM3pYSStCZElqOEdXWk1Fc2NVYjh5Umc1QVBHZVRYYTNSanVQaEQ0aTFhQ1FNSmx0WUZMRW5kdm1YUDA2VjV1SnFjOWIzVm9laGhZY3NOZHo1WC9BR3M5Zmd2TG1HVFdvR25hV1V5eXBrcWN0azVIOHZ3cjU3YkR5c0lnUUNUdEJQYXZwajlvSHdycEhpWFUzYTR0SlZ1TFdGZ0lVVGh6dU9DQ1BTdkRJL0ExMnNwODJFQTVBWlNEeG5wMHI2WENTakNpa2VkWFRsTnN3YklYYzBnaWdtWU9lTUZzWjlxNmJUdE84Y1FXSG1IVko0SWlBZGdrT01ZNjhkcTY3d2g4Q1Z1QkZxV3N5K1NoWlhqZ2xVS1dQbzJTRGc0UFN2UXZFWHc0L3RrV24vQ0grSFlZWlpHamlrc3JXY1B1a3hoZGhZOFo3MVZhb3IyU0ZDRWo1NDhWUmEzWXZFdXBhaEpNSmszcnVrSjZjZDZaNFQ4VzZyNGF1WEZwZE9zTnd2bDNFV2VIVThkUFVkajJydGYyaGZoUDRxK0YydnRvL2kvdy9kNmRmUUZWbnRyd0RkeU1oc2c0SVBZOURYbW1DcjVBUFd1aW1venAyYU01dHFaK2gvN04rc214OEZlR2RRMDIrWFpGSXN4Wm55VkdRU285ZTV6NmcrbEwrM2I4TExsOU44WCtIb1ZRTE1zV3JhUXlMbHBrZHQ0SFBQOEFHdzlTUlhpLzdIUHhhRno0Yy80UTYvdVI1dG8yNkV5TjJBeUFPLzBGZlpYaUR3bHFmeCsrQXkrUHZETUwzbXBlQjRUYjY1QU9IYXhZa3h6aU1jdUVmaHY3b1BhdmxmZXdtWnB2WTlKUVZURDZINUttTjQ3Z0FxUmc1S25yeFgyZCt6ZDQ2bDBmNFZXbG5vMTBCSkt3THVENkxnOWVLOFgvQUdnLzJkTlYwZldMbnhsNExzMnU5T25rWjU0YmRjbTJjak9PQ2Npc2o0TmZFM1dmQk1DMkdvV0U4bGtMamFwQ241R09NcUQwejE0cjJjeHAvVzhQN25Rd3dyZEtwcWZjM2hEWDlWMXFhSFN0WTFRbU4yVkpKTUQ1VkpBem12TVAyaXZBUGlUdzc4UU5VaCtISGlpWnRNdEhqRmtza2lsakp0RE1DYzlReGJEVmlhRiswZm9GdEZERGFXZDRKaGhmK1BmYnlEamttdmF0TjB6dzU0citEMy9DZDN1cldobFo4ZllKZVpXZnBqa1p6em4wSFN2R3dsQ3BTbjd5ME92RVZZeWpvemwvMkUvMjN2aVI4RC9pcHAxeXVvdmE2bnB0MGppTnlkbHdod3AzRHVHSHlzdlFxeHp5SzlLLzRLZStIdkNROFMySHhqK0dHa0xiK0d2RWFSNnhwdHRFQ1VzektURmRXNENnQlFrd0hBUEFkUlh4eDhVV3V2RHZ4SHROYnNZM3RVZ3VBaW1NWWJDbnVBT0QzL0N2cDN4WjhSNFBpTit6THB2Z3ZVTGFLNWwwKy9tOHVlU1RhWTRKNDFMTHU1SUFrUkdPTythMHFVL1lZcGN1MGpPSDd5bmZxakh2UEUwM2lyd3hwMnNTU05jU05va1VlNXd5NENBci93QjlEcFVWMWFJMWpxMnAyTnRENWNFRU51WFNVa2JvMDNFRDBCT2VRZmF1VjhHK0piUzA4S1M2QWJkUmQyZHZOOWtDYldEa2dIR0QxT1QrVk84Q2VKUEV0NThNNzYzMW0waysxT2s1TXMxdnNaZW5yOTRkTVk5L1NyalFrcWx5L2F4NVRaOEErSVpOVjFXVFZrdG5qa2dqRVVOeEltWk41SFVuSEdCbjhnZld1YitJUGpYVzlUMXQ5TTA1WHQ5T2pjeG01Umh2bmZnRnR3NHgzOTYwL2hGY1hIL0N2ZFExQ0NGWG1FL2xSU2xTVzNOZ0U5TWJnTTlmeXFwcXRoQ2ZrbXV3WUpIQ1JYVEpzVkRnL051STU0NXlCVlU2VVo0bHlsMEZVcU9ORktKeC93QUZKdkVkbDQvdUpaL0V0eE1scE15R0dXVXRuSkdNajZjL2hYMVI4Sy9pWGV3K0ltdXk4bUk3ZG90Nk1RcHdELzhBV3I1ZzE3d2o0eDhDZU9oNHAwM3duZFQ2ZmZXcVhGeEd2OGYrMERubFRqT2NkNjlIOEIvRS93QVE2eXh0dkRQdzJ2Zk5VRW1lN0twRXBHRGsrdkZjZVB3MHF0WDNGb1hocXFqRDNtTS80S2NmRUt4K0pmanNUcmNpUzlqOE5XTnZkUGdsdk1DdHcyZStNZmxYd05jYWUwdDc1SzUzRnNBZFNlYStsLzJ5ZkQvamExdUxHOGVDZVc2MWVlU1M3bWlSanQyNFZZMVBwanB3T0JYQmZENzRBYTNkVzBkMWUyak5mM2hDV1VKVW5aa2ZmYjByM01HNDRYQ2U4emlyWHJWZER1LzJMdkMwc1Y5ZGVKRnRpdUdTM2hkejh2SEorb3I2MytPWGlxNzBIOWxhUFNsa0Vkek5xY3QxQ0VrMnNSQmJ0a2puQitaZ1AwcnpqNGZmRDlQaHA0VzAvd0FOV0tLOXdDRmxJNnZJMlFlM1hQZkZjbCszQjhWdFN0MnR2aHA0WXVqSUxIVHhDNlFuT1hjaDVPTTlnb0I3aXZuK2VXTng5NDdIb3VDbzRkWFBrTFVkRTF6WHRTazFLNk1rcnp5NWtkenVKWTFZR2tYK2tnTEZkeUJBQWQwY2hGZGpwWGpMUU5UMHVPeDFPMDhpWDVRMGthNVU0NHllT080L0NyeStWNGoxRzJzdEgwM01iRUJzQWdZSjlod1BldnBIT1VWWm81T1dsdkY2bkZhVk5ydXFhcEhweDFHNll5S3pvb2xiT0ZHNDlUanQzOUs1WHhMSGYzRTdYODA4c3Fsamt5dnVLK3hyNkdzdmdicmxwNG90dkczaG8yc1V0cEtOMWxjaktOMVVydUlJeVFUd2E4dytOWHdxOFcrQ2J5NWp1OU5sTnU3bVpab2szSnNMSGpjT3dQMHJXaFVwYzJoejExUGxQTTQzYU54SWpFRlRrRWRqWHBQd0c4VTZ3UGlYcEY1cUYvSk1WdVFGODF5UUJqK1ZlYWtjNHJ0ZmhiYVNycWVtWDhJSWIrMGxRTmoxK3RhWXhKMEdaWVp0VkQ5QmZEV29SYWhjelJSMjVkM0N1anAyUG9SOWVQcHpXdGVheGY2TE9rVjVDeUR5OGdnZFRYblh3MFpORmlXN3VkVUJuRC9LTjVCNjQ0SE9lK0JYY1MrT0d1Sm9vOVNzMUVETUFwNDNBOUIxK2xmSFNpMnoxdVpXTkM0MUtLVVJTTWYzdDBOc1lKQTI4L3lxME5OanNjWGx3K0NtWnBEazlCbi9BRCtOWVBpTzVLaFdSZ3BqR1l3Z1B5blBmSFN1UDEzeFY0bjF3VGFFdC81ZHVVMlQzQUdTUi9kR09jR3FqU2JNWnpTUFk5Q20wNmVHYVN5dkZFVi9GdVpVWW5MRWtyMzljOGV3cjVVL2JEL1pOMVZOUW4rSXZnbXlsa2QyTHp4eHFjc0NNNTY4R3ZvendockhoV3cwaXhzZE0xSkxpVklBcXhDVEw3UjF6Z2NjNU5iZW1heEs5d1lOWXNWdUxaZ2RvWlFTQitQOWE3c0hpSFRmS3pucVJkK1pINW9hTjRydVBEMHJXR3FhYzVranlySzR3dzdjNXJXdS9pQWw1YjJxV2VteHhlVEh0ZDR4ODBtZTV4L25pdnVyNG0vczgvcysvRWlRelgvaGlDSzVrT1RORUNqZC9UclhIMm43RG53RHRuanRMbHBGY3NOb2E0UFBQVDMvQVByVjJ5aFJtNzJISEYyVm1mTWZoWHh0cjNtQ0xUV3VKN2labEhreE1TU2VSMi9uWDB2K3p6OElybXl0ajR6K0lVZitseWhuVzJtR1JDdTNQVGdkdW82VjNlbmZDZjRPL0I2Tkx5eDB1M2lVazdwUW9KVTU0R2VwR1IyeFUxbElmaWZmeFIrRlkzdHJlSGF0eTRHMUdVNTZIMHdSWExPRk9rdVo2RGxpNVZ2ZGlqTzBQUWJLQ1k2cHBjUG1YTE95dzRYSmpKUEdlT2d4Njk2bDF6VGZFTU9ueXdUekpNOG9CbTJESkFQWG42OTY3OWZEMms2RDRlajA2d2oydnVWZCtNT1dBNUdlMVoveFpzWmZoSHB1bjYzNDF0dktzN3VZUS9hSWZuMnNSdXd3NjE1anhLclZMUVdoYWlxTWJ6M1oxMzdPT2gyK2pKQmUrSGJQTndVODR0dk9ma3dlVDM2SEZlaC90MWFwQjR4OEtUZUpvSTl2bDZqYkxMQ0V3VVBramdrNTdrOGZVOTY4bitDM2pwOUwxSlVzWVJOQTBndzQ1Mkt4SFQ4enhYdDM3U1dyNkY0ai9aODFZdzZlYlM1YlQ0N3E0TGtuekpRVkFicDFZQStuNlY0bFZPR1p3bjVucTBYellXeDhTYTFwbmlrUXhlTVBDK29NMDJsU3JLdHU0M0l3SEJIUEh0aXZDUDJ2dFk4TmVKL0cxbDRoc2RMTmxxTTF1bzFHUEFDdGdERDlPcE9lZlRGZTQrRzlVMThlTy84QWhHN2pmOWtuY2VkRnM0SXlYQjZEc0FLK2NQMmw3NTlhK0tGNlVpS3JIdGlqd3BHZG94MDdETmZkWWRYcVhQT3IrN1NPV1N3WWFaSk1HM2JENjFTMHBHZVdWT3Z5OTYwOTdXTmc5bzRJRHhya25razFVMFMyYVNTVXFPTWRoWFROMmJNcWNidEd0NG1TQWFSYXhLZzNiQm5BNlZsVzdlWGJ5dVZDNFhoVGowcm9aNU5PMW1hd3RvcldSVXQwQzNPZU53eUNjZmhWbjR5ZjhLMmZ4TXpmREd3dVlOTmEyai9jM0pKS1M3UnY3MWxCM1oxVFZqa2REaGxmVTdlWUVnR1FqQjY0eFd1Y1FhTElVYkxDVmxBenlCMXF2b3BndDdNWFRFYm9qeDcwL3dBTnBIZTZrV21rd3B5U3A5YXFidWhVb3REdEYxT2VYVkVqbVUvSkdGR0JXeXp4UHFTcnVHVzZBY2Q2d29HT2w2NDZlV0dRdHQzWXh4bml0WFJwSTduVlhtblgvVnQ4bUs0SysxejA4Tks4SEZsZjRqdkp1dDRFYkp3Y2dmenExZE5qdzNaUUJCbU4xTEh0MHFyNDF0bUYzSGNSeVpVOWFMMjZTSFJJa1dRamtkTzFPUDhBQmlSTnRTWk5mM0VVc1pXT1VibUl6bnRUTkozdHFESkV3QUNnZlUxQ3FtOGdWNUl5Q3VNN2FrYUkyMXpHWTJJK1VIYjM5cXVXa1FncnlUTmJWYnh0Q0tSTWhacEFOb0ZVYks2bUwzRTdqSWZJK2IrVlZOZjFXNHQ0a3U1eHVaUHU3cU5NdmpMcHpTTUFDNExOVXdoYU54MUtyYzNFenZEMDZ5NnZPd0hSeVFBT3ZOWGZHYnlXVU1KQTRra09SVkh3WkVZOVdsdW5VZVdKT2NuM3JYK0ppcE10b1l3QmxpZG9QcnpUU2FxcG1kTi91SmR6SzhSeHlReDNrYnNkeXpjRE5ZdWdUdWw1SERNMlk5L0s5dW9yZDhaU2I3cS9Vam56QUNjZEs1elJpelh5UktqTTVZZ2JSN2l0TUZyUk1NZHBVTzYxUzRodVBEK29XQ1E0MnFlblE4VnpHaGFoYnhhRjVkMG1kb3gwNjlhN1hUTk1pdnZDbXEzVDRMMjZPL1U1eGpIOWYwcmhyUTJrM2g1Slk0Q0hWbVdZOWpub2Y1VjJ3YVBNbXI2bUhORWJYVVk3eUxoWE81UmozLzhBMTFZMUNmN1hmUnlQd1RqdFU1bWcxRzlXMGdDcUlZOEF1Y0FldFZKMmlqMUNNT0F3VmhuWU9LdWVxSnBmRWJGeE41S0RQWWRSVkl1MzJoaVgzRms0SHZWaTRVWEV4Y241VDBBcU40WW9SdGlBTEgzNXJrMlo2SzJNcU9acks5WTVPV0dPUGVvMFF3T1dMY0U4MU5jd0NLK0ROd3g5ZTlTVFFxWENzTUR0ejBxbXdoSDNpZFhDMm0wZ0hqZ1ZCZXBpeUJXTWdIMUZXUkNQTlNOV3prQVpKcCtxeDR0VEd1Y0E4NEZacDZtOHZoTWlOZ2pKdWI1UUtSbEJKWlZJQlBCcU5uTU1nalBUR2Mxb1hVNnk2YkdXVURiM3gxcmJablB5ODZLR3piSUFqY21vbnlzaFE4ZXBxWnc0aDg2TmUvWDBxSU1QTDh5VG4zTmJ3ZWhnNHVMTEdrb2tsNnFzZnVzQ1Q3WkZkOWM2VE5hRkxpRzlVcDVZMk1EMHJ6eTF2WUlwQjVXUXg3NHJxTE8vYTYwOW81R0p3dnIwcHl1WlNPVThZZmE3dlZESThoWmcyRk9mZnRYb2Y3T3VrM01YamU0aHY0REhLbHNOK2Vvei93RHJyelRYV3VVdWZMODQvZTRZSHBYcGY3UHZpMkdEeFRkYXRydHh1ayt6cW01aDk3QXhqajJya3pMbStvU3NHRlMrc0s1OVFhM2M2ZHBkaFlyRmNLNVFLRnczT01WVjFiWDRybTNpSmRCSEsyMlFEOEQxL0t1QXZQR09oYXpkbTRkMlNNSGhSSjMvQUI3VmEwbTYwcTdFdW5wcUJ4S04wUWMvY1BVMThaU2hLTFVyYW50dU1Hck0wOVZodWROYVZkUFV5MlYxa1RMakpRbkhBejdVN3dUbytzNlkwbXE2aEE2d294U0RmSnp0em5CSG9jOWZjMHl6a21qMldrdDVHQWdIT1JrNE5iWDlvMjBNYXpUNnRFeUhxZ2ZnSHAwcjFYalpWSUtMUjVqd0NqSnVKME1zMGQvcFhscGNqTHB3eGJPQ0tpMHJVN3RWT25YVjhKQ21jRGR5UjJyaGRaMXFTMjFoUm8ydUJiZDhMTEhuT09tVC93RFc2MDJ5MXVIUjlUUzVPNjR6S0hZR1RHOVFlVTlxeWNKUFV1UEpGV2FQUjRMeG1sYWFSeVZHY0E5eGlraDFQVUkwTGk4UllTVGhBT2dOY2czakM1djQ5a1VVRUN0Y1BKaFpjL3V5ZmxUOEJWRFdmRkR3SzBjdW9Mc1lZVUJ1dlVWTVkxTmh0VTdIVytJdFM4UHZZb0p0VFdPVXlBd3lxYzViOEtvZUs3UFJmRStpK1JxZDFpTVlFNm8zTWJMMFBGY0xMcTJueGFlbHMxMGtza0wrWVFUMXoyNTdVa1hpU3p2N1dhRnJyQW41Y2x2dW5INjEwd290TzVoSm5YMks2QmFlSDAwWFJJeTBTZ2VaTVgrYkdQWHVPYWJKcSttV015M0ZoSXptTmVZeTNKSHJtdWE4SlhWenBoTnZjUDV0c1NTSGpPV0g0VjBGdjRmMC9XM2E2MGllU2VVdXBXQXg3UUQ3bW5LOGR5T3VoclI2aFplSnRPRnZZeFNxSFhhNnV1Q0QvV3UrOEIrRjVOVytEMnJlRmtJV1Q3Zll5SXpzQjhvbXhrNTZkZWxjdlpRd2FYYXgydW9XWDcwS284dUVqSTk4OTY3WDRkYWRvV3RXT3U2UFBxanhHYlFKWklveVNDalJrTnhnY3NNZEtTWE10RGVrN1BVNE8yOE9EUmRmdllkUzB0Ymg0cnRvOGJRd0lCUFE5c1lyZy9pdnB1azMvaTZDUFJmRFVVZHlwQVZJWXNtUnp3b3h4bkhwWHQzdzQwNjh0ZEsxSFROTXVvcm1Gclo1cEZ1ZVdVa1p3Rzc5L3dCZlN2SmZnNTRnc3ZFdnhnMUxWWGlqYVRURWMycXVBUTBoWWdOZzg1RmVuT3E2VkhtUnkwNHFwV1oxWGdEOW1EUXA1cmZVL2piNDFrMHhwVURMcDJub0h1UXZCQU9UaFBwNlY5US9CZjhBWVIvWUUrTVQybmhDMStNM2lId3ByZDZGaTAvVXRVUkpyTjVtKzRIR1JnRmlPY2pIcUsrZGRWc0wreTF4L0VMNnFiaHBTZnRmbWs4RTg1eVQwNTR4NlZvYWQ0ajFLM3pmNmRheUQ5K0ZqeEtWMzVCd1Y5VG5IUFd2Q3FWOFROODdrZWh5MGtySkZUOXZ6OWxMeDM4SS9pRHIvd0N6bjhiOXR6cnVnMjZKWjZtSkdlTzh0V1RkQk5ISXhMTXA0SUI2Wkk3VitiOTlBOXBjdmJzbUNqRlR4M0J4WDZZL3QvZkg3eEg0djFMd1Y0NCtJdXBtNzFTMThIRFRMaWR5TjdSMjhoOHJkamtzRk9NdHpYNXUrSVYrMDZsY1hTSnpKT3pBZXhKTmZVWlhXbFVvM1o1ZUpwMmtTZUJmRmw5NE84UXdhMVp5T3JSdU1oVGpJeUsrOGYyVS93QnJuV2ZoL3JtbGVQdkN1b0lOOEpqdnJlUWI0cDRtQkVzVXFuNVdEcndRUmcxK2ZiSU53SzhWMVhnSDRsYTE0Qm5TMWpIbVdyU0IzajdqMUlQclZZL0JyRlJ2SDRpOFBVZFBSN0g2NVA4QUMvOEFaNytQMFUzanI0SmVKTkwwVFVyaERKTjRNMXU0RU1jVWpLMjhXcytjRmVWQVJ1blR0WGlQeE8vWkYxdnduNHZ1SmRlOENhbnArNjlqYjdQYVd1KzFsbDVBZmNOeXNTTTVPZWMxNGI4SnZqaFphMVpRdGFhaDgyMzUxV1lCazU3QThaOTY5V2Y5b0R4YnB0azhXa2VKOVlhSjBaWkk1Ym9yRVEyT2lnbm5BL1Rpdm03NHlqTGtaM1dweVZ3OFEvQmJUcnFhTFRyUzdzYktRRE43ZDNMQjFUSnhnQUFlb0k5K0tibzJsZUhOQzhQYXVnMUR6dnNUSkJBN0VLQ3hPR2ZBT1FwQUJ5T25Kcm1mRXZ4YzB2VGtTNHVOVFZJWTR5Wk44bVBuUE9lNXdUajhxOFcrTTM3WFZ2THAwdmh2NGNxeVNUekNTOXZXNk93SFFEdUs3OExIRjFuWTU2dnNvSzUzV3M2NThPOWYrSWRwNFYxdXpacHJ5Wm1pdTNQK3ErYmc1L2l5RjQrdGZTbncyOEtmRHp3ejROdU5NbThlTzYzcXI1MGx4WXJKakNrREF6N244cS9PSDRjZkVDNGc4VjIrcTY3Y3lUU1JUQXd5TTV5TTRCNStsZlYvaHY0c2VHNzdSUWw3cVViQ1dOVkk4NFl4OWF4elNqWG8xWTJOY0xPbk9tejZUOElmQy84QVprZ1pMN1dQaTNJSEtFWWcwaEJ6N1orbGFmaVR3YjhCTlV0L3NmaDc0eVhTcVNGWXo2V3AzZHVveDJQVDJyNXZzdFMwOUlnbGlYTVRETWhMbkhyampqcG10dnd2cjJsWEVNcVMzcVlqQkM1Y1pVNDkrbGN2MWlzbzdzMmpTcE9SOWxlQnYrQ2RIN05tdmZzNDZ6OFhwUDJuSUpyelNiUjdvZUhrMDJORGNNb0FFWkJPY25QVURnbXZqTDlxdnhMcE11bzZaSFpyQXR0REM2MjFwQkdGQ29xZzRZS2NIT1cvRW12VVBDdngxOE0rRGZCMTNvdDc0a2g4NjRnWkJHc29Zakl3TUQ4UitWZkRYN1dQeEsxeUh4cHAwK242dW9nbHM1WFMzU1VNMFlNcktRK1BVQWtaOVJYWGxMcllpVWxJeHhpcDA3Y3A5SWZDRHgyNlcxcjRWOGFReWFoNGN1dUxEVm8wM1Q2UkkrQmxTVGw0eGptUHAxSTU1cjJ4djJldmkxbzJqblZ2Q3VtUTYvYVhjaXoydXA2SmVCNG5WczhzdWR3WXIxempIcFh3dCt6eiswanAxaFlRK0dkYmtFTFI1Q05JKzFYWDBJOWVvL0UrdGU1V1B4azFtMWlFL2hMeFhQYWNnaUMzdTJDWi9EaWpFVk1WUXFPTmhRVk9VYm5mL0VuNEwvRWk1djRMYlh2RDFsb2xwR0ZWSjlRdUZaK0dQb2M1eG5CckkxRHdkNGQrRzJueHphRmZSMzk1SUZEM1h5bllPQ1FNZHZUNjF5M2pUNG9haHJGakZhYXRyN1NxQUQ1azl3U1U5ZXA5L3dCYTRuVnZqM3BmaEdKdFAwNlFhamZQeEg1ajVpUSt2YjhLNTNERzRyM2I2R2tQWlFkenUvR3Z4YmcrR09oTjRvdlNzdW95UjQweTBic2NIOTRSMkFOZkdueEUrS1BpRFd2RWtuaWFiVXBEZE5jR1FTWnlRNVBKNTY1R1IrRmJYeFErSVd2ZUl0Wm5tMXUvYVc3Snc1eUNvSG9NZEJYbCtyU1BMY21TUTVMSFBIU3ZkeTNBUXd5dTl6a3hsZm5XaDZGNFUxWHdCZWFUWitKZFp2MmwxbGI3Wk5wQ29Ra2thZ0VPVzdaT2ErcHYyWVBoamFmRlNhNzhkZU5MV1BTOUZ0a0VZdDdPTVJ0SXg1Q0RQSEdmbTk2K0dkQmdtdU5WaVNBRGNHM2MrZzVyN3crQ0hqYlU3WDRhYVhCcGNHK3dSLzhBaVp4eERxR0dBeHdleEp6OUs1ODdjNmRQM0h1Vmw2ak4zbDBQdUw5bnI5a24vZ256NHIwMkhUL0gybStMOU1lVlYzYXBwK3NDVUl4eUEyd2prWTVybi8yK1ArQ1hFdjdQL2dLUDQ1ZkJMeGJZK04vaDlkWFNMTnFVY0FNdGdXSnhGZFJLQ3UwNUFEakh6SEJBcnhHTDQzWG5nU3poMUdTNUxvWlkxdGN0amNleEF6MXI2bC9aUy9hbnYvR3VsMzN3aStKa2FqUi9GT250WWFsYlc3bFZtamRBcXU0R1FYUnRwRFlCNDY4Vjh2U3hHTHcwMU51NlBUcTA2VlZjcVB5MitJLzdLWGc3eDFlTHFIZ3Z3OWVhTGNid2wwUEtZd09jOHNBUmxUeUs1YlVQZ3RmZkRUVWRIOE9URHpwSk5SamNPaUhEWk9lT1A4ODE5cmZGTDRpYTc4S0cxcjRiTnB0b0wzVHI2VzBrbWVNREpqY0FTWS9peXVDU2E4RVh4bm8vaXY0dDZEL2JOdWswbHJPN1hXSStFMnB3T0RqR2M0OUsrdGppWlY4TmM4UGs5bFVzYUdrblhmRW5pQnZEdWl3Skg5bGo4eWFiSlVuQjY1K25ILzZxNlR3eHBuaXJVL0VCMHZYTk5hMlMxY0dSeDBmbkdjbnFDQ08vdlZMVk5FMXVLOGk4VStFcnA0cmwyeVdRNTh4TWtnSHQrZGQ5NFNoMUdHeVcrMVdVR1ZVeklSM0dCNjlLOG1wV3AwNDJPbW1wVFpYOFQyRnd1cld5NmN5MjZvQjlyODBEQlVuSTljbml1VzFYNGIzOW5xdjIzUTlSaU52ZXlabGpZL05DeEhYT1RucjJydnRkczRaWXJlYjdXR1dkeWRxTms4Wjl2d3JtUEVXbzZYcFlZSmRwRzZuQ1prL0g4SzUxV205alowWXZjME5FOEhhVjRYV080dFIvcElYRFNrNUxaUE9QYk5hVCtKanAwaW03akppa2JIbUlNa2ZXdUdnK0pielRHMGtLU21OQ3BrM0Q4TSsxT3R2SDhXbVd6M0Y3Y3h2SXpCVVE0T0R6ak9mL0FOZFRHVlMrd0tpbWVnYW5lUnpTdytURUE0T1FNNEdQOGFoZlI3ZldMdzMxL0srOGRXVmp4ZzUvR3VHaitMOTBsNmJYVkh0NUZaQUlaVWJCVVk5cUpmRWh1NTMxdlQ5ZGw4OXdBSXpKKzd4Nlk5ZnJWdXRVUlN3c0RzdGR0TEZoQnAxem9OeGMyek1vbGszOERCNC9yWGFhRnEra2VIWVk3YlNMZU9LSlUybFVHUFFWNDhuampYb0kxTWw3R01qREV0My9BQjcxVlQ0b1hNT29CWnIrTndPTm9iclhKWG5XcUxYWTNwVVlRWjd2cm10YWJlMmZscklFdUpHMzd5ZUEzR0QxK29ybHZqZnEzaVA0OS9EL0FFZndKQmFoSmY3V0Q2amRrRFpHa1FJM0UrcDZmbFhCeWZFS1M4aklOeUZVL2RPUjh2TlpOLzhBRWw3YWRGZzExNDF0M0pkSVpPSmM0UFA1VXNIVTlnM29MRTRTR0pTdTlqMTd3dFpXUGdDS3pqdExreVNRT2hqUTV6eHdPbU90ZlF2aUtIdzU0LzhBMmRQRnV0NmpJc2M4R2pJc1NuQklLZ056d2M1TGVuWTE4VzZQOGJOQ2FQemJ5NlZwTUFJenZ6OUNUWGF2KzFIQmUrQjcvd0FMV2wySGE5dDJSd0RrRmlCamdkZU9neFhIaXFWV3JXVTRycWROR21xVWVXNWcvRlhVZFMwUDQ1NmJvbGdxUXdTNlRaaUhFWUpiNWVvQjdEbjB4WHpaKzFuUHFuaHZ4d1JjcENmTmpMS0FnejF5UWZ4eWVhK29QRWJlRC9pUlA0UjhkYUxmYmRaMHV5Q2F0Yk9ndzBTWkNrNTREYnZjOFlyNUMvYTI4U2F0NG4rSWR4ZjZoQUVVTHNpUk9nR0NlMzRjVjlqbDlTVTdYN0htNDFLTk94em1wTkZkUVc4bHZjSXpQYUl4QzlpUm5GTThLVHZaM3NraXZrN2VocnN0SytCSGlEWC9BSWQ2ZjR1MENXMm1NdGtoa3RSY0R6UVJuK0VrZjVOYy9kL0RyeG5vZHQrLzBDN0U4cllWQkFTUitWZGRTMXpLZzJtbVRXazVrdTJaWkFHT1F2YXFmaWUzV0M3V05pQTJ6SDFwRThHZU5kTFQrMDc3UmJxSlI4eExSa0FmNXhWUFVJdFN1MzgrNWpmZ0FiaUR4eDYxbkJMb2ROU1Z6ZjhBQytoNkxyRjdGcGloakdpR1M2a3p4MDRIOHE1N1EzVjlkZTJSc3FIYlpqc0FmL3JWMGZnVzl0YkFUd1NQc2VWQ2djbkczUEhldWIwM1I3bXc4WFNXOGJibFFFaGdPb1BJL25UYTBaY0hhU0wycTIwMXRFMGpvQ2ZPK1dyT2p5dXpOSkFGSmJCZnBUcjYzY1doVXNDV2ZJei9BRXF2NFpQa3JNYzQrZnJtdVNwckE3S2Z1U0Y4V3l0Q0ltbWszS1R4M3hUUEVCamo4TlIzTUpPMHN1MFV2aWhSUHBvbDY4OEgycUhYWnZNOEV3UVJqTEYxQUkrdE9uckZJbXJMVmwzUlJISmEvTzQ4eDhiUi9kSHJVdHpMSmRhaXJPb3pHb0dCM3Fub29rdDBDVEhKRWZKcWEzZEYxQXlMSU90RlJYdWEwMmxCRFBIeWI5QmhhSmNNejhtbzlPaGp0cmRMZVhsaEI2VmE4WXQ1dW4yMXVJK0EyVHhWWlpsTE50eVNxY2tEcFRwL3c3R2RXM3QyeWhhYWU4TzY0Z1pzN3M0ejBxYlZycVhVTGUwRWtoWnR4WG50MnE3b01zRWxoSzVISWZCejNwbDBOUHN0UXM0WElBMzVKUHZXcWFiUmp0QXJlUEVGdkplZ1k1bkF4V0Y0Zm5sdHIrSzRoZmEyL2cvald4NDhta2t1THhpZVRPTm83VmorR2lnMUNDU1pkd1djRi84QWR6VVlKZnVMazVnMHFsajBmd1BhWFpQaVRUNUhMdEpwTGxRU1R1UEo0cnpqUjlRYXd0MzArWk1aR1d5dlRGZXcvRExSWFR4dGZ6VzF4Qzl2OTF2bkJ5cDI4WTlPYTUzOW9lMDhMeFhEcHBOakhiM1Vhc1haQUJrWUErbWEyaFV0VzVUaVZIbW9PZHp5cVBMeWI3Y1p5M0FIZm1wcmdzSFJibUV4dHh0SkZWTk11R2pnM0JlUWVQNTFZMUM3bHVHamVRNU9QVHBYWExZNXFQYzBiaWFPS09HUldPQ1FEUkVubU9XRFlQbURIUGFxc3NwYXlTMmFNZ2c4SG9LbGdubFc1Ukd4OTRjZzF5U1IzeGR5SFVRcDFRUTdNYlR5YVc5aVZKQTZIajNxYlU0bFRWbWRBQ0JpaS9VR0pKdHB3YVRadFRRdXdmdTVuYkFCRlB1bSswMnpQbkh6WjU5S2p1M1haQ0kxSStYcFMzQlNPMVpjL042QVZGN00xY2J4TWU2aktPSGJrWjRGWEdpYTQwbmNuUUhPS2p2clNUN0drem5kazhjMFdrc3kyaGhWaUI5SzNXcU9mNGJqTGFRRzJNTGQ2aXQ0UE1KaEFKSk9BTWRhRzgxMUJDWTJuQk9LdlJYRWRrMFY1REV1WVNHSlBRbjNyVnZsTVp0dFhNNld4TU16QjFLN0Q4M3NhMk5IMWRyYTJhMkVTTUdHRGtWZTFHMThMYW1JTCtLK1pHbWdMVHhFZmRteldCR1JZM1lpTGNaQUpGYVIxUnpTZDBPMUxTVjFWeEhCeE1EZ28zOFZaWnQ5YXNaMmlpa2xpWmNoZ3B3Znh4WFQzMDBFTUtQcFVPV0F5WlIxRmJXaFRhRjRwaGlGOUVrVi9IOGo1NFdjZGlQOXJtcXZaSE8xSk81dzlwZGVKcG5GdkJxRnh2SjRIbUhrMDJUVy9HTmxlYlRxOTFFNm5EWmxJSXJyZFhzbzdWVXQ3V0FwTkhKeEtBUVFSVnp3YnBPaGVKL0UzOWtlSnIxTFdlZGRrYzh4eEd6ZGhuc1Q2MUtVZXNVVzNLMjV4OFBqUHhoTE41Y2ZpVzhmakFiZWF2OEE5dGVQNUlXbGgxMjRuRVl5NnBLU1IrRmRRdmh6UWRPdjduVEJOQzBrVXhRRkRnTnoycXRlK0ZCQkw5b2dsS00zVXBrVXZaMG45bGZjTG5xOXpuclR4ZHJ6TThtcDNOM0tOcENxc3hVZzFVZlhmRWtzMzdyVWI1Yy9kQWxKcnNkTThINlhPQWJtVDUvVm1yU2Z3QkNGTXR0SHVWRkJ5b285blNXMFE1cDdubnJhNTRzaFB6YS9kcVQxSG50WFNRL0Q3NHFhbHA4R3BMckxQQmNLR1J6ZWRCNzFxemVCbzcxMVIxQVk4QXNUeDlhM3JYU244TVJRV3RocTI1d1FTaUZtVWZobkZSS09udXhMakpubldzYVpyV2hUaTAxYldybVNabDRTR1VucjcrbFlldXQ0ajBuTWNsN2R4bmdzanpISXlQYXZYZkZuZy9VZkVjeVgwc3NUVDdRRkJYYU92YjNyaXZpVEdUZW1HNWdLU3h4TEhPRDNiMnE2VWJmRWduc1kvd0FMdkh1dTZQNG90L08xT2VTRjNBZU5wQ1IxSFkxOWkrQ3J5RTJkblBGSXFtZGl4Qzhkdi8xZm5Yd2xCTTFsZExKSGtiWDRJOWpYMWo4Q3ZIZjl1K0ZiU0o0MUN4Z29zZzZxMjJ1RE5xUzVGS0tKb1NiMFBSTld2dFF0OVJHcHdCbUJ3Q1FwOXYwcmI4QStNdFN1UEdkbFpUYWJhVzlyTklJSnJxZFN6ZVhJdTA0K2c1ckNzOVV2NHRMbWhndVFza3NMQU95WjVQSHB4Vm5RTGFZUldyU1Q1bGpqSG5TNTY0L3orbGVMVHhFS2RPejNPMVU1VkVlblQ2RGQrRDdYWFBDOXpheFcwMWtzME04dHVkdVFPbkdlaEhQNTE4NitCL0M4Tmw4UXRmdE5MdlBLYUcxam1VcS9MTUR5T2NZNXI2bitJK24rSS9FWGdmUy9pOTRkdFRkcHJlbkhUOVdFYkFlUnFkc20wYnVNRHpJdGpqUDNpRzlLK01idldkWitIdnhramwxOFNSRzRZcE9xbmdoeVNPQjZaeFhiemZXTVBvUlRwK3lxbnAzeGN1UEZsbm9VR2xhT1hGMWZiUTc5U0VDNXo5RDJ4MHhWS3grSmZ4VThBK0ZvVzhRZUhudnJLSkFJcnBBeWtjYmdDUU9XeGtqMHhYcG5nYndqRjhVSlk5TnNBcHZaRVkyNWY1bUd3WjI0d1J5QVQrTmFGbm9FM2pidzFhK0Q0MlNDMHQ3NlNXVHpvTXFRUWM3OXZKVUU0STllMVJoWVVxbFBsbWpTcTV3bGRIeU44VFBHUGlUNDE2bEhOY1hnUVcwZXlHRXVkdmxkVHovZU9EMXJ5UFc5SWUzMUo3ZGxPQS9CSzQzRDJyN2Y4VmZDT0R3bEM5cjlnMEoyYVVNanh4K1hJNElIellQSTZqQXJnL0gzd2E4TCtKOUJhNVRUMGhuampQbHp3WXdYN0w4djVmV3ZYb1RwMGx5UjJPYWFsSjNaOHBYT2tRN0EwYWNqdU0xSGVXTFRJSFZUdTc4VjNWNzRTdWJMZGF3VzNtZVVTSlNFUEJHZUtjM2d4bjBlTmhGRzF3NzUyb2NoVjdacnJ2Y0ZGSTRHeFcvc25FbHBOSkd5L3dBU01SWFRqV1BFc1ZoRDVmaXE1SmtIS0NVakZhSytFVUVLQVJBTTNHUXZKUDhBV290YjB4ckMzanNwYmJaSXE1NVhCeDlLaVVGSjZqdW9uTWVKTC9XR2p4ZDZuTEtDTWZQSVRtdVprYmM1T2U5YjJ1U3VJMlJ6a2c0RlkwRmhkWGt4anRZR2tPZWRpazQ1cm9wS01ZbkhWdTJiSGdQU1pyN1U0ekZhK2FYbFZFUXJrSGtacjdCMDM0QWZDenhYOE5aOVoxalEzMEsrdExVR0s0c2JobExTbFFWRzA4RUE1QjZkYThhL1ppK0ZqNnZycDE2ZUVpMHNsTGJuWGpjQURqcFgwdjR2YVdId1JEWmFiQXBrbW5OdzBRQndWVUhiK0J4WGdaaGlYVXhTaEI3SG9VS1BMU3V6aWZEM3dQaXR0TzB6UzlYOFFTRnIweWlKSWJwMGNKSG5PVnllU0NQZml0WHhUOEJmQy9nN3dSZStKYmVXOWttaHRWbUhtWFRZS2xnRy9UOGFrc3RMOFJhcHFHak5jNjA5dC9ZbHVBSTR5U1dsbE80ak9lbTN2WGV5M3krSXRaUGhYWDlQTUVHb2VINUVqeW5Ebk9DMlJua1p6WE81UmxQbDZtaWkwcmt2d3crRS93QUN2RWY3T25pWHhkNGQ4TTNzdmlyVEVoa3Q1akkwa2NjQjIrWktlY0FnNEdNZERYeEIrMHI0TTFHeCtJdDNySWdMVzk3R3MwVEFmS09BQ09wNllyNi8vWSsrSTF4OE92SHR6NFIxdUFHSkhrc05XczJKYnpZVytRNVh2bFR4N2dWVi9hSCtCR242VDR2dlBBR3Eyd05sS0JQbytwU0U1TU1tREV3SkhYQTJrZGpXMkJ4SHNNUTZVdmtUVm84OEZKSHdYWTZOUExPb2o0SkdWNTRyci9EbmhmeG5jeENQVDlUdVFDd0NpT1Z1dmIvSTlLMi9GUHdzdlBCZmlLNDAzVklHQ1FTTVluQ0hEanFwWFBMRGlsaXVMK1M3aGppRFd4dGxNZ1dQY0R3UGNqSDArdGV2TjgrNWtrb0xRUko3alFyRWVkZFNYTTV5czdUeUZ0dlFZeCtCcUd5alRWTGU0MUJwL0tlRUhDY2NuclZ2dzFvdXNlTVExdmJSWmtrM003c005ZnI3OUt4dElodUxHNm50THhXQmpabGNIc2M4ait0VkdFRWlHekM4UXM4Z004Z2JKN252WExhZ2p0SnVHU0s3anhNTE13dkxFNmtFNVZkMWN6cG8wMjQxaUtLOGY5eVpCNXBDNTR6V3NIeTZtTlQzdERKdFo3aXpuVzV0Mkt1cHlyQ3ZkL2doOGVQRXZ3NjBxSFVyQyt0ZFFzaVQ5cnNaNUFKWVRubkhxT1Axcm92aGw4TS9objR3VWk5MG14dG9SRGkyU1p2bm1QQTNONkQ5UlMrTHYyS251SnpxUGhJbUVTTUJDZ0pkRHlCbkk2Y0VmblhOaUo0ZkVSNVpGVVhPaTdvNmZ4aDhXZFkrTE9pMnN2aHpRa3NEYlRDNlhENTN1b0hBNmNWOUcvczIvRTJYWG9OTzFTMWdlR1NVQ1IyM0hLU0Q1U0JucVF4SjRyNTcrR0hnalZmREVWcjRaMUt4WnJpekFhK2t4eEVpNU80bkhIRmVyZkFDNnMvQzJrYXA0bTFXNVNHMDAyNnVMbUNPUmt3VkJKQUh1U1JnOUsrZXhWT2w3SndpZW5RY3BTNW1kbjhlSnZDdmpuNHFmRWJWbWxqZTVnTVNSamNDZk04aGZNYkF4M0hQWTE4eC9EaXpSdkUyb2F4NVlJdGJWZ0FjOFBJY2NENkQ4Szc3NGdMcGxocDQ4WkxxbDlhYWhxVWJ6M0pZRlZtTHNXWmNkc0w3a2RxaytDSGhFYUZvSDIvVTdmZmQzczMycVpTdjhKUHlqbmoxTmJ4bXFPSFNaaEtDblV1ZG40TXM3RjlLaGsxS1o0bVZSNWNialBQR1ByM3JxdE9oaDFDYVczeU5rSzQyOU53T2NFNHJpYnJ4RFlYR29uK3pTenl4c1VOc1V4dDlEN2RlM29LNmp3cWx5c0FTL2NNODN6RWc5c0U0ejE3MTQxZVgybWRWR2tub2lMV0wyMThJSmZ6eVJHUkUwOWxoSkJJRG5vYy9qbXZqcjQwL0RQeDFydnhMZ3NmRHVwM0VyNnZJcGhoYTRaUWpGTng2bmdaQnI3VStQODhQaGp3aHBIZ3lIVFlwTlExUS9hcnRpcExDUE9FSFQvT0s4VjF5eW0wUFZ0UDEyeWpaSklkUmhhV1lxU01FbE9CajA0L0d2Ynl0UDJmT2NXS1U0VHRjK1Y5UDB6eGxZWER3UTY3ZVF5aGlwVVR0MUJ3YW51N1g0cFJXMFdvWFdyWDRpbmwyeE84aHd4eDFHZTN2WDBQNHYvWng4VWFwOFVob1doYUZJWTc2ZHBFbDIvTEdwYkxNU2VtQU9sTDQ4OE4zT3JhakhwY1hobC9LdDlscHBxUm5Db0kyd3hQWUJ1VG5wWHFPVVgwTTRjMjF6NXlpSHhQMUpaSm85WXZYK3ovTEtSSWZsOUt1NmJwM3hjdmdJclBYTlF5VHlBN2Y0Vjd4cDJwL0REd0pxTi9wMnVhcENsMUxQKy90d2hKVTVIeTVISDQrMVY5UCtOMm1lRHJ5VzIwUHdGSGV4dVQ1Tnl6aE4yY1lvc3BmWlgzRnROZmFQRWZGdmh6NDBlSFk0M3Y5WjFHWkg2aU9aaVZ4Nmp0V0hEY2ZFTTNZaWsxTzdqbC82YXprRWZYTmZSdW1mSDFkVDFsWVBFSGdXM2loa2tWZDBkd0J0R2VCenhYcE90ZUFmaHpxd3RkYjhRZUZMV1FOR0FzNG1qS0tlY2NnZ2V2WG10RkNMMGNWOXhGbjBrZkZFM2lQeGRIZXJEcW11WDl4R2pmdlk0YmxnY2QrZWxkYnB1cS9DZTgwejdSYzY3cXR0TnR4SkJPemtrNDV3UmtHdlpmSC93QUYvaGJiNmdKUERkNXA2NytYaHQ1VllxZW5ISlA0VTUvMlp2QkYxOE9vZkhNcmdUVzEvc25QQTN4OXV2ZjhLaXBTcFdXbHZRdW02dDk5RHhyVHZoWEg0MDA5dFQ4TytJcm0xalY4L3dDbnV3TGpIOElCNTdZcjBQd3Y4RHZCbmdEUm92RTNpWDRyWGMwd1FNc2RyTnNVSFAzZVNTZW5YRmRERDQ1OEYvRDIyTVdsNlJBOGthZVhIUGRTcmdEQTRBVWRENlZxYWw4T29manI4Si8rRmcrRHJxMHV0UXRKQ2wvWVFrSTBmb1FUd09CbnVjQTBLRGt1VjdDY3JPOTlURDBueGZyZG5aYXZMcFY4WDBnektJcnN0Z3ZnZmNVRTl2cHp6WGxQaTZhMThXYWhkM1Y5cWdmeWtabzF5Q1MyZXBxa2k2c21vM0hoYTQxVjRFVXNCR0pEdFZ1bkdLNTdSdE8xSCsxM2lGemtMbFdmT1FlM1N0cWRLTlBZNVp6blVscWQxYVg5L2I2TGIzVnJlTWpKRW93akVkT25JcDlyOFpQSDlzVnRiUFc1L2t4dERQbnA5ZTlZbGdaN04xaW5sM0xHMmZMNjVBN1ZKZjZuWnk2cTJzeVBGQjB6REZId1I3VXBRaTNxZFNja2xZN2ZRUDJtUEhIMmh0TTE4dzNjTHF3Q3l4RGc0OWEyL0RuN1g5N0ZvRjE0UDF6NFZlR3RRc25EZ3ZOWmJaVXp3RHVIUTlhOFZrMWVHWFZYdmJPRWdCaVVWdXRUNmRlUStYSzB1SXkvSmZIVDJxWTA0SjZGM2xOSG91aDN2N08zaUM0bWg4VFhPczZCTk01RVZ4YjRtaGlMWXdXWGc0SFBUc0t6OUs4RmFUNGU4YnpRWGZpaEx5eFJDYmE1c2lDczRKeXVjOUNlTWl2Tjd5S1h6OXNERWd0OTdzYXZXc04zYnFHanZIaktqcUQwOWNWTTdXc0VGVVVybmQ2clp3WG9sdTdjS24yZENmS0I2SDA2L1dzYlNORHNkVnQvSzFDV1ZROGh3WW54Mzdtc0d4MS9YYlNZd1IzNVpKK0czODU5NjZLeHUvN09pdG8zaTNxei9PUWE0cWk1RWVwUW5HcnVMNGs4TTZkWmFQNU9uWFVyS25JamR0MzYxVmp0bzU5R3Q3UTlwQmdrOTYxL0VFcUd5bCt6cVF1T25RQ3NhRXd5UUx2REs2bktoZTlaMHBTa3JtdGFuQ0VySWtXMmtzTGh6STMwelRFa1BtL2FTUUZCNUJyUnVwYmEvZ0RLcEROOTRQMnFDUFRiYVN5WlpKR0RGdmxDanZuK1ZXNVhRMURzUmEvZXBjcmJ4Z1o1R1BwVmEzanVvTlJuaGhPUmpPY2NWQnFFVi9aeUkxd1ZkRkl3UjEvR3RUUW1OenFUekVnZnV5V0ZWOWt4bGVWUTBOSytIM2ppVHc0UEZxVzl0RHAwemt4bVNVQnBNSGtnZm5YTGF0QVpkVmlaWk1rSGtlbGI5anFHczNHaU9rTTB3aWpsWUxETEtkbzU2clhQUE94a2ttZE1zRGhlOVhSMU1hdDBpWHg0NnkyNnlLT3BBWTRyRzhOaERGTVhPUDNSMm4zclk4WU9EcFRKTXkvS2NyV0JvS3NYM0QrSWhjZlhGR0RYN2dXWS93QWM5YStFdXE2ZDRTK0lPbWFOcW5FTi9Hb2trYzlOd3huUGJrRDg2NWI0L1dLUitJYm82Zk9za1VVelI1VnM1QVBHZnd3SzBmRU0rbTNyUXlKdlc4MC9UbWxpbFhQQlhCQS9UOWE1SzAxRjljMCs0dTd3U1NUTXJNeGJ0bm4rZGFxbmFxcEhGQ2Q2RGdjdk5hR3drVlMyY2dFR2tlNGI3VkVqSU1jVmQxcTMzV01OMEd5UW9IV3MyUitZMmJxRFhTM2N3cHF4clR1MDRSVzQrYm9LaXRvSkpIS3g4bFc1d2FkQ1B0TWJlU2VRTW4ycXpwY1p0UVZZbkxjbk5jOG1kc0NKQ3lYV0p6aysvZXBiaG5hQlcvaHpuRk0xTkQ5clJnb1VNUm5OV2J4a2ppakt1dXpJR2ZTc1hkblJCcExVcVN0aG8yZGVCMnhWakszcUZVVUhqcmptcjhDK0M3elI0N1c4dWI2SFVoTis4YmFyUUdQdGp1RDBxT3gweUd6dkJCYVhIbVJjZk9Sak5LV2l1YVJuemFGQzR0TG8yL2t5MjdZQnpnanBXaDRZdE5JMGkrc3RTMTJ5TTlxYmhmT2lBNVplOWVyNlI4RXJDM2kwN1Z2RlhpZXdqajFDMjg2S0dLNEdRQWVqZmwrdGErditDL2hQYmFZc2NsOVp5eHF5a3FrNEdENmpGYzZ4OFlUczB6V2VDOXBEU1I0TDQ1czlOaDEyOEdncDVWcTh4YUpNZEZ6MHJLdEpBWVBLdUk4amdBMTd6b2VnZkR6NGZlSm9maUhwbWdhWHJRdG9pcTZKclZ6dWdtWmwyN2p0T2M4Z2dlMWVLK01MWlcxbTl1WXROanNFa3Vua1N4amZjc1NzY2hWWTlRTS9sWGZTcndxL0NjRlNoT2tyUFV5citHU0xhMERaUURnK2xTM0tRU2FXbDRwSG1vUmxldWFpdDVad1dTVmdWQTRCUFNtdXJzM0RZWDA3VjBxVmprY09wME56Y1FheHBNV3J3YWNJTUtJN2hFKzZUNmptb2JTZVBTNDBTNGdHZDRhT1ZPbzlqVlc0dkpEb2x2WldBQWhRbHB5T3BZK3VPMU50M2t1TVJ1eEk2S1dQZWh6UktnMmJtdGFuY2FoZXhYOHNhS0dVWjJyMTk2enBKYlpyaHBvcEFURzJSa2Mrbyt0R29pNGgweTJTSzZEY3NHUWRWNXFsQkNYZktLY2pvQjFOSFAwRDJadjN2aU8wMWVPTnJ6Uzh6cUFBMEkyWitvRlFOZDZ1NDNSU0ZZeC9DVzVyTXRaNXJTK0VvUW5JSUs0eWMrL3BVa1dvdkVyQXRra25nazByc1hzMWN2dHE4a2tZS01WWWRTSzJ2Q1hpL1ViTFhZRmZVaEhEdUdaWlBtQ0x4eVIzNlZ5a2JPWVBOQTZOMHB2MnFaMklaZG9KenhSZGc0STk1dWRNWHhYZVRmOEFDTDYvWVg4aGtMckhiSjVibnBuYXA3YzlLWllhZW1tVHh3ZUpOQTNKQ3c4eUdWTU13d2NnSDIvcFhoa04vcldoWDBPb2FaZnZCS2hEUnRHK0NEbXV3dVAyZ3ZpUmMyeVcrdFhNZDRBQmhwSXh1SUh2NjFTbVp1RmpzTlYwKzBGMDh0akpJTno3cmRBM3pCTTVBejdldGNqOFJ0Q3VMdTBtMUc5akpsaUtwdks0M3FPbGJIaGo0ajJQaTZNd1QyN1J6Um5KS0RPUGZqdFhYM3VvK0JIOE5sYmlHZVBVSGlLNzVJdzhFbVNPVzlEeWFwN0J1ajVYMW1Gb3BTTnVNSGtWNmoremI0dk1NVjM0Vm51Q2hsSG1XekE5SFd1UitJM2hxNXNMNlNiNUpFSnlHaCs2T1AwckU4SjYzYytITmJnMUMzY3FVY1pJOU0wcXNGV3c3aVowM3lWVDYvOEFCL2lkOWR1V3RMNjhFY2tZQmFPQk1COFk3K3ZCL0t1bUdweVdURzRWZ1ZBd2M5SzRQNGF2WWFsWUxya1Y0QzF3Z01TanQ2akkrdGRaQVh2SlhzcjF0dTZQS2tkdW5VMThYaUV2YTJQYXBmQ2ZRLzdHSHhRMGU5MVBVZmdsOFJ0WUZwcEhpMkpCYlhVbU50aHFTNSt6ejhjamtsR0kvaGMxNDkrM0I4QWRlZlZOVDB5NDhQalQvRUhoeTZrODZIYmp6Q3ZKeHpsZzNMS2U0NXJDMHJVTDJ4dVUxRlppakFxd0tuZ0FjZHU5ZlpYd3h2OEF3MSsyYjRTMHp3enFMd0o4Uy9EMXA5bjBvenlpTWVKTFJWd0xSMy81KzBCL2RzVDg2L0lUbmJXK0VyK3lxY3ZRbXBUNXRUNDcvWkIrTDFwcld1YWZZWGx5OE54WlBHMHNaRzB5TXJBT3A3OHFNWUZlNS90bnh3L0RueE5xV3RmQ0xRYmpTOVAxV0FYV243QUhBaklSbUtNRDBPVzRIVHkyeWVsZUJmdFYvcy82dDhIdmlYTjhTZmhaWXoyakpkTzkvcFJqWkdpa1Z2bk93OHFjakJVODlhOWErQ0g3VmZndjlvajRZSjhIL2lUY1FXbXIyTzQ2TnFWeWdab0gyRlRDd1A4QUN3WmdQcm5zSzlDVkowcXZQSDRXYzdsN1JXNm1kK3lINCs4TjJuaVlhM3JIZyt3MTI1aGtEVE5yTUl1QTQ0NEFZN1FjVnBmdGIrTXRJK00veHZPcWZEUDRkNlBvaVBvWC9FeDA3dzlCNWNFczBPY3loQUNBeEhVQ3VHdDlBMUQ5bkg0enlhWGZzemFmNXlOYk9Pc3NURU5nYmpra0xrWi92Zld2Vy9qUDhCdFQ4RWFMb1A3UlB3a3VqcXZoZlY0VWxXN3RtTHRaenVvRXR0Tm5oY0U1QjZIbXNLY3VUSEs3MFpUYWRDMXRUNFU4YTYzblZybTJ0NGZJUVNrdjJKUFhIWXJ3Y1ZWbDFUVDMwajdkYk41TWtjWXpGajd6RHY3OWYxcjZoOFplRVBBbmlXMlZkVStITnZlWGNpaVJudFV3ek5rZzVLbkh2MHI1NStKdmd5MThFM3R3OE9oK1MwcUZZYmRwTjRUT1BtOSt2NmUxZStwUmV6T1BXNWYvQUdVL2czOFEvd0JvUDR0MjNoandYcDRtZVdjTE5OZE1WZ2piY0FGSkl4ME5leC9HdjltTFR2Q1hqcSsrRTN4bDhPU2FicXVoek5EUExibmJ4dHlwejNVOVEzZXRIOWp2eFBQNFErRytseitFNEJhYWdrcHVaSGpHM3pIUmlWenlDeHp0d1BZMTlkZkcvd0FlL0JYOXR5N3RmaS9DbWozbmpDTFFvOVAxL3dBUDNWK05Qbmxuakd6ejRXSktQMUF3Zm00cnkvcjA0NGx4ZXh1cUhORS9MejRsZnM5ZkRUU3BibTU4TitKTHE0amlRTXFTb09TVC9oMVAxckw4UGZDeTh2ckcwMG53ekJ0dWJxVlk0b3hHZHpja0hjY2ZkNEhQdFgxYjhTdmdob3pSVFdMK0hZZEJoU2MvYVB0ZDBKWkIyYm5uNU0rNTlPOVpVSGgzd3I0WThQQ1B3aE9zd0toYnZXRDhwd1NEc2pQWlFjL2xWNGpNRW9XaHF5cWVGOTdVb2FSNFIwYndMNEp0Zmg5bzEybVlvbGsxblV3ZUMzTy9uZ0hIQUgwckVmVmJ2VjlTYlU3ZlVYbXRReXd3UkFaMnhLU0Qrb3pSNGcwL1hmRWVpWEVIaDlIVFQ0aHZublB5K2NNRUFBNDVCd1AxcTFwbW5RK0RQQWkzTnlNVFNSdVkwWlR5V3p0SFRwMU5jTkdsS0h2ejNaclVtbXJSMk5uNGUzbW42ekErcW5hRGNhbEt3SWpPVVZlQU1lbUJYWCtKTll2ZE0xand1ME5yYi9aMnY1cmVhYVNJWnhJbnk4a2RPT09sY0I4Tko3RHc1RFo2TGR6ckVabzg1ZkhMc3dQOHlLOWQrSW5nbTYxejRRNjdxT252c3ViV0czdjdORTdQR2QyM0l4eVYvTVZ6Sy8xdHN1WDhKSGlueDQ4T2E1OEt2aVhaL0VlTkp2czA4d1RVR2pBR2VtMlRBNytwOVJYMWw4T1BCM2hYOXR6NEp4ZkR2VGJxMGo4ZGFKQTF6NExrbWxDaS9YckpwN0grOUpqZkdTZnZESEdhd1BoaDRQMFg5c3I5bk8vZ0ZvajZwcHRvMGs5dUZKTC9BQ0tISHlqcVR5T2UyYStYdkFQeEI4Yi9BTE5ueFNiNGM2cHFkeGFHMXU5MmphaEhNVTNoWElYRGRDNE9jZS9IU3RxMU9WYmxxUStLSk5LYWluQ1hVN2J4cjRWMUs0aVB3LzhBaWw0TVIxc0pXUnhkUU5EZDJqZzRhUGNlVllBRWJXNlpQR2E4dytKbndiK0ZYaHJRTGZYZkMrbzYxY1gwOGhhZlQ3MkJWampqNy9PT1QxSGF2MEZ0dmpwK3o3KzFwNE90NC8ya2ZEcjZaNHdTME1OdjQ2MGUwMy9heUZLb0w2RCtNa25KbFg1c0R2WGp2aTM5aXE1MTNTN21XMStJdmhpOXRta0p0TDJ6MWdZTUFQQk1MZ09yRU1NcjIvQTEzVXN3anllOXVZVG91K2g4cy9DTHczcS9pdlhMUHc5OE4vREVsdGZYRWlySkZhRU9aaGtaSjMvZEhQWHB4WFQvQUxTSDdMK3UvREhWcnl5MUx3cGQyMnIyUUNhMXBPb3hCSjBKMi92RTI4TUR1NEs5Y1pGZGo4QnRmMHY0SGZFKzY4UDZSYXJmM0U0K3pTM1hrSEFqSUFaVjZIYWZYL1o5YStydjI0N1czOGVmc1kvRDc5bys0czJYWDlMMW1md3JxRWthbnpiNjJWVExhT2ZsM1NOSGdxQ1NlT00xa3N5a3NVb2RHUDJGNmQrcCtNWHhDdTdhSFVXdExDT1NKUmpmRzU1VTQvOEFyMWhlSDdlK3ZOYXQ3ZXd0WG5tZVVlWEVnSkxuMEdLK3pmaVg4RGZBSHhpOElXSGlTVHdEUHBPdU9NWFpqVXhCOFp5eEhmUHkrL0ZjZjhQdjJkOUQrR3ZpdUx4VWtja3hzM0pUenY0ZU1kQ005K3RlNjhSU2hUWndxbE9VMGV3LzhFK3ZpZDRROE02MWEzV3IrR2RGbXVMU1FDVzAxZlRJNVZKRzNLa01EMXgrT0srdXYyby9HSDdPdnhYOEw2VDR3K0dud3lzUEN2aWlDNFcyMXUyMGVOWXRQMVNCa3lKRlQrQ1ZXSFFkUndjNEdQalg0Vi9DcDlNMUsvOEFpSHJTZVVMcWRwb1lHVXFWVE9jNDk4Y0d1czEzeDNMcTlqQmJXVnpMSEhEY2dRQmZ2TDFCUHIwQUZmSVJsTDY1S1NlaDdFb1JkRksycGlhZHIwL2lQVWRiWklQSU55NWhTYUplcUtkdXdaNlp3cHg3Vlc4UzI0RmpINE1UVWtpYWVSWHVsM0FyRkFEOHFzUU9BM0ZTYXRybWthQ1k5RzBncExxVXpjTENtNG81SXlXOXgycU85OE1TNnRQYjZGNGNzWkRmNUxUWEdTZk9rNUc5dTRVRURqcHhYUkdQTk4xSmJHVjJrb29kNG5pdC9pZnJtbCtEckIvOUQwWW1iVUpVemhBUGxXTVpQb1AxTmRiOWdqc0p6WTJMQ1ZCRUFkaCs2UjlPd3F0bzNnK3o4RDZNTkd0cnBaYnFRbVc5bkxCakt4NjRKNXdNVmZzcGJTei9BSDhia2h5Y2pCNy9BRTdWeDE2N3FTMDJOWTAxSFFoc2RMdnJKNU5XbWlRTzU0S3FNNFBjK29ydGZoaDRiR3MrSXJlM2FURnVYMzNVcDZLaS9NeDl1Z3JrWG1XYTk4aUNYaHVGUW5HMC93Q1JXMThRZkhFUHd0K0ZNOGR0S1UxYlhvakJDVkhNY0FIenZnY2ovd0N2WEZVNXFrMVRYVTY2YVVJY3pPSCtKSHhYdC9pZDhlSnIrSndMU01tUFQxYnZGRWRxOWZYQkordFEvSG54bFlwNGFhKy80UlMyanZOT01mOEFwa1RMc25CWEMvS1RuYUNDVGdkTzljMyt6WG9VZmozNGgzR2xTNkpOTEpIQTcydC9BeEhrbmR6dUJISXhuSHVhMFAya3ZEY2Z3NUxpN1JMeTR2V2EzbGFaRUsrUzNKMkRQQkhRSHR5Syt2d2xPTkdDZ2ViV2JxUmNqMVQ0UWZHbndpM2hDQ2JXL0Z0aGRhMVBEdXVKSXBRQkhuSHlEdWNIajNGZkxueDA4YitMN0h4VGZMYVJUUTIzblA1RTZaUUZjN3NnOWVhNDN4Rm9FMXZkVFhYaEtkbmhSdDBlMHRsVkhJQmJQVWMwM1ZmR09zYS80UWkwUFZXMytRNSthU1RjeEhYbjM5Njd2WnE1d3hrem00RHFXdVh4bXU3NUI4M1k1T2ZmMXE3cTZ5V0VDUkM4Y0hQSHpaL0dxa2M2V2liVXR4MHcyS2JEcVlWM0UxdUpRZUVCN1U3TXRSdXRTWTNrVndxK1pBK1FQa0pOYTUzWG1seDZiUHFjeXh0ak1heUhBK2d6V1phd1hsd3U0V0pPU0NCakFwMTVkL1lKOXNqbFpGWE9DUitGTDNyaWNiR3duZ3FiU2JkTlNzVExITHVCV1NhY0Q5Qno2MXRXZml6WDR2RDl6b1d0ZUxwR3Q4RDl6NW55a2pHUDgrdGNWSnJXdWFyaEo3cDVGUVlDbGpoYXBhZ3o3V1dTNE9leFByVnEzVWx5azlFUytOTGUxZ2RHdHRTQlNXTU1vYjFGVS9EWGlUeFZvMFU2YUg0aG10MG5VcmMrVk9WM3Iwd2Z3cWpxcFM5bmhoa2tKQ0xqZG1vcExpTzFIbFFqSEhVZi9XcXIzQ05KMzFMRjNldE5kRW1jbVFEQmNray9pZTVxYXh0THkyWHpVUW5keVNEMHFycDBjTXU2OG1iWUY2QTl6VitMVnA3ZDkwR0RHUmphd3FXbXRUWlU0b21ndTVtZGtKeXVjRmozcXByYXlXMHdnS0VBZ0VjOXFkRXQwVWpoVmZtbGZMSEhRVlByalNYTndscTNJVlB2R3NtemJrdWpPdDRWY0dZRUE0NDRwcjNCWlJ0R0c5Y2RhUEltaGw4b3ZuMDlLa25NSW1TMkdBM1V0anBSekpMUU9TVml6Y21Oalp3MlFETVZ4SjdHcExtSzZ1N2oremJkTW9wRzV4Ni9VVkRZMit5NDNDVXJnSGEyZTlkWFphZEZZZUg0THFRZ3pYQ2w1TW5tdWFwVlVEb3AwcFRpWU0rbWlDNWdSZTJPdGJYbmVROEVXTWhXNUdPMVpONFJKZG9FbUkrZnFhdGFuZFIyOXhDa2pnWUkvR3NhMTVIWGgwb0ptenFWM2F6NmZkUnJIakNjTi9Xc09meTdhM2dqdDN6d0NUbXR5V3lMYVRKTmdrU0wwQjlxNW1hTWlWc1NnN1Z5cWYzajF4V1dIMVRScmkvZGFadUxLMGxvSmRneUJ3Y2UxV2RCa2lpdUZhWndVT2R4YnRtc3orMGdMYU5aTGZiOHZ6QlRudFdybzFwYTM5a1pKQVFEOTBkUGV0SmFSS3B5VW5aRkhXcmQ1SmxYYVFwenR6MzU2MVI4TzNjMXQ0a2xqTEhIbG5DK2xhK3JTeXo3VlhCVlJnY2RzVnoxbTh3OFJTUlJMeU9wcW9POERPb3JWRXpWZ3Vaam8za01kZzh4dWg5NnJXRnZieVhQa1N1Q3g2WnF6ckNHT3crMFIvS0kyMnNPbVRWRHcrdS9VUk8zYnJSUytHNk02MXZhV003eHRJOGxuZ252eDZWbWVGN2hJYmlPT1hrYndXUHNEV3A0NFZSWlJSS3ZKNVBGWlhobXpGeGZRV3hiRzl3TjJmZXRzSmIyQnpZL1d1ZWphSFBwV29henFLcUZQL0V1bEF6L0FMb3JrRTFLYlJrbXNiU05RazhYSjIrM2F1aDhPNlJjYWQ0M24wNk1mZnRwQithY2Z5cm5MczJzQ0grMDBiRFJIeTJIWTFzL2lPQ09rR3pIdjU5dGlxTURuYmpuNjFsTVJJeTdSMDZWcDZqY3h6c2tDQWZMR0FhelNubHpBTHlPMWEvWklpYTJsc2x0TnNKKzhtRFdtNndid2tLQU4yWTlEWFB4U09Ma2VZcHpuaml1aVFncEVRY0RGY3RTNlo2RkN6UlUxV1ZaM1JwZ0ZjREJGSmNXcWl4ODF3UVFNcUtoMWwwV1lzRGs1cXhKY0dYUmdjamdER0tnMSsxWXEzcGREREszREZCd0RWeXl1ekV5TE0rM3BnK25OVnRVaW1Xemhsa1hzT1BTcDIyUERFMk05d2ZTbExWR2tVa3pyYnZRTlYxVHcxQWJlWnBHQ2xsVldKd3Zwbm9LNGFXUzdLdUdsYmRFM0taNlZ1bnhOcm1tMlAyYXd2R1NJaitIOEt5TFF5VGg1V0JMT2NzZTVyT211VzkwYU9OM295TzB1cEpZdHJPUXk4OHQweFVrbDZ0OUdJWm9BcktNWnp3ZmVtUXhoSm5WMXgxeFNlUWQ1Y05nZ0hGYUoyZWdxa0x4TTI3QzIwKzZPMzNjL3dBUnFTVUxxVGo3T09pNEtpcHBiYjdRaER2aHFpMDFHc3JvYmw0QjVyb2pLNk9GMDdNMGIyMjBpejhMMlZ5TDRMZE9Tc3NRUEl3ZXRabGpLeVhLdnZ4N2pvS2JyNEVsK3pKOTBEcDZWRkRLaFVLcDVBeFZMYTVLaHFYcnk0ZEpHVkFjc1FjNXAybnkzRUZ3MTdhVGN3YlpHWUVjZlFkNmd0cmhwRVpKVTc5Y1U2V3pNVVlsRDlCVFVrRXFkOWp0L0dIajNSUEh2aDZ3czV2RDJtNmZyTmloanV0UnM0dGh2bDdGbCs3dTl4MXJrQmJ5cTVFc0cvMWZPUHpyTkx5ZVp2WW5LOURtclZ0T2JtUmttbE9XUWhPYXE5ekZ3YUxDQ1JYMm5JQTZDbVhFb1UvMHhVZjJpYUpSQmo3cTg1RlB0NUlwaElKcmRtT1BsT2NZTkFoTHVUN1NVWnlTQXVPTzFKQkl2S0IyOWkxV0xEU0gxS1JZN2FhUGZ4OGp5YmF1YTk0STFmdzVkUWpVcmN3R1JBNkkwZ0pvdllubEs5dGNYRmhOSGM2ZTVobVRoblE0M0ROZFRwM2oyN05xMXZlUkJsWVlMZmRQVHI5YTVOMWsza2dZVXI5MGptaXl1YmlETzdsZXdJcWxKa09MUjZoNGorSHVsNjc4T292RWVoM3kzTEl1WjQxYkxxZnBYZzJ0NmViTzhmSUtqY2NLUjBydS9DWGkzV1BEMnIrZlkzSktTWkR3c2NxUWV1UlRQRjg5bmVYRnhxTnBwOE1pem9ROFV2OEFDeDdqSFNyaEt4aEpYWnJmczgvRTk5S2tQaG5VWnlJNUQrNUxOMFBvSzkvMG02dTVHam1XUzE4cHNaYTRjcWM4ZER6WHhZc2w1cFYyc2lFbzZNQ01IRmUvL0JQNHd3ZUlkT2kwRFZwRk02RUJBLzhBRlhoNXRnRy8zMU5lcDZlRHJweDVKSHRWaFphZmUzKzE1N2xWWml4RGpoQU1jKzQ2MW8rRWZGMnArRnZFOFdyYUpxRXNUd1NHVzJsamNqN3B6bGNIZzVBd2F3bm5rdjdqN1RiWEpqajhqWUlsUFB2bjI1NlV6UTVESmR4NlBlRFAyZHl3a0gzU3ZwK1BOZUhGWGlieXVub2ZiV2kvRlg0UGZ0NGVIWWRKK01Pc1czaGI0a3d3SkRENHVraUF0TmN3TUpIZnFQdXk5QUxnYzhmTURqTmZObjdWUC9CT1R4UDhPZkZMYXRvSW44TzY0Zzg2T1JUdnRMMU1rckpISURpUld3Q0dVOU8xY1o0YzhaWWxsbXNaREhHc3pEQVlnZ3J3T0J6d09sZlJud1cvYnE4VStHTkVQdysrSjJnV3ZpbndrR0lHbTZ1aEp0c3JqZGJ5WkxRdnR6amFRTTEyME1iVXBMbGxxakdkSG0xanVmSzE5OFhmR1BoK09Qd2QrMEg0VWtrYTJCaWgxcTNHL2puNXNnWjdubjlLOUwrQ243VS9qSDRSMjdhUDhQZGZ0dkVIaG5WR0szZWpYWkVnVXRqSU1aSFBBeG5yWHIzeEorRDN3aStQOW5KNGcrQStveE5keVlhZncxcXJxTHlJNXppTW5DemdaQUErOVhrRngreS9wSGdqeFZhdTNodVMwMWUxazg1MnVITm95RlNjTHRiaGpnSG5wWFlsaGNRdERCdXJEYzlEMVg0aC9CM1g5UWt1TDM0VTMyZzNNN3ZJd3NKbThrRWpBSmpjREFHY25uR09CWG4xN3Azd2UxclQ5Um04WWFjMm9TN3lMWXhMZ0dQTFpQeW5DanA2a2VsYVB4VmcwanhYOE9KNUxQeEpOYmF5alpqczVJMURDUTRKQUlYQlVqT1czZFIwSXJ4WFR0RytNWGhKMXVwTE5wVWY1QkhJNnVvSjQ1ejA2WnAvVjZrRnBJaU5aZFVkWHJ2MjM0WkxGWStIZFBsaGdNU3l4b29JYUxIWEFKNU9EbmtkSzF0SjhlNlg0djBsSDhYZkRjeVhxUmcyMnMyRXB0SlNvNEhtRDdyRFA0OU9heHRPK0ZIN1EveEpRNjFKcVVjQ3lJcnFpOGxGUTdjQUFjRG5HTS96RkY1OEN2RmQzcGF6NnY0cXZMaUtLRWw0NFF5Z1l5MjA0SFBIcHdQV2oyQ2x1OVIrMmFkeC9qZjRwd2ExSzJoYVJZdmYzRzdaSGFXL3pzVkI2TTNRY25OWHZoLzhPNy9YclEvOExUMVgrejFpUU5aYVJHd1JDdU1aSlAzbUdlbmZwWFFmRFp2aDk0SjhGTGVhYnA2RzVVRlpReUFzWDV6dlk5dG9QMHlLaThYMzcrUDlTMGk5aEVrVmphMmhhU1RrRmlHKzZBTzNIMXB4cFVjTEhtZW9uV3FWbnlvemRiOE15WGx6YldnWm9yR3prTDNFWVU3ZGdKeWRvR01FZGo3MU5ydDViZkVGQkxZV2drdDdaMGp0NDBCNmpJQnllMk9tZTFYdFExZTdnME45Q2lSSTdPNmtXRzR1Wkk4eXlqSnlCeG5CUE9ldGJIZzN3LzRVWnhhM3RzYlRUN1hMWERJL3pTYlFCa3NTTSsvZXNwMVZVbW1hUmhLTWJNOHhsOE96ZUlmRXlhVENESGNXa0t1NFVuS2REakEvRG12WnZBL2lXNXMvaVZkZkJyWGJqZDl2MG1KdExac0hjTm56TDM0eHUvVHBYbVh3V3RMTFYvaWQ0bHZZMndvTHJFREoyM0VnZmdCbXRqOXF6VWIzNGEvRnJ3ZjhSTEoyTWtGcmJTdktyYlFWR2VDZW1PQ0t4VlBteERSczVmdTBhZjdPM2pIV3YyY1AyaXJqd0xxK3FYRnJZYWhjR09kVWJ5enRaOEg3eE9PQmpIclhzUDdibjdHSGdqNHJ3eC9FTFQ5SmJaZDIzeVh0dE1NV1Y0T1N1L09RSCs4T0JuUGJOY3ArMmY0TzhIZkZENGVhSjhkUGhkZHh4MzhjS1N5eFdya3U2a1pWdUJqZHUzRGowcjBmOWpEOXAzdzE4VWZoQmMvQ0g0blN4S2wzRDlpWVRiNVREZEtNUlRISFRkMDU1SkE5SzBsSjBYekl4YWJQaHlIeEI4V3ZnUnFMYVI0bHRMalZOTGd5dHZxOXFyQ1ZFSFRjTWM4R3ZRUEN2N1FGdHJ5eFhXa3p3M0tSZ0IwTVEzY0hQekx4Zy96NzE3YjRzK0ZvMDN4cE40VzhTYVZGTGJxektrR01sZmxBQnp6d2VDT2xmS0h4L3dEaHBaZUYvaXhjVCtEVm1zSUJJdmx5d2tvN2trQWtLQUFSbnFNZm4xcXZZMGNVcnJjSTFwUWRtZXlYM2pqU3ZGUGl1eThRM2VoMjlzOXZFQVhnUWJuUFFaUGJHZW5iTmR6NEgvYUN1THU1My9Fenc5YmEzNGRqQXQxOFBYVXpLbG9xcW9FOFdHeWtnQWJEZTlmTGdzZjJnZFB1TFdIU0lyWFZZSlkva2U2dFBMa1E0eU54SFZzQUVZOWEyUDhBakpOTGRubDhDMmJJbzNTTERjazVDOEVEbm50K3RjZFRMcW5OZE02NmVJZ2tmWUthZit5VDR1UmRSZzAveGpwVWs4SG1mWlk5V2h1STErVHMwaVp4a2NIUFd1WDhSYVA4R2ZEMm4zRno0UjhGWDl6ZE1jTGY2M2NDU1JTUU1sVVFiY0RudFhnTUZ6OGFiUzB0TlN0ZE0wMExOYm95Z1RNVEh6OTNIVUVlbGJQaGViNHBlS3RTa3MvRlh4QnROR3RYWStaTGEyK1pXT09nWitucG1vZUVyL2FxYUYrM3A5SW5TNjU0Z3ROWHNCcDE3ZFIyb0pHNTNKM0VEcUFnNUlHUnhpdWN1SUxtOFNYUXREME9XMVc3UXlUYXRld25kc0NrNGpRRENqSVB6ZFJtdE93K0RxNkQ0K0YzNFJ2N3pYVE1Ga1M5dXh1MlpPV3l4d0FQcDJydWZFVU9qV2hzN254ZGQvMmhjUmZLYkxUaHRSQTNPSkplcmNuK2ZOTmV5b3gwMUlibk5uSmVDZkJySjRmYlM5SDArQ0VUYmY3UTFlN1RMY0E1SmYxeTNBWDA1clExVCt5dkIram0yOEZ3eVR6VG5FMTlMZ1N6TVJuQS91cmtHci9pRFdyaTh0QWpSckRhcW84cTNpVGFrZkhZZmwxcWhwMFNYa2Ntbk94eHZBODA1NEk2ZjEvT3VhZGVkVFI3RndwcUtiNm1Gb21wV1dwNlcrbzI0a2FTVW1NaVpNU1JPQnlEbkhmSi9Lck4xcWNsdGJpUzlTTWhGeGxCakJxM3I3M05xaXlSd0NTTkJ1bStYYmpnY2ZwbWpRTkVuOFhPUk5ENVZyL3kyWThEZ1pQTlp5dDBOS2NYTGNtOE02WFlKYVQrTXRaa0VXbjI4UmxtZHNEQUhKSDRuQXJ5UHhMNG84ZC9IVHhocUZ4b0dsTmR5K1dzR21XT0Q4a0pKeHh3QTJDUHpyby9qbDhXdEt1dFBid2o0Zm0yYURwcHhkM0NaQXVwRi9oSEhJL21hOHV0UEUzaWV3MDJ6OForRjdxWFNiZWJVU1JPajdKSEE3cmorSHVQZXZaeXpMMjM3YWE5RG14bUpVSSt6aWZTZnc0YTUvWlRnMHpWdmlEb2RqZFRYMHNhWGR0YU1QT2dRaGN1VDBJSEhQVHJYRS90NDNTWDN4T0l0N3dTV3YyUkpJOW0zWXl2a2o3dVFUeVB3SnJ6K2I5b1hRSmRZaWsxZS9sdWxUWWtqT1NXWlFlNTdmVHZtcnZpYldORCtMbmphWFdQQnd1ZFJpdnJMYzltcTdwN0NkQng4dTRreHR3QUJ6azgxNjhhVFZTNXpLc3ZZOGg1TGRhNzV1bWFqYTZUWktrMFViU29ISEVpakt0Z2ZUdDlhNENIVm5SbTJTdVVaY3JrODgrbGVxZUJmQXV2M09xWG1yNm5iVHdSMlc5WDh5RXFTNWJheTRJNmZqNjE1L0hwVVduYXRPdjJDT1ZSS3dSWEI2Wi9UOGE3VnNjMU5weU01TlNsS2lCVjNIZGdFRGlyajNWdEdpd3ZDVUFHYzQ3MWJUUkpMdVJybTNpU1BJNVFERlZycTJ0ck9FWEYwNGRVbUdJT0NXTkkzTHNVaG1zdzl4ZFBGQzMzUnV3VC93RFdyTjF1K2lZSXlnbFVHRjV5YWcxKzYxSjU5dHhHeUpnQ09NY0JQYXFrem9Zd1drK1pWNUI3MFdGZE1zV21vdGFBM1Z2Y2NmOEFMU0ludFVuMmR0WlJwTGVYTzlkMlNlbnRXRGNTTDUyNUd6ejBxM3Ayc1hOdHZRRGFyOEhGR2d1VmJrTitacmRoQUpPVjZqTlJBU3pqTWh4VnJWdkt1M0U2SHF2SkZVNHhKSWpSci9BS3JRclJGeTBuVkFJMjVWUFgxcXl0d2w3RXpsZGpSOU8zRlY5Q1RUNVhrVFVXWUtJOHhrRHZVcmJKSW1FUjJBRGxzWUpxSlNTSEZYMk5DMHZVVUp2UHRpbjNXMmJVRElPdzVHYWkwblJicWZTanE2akt3U2JYNSs3NlVTL1BjdHNCNUF4bXVXVXJ1eDBxTmtMUHR1Sndxam5PTTFEYzZkNVY5dlk1T0IrRlMyOGMwY2dtbDZaNHE1Y2hJN2J6cGVBZWhOTG9VN0ZlYUhKUlViMkJyb05UbWEzdExlQjBZdDVRQTVySTBlR0s4bWpFeUVCU0dIeThZcloxZTRXN2JoY0xHdnluNlZ6MWRhaVIxMHJxaTJjMnN5dnI2b2dKVlQweDByVXY5Sy90T0o3cFB2d3RqSFhQTlkybUg3UnFyU0ZnQ1h3UGZtdXZsczRZN01CSDJFc0NjSDd4cFloOHJSR0ZUcUppenpUMmZoNDRZajkzem50eDFybm93eDhvN2l4NUpKUE5iM2l5ZUtPMWcwMkZnRzI1WWlzR3hCTTVEUG4ycktqN3NXZEdJZlBKSXYyeVlaTWtIQlB5NDlxMHRIdk4ra1NRcGdGRUxNQjFBcWxCNWF5QXhMMFBYSGVveGJPdDVKSXBaVllZWlIzSHBWcVNhc0d0SWcvdEdkOWsyL0tsdVJtcW1oM1c3eGxLTWNOK1ZhRnpaeUNJcEVBVkJ5Q0IwckdzVW1zdkUvbnlLUXA5ZTlhd3M0bUUzSlNWem83OHhTNlhjcTc5WnVCV2RwQ3pRVEJ5ZURWMlpsbjBpVnZKSkJja05tcUdrSmRTNTJqS0tlYzFFRTR4Rk44MVM1SDQ2UkRheE9xOUZ3Y2RLeVBDN1JQcUZzWW14aVVmTU8xYSt2ekM3OE9TT1ZCSU9GelhQZUg0cG12RTJINWd3NmR1ZXRiNGJTbFl4eHI1cXVoNlY0WDBIVy9ISGk2NzBuUmRUamh2NGxQbE5JZG9aUUFDTTlCeC9PdUw4WjNGdmIyY1dsWnpkV3hram1iSEIrYjFycDV0YzFEd1A0eGJVTkVVeFNLQUN3NkhLalB0L3dEWHJqL0Zpck9qYXJuRFRUc3pEdmsxMHRlOGp6NGZDMFlsekZ3b1p3VGorSHRVU3BHc2k0SnpuZzVvT0VjZ25nMUZDQjlweHpnbmppdG1seWpXaG95UmhMbEE3NUJBd2ZTdG5TcnEwaXY3Y2FuYnZKYnF3TWdRNEpGWlJhTWxFeUNBT1QxclZzakhMSDVqSGhSM3JpcW82YU81VjhUeDJsMXFjejZWRVk0Qy93QzVEbm5IK1RVUVdTRFNtTGRWNXdlMVM2b3BoY0lyWlZEOHRSWEVrdHhZc3ZsNHlPVDYxRWRWWTN0NzF5YTh1eHFHblI0WEh5akFxT1c2Q1J3MjRUb09UVnU0MDYxc2RGc3BJTGdPWkljeUFmd24wclB1anQybFFEUm9hTzdMVDNETmJORXd6bmpOTzA1VENUdllaeCtCcG1WU3ozTUFUNis5UTIwOFhtYnpKbHY0Um5uTkk2RkZ4YXVXbzRJNXhJN0hCQjRHS0xLTlM3ZktTUU90YWZoMjJzcnZUcEptbkNYRVpKYUp1NDlxenN2YXpTb0JqazRyQ012ZXNhMUlxeUtVK0lyenAxT0FLaXVvWkV1Q3lZSHBpcG1rVTNRZVFjQThrMDI4dzBobHQ1QVYvbFc2azBqamxHN0k3cTF0bmlScmg4TzY4blBGVUhzVGJFeUxLQ0I2VmF1MmxqQ1J5Z2ZNZVBhbXkyM2xrcXBPMGl0RkptY29rWG1NWWx4d1Ixb0Z5NGtBY25IUWs5cWE0SStWRzRwRU9UZzg0cTFxUlpseDdHMXp2RW9Lc09ENlZTalJ2dEpnUUZuemdLT00xYzAyZVNTNUZzN0lFa0JWZHd6Z25wVlIydXJHN05yUEdWa2liQnlPUWFwTFF6YjFITVpsbTJ5bzZzRHlwOUt0d2FuTGJRdEJHUWlTZmZYYjFxdE5kU1RTZWJNU3pFWXBzc2lyaHRvSkI2WW91eVdsWXVDeEY0TjBSK2ZxRzU0eFcxci9BSVM4YStIdEowclhmRXVuWGNWcHFkbVpOTXVwMnlKWXdkcEFKSjdnOFZpRFVUYkxGTlp1RUdWeUR6anZXM3JueEg4UWVJL0J0bjREMVRVSkpMS3h1V3ViT0orZktkd0F5ZzU0QndPT2dwNm1EM0lMQ1RTcnVJcmNSTjVwR0E0ZmlucHA5dkJHNW53Q3lsa3ozck4wNkNVdGhqZ0RyejByUnNMdTMxU1NUVGJvN2ZzOFJOdTYvd0FSejBQclZJQ3ZKSGFRUUNhUDVaQWM5ZXREUmk0SUw1M01Na0h0VmU2V1JCbG54anB6MHFhejFlR0FJTHEwT0Y0MzRxcm1NNGRqSTEzUkpKMWx1blRCVWZMV0pwR3BYdWkzNlh0bkt5U0ljZ3FjVjZURnAwZXZiVXNXVWx4alljY2YvWHJsUEZuZ2kvMHFTUW0zUEhJT08xYXhhY2VXUmg3MFpYUjdCOEpQanBZYTVieDZQckU0aXVGR0F4L2pPQUs5YjhQYWhDU2J5UDVwRGphdmNEL0N2aUcydUx1eHVSTkE3TEloeUNEam12WC9BSVVmSHU1dDQ0dEYxcTRLa1lDekhIdDYxNEdQeXB4OStpZWpReFNhdEkrZzdYZFlTelhrT2poVXVwQThyQTUybjEvV3RXTzlrdkxVMmtUaFl0dTFRZzY4Znk5cTRldytJVTgxdDVtbnpDUVNFQTU1Qjk2dlcrb2F2cE1pQ1NRUEhJUmprZmU0cndYR29uYVIyS1NleDMyaWFWcjJuMlkxMjB1bWlqdGhrU0J5djFZSHFLNi9TZml6NDhlNE1YaVRXeHE5b1U0R3BZdUUyaFFOb2JxcDI4ZW1DYThZMXZWTmVpdllrdk5Sa210VHlMUkpjQWRPTWR4WE5hdDRxOFJhQnFjVmxvZG5kMmxqUEtoZFdrWjFMZDhleHpYb1lhakRkUzFPYXBLVGRySDFicC94eCtGdWdhUmNycWZnSzE4NmRzeVQrV0pOZ3h5Qno5M0p4dC9VVnFOOFRQMmQvSDZXOHQ5R3l5c2diWStuNENzdkcwQmNaWEI2R3ZuRzU4VVJXMmh2QmZXNnZiK1hodzVJL1A4QUhwOWF4UGhqNDQwL1ZyNmExMDB0Rk5FMzd4SkRqQzU0SVByeDJycWJxdU43bURVVTdIMkQ0TnYvQUlmU2VLN2ZUdE8wVm1oZTVBY3lPVlY0aVZKd282ZHY2OXE3VDlxYXhqK0IxenFQaGZ3Ym8wQnM3MjNqdXJlYnlSdVdPVkR1eGs4NEdSZy9qWHpacGZqTHhGcDJtQ1hTSUlES0cyTktRTnk1NmtITmV3ZUo5WDF6NHdmQnpTcnZWZFlFMnJ3YVhQWkVzUnlGTytQR09nd2U0NTU5YXpvMVpTbFl1VUlLTjJmT1hoanhEb0hpbDJUVU5EYUN6Z21LdkdpL05NKzRnNTQ2SFBUcHgyTmVqNkw0VWJ4UjVlc3J0c2ROMFNDTjd4VklFZ2hMWUlUam5qOGVNVjhtYWZyL0FNUlBndjR6dWJIeGRvOTJzSDJoeXMvbG55OEZnUVZJempqQnIwUlAyb1BEOE9qU1BQcTBMQ2NZWkZmR1FlNUhXbGlLR0lsVlhWR2xPZEZRMFBRdmlQNGZzRjhZU1dmaDN4ci9BTVN0NS84QVJwWnZsY1FqQitZZWd5Y2Zqa1ZhRXVuK0pJbjhLZUc3dy9aYkdBRzZ2RWNCcFhZOVNjNEl6am45SytXL0hIeDcxSzVua2owbFoyaVpnWW5iS3J0QjdBWS8rdlhvL3dBRVBpQnJOcjRMUGkyL3NQT251cFcycXBBSTRJRGRNdDNQUFRGYit3bFNncHpKVTFOMlIxMzdQTWV1YUZyR3N6bTczNzc4d3NjaGk0eU4zWHRnWi9Pdld2MnIvaG1QaUg4TVBDdW9JL2wzTnhvRndMWHArOG1obExZRzNMSEtuUFAwcnh2dzM0aGw4SlJ4NmZxRUR4WGNxdGVTeG1JNUc3UFVkaUJ6WDFYOE5OR0g3UnY3TWNzZmdjcGRhLzRRdjN2b28wWXE3MjVYNTFBQStZOGc0ejYxeHF2eTR0U2V4cEpYcDJQbHo5a1Q0cENXOWsrRVhqZnhQYzZWYm1YOXlGd1ZqT1JsU2g2bjAvSEZkOTR6K0duaTc0QWE2Zkd2d3AxK3oxT3h2blEzMXVGVXI5N2NwZGNrQWpjTUVZSUpQU3ZQZjJxUGdVdGhwa2Z4TDhBUjNGdGZDUStmQ2tMeEVIcU01enlXM0hkbnBpdkdQQ1g3VXZqN3d2ZEpwWGpHNnVaWUZjQXJOdXlCa2M4bnJYYlV3MHF0NVUzZFBvWVFxeHR5eVAxRitDL2g3VHYydXZoM2ErSGZFUGplMzhOK01iSzNWdEt1SlJ0dDc4WVVDMm1LamNoTFkydnpqSFBGZVMrUFBoQ3VxK0o1L0IzaXVkYlc0c3BpazhObXlsMVpaQ3BPNXNncWM1eU8zTmVGZUVQMnQ5RTBZUWFoYitLWTdlSm9VWXh3dVF4Mm5zQnp1NjEzV2tmdFVhYjR2dnRZK0k1dFpJcmdXYVc5cmNTUkZUaU5UODNMZnhZQXo3MXhZWllpblZjWkxRdkVRcGNsMHluOFBkVitIMTM0bTF2d25GNDBPaU5vVjZiYTFhN1h6MXVGVnNGd3kvZE9RQjc1OTY3N1NMUHdJelNYTno4WExhWVBJNVF3V2JuSkhUR2VuNFY4cmVDL0NmaUhYNTI4VGkvWkd2WjVKWjBKeUczUHlmY2ZyWHBENmRaK0VkRmdsMVZtZFpaRWpMUWdaM1k5UHB4WFJpbmQ2TXhwU3QwUFZXbStCK2dYQS90WFhOUjFDSjIzQ0tKU2k4a2ZqMlBQV3JOeHJQd2ZqbFJ2RG5nVzBqSUlZVFhLbDNPRHdmbVBvYTh2c05SMDI0dWhiUER0TWJEQWtBQXp4L0xQNDFGcjE3ckE4U3dwcDlrV3RKYmNGcHdNQldCOStncno3eWxvMmRpbFpiSG8vakR4UkpxbW1KYVdGMTluVldHMFJEYUNPbU9PMWN4cHMycjJkeElOWEttTVJraFNNZ25Bd2NIanZXVGJ6M1oyeXZlcXl4c01BbkJ4Vm5YZFRubHRFdkVVbEk1ZVF2QUlKNHJHY2xGMk5JeGxKWExGeHJWMlZScm1NU3g3ZmxHTVlBSXg5ZUtUVVA3U3Q5QWl2cks3V09PNm5BRXE4c0J6eHdQMHJOTjM1YWlZZ2tGUU51ZmIvR29McnhiWWVDck80OFErTGRUaWdzaUQ5bmdiT2ZmQUo2K21CVUpTcU8wVWFLSGRuUVdwbmxDK2ZNd2lBQWthVGpJSFU1OUs1angvOGFOQWZTcm53M29HcUpCcHRzQ3Q5Y3hPRmU0WVovZEpqcDdtdkZmaVArMUpyM2pqVmo0YzhJV3JXZGhJNVE3QWQ4MlI3ZEJ4MXJucmE2OFBlR0hsbDhTM1VsM2VaWXg2Zkdjb2g0eHVQYzE3T0J5bWNuejFUbXhHTmpUWExUM043WHZFYytzc3QzckxyWmFSQ2YzTmhFTUdZRHUzcUNEV0w0bCtJZDk0cEthWEd2bFdrRWV5MmhYNVZqWDJ4MC8rdlhMWCt2VDYzZHRMY1hoSURmdTQ5MkFxK21LamsxTlkrWWh0Y2NiOGRLK2lTVVk4cVBNVVhOM1pOYjZocDJsK1l0N1ppU1FOakRESStsTHAvakY0TlJOenAxMUpwMHFIZEJjd1RNcklSamFRUjA1QXJJdXZOWldhV1RkdTV5ZldxVU54REFHdVpFRDdIQUswR3Jqb2UzYS9xZmlYNGcyV2phaHEvd0FVSm0xQzF0STR2SW5ZbFdYY2RwSkdONTZjODhIbkZVdkczZ0RUdEowNkx4SzhVbStTTHpKN1diS2laQVFDNkhPVDgyZndGZVE2aDRsdnpQRzluY3lKR0ZHRkRuSXg3OXVncnVQRGZ4dDhTWFZscFduK0wzYThzZE1aaEdNQVNHSnVHVGNldkJPUHBTYmFGR25aM01PODFLM1NUTWRzOFNNd0lqMzd1UFkwV2ZpUHdyQnFsdXV0NmJjWGtFVW9NeVJOdE9BZVJUdkZ1bjZmRnJwdnZETjBsMXBrdzMycmsvTkNwUEVVdm82NTk4OGMxZzNiNzVta0FHN1BYYmpJb1VrYU5Obm9QeE84ZWVCZkhGN0RINFEwU0xSck9HRUtWbWJmSTVIZk5lZDMwbW5XODdSMm1aZ01qY1JnVlhPSVdNejV4bm5GTXV4WnlGWkxFdHlQbURkalRjdEJKTzVCTEZKTkw1c2E3ZWUxVFNSU1J3aVIwejY5cWRaRFpKNWpIUHB4Vm56RUxrbkdEMEJyTjFDMUZsRjNMUmJWUWdqMXFJU3VzWjhzOHNPYW0xQkdEbUtNRVpIR08xWE5EMGV3dnJPNXV0VDFpRzBlMUVhd1d4Um1lOEpQTzNIQXgzejYwNHl1aVdtUjZmQUVoV1JoZ2U5WFd0SVBKTTI3Z0RJRktJSVlqc3QrVVdwYnExaWhtQ3g4Z3BrZ2V0WVRhNWplbkZvMVBCUGlIVDlIMHpWTEhVclo1VXZvUjVKSDhMOWpXVzA2VGdpTUZXVWRUU3gyNGpoVXIzSENnY2cxVWlrWG1WV0hEWUF6VXhWM2MwYnNYYldWNUpJVWtPUTBnVTVxOTR3aGl0dFRUUklYejVRQkpIcVJtczZ6THl5a04xVnNyaXBMcGhQUDUxeTVMRWdsaWVhcVRzTlJsSTZiVE5PU0xSSXRTSmo4by9LQ3JEY0RqMDlLclNZMlNicDBqRWgyb3o5TW51Zndwa2FtSzFVcG5CSFkwenhGZjJ6NmZiUk1vWWhzOEQvT2E0bGVWVTdha2xDaFk1MnowNjd0dkZUV1VFd2xFVWhJZGVqRHJtdTJVaS9oaWVJSGJ1QWNuMXJsdEp1UCtLdlM1WmZsQlVNQjZWMXQ1OW1lNGx0b0hFU21SUXNoNFZja2NuMnFzU201SkdXRGtvVTJ6RDhTVENUWFdpamsrUkVHNER0VUdrUkc5djF0NGx5V09GUHJVZmlLMi9zenhWYzZmSHFNVjNIYnkrVXR6Ym41SlFCOTRWYjhMamRxWDJpSDVNSGhqVGxEbHBpaE55cTZHbXRoTlkzSldkVnlwNkNvcmk1ODJaME1ZUWptdEc1aWs4emM4bTltNytwcksxQ080dG1lV1dJcnVIQUlyR0dwMjFIN3R4OXl3UzJXVkR4M0hyV2RFaHVMbDkwZVNPbUIwcXlrRTF4WnRMNXBBQTRIcFZUUjdtR1ZtaVdaaXluRGU5ZEZHTHVjZGVXeGNXQzVOZ2dkR1VaSUFGWE5FdHhCYk41b0NNeDQ5NjA0cHJTV3pTQWdaeDFJcWFNMnRtTTNOaXNzYkQ1WGJxdlNuS05pSTFFZWQ2akxORnBsN3B4YkxRT01rbnNhb2VHWkQ5dGphUThrNEZYN3lHZjdIcXVvU0RJWndNL25XWjRhWVRYY2NJUE8vclcxRmZ1M1k1NjhuekhxT3EzMmgrSWRRdElyMTFpWTJJOHh6NnFPUDVWd1BqS0tMeVFzRW9ZSzNHTy9XdTEwZnd6Ylh0OURhNmlNQ1hTWEtFbm8yMGtWNTFxY2tobEN1eE8xeUNTZlRpdFl1N09XUFlxTkJib1kvTWtHV3htckdyNmRiMmx4RTBlTU9vNlZVVzJsdkkyS0tXS25BQXptb25sZWRrU1J6dVhnQW5wV2tyMkRTNWVzb3grOHh5QjZqcFdwcCs1YmJNaWZLR3dCV1RISUpGOHBUZ25Beld2ZGxyR3g4cFdHU0FUaXVhcFk2cU9oRmVSbVJTemc4OU1pb1BNOHEyS1NFREMrbFc3KzRlZTJoa1dNY3FOMkJWYTlUemJZa0pnN2VsWlJPcHJRaEVvL3NtSnQyT1QxNjFGTXhKVXV3SDRVa0xySFp4QTR3RHpuNjFia2VGNGdldU9neFZPeUhEM2hwWkh0V0Q4Y2NacXRwMXNyVDg1Qnh4VnU0S3ZhaGowN0EwelMxWnJrT2h3Q2VmcFdhZWpPdHE3UlBacmNXMHdtTG5JNDNacWE0S3pscEZPVDNxMHNFVEswY1dDQVRtczZPUlV1TG1BZzhENWNDb1dzcmwxRWxFaWF6TTBVcmc4QmNxUjJxUzIwVjU5TU53WFg1UDhBYTZWUHA4aXcyc3F5T3BMRGdaL2xWdndkb1V2aXE0bDAyRzdpaGRFTER6bndNZmo5SzE2SE5zekYxV3paNDQ1RkJMS21EbW9ZNVZ1SXRqSGtEQnJvL0VXbWFkb21rQ3diVlk1N3RaVDhzWnpnZld1YmFNd3A1MmNacHJZeWxKWHNNK3pCVU84VldhTmtrTG9lbktpcjlzaGNiaWVENjFGZVFJakZ4MTc0cWxKcGxTam9WQys5UUF4VTllRDkydC94UlpwZWFEcHZpaElSdm1Rd1hHUDc2OUNmY2l1ZW1SUU5xSHIxRmRIcGs0MWJ3VGNhR1hDdkZLczhPZlVBQTFyZlE1SEgzam5nK1JncVNRUnVHS2U4VGlQZWlrc0JtUXF2M0J4d2FYTVN2NVMvZTY1L0t2VHZoZDRqK0dlbWZCcnhKcG12MjhiYTNPU2JmekU1STdBSHRSelcxRTFjOHRndDRaNUNKN2p5Um5oc2RLRWQ0SlRFR0RxdklZY1o5NmFkemJReWtMbW5BL094eHdVd0JWWFJqeTZsMnh1Q2ppUm5PRDk2cmhhemprODZ5dWdHWHFxbmtqMHFwaUdMVGdzY2VYWWZNYXoyTXRxNW10MU9mb2FJdTQ1UjBOaldJVlNLTzd6bEpoOGpBOUQ2VnZhWDRYOEczSHc4dU5hdWI1LzdSV1FlU2dmZ2ZoNlZ5MW5xVFR3ZjJiZEFsRDh3ei9DZTlXN0M4amhVMlUzM1NjQnM4VlZ6TlB1WDlFWm9GUm9wU2hVakJCNjEwYXhYZXJTcmF6SWpTT280YzhuNlZ6VmpHcVhHQSs1Y1p3SzFabm1tczQ3cDJJZUxnYlRnZ1UwN2tTcHFUME1yeFY4UFVqa2NXc0lESVR2SDkydU91dEh1YlNRaFFRVU9NanNhOWE4UGFsYnpPRHE5OUhDajhOUE1NMUQ0bzhOYVRjWGtkMXByZVpCSmtHVVJGWTI5ZHJIR2YvclZwR1ZscVl1RGl6ejd3NThRUEZQaG00VXgzRFNSSVIrN1lucFhxZmhyOW9heTF0b1lOVXVCRElNZmZPQURYTWVOdmhQSDRmbmlsMGZWYmJVTFdTSldhVzJiZHN6Mk5jL2VmRFc5dUxYN1pwWUVxZ1pZcWE1YTJId21JM1ZtYlU2czRIMExiK045TnZaWTdwQ0pUMExxZUFQejRyV3V2R0dqeld2a3BHa3lucHgwUDlLK1ViQi9GUGg2K0gyTyt1WVNqWVlLeHd1ZmJwWFVRZU1QaURZd0kwbUowbU82TmluSjVyenA1VkNNcnhrZEN4VjFxajZGa3NmRHVyNlY1MnNTM2R3UU1SNmZhTUVEZFB2TjZmclV2aDN3UjRkOEx3VCtJTklzekRmU3dzcXdyTnZDZzg3UjBQT2V0ZUc2TDhhOVMwM1ZvZEwxdU40cERJb2tBYk9QL3IxN1hwMnVRdlpRM2tNb0JaUUJrOWU5WVY2ZFREcEo3TW1NbzFXZFQ0QzhXUzNkckZEcWxuTEkvbVlBUWVoR0JqdjlhOXc4Qld1cjNPalhWcExxME5xRWlFcVF5dUF6RmhnSHAweDErdGZPZWc2dmRhTmN2RkZMMWZmdlVZNXp4WHBYZ0R4dGNEZnFkM0dzeGpUQjgwOE9PcEE5RDJIcFhOR1NwMU9ZSlFjNDJQU1pmaDdMNVY3cVdvV1NYMXU4VG43UEpHdTFPcTV3dzVCT09SMi9UeHo0amZzelQySGhPNzhjMmVpYVBiN1pYblIwMDRzcUlHd1NEajV1ZG9HTzJlbUsra1BBUGlyNGZlTDlDdG9QQ0d0aTZ2eXFXOCtpNmtRTGlOOXJaMk1TQVZHZU8vVUd2U0w2TFJOWTBkZkNuaTZ5RnBKQmFnSllUcHNqbFlFaGp3T00vVTV6WHQwYXNLaVBPcVFxVXo4cGZpbjhQdFh2UERrUGkrRy9qdnJmYTBUZVRHcS9ad01MZ2pqR1d6eGpPSzcvQU9DdmlQUjdQUjdLTnBZekZhUktNRmR5aHdlUmo4YSt1dmlIK3l4OExiSk5WOEcyWGhsYm5VYnVGcnB4R1pOc1NzRzc0UEdEa0VZUHFCWHc3OFNmQXVwL3MyZU54UExZU3k2V1pjTkM0YkkvMmxKNjRJNisxTEYwblhwV1JyZzY4WXoxUFJ0SThVVGVJUGlxL2lDK2gvMGQ0V2dPODRBaVVCUVNUMjU3ZTlkMSt6TjhiZGUvWm4rSmR2NDI4T1hXL1NaYmg0TlFoTGIwZE4vSXczSDNSMzlNVjVmNEh1N0h4TFlQcUlZYmJxTnpHbzRPQ000L1UvbFhvR3JlRWZEOEh3KzhteWNEekxVU0g1L3Z2a2QrbVJ0L1d2QnEyWHVQYzlhS2QrYm9mUkg3VHZqVDRNNno4TExqeEI4TWZzZDFCcmN2bnlaay9lUXl2d1kyQXlyS0ZKT0JqcUsrUS9DL3dWOGFlSnZGMW0ybTZOQkphZmFYTXEzdHFqS1kxVTVHSEFCSVhHM25xYTlML1owL1o4MVRWOVlqMXkrdTVXMDdkNW4yZFdKQjZIR1BwbXZvanc3NEs4RHRxamFIckx4TFkyc3haQUcyRjN6Z29OM1lBampJcjBNSXBVNDNiUEp4MklqS2ZMQkh6ajRBK0I2M2dnWmRHU2E1a2thV1FmWkYzaU1NKzRaeHR3TzFjeDhjOU10ZEJsZnczWWFYSmEzQ3MwSkw0R1J4Z0RBNUdNYys1RmUxZUxQR0dyZUJOVjFQUk5BZEd0NDU1RXM3bG9nMjFTUmpHTTU0N0gzcndmeGhxK3NlSlBGeTZ0cVViU1J4dmxwSnBDNVlnNC9XcXJZbExSR2VGbzFKTzdPZzhQYUJONGQ4TzJVUVQvVlJydUI5YW0xTFVaYjBKQkZGdjh1UVBoaHhrZTMrZWxQMDN4RzE3YjRaUnNVRHFPZjg1cDhsdlpHNERYTTRYZU1qNWdBdVR6WGpWSnlsSTlhRUlvcTZqcjBCS3pYZHNkMjdJVUhsaDc4VlBMNG8wdTB0c1BkcUc4ckpETmdqSDBySjhWYVZQcHVpTnJpc1psODByYWdBWmZBcndieHQ4V3ZHMmozOGlmOEFDUFJ4YjhpSTNJTEhudFhSaDhKUEViR3M2MElMVTlydHRjT29HU2ZUNTl5RnZ2cjFHTzFXWnZpZjRmOEFDdW5NZkV1c3c4SndoY0UvZ09wcjV4MDdYZmliNHl0SnpGNGplM1ZQK1hXRDkwRzdjWS9EODYxUENXbCtFZEV2WWRSK0lHcFBjbEdCYUhjV0pHZWMxM3d5aU4vZVp6L1grWDRVZGo0bS9hZnViaS9hMThHYVVJMU9VaXU3cE9mYkNpdU0xWFIvSG5qTFVHMTN4enJja0VMU0VpYThiSHk4RDVFL0d0UHh0OFZQQXY4QWFnMUx3VDRjaTNSSnNWM2lBQXdlT0s4LzhSK045ZjhBRTg0dk5UdjVKQ3VBcUZqaGNlbGVwaDhKUm9yM1VjdFRFVmFyM09odVBFWGd2dzVxVnpiK0dMT1NTOEEyL2Jad001LzJSV1RkYW0xMWF5RytpQmtacytaM1A0MW5SUUxxQUYrd3hNQmsrL1NrbHYxS0ZIWEpBeHhYWWlJVTA5UkRNbTRTaVRhMk9tYWZiV1Y1ZHU4eG5RQWNsU2Vhb1JRdjVobGtiQ2cvTFYyR1NGU1p0K01kUm50VW05a0xjVzczY0pUY1F2OEFlUGFqU2RLdGRYdG85QWdrSDJtVzZVYnkyQjh4QUEvTWlvTlMxZ3ZiZVJhcmhTT2VNRTFUMDAzQm1Fa014alpIREJpMkRrRVl4U2VxSmFQWXZqMSt4RjhTZjJiZkJQaC94bjhRTlEwNlVhOUtWdHJPemwzU0tBb0pZKzNOZVZ3eG02WnpEYXYrN1hQVEFVRG9jNDcxMG5pWDQ0ZkVueDNlMkE4ZmVLTHJWSTlNZ0VOa2x3MlJFZzdLT2xaR3JlSjU5VHZ2dEVoVlZLZ0ZJMTI1QStsWWN6anVhMDRObEtLV2I3U1pGdURFWEpHY25hUm5uUHY3MUZxdW1haFpKRmV6V3p3Mjl5clBhdGo1WlVCd2NmUTFvM2VuMmxyWnJlcnFFVE5JUVVpUThqai9BQnF1ZFZ2cjZ6aDBTOWtQa3dPeHRWa1BFUlk4Z2ZXcFV6YjJKRGIyRmhmMlg3b2xaVlhPeHY0cXo1WUJGaFNNRWNFR3RlT3d1TE83S3k4RlJrWVBGWlUwanZjUytlTjNKMmtVNHl1TjBrdFNheVdOWUczOTI5S2pNRHlTbnlobm50MnA5cW9hem1CT1RnWUlGV3JmZllhUWJwVUJkM3huMEZFaEpGZHR0dXBFaEJjakFZOXFmYTJlUXFzdVdWY0E1NFdvcmUzKzBIZEl4R1R3YXZKdXQ4RThnRHZVY3pSVmthVjNhV1dtNllrUlVlYzR6bjhQNVZsUzNpR1ZUSEp1K1Vic2MxZmttajFhRlJjc1ZDY0NvVnRiU0krVkRGMDZ5SDhLaTZ1VkdEZXhxZUhiSzVzdFV0TlJZS3lPK0d5TWpEREZVZFgwalQ3Rzl2ckxlVmtSeVlnVHoxcjB2OW4zd3I0TitJN1graGVJL0h0bm9sM1lXelM2ZTE2QjVjK1A0YzlqeCt0ZWNlTjRyaVB4TmQ2aWlSR05wU202SjhoaURnbjhldFhGNm1GU01sTXFhS20yVVFzMlhjNEZhOHZoNWJhYmZLcEtnQW5OVVBDZW1UWDJyUmxRY0FndDdjMTAvak9hMXNvbEZwY2hqdDJ1QWM0cm1xMVg3VGxSNmRHbWxTNW1aRDNPMWg1WTNJcVlkYVBzZWlheFppM21uZUtkQVdRdDArbFIyTzZTeGt1UW5UdFFZcEJwNzNZY2IxSHk3Y2NWcEN5ZHpDdHpTZ1pkaVZ0N2t6UDJmQkk5alhUNmZxSnY3U2UwQXlIUWpjdzZWaWFkb054UGFpOHNwVm1UQk1rWlBLbXJIaE85U0svbWprZkJ3Y2NmWGluVjk3VWloSzBiR2ZwaXUrNk40MEcwa0FrZEsydkMxdEo1emdnWnoyckl0dDBMVFRkQVhQR0sxUEQxMnFUSzZ6QVpQWS9qVVZIZUJyU2lsTTJMbmMweDVPNlAzck0xeS9tWjFXVDUvUVZkOFFYa21tSzF5VXdIWFBQRmNwTjRpanVwVlFuQXozcFVZWGpjMXJWRkYyTnhNUVdSR1RsbHlCMnFuNEtzSjVudkw1SU9qZktXWGlyRjlLNzZHMDhJNkprRHVPdEo0ZDhRNnRwMmd4MmNlZ0ZrWmlUTUI5NnVtam8yY0dMazlDOExtVzIxaUZIWGdzQnRIU3ZSZEw4QXhlSVBDZHplS3dEd3VkdWUxZVR6YXJNMThsMU5FVUljRURIU3ZkL0RXbTZycm53NWlmd0ZQYVg4a3Ficm1PSzhRU3h0amxTckhQZWl2Q1VsN3BHSG5CVDk4K2N0T3Z6YzZIcmNFN2JzS3JLRDJPVFdkNExSVHEwSngvSDA2VkpwTVpPbTZ5QWZ2S29CL0Vtb3ZDQk1kNGpkRHVPRDM0cTZhU3VncWF4VFBaZkdPa2FkYWVIclh4TGErSUloTUxHRkk3YU1mTWh3UVFjZXRlTmFsYnNZbW1lUVo4MDhEdm12VUpOSGkxYndaZXlDVDkvRklXakxIUFRCeDdkSzh4dVZtbGhjeXhuQ25yamdHblMzMU9aK1E3d2cxOXA5dzJ2UTJ3bGl0QVdsK1hJVEl4azFqdE1icThhVTlaSkdZbnR5YXY4QWgveGZjK0g1cnExRVllQytoTVU2a2RRZWhIdldhb2EyazJyeGs4RTgvU3RtWlI1cms4Q3lyZUtHSktnODRyWDFHZEZzTTRKR09NQ3ExcXFMcGhNa1RieVNRVFY2RWliUVdrVUFsUWM4VnlTZXAzVWg5dE5hemFkYnJFeExnZk1wSFNtWEsvTnQzQWNjZzAvUzdjU1dIbWhjWTVPYWkxQUZRWmxJS3NvMlk3VmpmM2p1ZndsT2FGcEpGakNxZ1hrNDcwZVlTNU80RFp4aW14ekdWOXNnd2UxRU1Ram53NTQzZGF1V29xZnhGdTRXTTZhQ3EvTWVjWTVxSFFGRHlzMHI0SzlNMWFVckp1Q25Dam9EVmVCUmEzK3duRzRaQXJOUDNXanFrclNUTlRkSkEzbWdqeStsWmtreFc3bFlkSkFhMFpIU0NFdjFadWdyTHZQa3ZGbFRrRlNNVm5TM0xyZkNOc0M4OG5rVEE1SFErbFB0MVMydm1UY2Mvd0I0TmlyUGh5QTNWK0VBSEk2NDZWSGNXOFkxZG9VbHdFZkpHYTI1dFRuY1cxb1ZicmFKU2tzZVBUMXhVMTlZcEZhSzVZZk1NaXBOV3R4Sk04cXI5MVJ4M3FsZlhzc3NLUXZ5QXVBS3BPNWhVZ2t5dkZjUEVBdThsVlBhdEszanQ1N1JyZzR6NkdzMUdGdWhTVlNQdzVxeGFTRVEvSkpsVDJxcEkwaE5KV1pGSGJqN1NTVjQ3QTFkbWllMnRrdUxJRUt5N1g5cWdBaWxZUXl1VnllbzYxSS8yaUdRUmVhVEh0NEZKUFRVaHc1akxsaU1VeEN0bkREa1ZvTmNXYzhTUEpHVWZvY0RyLzhBWHBzMW41RUpmeThndndLWmVXRXNjSXVsR1ZPTWNkS3JtVWpKUWRQY2p1N2Rrd1E2bFQ2VVcwS3VTU3BPT24xb0VVa2FLODBnd2VnejByUzB1NXNOT3VWdW8wV1hhaEJSdW1UUTNaRXg1Wk1wSmNGVGlSTUxrVmFtdFlraVZva0JCeDBwYjE5T3Y3TW9ZeWx3WHlvVEcwRDBxdEJkeXdLSUp4a0R2Vko2RXlWbVNtMnQzWHpIaXhJT2hVZGFiOW04MEJnUVNPbFNUVFF2RnNpQnlmYW90dDFicHZDNDRweGs3a1NnbVg5Rmx3OGticGlWVnpHQU90TkdvVFNzMFUwakljbmp0VHZEMTdISGNtNnV5UVY2Y1VsODlyUGVpNHMyenViNWg2VnFtWlhjWG9TeHRNbGtWV1ZaTng1enp0K2xhY25pWFdKL0QwSGhlNHY1WmJTM2tNa051Y1lSajF3ZXVPdFljakxIZHRHakVZNlk5YW0wN1VCYlhHTG1INUdQM2gxcXVZaHBGcTF1TGkzTHcyanQ4M0pBT0IrTmEzaFh4cmEyMThOSThWMkttMWR3djJtRmRyeDlzbjFxbFBOWllFdGtkcGJrc0RTUjJjV3FYQzJ0bkVwZGdBV0hRZTVwcU1iYkdjbExvZWgrTmZCM2hyVDdSVFlhUGNUbTRqeWx5UjhyQTlEL0FQV3JpNExlWm1nOE96NGlRWE82QzRiamJuc1NhNno0Yy9HalRmQ2kvd0RDRCtNSXhkMlNOc1VzQWR2NDlmZXBmaWxvL2gyNjBhNTF6d2xlTEphM1VlWTJYbnlwQnpqT2VPdFlTaTcyTllSankzWjRwNDkwT2ZTL0ZMeFhBYmUzelJzelozRHRYdFh3UDFPMjFYdzlCSGRreXVueWdNZlQvd0RWWGhXczZocVYzY3h4WDBwbGVOZ0Zaems4MTZaOEM5Wm1zclR5Skp3QWs1RDRJeUs1c3pwdVdGWGtHRXM2alI3WlBiM05wRVJvakNPVnNiQ1k5dy9HdFZ2RTF6cEhoeUMwbVpSY0NSVE5Jb3h1L3dBNXhWUzJ1YmFXMWh1STdnUVNZd3g5UjYxZnRQRCtsWFMvYXA1RE9TTUVzY2o4cStjVlN5dEk2cHhrcGFGZVB4T2xqclIxUFR0UU1SUTcwZEpmbUVucUNCa0hJSE5ldCtBZjJ2OEF4UkhZdytGUEhyUTYxWmwwVVcxMHhNMGE5TXBJQnVCNjg1eGsxNHRxZmd6VFliazMwRnFkaE9NZ2s1SndPbEdpYVBIbzk2MTdGYXNzcCthTXR6NzlmU3RvMWY1V1JaU1ZtZmZQd2w4YWZEVFd0Zm1YdzdxWU4vZWFleVhHajZxUXR3cFhwc2tHTjNVQWZ4SEdEWGhQN2JId3NzUGpEYmF6cE9oK0Y1cldmVHlmdER5UktxcWM0SEJPVk9keDVOZUczZml2V3JIVW85Umh1WlZ1WUpFV0tTS1VnREhJSWJxRDcxNzc4TnYydHRDMWZ3L3AzaG40dDZXMnBYZHdHdDlRMVcxVEYybHRqQzd1TnN3QXprSGs1NjE2TkxGU1NYTWMwOEtyODBUNHMrRVd0LzhBQ0p5M1BnTFdaVERjUVN1SW5JSTNLVHoxNkVWN0Y4Sy9BczNqUHhIYldIOXYzQ1c5eGVyRWhaV0txQ09SNzVIZXVtL2E3L1pZdDlLOFVhZjhTUEE4RVZ4cCtvNHV0UHVMSWxvN2lMZWVDQmpZNEJKSzU0NUdLMmRGOFQ2RjRKOFBSK0VmRFdqS2sxdmE3cis3a1VaU1VjcVZZZlhxZnBXVlpVL2FjL2MxVlNjcVhJZXk2WnEya2ZDQzlYd2dKbzcxWWJYZGNHTWdGQ3VBQXhIM2NGY25yd1RYai9qanhQckYzNHR1N2wvRXIydHNaMzhxS3o1M1pJSUovdmM5OG5HT3RjZHJmeEtEeHlEVFhrTXozQmFkMmZra25ubnJqUGF1VDFHYlViblVrMUNLOGtEbHNEYy9Ubk9mZXNaVnB5MFdpSWpoNmNIZDZzOUgxcldKTmM4UC93Qm1UZUtMa0lDRHVaQUdrUFhKUDlmU3VMdnRKaVNQYmFUbVVnY3NUMS9HaDdTOVc3UzJUVWdSSWhKRWpIcU04NC9sVXVpK0hOY0x5M04zSVZUbnEzVSt1QjJ4WE0zcmRzNlY1SXhMSnJtMjFEN1ErbytWQ2hCSzQ0Ni9yLzhBV3JwN08ydXRZaUV5Rm5CQWVMQjk2aE9rYWJweEZuZnVzM21qSjJudG4rbGRmNENzYkMxVkNzWDdocEVCM0h0dVdzS3RWSmFIVFNwT1FueGY4SWFyWjZaNGQ4STZBc2JYZ3REY0NPVWtLNTZjL2thNG54OTRFMG01OEp5eGVQdE50YkxVWUl4S2xuRk9HZWI1UWR5Z0FuMHlNOTY2NzR6K0piL3hSKzFUYStGL0R0NGkyMWpaMjhMc2pqRzFWM3ZqOGVQenJ6djlwZnhEYmFCNDNzdFR0Z0ROQzN6b3dJM0tHeUZJL0xJcjM4c2kvcXliUFB4VUxWYk1sK0hscDhOL0NIaEllSU5TMENBelBJVWhSZ0d3dWNaeDc0Njl2d3J3bnhZMW5jYTdmbUtBS3NrN3NpRHNwUFRQcFdwNHcrS1UzaUNZejIwelFKdUFTR1BoVUdNSEg2MXltdTZoZDI4Y0pWZ0pXWEprSTlPM3ZYcXdnOTJZTlJiMEtjV2tGcnRsaHVrQU9kd2RzREZWYmhyYUtWb1ZHQ0c2OWpWeVNTZlU3YU8zbEVZSTVQbHBnL2pWWnJXTzBuRWN1R1hyZzFwcWhjckwwSzI2YVdKSTJ4SVRuR09hb3hMNWF5ejdONmorSWRxbHQ1ek5tRzNoWm1Cd3FCZWFZRm5paGxWOHhLZUpBM1VHb2M3R3NGWXBTM214Zk14eG5wbW1ST3MwM21aSTlSVXR4cFYxQUZ1WkhUeThaR0d6eFRMT01TemZ1ZS9UMzk2eWxVME5ZUWNtRjlHa2FiK0FEMkhXcTBKYnpCSU4zdFYrK3R5aTduZkJIYW1XaUlDQ3FaejE0cVZQM1RaVWJ5c1BqdDVISG5TdUVHT0QzcUc2ZVNKOGdCaDY3YTJmc09JMG1kdmxJNmVsWlZ4RVpiNHh3Z2tBL3dBUTcxaXA4MjUxU29lempZaWdqZWVVbEFWQTV6M0ZXamFTVE1wT1dZNCtVZHZ5cTFhMlBrcVh5QUR5UUtjMTB0cFA1a1lBWmVqQVZQTU5VbkZhbDgzMGNPbHBvV294cWt1TXczT2VWNmNIMXpYTU9rd3VoYjRBa0p3UWU1cVMrMUM0dkxoZ1hMTVRqai9QRlhSYnhXOXRGY3pqRTZEajNyUlhpWjIxSEd6bHQ0ZnNrQ2d1M0w4Q3BiZEZtMDk0WlFRQVJrZWxKRXorWDUwam56RzZlM2VwYlpMdThSN1dlM1ZJMVhjWmw2bXBVeWxCR1pKY1JmYXpEYkg5Mk9CaXA0UkxQTUR1eW82QTFuUUZHdVNBdUF1Y0UxMGZoUmROMVVtenZYOGw4NFdUdG5qOWFwNkdTVGNpTXhxd0NCTnVQYkZPY3h4cnNIT1J3YVc4dGpCZHRhTFBuWXgrWmY0cUlMUWlZM0orNG5yNjFqTm82SVEwSU5QMDJhTVNTcUNNTVNvSjYxRGRTenpEWnlWNzlhMXRRdnJjV2dpdHlSSWZ2Y1ZVL2RSeEFzUWNqOGFkT2JZcWtFYWZobThnMHpUSHZpdnovZHdNWjVxUFVTc3NiVHVwQmM1K2FxdGdXMlBKSGtqSXd0V05jODFiYUZVNUxmZXJHU1h0TG5YZjl3RnZkdmI2SEpHa2VTVDZVbHJjS3RnWTVoamN2emVtS1N5WmpiRzNWTng5TTAyWUkwYkljWXgwSGF0WXM1SjdFRmxQUHA5MEkwbndyREpQdG1wVnRKVW1hNnRBQ3JFNVphb2FpeFF4c2hPM2J3UFdybmg3VUNMcFkyKzdua0d0SnE2dVkwa25LeGF0NEk1TktsTGpuQnpuclZEU0o0N0s4UU0vVTl6V3ZPMFJ1NXJiRzFYSEZjdHFMbUM2Mnh0amEzVVZOTktTc1ZWbHlTMFBWN3NlRU5jMVhSTk8xTysrejJyTUZ2SmgvQXA3MWsvR240RzZmNEt2VTE3d2RxaWFqcDByYmtraEpJeDFIUEkrdnBXSmEyNlhHamg1SDVLZHlSaXFWaDQyMWV6dEg4TzNjN3ZhaC9sVS93QVAwejdWdFQyT1dvcE9TYk5EVEwyQ096RWQxRmxjQU1BTzFYZEoxYTF1N2lTMHRrTWNRWEVhbXNPODF5enQ0MGpDSGMvM2NMU3gvd0JvMmpDNUZzNjVHZUZyU25hSkZXWE0wV2IrWVd0NDBGeEJ3VDF4Mm9UVnJiVDBEV0RNclk1TVpJYjg4MW02aGZYZDBTOHFuR1IyclN0ZkJIaVM1aVNTUFM1dHJvR1ZndkJGVzVLSk1ZOHlzY3pvdWY3QzFTUXIxMjVPT085VnZEckJiaUpReEIzNTNEMHlLMGRJYUJmQStyREEzR1JjSEhXcUhoaGNTSy9HTUVmenJPbHE1R3RYM1lyME96MVBVdFF0dEZUVDRaMlFUQXlNU2VvT2VPS3dyKzVqZzBnMnR2S0pGWWZQdUF5UHBXNTRydkEzZ3ZUbkNmdkZrYVBjTzYrbGN4cWNJaHRBcXRqNWVtYTBTT1dEdWpuTHVCcENaSTErNmVhYUpmTllPemM0QXE0RHNWbFVjdDFxaTBVY2JaRDdpVDB4V3BTM3VieXk3YkFER1FFNU5XZEttUmRKZkhLc0NHV3MrR1pYdFBLUFFMVTFxV1hUQ0l1dlBJcmtuR3pOcWI5NjVxNmFOMmlxWSt4NUZRWEtKSW13S1JnZFFlS2ZvYnFtbU1zckhidXlSNkNvYnAzVldqUS9LZWc5cTUzdWVnN09LTXlGYzNaakJIQlBOVzdhSXEwbTRja0hBYXFFY3JSU0dSemc1eG1yTFNsYk5pMGhKUE9lNHJTU1lvT3pMRGIvQUN3NHpsQjgyTzFRUlQrZE5tWkNYVGhUVXVtaEJwa2o3ODcrMmVsVkxZdmIzWkpYZGs4VktqdWFUbTIwemNsQUdsb1dHV3Fra1VlNFN5ZE52SU5XTFNjdWg4MEJjOUFlbE51cmRvb2pPY0JHNFU1cktPa2pvbTFOYUZiVExuN1BjdUkySzhmTGcweTJNajM1T2VjazVOTWtoTWJpVkRuYzNPS3QyOXVpU0ZoMUZhT3lNWXlldzk1Zk9tYUpnTjJNZmhXWmRySERmSXJqT0QwcTFMRTA5MFhSdHJCc0htcTE3RzF2cUlFdkp5T29xb0t4aFVkNVhHYXRCS1UzelkrYmxkdFU3V1kyeEc5am4wcm9OU1NNNlloaVhKMjU1SFExbGxJcm0zQ21BYjhmZTdWb3BLMWlaVS9ldWhrTXFYVjJwVTg1cXhMZGhiMFFzTnhYMHJPZTBsdEp2T2psNUI2Q2xTNWRyZ1hSSElQTk53VDJKZGZrMFowTU1YbjI1SlRPUnd0UUpxMTdaUXphYVdRd1B5VUtaSTl3YXY2S291Z3NhU0tyT09kM1NxTjdwb1M2bWFWeDBJR1A2VnpVNUpTc3pzcVFjNmFhTXlmeW5ZRVo1OTZWaUxiYVdqNHowcHJTS215UGFDVTY4Vk5jc2x3cU45MzJOZFZsWTRZb1JaUkxOdWpCQytocExvWWJPNzlLYVhRc3BpT01jSHRUWTJWYmc1UEdPYWtMRnV6dXJUQ1FIR2R3d1NPbGI4bW0yNnVwTHF3WWRCWEpPRG56aEdRdWVDSzFyYldJWTdNR0oyOHdZK1dob2x5c2lmV2RPdHJTWXhydVRrQTVIR2VLejd5MEZzbm5SU1lPUmpGZFo0SDhTZUZyM1dMTzE4YzZLWnRPanZWbHUvSmJEc3VBR1hQdlUveGl2ZmhucWZqYWU3K0ZtalRXT2tFS0lJSjN5d0lBQlBKNzAxT3pzVHljNk9iMHJacU1PeTRqeEpqRzZvbXRwNHk5dk9NTU9QclZ1M0VRQU5vVkFIQkFxYWU4dExxV09HWWJRT0N3T0szVWtZdURXNWtKZVBiTUxlWUVLZjRzVmZTNU5xQVlMbDR4TDk1azlLaDFPME1GeDVSVVBFZVZZQ2xrV1RZaFdNZ0FjakJxdVpFUFFvNmhZbVM1ekJ1S0VjRTlhNlQ0ZmVKL3NWOS93aXV0T1JwbDdGNU01LzU1czNBY2ZUaXM2SlJJZWdBUEhOVHBZMm91M1NRcnZXTEMrNVA5YUUwekdhYUszamI0Y2F0b212OEE5anVnV1ZISmhkenhLbWZsUDVmeXJFUzg4VmVGTlRsdUxNUEc1Sk1xTXZIMS9Hdlc3d1hmeEY4R0pxRjNDR3U5Q2pGdk1zSStaNGNmSzdlNE9heVk5RjhOeWFTZFQxMjhuRnhBZGtLRGtTTDZZL3pqTk9WbXJQVkdjSlNpOURBMDc5b3J4QmJXNlcybzJJZFVBQktNUm5GZHY0US9hSDBLNWpqU1c0ZUJzZ0JIWTF5dXYvQlBXOVIwbytJTkswbVF3c0MyU296akhwMnJ6N1ZQQytyYVVuMnFleWRZeWNCeU9NL2xYSlBBNFNzdHJIUXE5U081OWZlSGZpTllhdEZFVGNJOFpJeXE5KzJhTDYvMVd5MU9TTmg1bHU1M1JFakpSVDJGZkpuaFB4NTRrOExYcVBaM2haRVBNY2grVTgxOUNmQzM0MCtIdkdPbExZNnJNa1Y0b3c2T1I4eHgxcnhjWGw5WENQbVdxT21uVmhVUjF5NmhieVdFc0VzR2Q0UGtzM1VHb05DdUxtM1g3V0M3RXNGYmJsU3A5Ui9uRlQyMGxoTEtaRlI1RkhRS3ZCRlIzZHdKYmxXV0VXcTdQa2pYamtkL2ZyWE5UcUtTc1c3bzliOE9mRSsrbDhCTjhOdFJTSnRPUzZXZU9HL2tPMktZWUcrTWo3cEl6a2REWEw2MXExOXJWOU5hV1ZxZ211Wk1aaUl3NVBSUjdjMXlLK0kyc0xNQyt5aUxneUhaeGtWYjhMZUxvOWUxVmpDWkZqaEJJbDZjOXY2Yys5YUxtbEwzdGdsRktPbTUwRC9DYldmQ0dxVzJzK0p0VDA5RWxQeldIbjVreGc5aDBPYXhXMG02ZlZIdVhLUlFCejVhSno4dWMxWW1sRjFyRjNjdHFadVhoUWsrWTJYQSt2c2MwM1NIdTlaYVF4d3lGQ1RuUGVweEZTTDBnak9sUWx2SXVSbXhhRm9WUlpHUUR5c0R2MTVxR1R4bmMybG1ZOVhXTlk0ajk5bTJLbzZkZTladXErSTdMVGRYWHd2b01QMi9WSGJEUko5eVBzZHgrbGNqOFU1YkhRTmVzYmJ4M2NQcWNzcWIyc0xYaUtFY0RMQWNrK3hxY1BncTFhVjVQUTZKVnFkTkV2alg5b2Z3VllYNitYTTE1UEdmbCt6cUFoNTZaUEZjL3dEOE5IZkVieFBjTkI0Y2lodElpUG1SQ1dkajIvbFdENHUrRzBmanZVSXIvd0FPMnl4Q1IwakVDcUJqZDA0N2YvV3IxZWI0UWVBL2dkb01ENjdleFNYeXdLV0xZM0IrNjQ2OWNkZmV2WFdBdzBGdGRtQ3hOWjZyUkdiNFIwS2ZUWkc4ZC9GRHg4MWhOS055UlFIZmNOd0R6NkRqSEZjcjhWUEhIZzN4ZHFlbnd5NnJxRnpaMnFsTHE0bVFDVnNuT1FPaHo2OWNWeFBpWDRqWDJzYTdNODBmbVdyT3dXSW4rSFBibmlzNmF3MDI3WCswYkNlUWhoekJPQ1NEN0VkYTlHalJqVGpvY05XY3BzOVhsK0NId1M4V2VBbjhXZUF2aWswZW9RUmd2cG1wSXFsampPQnoxK2xlVjZzVFlSL1pkUnRXTWlmZExLUm4zR2Fxb3M2S3U2VXFtN2taUDUxMFgvQzQvRUVVRWVoNmxEWjZycHNhQUxiYW5hcStCNks0d3kvVUd0dVpJbWtwUlp5MW5leXdoMGdoTzk4bGlWSS9DbFJmM1hueUVnOVNHN0N1NzBldytESGplM0xXL2lLYnd2ZkUvTEJmL3Y3TjJ4MERqNWs1OWMxa2VNZmc5OFJOTHRwTll0OUVPbzZjRytYVWRHY1R3c0IzSlhKSDQwTm5SZnVVclMvdHZCelE2ellUUXpYRThaS3FBRzhyUGV1Y3ZkWHU5UXVaWko4dkpLeFp1VGdrL3dCTTFIRkEzbUdLVUZXQU84bmdqMUJ6MCtsVDI4VnZDWGhqYjVtNlNrZEI2Q3NaTkcwRmNnZ2h1RUo4eHZrenlNbmlwN1FKQk9XVTdnQndSMnF2SUdTUW9aTnhIVWc5YXRhVmtTa3FvSTdBMWhNNjZNZFJtcGhqRnZZazU2NTZpcldrMlovczVaV0dSdXBUcDgrcjNMMlVES2hVRTRKQXpWdlJyZExlemEwdUgzTUg0QTdWbE9WcVowUVM5dFltV080K1ZVWE9SZ1o2VTJEU0ZzWEwzYnJ1WTV4bnBYVFgybU5kNmRhUjZXRlZRdUdHZWMvV3NEVXJEN0JmRzBtbTNzQm5KcmtwVk9aYUhiV3BxTWsyWit0WEgySzVXRkd3ckQwckkxT015dXFwSTJlK0JXLzlrUzR1ZnRUV3BsQ0VZRGRLVFczdDRMbjdTc0NybVBrRHRYUlRxUlVySTQ2OU9UVGR6UDBheHRMZDFsNVp3T3JWTGVPTG03eUFNQWppazBxT2E5U1NRSnRCUHk4Vm94MmRwWjJ4dWJramNPbWU5VlVuN3hNSTNpUW13U1ZCS3N3empwVXNheTI5bzB1L0FIRERQV3JHaHd4YW01MnBqampJNlUvWG9SWjZKeU1GaWUzWHJXUE0rYXh1b3hVYm81bVlXNUxUb1ZBenhpdFRSYlh6Tk4zeHhIY1RuZFdRTE5wYklYRWJaK2ZCR2VsZFo0ZHQ0NHRHMzNMS0FCMVBhdHFqNVltRk8wNWxFeFBJUWlJZDQ2WjcrOVN3K2JJakdVQkFod0VIOFI5NnNYVmxMYnpKSVdHMlRsQ3BwMFMyOXZCSzB5a2tuYUJqdlhPNW5hcVNSUmpnSnVUOHVSejFyUHVFUkx1YVFTZERnTFcxSWJYVGRIa3ZCbHBYQnhrY2lzWFFiL1N2SXVJYnUxTHpUbjVKVC9EVzFLN1Z6a3hWb3RJMHRIVXJFWEo5OFVYa3NnaVJUenVjbjhLbTArMkVVSUk1NHgrbFFYaEJsOGt0bnkwd0RTVm5NdFNmc2tpZlNVMnp2SVRnQWQ2eUwyNmxndkpJNFpNbzVyY3RveXVtckljSGQxd2VhNTY2Ulo5UzI0SUc3cldrRnFZVlZhSnBUNlJiblQ0YnFPNWN1dkxJUmtWbjZkYzdkVzNLbTBaNHJkaUVadEdneGtxbnJYTzJzYmpWTnlIT0hxMDIwMHpOUjVaSm5RYXJNcjIvbUtlUVB2VnpiV3N0M2Voakp3V3h5YTJMNjZaYk4ya0lISndEV2RiK2JCWlNhZzZrWUkyZ1VVbFpNVmV6ZHphdTVrMCtTT3pqZkh5YzU3VmphYmFYRjFxejNMUkF4STNKTmRsOEx2aDVmZkZEVVNzVGhVakhNakE0enh4K3RXMStEUGlkdFZmUzNaTGFOWkNGa2s0M2pQVUFWbjdhblNiVW5ZdDBLdGFDY0ZjNHJ4TGFwTVVsdDB3VmJqQXhYVWVFL0cvaUtQUlRwODNobjdiRXE0RWhoT1FNWTYxMU9qL0IwNlRmcTdYYTNjNEIyckpEbU5UakFKOVJVZmg3d3Q4U3JmeDlaNlA0cG1rRnBjVGJWMktGamNZNEF3UHB4VGppcWR0ekNXRXJjMnh3K3Z3NjNGS0xodEhqZzgwYmtRblBIWVZ1ZkRueFI0dWtrWXpYY29qaStYeTVBZG9IcGpGZFY0KzhDUVdGcXJTeEZYdzRVNTVHRzZaL0NxODl0clZ6NEl0M3NiVkE5bXhpdUpWUUJtUTQybnJuMDk2YXJScTA3bHJDMUtWVFU4YmlRUWVGcnpMWUR1dkJOVTlDRC9hbzBXVmhub0I2L3dDUlYvVlkzdHRCS2xUbG5HYzFSOFBzZzFhQnZjWjlLM3c3dkJ2ek1jU3Zlc2VrZkVtSFE0ZkFXaFI2VElyT1RtY0E1dzNldUgxd1RMYzdOaHhnRUN1bDF5ejBPYndXOTBzOHEzMEZ5MkVPU3BYMnJsTlV2cEdFVnhOTnVaa0FJQXJkSTg5TGNwWGpSeTJaRHBod2VEanJXVTdIY0FSakI1clV2UkxONWNnVUJEMzZkcXlOMmJnZy93QjZ0RWFRMk5LMzR0OGRzVmQweVNPUzNLVFNiVjNZelZLMFFGeWhZZmRxN2FXNFVCQWNmTjBOYzlYYzZLVzVZdHBEYnpOQnZ5dXpJSHRUekw5cklHTVo0Qk5Rd1JTcnFwY3FRRlFnZ2pwVWlxWUkvTVVaeTM1YzF6Tks1M3cxUm02bkMxdGQrVTN6SGprVkswckxENU1pREJHTTBYaUZyc1BuSlByVWN1RElGSjU5YTA2RXAyWmQwcUpZTFYvTmpKRy9DMUFxQjJaMFVnWjZIclZ1MnpGcDRYSE9TYWdqYUlUdE41b0FIYjFyTytwdExaSW10OC9abWtQYk9LSkw5Wk5MRUxrN2xmSUdLa3Q4M01meWNEdUtnMUdDV1BHeFJqNlZtck9ScEpOUjBHZmJvWTRvNDI2N3ZTcjluTkh6SWVQVVZtL1pGbW5qQ1k5eFY2N1h5RU1Tam9Pb3B5U2JTUm5CdEozTkhUTFRRM2prMUM1U1IySndxZzRBckUxTzNkOVdHeENTQUNxa1ZYdGRWdW9XYTIzbllXNlZldHJxZWU5OHk1SE9NS2ZTcmQ0SWlNUGFTTkcvbGp2dEtVTmJLa2lMZ2dkT2xjK1d6YzdCa2NZeDJ6Vy9kczBkbTIxUjkzNzFaVHZidlpKdGpBbmprNS8yaFNwdHRhbWxXS2cwaXZjVzhZeEV3M2wrTS8zYWh1TkxsMHZpV2VOa0F5R1huTld3ZkxsSms0M0ROVnRXUXRkK2FwK1VweG50VzhPeHhWNHJjdDJlc3h2WlJ3SWdWbGZMWVBXdE5iaExyQm1YdDJOY2xDZkptTWU3cWV0YmtOdzVpU1NEbFFCa2p0V05halozUjE0V3ZlTm1SNjFvc1N5YjdXVGFEMTQ2VlJsODZDSllXUWtEdml1aGVXSzZ0TnNnNHgxcXBMYlowOFNTUi9LR0lVNDYwVTZydGFSVmJEcS9ORXh6TWtxaEZQUHJTRk1QazVBOUt2R3h0NVNqeHhZQy9lcUhVSjdOTHdqU281RmpLamY1L1BQdFdxYWV4eVNpNDdrTHM0UW9NN1IyTkZ0S0FtR0JIUDBwOGZsZ2wzSXllaTRxSzVKVUVLTUNudm9TNGx5TFVWdHdGakh6ZHlLczIwc1Z4SnRVOWZ2ZTFaTUpEc2lFYzlNbXA0WGV6dUdYcjlLbHhMZzFFdnZ2c0xvaFhPeGhtb1pMbDFjOGZLVDJwdStXNG0zQUU1NlVYVnRMYkRmbmsvdzQ2VUltVFRaSW1vM2ZtSzhVd0FROGhobkh2V2xmNi9xOXdrVEMrUXg0eCs3akEvQ3NLRXNId3dPU2VsYUNNNGlWQVBsN3Ixd2FwTm1MU1pwcmJRckF0MnNuSjVibW9ab1dGeUo0WHdjY0QrdFY1SjNqUUNMNWoxNTdWYVdjejI2eU5IdHdPMWFSME1aeFozUHdvK3o2Wm8ycStJcGZFVWNkekVCR21teURQMmhUMXJvcjdTTksxWHcyTlYwNkpGRGpQM000YkZlU3hhbmRhZmhVZFFEMURybXVyMFh4cS9sd2FQZWFrR3RHSElRWTJtdFl1NXl5aktMdWJYZ1R4SnJtajY4dHY0cTFtVjlLVU41c0dlQ01kTWRmU3RyeDM4TmRNOFUrRFA3WjhEK0lFbmlmYzAybk9BWllUdTdEdU1WbnI0WmkxcXlrdGJHNVdTUURjblAzdlQ4YTUyTHhMNGc4QWFsSExERzBFMFRBZ3VuSkhwanBqcFM1WEYzS2pKUzBaNVRybWtUNkRxVGlleWJLT2VKRklxTmJxNFFMcnVsNVJvMitiYTNRK3RmUSt2V0hnajR3YUovYU56YXhXdXBpUDk3R21BSkNCMUdPcEpOZUVlUC9BQVpxUGd1NWtFVG43T3prRmV4L3ovU3FqS00vZGtFb09uN3lQV3ZoQjhhRzFxeGowYlVueE92QlByK0ZlaFhPcnh6Um9xUXRnUGtTRHRYeVg0ZTE2NDBqVVk3eUFzb1VqZnQ5TTE5S2ZESHgxWVgybjJ0N2NXc1U0QUJFVWh5RzljMTgvajhFc1BVNTQ3SGRRcmUwalk2dXhndmRhdWkxMHFOQzZmdTRndVFEMTUvU3RUUlBETjFwTncxbUxadHprN1FFeHZCeHhqSDYxcXcvRTYzdUprU3kwSFQ3QW9QdjI4UExBSFBVKzFkLzRHK0tmaHl3K0hQaVN5dkZFbDlmMjhVZHBMTkdyUEVjODdTZWcrZ3lLNDNVaHk2c09Xc3ByUTRyUi9COHk2bWJuN0dVbU9WS2Noam52MHE5UEc4cVRlR2ZCMXFyVEFrWE53RjRCSkh5cWY2MCs4MWgvQ25oVCsyWjVKRzFEVWlZN0VFa3NxWStaL3dHSzh0OFJhdDRoMno2akRxRXRsYldrWlp6RElWWm05U2UrYU1EaDVZaXJ6dlk3SzgxVHAyT2EwZnhoYytDdkdXcmFIYmFSdjFjVHZHMXpLd2NROCt2VSt1YTlNK0hmdy84T2F0ZTIycStMcjJHNHVkV2t3c2x4SUR1WTg3UmtaQTYxODkyZzFDUzR1ZFFsbll5M0xNV0pZbGozNjF1YWI0dW4xblNVOFBhM3FjOE50cDBobXRtU1FobGMvam5yM3I2S1ZPNnRFOHFFMHBYWjdmOGIxOEJmQTd3bEpaMjl2RStweXpxME51ci9OR2VjTjdnZFB3cjVoOFMrT05lOFQ2aTJwNm5lejNKY2trek9UalBPUHBtdER4V0YxNjViVWJuWHJtN0o0TDNNcGM0NjlmcldSWTJDcGt4UDh5bkpMRDByU2pSOW5HOGpXclY5cG9oaXdKZEFTejIzemtBQlc3NSt0WHRJMVMvME82RWtNMFNBRC9VenFIUWppcStxYWhkM2s0a25LN3dvSEF4bkZVNTczN1ZLdjJsemxRQjA0RlZLUW8wMDBXZkVPcno2dGRHNzhtQ05TTWVYYkx0V3NkcDRXY3JMRytCd0sycEk5UGpoVmtrWWdyL0FCTGpOWk14c1JtWldiekMrTmhIUVZsek0xVUZFWkdaSmJSbmxpMkpFZVNyWXovU3REd3A4UXZGM2dtL0Y1NE84VVhtbnljNWEzbUtLM3NRZmxiOHFnMHV5bDFXWnRMaU9GZENXSnlBdVBXc2k1dGx0MzhoNWN1dUIxL2xRcE1UakZucGN2eGwwSHgyU3Z4VDhGV1Y3TWNnNnhwU0MxdWgvdE50K1J6ejZWbDZqNEcwTFVaR244QmVLWXJ0V3lSWlhvRUZ3UGJuaGo5RFhHMndhSkM0VWtIc0RqRlBnRWpNVzNNdU8zWEZTNUo3bHhnMXNUNnZwT3I2UGN2YTZsWXoyeFVuS3p4OVQ3TjBOSll2TWRweVFlTVZlcy9GT3ZRd0cxa3ZUTGJFL3dDcHVTSkY2ZWh5Uld2cEZwNFp2eDV1cTJMMnJZT3g3TnVCM3lWTloxSnFLT3pEMDVTZHpQdjdPTzJnalpRUzU2a0htdHZUNHRLV3pUYUFHSTVPT2MrOVY5VTBWNWJjdHBkOGwyaS9lMkQ1MUh1cC9wV1gvYVYzREVMQ0tJc3grVUFnNXo5SzUzRjFLWnJ6ZXlxWHNiVW5pZTBpdURweG1kUXZIbUowV3FEWFVFazdHV1hlTjN5c1FlYXF3NkZxMXZKNWw5YlNJV0dRR0J5YW0rd1BNdTJYakgzZUttTWFVVlpBNVY2a3J5SjMxTzRHMkd4WHI2RHJWVFdiVzRlYU16SEFJd1JXOXB1bldWamF4UGRFYm1QQlBVVm4rSW8yWFVRRVlCVDByR0U3MUxJNnBVLzNlcFdnYUt6UVcwQUF6eWVPbFAxYVczdXJhRXc4S0R4N21vTDFGUmtVZ0E1NE5XTlYwNjVzdEdzTlVLSHlMZ01FYkhCT2VSWFJDTjVYT2FjMUdOa1dOSXViTFNGUnBFWXFmOVo1ZlhGTTFXQ2ZXYlNRdHFUckdDVGJSeXIyOTZoc1h0YjRyYm94WWNkQlQ5Wmtsa0lSRjJvZzJyaitkTjJWVHpJdEtjYmRESjB5R1NHemxEbjdzbkE3VnRoOStqU1c0R0JqUEhUMXJMa2lraDA5ekt1TnpacThyTEY0Y2E0TGprWVgxcDFMc0lXV2hKWVNUTXlTeU9mTGlBR1RralBwVnN5MmhzcFpidVZqT1pBYmZiamJqdURtc2p3L0lwdFpMYTRjamR5TjU0QnFXOWRvM2poTDVKSTZHc3BSVnp0ak8wTGwzeHhaeTZiWXd1dTBySW9KQ0hpdVh0WTArMHBPQmoxNHJxUEVrVnpOcGtZa2JkdEFDZ25wWE52REphM0NjOUJuRmRHSHM2YlBQeFg4YlUzeE1iUzNqbXlOcEgzUlZhOHUxOHBwWTB5V0hPYXJ4NmdKN2N4K1dTVjlhWVVGeEdpNVB6R2oyYlR1eCswVFZqWTBHUmhaY2ZONmcxbE1pdHFrbTNCMm5JeDF6bXRmU0ZUN0pKWnhrQ1ZmdTVyTzBtMGMrSlZlVnZrVWt1U2FjVnFSVWJhU0wwS3Q5am4zcVJ0andQWE5aWGhpSkpOUWtsbDVLazhHdFdMVVV1V25GdW9DbHpqRlk4SWExMUJ3TWdObmtkNjBqRjJJZFJjeUsvaUdaYm5XTmxzMkYzZEZxOXFjSVRTbGhRam5Bd1JXUTJ5Sy9hU1FmeGREMXJzL2hmZjJPcmVNOUwwbTR0SXBoUGV4eDRtUUhHU0JubWxPOU9OeVV2YlhWOXlYUk5MK0lQaC9RSUlMV2E0c1lwSVB0RXlnYldkQ1FWSngxSDhxK2kvRUdyUW14MFd3MUd5UlNMZUpoSklOdkJYT1Bmbm5QdlhLZkV6VGJMU2RHdGJvWE81eG9pUnNaU0NUamFQNmRQclhhZkVxeHQ5UzBYUnhDQXJDemdZc09NRGIwOVA4bXZHekNTcWNyMlBYeTJNNlVaUlRPRjhaZUkxMG54QUwyd1ZQSStWWFVya1pIYjNBeFhaNkhlWEhpVFJiZTYxSFRWaGhzWmtkWFhHU2ZseUFldU9hODQrSlhoQy8wdlNtMW1SMmRmdEFKVngwQkpBNTcxMmZoN3gxcDFwNEVmVG5aZ1piY0xHUEw3OFpQLzEvYXVmRjA1VHc4VlMzT3pDMVkwNjBuVU1UNDJ6SmI2aWJUVFpRWWpKSVR0R2NBak9PblQvQ3FIZ0ZiRzMrZTREaUtXelBFaHdDMzU4OUtnMVM1bjhUNjVIYTNCSWtWTnFxUWNFNHhqOVJYVmZFRHdXL2hQd0hZWHpJc2NyM0EzUm8yRGpZRHpudDlLNnFWUlVLTWFUZXJPV2NKWWlyS3F0a2ZNL2kwUm5SSXdwSFVEanJXUG9rQVNhT2JqaVFEOWFsMXE0dkpZMkxnK1VEOG9xRFJmTm11b1kwSkFhVURINDE3T0hYTFRQQ3hUdlVQVnJYUTlPdS9BMThialNKNTJRbGhORjkyTHA5NytkZVhYTm1seERMODRVeFp4dVBiMnIwZWJYYjdSdkFHcjZYSGR2R1o3aGNvRHc2NCt0ZVZhbmZ5dXZsQmlNakJJNzEweDFaNXp2cWlSNW1XelJWYklCd2NHc3lORDV4T01qZFYxWTIvc3NPWC9ETlVyZG04MHFHNDlLMFJWUHNhdGw1WG54Ynh3eHhWeHJlNXQ3dG93TU1EOHZIVDNySHQ1Skk3aFdkc2hXejlLM1BNYTVpKzA3em5ISE5jOVcxenFwdlVsbDFadFN2Mm1lMVNPUVJCWDI5eUIxcUNYYXVYOHhnNTZER1JVRm1aUHR6dDIySG1uSzVlSGFEbHhJT08rSzUyZHNIN3BUbXVaQytYUWhnZWVLUnJwWGNPNjQ5S3ZUZUpMa2FRdWczRnBCc1dZc2svbC92TWVoUGVxRXNVYlRoWXp4eHlPMWFKYUdhZnZHcUxzR3pLU1I0N0E5elZPempqbG5DdUt0MkhrdEE5dXlaSWt6ejB4VWRsYXEycE1VNHdjNDlLejJUT3ExNUl1MjBjY1YySVU2WTZDa094N3d4QUUrbk5ReXQ5bDFVU1orWHZnVmFjYkx4SjF3QXc3MWhiM2phL1Fwd3RGSGZ0S0JnTFQ3aVRKYVhlR0JCNlZWdEhNbDFMR0QxSnpVNXRqSEFYUnNqNjFiWHZJeVR2Y3k0VTh5K0NyakxOakZhd1JZcloxT2R3SnhWRzFoVTNaSUdIRGRmU3RieWxlTXhsVGtya25ORldXcUZTdWtaMWhQZnlxOXNYTW1Ud0R6aXJkdjRjbWpqODJlNmpqejBVdHpSWlc1dExocExjNDZqUHBUYzNrOXdZWW9QTVl0ejNyV01yN0hOVmxKTzdHeVdVNVlxRkVnWCtMTk0xS093bXNGa2xMQ1lIQUFIQkZWdFJGNWEzRzB1Vi92S3A2VmRrTWQ3WnE2TU9CelZUVGpaaFNrcXNXbVpjTmhGSTI1K3VPT2FzMnQxUHBoWkZqRWtiSHYwcUc5dW80U3ZsWXdPRzlxbVJvQkFxVFB3d0hlbTIydFNvUmpIWXRtNGp1TFlQYmtiKzYxSEhQS0VhMm51TUtCa0tlZ3BzMWk4S0pKYnlZQi9oSFdxdHhLVVl4dXBCUFVWbHkzT3QxTHcxTGRxNDh2TzhIbnIycEx5MWlJRnlDSEk2QURvS2JwMFllMUliSkdlZ3BKbm1zVktGT0dPVk5OYU1scUxoY2lhT0YxNUdENzFHMFN3eUFTbFhERGdWY2xtdHJxQlpzQkpWKzhNZGFxVHNqeU16WkdSZ0NyVjJjOGtWNW1SWHlGMjg4VUc1WUhrWng2MDU0OWtZbE1nTEQrSEZUV3Rxc3NSdXhLQzQ1S1lxdERDU2JHVytvU0t5dEVjTjlLMEh1VW5YNXorOHg4eHhXYk5ic2t1Vk8wa2cxSUViWXNjSnljOGswcklhVFNCVzIzQmtpT0RudldtM2t5MjYzQmMrYW5YL2FGWjg5d0VsRWN5QlRqcUt0UkZtMk5HTXF5NEdLQldIcUlkalNJL0I2YzFKWTNJOHRvNW1HTWZLUFNzNmFHVkNTa3hBejB6MnFhQUxJZ01EOGoxcDNzUmE1b1MyalN5bytNbDE0Rk1sczdpQUZJc2dqa25weFRoY3pRQ05Xa0dRUjh6Vm9NaG5uOHI3ZkV3WlI4NEdQd3FveWR5SlFRelEvRldyMkV5MnkzenhqZUF1V1BYNjE2ZGErRlI0M3RyRWF0NHlGdGNBWVc1bGdEeEFFY0ErdWVLOGxXM3ZkTzFOWkl4RklyTmhUSjkwLzRWdFFlTHRiMHFjMk1Mb3VNZkxDK1ZIdVBmTmFxV3B6VGlsc2JtdCtIdkVIZ2J4TDVGNWVRaDRKQWZ0RmcyNk4xN2tqdFVueGEwUzA4UzZJZFYwaGhjeFBHREkwZkpVZ2RENkdyVnBxK202aHBxeTZqR3pYUEdXWTV6N2QrS2pUVWIzdzNkdmRXTm9rbHRjL0xjUVNMOHBVbmsvWEhTcmNWdWpOeWJWbWVGTmFQWjNHeWFQNVJrWU5lZy9CWHhoSGFhM0Y0ZTFDNENRWEp4RkpJY2VXM0hyNjFxZU1QaHpaK0lKRjFUd2hIdlpvZHp3OVdCOUJYTzZEOEx0VDFlL2Uxc1pHZ3U3WTVlR2NZT1IzSHJXZGVFSzFOeGtPakp3bGRIdW1uM1ZzdHcrbUxkb1pZNU9Udng2OWZUcFhiZUc5TnNwTlhpdEx2VTRvYmJocmhtWUFLbzZqbnZ4bXZGdkMvd0YrTE9yeWJyU1NVdmtZWVNaSmJIci9TdXNpL1o3OGQyR2tmOEpMcit0WFR4UlNBU1d5eWJXZGNnSHIxNXgyNzE4N1V5bWRTV2t0RDFsaklwYW83SDRqL0VMKzI1cjNXdEhpM1cwQ2ZaZE5peHg1U2cvUDhBaVJuSXJoZE8xN3hONDgrR09wMk5rc0tORmZnVHlzd1V5THljZS9TdFh4Um8vaFMxMHI3WmRlT1dXN3VMY1crbWFQREJ5SkRuaGpuRzBBOWZXdUIxTHhCSjhOTkxsOEc2ZFA1Z25RL2FDaDRMbnVQYnJYdDRXaEdoU1VVY0dKck9wSzVwYVRxZmhIL2hIWkxDKzA2WCswSTFLZWVtQ3B3UmduMHJ6Ky92WlVtdUxWSjl3a1lodkxHQitkU3JxQXRWQ0M5ZHcvSnh4ajJwbDNjNlNJQVlpREwzR2EyZnU2a3dYTWl2Wno0S3JLWHdCK2xXSDFpTzNVcmF3NEo2bjEvS3F0N2Z4dkFFaWkrY2R6VEJlUnZZZVc4ZUpQWEZaeW0yZGRPTVVyRUZ5MGx3VEx1eGs1NjRxVjdZd3hKSXpBZ2praXFodmpGOGdYY2M5S3EzRjFjRi9seU9PVXpTdTJYWkkxOVYxaVMrU1BZcWhZbzlxaGVNMW1veGVjTVFjQS9NS0xLS1c1RElqaFRqSjNHcmx2ZGFGYTZUTmF6MlR5MzBwSGx6N3NDRWR4anZTMkI2akl0VW4wMXB4WVBoWjAyRTQ1Q21zMlpGbWxNZ2szZHV2SXF3ME04Nk0wUzRXTVl6MEpxR0VsVlpsWEFKb0lzVHdBeVFpTlQwSGVwRXpHR2tZZmRITk8wMkhld1hvU2FzYWhHdGpBeFFnNytvTlpQVm5kVGlsVHVVVkNtWGNvNVBhdHkwbmpndHdvZkpJNlo1cm5mdFN2aEY0YlBVMXBhZHZXL1ZPdUZxYXNmZHV4MEt2dldSTGRYTTBidGNXNk9rbjhMaHlNZTlibmhreG1HRzd1QUpweTJXTDlSU2E1cEZ2YjZSYTNzSkJlUkNaQU8xWjFoY1hGeGV4V3lvVUdSaGhXUHRGT2cwamRVMHNRdVk2L3hmcmJOYTI4NWtWbmpCVW9SMnJpcnZXcm1lNktSSUZRdDI3VjArczZVSXJSUzBwZHNkVFhQMldsUlIzbjI2WEhsYjhZL0dzY0p5ZXpkelhGODZxcEkyTk5qa25qUVhrM1JmbEpKeFZYeEt3amtXWkh6ampGWG1lQzVNZHdxN0VVZ2JSM3JHOFZYY1J2TVFIanBVMC9lckdsVjJwYWpTR3VZbG1rZkxoUVY3OTZrdnRjMVYvRGtYaDJlUlh0SVpESkV1UG1CUHZVOXJiVzF2cDVtYzVrWlR4bnBXTk5MTzhwaVU1R2VGeFhaRFdSNTlSYkczNEh0bCswRlVqK3JZclg4UWVINy9BRjNUMWJRTk5rWm8zZjdRNnI5NEFaT1BXdGY0VGVDSjlYdDRMZUZjdmNIZElPTW9tTUUxNmQ0ZzFEVC9BQUxCWTJXaFdTNzdZdkRGbVA3MjRZSko3MXllMS8ybzZmWnRZZTZQbmFPenYxdFpFdVZZcnp0TEhvY2RQclVLWEQzZGhEWktoQVI4T2NjR3VvK0l1ZytJdkMxekxjMzRWN2E1a0xiMC93Q1diazV4N1Z6T2xTbFAzYXNNTTNYdGl2UWxEbVYwZWRHcGFWbWFWMXAxbmFhR1pVT1dJN0RrVmp3WEprdUl0b3lGUFQxcmUxWHk0L0RjbkhKSHJYUCtGSURQcU9SeWNad1J4WE1sN2piTzZVbHp4WGMzOWN1WG4wcEFWSzR4a2Q2eVpyYUs4aUVzVWdaZ09mbXJYTnMyc1hiNmJCeWVGVlIzUCtOWG4rQ0h4SnNpR2o4T1hxcVFDQ3R1U0NQcURXbUhUNWJuUGk2a09mVTVLQ2RJU1lsSXlPbzlhc1F6UlNNb1Joa0x5UFNsMTd3bHJlZ2FzTEhYYk43YVZobmE0Mm44cW95dkZhWEdZMnlPbUFhNjVLNk9LRXRibzFVbU9ETkZKamFmbUlQV3JOaEJKZGJwa2I3eWtESHJpb2RKcy9OaEY0Nk1WWnUzOFB2WFhlR1BBR29haXBMV1V0dkN3Vm8za1VqSk9lM3ArbFl5bENHNXVwU2xzamk3WFJkVmduZEZ0bjdrQUtlZndGTnNyTzRtdlpmUGpJQ0E1eU9SWHM3Vzk3NFQwUDdib0dvTFozUzRFTXJLR01oN0RrSEFPTS9pYTRMeHhxV3Y2em9zV3U2c2JkcmlaaWp5VzBhcVdBT1BteDNQWFB2VGhVNTFvYzdVb1BWSG4xMWNMTE5JaFRPRHdSWFVmcy8yMzJ2NHc2REZNRHNTOTh3NDlGVW4yOUs1aXpnekswMHpqQ0tUZzl6bkdLOXQvWkMrRnVsK09mRU9yZUk1WlNyMlVSaXRWWCtFc3B5MVRpcWthTkJ1UnRncWNxMWRKRzUrMEpBMGZnV3h2NEc2V3FqYXZUQnovZ1AxcjBwdFBrdi9BQW5vU21RWmV3dDBLTU04RmM1UEhUSUZlYy9FbTFNdjdPbG5wc3dMM1VVejI2c3c3TEt5OS84QVBGZXNYT2xhcjRSOE9hWXR2WXZjR1BSNEYrMUJjaEhDREl5TzNQNjE0bU5YdEtFT1U5M0JQMk5TYmtMNHUrSDJnZUpQRGsxclkrSXJlK2xSVnpHblZXWHFDQjdrajhNVjRyNGgxdTNYVmwwUzN0dG4yUWJRaEdBQ0FRUVIyNjFhdWRSOFJqeFJNK2d5dkRjR1lsblZqaG1Cenh6NmR2YXN2eFJIUEhxOG1xNmxZdEhlM09JN2hTQmhYOVR6d1NPZmV1ekNZWjA0WGJ1ZWJpY1dxbFhSV052d0RQYjNmakNPL3dCUWhHeU03bkpYamc1REg4djBycFBqUHJXbzZyUGIyelJGYk43Rkh0WWcrZDNQTGV2YXNENGRRVzhFTWw5ZlhRMnJFd1U3aG5PRG5qOU05czFwK012RWV1Nmw0T3NyT2J3dkpKOWdoYUw3V0ZPMHFUbFIwNEdNYzV4eFhKN0tkVEdxVnRFZWhLdlNvNEhrdnF6NWUxR0dOdEljeVNuekVZNFdxWGgrZEZ1Yk15QWdHYmtnZGVhdWE1RTZ3WE1uUE0zeTFTMFJkMDl1RDJscjZDaHJUUEJ4VWVXb2V1ZU90TjBpMzhBdzZndDZ2MnE0eVJiajd3RmVOMzlzenliUkZoanpnMTMvQUlsZzhRWGVpcHEwMjU3V0lCQWMvZHhqclhDNnJlTlBlaGljYlZ3Q0s2SXJsUE1rOVNsZHVGaUNzK0NPMktxUnEzMmtJcC9HcHJnN25QR2NtcHJJNmVrUkU2TUplaWswM0xRY0hxV3ROZ3Q1TDFWdkd4RnVBYXRlNFJOUHVHc2tHWThmSTN0V1JHaEFqSzhsRCtsWEpycGpickxNY3RqR2E1NTNrZGtHaGxySW91Wk1uSEhGQ3Z0bGJIQjlxWkpJRGNJeUQ3dzVOUHRpU0pBVXlUMFBwV2R0VHFpOUNuZTR5Ri9VVXhXSG1xcS9uVHIxR2dsQmRzbW14SXozYW9PTTlhMHRvWjgzdm16cFlPV1JnTW52VHRQTWNPb1RvUjgzOElxdHBjMll5L21mZGJtbGtuTUdvK1pGenU5TTFsWTYwOW1UWEVLZVkwenlFYzhEM3A0ODY1UUNKeDhvNm50VENmTVpuWmd1ZW1lbFBnaGxqUjFIQlljVmt6ZFMxSyttckdMdGxrSEp6MHFlWVNRR1VOL0N1ZVRWU0dWcmU5QTQ2OSsvTlhOWEV5cXpZeHVYa1U1L0dybWEwYkttbnlMYzNCS0RrOVFCV3BHcHcyODU0NDlxeGRHYzJ1cWhNSGxlMWE5ektCTHVYSFBZVXFzYlNIVDFpTUxlVFlsODhGcWI0ZjhBRU1tbWF5WlBJWmtaZVNGNUZYcEx2U3BVdDQ0dFA4cVdNNVlzMlZiNjFUdjlVdXIyYVh6aWdIUlVpVUtBS3FtN0hOVmpjaTFxS1hWcjZXZlRvV1pYT1gza0RGVTVNV2tBaVY4OGRqMXFHU1dXTnlqTWM1NlpxT0tVSGRFNi9MOUszbDd5TXFTNVhZZ3VJdlBpZVlOamEvU3BFam5tU01aUEJBQnBwaUs1VTVHVzRGWDdhM2ltdG1MeWJkbytYRkVwV1JxbHJxVzVyU2FBQm9tenRBNW92YlNLOGhSMlhZeEhKUGVwNGJpUzlzVmNvQUUrWEE3OFVqekk1aHQza0FET0JrOFk1cm41clNzZFhJblNiTSt4RnpZM0RXeU9HVUhrK2xXWnNNdVN1NzB3S21hMGlYVkpiQ0prZkRZVjA2VldsU2EwdURaeURHNC9LNDcxVGZOSWlsTGtocVJYTU1aaTh5SkN1M3JudlVDaU5vL0xZZmpVODhrbXg3VzRZN2w2WkZRUklHUStnNlZjYmt6YWxzTW1oQ25abW14dEpiRW5CR2VsVHdSd2JnWjMybkhCeldwYmFiNGZ2ZENNbDdxcGl2SVo4UlJiY2hvLy93QmRXcldPVjN1Wk03cE1BN0Vic2RLVkQ1S3E3SDI0cUdaSGpjcmpBQjZtaE1vNExObFRVbXNYb1NYYUpPNjdEemo3MVB0SjdpeGNmSnZUME5RUGNCWEpqWDVSMHFWTDFvbVdSUXJIKzZhZGpOdFhKbGthNExQdHg3VTYzdDVBK2JkQ3h6ODJPMzFxcExmU2k0TXFvQUc1d09nclo4TFdNbXYzYldOdmRwQVF1NWl4eG1uWXpiUlZ2SklYdXQwVSs1RVVCdnI2VXJPMkEwV1FtQlZyV1BEcHRMRTMwTHhsWTVOcjdUMTk2cVdkL0VzUGxTNHgzcHBXTTFySWxtbG1kRkR0d2VNbnRUZE92STdHODNzcFlBOXU5TnVwcmRKRmtTWmlDZXJEQUZiTjM0QzhRZjJFdXN3Mkhtd09vSWVIbkgxclZJeXJ0WDBMK2grSU5MTjJONjdnT2RucnpVdmlMeFBiM0VuK2dxVlFZVm8yNU9mVDJyaVkvdDFoY3hzdTVHUjl4UG9SVzNjNmxCck1YMjY0aVNLNUFDbFVIeXlkUG0rdWEyU1ZqbGtYdEw4VzZsb2x4L2JGbzUvZGM3VDBJUFhpdllQaFo0NitFdnhUaGJTZmlHQm85NWNSaUcwMVZlRGJTa0FLV0k1S2tubXZDNUczeGVTampiL0VCM3JWMFBSNXAxSGxyZ0g3bzU1UGFvY1VSR280czluc0Q4YlBBSThVYUxaK0xyZTF2TkVzSkpZWVpvQXpYQ2pnc21leFhCSFhyVDkveGc4UytHclVYRnhOY2dRcVVkaHlTUnVQMStsWmc4VzYzZjhBaExSSWIyeGtrMWpTcDBnTjNuRFMyWkJCUis1eXJOMVBUSHBXbCt6SDhVditFZ2d2ZkRIaWpXZGk2TmR1dWxiWXhtVk4rTmhJNjRVY1o2NXJtbEpVNHVYUkhiVGk2a2xIdWVTYXBjZUlyUHgxSW11SzZYR25ST2RqdmtxZWZ6cm5iMit1dFl2bnVaWk54WnM4bkpGZDkrMEJwczNoenhuZjNnbVl6WFVZTEhiaklQcDdWNWhaeXlGanRjZ25yVzBaUm5CU1JsS200MU9XUmF2cmtLbmtSeEU0Nm1zOW5sTndzcU1TRDE5cW5XV1NLUXFTT1QzcHM4S3hvMHdmSlBQV2szb2RFQnhaeVF1Y2RPVDBvbG5LdU1nTVFPZHRVWmJ5U1YxVlJ5UFNyQkt4SUpWUEk3VmkxWTZZV0V0Y3RmQnlEMzRvY3h3M1JsZmhsYktnYzFOWitUS1dsM2hTdmFvcFlrY0Yrdm9jMU55dVVkY3ZjWFU2M1RGVGtET3pqRlJsUXNvWURQdGltQ1J6RnRWam5QT0tsWldjb3NZd1dQQjZWUWNvMjl1WkVDckN4R2VDQlVtbndib1pKWlFQa2JBOUtiZFdadHJwZk9rQkl4bkZPTEt0czQzZ2JueUFhVGVsa1VvYWxxTzZUT3lPRlU5SE5WYmlWaVdFazI3QTlhVzFhTllTNWNIMlBhb2lFZDJrSjRISkZLTWRUU28yb2FGWklsRDdnZU0rbGRWNFpnc21pOHh5WGt4a2NaeFdBRlM4RHZhUkNLSkZHOEUvZXJkOExYS3JaelJLQXBBKzlVWWxmdXhZSFdycWFkMnNqNmZJN2ZjSENnbXEzaDFWUzRpdUpDRGwrbU9sVnI3VmdxbUdKeVFNamFEMHB1alRTTklrRUtsc3Z5TTlLNFZCcWkwZWk1UmVKVmpyOWNleWE1Um81QmpZTTg4WnJuWGtGemRQREZ3RllrWVBGYXZpQzFEYWVybHdoVmNBQ3NPQ1NPeXR5UXdabk9DRDFGUmhZcmtkalhGYVZGYzFJUE04bFl3bkk2RTFoYS9FZzFFTXc2SGxmU3RLSzludXA0bFJpcXFPdFEzdHZIUGZMRk5Pc2U1c2J6MnJTbDd0VFV6cnRTcGxLYTc4dHd4ZkNrWXdhazhPNlMrcTZtWERmdTE1TFovU3EydmFVOE90THBsaFA5b0hBRG9PdGVvL0MzNFdUYTNNTFFibzQ0NFJsZ01FdWVncnBrNHdWN25CNzA1V1Iydnc4c1ovaHk4ZC9mQlJjWGNDK1ZEa0RZcDV4MngzL09wUEdVWThUdEhxMXBlcENMZkxlV281OWNmbWVsT2J3cnFHcVdscTkxZE0xekdXZ1lzZXd5Qi9udlVlcGVITGl4dkJwOGF0ajdLV0pQWTdUayt4NHJobE9pcFhUMU8yTUt6alpyUXd0ZjBQL2hMTkNuc2J0bWxMeGtJVHpnNDRPYThUMCt6dmJLNm4wKzRCRDJqbFRrOGRmL3JWOUNlRmJkUm9RYThmQVVOZzljWTlhOGgxM1RvcnZYTlR2clVZV1M3MnFRTWNWMjRLcjdSdFMyT0xIMFZUNVpSM01DKzF1NGp0WHRaUnZEZ2RlMVQrRTU3TzBna21tWGEyUGxPQld2NDErSHRycGVqMnV0NmRlaVZKRkFsUnVxbXVXa2tFREtpOFo2NFBGYnRVcXk5MDU0eXEwM2VSN1g4SS93Qm4rVHh6NEVmeHlOZU1QbTNEb3NjU1oyN2ZWdXg5SzZqWE5WOFkrRVh0TlB0TlZ2ZGx2dGpjVHpGZzQ0NjV4M0k2VlovWjBtYlJQQXNOdDlwTEt6bDdpQnp4dDI1eUNlQTJNNHo2MXNlSU5XK0YzaXVTd3NvdFloVUxjTHg1Z0JSU0J1QjdZeU8zUEZlVk9yaWFOZHEzdW5wcWhncTJIVW0vZVBHZmpaYlRhN05GcmlSRm4yWVpRT24wSGF2SmJ2elJPY2o1aWVLOXkrUCtvNlY0ZjhlTmU2QlBHK25tM0t4MnB5UnZZWTZIbkFJcnhmVVJKTS9tQ01LU1FTYTlpalBuamRuajFseVhpajJIOWs3d2JZZkVEeG5wK2s2aEdzc0VIbVhOd20wbktvTWdZK3Rldi9GYTN1WDF5VFJkUDBzQ05FZUtLUlkrSSs0VVk5c2MvWDByd3Y4QVp2MSs0OEk2ZytyNlQ0aEZscUVUckhBSDJzSlkySEs3VDF5Y0Q4YStpZmhkNHQwangxUHFHbytJSnJGTlEwOFptUmNmTTJEbDhNUjZOMHo5SzhmSFVzUkt2elEyUFd3VmJEd29jdFRjNGVmNFMrSVBGdmgrdzFFcTRVQ1FIZXBHM0F5Q2NlNHJnZmlGOFA3bncwaHRaazJORFlDV1JXeU1Qa0U4ZStLNmo0by90cjZybzF4ZTZINEQwdXpoUkhhUHpuaDNzdUQyR0FNSEo0cnlPei9hQytJbW8zMTA5M2QyazczNXhQTmRXS3UyRC9DTTlCN1ZyZ3FHTHZ6VDBSbGpNUmhHdVdHck9UTnBKT2t6eG9lWEpHT21PdGV5L3NTZkVHMjhHZVA3blI5UmtJaDFDSGFoT2Z2ci93RFcvblhubXJYbHhiMmJTelFSamNNa0pFRkhOWXR2STBGeEhxVnRPMGV5UldaRWZhU0FRVHlPNXJ1clU0NG1pNFBxY1ZDckxDMWxOSDFmOFZMQ09Qd3g0ZThQd1d1ODNsNFhNV0NEODBoYlAwNXIwK0h4aDRsOEsyOGN0ckxHeU1ubHZCUENycGpqa2crdzYrMWVRZkNQNGkrQS9qTHJXZ2FKRmFYdGxlYWFVVlV1NWc0eGdZQWJIT1Q2MTdONDk4TnZZMkU4VXZCRUlKY2pBeHV4d1BTdms4ZktyaFp4aDJQc2N1VkRGMDVUN25LcDhZZFQwclhwdFZtK0hIaHVSWGJIbVNhV0N6YnVuUS81elYvVmZpN291cE1zdXUvQmp3eGNtNUdQK1BKMTU0N3F3NkNxK3JlRUk3aVZMSUtDVEVtMG4rRGcvd0NOVi9GR21McE9pMjhFT25sbXNtTHM2NTl2L3dCZEtPWTFZMlNaVXNxdzAzZHhNdTI4WCtIN1RWTHJVL0RId3UwS3o4aG1Ka1cyZVlxY2Z3aDJLanA2Vnp2eE0rSVBpanhkNFltdkpiKzRsaUFLdEVWRWNhY2RsVVlBNC9TdXM4QTZSWjNOaVp0UllSeDNicys1d1NHRzBuSHYxclY4VmVEdEIwZjRIYWhjbU5QTUVVc3ZBUDBITk9PYTFsV1VlN0pxWlBoZll1U1hRK0Y5Y21WOUFkaU9zMk0xbStIWDh5OWpSeDkxZ1JXbHEwSlhRWkMvL1BicCtGWi9od3NiOUl3Z3lXeHV4WDJXRy9obngrTWY3MDlhMCtHMmJ3ZHFCa244d1NRSFpGbnB3T2YvQUs5ZVJ5V01VeUc0V1VFK25wWG9tbWF1Yk9DNzB1U0psWm9XQVBZakZlY0lyUnJJeHlNT1FTRFcxTjNlcDVNOUpHZlB1aG5GeEdjTkcrY0gvQ215U3k2aGZySktSdVlqSkhRVkxNRVp6ZzVESGtpcDRCcGR2WXVyeE1ibHY5V3c2TFdydFl0YkUwS3FGZUNOczdSMXFVTEk5c3U5Y2oxOUticGNXOXZLSy93L00yS21qUlJHeW1UT0R3TTF6U05ZYUZhUk00ZEdCQUdPS25zemlJczUvQ29MZ2pidGliOGF1d1FHTFRONmpKTlE5RHFwTnRsSzhqRXFrNUdSMzlLTEdMYkkxd1pCeEZ4azBodUlSYnV1UG5QWE5Sd3l5QzFmY21jZC9TcVNkaVl0ZTB1V05IVlJic1NRUG03MUpnL2JZMklQU20yQ0t0bXJCZVNldFNpY1FYQ1NYQ2pBNlZpMzc3T3lQd29TV1ErU3l0Mlk0cTVvOG4ybXlJZDhrSEFCN1ZWdVFETzZiY2J1UVBRVkpvYm9zTW8zWXdmdlZEMGpjdFM5OUZjckNtcHM5MitGVG9CNjVyUjFDVVhGb3JIbjVlUFdzN1diZWV3ZEpMaU1xdHlOMFRNZXZ2WGErRmRZK0VyK0E1ZEs4UjZMZExxNEJNVjVGSmxTZXd4MnFwSzZVa1Q3UzAyampMT0EvYVB0aGJHejVjVkxkRnZNRGc0UGJGUVRNWXB5cXVRb09mcU8xV3JLOHRXMHljVFdva2xQRWJzZnUwMnI2bWlhNVJEdUpFaGJHMnE5bEo1dHk3Ymozd1RSRElZYmQyY25KSGVvN05ZdVpkMk1VV1NSTnJrVit1TGdoVDFQTlF3Z3BjSHVLbXZReFlTZFZQU21Ra0xJSGtPQjc5cTBUOTBoeFNrUGtiQkR1dkE2aW4yeXVBU29PRHlNZW1LYVVlVXNxT29VamhqVy93Q0hGOEhpNnQ5TTFsNW9BeTdaTDFHM0NNazljZHhTZWlGZThyRmZRMWtlSW9rbUVWdm1RbW42cGJXKzVBUU1FNDQ0cWZVdE9zUEQrdFMyVmhyVVY5RUR1U2FJY01QcDYxUzFhYVV3ck5FQ0I3MXpQV29lZ2t2WURkS2dCZVZGYkJSdURta3ZubWwzQmpseDBKcUhUTGlhSWxtSkc3cVRSZFNTcXhKNk1hMWNYelhNVTR1Rmg3eTI5NnEydHpDUTNsZ0NRZXZ2Vkl3WEZzeEJseXY5S3ZSU0lsdXU0Y2pwUTZDNFRMY25JK2xOU3N5SFMwTTI3akVzS3lxeEdPMVJXMDhzY203Qk9CM05hTjNZWENSankweW5ZNHJOWU41NFZCZ2svaG10SXRTUnl6ZzR5Sko3Z091YzhIRk9zcEkxbHhLTWpIQU5WN3UwdWJiTHVwd1c0Tkp1amgyVHdObkdNakhTcVVVMW9SenVFdFN4ZFJLSkM4S0hiNllxdWpNMHdUQkJ6aXBXdkJNNEtyak9QbHBxdTBkMEpHandWUFNtcnBDbHl0NkFJeThoV044Yzg1cWEyZTUwNllUMjBwNkhKQnFKblY5ekViU3pkajFxMUJoRi93QktHVkk2VXIySmNVelMwT2VmV3d1bE5jaU16U1kzeU5oUVQzcC9qSHdQZCtDN2xZYnU1U2Nzb1lORjBOWTRtTWVJRlFxb09jZzgxcWY4SkpjWGVqR3h1a1dieWpoR2ZxQlZ4U1p6VGpKR05MZlQzZ0VMa0JWNkFDdGJRUEdQaUx3cjVaMC9XcEVpM0F0RXpia2I4S3AzbHpwczJtTEhIcGdpbURjeW9mdkQ2VW1rK0hMdldvbW5zWmJjQ0hHOVo1Z3BQMHorTmJXUmhQbWJPdDEzeDc4UC9GbG9CTjRVbHRid0xnM0ZzL3lzZTVJcm5yUzcwS0tjaTlFeFFFN1ZYak5aMHRzOXJjYm13dUQwVThmblRkWGlMengzRUp3ckoxQjcwMGpQbGRybXZjYTNwVWJsdE4wd3FBZVRLK1RYUTZicmRwTnBDdmIzTFEzQkl5bUJ6elhBcTBjY0JhU010TG5La0hqdFZ6UjlWayswTEN5a25JR2ZRWm9lcU1yTG1zZlEvZ2krWStFMDFWVUZ6Y0d6UG1GUjg2bERua2crblgxcmsvMmRyblN0QTBHZnhqNGcwNXBrT3FzVUNqdU9jWXgweWE2dndScHNuaFR3ZytweTZta2kzR2tYTCtWeUNOcWVnOXgxNzF3M2d2UmZFR3JmcytUWFdqSHloYjZoTks1NEJmR0NSL0xpdUtTVTZiaTltejA0UzVLaWt1aUUrUDhBOFJ0SytJL2kzKzBkTzB3MnJMQUkzUW5PV0hldlBGdDNoa01jcUZHNzVHS2ppdXJuei9QaytaODUzSGs1RldyalVwOVFrRDNmek1vNEpHSzZLZE5Vb0tLMk1aemxWbnpNcVRYa1Z1Q2lxWE9lZUtxcks4em5CKzhlTzFhVXVuTmQyemFrM2tsQTJHalY4TVB3cUpMRlQrK1hFUUE1QjYxTW1iUWpKc2dzYmUzV1oybVlaempCb3VBVWZibnZrQ25wWjJ2bWVZSnpnbm9SVmcyNmx0cEhPZUN4N1ZpM3FkVUl5U0tkczZ4WElsZFN5ZWxXSHMwdUczUnNVQndkdFBOb0lpUU9NOU9La2VZS05qN1ZaSXM0SGVwYmJlaHRHS3RxT3NiT3pUTU0wTzQ0NE5WbnVaTi9reVFiUWpZWEhXblcxeThUL2F5K1F2UlJVVVgycThtTEpGbkpKQngwTkxZZHRiSVpKSmliYzc1d2VRVFE2anloSkRuR2NuanBUMjArYjdRVGNEQko0TmEwRU5qYTJ6d25HREYzOWFUa2tWR0RlNW0yTmhjM2lreHFBTWNjZEsxTkQwclRMZTJsbTFlSXV4NFJNNHpWUFR0U05tUW16Z2R1OVcwMUsxdnk4Y29raVZSbmNCbm1wazV0NkZSakJQVXo3MTRvWkN0cmJNa0pQM2NkVFM2YmNYU2lhTzJCeXc1ejJxUXgyNW5MZ3lzZHVWM0hpcDlKdGdyeXlJZXE4WTdVNVNYTHFPbkhtcTZCb3RvSDh5YTdZWndRQTFXUERrRno5cGFTTWNLM1VIcFRiUU5FeGVVWlByaXJHaTNJajFGbXVZdXJmTGdjQ3VlcTcwMmRGT0ZxeVowV3FJN2FTc2s3cnZKR3hUMXJtdFRneUJFa2VNa0JoVzFxa01qNmhETVdJVURKVW5wV0xxbDZZOVRiNVFSL0NLeHdpdEN5TnNVK2FwcWFIa1EyK254aVBCY2RRT3RZK3EzQnVydElva1pYSkFDZzgxYWpudkppSkFDZ0hRVmE4R2VIbjhVL0VMVExCbUcyVytpU1U0NEFKd1NmNVZ0U1NUY3BIUFdrNUpSUjZoK3p2OEZiZnhKSEw0dzE2RE5yRmtSRmdjWkF6L1N2V2JXejhPK0ZMeG9ySlJHWnBWa2JqQUNrbFFDVDJ4azEydjhBd2l2aDN3WjRadHZER2cyWWpoampLenFEeHV3b0p6MzV5ZnBtdWErTkhoZTdMUTNlanhyRWtsb0N3WS9NQkdmZm9NWlA0Q3ZEcVlxVlhFY2plaDZ0TENxbFI1N2FrRVRhZmFOSnBja2FGVW4zUEl1T2g1enhubXVtZytDM2lENGdlSHJpNDhDNlJEY1hTUnNvM3pLRGpIUUE5ZURtdlBmaDdwTnhxRTF6cWwzY1RFeng3MVdSU2Z1c2NqOUFCNmMxMFBocjRnZU12aGRlblh5NGtScFRpM2tZbktBZyt2WEhlcG9WTVBIRjhrMlBGUXhMd25QQldPRTFYdzc0dCtGc3Q5b25pdnczUEh1VWdCdVNoSElQSEdLOG1zL3NZMGVWYmhramVTOGZMTnhuM3I2UStPL3g2OE0vRisyc05FdGZCN1dlb3Z0ek1kcktCMElCd01qcFhoSDdRUGcwYUhaNkl1bFdvUkRFNGxBNDNNY0hKcjZLbExEUm55d2U1ODQvclU2YmxVV3g1eDRyOFN5dm15dHJwMmhWdWhQRlpOOHlQWlJ6QWZYSFdvTlpTU0ovM283ZGpUYlllZXFSTUR3T0s2dVJVNDZITENUcVRzemV2dkYzaWpVTkZ0OU1mVzVZclViVmVLSml1UUIzeDErbFh0Si90ZlhicTIwTFM3Z1J5T3lwYmdzRk83dGxqMCt0WXNwZU8xRWZsNFVkKzFQaVpqREpOQ1NwVmNrN3NZUFhqRktNbEl1ZExsMU0vVVpkZHR2RlUybmE5Y1RQY1dzeGlrRWsyN0JCeGdHdEMraERPckt1UFVDc2Eza056ZStkTzdiaTJTN05rbjhUMXJYYVo3bTRqalg2WjdWcE5wTFF4cExtZXBOTlloTFJKQXpLMjRiV1U5S2JLYnV3U1dVWGtnY3Fjc0pUazU2OStuK05hVnpid0dLTkpKQm5zQWF6TlpXV05KSkF4STJrVnp3azNLek9xckJjbHpFaHVHYVlzVG5JSTVKTmFQaDdTbGZVVmxpSElPYXhyWTVjaFd4ODlkTDRYdVV0N3dGaHdSK2RkRlZ0UnNjbEJYbHFhWGlJUFBweGdCR01kVFdWRlloTk5JSU81bDRPZVJXanJ6bFl2TUVuVTlLemhlSzBZamdQWGhnUjdWelFjbEU2cXRyM05INGErS3o0SDhReTNLM0pqbEVZYUVxMlBtSFBINDQvS3ZycUQ0dCtMdmlsOElZTHorem8wMU96akMzcFhhRGNXb0hFcWc5U0NSeHpYd3pyZm1McXF5RGh1Q01WNkY4UC9qdDR6OEoyY2RwRmNJVmoyTEhOdCtkRnpralBmT2FqRjRDbmlZcVQzSGhzZlZ3MHJSMlByYjRlZUk3L0FGU0M2Ti9Lc3NsdEFpSVd6ZzQ2Z2V2SS9uV2g0a2oxbVRRYitUVHJUenBmc01rbmwvd2s3VDdWd253TitMM3c2MW1DN3VyeDNGM0kyNmF4YWNKTW1PZjNSUHl2bGowNE5lbjZMNDQ4R3lhSmVXZDE0cU52TEl6UmlDV01KSUV3UXJaUGNaL1hGZkc0akNZaW5qRmFPbHo3YkRZNmhVd1dzdGJIbG53bzhjYXRkZkNPUFZmRXRoaExTL2tTMWJZUUd3Q2NFWXovQVBxcm1maUYrME9QR25oUzYrSDJncVFFQlc3dW1iZ0lEOXdldVNUelZMNGdlSzRkRStHRno4TjdlNkxYVDZnNzJKS0VzRmJyem5IVDhSazE0U1UxVFJydG11WkdESDd3M2RUK0ZmUTRIS0tjNnpyVkY2SHptUHplcEdtcU5OK3JJZkVUTkZZT3JmNnN5WlhIV3M3dzJvV2FLNUpHQktQNTFvZUpsOHJTR2RqbmMzUW1zclFwTWVUQ0ViNytkdyt0ZTFodGFSNUdOZjcwOWQ4TFdjR3Z2ZTI0aEx5d1IrWXd3UDhBVjRITmVXZUxiT093dXBUYlNneFBJeFhrZEs3end0ZlgxdjQ3aWl0THFTT0EybTJkQTMzbDI1SVBIMHJodmlScDc2ZnFzbHZESVdSTGgxQUI3ZFIvT3RZYVRPRnRTUml3eElMVnBOdVJ1NDlxZ2xVcktDdVNPNXhVdGsyNkdTM2xrQUk2WjcweDVBaW1GOGZOMHJaNm9rczI5MFlJeUVmSVBYRldyYVJXczN3VHovRWFvQkNpb1IwSXEraXNMRmtqQUhxY1ZqSXRiRk5TNU9BZDNQU3RTNG1lQ3hWQ1R5S3pFSmdkVDJKcTdkQVBhZWRHK2VPUWUxWnozUjAwYjJabHpTaVQ5NW5uZDBxd2lPdGlYN0hyVkF2Z0FBY2c4OFZveFNBYWVZMWJQUEFyU1dpQkpYTE52T0ZzRVFMME5RNnlraGxnYVBPQ3RGcHY4b0FqdjBxZTljdkVwenh4eFhQcEdWMGRHdklQYVZwR1ZoODJFeGlvNHc5bWpsaGdudDJwbHNmSkkzSHBSZDNpeUVtUG9CaWhSNkZOMlZ6VStKbmpUUi9GZHJvMW5vMWkwQTA2eUVVMlI5NXZXc08xdW9vbFVNV0pHTURGVXR3TXBKWFBQQnFhemJ6WEkyWVBxYTZPUktGa2MwWlBtdVg1ZDBtSlI5MDhZRlRmTkhHRmlIQjZtb1kyYzJRQTdOenpWaUthUFlGNmNjakZjMHREdGpxaUc1TzZBN0NBU1BTbVdzYXhJRmJsbXA5dlozRjFjdEJHUUIyM1UyVko3WE5yaFdaVDI3VTF0WWQ5UjF3UGxWRVg1Y1lKUGFvSmtZSVZQUmZ1NHF4ZENSRWl6M1huRlZaV1ZTQ3A0cHhGSXQ2clo2UkZaV0Q2ZnFUdk82bHJtSWpBak9lTUdvWVkya1pramZvTTFBNUUwd0NqakdBQUt2V3lHM1ZwSkZ3eFhnanRSSjJSTVZkM0pkTEN4NWFST2pjY1ZhMU80QXRXR09jZkx4VVdsUk5LcEE1YjZWSnFBZExUekdqQUo0QUZjemQ2aDZLWDdnbjE5ZENmUjlML0FMSFYwdVZoL3dCTkpIVnMxbFhUc0NDRHVHT3RXb0lYdWJOSHdjOUFLcjNxdFo1RzNqdUsyVTAzWTUxU3Nya0tYaFllVTQrWFBQclZ1Sm1hTm83Y1lDampQVTFRak1iZnZYWERkZ0t0UU1YR0ZZODFUU1JTZHl6YTNBbWhNVWgyNDZHcVVkckd0OXZEZ3FyRGlsbG1kWEtxdUFEMUZSd3lSbTVWRk9RekRPUGFwU3RleE0rWG1SdGEzcGNTNlA1a1lCTDhrQ3VTWnBJVzhsaHdQYXU4dVZpdWRFV0lUaEN1T0Qzcm10WDAxQVI1Y1lKN2tDb3d0YTJqRmpLQ2F1akxqQiswSTZEY1Fja0FVMjR1V2x1SGxLNHlhZThOenA4d09Pb3EzcUZoRkZiUlhTa2ZPT2ZyWGMzRTh0SjNzVS9NREREQ25HNGo0WGNjaW9KRVpaQXd6ejJ4MHArWWxZRnNZK2xMbFJiVFJiaWFPWWhHUHZTZ21NTWlBbFNldmFxOEpVUDhqNVU5NmtsREVIOTloYzlxVnJNVjB5VkVNc2VDbU1IZ2tjVk5mMjl2YjJzVTBEY04xQTYxRERkTkRaZVRMeU4yVXFlNnZMVVFGbFVNMjBmTDZVdWFYTUtjSThwblhNakJWVGNTRzZLTzFTR2VSN1pZNUI5MnF4ZllXa1h1UFNuVzl4TXVXVlFkM1ZpT2xkS09TVVNVSHpBV0hRRHZTNlJjSlo2bkhjTDh3RW9KR1BjVU5mQ0pQSzhrQWtjNHFBQ0ZueEdNWTY1NlU5R2psbEZxUjlNbnhOWjZ4NFBzN1BUWVhLemVHN2dPMjNoU1NRZS84dUt4ZmhFSnRkK0RrZmdUd2xydGpCZHRKTEpmQytkVXdTMk1LeDR5UVIrZGRMOEJmRkZub2Z3Z2hmWE5JR3lMVDdqRTA4WXd3QUxZQkkrZ3J4NkN3OHI0UWFWcnVrTVV2TGpVYnRaM1Z6bGxCRzBkc1lyejRhdHJ6TzV4Y0lwOXpBMXJTTHJTdFJ1Tk8xUUtza0RsSk5qaHZtSGNFZGFwbHR0c1VoakxaNUw0cUpMNlc0bU1WMldMRG5uL0FPdlNycWNzSktXOGdVQTlDdGR5MFJ6OHp1VzlMTm1aZk11bklRRGtnODFXa3VZMm1Zd3RsY25iOUtyWDE4TUF4U0JtYjc0VmNVV01rVU1jalNJU1dIQXJHVVRyalViUThUckZjNzhmUUVVczE4NEFJUFR0VWNUZVljdkVmcmpwVW15SkZBbEFCOTZ5c2pvZzIwRFhkMlhIZkl3RFZpTzJWcFgrM3pZWW9BcWc5S2dMUXFDeDY5UmsxSEpPb1lURW4zcEYzN21taWFYYm9xN3QrZTNyVnEzbWd0VElxQUFHc2lGMmxiZEZEeDdpclZyWXMwd1BtWTNkRG1zNWJIUlNjdWcyODFWbTNJVXprNEo5S1NEenA5dzh0Z3g2REhBRlRhN3BmMkYwRVp5VzVPUFdyZWsycmZaSkhsYlBPQm50VU9VVkc1cENNNVZHbVY3SFROcm1lUmh4MnBBQkRIS3c0QmI3b3E2b1FFaHNLUjB6MHF2NVVwWnlyQmcvSEF5QlVLY205VFYwNFFJWW95eVNTQUZzREpPT2dxenBNMGlBeDI2NTNua2tWbzZBVjA2eXZ0T3VJVUp1VkFMbnRWZlN6YnhLeTRHUTJCZzVOUk9kMDBLakI4NVlqMHBvMGU1bWsrbzdVM1F6SE5xSVVnTUZiUDA1cCtzNnBFSTF0WVpPU1BtT01jVlM4UDNTZjJuaUp0bVQxSjROUkdNNVVtMmJ6bFRoVlNUT28xNy9BRWlkWllzS0VUQlFIcFhIYXpGY05xa1ppWTQzOWUzV3Vtdjd1MWd1VEFKZHprZk1GNXhXUTlrSkx6ZHZHUTNBUFlWT0g5eENyeDUyYWM5akV1bm9CSUFTQnpWUFEvRU9wZUF2RVVYaUd6aGlrbWlPVVNkZHlObkhVZXZvUjBxU1M0Q1NMQTdmTU9sVk5hTFNUSThxOXNEUFRGVlRsYVZuMUlxd1hKZEgwLzhBRHo5cGpRZml0YUxwRi9LTERWQ3FpV0tSOFJ1M0F5cC9rSzdqWHY3VjhXNmhZNkVVMm1DeGFTUXZnRmdmMXdlbjFOZkNkMUxjYVRlSmNhZE15T2pCZzZuRzBqditsZldQd3I4U2Foci9BTU9mRHVzNm5lelRYcTJ6TGNUOXlvT1F2b2VNMXc0N0JVcWNQYVJPakw4WlVuVjlqSTlROEgrRW1zTFM2MDJlR05qSEM2b1Jqak9EZ1lyaC9pcGR0THA2V2tKQldPM0VlOVIxWWhzRE5kL29ubDJEMmt3dkNnTVozWlk1UDEvRDlhOHU4WTNpYUZxU3ZyMGZtMnozNUVjYWtaZFZ6ajY4azg4OTYrZm9VblBGOHlQZnhOUlF3dkt6QjhINk5hZUlQRStpUWtNWk1NQ3hIVUEvL1dQTlpuN1lWOVk2UmE2VHBhenBKTURJemxXejBKSEk5K0s2ZlNQSFVObGQzR3Yydmh6N0xIYTJSZTFDb1RzeG5nbmovd0N0bXZtcnhuNHoxSHhYcW1vNnpxcE16WEV4TVlaeWZMSk9lUDhBUGF2b3NGaGFrc1Fxc25vajVuRzR5Q29PbEZibVZxeWkrdEdtemtyem5wVlhUWXlIakJia2pyVXNFci9ZMkRIQVBCSGVuUXBHanJzSEh0WHQxWmU2ZVBRZy9hWE5MVVlZNGJSQ2dCWTlSVkdhN05sQkpBUi9yVndNVmVtUXlRb2pQZ0U5Nnp0VWlWcHZJUjkyQjFyS2p1ZGRlTDVTaHAxcEpjM1FSV0dNOG1yK3B5RFRKVWlSc3QyT2VsUTZKYlRXc3NqbGo4dFd0T3U3Tk5iU1cvdFZuak9RWTNOYnlmTXpoVlBsUmEwaDVkUWxYekh6OHZGVGFzc01ObEtramZNY2dacG1uRkxmVnBESEVZNHl4S3g1NkQwcUx4ZEtJNGQ2ZzFnbis4T3VWbFIxTUR5VlFaalhIUFNyK2t5U3dQNXFra2pwVk9HVVBiK1l3RmEvaHVKSkdMTW9JOXhYUlZkb25IUlY1RmpXcmp5ck5YNmtyeURWUFFDdDBraXVxZ2cvS1QycC9pZG5FWWlLWTJqZ2sxUTBDV1pMallyRURPVFV3UzVDNmpibFlmclZqSkxxQVZlU0J6eFNMRktzUWlUSXgrZFhZVzM2MFVEQlI1Zk82bitURVpqSzBnTzNzSzFqTG9ZeWpvYXVnYWpaV1Y3Qzg5eUl2bEdjSEJWc2puOUsyL0ZmaW54Tm9jWldEVVpHV2Rkd0pZdG5qOUs4OXZGbnVydHBZTTdWUEI2VjBVTU10eG90dnFWNzRpdDUyUnRoc2dENWtZOVNUeFRjSU4zc1o4OGxEbFJabThZK0p4cE51bDdQdUViRmxaa0JZWjkrdFptcTZsOXVoKzBUeWxuUFF0MXJVMXByTk5DU1hjcDMvZFVHdWV2cG81ZFBHMWRyS2VwRmFjeVNNcWFmTnFQOFhTcTJqcW44UmZyaXN6UkhLM1Z2MElWMU9meHJROFdoUlpJcWo1YzVOWnVuUkVYY0pVOVN1QUs1c0wvQ1BSeG44VTlXdmRMRjU0Z2p0N2VVMjh6V2FzamsvZTQ1NCtsY1o0dzBPRVhVc2QvcWNjY2lSNTU1M0VmL0FLcTZIeFpyT29ueEZweXhLVU1jYUp1QndlbGNsNDdqaysyek5LMjRnbjVpZXZmdFdtcm1jQ2pxY2xhL01lVDFiZzA2OER4M2tlZWNVeTJMSmNLV1U0SjQ0cTFxcWplcnArTmRSSll0RERMSjVVemJRRDh2RlhaSTViZTBNcXFNUHdEV1Nzd2FOUW1RMk1tcjFyYzV0TVNQeG41UlhQVTNLaXlsY3MwVzF3VDE0eldwTElyV0tsQndWNUlGWnQ2aFlZY1l5ZUJXamFoWmRNRVlrVlZRZCt0WlRWMGRORjYyTXlLQkdtS2xRUUR3Q092TldwUkg5blptaktFTDBQZW9vMEF1d3gvdlZaMVJOeWRUelJlOGtidGFFbGpMRk5waVFKZ3VYL1NxMThMdTNtQ1NlbkdEUllTZloyVGRFeTQ2NDcxWjFHTTNHMXlDVGpBQlBTazBsSVY1Y3BEYWp6QXZuTU9mU29aZ2tCWU1EeStLa3RiYWJ6c0tja0duYW5ieUVGOGR1ZzdVazF6V0tkM0V6akJHbDBxdE5oRys4M29LblZJWWJsaGJ6aGxVY1BWR2FVNy9BSmlUdDcxcXdhZHBpNlNsK2RWamFSemhiZFY1SDFycWE5MDVmdDZEN2N5cUZHVHRQWTBwbTh1OFVJZ0lKeHlPS2ZNU3R2R21LUmJaYytkbmdDdU82dWVndEVXcldYeVppc2lZQjZZcUM3MnczZThIQUp6aWtrbUF0OXd3VG1uYW02emlDNFJNWlVBL1dralJ0S0k2VEx5TUFRUmpJOXFvU21OanVDbmc0cTFjTG1QZkczYjE0cUFSRllmTWxIMHpWUk1aTWplUHk1RmtRbkFJcTljczdXWmt4d0J4N1ZTTWdsUVE0d0FlVFZxL2xFZG1xcTNvT2VsRFRkaTQvQ3kxcEU5eERBRldQbGh3eEhTck9vaG10ME12M3NFZE92RlF4VFF3eFJxV3lTb3lNVll2YmlJMmtiRWNDVGdZOXE1NUwzN25hdEtCczZSYWFWSDRKYWU0d0xscC93Qno3aXVXdTdnM0YydzNaT1NDUFN1ajAvUzd2VVBERnUwcE1heEdSU3g2RW5rVnpHcGFlTFJ0OGNuemQ4SE5La28rMGQyWk9UY0ZZUjdTRjBLRWxOdlRJb2p0NTdTTXorY0NQVEZTNmJMSktnU1pRUjZtcnIyOXZHUUhPNFNkQW5hdG5Kb2NZYzJxS014TXNHNTI3ZE9sVW9UdHU0ejBHN3BXMXFOamFMYUJJUjgvdFdYRkdaN3hJRlhsVDJwd2twUmJNNnNXcHBGeTYxSEVuaytjU282WTdWV2wxRjJiWWVRdmVyZDFaQVhHSkYyOGZuV1c4ZmwzTW1GSkdlS21uR0QySFZjMFhaWmJhN1JONERFQURCcDBrQmtqVkJnaFA0U2VsWllkMWJjdmJvS3UydW94aEFqMitPUHZFMW80eVMwTUZLRGRpSzRoVU9WWURIYkZScGJReXhHM1pPZXhxNUZGRE5JV2liSG9wTk9hem1VL3VvOHV4NlU0emNTS2xPK3hpQlpJV2FMYVFQNHFFbmFDUUFIajBOWE5Vc2J6VDU4WHFZUFU0clB1Z1hmZkVDRngzcnBqYVN1Y3p2Rm1oOXB0VmgybGNzM0k0NlZWbjNRTHVjOWFqOHlGWTFMU2ZPT29welhDVHJza1lISFRJcWxHeklsSzdIR0x6SXcxc3Bjbjd3eDBxUGU4YWtyeGc4aW4yODBrQ0ZZMjJldFJsakZHWEl5U2VSbXFNMk9XUVNyc1lmalQ0eWx1U3pEbk9CMzlLaGpsVnlQbHdhZFBJRHRMbkdPLzQwR2NsYzkzK0YvaWkvOEFFdjdQUGlIdzlkM1hGanBzejJ3WEFLWVZmNWl1TjhOM1VzM3dzMCszMmxsaTFPNDVQSUdRRFVYd3MxSytzZmhuNHRGbE1RcjJUb3luSFFoYVo4Tk1YL2dTVFNTR2FXSzVlNGlqd2NzdXprK2xjOFlxTGZxRXB2UkhKYXFaYmpWWkhpSlViaUI3ODFWSWJ6Q3J2a2c5NnN5M3lSM3JTdEh6dVBBK3ROMWkzTnZkNGtZTUpZdzZGZTJhM0xTallTRzNSd1NjY2Q4VUJwWWlKQXdPT2d4MEZWYmNYS0g1V0lCOUtsUzJ1QmdZSXo3MW0yaldNZXlMTnhjbG5YeWs0STU0cFpaSjUwQTJjQThjVmNzZFBJZ0FjcUNUOHVSME5hRUdrcEEvK2tFSEs5dWc0cmxuVmpFNjZkQ2NqRlhUNVoyR1ZZTUswWXRDMldKZVdNL0tSemlyWlNHeklqZGNsZ0NNRHBXbExlUVBvbjJkWXZuREFra2RxNTUxWnQ2SFhUdzhFdFdSV09uNlRMYXFqNGhJQXd4RlZOUnVyS09WTEMxWElRY3Y2bWx1THBKNHpzYktqR2NWQlkyOE11cnJEZGpDbFNReG9VVzNxWEtVYWV3L1ZibEx5NWlCWEd3WTlxdFdzb2cweVI0NGlTWDZBVlMxSzgwMkhNa0IzN1RnR3EzOXY2bGMycHNOT3R5eDlWWE5VcVVwSXllSmpHVFpNOTRGYnpycGxJQjRUNjFhVzRqRnF0MjBKUURsUGwvem1zQ3d0cjJWbW11SHk2dDkwbnZXOWM2aHF0L2FSMjEyNjdZeDhpcXVLcWNJeDBIVHFTcWEySzhXcFhGeXpFZ2drOXFXekY0THpCeU1uZ2RxbTA4UVdyT1dUSnhuNlUrQkJOZUl5dnlXR0ZGUktVVWpUM292VVRXYlNSWXhMRVBZQURyVlhRNDVYdU4wZ0kyOVJucFc5Y29WdWNHUE96QnFramVYSk5NaURCNStsVEdvM0RsSW5UL2VLUnNXRnRhcVRJYlhMazRWdXRaZXBZajFBN1d4dFBRSG9hdGFIckVWdE9uMmh3RkpKY3NPbFpWM2NocnlXNVI5eUdRN1NlNHpYUEdFMUxVNnBWSXRLeG9XVnVMdTRMbjcrTy9wVlR4SGNaQ0pDQ0dEYzU3VmQwRU5jM0s4bE05U09LenRlazh1L2FKU0dDdjFGT25yVnNUV2RxUlUxQzFLb2p5bnR5Q2E5OC9aZThmMkMzMWo0UjF5eG1sdGlGTVRweVZKWWR1M1RyNzE0aTBVTjlIR3UzTFk2OU1WNnI4QTdYV3YrRXFzbnNOTFdYeTRDck9rbUNGOWM5cTFyd1ZXaTRzNUlWSFF4U210ajZkOFRhejRiMGVhOHZ2N1ZqV096dDFaVkw3WHhqUEMrdWVNREhCTmZOMm9hMTR1dk5SSGluV2I4engyOHJTVzluTjkxVkxkTWQ2OUQrS0hpbndQb210VFhmeEgxOUxlY3dBTGJRTnZZZ2UyRDFGZk8vam40MmYyN2VOcEhoMjNLV2F5RllaSEdDVjZEajhhNU1CZ0ZTdkptMllaakt1MUZNNmZ4RCswdjR3MXZVUllhYnA5dloyaE94b3RtNHN1YzRPZU1kdjByZ3ZFZHZiM0Y5TWJhRVJLNTNzRjZaL3ptcEpMRmJSb0xuWUNkdTVnQitOUVQzb211aktWSUdNYzEyODBWTDNURlV1V25lVzVoc1FmM1k0eDE5S3U2WDVaY0xLT0JVS3gyN3RLNUdmbTRBK3RTV3AyVGVTNEl6MzlLM2srYUpoU1ZwR2pmb0JGOGtvd1J3UWF4eEl3bk9WeU04WnJWdnBGZ3N4R1lneDdHczZWUEtDdktjRTR4a1ZuVGRqZXJxV2JOZ1lwUUUrYzlPT2xaaGhraTFBT1d3YzlxMTlPbFZSSTdZNmRPOVpybnp0VEJISFBYOGExaTNxYzgwYU1za3RyTEN3WGlSc1ZCNHZsSnRnbWVhbmxkNXIrM3RNL0tHM1lxcDR3UWlZSUNUelVRMXFvZFYvdW16UHRZWlBzd0pHQVNNaXRyd3JISEpkdkhnalllTS81NXFrc0FUVEZKNzl3SzFmQjl1MGtzMGlZd0JXOWY0VG13M3hHYjQybmRib0NOaUFPb0ZRYUZHV1R6dTVIU2w4V041dDQ3RE9BY0hpcDlBakJzaWhYcjBPS2FWcVk1YTFXZ2lKaXVHdUNwSXpqOWFYVVovSlR6SXgvckFBQU8xTlNVSlp5S0NEOHhHRFV0amIvQUdtSS9hbHlvUEdhRm9yazdvU3duaVNBUmJBVmI3eDlNMVorenlSV3VMWmR5dU1mS01ubjNyUHUyamdtQ1JxUW5HU0IwcWNhdGU2VkI5c3RtQ3RHTnlFak9EV2lsb1lPTElyeWE2bHRvSHl4UmNqQlBURlM2amF3ZjJFYndTZ01CeXRJbXY4QTlzMnFRUEFGZGM3bUE0SlBVL3JVV3RreGFZVXhnNDZZb3ZxVW8yVngvaVpmT3NVY25rTmdqRlVOSGtFZXJKSU9RdTNBK2xhdmlaVmgwMkpXQStjOFk3MWs2UkJMTHFzYXgveGtWbGgzYW1kT0xYN3c5SjhWYXBZWGsvMitHTUNWTFNKUU1ZSWIxcmpQRVlXUzIzU2t0SWZ1NTV6V3VYWWVJQmFYU050TzBNcWpuRlpuamkwY1ROUGFBckJGeWc3MWFkcG5JcnRNNUJyYTRodVFrc0xSc1Q5MGpGYUY1YXNiZFQ1ZmFxMDE3ZDZqZUxkVFRsOXVCejJyb2RaMTN3N2QrSFlMZTJ0Mlc4ajRrSUF3UlhTN25MWjNPYWxsakVpNFBJWEJGWHJVK1paS0NQbURjVm1YMEU2ZVhja0tCSnl1MDgxZVhjaUlvYnNNZ1ZNbGMxcDdocVRaaUJZODB1bXlHUkdSam5DOFV6VkpESkFzWGxnWTdnZGFnc1pXdFR1RFlCVWc1cUpSVGlidzkyVnljYlgzUHZ3VjZnOWhWK1F3TWlQR2QyWS9tV2p4RXVqUmFWcGwzcGtrd3VXZ1A5b0I4YmQyZUN2NFZUMDZhU1dYZHQrVUxqUGFzbkc2dWJ4cVhkaFl5MGwwRWp5dUR3cDdWTnFFdHpheW9RbUZJNVkxVlNRcnFSSnpqUFFWZjFqWk5aWlVuanNhbTN2SXR5OXl4UHA2aVJCTEVSdngzNzFIZG5obGR3V1BVZTlSYVJkUEJBR1BVZFBhbGxacDNlZDE1ckpxMHplTnBRTXFlMkVRWnlEOUNLZ3N5V2NZSGZ0VnZVcEhJM1B3b0hHS3FhYXlOZUJmVThWMnhiZE81ek9QTFZTTnlhQWxZaXg0SzhjMUJGTG1XU1BCeGppcmtaTFFFc3U3WU1EMnFza0t2Skl6SEdGcmppN25iT0xRaWx4R1l4ZzVQYzlLVjVTWUdSdXFqaWxDRkkxeHlOdE5Rb1lYTEwxN1V6TmtoQy9ZQklEMFU4VTk1VW1zb2hJb3lpNEJ4VmVWTTJZS3RTTkdwdGh0YlBIV210aUpNV094a2R4KzdJRG5qaXBkWmlaYkJTc1p3RDFwVTFhV09ORVBSUU1HbDFUVkRkV29oTVNnazlUUXViblJxbXZaMko5RXNaZFRhS0NHTXN6RUJmclhSYXQ0TXY3THc3YmVJTG1BaTNlOGFEUCswQnpXUjREOFEydmgvVjdlL3ZiY3lwRzJURXB3VG4vNjFkZDQ3K0tObnIzaEcxOE5hTlpsTFZiOTdqWkljc2hQYk5jOVJUVS9JMFZSdUhLUVgzakswaThKeGVGN2F3UVJzKytTUWpETWZhdU92b2lzNGFKTW9UL0YycTVmU3Rjc2dSTUFBY1k2VkJxTGxHVlN2QTYxblRYS3pwNVVxUll0TkFTLzAvN1RCUGh3Zm1UMHBzdWozMW9uQ25nY0QxcDJqWm1sMm1ZeGpkbklxN2NwcVY1TVk3YTVEYmVGejNvNXBjMW1WQkpLNk1uZk1qRlpsTy9IRlZ0S2ltR3JsdGdJeCtGWE5RajFpeWxaTlIwdVJBTTVsS2xoVUZnaGU2RExJQ0pEZ0VOM3JkZTdFNTIxT3JkazZ5dmQzN1JIYjhocGwxcFlkSE1ZNEI5S250dFBGdmN2QUd5UXg1cWUwdVVodmpIT21VQkc0R3NsS3owS21yclU1eWFKWTMyRlRuMkZXbWFNQ04vS0pLakFGV3ZFU1FyZi9hTFdJTEd3NHhVQ3NxT213anAwcm9VbTBjc0kybVZIUnhPR2lmWTVQQXowcVNLK3ZZWmdaR0JLbkl4U3oyN3E3VGJTY250VmJ5NVRJTVpCSjROWG95cDNUMExtcDMwV29TQ1oySmJBRFpxRjRiU1JOcUZlZUtqa2d1WWtrU1JpZStjZHFwdExLamJDU0JuclRqSFhSbk5LemVvWGVqcjVwTWI5YVpZNld6VDRkOEFkVFRtbmtobHlKU3krb3BZN21JU0VJN0RQclhRbk94enppcmhkMnEyMHUwU2dxZWVLVDdNa3NKQk9UamdkNlZXak11VllIRld6RXFRZmFmTkFPT2dGVnpKYm1UM01tT01KOThIOGFkc0I2dHhuamlyREJNRTVCUGNZcEkwaklKSXg2Y2MxVnhIZWZEZTJkZmhSNHFtT0NvdDl3SFVqaGVmOCs5TDRlMXUzOE1lRGJDLzA5Rlc2bXM1WTNiSFppYXl2QTEzZHgrRGZGRm9zaEVmOW1JZHVlT1hBelVtdlFTMnZnZncreTIyRWt0VDg0SEIrWThWbGE2Wm5QVm81NTdkNUR2MjlEdXlLbHRyWmpJM3lCaGpIemM0cXhDWTQ3Y3lranAwUDBxS0srUmR4S0VOenhpc1p5azFaSGJDbkZKTW50YkdCSXlER0NNOG4zcSsxbkJtTjhMdVUvTXZ0NjFncnFqQXZLcXNUbmdEdFRGMXE2aHpKRXBCWmNjbXMvWXprOXpxamlLVk5Xc2RJSHRWSlplaFBIUFNteTNjRWJrbTRYR1B1NXJsanE5OC95b3h6bm1sQnZaTVhVaVBnbkc3bkdmU21zS2x1UDY3S1N0RkhRUTZtRE9ZSThjL2RMZHFTNjFpNnNzQll3VHh3M1Exa1F0T3gybEdEZXVlbGFhMmw5cWRrTE9RRDl5MlF4R0NhSFRoRmtjODV2UVpONGhrM0NRR0VOajVrVmUvclM2VHExNzl2KzAyMGVaRVU0TERnQ294cEVjSDd4aG50aXIraXJGYXlzWTRpY2puQXhSS1VVdEJxbE9UOTVsS1BTR3VHbGt2WElZa2tLdlQxTmFPbXpTNk5ic2xuRUF6cWN2ajJxYTNJdVM4Y0pVZXBidFZlVTdJMlJoa2tubkhTc3ZhOHpzYkxEUmlya09qMndtbWtMUHp1eWNudjYxY21FVWtTckV3M2xzVlYweXhra2xZQnVjODROYUZuWnJFSlk1RUIyL2Q5dnBXRldkcFhPdWhUbHkySzhGdTl0STVPWHlNTmp0VWVuYzMvQUpZZGtHN0lmRmJFNEVXbE15UkFiaDh2dFdQcDdPbHdHWUVqZGs0cVl5NW90bFZJY3NramJNMGEycnFaaTdZeVdOWTBkMGQ3a01RZSthdFR5azNnbVJUdEk3MVNZcVpHUlYyNUo3VnBSU01LcnNOc3RxSkpLaHprOXowcUpKa2lmNW15TTlLaGhOeGJ4eWprRGQzcHNWdktyZWVXNm5QWHBXc3JXTVl6T3cwQnJhQk5xRTdtSEFJNUJybk5lQmkxSjJMY0Jza1Z1YUpIUExIR0VQR3prbnFLdzlUaldUVjJPZHczY2oycmtvUi9mTm5WWGQ2S0wxbkdndFZ1R2JISFEvblQ3WHh4NGk4S2FnTHp3OXE4MXM0R0E4YkhPUHBUN09XMm5oSWJCQ0hDajByR3ZvNURxRGd0a0E0QVBOYlUwbk4zTUtpYzRKSXNheHFtcmVLN2lUV3RjdjViaWVVbmRMTTJTYXliS3hiKzA0eXZQemorZGE5NGpXMm41UlFCdDZWQm9LTE5ld0FqbHBPRlBjMXNwMmk3R1RvSlZJeFowTTd1MGhWeGdMSHhXWE5HWkxTUmlRQ2NsY1ZxK0pUSlpGMDhrZ3RId1Q2WXJIRXFQcHFKdTV3Y2s5NjVhSzV0VHV4Rmw3cGw2VXp0Y05oeDhwNzFaYnoydXQ4bUFNNEFBcWxwS3ZIZXlGUVFPYXVXMHl5elNNQjl3OGtpdTJTUFBwTmRUVWFCWGhWdzJTQm5HYXFhc29hSlpDbWNkT0t0MmJ4czBheGsvTU1QbWsxeDR4YUMyU1BrZDY1b3Q4NTExWXAwekpXNktUK1ltZHVPbFRxYldkakpBTVM5eFVVc01kcXBlNDVEcjhvRlMrSFlNdVdZYzV5cHJwZHJYT0JYYnNYN1MzVTZyRjVuSlJRVG1zM3haY0dTOVlGTWJUZ1ZvNllWWFdwV2tiUEdPYXovQUJlZzh3eUowSis5V2ROL3ZVT3Evd0RaMldycFlWOE53emhldm9LcytCeTR1bll5Zkt5OEtUMU5aYTM0bThPeFdZR1NIUE5hWGh5WmJPTXo3TTVHTUN1aXNtNEhOaC9qdVp2aWxQSTFKa2RRQ1d6dEhwVm5UMmlpc3NuZ1l6bkZWUEVKTGFsNWFEY0dBSVk4a2ZXcmVtQ043TVJsTTVZRGtVTldnaTRPOVZzb0lXSmxCLzU2ZEt0dGNDMzB4bHpuTlEzQ0dIVUpRVHhuSUZNY2lXenczR1R3UFNudWlka1hMZUNPNXRWa2NBZ2p2NjB1djIwVWVueUZjWkNyaXBOTmkyMkNrajV1Z3B1c3dsOUxkaC9lWE9lMVpLWHZtanAvdTdsRFE0RUxibFhCeHlNVS93QVdNNXRRQ20wNDVKcDlnaHRTc2hVak9NNHAvak1LZFBqTVdDTnY1Vm9uKzhNMnJVbUo0Z2thZlQ0MUpMRkd3Y2pwN1VuZyt3bnVkUU4yc1o4dU1ja2V0WHAwODdRNUxjSUFXbjNGaU90WkdoWFYzYmFpMXZEY01nWjhIbmdtc3FFcjA5RFhGcHhxbllSWE52SjRyaWtEcjg5dU9RT2gvcFZieDVwdHpIbzF4ZXh3T3NST0E0WGcxbktiM1Q5V2FTMU84aFFGWWpPQWEydGM4ZFE2WjRSZlNiaHhkeVRvUXlrY0owNlpyWnhia21qamhOUmpKTTh5dEF5aGxVNEJIeTFNcDhsT1IxNmdWSFp2RExjS29ZTHViR1NjQVpxN3IyaWF0b2QwdHZxTm04YlNJR2pabCtWMVBRZzk2NnRUblVreWpFQkxmSkU1QUJQZHVLMEx1M0MzSUtTS1ZYcVVOWnk3bXVWVWpvZTNXcnI3VkdHVWdFZEY5YVVsb1ZFYnFLSVlnVlBIZXEwUlFGVllaeHlQWTFadlY4dTNFTzBsanpraXFrWWNFQmoxSFdwanFpMDNjMGt0WnRXc1YweTFpM3l4bmNBbzVQMG8wL1M3KzBabzU0bWpLcjh5T01FbjhhcjZkcVZ6cG1wUlgxalA1Y2tEaGtjOU1nL3JXajRxOGVYL0FJcnZQdGx6YXhySnRBY3hjWlByeDNwU2pKNklLYmFxWFpud3Vvdnp0WE9PMVQzY3J0Yk5rOStsVnJKc1REQzVKOVRVbDB4VlpVUFk4NXJLVVdwSTY2Y3JwM0pMSnlMWlZBNzlhdktZMVZsUk1saDZWWDB1SlRwNW1rSDNUeFZtR2NLdTg0SHZYUE83WjEwOWpJMXBGRVhBNDlNVlIwdU10SUpjNDJ0Z2MxcjNrTFRwTEVZeVR6akFySjA1L0ptOHRobkw5aFhYVGQ2UnkxdEt5T25CQ0o1ZTNnakpJck91bWVLWWhEd2V0YWFOKzVWVEVRQ0I5N3RWTFZWV05jeGdNRDZkcTVZN25kVmZ1Q1FzRGJCMjZDb2xBTUxQbnFlQlR0SlBtL3U1ejhoOWFRdWpYaHQ0eHhuQTlLcDNUTWIzUXArWFQ4aGVyYzFYM2Z1dm1iSG9LdE1XRWJRRlJ3ZWdxdk5HZG05aGptbWlaS3lHK1g1aVpiZ3JWclNwTEVUckxxTnA1OGFqL1ZzMk1tb0hhSk1CRDFITk9YS0R6RUlCOUtlbzA5Q1NReFBjTTF0YWhBVytWUjBRZGhtcmRzenhqbGNxRHdEMnFwYWtlVVE3ZDg4K3RhU3hySEVpcWNGc2ZqV1ZSNkhSUVhNeWV6RWtrNE1nQUFxdjRpbUt6Z29veDcxWmxtOHBWRWE0L0RwVlc3SnVWRXNpWkM5dlNzYWFkN25UVWRvMkYwK2RRUXVjQSsrSzFwSVh0a1djZ2djWXdhd0VDRnd5a2hSK2ZyVjIyMUM4dUxkelBNVGpoUjJGVFVpcjNIU25wWXV0cTJvMjl5cnd6SEpHZGg1WDhqMXFrb0YxcXNsK2xqSEVlNGk0WFByU1JPeG5TUEkzYlNjbnZWancxTXMwazBqbE1BbklhcTFVQ1pSVXFnK3hTU1c3WjAvaEdUbW1YcXlSeVp6bmR5VFYvU3Jkbmt1M2hZRFltZHZjVm5Yc2plV2RwemcxbEJ2bU5aUjkwcFhzd2NDTnpuSHJVQ1FzYndQZzdRdFRYT3o3U2dYdXZJcXZCcWNTVHRLUUFBY2MxMks5amd1b3kxSE5kc2tqeHNtUWVnTlFpNFZINEFJNzhVNTVsdTVpeXg0QjZacU1XK0p6TDBDTU1nMVNTNmlsSzVkOHpkWnl5emxjTmdJcmRxeUoyUmVHWGoxclN2bE0wd0lZRGdBTFZlYlRjQUs3ZmdhcUxpak9VR3lLd2F3VXY5cmozRGI4b3JPdk1ST1dpVEdUd1BidFYxN081V0pqdDRWdXRWN21NR0ZGQ2M5K0syaEpYTUp4YUlMZVRaSnZia0RQR2ExTGFmU3JpRGJMQktHeHdRM0ZaWmlkTU1CbmpwNlZac1k1TnhPenIycXBXWms0WEdBNWR5aEFIdlRyY3BHU1pEemc4VlhrK1J5anJ6bjFwOXVRWmxWV3hrZ0ErbFZwWWlVRWtlai9BQWU4TDJ2aVh3YjR6amcxU0JMdit3dzluWXlQKzhtS01HYllQNHNEdFdEY2VJSXRUK0hHbjZPWkFKdFB1blVBam5ZVG44ZXRhT2phVXVpZkZDd2hSc1pFWll4TGdmTW5Jd004R3VWalZCUHFNU0xnZmJwQW85QUdQRkZ0R2MvMmtKRjVzOGdSQ2NBY25zS2pZeWVhMFlIT2ZTdFhTTEIxdG51VlFGUm5OVi9zNy9OS1krcHJrNTFkbm9xbTFGRlcyczducEd2QlBwVXNtaVhUa2JSalBYQXJRdHJxTzBIS0Fram5qdlQ0TlFWVjNTcGc1OUtoMVozME9pT0ZwTlhreXZhK0dGT3d1dzNlNHJSZUpvdE1PaXRFb1V6Q1E1OWZyVFRxeU1RcVJuZDJPT2xRM0YwalhBODVTcDNiVzNkVjlxaHpxU0xsR2xDTmtSRjRiSzV3c2VXeDNGV0lyL3l2M2dreG5xQWFxNmdSTGVGWWZtWG9Ob3ExYWFkYXF5UGZCaVBRVW5aSzdIU2pkM1E4M3NhREN3WkI2NUdLUTJmbXdmYUlYTVlZNEtpckVrUWtjcGIyL3dBdU1LcXJrbW54TVZ0eEE2YlNEd2hYQkgxeldYUDJPbU1FM3FHbDZXcUhCVm1HUG1KcGJzTDVBWVJENVdPRFZ2UTViaVMybWsyS1FNak9PYXJTdXh0eUJIazVPYXhpMjV1NXZLSzVWWWlzMmFXYjkwZGg2bm1yOE50STBEeTR3Q09HcXQ0ZkNTWEx1VTZMeVBTcGJXWU5HOXM1WVlmS2lwcXB0bXRCcElaZnJKRnAySkNTTUhxZW4wcWpwRGdrN0RuUFhOV2RTdUFGRW9iNVNDQXBxbllGWUlkeFlZSjVBcTRMOTJjK0lmN3hGMlVwRXpwSVBtYjduRlZsUXBMNXNpakFYSnFkNXg1cXhpTWxqd005czFZU0d4Z25iKzBGZGpHTXRHbzRQdG10S1NPU3E3dXhnaDN1TGd4eG5BTGRQVG10QkxTMXM5b0xBNUhRMDIwbXRwNXBMaUcxV05XWTRVYzRxcGN5bGRVUlVQQmJIV3QzWm95am85VGZhOCt6MlVjTVdVeWZtWWVsWTkzSmJ3VGJ3cCtiK0ltdFBVWUZpaVZqSXBHQmdLYXg5YWxXU0JSR2h6bnJpc3FLVnpvcnRxTmlhd2FXR1RDSGduSjlBS2d1WlcrMHU0NUJQVTFKYXp4cGFJVmwrY2RRZWVLYmF3dGNURkpDQnVmZ05WL0MyVERaRnpWMTNhZkdvSDNrNXF2b3JDMzFXMlJWNGo1M0RzYWY0anVudDdtS0pBTmlvQmoxcE5CVjdpOCswSmpDS1NSU3RhbXlycDExNUYzeEJxelhkOElYZkxkQmtZSFdxYzBEckFBQnpHVHU1NHhSZmFhbjJuKzFVMUNOMVp1STg0STlxZEpJcHMzRHR6dDdqbWlFVkZLeG5WcU9kUnN5N2E3SDJoZ1IzNjRwOWk1amh1SnhnWmt4eWFxMlhFalNPZTU2MWVpdDNTSGN4Qmpkc3F1ZXRkRW1ySFBDN2QwWDdlWUxDanE0UEgzUlZlN3VHbHVNYzQ3QTBta3lNTGhvbFFkT0NLVFUyQlU5QWM4Y1Z6eGo3eHZLZDRGYlVta25Vc2d5RjY4OUt1YUxNRnNmTzdqcVFPbkZWSW9COWpZNVBJNkdyRmpHUDdJbDJuQUZidTNLY3lYdlhMV2dFN3BMeTVjRWxzS1NhcmVNOXBVS29xeHBsaTkzYXgycjNIbEt6WkxacWw0anR6YnpHMjgzekFvNFkvU3BncjFFT3RwUnNVTk9VcmFzV09NSEtnMXRhVVpSWkpJdk9IeHRGWXNUdWJmWnR4anVCVzdvYXVsb0JHdnpFNUFQZXVpcnFqbnczVXpkZW44dlU0OWc2RHZXalp5UjVTYUlBZ0psZ0Izcko4UW1SdFpDa2dEMEZhMWlvdG9lMkN2VE5LUzkxQ3AzOW95dGN0RmNUZmFXNHdweitWUVBHME9sK2JuZ3VRUHBVc2FzWG1PMzVRS1hVV0NlSG9saVhscE9lS1NlbGlwR25wTHhEUndwR1NEbjZVN3hQYnhXdmh4YnV6bVZoTXdCWHV0UmFVdTNUOGlVSmhPaEZNdW8vT3NRb1lrQnVjMWd2NGx6b2QvWjJHUXdHUzFSbnhrTHdLcitJVkVtbWhlY2djVlpTNVNTMjhtTWdNZzVxdHJ0MUcra3J0WUhuQk5hUmJkUXpta3FaYzFlWmJiUXQ2Ti9GV1Bvc1F1Slh2cEhBS0VZQjR5YzFhOFJOSU5HUmczM3BmV3NqVHBjM3NTSXhBVnhrQVVzTkQ5MFRqcGZ2VHNkUG5hMzFUejVZc29DQTNITlVmaVcxdmRzczlvZ1VOSHo3OGVsYmw1RnBObk1jWDZtUzVDN1lpTUVFai9HdGo0aGVDOUMwVHdwRmI2ckU3M3p3aC9NWGtMbkdLMmxQa2FPS0VmYUtSNG1zSnlXWjhET01HdTQ4UDhBanFMVVBEYStCL0hGdUxtMVFFMk4xZ2VkYW4yUDhROXE1Z1dhcGF0Y01tQWsyTW1uWE1TSk9oaE9jZ1lJcnFidWNVZEdOdWJhTzJ1bkVjaGNodmxiMVdyTzM5MnV6bmpqaXE4NlNKTUFlL2VyaUNObFdOR3lSMTlxaWI5MDZvTXE2aThoalV5NEo5QlZVTEVZeVdQT09QYXJlcThuT2MrMVVjakp4M3FZM0c5eVNRQVJxRTVXcTdOaGlVL0NwOXJMQUFUOWFna0dHd2VCV3BvaTNwbVRJckE0TzZybXRLbS9FYWdoc1pJcWhwc2lyR3VUenU3VmNtWm41TFp3Mk1WelZGYVp2VGVnOUpCSFlpSm1PT3ZXcldtc2hpd3k3c25uaXMyNkRoVkhyMkZhV2w3UmFrTGduMHJHZHVXNTEwbTVTc0w5dGswbTVrbWl3Zk1VcmtqT0Fhd0lJc1haVURuZm5OYnVweHVzUWJ5OFo3Q3N5endMdjVrQjU0clNtL2NNNjBWN1JHdnFVMjBJSVhQM0FDT2Fyek1wc2lkM0pQM1RUNXlodFR4ZzU0SjlLaWtrait6SExqUGFzVXRUV1RkN0VGbEtJNGl4WURKNUZOU1pFdkJJckRCTk10NVl4YnNHUTUzZE1WQ2pSajk2QjM2VnVrcnN5YnV6VGpqYVNWM1h2MEZWYm5mRnczWFBUMHE5cEVVSm0rMVNuY0FQdTFWdm1VM0RFSWVTY0E5cXpUMXNhU2kxRWFzcUNJYm9SbnNha2pVT0ErT282VkVvRWpGQVFNYzgxYUN3aTF6dXlRTUNoamhHNUNBQ2RpK3Rhc2d4REVxY2tEcldPcVA5bWU0RERBUEk5S3ZSVHA1TVMrWnpqMXFLaTBOcU0rUjJSZnZBR3RWYlpqQXFnbDQ2cUlBT0R4eFYyNWNMYWc1M0RGWjBTNFpabTZiNmlHeFZXVHVURFlCa2ZRaXJkakVGaUo5K2hxdXNhbk13SXh1NzFkdHA3VkxSeTdqSjRXc3FtMmhwVGR0U25jdG01UjFKVWRPdEdqU2ZZcDVOdklJSUJ6VU9vWG1aUXFERzBZelV1a0JDelNER1IyTlhxcVpQTjc1TmEzVnk2ekJKR1hjQ01nOXFnTnZlczNsK2NldmYrZFc3ZDQvTmN4cndBU1JpcXM5OU10MEo0bHh0endLbUYzSVZUbldxWlBZMmNONHl3d3pocGxPQ005U2UzdjFyRTFiUTlTMDNWSDB5NkJqY09OeEk2QTFxYWZQRzExNXNhRmRyN2p0N2ZqWFRlSi9IUGhHOGhodXJQd0wvQU1UQ05WRWwxSk9TR0lIWEZkZE5xTFBPeEh0WlBRNFdheXVOTWRmSnVIY0VBbmN1S2Y1dDBzWkVpWUxrSElxeHJXcXRxVTRtdUlSR1c3QWNDcGdrTFNSSjMyZFNLYzV4S3BVNXBhc3o1YndsQXJxUWM4SFBOU3dYQ3RuRGs4Y2JqUmZXWWVjN1JqMnhWUVF5SWpRZ2NBOWNVa295UnQ3eVpweE1odEdEdVBtUDNjMW5YRElzcDI5QnhTb3Jrb21TT004OFZCTElFbUpQclZSalprVkhjRkFZbDF5TW5nVkpGSVZrTE53Y2NWR3NpcjhvUDVDbk16U0RnamdaSnBtV2hBL3p1UVJrODVOS2tES1BOVEsrOUlTeGNEWm5uMHJZOFA2UmRhdmNCWUVpTWFZTE01QTJpcnZaRU9LZWhyK0dMOUkvSDFyTEtoZnl5bzNiZWM3T2E1Z2Y2eVc1UnNDYStsNmZVMTBmaDVyZTg4WTcxZmFHbFlBZzhEQzQ3MWdOQ1k5SWpZYzR2SnNuMTVxNE84V2NzMXkxRWFtaDNNaDAyU0ZYT0Q3MUQveXhWdDVCRGNEdGlwUEM4UmxzNUZVOERzZnBVaGkvY2JuQTY4VndTZHBzOWVLY3Fhc1ZzeUZnR1BKeGluU2htWmlBQU9wcVpMYUI0c2duUDBxWmJBUjIvd0JwYmN4SStZZ2ZkRlMyaldNZE5RdEdXTzBaM1lLNFlGR3h5TWRLUythYlViaiswYjF3MGs4bTVpTUFaeDZDbERXdDFhbzBjMkRHK0N2YzB5WUFLUUJ4MjlxTDZoS0traDdFUXpySmFxQU1jakhGU3dtV1NiOTZNY1pBcUNLS1JOb2xZTnh3YzFjbVlOaVVNQjh1T2FVbWpTSHducFA3TWlhRGMvRThMcnp4Qkl0TWxhSnBBQ0E0R1FlZU0xZy9IelV2RDE3OFhkVms4TlNSRzFsWkNyd05sUzJCbkg0MTFIN1BId0J1L2lsYjNlcnk2c2JXSkVNY1JpNVptUDhBU3NYeFQ4THZEdmhPVzU4TGE1SExEcXRxN0dDNElPMllaR0NPU0R4eDE3Vmx5eHUyY3lxeTlza2MzNGNqSzZIY1NOMlkvWHZWRndJNG1aV3dDVGpCNlZkMHlVMituM1ZwakRlWWMrMVoxeTBjTnNKTS9OdjZWenh1NXM5YWZ3SWRvbm5hZThyeUljT3ZIMHArbnl0OXVZbGVHejI2Q2x0cjFMbTJZeEVBeHI4eXQrRlJXVnptYmNqcmt0OHd4MHJSM2Q3a3hleUc2dVZoalNJRHN4emlxQW5DVzZpTWc1clUxcU8yY3dxR3o4bURXTkNqTTRUT01OK0hXdEthVGdZWWo0aTllb3l5TExGTnlJZ2NaNzAyNzFXU1JRbWVURmd0Ni80MG1xQXdxb1U4bkZWcDR5eUIraEM5SzJocWprbXJPNUpvN21HS1NXVG9POVU3YTd0N25WRE80eXFuN3A2MVkwd3lmWnBFZmpQK2Y2MW5XTm00MUJvbGt4ODJNMW9rbW5jenUrZEhUejNGak5DUEtYRDR6VkM4YjkxdFlad2VjMHNjSzJwS1BLR1BiRk12U0ZnSkhROXE1NFJ0TFE2YXQyaW45eWNzdVNPMkswcmVFUlNLL2JBNzlLcTJjY2M2N0c3SGlyVVNzMHF4bGpnVmRYWWlrVXZFakNSd1VmUEhRVmQ4Snd1bG5MTnVPM2IyTlVQRUNnWHBRREFDOU8xYkhoSllocDBqczVISEhQQW9ucFFRNmZ2WWd5ZFNaNHdwRzVjT2VLbVM0VnJmYUNEOHVBZlNya2g4TzNPa1QyMnBhUFA5c0VwTVYzRGNZSDBLOUt5UkcxdkNFSEdlT2UvRmFSU2NUQ2QxSmtVS1I0TWl0a2J1ZmFyMGNjMGVtbVhKK1YrQm50VmFOWGd0bVF4NHljbGU5WEpaZ21rQ0pRY3YyTkV0eFF2RkMrSG9YY1BjcWVOd0dQclZmV1daZFdhQlQzSFBhcmVqSzhOdDVnSklEWk5aK29Na3VvR1JEa0gwcExXWTZta1VTM01oUzFFS3J5UmpwVTJseHM5aExoamowUGFxMXlVTVlRL3lxN283b2x0THZZQXQ5MFZiMnNZcVQ1aWFVdEJwOFRxU01kUm1zN1hKdk1aR0RkVjZWYnZaNUZLVzNIQzVBck0xSVNzR2RVT0VIekgwb2d0YmhXYlVCYlNQRVJrd01aNmVsYjl2S3JXY1pDbFJqcU91YXhyUlZiVC9BRFNRQzNTdHFOWlliQ0NDSndTZXB4MnE2akZobHBjNSs5Z1diVmNGaVFUempuRlhtS3BaRjBQekljQTFSdVpqRHJMcUV3QWNWZXQ1VWtoZFNjZWdweVRzaUl0YzdSWHQ3bGpGa3RuZWVncTlxQ0U2VEJFc2VDV3pnMVZ0cmVKQVdiNVczWkJxemQzVFR6dzJrakxrWXhnZDZUSGErNU5HVGIycW9RZDJPdE4xR2I3SHBpQk1mTytPYTBOWnMwdExGR0hMRlJuaXNYWFpHYlQ0UVNlRzZnVmxEVm1zNVdWaVMxaUt4bVJtSjM4VlExc0tpTEFtY0E1NU5hMW1naTBtT2VRWkxIZzFpYTFJV3VzRGdlbGF3UzV6S28vM1paMXVhVjdHS0hQQWt6aXFXaENNYXZHNS92ZzlQZXJXdFRJTEhBSE9haDA4d0pld3orVWZsQzVIdm1xb0w5MFRqTlpuUy9FT1pMZnhYcDl6Q0FjSkdTYTlGK00xdzEvNGIwKzd0eVpubWpVS3FxU1NjZHZXdUcrTVRlRlp0TTB2VU5LdDdpM3VSYmhaMWs1VnZjVjZUOEdkRHZMandScG5pYnhGQVhYekNMS1IxM0FnRG5wMHFNWkpRcHhuMk1NREhubktKNERyTjZxNmVOTldQWTRuSmtCWEdDTzFVNGJwVjI3endBT3ByYStJdHZieWVNYjJTSWJZM3VYaytnSjRyREdteHNobWh1UXdIT01jaXV5TDVvSm5MS0NoSm9uam1VM2lrc0RrNXpucFZ5UEFuWXFPdnBUTEhROVFuZ0VzRnJ1VTlQbkdhc3hXNlJEYklDckx4dE5STmxVOVdVTlFqQlJpRDFOWjVDakFRNHhXcmRBUHVBNE9LeThsSkN1M3AxT0t1bnFqWXNXNnQ1Wkt0dVBZRTB0MTlobGhTTzN0R1NSZjlZN1BrSDZDbVd5dGtvcHdEMXBzb0VFdTFXNjFYVWEzSk5LdFZhN0NzZUJWeWROc3pFSCtMaXM2QzVXMm0zTTMvd0JlckIxQ0s0aTNic0ZmWHZXRlNMY2paU2lpMWN4a3hSTmpuQnF6b3dERXF6NDlLenplTExHZ0xBRkQwTlh2RDBsdTZ5K1pNcGNENUFUWFBPTFViTTZhRWx6ajlTZDhGRWJqT0JXVmFzcVhoUHZnOFZwM1FtbGZLcmdnYzFsb2RzNyttVFZVMTdwVmI0MGFGeXBNSW1Wc0FucFZlN3dJUnRUSHFSVTg3RVdFWUhkL3pxQzlJVzJ3b3lDMVRIY2MrNVdpSit6dUFPaDYxWE11MERJNzFkMEdTeFYyYStCTWZ0NjFVdnpDdHl3Z1RDRS9MMzRyb1h4TkdEZGpUMHFZam9UMDQ5S2JlYlhtSjZFbnNLbTBCN0JaN2VHL2N4eE80OHlRRGtDb1BFQzJrR295UjJFcGtnVjhSdjZpc2JlK2RGU2JkTWhYOTNMaG1IUFQzcTNQSm0xd1l3cHgxRlVaMStaWC9yVXhjU3dqQkl4M05VMGdvdjNkU3hwM2xUNmZKRXpBTVcrVUdyQ1daT3hTNmpnQVk2Vm5XUmRKT3VEbXRTTlZZQmxiN281eldWUjJacFMxWk5jdUk0QkNGeU1jbW9JR3piQUJRUUc1elQ5UW1XSzBVdDNIZnJWYUs1LzBWZ2VoNllxSXJRdXB1V0lHa1ppb1ZDdm9hZXdSR0JLWVB0V2JhWFlqRG80UEk0OXFzUVhlOUdXTmMrdWUxS1VDWXpRWEVIbVhCS25BN2cxTmFtRzFqZmFlZWVmU3F6eWVVUklXNEk3MXRlQXROOEs2bmYzTCtMdFRuaGhLWWdXMlhMRW52Vnhoekt6SXJWNDBsekdmb2Q3NWw3SWpkZHB3S2RLTXV3Wk1GaWNEMnArcjZQcDNoL1U1Sk5Fdlo3aTFjOFNUUWxDUFkvblRidTRDd3JmQWdiaHRBT1B6b25EbGxvRkxFcXJEbUliUC9RN3Nob3ZrYjFIU2hIUXl1WGJJeVFveFVWcTMyaWNMTkx3ZSthbTJKOXFNY1M1QTlCVGVoVWVWak5Yc1U4Mk5rQTVYb08xUUM1bSsxckVaTm9RWTNlbFhMa2lhWkdMYmNFQUFuaXE4cWY2VS93Qzc0QjVOSk80NVFhZDBQY3hsc0NmY1Q2MHhjeHlsbGlEQlQ4M3RVVjVGSGdOYnNRMUxhWEdTWVhrNnFlbzcxYVdoTjliRjZUVE5SdXJIKzA3ZlRKR2hUaHBWWElYMXJFdVlrM2Ixa0J5YzRQYXUrMHY0a2FYb253d2s4SngySisyeVRPWGtLakcwOUs0UXI1dUc3MFFidVRPS1pYWUR5U0N1Q3ZVbW5Xc3F3d2tzcEpac2ZoVXh0ZDF1MGpkMnlCbW0yNm9JaXJESUdjY2Q2MnVySFBLTm1RRmxDdGhjNDV6aXBiZWFTSlBNV1lxRzZoV3hVcjJkbXVsZVlaRDlwTW5DSCs3VmVHRU9NQmhuSE9hTkxFMmJaMFhnYTBpbjFkdk80V0cya2xja2NBQlRWSzJXR1B3U3JPUnZrbWtZWjYvZXJjOEkyOHllQS9FL2lPMGlqTWx0cDhVVGJqOHlvekFNMzVWenR3UmQrRnROTVM3ZGliV3llcHljbkZYVFQ1V2NkYldwWTBQQnlZUno3ZFB3cXhKQXZtRlFlTW44S2Q0UmpqZ3N6NTZFdGo4cVdOVWZ6bjM4S1RnWjZWNWxSM3FNOTZqRnFqRVczdG9oREpDU0N5OGdpdlN0RjBLMzhFZkR5UFY5YTA1SmY3UmhaanVVRWhjY1lyeTZ6dUhFRW1FWWs4QWpOZHJjL0ZIKzJQaDdGNFQxcUV0Y1dzVFJ3TUJ3VlBTazA3aXFLVFdod2trTWF5cGMyNllXVjJZTG5welY3VXZKOHRDc1BCSEpIZXFEZmFJL0xobTZJdkNpcjB4WjlPV1J6bmJUbnVYUWo3alRLWWVSYmdJQVQ2QUdwNWJaN2lRTmdnLzNmU3E5aGNOL2FTYjE2bkdNVnRhZGNMSGNTS0VYR2NFRVp4U2s3RGhCSnN2K0YvaUo0MytIMWl5K0Y5Ym50U3h5VEd4L2thdWVJdmluNDY4ZFIyVTNpclUwdUd0QWZMbEVJRGtIMVBlcHZESGhmVHRSVWp4QmJYRExPbWJRMjNHQ1NNRThkS3hkZTBUVXZEVjhSZDJFc2NETVJFN3JnRWR2cldUcUsvTDFNNFFnNTgxaU15TTdYQWRDQTR6eDYxVXZSRWJjUkNMQlVaQk5XNFJFcW1VU2JpM1Avd0JhcUdyVFJoOHlmTGs4WXFhZngyTzZkdVM1QnArVXVwVHlRYzhqcDlLWFNwVUZ5MFlJSDQweTAxQ0sxMEc3MDlvQXp6U0tZcHU2WXFMUnRzSU8vTE1UMS9HdXVWTk9MT2FuVTk1STBOVWsyRUtGRDg4RWRxcHdSR1F5WXhsUm5QSEZObmxPSEJMQWc4SDBwdW5RenhobmliaHUrYW1FVW9EcTNsTWx1VTgxRUR2eU81cUsvZGtnS2JSeW9HYVcvbWEzVlZPUGVvYnlRUGI4bnFPcHJTQzBPV2Ixc0xiVEZvbXgvY0pKcXZwUGxqVWZOVUVqUDlhU3prS1FPV2ZQR09POVRhR24ra2grMjdKQXFtbkdMTTRQbW1yR2xjK1NoNkFaN0VjaWsxUytXNnRJbG10WW9saUdBMFk1YjYxSmVSeFhWNUpjVytkb0hjVmxYMTJrWjI1NFBTc3FVYnMycnZsUlpzMFNSbFJEM0hJcTFMR1lMakNOeGowckswK2JZRENKQ0J1NitsYWRnY1RqY2Q0UGYwb3JLekZRMVJtYTNoWjkyZU1mZE5hbmhZdWJaaW8vRE5aZmlHUHpOUTJxMkJuajJyUjBCemFXN0k4b0h5bkxZNzRwenQ3RkNwU3RYYkM2VklyTHppM3pTU01RUHBXWmZ6U0dOQUFPUGFwOVVueEZEQ3BPY0h0Nm1vYndSRFRrVWpMRDlLMHA3SXlxYnN0eFhLM1ZtaGMvT3ZmdFJMOW9NUWpLY0VkY1ZXMDVTOWtRZ3p6V3JjeG55SWxQQkErdWFtbzdTSEZjMFNiVEJCRHBUTklldkJIZXNKb2RoZVJYemxzcUsyTHFSYlN4SUM0M0RKRlkxdHV2SkdqUEd3NUZPa25xek92UFpGa2Y2b1NGQnluTlNhYXFzaDNER0QxeHdLaFpuTVhsanAwTlh0T3QwYlR3MjMrTDVxdHN6aHpPUXJDM2t1c3UzSVhnazFUMUJKNDRYQVRodU4yS3RJNGFaM2tYNVF2QkE2Vm1hdHFUeXl4Mk1iNEFhaUN1eTYxbEFrV05vYkZFWWQrUWE2SFM0b3J1U0tKbis2dWV0YzNleU9GUkkzNEJIRmRGYmlPeVpjSWNsQWNEMTQ2MHF5MDBIaDlqbXRiUUpyZHh0T0FHUGFyV2dYS2xtODNCejBKRlE2OWF5Q1dXZDJHV1kvaFROSmJ5NFZHY0gxcmQ2MDBjcjByTTBIV1A3VnRZaFFYR1BhcElMZExqVzhqa0llbzdVKzh0RWllT1pBRGxCK2RMb1lCMVY1TVkrWElGWXY0VGRheVJyYS9jTDloOHRsQndPdFlPdUdQK3pZSklnQ2Q0eUtzNnhKTk14K2ZqUFROVTcyUWkxV0p1M3QxcWFld1R2YzA3UlBNMFJUeHRVZzdUMnJudFkyeVhPNWZ6cm85Tk1IOWdsQzR6dDdtdWR2NDFhNDh3SGc1QUZhMHY0aEZScFV5WHhERUxmVGtZZEdib2FnME5CY2FqR2g3bGNDcmZqQjFhMGhVSGxUVlRTWGppMVNHT0ZzRTdSbjhSVlVQNFFzWjhaMy94ejBTR3g4TDZaZHFCa3J3ZndyMXpUcmkrMEg5bVh3ZnFla1cvbkQ3Wm1aTnBJSXdTYytsZU9mRzJSMDhPYWJiUE16RllzL01mYi82MVdmQ0h4dThWNlA0SjBid2NKbzVMSXp5cHNtVUVBTWhBT2ZVWnFjWFFkYW5GTHVjdUNxK3psSm5KZkdueEJaK0pmRzE3cSttYWZIYVFTRlVTM2g2RGFPdjQxenRsSTBjSVFENXM1UEZTYTdaeXhhbkk4ay9tWWtQT09ldEZqREZkM1A3Mlh5enN6OVRYVkdLaEJJNXBOem0yT2ptbWp1Zk5TUms5d2VocTJseThwRHlIY3hIek42bXMvd0F4MUpSaHhua1ZhdDVWV01xRHhuamlwbnNhVTlHUVhSY0JwVmJIUFNxRERxNWtPZXdxN2R1TnBWajFyT01tMXlWOWFkTFkyTE5wY2JVeElNZW5GTVNTQjVIODkyQUFPemFNbk5NUjhqY3hvWmxHU09LZjJnSUdaeTRFblhzYXZQcDhrRm9Ma2tjOUIrRlUyQzc5eDY1clVta1NhemlXUHF2VVpwelpMMEswZHZJOXYwT1FlcEZYTkZ0bzh5eVRNd0tEZ2c5S3ZRWGtaMHY3TExBbWR2RFlxS3dWVkV4ejI2MXpUazNGblhRVjVvbEpKVExQempPZnlyS2FObG1jam9UeFY5SkVSaUg1QTZEMHFvN0tabUk5ZWhxWWFJNmF1clJPOHJQQkd1T0Fmd292V1VXL1hqUGVwR0lSRUNIQTI4MHk2aUwycFl0bjJJNlZLMVpVdmhabVJIYkdja2pEY1lxSzZkZ1EyY2pOV3JRMjN6eHpBODlENlZWdVljTndlaDZWMVIrSTVKZVJldEppNFFTYy9oVHRSWUU0STlOdkZOczBSWkl5UFVaelUzaUdOVnVzZ1l5S3grMmRFdmdLdzh4Z0NUbXBWWmhBZlFVaUlSRHV5YzRGUFFadFN4Nit0RFkwOUJ5SGNpa0tSanJ4V2xaSmJ2c0x5WUo3VlJ0aG1MYzU1cDBOd1lwdW5ROEdzS2ljdGphTDVTMTRpZ2FMQlhsU09NOXFwV3lwOW5MYmpuMHEzcXQzNTlxbnpIZ2VsVVlKU29LL3JSQy9KWWljdmVFaElFK2FTVzRtaGxaSWsrWHJ5S1FETXgybnFldFBlRVJSbWNTRmoweFd1bDlUTzdzU2FmWlh1cUVsYm1CVkI1Vm1yZCtIOThkRjhZV3NkN3AxbGV4UnlBeVcxM0Z2aVllNHJsZHB0UUpJV3h1OURXejRGdkVUeEJHWm03OE4zclhsVFdoeFYwK1YzUFNmamRxM2c3eE5Zd1gzaGp3VnB1Z3lRdUZ1RjB3dnRseUIxREU0eFhtR3BxeHRoQ1h5QjkzMk5kcDhUWjRyWFF2TWhBWHpib0FEUG9LNGlTUVRSYnBHN1ZsS3lralhCSk9pMFZ0UGtrV1lvN0hJSFVtcGx2SmJTNDN4OC9YNjFCR3hFcDI4WTcxTkJFWjdsSXBDb0RIQWMvMW9sWm5UQk5hRnlUVXJhY0lYQkQ1OUtFZDQ3cVFTREt5THhrOUtvM0tHQzRNYnFNbzJLdVhNOFpqWGFlZzVQcFdiU1IxUm0wck1oV1ZUS3lTcmdacUV4bEEwc2JjQnVLWVpRSlN4UEgxcVcxWldVb2VtN3BWYkdLZDVCZHJtM1VxU2VQeXB0dDVZc1haeU1nOFZjMWxyYjdNaVFxQVFLb3JBZnM0SVAzanpSRjNpT2FzeDhxaG9FQ3NSeDkwVXV3VzF1c2dYSkpwSm1DNFFBY0FWUHZzNDdWZk9Vc1QyempGTzVrMFJtMG52SmtTTEdXT01WWXVkSkdsS1V1RkNsaDFxdExQYnJHR3RXZFdIVG5wVm5UMWt2MTMzazdQdDRHNDBPNFJzOUNid2RmTloySGlLeWJQbFRhSEloVmdTUHZqQnEvZCtGa1B3cTBqeEJhTjh6TThjNkFjOE1meXJKOE5pU2ZSL0VjUnh1aXNjZzQ1QTM4MTZGcEY1NGZ0UDJiYk96dm1RM1YzZk1scXZHYzV6bjZWMVBTbWVSVXVxL3dBekZ0ZFAvcy9TRWtPT1V6NzlLeDlQVVR3elNrRWZNZUs2TFZ2SnNsaXRVYklXRUJzL1N1Y3M3Z3htU0ZBQnVKSnJ4WXl1MmZXYWV6aWhiV2MyckdKZnV2N1VGMVNWNUc3RE5WeEk5dk9KRVJYQU9BclVrek94a2tkdVdYa0N0VWhOKzdZWmRYRE82dmpJSTRBcTZaSEducSs3QXp5dFowRHRzVmM1d2VocS9LZDF0ejJHYWN6T21pR3lPTDFHWk1ZYkk5cTdYNFErSDRkYzhmV2o2MUNQc2t0eUYrWURCT1JqTmNWcGhmN1N5eUhKQzVCcnUvZzllaSsxQ1hRWlpka3ZsbVMzZFRqREtBZjZWTTlFWVZKTlhQWk5SOE82WllmR2dhRFlXeWlBV1N2QUFtQWpZeWNBazQ3OFZ4bjdTOTVDZGNzL0R0ckVvOHY1bWpVZHljQVYxY25pbEcrSzJtWGFFYld0VlJ6NlpRNUg1L2xXWnJ2aTN3SHBIaVhVUEdQaWJRWk5TMWFLNDJXTnMzRVNJdkFZK3ZPT0s4bW8zOWFUOGpmQ3g1OE0wKzU1TDRrOExYL2hYVmJlMnViY29MaUVPcXQySCtOYzk0aGlKbkNrNTY0UFRGYnZ4RCtJK3VlT1BGUTFyV0ZqVHpBQkhIR1BsaVVkcTVlNjFCNUdrQStaVElSazljVjYxQ2xLeWt6T2RSS0xpUldxN0FZNVUzQU54VmxCSkhkeEpDNFZaRDB4VkpaQkRJQ2pFODg1cTQ4NnJkUUdQZ1Z2TzVGSnE5eDk4bmtMTmpEWjdZcGxsTjVkazRhVEI4eFNLa3YyeGJNRnhsanlLclJCVEdmVWdWbkgrR2RFdjRwRnFrNWFYZDYrdE4xSkhXeEQ1SEk3VWEvdGpkRlFEQVVWSzFzMXpER2hmR2NkZTFid3NvcG5CSjNxU1JuV2wyaDB0b0c0SWIwcTdvY3pJd2NNQm4xcDEvWjJTV3BoV3hWSFFjeXEzM2p4MnBvOHUzamkycU9RTTFWU3ppWjRhOFphbXZOY3RER1oySSticUIzckIxRXh5U2ljTHQyc0ZLKzlibDBzY2xpbUJqSElyRXZFd3h6MTNWbFJkbWI0aHVTSklZMWpnYVhPT2VocS9wTWgzSytmbEhhcUJiZkdFUE5YdEpqZU4ya01nMkJlbnJVMVZkRHBhR2Ryc2tuMjF2VE9jVnFXRENXeWpjcGpzYXg5WGRaYnp6b1FWeDFCclEwdTZhMnQxNXlHUElOWE5mdWtaUWQ2ckp0Y2dTUlk4WTlCZ1ZRMXd0YlJSd1p5U3RYZFhrVHpvL0xHQWNjVlU4UXhyNUVaSHAxcWFUczBoVld0YkVtbDVXMEQ3c0R1S3YzTWhNU0VOdDQ3aXNqVEpwQkZobjZkSzBiaTZBc2tVbjVxSnI5NGFRZDZZM1ZDcndvREpuQTZaclAwNlZJWjJJY2NqR1RWaStsNENxZjRSbXMrTWo3UUFCM3JvcHBjcHhWMzd5TkxHSTh0OHB6Mzcxb1dyK1RwTG5JNHljZmhXZmZBQzBWcWRMZUdMVGdpdHl3OWF6a3RUZUR0RXVhTnNtMHQzbTd0d0NlYTV5NmlWOWVESzNSK2xiY1JlTFRGMnVWNXljVmdzekhVODlEdTZpcnA5VEtzN3dSZm5aemZDTXQxSTQ5SzZIeExKZTZLSUh1TE9aSW5pR3lSb3lGWWV4TllhMnd1Ym1PSlRndTRHZlFWN0g0YitPSDlvK0RKUGhqOFJ0S3RyL1RsVHliT1o0Z0pJUjBCemp0ays5SjJiVnlJeW5DbjdwNHZjNmt0N090dkNDQXh5MjRjMUpiSUVrQzl2U2wxdlEzOE8rSTVkTitYeXhsb0pSeVdRbmo4YVlvQ3lEYTFiVFZvNkdVWEtUdTl5NWRYVHJkSkZGSndRQVFlZ3E3WlJTd1hHN0dNanJXUEdSTGZ5eUhvcTVyb2RMbGhsbFlPYzdWR00vU3VlYXRFNmFUMUtPcHpwYlNaZHVEVkc1Y05aN2kyY0RuUFdvdGNtY2FneXNlQStBS2RNVlczQVVBQXBnMVVZV2dtVEtmTk54TkxUM0g5a0tjNEREaXN6VlE4VFI3SHlEbkpxV0NiL1JJMEE2RHBtb3RhWlZTTEpHTS9uVlUxYW9SUFNtZi8yUT09Ii8+PC9zdmc+";

function LitSenseWelcome({ onEnter }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  const serif = '"Cormorant Garamond", "Playfair Display", Georgia, serif';
  const cinzel = '"Cinzel", "Cormorant Garamond", serif';

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0906",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: serif,
      position: "relative",
      overflow: "hidden",
      padding: "2rem",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Cinzel:wght@400;500&display=swap');
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes keyholeRay {
          0%, 100% { opacity: 0.55; transform: translate(-50%, -50%) scale(1); }
          50%       { opacity: 1;    transform: translate(-50%, -50%) scale(1.18); }
        }
        @keyframes keyholeRayOuter {
          0%, 100% { opacity: 0.2; transform: translate(-50%, -50%) scale(1); }
          50%       { opacity: 0.45; transform: translate(-50%, -50%) scale(1.25); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .ls-enter-btn {
          background: transparent;
          border: 1px solid rgba(210,170,80,0.7);
          color: rgba(240,210,120,1);
          font-family: "Cinzel", serif;
          font-size: 0.85rem;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          padding: 0.9rem 3rem;
          cursor: pointer;
          transition: all 0.4s ease;
          position: relative;
          overflow: hidden;
        }
        .ls-enter-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(210,170,80,0.1), transparent);
          background-size: 200% 100%;
          animation: shimmer 2.5s infinite;
        }
        .ls-enter-btn:hover {
          border-color: rgba(240,210,120,1);
          color: rgba(255,230,140,1);
          box-shadow: 0 0 40px rgba(210,170,80,0.2), inset 0 0 30px rgba(210,170,80,0.07);
          transform: translateY(-1px);
        }
        .ls-enter-btn:active { transform: scale(0.98); }
      `}</style>

      <div style={{ position:"absolute", top:"2rem", left:0, right:0,
        display:"flex", justifyContent:"center",
        opacity: visible ? 1 : 0, transition:"opacity 1s ease 0.2s" }}>
        <span style={{ fontFamily:cinzel, fontSize:"0.7rem", letterSpacing:"0.35em",
          color:"rgba(210,180,100,0.7)", textTransform:"uppercase" }}>LitSense</span>
      </div>

      <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
        maxWidth:"560px", width:"100%",
        opacity: visible ? 1 : 0, transition:"opacity 1.2s ease 0.1s" }}>

        <p style={{ fontFamily:cinzel, fontSize:"0.68rem", letterSpacing:"0.3em",
          color:"rgba(210,185,120,0.75)", textTransform:"uppercase",
          margin:"0 0 1.25rem",
          animation: visible ? "fadeUp 1s ease 0.3s both" : "none" }}>
          A door worth opening
        </p>

        <div style={{ position:"relative", width:"min(340px, 65vw)", marginBottom:"0.5rem" }}>
          <div style={{
            position:"absolute", top:"38%", left:"50%",
            width:"220%", height:"220%", borderRadius:"50%",
            background:"radial-gradient(ellipse, rgba(220,160,40,0.18) 0%, rgba(180,110,20,0.08) 35%, transparent 65%)",
            animation:"keyholeRayOuter 3.5s ease-in-out infinite",
            transform:"translate(-50%, -50%)", pointerEvents:"none", zIndex:0,
          }} />
          <div style={{
            position:"absolute", top:"38%", left:"50%",
            width:"90%", height:"90%", borderRadius:"50%",
            background:"radial-gradient(ellipse, rgba(255,210,100,0.75) 0%, rgba(230,170,50,0.45) 20%, rgba(200,130,30,0.2) 45%, transparent 70%)",
            animation:"keyholeRay 3.5s ease-in-out infinite",
            transform:"translate(-50%, -50%)", pointerEvents:"none", zIndex:0,
          }} />
          <img src={KEYHOLE_IMG} alt="Keyhole"
            style={{ width:"100%", display:"block", position:"relative", zIndex:1 }} />
        </div>

        <h1 style={{ fontFamily:serif, fontSize:"clamp(2.1rem, 6vw, 3.2rem)",
          fontWeight:300, fontStyle:"italic",
          color:"rgba(245,230,200,1)", margin:"0 0 0.75rem",
          textAlign:"center", lineHeight:1.25,
          animation: visible ? "fadeUp 1s ease 0.6s both" : "none" }}>
          On the other side is your<br/>next great read.
        </h1>

        <div style={{ width:"40px", height:"1px",
          background:"linear-gradient(90deg, transparent, rgba(210,170,80,0.6), transparent)",
          margin:"1.2rem 0",
          animation: visible ? "fadeUp 1s ease 0.8s both" : "none" }} />

        <p style={{ fontSize:"clamp(1rem, 2.5vw, 1.15rem)", fontWeight:300,
          color:"rgba(215,200,165,0.9)", textAlign:"center", lineHeight:1.85,
          margin:"0 0 2.5rem",
          animation: visible ? "fadeUp 1s ease 1s both" : "none" }}>
          There are books that stay with you for life — that shift how you see,
          feel, think. We find yours. Curated to your taste, your mood,
          this moment in your reading life.
        </p>

        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"1.25rem",
          animation: visible ? "fadeUp 1s ease 1.2s both" : "none" }}>
          <button className="ls-enter-btn" onClick={onEnter}>Open the Door</button>
          <span style={{ fontSize:"0.8rem", letterSpacing:"0.08em",
            color:"rgba(180,160,120,0.6)", fontFamily:serif, fontStyle:"italic" }}>
            No account needed to begin
          </span>
        </div>
      </div>

      <div style={{ position:"absolute", bottom:"2rem", left:0, right:0,
        display:"flex", justifyContent:"center",
        opacity: visible ? 0.5 : 0, transition:"opacity 1s ease 1.5s" }}>
        <span style={{ fontSize:"0.65rem", letterSpacing:"0.2em",
          color:"rgba(180,155,100,0.6)", fontFamily:serif }}>✦ &nbsp; &nbsp; ✦ &nbsp; &nbsp; ✦</span>
      </div>
    </div>
  );
}

export default function LitSense() {
  const [entered, setEntered] = useState(() => { try { return !!localStorage.getItem("ls_entered"); } catch { return false; } });
  if (!entered) return <LitSenseWelcome onEnter={() => { try { localStorage.setItem("ls_entered","1"); } catch {} setEntered(true); }} />;

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

  const goAsk = (prompt) => { setTab("ask"); setTimeout(()=>sendChat(prompt),80); };

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
  const BG_GRADIENTS = {
    literary:   "radial-gradient(ellipse 80% 90% at 5% 70%, rgba(195,108,18,.9) 0%, transparent 55%), radial-gradient(ellipse 65% 75% at 90% 15%, rgba(155,92,14,.75) 0%, transparent 52%), radial-gradient(ellipse 70% 60% at 80% 75%, rgba(100,62,10,.6) 0%, transparent 50%), linear-gradient(170deg,#1e1409 0%,#0d0a07 100%)",
    nonfiction: "radial-gradient(ellipse 75% 85% at 10% 60%, rgba(52,75,128,.85) 0%, transparent 55%), radial-gradient(ellipse 65% 70% at 88% 20%, rgba(38,58,105,.70) 0%, transparent 52%), radial-gradient(ellipse 60% 55% at 70% 80%, rgba(35,55,95,.55) 0%, transparent 50%), linear-gradient(175deg,#080c14 0%,#060708 100%)",
    thriller:   "radial-gradient(ellipse 75% 88% at 6% 72%, rgba(128,18,18,.90) 0%, transparent 55%), radial-gradient(ellipse 60% 70% at 90% 18%, rgba(72,10,10,.65) 0%, transparent 52%), radial-gradient(ellipse 65% 58% at 82% 82%, rgba(18,22,42,.55) 0%, transparent 50%), linear-gradient(170deg,#0e0707 0%,#080505 100%)",
    sciFi:      "radial-gradient(ellipse 78% 88% at 5% 65%, rgba(18,52,175,.88) 0%, transparent 55%), radial-gradient(ellipse 65% 72% at 88% 20%, rgba(58,18,138,.70) 0%, transparent 52%), radial-gradient(ellipse 60% 58% at 78% 78%, rgba(28,14,85,.55) 0%, transparent 50%), linear-gradient(175deg,#050a1c 0%,#04060f 100%)",
    curious:    "radial-gradient(ellipse 78% 88% at 5% 68%, rgba(195,108,18,.82) 0%, transparent 56%), radial-gradient(ellipse 62% 72% at 88% 16%, rgba(140,82,14,.65) 0%, transparent 52%), radial-gradient(ellipse 68% 72% at 82% 78%, rgba(52,68,108,.55) 0%, transparent 52%), linear-gradient(170deg,#191208 0%,#0d0a06 100%)",
  };

  const bgGrad = BG_GRADIENTS[bgVoice] || BG_GRADIENTS.curious;
  const discoverRows = buildDiscoverRows(BOOKS, adaptedUserState);

  return (
    <div style={{ position:"relative", height:"100dvh", overflow:"hidden", background:"#14110d" }}>
      <style>{CSS}</style>

      {/* ── BACKGROUND — fully inline, guaranteed to render ── */}
      {/* Blurred gradient layer */}
      <div style={{
        position:"absolute", inset:0, zIndex:0, pointerEvents:"none",
        overflow:"hidden",
      }}>
        <div style={{
          position:"absolute", inset:"-20%",
          background: bgGrad,
          filter:"blur(40px) saturate(0.9)",
          opacity:1,
          animation:"lsBgBreath 28s ease-in-out infinite alternate",
        }}/>
      </div>
      {/* Vignette — just edge darkening, no heavy overlay */}
      <div style={{
        position:"absolute", inset:0, zIndex:1, pointerEvents:"none",
        background:"radial-gradient(ellipse 130% 100% at 50% 40%, transparent 0%, rgba(10,8,6,.15) 55%, rgba(8,6,4,.50) 100%)",
      }}/>

      {/* ── APP ── */}
      <div className="ls" style={{ position:"relative", zIndex:2, background:"transparent" }}>

      {/* HEADER */}
      <header className="ls-hdr">
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
          <div className="ls-scroll">

            {/* ── TOP MOMENT — one thing worth saying ── */}
            <TopMoment
              intelligence={intelligence}
              signalCandidates={rankedSignals ? [...(rankedSignals.high||[]), ...(rankedSignals.normal||[]), ...(rankedSignals.low||[])] : []}
              recCandidates={wheelBooks.slice(0,6).map(book => ({ book, reasonType: savedBooks.some(sb=>sb.id===book.id)?'affinity_match':'voice_profile' }))}
              behavioral={null}
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
                  <div className="ls-proof-cover">
                    <BookCover isbn="9780802162175" title="The Covenant of Water" author="Abraham Verghese" color={["#1a2430","#0e1820"]}/>
                  </div>
                  <div className="ls-proof-body">
                    <div className="ls-proof-title">The Covenant of Water</div>
                    <div className="ls-proof-author">Abraham Verghese · 96% match</div>
                    <div className="ls-proof-reason">
                      <div className="ls-proof-why-label">Why this could be your next favorite</div>
                      <span>Few novels manage to be this precise and this moving at the same time. Three generations across seventy years in South India — the kind of patient, sweeping storytelling that rewards attention and stays with you long after. If the books you love most are the ones that feel genuinely important once you finish them, this is a very strong fit.</span>
                    </div>
                    <a href={amazonLink("The Covenant of Water","Abraham Verghese","9780802162175")} target="_blank" rel="noopener noreferrer"
                      style={{display:"inline-flex",alignItems:"center",gap:5,marginTop:10,padding:"5px 12px",borderRadius:99,textDecoration:"none",background:"rgba(212,148,26,.15)",border:"1px solid rgba(212,148,26,.25)",color:"var(--gold)",fontSize:11,fontWeight:600}}>Buy on Amazon →</a>
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

            {/* Personalised multi-row discovery */}
            {discoverRows.length === 0 ? (
              <div className="ls-empty" style={{padding:"32px 16px"}}>
                <div className="ls-empty-icon"><BookOpen size={36} strokeWidth={1}/></div>
                <div className="ls-empty-title">All caught up</div>
                <div className="ls-empty-body">You've dismissed all current picks. Reset your filters to see more.</div>
              </div>
            ) : (
              discoverRows.map(row => (
                <BookRow
                  key={row.id}
                  books={row.books}
                  title={row.title}
                  subtitle={row.subtitle}
                  onAsk={goAsk}
                  onTap={setTappedBook}
                  savedBooks={savedBooks}
                  onSave={handleSaveBook}
                  onDismiss={handleDismissBook}
                  userState={adaptedUserState}
                />
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
                    <div className="ls-input-card">
                      <div className="ls-input-label">Search for a book you've read</div>
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
                              <a href={amazonLink(t.split(" — ")[0], t.split(" — ")[1]||"")} target="_blank" rel="noopener noreferrer"
                                style={{display:"inline-flex",alignItems:"center",padding:"4px 9px",borderRadius:6,textDecoration:"none",background:"rgba(212,148,26,.1)",border:"1px solid rgba(212,148,26,.2)",color:"var(--gold)",fontSize:10.5,fontWeight:600}}>Buy</a>
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
                              <a
                                href={amazonLink(b.title, b.author||"", b.isbn||"")}
                                target="_blank" rel="noopener noreferrer"
                                style={{display:"inline-flex",alignItems:"center",padding:"4px 9px",borderRadius:6,textDecoration:"none",background:"rgba(212,148,26,.1)",border:"1px solid rgba(212,148,26,.2)",color:"var(--gold)",fontSize:10.5,fontWeight:600}}>Buy</a>
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
              <div className="ls-input-row-chat">
                <textarea className="ls-chat-input" rows={1}
                  placeholder="What are you looking for..."
                  value={chatIn} onChange={e=>setChatIn(e.target.value)}
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
          isSaved={isBookSaved(detailBook.id)}
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
          isSaved={isBookSaved(tappedBook.id)}
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
                    value={proCard.name} onChange={e=>setProCard(p=>({...p,name:e.target.value}))}/>
                </div>
                <div className="ls-stripe-field">
                  <div className="ls-stripe-label">Card number</div>
                  <input className="ls-stripe-input" placeholder="1234 5678 9012 3456"
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
                      value={proCard.expiry}
                      onChange={e=>{
                        const v = e.target.value.replace(/\D/g,"").slice(0,4);
                        setProCard(p=>({...p,expiry:v.length>2?v.slice(0,2)+"/"+v.slice(2):v}));
                      }}/>
                  </div>
                  <div className="ls-stripe-field" style={{flex:1}}>
                    <div className="ls-stripe-label">CVC</div>
                    <input className="ls-stripe-input" placeholder="123" maxLength={4}
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
        <div className="ls-auth-overlay" onClick={()=>{setShowAuth(false);setAuthError("");}}>
          <div className="ls-auth-modal" onClick={e=>e.stopPropagation()}>
            <div className="ls-auth-handle"/>
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
              <input className="ls-auth-input" type="email" placeholder="you@example.com"
                value={authEmail} onChange={e=>setAuthEmail(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter")handleAuth();}}/>
            </div>
            <div className="ls-auth-field">
              <div className="ls-auth-label">Password</div>
              <input className="ls-auth-input" type="password" placeholder="••••••••"
                value={authPass} onChange={e=>setAuthPass(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter")handleAuth();}}/>
            </div>
            <button className="ls-auth-cta" onClick={handleAuth}>
              {authMode==="signup"?"Create free account":"Sign in"}
            </button>
            <div className="ls-auth-switch">
              {authMode==="signup"
                ?<>Already have an account? <button onClick={()=>{setAuthMode("login");setAuthError("");}}>Sign in</button></>
                :<>Don't have an account? <button onClick={()=>{setAuthMode("signup");setAuthError("");}}>Sign up free</button></>}
            </div>
            <button className="ls-auth-cancel" onClick={()=>{setShowAuth(false);setAuthError("");}}>Maybe later</button>
          </div>
        </div>
      )}

      {/* ── WELCOME SCREEN — shown once per day ── */}
      {showWelcome && (
        <div className="ls-welcome">
          {/* Logo */}
          <div className="ls-welcome-logo">
            <svg height="40" viewBox="0 0 1267.82 368.3" xmlns="http://www.w3.org/2000/svg" style={{width:"auto"}}>
              <defs><style>{`.wl1{fill:#d4941a}.wl2{fill:#fff}`}</style></defs>
              <path className="wl2" d="M551.37,199.01c-2.51,10.46-4.77,17.95-6.77,22.47-2,4.52-4.59,8.72-7.75,12.59-1.95,3.62-6.14,7.24-12.57,10.85-8.57,4.78-20.34,7.17-35.33,7.17l-8.8-.19-8.24.19-13.27-.75c-.93-1.17-1.4-3.7-1.4-7.59l.56-92.27c0-5.19.05-9.41.14-12.65.28-8.7.42-16.42.42-23.17,0-5.84-.14-12.65-.42-20.44-.19-4.93-.28-8.43-.28-10.51,0-1.69.03-3.37.1-5.06.21-6.49.31-10.06.31-10.71v-5.64l.42-12.26.14-5.45c.19-.65.46-1.43.84-2.34,1.12-.78,1.91-1.29,2.37-1.56l17.31-5.65c3.54-.65,5.59-1.43,6.14-2.34,1.02-1.54,1.54-3.78,1.54-6.72,0-3.71-.37-6.27-1.12-7.68-.56-1.02-1.54-1.54-2.93-1.54-.47,0-2.19.18-5.17.53-10.05,1.08-18.29,1.61-24.72,1.61l-14.8-.39-19.97.19c-13.96-1.04-22.06-1.56-24.3-1.56-.93,0-1.82.33-2.65.97-.09,2.08-.14,3.63-.14,4.67,0,1.82.09,4.41.28,7.78,1.3,1.56,3.58,2.92,6.84,4.08,1.86.52,3.96,1.43,6.28,2.72,3.07,1.69,4.84,2.66,5.31,2.92,4.75,2.08,7.42,3.8,8.03,5.16.6,1.36,1.23,8.85,1.89,22.48v2.73l-.14,19.66-.56,43.4.28,20.25-.14,19.07v16.15l-.84,25.3.28,24.91c0,2.08-.28,4.67-.84,7.78-1.21,1.5-3.63,2.32-7.26,2.44-.93,0-4.03.53-9.29,1.6-5.26,1.07-9.33,2.18-12.22,3.35-.65,2.46-.98,6.42-.98,11.86,0,1.04.09,2.27.28,3.69,1.21.13,2.09.19,2.65.19h2.09c9.59-1.04,19.87-1.75,30.86-2.14l28.49-1.17c15.27,0,30.86.39,46.78,1.17s24.81,1.23,26.67,1.36c10.24,1.04,15.78,1.56,16.62,1.56l7.26-.19h5.17c.56,0,1.91-.26,4.05-.78.65-2.07,1.3-7.76,1.95-17.07,1.68-23.27,2.51-39.56,2.51-48.87v-5.43c-2.79-.52-5.31-.78-7.54-.78h-4.47Z"/>
              <path className="wl1" d="M799.84,92.35c7.82,0,13.41,4.25,16.78,12.74,3.37,8.49,3.81,19.41,1.35,32.77-1.26,6.61-1.1,10.44.49,11.47h2.51c17.19-19.83,26.45-32.28,27.77-37.34,1.52-5.83-1.11-13.13-7.9-21.88-6.79-8.75-17.03-13.13-30.71-13.13-18.06,0-34.74,8.43-50.03,25.28-15.3,16.85-25.57,35.33-30.82,55.42-3.02,11.54-4.07,23.4-3.16,35.59.91,12.19,5.69,27.07,14.34,44.66,8.65,17.59,13.45,30.04,14.39,37.36.94,7.32.57,14.22-1.12,20.69-3.28,12.56-9.85,23.61-19.69,33.13-9.84,9.52-19.7,14.28-29.56,14.28-9.03,0-15.36-3.82-18.99-11.47-3.63-7.65-3.5-21.58.38-41.81,1.23-6.48,1.53-10.92.9-13.32-.63-2.4-2.44-3.6-5.41-3.6-.84,0-5.83,6.61-14.96,19.83-9.14,13.22-14.18,21.65-15.12,25.28-1.69,6.48,1.28,14.88,8.92,25.18,7.64,10.31,19.42,15.46,35.34,15.46,19.27,0,38.39-8.78,57.36-26.35,18.97-17.56,31.47-37.88,37.51-60.96,2.61-9.98,3.36-20.52,2.25-31.6-1.11-11.08-6.26-25.97-15.46-44.67-9.2-18.7-14.36-32.35-15.48-40.96-1.12-8.61-.7-16.67,1.27-24.18,2.71-10.36,7.69-19.26,14.94-26.71,7.25-7.44,14.55-11.17,21.91-11.17Z"/>
              <path className="wl1" d="M356.87,35.66c-7.41.84-14.7,1.85-21.87,3.01V0l-12.14,2.66c-29.04,6.36-55.87,18.36-79.73,35.67-27.97,20.29-46.55,44.23-58.59,64.66-.18.17-.36.34-.53.5-.18-.17-.36-.34-.54-.5-12.04-20.43-30.62-44.37-58.59-64.66C101.01,21.02,74.18,9.02,45.14,2.66l-12.14-2.66v38.67c-7.17-1.16-14.46-2.17-21.87-3.01l-11.13-1.26v278.88l8.91.98c29.92,3.29,58.65,8.78,85.38,16.3,29.82,8.39,56.6,19.14,79.71,31.98,1.67.93,3.33,1.87,4.97,2.82l3.38,1.96,1.66.96,1.66-.96,3.38-1.96c1.64-.95,3.29-1.89,4.97-2.82,23.11-12.84,49.89-23.59,79.71-31.98,26.73-7.53,55.46-13.01,85.38-16.3l8.91-.98V34.4l-11.13,1.26Z"/>
            </svg>
          </div>

          <div className="ls-welcome-title">Your smart,<br/><em>observant</em> reading friend.</div>

          <div className="ls-welcome-features">
            {[
              [BookOpen, "Reads with you", "Tell it what you're reading. It checks in, asks how it's going, and remembers."],
              [Star, "Learns your taste", "The more you rate and react, the more personal your recommendations get."],
              [MessageCircle, "Honest opinions", "Ask anything. Get a real answer — not an algorithm, a considered opinion."],
              [Sparkles, "No assumptions", "It only knows what you tell it. Nothing is invented."],
            ].map(([Icon, title, desc]) => (
              <div key={title} className="ls-welcome-feature">
                <div className="ls-welcome-feature-icon">
                  <Icon size={15} strokeWidth={1.75} style={{color:"var(--gold)"}}/>
                </div>
                <div className="ls-welcome-feature-text">
                  <div className="ls-welcome-feature-title">{title}</div>
                  <div className="ls-welcome-feature-desc">{desc}</div>
                </div>
              </div>
            ))}
          </div>

          <button className="ls-welcome-cta" onClick={dismissWelcome}>
            Start reading smarter →
          </button>
          <button className="ls-welcome-skip" onClick={dismissWelcome}>
            Skip for now
          </button>
        </div>
      )}

      </div>
    </div>
  );
}
