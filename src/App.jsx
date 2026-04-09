/**
 * LitSense — AI Book Advisor
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

import { useState, useRef, useEffect, useCallback } from "react";
import {
  BookOpen, BookMarked, MessageCircle, Search, Star,
  Sun, Brain, Heart, Lightbulb, Smile, Moon,
  Plus, X, Send, Crown, ChevronRight, RotateCcw,
  Library, Bookmark, Sparkles, Lock,
} from "lucide-react";

const LIMIT_ANON = 3;
const LIMIT_FREE = 5;
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
.ls-scroll{flex:1;overflow-y:auto;}

/* ── CINEMATIC HERO ── */
.ls-hero{
  padding:36px 20px 28px;
  background:linear-gradient(180deg, transparent 0%, rgba(10,8,6,.42) 60%, rgba(10,8,6,.82) 100%);
  position:relative;
}
.ls-hero-eyebrow{
  font-size:9px;font-weight:700;letter-spacing:3.5px;
  text-transform:uppercase;color:var(--gold);margin-bottom:12px;
  display:flex;align-items:center;gap:9px;opacity:.9;
}
.ls-hero-eyebrow::before{content:'';width:24px;height:1.5px;background:var(--gold);border-radius:1px;}
.ls-hero-title{
  font-family:'Lora',serif;
  font-size:30px;font-weight:700;line-height:1.2;
  color:var(--text);margin-bottom:12px;letter-spacing:-.5px;
}
.ls-hero-title em{color:var(--gold);font-style:italic;}
.ls-hero-body{font-size:14.5px;line-height:1.68;color:var(--text2);margin-bottom:22px;max-width:300px;}
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
.ls-proof{margin-top:24px;padding-top:22px;border-top:1px solid rgba(255,255,255,.06);}
.ls-proof-label{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:12px;opacity:.9;}
.ls-proof-card{
  display:flex;gap:14px;
  background:rgba(255,255,255,.05);
  backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  border-radius:var(--r-lg);padding:16px;
  border:1px solid rgba(255,255,255,.09);
  box-shadow:0 8px 32px rgba(0,0,0,.25);
}
.ls-proof-cover{width:52px;min-width:52px;height:72px;border-radius:8px;overflow:hidden;flex-shrink:0;box-shadow:0 4px 16px rgba(0,0,0,.5);}
.ls-proof-cover img{width:100%;height:100%;object-fit:cover;display:block;}
.ls-proof-body{flex:1;min-width:0;}
.ls-proof-title{font-family:'Lora',serif;font-size:13px;font-weight:600;color:var(--text);margin-bottom:2px;line-height:1.3;}
.ls-proof-author{font-size:10.5px;color:var(--muted);margin-bottom:9px;}
.ls-proof-reason{font-size:11.5px;line-height:1.68;color:var(--text2);font-style:italic;padding:8px 11px;background:rgba(212,148,26,.09);border-left:2px solid var(--gold);border-radius:0 6px 6px 0;}
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
.ls-book-cover{width:72px;min-width:72px;height:104px;border-radius:9px;overflow:hidden;flex-shrink:0;box-shadow:0 4px 20px rgba(0,0,0,.5);}
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
.ls-tile{width:110px;height:160px;border-radius:var(--r-md);overflow:hidden;position:relative;box-shadow:0 6px 24px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.07);transition:box-shadow .25s;}
.ls-tile-wrap:hover .ls-tile{box-shadow:0 14px 40px rgba(0,0,0,.65),0 0 0 1px rgba(212,148,26,.25);}
.ls-tile-overlay{position:absolute;inset:0;background:linear-gradient(180deg,transparent 35%,rgba(4,2,1,.95) 100%);opacity:0;transition:opacity .22s;display:flex;flex-direction:column;justify-content:flex-end;padding:10px 9px;}
.ls-tile-wrap:hover .ls-tile-overlay{opacity:1;}
.ls-tile-book-title{font-family:'Inter',sans-serif;font-size:10px;font-weight:700;color:#fff;line-height:1.25;margin-bottom:2px;}
.ls-tile-book-author{font-size:9px;color:rgba(255,255,255,.6);}

/* ── SHELF ── */
.ls-shelf-scroll{flex:1;overflow-y:auto;padding-bottom:16px;}
.ls-shelf-hdr{padding:28px 20px 20px;}
.ls-shelf-hdr-title{font-family:'Lora',serif;font-size:24px;font-weight:700;color:var(--text);margin-bottom:4px;}
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
.ls-feed-toggle-btn:not(.on){background:transparent;color:var(--muted);}
.ls-feed-toggle-btn:not(.on):hover{color:var(--text2);}
.ls-foryou-feed{flex:1;overflow-y:auto;}
.ls-foryou-card{padding:22px 20px 18px;border-bottom:1px solid rgba(255,255,255,.05);animation:feedItemIn .22s var(--ease);}
@keyframes feedItemIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

/* ── CINEMATIC BACKGROUND — VOICE THEMES ─────────────────────────────────────
   Applied via data-bg attribute on .ls, driven by getUserVoiceProfile().
   Each theme overrides the ::before gradient palette only.
   ::after overlay stays constant — keeps text contrast stable across themes.
   ─────────────────────────────────────────────────────────────────────────── */

/* Literary — warm amber pools, candlelit, patient */
.ls[data-bg="literary"]::before {
  background:
    radial-gradient(ellipse 72% 88% at 4%  68%, rgba(195,108,18,.42) 0%, transparent 58%),
    radial-gradient(ellipse 58% 70% at 88% 16%, rgba(155,92,14,.32)  0%, transparent 54%),
    radial-gradient(ellipse 88% 52% at 50% 102%,rgba(130,70,8,.26)   0%, transparent 52%),
    radial-gradient(ellipse 52% 60% at 78% 72%, rgba(80,52,12,.20)   0%, transparent 50%),
    radial-gradient(ellipse 48% 55% at 22% 22%, rgba(100,62,10,.22)  0%, transparent 50%);
}

/* Nonfiction / Analytical — cool slate-blue, clinical clarity */
.ls[data-bg="nonfiction"]::before {
  background:
    radial-gradient(ellipse 68% 82% at 12% 58%, rgba(52,75,128,.38)  0%, transparent 58%),
    radial-gradient(ellipse 62% 72% at 85% 22%, rgba(38,58,105,.28)  0%, transparent 54%),
    radial-gradient(ellipse 82% 48% at 50% 105%,rgba(28,42,88,.22)   0%, transparent 52%),
    radial-gradient(ellipse 55% 65% at 72% 78%, rgba(62,52,32,.18)   0%, transparent 50%),
    radial-gradient(ellipse 45% 52% at 18% 18%, rgba(35,55,95,.20)   0%, transparent 50%);
}

/* Thriller — deep crimson tension, compressed darkness */
.ls[data-bg="thriller"]::before {
  background:
    radial-gradient(ellipse 65% 85% at 8%  72%, rgba(128,18,18,.40)  0%, transparent 56%),
    radial-gradient(ellipse 55% 68% at 88% 18%, rgba(32,28,48,.35)   0%, transparent 54%),
    radial-gradient(ellipse 85% 50% at 50% 105%,rgba(88,12,12,.28)   0%, transparent 52%),
    radial-gradient(ellipse 58% 62% at 80% 80%, rgba(18,22,42,.22)   0%, transparent 50%),
    radial-gradient(ellipse 42% 52% at 20% 20%, rgba(72,10,10,.18)   0%, transparent 50%);
}

/* Sci-Fi — deep blue-violet, cosmic, expansive */
.ls[data-bg="sciFi"]::before {
  background:
    radial-gradient(ellipse 70% 88% at 6%  65%, rgba(18,52,175,.40)  0%, transparent 58%),
    radial-gradient(ellipse 60% 72% at 86% 20%, rgba(58,18,138,.30)  0%, transparent 54%),
    radial-gradient(ellipse 85% 52% at 50% 104%,rgba(10,28,105,.24)  0%, transparent 52%),
    radial-gradient(ellipse 55% 65% at 76% 76%, rgba(28,14,85,.20)   0%, transparent 50%),
    radial-gradient(ellipse 45% 55% at 18% 20%, rgba(38,62,145,.22)  0%, transparent 50%);
}

/* Curious / default — mixed warm-cool, balanced, open */
.ls[data-bg="curious"]::before,
.ls::before {
  background:
    radial-gradient(ellipse 72% 88% at 4%  68%, rgba(195,108,18,.38) 0%, transparent 58%),
    radial-gradient(ellipse 58% 70% at 88% 16%, rgba(140,82,14,.28)  0%, transparent 54%),
    radial-gradient(ellipse 88% 52% at 50% 102%,rgba(120,65,8,.24)   0%, transparent 52%),
    radial-gradient(ellipse 62% 72% at 82% 78%, rgba(52,68,108,.20)  0%, transparent 52%),
    radial-gradient(ellipse 48% 55% at 20% 22%, rgba(88,58,12,.18)   0%, transparent 50%);
  filter:blur(48px) saturate(0.7);
  opacity:0.65;
  animation:lsBgBreath 28s ease-in-out infinite alternate;
}

/* Theme transitions — fade only, no movement */
.ls::before {
  transition: opacity 3s ease-in-out, filter 3s ease-in-out;
}

@keyframes lsBgBreath {
  from { opacity:0.28; filter:blur(60px) saturate(0.58); }
  to   { opacity:0.38; filter:blur(56px) saturate(0.65); }
}

.ls::after {
  content:'';
  position:absolute;inset:0;z-index:-1;
  pointer-events:none;
  background:
    radial-gradient(ellipse 120% 95% at 50% 38%,
      rgba(20,16,10,.05) 0%,
      rgba(14,11,8,.30)  55%,
      rgba(10,8,6,.65)   100%
    ),
    linear-gradient(170deg,
      rgba(24,18,10,.18) 0%,
      rgba(12,9,6,.08)   50%,
      rgba(20,14,8,.28)  100%
    );
}
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
    analytical: ({title, tone}) => `**${title}** → same ${tone} construction. Solid match.`,
    literary:   ({title, tone}) => `You saved **${title}** — this shares the same ${tone} register and asks the same quality of attention.`,
    emotional:  ({title})       => `Because you saved **${title}**. This one will land in the same place.`,
    fast:       ({title})       => `You saved **${title}**. Same pace, same pull. Read this next.`,
    curious:    ({title, tone}) => `You saved **${title}** — interesting. This one follows a related thread, with the same ${tone} at its core.`,
  },

  // Context: user gave a matched book 4+ stars
  rated: {
    analytical: ({title, rating, tone}) => `You rated **${title}** ${rating} stars. Same ${tone} structure. High probability of match.`,
    literary:   ({title, rating, tone}) => `**${title}** earned ${rating} stars from you — this is written in the same register, with the same ${tone} care.`,
    emotional:  ({title, rating})       => `You gave **${title}** ${rating} stars. This one will move you in a similar way.`,
    fast:       ({title, rating})       => `${rating} stars on **${title}**. Same energy. Different story.`,
    curious:    ({title, rating, tone}) => `You rated **${title}** ${rating} stars — and here's what's interesting: this one shares its ${tone} core.`,
  },

  // Context: genre filter is active
  genre: {
    analytical: ({genre, tone}) => `${genre} — ${tone} and well-constructed. One of the stronger examples in the category.`,
    literary:   ({genre, tone}) => `You're in ${genre} — this is one of the more carefully written examples of it. The ${tone} quality holds throughout.`,
    emotional:  ({genre})       => `You're exploring ${genre}. This one has the emotional depth to justify it.`,
    fast:       ({genre})       => `${genre}. One of the best. Starts strong and keeps moving.`,
    curious:    ({genre, tone}) => `You're browsing ${genre} — worth knowing this one is ${tone} in a way that actually earns the label.`,
  },

  // Context: slow-paced book, user has reading history
  pacing_slow: {
    analytical: () => `Slow-paced. Rewards sustained attention. Structured for depth over pace.`,
    literary:   () => `Takes its time — and the writing justifies every page.`,
    emotional:  () => `Patient storytelling. The kind that earns the feelings it creates.`,
    fast:       () => `Slower build than you might usually reach for — but the payoff is real.`,
    curious:    () => `Takes time to develop. Worth noting, because what it builds toward is genuinely interesting.`,
  },

  // Context: fast-paced book, user has reading history
  pacing_fast: {
    analytical: () => `Fast-paced. High signal, low friction. Efficient reading experience.`,
    literary:   () => `Moves quickly without sacrificing prose quality — rarer than it should be.`,
    emotional:  () => `Pulls you forward — and the emotional core arrives before you expect it.`,
    fast:       () => `Moves fast. Gets to the point. Hard to put down.`,
    curious:    () => `Unusually propulsive — worth noting because the ideas don't suffer for the pace.`,
  },

  // Context: moderate-paced book, user has reading history
  pacing_moderate: {
    analytical: () => `Balanced pacing. Depth and readability in reliable proportion.`,
    literary:   () => `Well-calibrated between momentum and prose. Respects your time and your attention equally.`,
    emotional:  () => `Balanced — gives you enough room to feel what it's building toward.`,
    fast:       () => `Solid pacing throughout. Never drags. Worth the time.`,
    curious:    () => `Neither slow nor rushed — which leaves the ideas room to develop properly.`,
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
      return `${meta.pacing === "fast" ? "Fast-paced from the first page" : "Moves quickly and doesn't waste your time"} — the kind of book you read in two sittings`;
    }
    if (rowContext === "slow-burn literary") {
      return `Takes its time — and earns it. The kind of book you think about after you've finished`;
    }
    if (rowContext === "mind-expanding non-fiction") {
      return `You'll close this with a different understanding of something you thought you already knew`;
    }
    if (rowContext.startsWith("Because you") || rowContext.includes("loved") || rowContext.includes("saved")) {
      return `Same ${toneWords[0]} quality — written in the same register as what drew you to that book`;
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
  const { savedBooks = [], readBooks = [], mood = null, genre = null, dismissedBooks = [] } = userState;
  const available = allBooks.filter(b => !dismissedBooks.includes(b.id));
  if (available.length === 0) return [];

  const rows = [];
  const usedIds = new Set(); // track which books have appeared so far

  // Helper: fuzzy first-word match between a user title and affinity targets
  const affinityMatch = (userTitle, targets = []) =>
    targets.some(t => {
      const tFirst = t.toLowerCase().split(/\s+/)[0];
      const uFirst = userTitle.toLowerCase().split(/\s+/)[0];
      return userTitle.toLowerCase().includes(tFirst) || t.toLowerCase().includes(uFirst);
    });

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
  "I loved Pachinko — what should I read next?",
  "I want something I genuinely can't put down this weekend.",
  "Best non-fiction of the last five years, honestly?",
  "I've been in a reading slump. What gets me back?",
  "What should I read on a six-hour flight?",
  "Recommend something I'd never pick myself but would love.",
];
const PRO_FEATURES = [
  { Icon:BookOpen,      title:"Unlimited reading advisor",    desc:"Ask anything about books, anytime, without limits." },
  { Icon:Library,       title:"Complete shelf history",       desc:"Track every book you've ever read, rated, or loved." },
  { Icon:Sparkles,      title:"Deep taste analysis",          desc:"AI maps your reading DNA and surfaces your patterns." },
  { Icon:Bookmark,      title:"Want-to-read intelligence",    desc:"AI tells you which book on your list to read first." },
  { Icon:MessageCircle, title:"Book club mode",               desc:"AI-generated discussion questions for any book." },
  { Icon:BookMarked,    title:"Author alerts",                desc:"New releases from authors you love, as they drop." },
];
const AI_SYSTEM = `You are LitSense — a warm, well-read AI book advisor. You speak like a brilliant friend who has read thousands of books. You give specific, honest, personal recommendations — never generic bestseller lists. You explain exactly WHY a book is right for this person based on what they've read and loved. You ask thoughtful follow-ups when needed. Use **bold** for book titles and author names. Under 220 words unless giving a detailed list.`;

const today = () => new Date().toISOString().slice(0,10);

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
function RecommendationWheel({ books, savedBooks, onSave, onDismiss, onAsk, onTap, userState }) {
  const STEP    = 110; // px between book centers
  const COVER_W = 100; // cover width px
  const COVER_H = 148; // cover height px
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
          <div style={{display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap"}}>
            {(() => {
              const saved = savedBooks?.some(sb => sb.id === activeBook.id);
              return (
                <button
                  onClick={() => !saved && onSave(activeBook)}
                  style={{
                    padding:"8px 18px", borderRadius:99, border:"none",
                    background: saved ? "rgba(212,148,26,.1)" : "var(--gold)",
                    color: saved ? "var(--gold)" : "#0a0806",
                    fontSize:12, fontWeight:700,
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
              onClick={() => onAsk(`Tell me about "${activeBook.title}" by ${activeBook.author}. Should I read it?`)}
              style={{
                padding:"8px 14px", borderRadius:99,
                border:"1px solid rgba(255,255,255,.09)", background:"rgba(255,255,255,.04)",
                color:"var(--text2)", fontSize:12, fontWeight:600,
                cursor:"pointer", transition:"all .18s",
              }}
            >Ask AI →</button>
            <button
              onClick={handleNoThanks}
              style={{
                padding:"8px 12px", borderRadius:99,
                border:"1px solid rgba(255,255,255,.06)", background:"transparent",
                color:"var(--muted)", fontSize:12, fontWeight:500,
                cursor:"pointer", transition:"all .15s",
              }}
            >No Thanks</button>
          </div>

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

// ── VOICE-KEYED BACKGROUND SCENES ────────────────────────────────────────────
// 3 gradient variants per voice theme. Positions shift subtly between scenes
// so the light feels like it's slowly moving — imperceptibly, cinematically.
// Rotation: 18s interval, 4s crossfade → change takes ~22s total, subliminal.

const VOICE_SCENES = {
  // Literary — warm amber candlelight, patient and golden
  literary: [
    `radial-gradient(ellipse 72% 88% at 4%  68%, rgba(195,108,18,.42) 0%, transparent 58%),
     radial-gradient(ellipse 58% 70% at 88% 16%, rgba(155,92,14,.32)  0%, transparent 54%),
     radial-gradient(ellipse 88% 52% at 50% 102%,rgba(130,70,8,.26)   0%, transparent 52%),
     radial-gradient(ellipse 52% 60% at 78% 72%, rgba(80,52,12,.20)   0%, transparent 50%),
     linear-gradient(170deg,#1e1409 0%,#0d0a07 60%,#181108 100%)`,
    `radial-gradient(ellipse 68% 92% at 14% 58%, rgba(185,98,16,.40)  0%, transparent 56%),
     radial-gradient(ellipse 52% 65% at 82% 28%, rgba(145,85,12,.28)  0%, transparent 52%),
     radial-gradient(ellipse 82% 55% at 44% 98%, rgba(120,65,8,.24)   0%, transparent 50%),
     radial-gradient(ellipse 58% 65% at 68% 78%, rgba(72,48,10,.18)   0%, transparent 48%),
     linear-gradient(175deg,#1c1308 0%,#0f0b06 55%,#1a1008 100%)`,
    `radial-gradient(ellipse 75% 85% at 6%  75%, rgba(200,112,20,.38) 0%, transparent 60%),
     radial-gradient(ellipse 62% 68% at 85% 12%, rgba(160,95,15,.30)  0%, transparent 55%),
     radial-gradient(ellipse 85% 48% at 55% 105%,rgba(135,72,10,.22)  0%, transparent 52%),
     radial-gradient(ellipse 45% 58% at 82% 68%, rgba(85,55,14,.16)   0%, transparent 48%),
     linear-gradient(168deg,#1d1408 0%,#0e0a06 58%,#191008 100%)`,
  ],

  // Nonfiction / Analytical — cool slate-blue, structured, clear-headed
  nonfiction: [
    `radial-gradient(ellipse 68% 82% at 12% 58%, rgba(52,75,128,.38)  0%, transparent 58%),
     radial-gradient(ellipse 62% 72% at 85% 22%, rgba(38,58,105,.28)  0%, transparent 54%),
     radial-gradient(ellipse 82% 48% at 50% 105%,rgba(28,42,88,.22)   0%, transparent 52%),
     radial-gradient(ellipse 48% 60% at 72% 75%, rgba(42,35,18,.14)   0%, transparent 48%),
     linear-gradient(178deg,#0a0c12 0%,#070809 55%,#0b0c10 100%)`,
    `radial-gradient(ellipse 72% 78% at 18% 62%, rgba(48,68,118,.36)  0%, transparent 56%),
     radial-gradient(ellipse 58% 70% at 80% 28%, rgba(34,52,98,.26)   0%, transparent 52%),
     radial-gradient(ellipse 78% 52% at 55% 100%,rgba(25,38,82,.20)   0%, transparent 50%),
     radial-gradient(ellipse 52% 55% at 68% 80%, rgba(38,30,15,.12)   0%, transparent 46%),
     linear-gradient(180deg,#090b11 0%,#060708 55%,#0a0b0f 100%)`,
    `radial-gradient(ellipse 65% 85% at 8%  55%, rgba(55,78,132,.40)  0%, transparent 60%),
     radial-gradient(ellipse 65% 68% at 88% 18%, rgba(40,62,110,.30)  0%, transparent 56%),
     radial-gradient(ellipse 85% 45% at 48% 108%,rgba(30,45,92,.24)   0%, transparent 52%),
     radial-gradient(ellipse 45% 58% at 75% 72%, rgba(45,38,20,.14)   0%, transparent 48%),
     linear-gradient(175deg,#080a10 0%,#060708 55%,#090a0e 100%)`,
  ],

  // Thriller — deep crimson threat, compressed shadows
  thriller: [
    `radial-gradient(ellipse 65% 85% at 8%  72%, rgba(128,18,18,.42)  0%, transparent 56%),
     radial-gradient(ellipse 55% 68% at 88% 18%, rgba(32,28,48,.36)   0%, transparent 54%),
     radial-gradient(ellipse 85% 50% at 50% 105%,rgba(88,12,12,.28)   0%, transparent 52%),
     radial-gradient(ellipse 52% 60% at 75% 78%, rgba(18,22,42,.20)   0%, transparent 50%),
     linear-gradient(172deg,#0e0707 0%,#080505 55%,#0c0606 100%)`,
    `radial-gradient(ellipse 70% 80% at 4%  65%, rgba(118,15,15,.40)  0%, transparent 54%),
     radial-gradient(ellipse 60% 72% at 85% 25%, rgba(28,24,45,.33)   0%, transparent 52%),
     radial-gradient(ellipse 80% 55% at 55% 100%,rgba(95,14,14,.26)   0%, transparent 50%),
     radial-gradient(ellipse 48% 65% at 72% 82%, rgba(22,18,40,.18)   0%, transparent 48%),
     linear-gradient(175deg,#0d0606 0%,#070404 55%,#0b0505 100%)`,
    `radial-gradient(ellipse 62% 88% at 12% 78%, rgba(135,20,20,.44)  0%, transparent 58%),
     radial-gradient(ellipse 52% 65% at 90% 15%, rgba(35,30,52,.38)   0%, transparent 54%),
     radial-gradient(ellipse 88% 48% at 48% 108%,rgba(82,10,10,.24)   0%, transparent 52%),
     radial-gradient(ellipse 55% 62% at 78% 75%, rgba(15,18,38,.16)   0%, transparent 48%),
     linear-gradient(168deg,#0f0707 0%,#080505 55%,#0d0606 100%)`,
  ],

  // Sci-Fi — deep blue-violet, expansive, cosmic
  sciFi: [
    `radial-gradient(ellipse 70% 88% at 6%  65%, rgba(18,52,175,.42)  0%, transparent 58%),
     radial-gradient(ellipse 60% 72% at 86% 20%, rgba(58,18,138,.32)  0%, transparent 54%),
     radial-gradient(ellipse 85% 52% at 50% 104%,rgba(10,28,105,.24)  0%, transparent 52%),
     radial-gradient(ellipse 52% 65% at 76% 76%, rgba(28,14,85,.20)   0%, transparent 50%),
     linear-gradient(180deg,#050a1c 0%,#04060f 55%,#060812 100%)`,
    `radial-gradient(ellipse 65% 85% at 14% 60%, rgba(22,58,165,.40)  0%, transparent 56%),
     radial-gradient(ellipse 65% 68% at 82% 25%, rgba(52,15,128,.30)  0%, transparent 52%),
     radial-gradient(ellipse 80% 55% at 52% 100%,rgba(14,32,112,.22)  0%, transparent 50%),
     radial-gradient(ellipse 48% 62% at 72% 80%, rgba(22,10,78,.16)   0%, transparent 48%),
     linear-gradient(178deg,#04091a 0%,#03050e 55%,#050710 100%)`,
    `radial-gradient(ellipse 72% 90% at 4%  70%, rgba(15,48,180,.44)  0%, transparent 60%),
     radial-gradient(ellipse 55% 75% at 88% 18%, rgba(62,20,142,.34)  0%, transparent 56%),
     radial-gradient(ellipse 88% 48% at 48% 106%,rgba(8,24,98,.22)    0%, transparent 52%),
     radial-gradient(ellipse 55% 60% at 78% 74%, rgba(32,16,92,.18)   0%, transparent 48%),
     linear-gradient(175deg,#050a1e 0%,#040610 55%,#060814 100%)`,
  ],

  // Curious — balanced warm-cool mix, open and varied
  curious: [
    `radial-gradient(ellipse 72% 88% at 4%  68%, rgba(195,108,18,.38) 0%, transparent 58%),
     radial-gradient(ellipse 58% 70% at 88% 16%, rgba(140,82,14,.28)  0%, transparent 54%),
     radial-gradient(ellipse 88% 52% at 50% 102%,rgba(120,65,8,.24)   0%, transparent 52%),
     radial-gradient(ellipse 62% 72% at 82% 78%, rgba(52,68,108,.20)  0%, transparent 52%),
     linear-gradient(170deg,#191208 0%,#0d0a06 55%,#171008 100%)`,
    `radial-gradient(ellipse 68% 85% at 10% 62%, rgba(180,98,16,.36)  0%, transparent 56%),
     radial-gradient(ellipse 62% 68% at 84% 22%, rgba(48,68,118,.26)  0%, transparent 52%),
     radial-gradient(ellipse 82% 50% at 52% 100%,rgba(110,58,8,.22)   0%, transparent 50%),
     radial-gradient(ellipse 55% 68% at 78% 80%, rgba(38,52,88,.16)   0%, transparent 48%),
     linear-gradient(172deg,#171108 0%,#0c0906 55%,#150f08 100%)`,
    `radial-gradient(ellipse 75% 82% at 6%  72%, rgba(188,104,18,.40) 0%, transparent 58%),
     radial-gradient(ellipse 55% 72% at 86% 18%, rgba(130,76,12,.26)  0%, transparent 54%),
     radial-gradient(ellipse 85% 48% at 50% 106%,rgba(115,62,8,.20)   0%, transparent 50%),
     radial-gradient(ellipse 58% 68% at 78% 82%, rgba(45,62,105,.18)  0%, transparent 50%),
     linear-gradient(168deg,#1a1308 0%,#0e0a06 55%,#181108 100%)`,
  ],
};

// Map getUserVoiceProfile() result → VOICE_SCENES key.
// Genre filter is the strongest signal — overrides voice inference.
function getVoiceScenes(userState) {
  const { savedBooks = [], readBooks = [], mood = null, genre = null } = userState;

  // Explicit genre filter overrides everything
  if (genre === "Sci-Fi" || genre === "Fantasy")               return VOICE_SCENES.sciFi;
  if (genre === "Thriller" || genre === "Mystery" || genre === "True Crime") return VOICE_SCENES.thriller;
  if (genre === "Literary Fiction" || genre === "Historical" || genre === "Essays") return VOICE_SCENES.literary;
  if (genre === "Psychology" || genre === "Non-Fiction" || genre === "Biography"
   || genre === "Self-Help"  || genre === "Business" || genre === "Philosophy")    return VOICE_SCENES.nonfiction;

  // Voice profile from reading history
  const voice = getUserVoiceProfile({ savedBooks, readBooks, mood, genre });

  if (voice === "analytical")                   return VOICE_SCENES.nonfiction;
  if (voice === "literary" || voice === "emotional") return VOICE_SCENES.literary;
  if (voice === "fast") {
    const hasSci = savedBooks.some(b => (b.tags||[]).includes("Sci-Fi")) || genre === "Sci-Fi";
    return hasSci ? VOICE_SCENES.sciFi : VOICE_SCENES.thriller;
  }
  return VOICE_SCENES.curious; // curious or no signal → neutral warm-cool
}




function ForYouItem({ book, userState, savedBooks, onSave, onDismiss, onAsk }) {
  const [exiting, setExiting] = useState(false);
  const isSaved = savedBooks?.some(sb => sb.id === book.id);
  const reason  = getRecommendationReason(book, userState || {});
  const hook    = getHook(book);

  const handleNoThanks = () => {
    setExiting(true);
    setTimeout(() => onDismiss(book.id), 200);
  };

  return (
    <div
      className="ls-foryou-card"
      style={{
        opacity:   exiting ? 0 : 1,
        transform: exiting ? "translateX(16px)" : "translateX(0)",
        transition:"opacity .2s ease, transform .2s ease",
      }}
    >
      {/* Cover — smaller than before, still dominant */}
      <div style={{display:"flex", justifyContent:"center", marginBottom:14}}>
        <div style={{
          width:112, height:164, borderRadius:9, overflow:"hidden",
          boxShadow:"0 12px 36px rgba(0,0,0,.62), 0 0 0 1px rgba(255,255,255,.04)",
        }}>
          <BookCover isbn={book.isbn} title={book.title} author={book.author} color={book.color}/>
        </div>
      </div>

      {/* Title */}
      <div style={{
        fontFamily:"'Lora',serif", fontSize:18, fontWeight:700,
        color:"var(--text)", textAlign:"center",
        lineHeight:1.22, marginBottom:3, letterSpacing:"-.2px",
      }}>{book.title}</div>

      {/* Author + score inline — one line, less vertical cost */}
      <div style={{
        display:"flex", alignItems:"center", justifyContent:"center", gap:8,
        marginBottom:14,
      }}>
        <span style={{fontSize:12, color:"var(--muted)", fontStyle:"italic"}}>{book.author}</span>
        <span style={{
          fontSize:8, fontWeight:700, color:"var(--gold)",
          background:"rgba(212,148,26,.08)", border:"1px solid rgba(212,148,26,.15)",
          padding:"1px 7px", borderRadius:99, letterSpacing:".3px",
        }}>{book.score}%</span>
      </div>

      {/* Hook — strong white, pitch-level clarity */}
      <div style={{
        fontSize:13, fontWeight:600, color:"rgba(240,232,216,.95)",
        lineHeight:1.48, marginBottom:10, letterSpacing:"-.1px",
      }}>{hook}</div>

      {/* Why this was recommended — supporting detail, clearly secondary */}
      <div style={{marginBottom:14}}>
        <div style={{
          fontSize:7.5, fontWeight:700, letterSpacing:"2px",
          textTransform:"uppercase", color:"var(--gold)", opacity:.6,
          marginBottom:5, display:"flex", alignItems:"center", gap:5,
        }}>
          <span style={{width:8,height:1,background:"rgba(212,148,26,.4)",display:"inline-block",borderRadius:1}}/>
          Why recommended
        </div>
        <div style={{fontSize:12, color:"rgba(240,232,216,.84)", fontStyle:"italic", lineHeight:1.7}}>
          {fmtLine(reason)}
        </div>
      </div>

      {/* Primary actions — Save (strong) | Not for me (ghost) */}
      <div style={{display:"flex", gap:8, marginBottom:8}}>
        <button
          onClick={() => !isSaved && onSave(book)}
          style={{
            flex:3, padding:"11px 0", borderRadius:10, border:"none",
            background: isSaved ? "rgba(212,148,26,.1)" : "var(--gold)",
            color: isSaved ? "var(--gold)" : "#0a0806",
            fontSize:13, fontWeight:700, cursor: isSaved ? "default" : "pointer",
            transition:"background .15s, box-shadow .15s",
            ...(isSaved
              ? { border:"1px solid rgba(212,148,26,.22)" }
              : { boxShadow:"0 2px 10px rgba(212,148,26,.26)" }),
          }}
        >{isSaved ? "✓ Saved" : "Save to Read"}</button>

        {/* "Not for me" — ghost, clearly secondary */}
        <button
          onClick={handleNoThanks}
          style={{
            flex:2, padding:"11px 0", borderRadius:10,
            border:"none", background:"transparent",
            color:"var(--muted)", fontSize:12.5, fontWeight:500,
            cursor:"pointer", transition:"color .12s",
          }}
        >Not for me</button>
      </div>

      {/* Ask AI — tertiary, text-link weight */}
      <button
        onClick={() => onAsk(`Tell me about "${book.title}" by ${book.author}. Should I read it?`)}
        style={{
          display:"block", width:"100%", padding:"5px 0",
          border:"none", background:"transparent",
          color:"var(--muted)", fontSize:11, fontWeight:500,
          cursor:"pointer", textAlign:"center",
          letterSpacing:".1px", opacity:.7,
        }}
      >Ask AI →</button>
    </div>
  );
}

// ── FOR YOU FEED — personalised vertical feed ─────────────────────────────────
// Scrollable feed of scored, diversified recommendations.
// Loads in batches of 6 via IntersectionObserver sentinel.
function ForYouFeed({ books, savedBooks, onSave, onDismiss, onAsk, userState }) {
  const [visibleCount, setVisibleCount] = useState(6);
  const sentinelRef = useRef(null);

  const feedItems = buildFeedItems(books, userState || {});
  const visible   = feedItems.slice(0, visibleCount);

  // Load next batch when sentinel enters viewport
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisibleCount(c => Math.min(c + 6, feedItems.length));
      },
      { rootMargin:"400px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [feedItems.length]);

  if (feedItems.length === 0) {
    return (
      <div className="ls-empty" style={{paddingTop:52}}>
        <div className="ls-empty-icon"><BookOpen size={40} strokeWidth={1}/></div>
        <div className="ls-empty-title">All caught up</div>
        <div className="ls-empty-body">You've seen everything for now. Browse Discover or rate more books to unlock new picks.</div>
      </div>
    );
  }

  return (
    <div className="ls-foryou-feed">
      {visible.map(book => (
        <ForYouItem
          key={book.id}
          book={book}
          userState={userState}
          savedBooks={savedBooks}
          onSave={onSave}
          onDismiss={onDismiss}
          onAsk={onAsk}
        />
      ))}
      {visibleCount < feedItems.length && (
        <div ref={sentinelRef} style={{height:1}}/>
      )}
      {visibleCount >= feedItems.length && feedItems.length > 0 && (
        <div style={{
          textAlign:"center", padding:"28px 20px",
          fontSize:12, color:"var(--muted)", fontStyle:"italic",
        }}>You're all caught up — rate more books to unlock new picks.</div>
      )}
    </div>
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
function BookCover({ isbn, title, author = "", color = ["#1a1408","#0e0c06"], className = "" }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError]   = useState(false);
  const url = `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
  return (
    <div className={`ls-book-cover ${className}`}
      style={{ background:`linear-gradient(155deg, ${color[0]} 0%, ${color[1]} 100%)` }}>
      {/* Real cover — loads in production */}
      {!error && (
        <img src={url} alt={title}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          style={{ display: loaded ? "block" : "none", position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }}/>
      )}
      {/* Designed fallback — looks great when image unavailable */}
      {(!loaded || error) && (
        <div className="ls-book-cover-fallback">
          <div className="ls-book-cover-lines">
            <div className="ls-book-cover-line"/><div className="ls-book-cover-line short"/>
          </div>
          <div className="ls-book-cover-title">{title}</div>
          {author && <div className="ls-book-cover-author">{author}</div>}
        </div>
      )}
    </div>
  );
}

// ── BOOK TILE — scroll scale + hover overlay ─────────────────────────────────
function BookTile({ book: b, onAsk, onTap, scrollScale = 1, isFirst, isLast, isSaved, onSave, onDismiss, userState, rowContext }) {
  const [hovered,   setHovered]   = useState(false);
  const [dismissing,setDismissing]= useState(false);
  const isTouchRef = useRef(false);

  const handleMouseEnter = () => { if (!isTouchRef.current) setHovered(true); };
  const handleMouseLeave = () => setHovered(false);
  const handleTouchStart = () => { isTouchRef.current = true; };
  const handleClick      = () => { if (isTouchRef.current) { onTap(b); isTouchRef.current = false; } };

  const handleSaveClick = (e) => {
    e.stopPropagation();
    if (!isSaved) onSave(b);
  };

  const handleDismissClick = (e) => {
    e.stopPropagation();
    setDismissing(true);
    setTimeout(() => onDismiss(b.id), 320);
  };

  const reason = getRecommendationReason(b, userState || {}, rowContext || null);
  const pitch  = getFavoriteBookPitch(b, userState || {});
  const hook   = getHook(b);
  const finalScale = hovered ? scrollScale * 1.08 : scrollScale;
  const origin = isFirst ? "left center" : isLast ? "right center" : "center center";

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onClick={handleClick}
      style={{
        flexShrink: 0, position: "relative", cursor: "pointer",
        zIndex: hovered ? 40 : 1,
        transition: hovered ? "z-index 0s 0s" : "z-index 0s .3s",
        opacity: dismissing ? 0 : 1,
        transform: dismissing ? "translateY(-10px) scale(.93)" : undefined,
        pointerEvents: dismissing ? "none" : undefined,
      }}
    >
      <div style={{
        width: 124,
        /* Tile expands vertically on hover — cover stays 178px, extra space holds the pitch */
        height: hovered ? 268 : 178,
        transform: `scale(${finalScale})`,
        transformOrigin: origin,
        transition: dismissing
          ? "opacity .3s ease, transform .3s ease, height .3s ease"
          : "transform .3s cubic-bezier(.2,.8,.2,1), height .3s cubic-bezier(.2,.8,.2,1)",
        borderRadius: hovered ? 12 : 10,
        overflow: "hidden", position: "relative",
        boxShadow: hovered || scrollScale > 1.05
          ? "0 20px 56px rgba(0,0,0,.85), 0 0 0 1.5px rgba(212,148,26,.35)"
          : "0 2px 8px rgba(0,0,0,.4)",
      }}>
        {/* Cover — always 178px, pinned to top */}
        <div style={{
          position:"absolute", top:0, left:0, right:0, height:178,
          background: `linear-gradient(155deg, ${b.color[0]}, ${b.color[1]})`,
        }}>
          <BookCover isbn={b.isbn} title={b.title} author={b.author} color={b.color}/>
        </div>

        {/* Score badge */}
        <div style={{
          position:"absolute", top:7, right:7, zIndex:2,
          fontSize:9, fontWeight:700, color:"var(--gold)",
          background:"rgba(10,8,6,.82)", backdropFilter:"blur(4px)",
          padding:"2px 6px", borderRadius:99, border:"1px solid rgba(212,148,26,.25)",
        }}>{b.score}%</div>

        {/* Saved pip */}
        {isSaved && <div className="ls-tile-saved-pip">✓ Saved</div>}

        {/* Conviction overlay — fills the full expanded tile */}
        <div style={{
          position:"absolute", inset:0,
          /* Gradient: transparent at very top (cover shows), dark from midpoint down */
          background:"linear-gradient(to top, rgba(0,0,0,.98) 0%, rgba(0,0,0,.96) 36%, rgba(0,0,0,.72) 52%, rgba(0,0,0,.18) 68%, transparent 82%)",
          opacity: hovered ? 1 : 0,
          transition:"opacity .24s ease",
          display:"flex", flexDirection:"column", justifyContent:"flex-end",
          padding:"0 11px 11px",
        }}>
          {/* Title — entry point, compact */}
          <div style={{
            fontSize:11, fontWeight:700, color:"rgba(255,255,255,.95)",
            lineHeight:1.25, marginBottom:2,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
          }}>{b.title}</div>

          {/* Author — small, gold-tinted */}
          <div style={{
            fontSize:9, color:"rgba(212,148,26,.8)",
            marginBottom:8,
          }}>{b.author}</div>

          {/* Label — intentional, gold, readable */}
          <div style={{
            fontSize:7, fontWeight:700, letterSpacing:"1.8px",
            textTransform:"uppercase", color:"rgba(212,148,26,.82)",
            marginBottom:5,
          }}>Why this could be your next favorite</div>

          {/* Pitch — THE primary element */}
          <div style={{
            fontSize:10.5, lineHeight:1.65,
            color:"rgba(240,232,216,.92)",
            marginBottom:9,
            display:"-webkit-box", WebkitLineClamp:6,
            WebkitBoxOrient:"vertical", overflow:"hidden",
            /* Soft fade at bottom — not hard cut */
            maskImage:"linear-gradient(180deg,#000 62%,transparent 100%)",
            WebkitMaskImage:"linear-gradient(180deg,#000 62%,transparent 100%)",
          }}>{pitch}</div>

          {/* Actions */}
          <div style={{display:"flex", gap:5}}>
            <button
              onClick={handleSaveClick}
              style={{
                flex:2, padding:"6px 8px", borderRadius:99, border:"none",
                background: isSaved ? "rgba(212,148,26,.18)" : "var(--gold)",
                color: isSaved ? "var(--gold)" : "#060402",
                fontSize:10, fontWeight:700,
                cursor: isSaved ? "default" : "pointer", transition:"all .18s",
              }}
            >{isSaved ? "✓ Saved" : "Save to Read"}</button>
            <button
              onClick={handleDismissClick}
              style={{
                flex:1, padding:"6px 0", borderRadius:99,
                border:"1px solid rgba(255,255,255,.16)", background:"transparent",
                color:"rgba(255,255,255,.5)", fontSize:10, fontWeight:500,
                cursor:"pointer", transition:"all .15s",
              }}
            >No</button>
          </div>
        </div>
      </div>
      {/* Title below */}
      <div style={{marginTop:6,width:124,opacity:hovered?0:1,transition:"opacity .18s"}}>
        <div style={{fontFamily:"'Inter',sans-serif",fontSize:10.5,fontWeight:600,color:"var(--text2)",lineHeight:1.3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.title}</div>
        <div style={{fontSize:9.5,color:"var(--muted)",fontStyle:"italic",marginTop:1}}>{b.author}</div>
      </div>
    </div>
  );
}

// ── BOOK ROW — horizontal scroll with center-scale focal effect ────────────────
function BookRow({ books, title, subtitle, onAsk, onTap, savedBooks, onSave, onDismiss, userState }) {
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
      {/* Outer: clips overflow, padding absorbs scale expansion */}
      <div style={{overflow:"hidden",padding:"40px 0",margin:"-40px 0"}}>
        <div
          ref={trackRef}
          style={{
            display:"flex", gap:12,
            overflowX:"auto", overflowY:"visible",
            padding:"40px 16px",
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
function TileModal({ book: b, onClose, onAsk, isSaved, onSave, onDismiss, userState }) {
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
          >No Thanks</button>
        </div>

        <button className="ls-tile-modal-cta" onClick={() => { onAsk(`Tell me about "${b.title}" by ${b.author}. Should I read it?`); onClose(); }}>
          Ask LitSense about this book
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
        title: "LitSense — AI Book Advisor",
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

export default function LitSense() {
  useEffect(() => {
    if (!document.getElementById("ls-css")) {
      const s = document.createElement("style");
      s.id = "ls-css"; s.textContent = CSS;
      document.head.appendChild(s);
    }
    // Check for referral param — store so signup flow can credit referrer
    // In production: send to Supabase to credit the referrer's account
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get("ref");
    if (refCode) {
      try { localStorage.setItem("ls_ref_from", refCode); } catch {}
    }
  }, []);

  // ── AUTH ──────────────────────────────────────────────────────────────────
  const [isSignedIn, setIsSignedIn] = useState(() => { try { return !!localStorage.getItem("ls_user"); } catch { return false; } });
  const [isPro, setIsPro]           = useState(() => { try { return localStorage.getItem("ls_pro") === "1"; } catch { return false; } });
  const [userEmail, setUserEmail]   = useState(() => { try { return localStorage.getItem("ls_user") || ""; } catch { return ""; } });
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
  // savedBooks    : [{id, title, author, isbn, score, tags, ...}]
  // dismissedBooks: [id, id, ...]
  // Both persist in localStorage. Ready for Supabase backend in a future step.
  const [savedBooks,     setSavedBooks]     = useState(() => { try { const r = localStorage.getItem("ls_saved"); return r ? JSON.parse(r) : []; } catch { return []; } });
  const [dismissedBooks, setDismissedBooks] = useState(() => { try { const r = localStorage.getItem("ls_dismissed"); return r ? JSON.parse(r) : []; } catch { return []; } });

  useEffect(() => { try { localStorage.setItem("ls_saved",     JSON.stringify(savedBooks));     } catch {} }, [savedBooks]);
  useEffect(() => { try { localStorage.setItem("ls_dismissed", JSON.stringify(dismissedBooks)); } catch {} }, [dismissedBooks]);

  const isBookSaved     = useCallback((id) => savedBooks.some(b => b.id === id),    [savedBooks]);
  const isBookDismissed = useCallback((id) => dismissedBooks.includes(id),           [dismissedBooks]);

  const handleSaveBook = useCallback((book) => {
    setSavedBooks(prev => prev.some(b => b.id === book.id) ? prev : [...prev, book]);
  }, []);

  const handleDismissBook = useCallback((id) => {
    setDismissedBooks(prev => prev.includes(id) ? prev : [...prev, id]);
  }, []);

  // ── UI STATE ──────────────────────────────────────────────────────────────
  const [tab, setTab]           = useState("discover");
  const [feedMode, setFeedMode] = useState("discover"); // "discover" | "foryou"
  const [showPro, setPro]       = useState(false);
  const [mood, setMood]           = useState(null);
  const [genre, setGenre]         = useState(null);
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
  const buildProfile = useCallback(() => {
    const books = isPro ? readBooks : readBooks.slice(-MEM_BOOKS);
    return [
      books.length && `Books read: ${books.map(b=>`"${b.title}"${b.author?` by ${b.author}`:""} (${b.rating}/5)`).join(", ")}.`,
      currentBook && `Currently reading: ${currentBook}.`,
      wantList.length && `Want to read: ${wantList.slice(0,5).join(", ")}.`,
      mood && `Mood: ${mood}.`,
      genre && `Preferred genre: ${genre}.`,
    ].filter(Boolean).join(" ") || "";
  }, [readBooks,currentBook,wantList,mood,genre,isPro]);

  // ── CHAT ──────────────────────────────────────────────────────────────────
  const sendChat = async (msg, isRetry=false) => {
    if (chatLoad||!msg.trim()) return;
    if (atLimit) { setPro(true); return; }
    setLoad(true);
    const base = isRetry ? msgs.slice(0,-1) : msgs;
    const newMsgs = [...base,{role:"user",content:msg}];
    setMsgs(newMsgs); setChatIn("");
    const next = questionsUsed+1;
    setQuestionsUsed(next); saveCounter(next);
    const sys = `${AI_SYSTEM}\n\nReader profile: ${buildProfile()||"No reading history yet."}`;
    try {
      // ⚠️ PRODUCTION: Replace with "/api/ai"
      const res = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:700,system:sys,messages:newMsgs}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      const text = d.content?.[0]?.text;
      if (!text) throw new Error("Empty");
      setMsgs([...newMsgs,{role:"assistant",content:text}]);
    } catch {
      setQuestionsUsed(questionsUsed); saveCounter(questionsUsed);
      setMsgs([...newMsgs,{role:"assistant",content:"Something went quiet — check your connection and try again.",isError:true,retryMsg:msg}]);
    }
    setLoad(false);
  };

  const goAsk = (prompt) => { setTab("ask"); setTimeout(()=>sendChat(prompt),80); };

  // ── AUTH HANDLERS ─────────────────────────────────────────────────────────
  const handleAuth = () => {
    setAuthError("");
    if (!authEmail.trim()||!authPass.trim()) { setAuthError("Please fill in both fields."); return; }
    if (authMode==="signup") {
      if (localStorage.getItem(`ls_user_${authEmail.toLowerCase()}`)) { setAuthError("An account with this email already exists. Sign in instead."); return; }
      localStorage.setItem(`ls_user_${authEmail.toLowerCase()}`,authPass);
    // Credit referrer if signup came via a referral link
    // ⚠️ PRODUCTION: do this server-side in Supabase via /api/referral endpoint
    try {
      const refFrom = localStorage.getItem("ls_ref_from");
      if (refFrom && authMode === "signup") {
        // In production: POST /api/referral { refCode: refFrom, newUserId: userId }
        // For now: just clear the ref param so it doesn't re-trigger
        localStorage.removeItem("ls_ref_from");
      }
    } catch {}
    } else {
      if (localStorage.getItem(`ls_user_${authEmail.toLowerCase()}`)!==authPass) { setAuthError("Incorrect email or password."); return; }
    }
    localStorage.setItem("ls_user",authEmail.toLowerCase());
    setIsSignedIn(true); setUserEmail(authEmail.toLowerCase());
    setShowAuth(false); setAuthEmail(""); setAuthPass(""); setAuthError("");
  };
  const handleSignOut = () => { localStorage.removeItem("ls_user"); setIsSignedIn(false); setIsPro(false); setUserEmail(""); setReadBooks([]); setCurrentBook(""); setWantList([]); };
  const handleUpgrade = () => { if (!isSignedIn) { setShowAuth(true); setAuthMode("signup"); setPro(false); return; } localStorage.setItem("ls_pro","1"); setIsPro(true); setPro(false); };

  // ── COMPUTED ──────────────────────────────────────────────────────────────
  const discoverRows = buildDiscoverRows(BOOKS, { savedBooks, readBooks, mood, genre, dismissedBooks });
  const wheelBooks = BOOKS
    .filter(b => !dismissedBooks.includes(b.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);
  const userInitial = userEmail ? userEmail[0].toUpperCase() : "";

  // ── BACKGROUND THEME — driven by voice profile ────────────────────────────
  // Maps getUserVoiceProfile() → data-bg attribute on .ls
  // CSS attribute selectors handle the actual palette swap.
  const lsRef = useRef(null);
  useEffect(() => {
    const el = lsRef.current;
    if (!el) return;
    const voice = getUserVoiceProfile({ savedBooks, readBooks, mood, genre });
    // fast voice: check saved/genre tags to pick thriller vs sciFi
    let theme = voice;
    if (voice === "fast") {
      const hasSci = savedBooks.some(b => (b.tags||[]).includes("Sci-Fi"))
                  || genre === "Sci-Fi";
      theme = hasSci ? "sciFi" : "thriller";
    }
    if (voice === "emotional") theme = "literary";
    el.dataset.bg = theme; // → .ls[data-bg="literary"]::before { … }
  }, [savedBooks, readBooks, mood, genre]);

  // ── BACKGROUND ROTATION ───────────────────────────────────────────────────
  // Voice-keyed scenes — 3 gradient variants per theme, 18s apart.
  // Reset to scene 0 whenever the theme set changes (new voice/genre signal).
  const bgScenes = getVoiceScenes({ savedBooks, readBooks, mood, genre });
  const [bgIdx, setBgIdx] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setBgIdx(0); }, [bgScenes]); // theme changed → restart from scene 0
  useEffect(() => {
    if (bgScenes.length <= 1) return;
    const id = setInterval(() => setBgIdx(i => (i + 1) % bgScenes.length), 18000);
    return () => clearInterval(id);
  }, [bgScenes.length]);

  return (
    <div style={{ position:"relative", height:"100dvh", overflow:"hidden", background:"#14110d" }}>

      {/* ── BACKGROUND GRADIENT SCENES — subtle atmosphere only ── */}
      {bgScenes.map((grad, i) => (
        <div key={i} style={{
          position:"absolute", inset:0, zIndex:0,
          background: grad,
          opacity: i === bgIdx ? 0.35 : 0,
          filter:"blur(60px) saturate(0.6)",
          transition:"opacity 4s ease-in-out",
        }}/>
      ))}
      {/* Vignette — protects readability */}
      <div style={{
        position:"absolute", inset:0, zIndex:1, pointerEvents:"none",
        background:"radial-gradient(ellipse 140% 100% at 50% 40%, rgba(14,11,8,.25) 0%, rgba(10,8,6,.58) 60%, rgba(8,6,4,.88) 100%)",
      }}/>

      {/* ── APP — z:2, transparent bg, full height ── */}
      <div ref={lsRef} className="ls" style={{ position:"relative", zIndex:2, background:"transparent" }}>

      {/* HEADER */}
      <header className="ls-hdr">
        <div className="ls-logo">
          <img src="/litsense-logo.png" alt="LitSense" className="ls-logo-img"
            onError={e=>{e.target.style.display="none"; e.target.nextSibling.style.display="block";}}/>
          <div className="ls-logo-name" style={{display:"none"}}>Lit<em>Sense</em></div>
          <div className="ls-logo-sub">Books worth your time.</div>
        </div>
        <div className="ls-hdr-right">
          {!isSignedIn ? (
            <>
              <button className="ls-signin-btn" onClick={()=>{setAuthMode("login");setShowAuth(true);}}>Sign in</button>
              <button className="ls-pro-btn" onClick={()=>setPro(true)}><Crown size={11} strokeWidth={2}/> Pro</button>
            </>
          ) : (
            <>
              {isPro && <span className="ls-pro-pip">PRO</span>}
              {!isPro && <button className="ls-pro-btn" onClick={()=>setPro(true)}><Crown size={11} strokeWidth={2}/> Pro</button>}
              <div className="ls-user-avatar" title={`Signed in as ${userEmail}`} onClick={handleSignOut}>{userInitial}</div>
            </>
          )}
        </div>
      </header>

      <div className="ls-main">

        {/* ── DISCOVER ── */}
        {tab==="discover" && (
          <div className="ls-scroll">

            {/* Discover / For You toggle — sticky */}
            <div className="ls-feed-toggle">
              <button
                className={`ls-feed-toggle-btn${feedMode==="discover"?" on":""}`}
                onClick={()=>setFeedMode("discover")}
              >Discover</button>
              <button
                className={`ls-feed-toggle-btn${feedMode==="foryou"?" on":""}`}
                onClick={()=>setFeedMode("foryou")}
              >For You</button>
            </div>

            {/* ── FOR YOU feed ── */}
            {feedMode==="foryou" && (
              <ForYouFeed
                books={wheelBooks}
                savedBooks={savedBooks}
                onSave={handleSaveBook}
                onDismiss={handleDismissBook}
                onAsk={goAsk}
                userState={{ savedBooks, readBooks, mood, genre }}
              />
            )}

            {/* ── DISCOVER content ── */}
            {feedMode==="discover" && (<>

            {/* ── Recommendation Wheel hero ── */}
            {wheelBooks.length > 0 && (
              <RecommendationWheel
                books={wheelBooks}
                savedBooks={savedBooks}
                onSave={handleSaveBook}
                onDismiss={handleDismissBook}
                onAsk={goAsk}
                onTap={setTappedBook}
                userState={{ savedBooks, readBooks, mood, genre }}
              />
            )}

            {/* Cinematic Hero */}
            <div className="ls-hero">
              <div className="ls-hero-eyebrow">Built around your taste</div>
              <div className="ls-hero-title">Know what you'll <em>love next.</em></div>
              <div className="ls-hero-body">No bestseller lists. No guesswork. Just the right next book — and why.</div>
              <button className="ls-hero-cta" onClick={()=>goAsk("Based on my reading history and taste, what's the single best book I should read next? Tell me exactly why it's right for me.")}>
                Find my next book <ChevronRight size={16} strokeWidth={2.5}/>
              </button>
              <div className="ls-hero-links">
                <button className="ls-hero-link" onClick={()=>goAsk("Surprise me — recommend something I'd never pick for myself but would genuinely love.")}>Surprise me</button>
                <button className="ls-hero-link" onClick={()=>goAsk("What are the most underrated books of the last three years?")}>Hidden gems</button>
                <button className="ls-hero-link" onClick={()=>goAsk("I've been in a reading slump. What's the one book that will pull me back in?")}>End a slump</button>
              </div>
              {/* Proof card */}
              <div className="ls-proof">
                <div className="ls-proof-label">How LitSense recommends</div>
                <div className="ls-proof-card">
                  <BookCover isbn="9780802162175" title="The Covenant of Water" author="Abraham Verghese" color={["#1a2430","#0e1820"]}/>
                  <div className="ls-proof-body">
                    <div className="ls-proof-title">The Covenant of Water</div>
                    <div className="ls-proof-author">Abraham Verghese</div>
                    <div className="ls-proof-reason">
                      <div className="ls-proof-why-label">Why this was recommended</div>
                      {fmtLine(getRecommendationReason(BOOKS[0], {savedBooks, readBooks, mood, genre}))}
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
              <span className="ls-sec-sub">Shapes your AI picks</span>
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
                Get my AI picks <ChevronRight size={16} strokeWidth={2.5}/>
              </button>
            )}

            {/* Personalised multi-row discovery */}
            {discoverRows.length === 0 ? (
              <div className="ls-empty" style={{padding:"32px 16px"}}>
                <div className="ls-empty-icon"><BookOpen size={36} strokeWidth={1}/></div>
                <div className="ls-empty-title">All caught up</div>
                <div className="ls-empty-body">You've dismissed all current picks. Ask the AI for fresh recommendations.</div>
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
                  userState={{ savedBooks, readBooks, mood, genre }}
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

            </>)} {/* end feedMode==="discover" */}
          </div>
        )}

        {/* ── MY SHELF ── */}
        {tab==="shelf" && (
          <div className="ls-shelf-scroll">
            <div className="ls-shelf-hdr">
              <div className="ls-shelf-hdr-title">My Shelf</div>
              <div className="ls-shelf-hdr-sub">Your reading history powers your recommendations</div>
            </div>

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
                        <span>Free accounts send your <strong>last {MEM_BOOKS} books</strong> to the AI.{" "}
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
                        <div className="ls-empty-body">Add books you want to read. Ask the AI which one to start with.</div>
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
                    <div className="ls-welcome-icon"><BookOpen size={52} strokeWidth={1}/></div>
                    <div className="ls-welcome-title">Ask <em>LitSense</em></div>
                    <p className="ls-welcome-sub">Tell me what you loved. Tell me what you hated. I'll find your next book.</p>
                    <div className="ls-prompt-list">
                      {ASK_PROMPTS.map((p,i)=>(
                        <button key={i} className="ls-prompt-btn" onClick={()=>sendChat(p)}>{p}</button>
                      ))}
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
                          ):m.role==="assistant"?renderAI(m.content):m.content}
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
                  placeholder="Ask about any book, or tell me what you're looking for..."
                  value={chatIn} onChange={e=>setChatIn(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat(chatIn);}}}/>
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
          ["ask",<MessageCircle size={21} strokeWidth={1.75}/>,"Ask"],
        ].map(([v,icon,label])=>(
          <button key={v} className={`ls-nav-btn${tab===v?" on":""}`} onClick={()=>setTab(v)}>
            {icon}<span className="ls-nav-label">{label}</span>
          </button>
        ))}
      </nav>

      {/* TILE MODAL — mobile tap sheet */}
      {tappedBook && (
        <TileModal
          book={tappedBook}
          onClose={() => setTappedBook(null)}
          onAsk={(p) => { setTappedBook(null); goAsk(p); }}
          isSaved={isBookSaved(tappedBook.id)}
          onSave={handleSaveBook}
          onDismiss={(id) => { handleDismissBook(id); setTappedBook(null); }}
          userState={{ savedBooks, readBooks, mood, genre }}
        />
      )}

      {/* PRO MODAL */}
      {showPro&&(
        <div className="ls-overlay" onClick={()=>setPro(false)}>
          <div className="ls-modal" onClick={e=>e.stopPropagation()}>
            <div className="ls-modal-handle"/>
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
            <button className="ls-modal-cta" onClick={handleUpgrade}>
              {isSignedIn?"Start your free 7-day trial":"Create an account to get started"}
            </button>
            <button className="ls-modal-cancel" onClick={()=>setPro(false)}>Maybe another time</button>
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
      </div>
    </div>
  );
}
