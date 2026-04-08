/**
 * LitSense — AI Book Advisor
 * v7 · Auth + Counter + Gates
 *
 * ⚠️  PRODUCTION DEPLOYMENT NOTE:
 * 1. Replace simulated auth (useAuth hook below) with Clerk:
 *      Replace the useAuth hook below with Clerk hooks:
 *        useUser() → { user, isSignedIn }
 *        useClerk() → { openSignIn, openSignUp, signOut }
 *
 * 2. Replace question counter (localStorage) with server-side check in /api/ai:
 *    - Read user's daily count from Supabase
 *    - Return 429 if over limit
 *    - Increment count on success
 *
 * 3. Replace simulated Pro check with Stripe webhook → Supabase:
 *    - Stripe sends webhook on payment → mark user as Pro in Supabase
 *    - /api/ai reads Pro status from Supabase before processing
 *
 * 4. Replace fetch URL with "/api/ai" before deploying.
 *    Direct Anthropic calls expose your API key in the browser.
 *
 * 5. Replace shelf localStorage with Supabase reads/writes per user.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  BookOpen, BookMarked, MessageCircle, Search,
  Star, Sun, Brain, Heart, Lightbulb, Smile, Moon,
  Plus, X, Send, Crown, ChevronRight, RotateCcw,
  Library, Bookmark, Sparkles, LogOut, User, Lock,
} from "lucide-react";

// ─── LIMITS ───────────────────────────────────────────────────────────────────
const LIMIT_ANON  = 3;   // questions/day without account
const LIMIT_FREE  = 5;   // questions/day with free account
const MEM_BOOKS   = 5;   // books sent to AI for free accounts (Pro = all)

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=DM+Sans:wght@300;400;500;600&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }

.ls {
  font-family: 'DM Sans', sans-serif;
  height: 100dvh; display: flex; flex-direction: column; overflow: hidden;
  background: #f4efe6; color: #28200e;

  --amber:       #a06c10;
  --amber-rich:  #b87c18;
  --amber-l:     #fdf6e8;
  --amber-m:     #f5e4b8;
  --amber-d:     #7a5008;
  --sage:        #4a7858;
  --sage-l:      #edf4ef;
  --rust:        #a84828;

  --bg:          #f4efe6;
  --bg2:         #ede6d8;
  --card:        #fffcf5;
  --border:      #d8ccb4;
  --border2:     #e8e0cc;

  --text:        #28200e;
  --text2:       #4a3820;
  --muted:       #7a6040;
  --faint:       #b0987c;

  --shadow-sm:   rgba(40,32,14,.06);
  --shadow-md:   rgba(40,32,14,.10);
  --shadow-lg:   rgba(40,32,14,.16);

  --radius-sm:   8px;
  --radius-md:   12px;
  --radius-lg:   16px;
  --radius-pill: 99px;
}
.ls ::-webkit-scrollbar { display: none; }

/* ── HEADER ── */
.ls-hdr {
  height: 54px; min-height: 54px; padding: 0 16px;
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid var(--border2);
  background: rgba(244,239,230,.97);
  backdrop-filter: blur(10px);
  flex-shrink: 0; z-index: 10;
}
.ls-logo { display: flex; flex-direction: column; }
.ls-logo-img { height: 32px; width: auto; display: block; object-fit: contain; }
.ls-logo-name {
  font-family: 'Lora', serif;
  font-size: 22px; font-weight: 700; letter-spacing: -.4px; line-height: 1; color: var(--text);
}
.ls-logo-name em { color: var(--amber); font-style: italic; }
.ls-logo-sub {
  font-size: 9px; font-weight: 600; letter-spacing: 2px;
  text-transform: uppercase; color: var(--muted); margin-top: 2px;
}
.ls-hdr-right { display: flex; align-items: center; gap: 8px; }
.ls-signin-btn {
  padding: 6px 13px; border-radius: var(--radius-pill);
  border: 1.5px solid var(--border);
  background: transparent; color: var(--text2);
  font-size: 11px; font-weight: 600; cursor: pointer; transition: all .15s;
}
.ls-signin-btn:hover { border-color: var(--amber); color: var(--amber); }
.ls-pro-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 14px; border-radius: var(--radius-pill);
  border: 1.5px solid var(--amber);
  color: var(--amber); background: transparent;
  font-size: 11px; font-weight: 700; letter-spacing: .5px;
  cursor: pointer; transition: all .15s;
}
.ls-pro-btn:hover { background: var(--amber-l); }
.ls-user-avatar {
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--amber-m); border: 1.5px solid rgba(160,108,16,.25);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: var(--amber-d); cursor: pointer;
  flex-shrink: 0;
}
.ls-pro-pip {
  font-size: 8px; font-weight: 700; letter-spacing: .5px;
  color: var(--amber); background: var(--amber-m);
  border: 1px solid rgba(160,108,16,.2);
  padding: 2px 6px; border-radius: var(--radius-pill);
}

/* ── BOTTOM NAV ── */
.ls-nav {
  display: flex; border-top: 1px solid var(--border2);
  background: rgba(244,239,230,.98); flex-shrink: 0;
  padding-bottom: env(safe-area-inset-bottom, 0);
}
.ls-nav-btn {
  flex: 1; padding: 10px 4px 8px; border: none; background: transparent;
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  cursor: pointer; color: var(--muted); transition: color .15s;
}
.ls-nav-btn.on { color: var(--amber); }
.ls-nav-label {
  font-family: 'Lora', serif; font-size: 9px; font-weight: 500; font-style: italic; color: inherit;
}

/* ── LAYOUT ── */
.ls-main { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.ls-scroll { flex: 1; overflow-y: auto; padding: 16px 14px 28px; }

/* ── SECTION HEADER ── */
.ls-sec-hdr { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.ls-sec-hdr.spaced { margin-top: 18px; }
.ls-sec-title {
  font-family: 'Lora', serif; font-size: 11px; font-weight: 700; font-style: italic;
  color: var(--text); white-space: nowrap;
}
.ls-sec-note { font-size: 9px; font-weight: 600; letter-spacing: .5px; color: var(--muted); white-space: nowrap; }
.ls-sec-rule { flex: 1; height: 1px; background: var(--border2); }

/* ── HERO ── */
.ls-hero {
  border-radius: var(--radius-lg);
  background: linear-gradient(140deg, #fffaf0 0%, #fdf2dc 100%);
  border: 1px solid var(--border2);
  padding: 20px 20px 18px; margin-bottom: 20px;
  position: relative; overflow: hidden; box-shadow: 0 2px 16px var(--shadow-sm);
}
.ls-hero::before {
  content: '\u201C';
  position: absolute; right: 8px; top: -14px;
  font-family: 'Lora', serif; font-size: 140px;
  color: rgba(160,108,16,.06); line-height: 1;
  pointer-events: none; user-select: none;
}
.ls-hero-eyebrow {
  font-size: 9px; font-weight: 700; letter-spacing: 2.5px;
  text-transform: uppercase; color: var(--amber); margin-bottom: 8px;
}
.ls-hero-title {
  font-family: 'Lora', serif; font-size: 21px; font-weight: 700;
  line-height: 1.35; color: var(--text); margin-bottom: 8px;
}
.ls-hero-title em { color: var(--amber); font-style: italic; }
.ls-hero-body { font-size: 13px; line-height: 1.7; color: var(--text2); margin-bottom: 16px; }
.ls-hero-cta {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 11px 18px; border: none; border-radius: var(--radius-pill);
  background: var(--amber); color: #fff;
  font-family: 'Lora', serif; font-size: 13px; font-weight: 600; font-style: italic;
  cursor: pointer; transition: all .15s;
  box-shadow: 0 2px 10px rgba(160,108,16,.28); margin-bottom: 12px;
}
.ls-hero-cta:hover { background: var(--amber-rich); transform: translateY(-1px); }
.ls-hero-links { display: flex; gap: 8px; flex-wrap: wrap; }
.ls-hero-link {
  padding: 6px 13px; border-radius: var(--radius-pill);
  border: 2px solid var(--border);
  background: var(--card); color: var(--text2);
  font-size: 11px; font-weight: 600; cursor: pointer; transition: all .15s;
}
.ls-hero-link:hover { border-color: var(--amber); color: var(--amber); background: var(--amber-l); }

/* ── MOOD ── */
.ls-mood-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-bottom: 18px; }
.ls-mood-card {
  border-radius: var(--radius-md); border: 1.5px solid var(--border2); background: var(--card);
  padding: 12px 6px 10px; cursor: pointer; text-align: center;
  transition: all .18s; box-shadow: 0 1px 4px var(--shadow-sm);
}
.ls-mood-card:hover { border-color: var(--amber-d); transform: translateY(-1px); box-shadow: 0 3px 8px var(--shadow-sm); }
.ls-mood-card.on { border-color: var(--amber); background: var(--amber-l); box-shadow: 0 2px 10px rgba(160,108,16,.14); }
.ls-mood-icon { display: flex; align-items: center; justify-content: center; height: 26px; margin-bottom: 5px; color: var(--muted); transition: color .18s; }
.ls-mood-card.on .ls-mood-icon { color: var(--amber); }
.ls-mood-name { font-family: 'Lora', serif; font-size: 11px; font-weight: 600; font-style: italic; color: var(--text2); }
.ls-mood-card.on .ls-mood-name { color: var(--amber-d); }
.ls-mood-sub { font-size: 9px; color: var(--muted); margin-top: 2px; line-height: 1.4; }
.ls-mood-banner {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-radius: var(--radius-sm);
  background: var(--amber-m); border: 1px solid rgba(160,108,16,.2);
  margin-bottom: 10px; margin-top: -6px;
}
.ls-mood-banner-text { font-size: 12px; color: var(--amber-d); font-weight: 500; font-family: 'Lora', serif; font-style: italic; }
.ls-mood-banner-clear { background: transparent; border: none; color: var(--amber); font-size: 11px; cursor: pointer; font-weight: 600; padding: 0; }

/* ── GENRE ── */
.ls-genre-rail { display: flex; gap: 6px; overflow-x: auto; margin-bottom: 18px; padding-bottom: 2px; }
.ls-genre-pill {
  padding: 6px 14px; border-radius: var(--radius-pill);
  border: 1.5px solid var(--border); background: var(--card); color: var(--text2);
  font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s; white-space: nowrap; flex-shrink: 0;
}
.ls-genre-pill:hover { border-color: var(--amber); color: var(--amber-d); background: var(--amber-l); }
.ls-genre-pill.on { background: var(--amber-m); border-color: var(--amber); color: var(--amber-d); font-weight: 600; }
.ls-filter-cta {
  width: 100%; padding: 12px; margin-bottom: 18px;
  background: var(--text); color: var(--amber-l);
  border: none; border-radius: var(--radius-md);
  font-family: 'Lora', serif; font-size: 14px; font-weight: 600; font-style: italic;
  cursor: pointer; transition: all .15s;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  box-shadow: 0 3px 12px var(--shadow-md);
}
.ls-filter-cta:hover { opacity: .9; transform: translateY(-1px); }

/* ── BOOK CARDS ── */
.ls-book-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.ls-book-card {
  border-radius: var(--radius-md); border: 1px solid var(--border2); background: var(--card);
  padding: 14px; display: flex; gap: 12px; cursor: pointer;
  transition: all .15s; box-shadow: 0 1px 6px var(--shadow-sm);
}
.ls-book-card:hover { border-color: var(--border); box-shadow: 0 4px 14px var(--shadow-md); transform: translateY(-1px); }
.ls-book-spine {
  width: 52px; min-width: 52px; height: 72px; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  background: var(--bg2); border: 1px solid var(--border2); color: var(--amber); flex-shrink: 0;
}
.ls-book-info { flex: 1; min-width: 0; }
.ls-book-title { font-family: 'Lora', serif; font-size: 14px; font-weight: 600; line-height: 1.35; color: var(--text); margin-bottom: 2px; }
.ls-book-author { font-size: 11px; font-style: italic; color: var(--muted); margin-bottom: 7px; }
.ls-book-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 7px; }
.ls-book-tag { padding: 2px 7px; border-radius: 6px; font-size: 9px; font-weight: 600; letter-spacing: .3px; background: var(--bg2); border: 1px solid var(--border2); color: var(--text2); }
.ls-book-tag.primary { background: var(--amber-m); border-color: rgba(160,108,16,.25); color: var(--amber-d); }
.ls-book-why { font-size: 12px; line-height: 1.7; color: var(--text2); font-style: italic; }
.ls-book-score {
  width: 26px; min-width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%; font-size: 9px; font-weight: 700;
  background: var(--bg2); border: 1px solid var(--border2);
  color: var(--muted); flex-shrink: 0; align-self: flex-start; margin-top: 2px;
}

/* ── CALLOUT ── */
.ls-callout { border-radius: var(--radius-md); padding: 11px 13px; margin-bottom: 10px; display: flex; gap: 9px; align-items: flex-start; font-size: 12px; line-height: 1.6; }
.ls-callout.info { background: var(--amber-l); border: 1px solid rgba(160,108,16,.18); color: var(--amber-d); }
.ls-callout-icon { flex-shrink: 0; margin-top: 1px; }

/* ── SHELF ── */
.ls-shelf-hdr { margin-bottom: 16px; }
.ls-shelf-hdr-title { font-family: 'Lora', serif; font-size: 20px; font-weight: 700; font-style: italic; color: var(--text); margin-bottom: 3px; }
.ls-shelf-hdr-sub { font-size: 12px; color: var(--text2); }
.ls-status-tabs { display: flex; gap: 4px; margin-bottom: 14px; background: var(--bg2); border-radius: var(--radius-md); padding: 4px; }
.ls-status-tab { flex: 1; padding: 7px 4px; border-radius: var(--radius-sm); border: none; background: transparent; color: var(--text2); font-family: 'Lora', serif; font-size: 11px; font-weight: 500; font-style: italic; cursor: pointer; text-align: center; transition: all .15s; }
.ls-status-tab.on { background: var(--card); color: var(--amber-d); box-shadow: 0 1px 4px var(--shadow-sm); font-weight: 600; }

/* ── SHELF GATE (no account) ── */
.ls-shelf-gate {
  display: flex; flex-direction: column; align-items: center;
  text-align: center; padding: 36px 20px; gap: 10px;
}
.ls-shelf-gate-icon { color: var(--amber); margin-bottom: 4px; }
.ls-shelf-gate-title { font-family: 'Lora', serif; font-size: 18px; font-weight: 700; color: var(--text); }
.ls-shelf-gate-body { font-size: 13px; color: var(--text2); max-width: 230px; line-height: 1.7; }

/* ── INPUT CARD ── */
.ls-input-card { background: var(--card); border: 1px solid var(--border2); border-radius: var(--radius-md); padding: 14px; margin-bottom: 12px; box-shadow: 0 1px 6px var(--shadow-sm); }
.ls-input-label { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
.ls-input-row { display: flex; gap: 8px; }
.ls-input { flex: 1; background: var(--bg2); border: 1.5px solid var(--border2); border-radius: var(--radius-sm); color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 13px; padding: 9px 12px; outline: none; transition: border-color .2s; }
.ls-input:focus { border-color: var(--amber); }
.ls-input::placeholder { color: var(--muted); }
.ls-input.full { width: 100%; }
.ls-add-btn { padding: 9px 14px; border-radius: var(--radius-sm); border: none; background: var(--amber); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: opacity .15s; flex-shrink: 0; }
.ls-add-btn:hover { opacity: .88; }

/* ── BOOK ROW ── */
.ls-book-row { display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; border-radius: var(--radius-sm); background: var(--bg2); border: 1px solid var(--border2); margin-bottom: 5px; }
.ls-book-row-left { flex: 1; min-width: 0; }
.ls-book-row-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.ls-book-row-actions { display: flex; gap: 7px; flex-shrink: 0; align-items: center; }
.ls-book-row-title { font-size: 13px; font-weight: 500; color: var(--text); margin-bottom: 1px; }
.ls-book-row-author { font-size: 11px; color: var(--muted); font-style: italic; }
.ls-star-row { display: flex; gap: 2px; align-items: center; }
.ls-star { cursor: pointer; transition: all .1s; display: inline-flex; align-items: center; }
.ls-remove-btn { background: transparent; border: none; color: var(--muted); cursor: pointer; padding: 3px 5px; transition: color .15s; display: flex; align-items: center; }
.ls-remove-btn:hover { color: var(--rust); }

/* ── BUTTONS ── */
.ls-action-wrap { margin-top: 14px; }
.ls-action-btn {
  width: 100%; padding: 13px; border-radius: var(--radius-md); border: none;
  background: var(--amber); color: #fff;
  font-family: 'Lora', serif; font-size: 14px; font-weight: 600; font-style: italic;
  cursor: pointer; transition: all .15s;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  box-shadow: 0 3px 12px rgba(160,108,16,.25);
}
.ls-action-btn:hover { opacity: .9; transform: translateY(-1px); }
.ls-action-btn:disabled { opacity: .4; cursor: not-allowed; transform: none; box-shadow: none; }
.ls-ask-ai-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 6px;
  border: 1.5px solid var(--border); background: transparent; color: var(--text2);
  font-size: 11px; font-weight: 600; cursor: pointer; transition: all .15s;
}
.ls-ask-ai-btn:hover { border-color: var(--amber); color: var(--amber); background: var(--amber-l); }

/* ── EMPTY STATE ── */
.ls-empty { text-align: center; padding: 36px 20px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.ls-empty-icon { color: var(--faint); margin-bottom: 4px; }
.ls-empty-title { font-family: 'Lora', serif; font-size: 14px; font-weight: 600; font-style: italic; color: var(--text); }
.ls-empty-body { font-size: 12px; color: var(--muted); max-width: 220px; line-height: 1.6; }

/* ── QUESTION COUNTER ── */
.ls-counter {
  padding: 5px 14px 5px;
  display: flex; align-items: center; justify-content: space-between;
  font-size: 11px; color: var(--muted);
  border-top: 1px solid var(--border2);
  background: rgba(244,239,230,.97); flex-shrink: 0;
}
.ls-counter.warn { color: var(--rust); background: rgba(168,72,40,.04); }
.ls-counter-upgrade { font-size: 11px; font-weight: 600; color: var(--amber); background: none; border: none; cursor: pointer; padding: 0; }
.ls-counter-upgrade:hover { color: var(--amber-rich); }

/* ── LIMIT WALL ── */
.ls-limit-wall {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center; padding: 32px 20px; gap: 10px;
}
.ls-limit-icon { margin-bottom: 4px; }
.ls-limit-title { font-family: 'Lora', serif; font-size: 20px; font-weight: 700; color: var(--text); line-height: 1.25; }
.ls-limit-title em { color: var(--amber); font-style: italic; }
.ls-limit-body { font-size: 13px; color: var(--text2); max-width: 240px; line-height: 1.7; }
.ls-limit-cta {
  margin-top: 8px; padding: 12px 28px;
  border-radius: var(--radius-pill); border: none;
  background: var(--amber); color: #fff;
  font-family: 'Lora', serif; font-size: 14px; font-weight: 600; font-style: italic;
  cursor: pointer; box-shadow: 0 3px 10px rgba(160,108,16,.25); transition: all .15s;
}
.ls-limit-cta:hover { background: var(--amber-rich); transform: translateY(-1px); }
.ls-limit-cta.outline {
  background: transparent; color: var(--amber);
  border: 1.5px solid var(--amber); box-shadow: none; margin-top: 4px;
}
.ls-limit-note { font-size: 11px; color: var(--muted); margin-top: 4px; }

/* ── ASK CHAT ── */
.ls-ask-msgs { flex: 1; overflow-y: auto; padding: 16px 14px; display: flex; flex-direction: column; gap: 14px; }
.ls-welcome { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; gap: 8px; padding: 24px 16px; }
.ls-welcome-icon { color: var(--amber); filter: drop-shadow(0 4px 12px rgba(160,108,16,.2)); margin-bottom: 6px; }
.ls-welcome-title { font-family: 'Lora', serif; font-size: 26px; font-weight: 700; color: var(--text); line-height: 1.2; }
.ls-welcome-title em { color: var(--amber); font-style: italic; }
.ls-welcome-sub { font-size: 13px; color: var(--text2); max-width: 240px; line-height: 1.7; margin-bottom: 6px; }
.ls-prompt-list { display: flex; flex-direction: column; gap: 6px; width: 100%; max-width: 310px; }
.ls-prompt-btn {
  padding: 11px 14px; border-radius: var(--radius-md);
  border: 1.5px solid var(--border2); background: var(--card); color: var(--text2);
  font-family: 'Lora', serif; font-size: 12px; font-weight: 500; font-style: italic;
  cursor: pointer; text-align: left; transition: all .15s;
  box-shadow: 0 1px 4px var(--shadow-sm); line-height: 1.4;
}
.ls-prompt-btn:hover { border-color: var(--amber); color: var(--amber-d); background: var(--amber-l); }

/* ── MESSAGES ── */
.ls-msg { display: flex; gap: 9px; max-width: 100%; animation: msgIn .2s ease-out; }
.ls-msg.user { flex-direction: row-reverse; align-self: flex-end; }
@keyframes msgIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
.ls-av { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1.5px solid var(--border2); }
.ls-av.ai { background: linear-gradient(135deg, var(--amber-m), #fdf4d4); border-color: rgba(160,108,16,.28); color: var(--amber); }
.ls-av.user { background: var(--bg2); color: var(--text2); font-size: 10px; font-weight: 700; }
.ls-bubble { padding: 11px 14px; border-radius: 14px; font-size: 13.5px; line-height: 1.75; max-width: calc(100% - 42px); box-shadow: 0 1px 4px var(--shadow-sm); }
.ls-bubble.ai { background: var(--card); border: 1px solid var(--border2); color: var(--text); border-radius: 4px 14px 14px 14px; }
.ls-bubble.user { background: #e4f0e4; border: 1px solid #cde0cd; color: #1e3018; border-radius: 14px 4px 14px 14px; }
.ls-bubble.error { background: #fdf4f0; border: 1px solid rgba(168,72,40,.2); color: var(--rust); border-radius: 4px 14px 14px 14px; display: flex; flex-direction: column; gap: 8px; }
.ls-bubble.ai strong { color: var(--amber-d); font-weight: 600; }
.ls-bubble.ai em { color: var(--sage); font-style: normal; font-weight: 600; }
.ls-bubble.ai h4 { font-family: 'Lora', serif; font-size: 12px; font-weight: 600; font-style: italic; color: var(--text2); margin: 10px 0 5px; padding-bottom: 4px; border-bottom: 1px solid var(--border2); }
.ls-bubble.ai h4:first-child { margin-top: 0; }
.ls-bubble.ai li { margin-bottom: 4px; padding-left: 14px; color: var(--text2); }
.ls-retry-btn { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 6px; border: 1.5px solid rgba(168,72,40,.3); background: transparent; color: var(--rust); font-size: 11px; font-weight: 600; cursor: pointer; transition: all .15s; align-self: flex-start; }
.ls-retry-btn:hover { background: rgba(168,72,40,.06); }
.ls-dots { display: flex; gap: 4px; align-items: center; padding: 5px 2px; }
.ls-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--amber); animation: ldot 1.2s ease-in-out infinite; }
.ls-dot:nth-child(2) { animation-delay: .2s; }
.ls-dot:nth-child(3) { animation-delay: .4s; }
@keyframes ldot { 0%,60%,100% { transform:translateY(0); opacity:.3; } 30% { transform:translateY(-5px); opacity:1; } }

/* ── CHAT INPUT ── */
.ls-input-row-chat { display: flex; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--border2); background: rgba(244,239,230,.97); flex-shrink: 0; }
textarea.ls-chat-input { flex: 1; background: var(--card); border: 1.5px solid var(--border2); border-radius: 12px; color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 13px; padding: 10px 13px; resize: none; outline: none; line-height: 1.5; min-height: 44px; max-height: 100px; transition: border-color .2s; box-shadow: inset 0 1px 3px var(--shadow-sm); }
textarea.ls-chat-input:focus { border-color: var(--amber); }
textarea.ls-chat-input::placeholder { color: var(--muted); }
.ls-send-btn { width: 44px; height: 44px; border-radius: 12px; border: none; flex-shrink: 0; background: var(--amber); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all .15s; box-shadow: 0 2px 8px rgba(160,108,16,.3); }
.ls-send-btn:hover { background: var(--amber-rich); }
.ls-send-btn:active { transform: scale(.93); }
.ls-send-btn:disabled { opacity: .35; cursor: not-allowed; box-shadow: none; }

/* ── PRO MODAL ── */
.ls-overlay { position: fixed; inset: 0; background: rgba(40,32,14,.45); backdrop-filter: blur(6px); display: flex; align-items: flex-end; justify-content: center; z-index: 200; animation: fadeIn .2s ease; }
@keyframes fadeIn { from{opacity:0} to{opacity:1} }
.ls-modal { background: var(--card); border: 1px solid var(--border2); border-bottom: none; border-radius: 22px 22px 0 0; padding: 8px 20px 44px; width: 100%; max-width: 480px; animation: slideUp .28s cubic-bezier(.32,.72,0,1); box-shadow: 0 -8px 40px var(--shadow-lg); }
@keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
.ls-modal-handle { width: 36px; height: 4px; border-radius: 2px; background: var(--border); margin: 12px auto 20px; }
.ls-modal-eyebrow { font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--amber); margin-bottom: 6px; }
.ls-modal-title { font-family: 'Lora', serif; font-size: 26px; font-weight: 700; color: var(--text); margin-bottom: 6px; line-height: 1.2; }
.ls-modal-title em { color: var(--amber); font-style: italic; }
.ls-modal-sub { font-size: 13px; color: var(--text2); line-height: 1.65; margin-bottom: 20px; }
.ls-pro-features { display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px; }
.ls-pro-feature { display: flex; align-items: flex-start; gap: 11px; }
.ls-pro-feat-icon { width: 30px; height: 30px; border-radius: var(--radius-sm); background: var(--amber-l); border: 1px solid rgba(160,108,16,.15); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--amber); }
.ls-pro-feat-text { flex: 1; }
.ls-pro-feat-title { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 1px; }
.ls-pro-feat-desc { font-size: 11px; color: var(--muted); line-height: 1.5; }
.ls-modal-price-row { display: flex; align-items: baseline; gap: 6px; margin-bottom: 14px; }
.ls-modal-price { font-family:'Lora',serif; font-size:32px; font-weight:700; color:var(--text); }
.ls-modal-price-period { font-size:13px; color:var(--muted); }
.ls-modal-price-note { font-size:11px; color:var(--sage); font-weight:600; }
.ls-modal-cta { width: 100%; padding: 15px; border-radius: var(--radius-md); border: none; background: var(--amber); color: #fff; font-family: 'Lora', serif; font-size: 16px; font-weight: 700; font-style: italic; cursor: pointer; margin-bottom: 10px; box-shadow: 0 4px 14px rgba(160,108,16,.3); transition: all .15s; }
.ls-modal-cta:hover { background: var(--amber-rich); transform: translateY(-1px); }
.ls-modal-cancel { width: 100%; padding: 12px; border-radius: var(--radius-md); border: 1.5px solid var(--border2); background: transparent; color: var(--muted); font-size: 13px; cursor: pointer; transition: all .15s; }
.ls-modal-cancel:hover { color: var(--text2); border-color: var(--border); }

/* ── AUTH MODAL ── */
.ls-auth-overlay { position: fixed; inset: 0; background: rgba(40,32,14,.5); backdrop-filter: blur(6px); display: flex; align-items: flex-end; justify-content: center; z-index: 300; animation: fadeIn .2s ease; }
.ls-auth-modal { background: var(--card); border: 1px solid var(--border2); border-bottom: none; border-radius: 22px 22px 0 0; padding: 8px 20px 44px; width: 100%; max-width: 480px; animation: slideUp .28s cubic-bezier(.32,.72,0,1); box-shadow: 0 -8px 40px var(--shadow-lg); }
.ls-auth-handle { width: 36px; height: 4px; border-radius: 2px; background: var(--border); margin: 12px auto 20px; }
.ls-auth-eyebrow { font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--amber); margin-bottom: 6px; }
.ls-auth-title { font-family: 'Lora', serif; font-size: 22px; font-weight: 700; color: var(--text); margin-bottom: 4px; line-height: 1.25; }
.ls-auth-title em { color: var(--amber); font-style: italic; }
.ls-auth-sub { font-size: 13px; color: var(--text2); line-height: 1.6; margin-bottom: 20px; }
.ls-auth-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }
.ls-auth-label { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); }
.ls-auth-input { width: 100%; background: var(--bg2); border: 1.5px solid var(--border2); border-radius: var(--radius-sm); color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 14px; padding: 11px 13px; outline: none; transition: border-color .2s; }
.ls-auth-input:focus { border-color: var(--amber); }
.ls-auth-input::placeholder { color: var(--faint); }
.ls-auth-error { font-size: 12px; color: var(--rust); margin-bottom: 12px; padding: 9px 12px; background: rgba(168,72,40,.06); border-radius: var(--radius-sm); border: 1px solid rgba(168,72,40,.15); }
.ls-auth-cta { width: 100%; padding: 14px; border-radius: var(--radius-md); border: none; background: var(--amber); color: #fff; font-family: 'Lora', serif; font-size: 16px; font-weight: 700; font-style: italic; cursor: pointer; margin-bottom: 12px; box-shadow: 0 4px 14px rgba(160,108,16,.3); transition: all .15s; margin-top: 4px; }
.ls-auth-cta:hover { background: var(--amber-rich); transform: translateY(-1px); }
.ls-auth-switch { text-align: center; font-size: 13px; color: var(--text2); margin-bottom: 10px; }
.ls-auth-switch button { background: none; border: none; color: var(--amber); font-weight: 600; cursor: pointer; padding: 0; }
.ls-auth-cancel { display: block; width: 100%; padding: 11px; border-radius: var(--radius-md); border: 1.5px solid var(--border2); background: transparent; color: var(--muted); font-size: 13px; cursor: pointer; transition: all .15s; text-align: center; }
.ls-auth-cancel:hover { color: var(--text2); }
`;

// ─── DATA ─────────────────────────────────────────────────────────────────────
const MOODS = [
  { id:"escape", name:"Escape",  sub:"Take me somewhere else", Icon:Sun        },
  { id:"think",  name:"Think",   sub:"Challenge my mind",      Icon:Brain      },
  { id:"feel",   name:"Feel",    sub:"Move me emotionally",    Icon:Heart      },
  { id:"learn",  name:"Learn",   sub:"Real-world knowledge",   Icon:Lightbulb  },
  { id:"laugh",  name:"Laugh",   sub:"Light and fun",          Icon:Smile      },
  { id:"unwind", name:"Unwind",  sub:"Easy, comforting",       Icon:Moon       },
];
const GENRES = ["Literary Fiction","Thriller","Mystery","Sci-Fi","Fantasy","Historical","Romance","Biography","Self-Help","Business","True Crime","Psychology","Philosophy","Essays","Short Stories"];
const FEATURED = [
  { id:1, title:"The Covenant of Water",      author:"Abraham Verghese",  tags:["Literary Fiction","Family Saga"],  primary:"Literary Fiction", why:"Three generations across 70 years in South India. If you loved Pachinko or A Gentleman in Moscow — sweeping, emotional, masterfully written.", score:96 },
  { id:2, title:"Demon Copperhead",            author:"Barbara Kingsolver", tags:["Literary Fiction","Opioid Crisis"],primary:"Literary Fiction", why:"Pulitzer Prize 2023. David Copperfield retold in Appalachia. Raw, important, and impossible to put down.", score:94 },
  { id:3, title:"Project Hail Mary",           author:"Andy Weir",          tags:["Sci-Fi","Space","Survival"],      primary:"Sci-Fi",           why:"Lone astronaut, no memory, mission to save Earth. The most fun you can have with hard science fiction.", score:93 },
  { id:4, title:"All the Light We Cannot See", author:"Anthony Doerr",      tags:["Historical","WWII","Literary"],   primary:"Historical",       why:"Pulitzer Prize winner. A blind French girl and a German soldier. Alternating perspectives, devastating and beautiful.", score:91 },
  { id:5, title:"The Lincoln Highway",         author:"Amor Towles",        tags:["Literary Fiction","1950s"],       primary:"Literary Fiction", why:"Elegant prose, unforgettable characters, 10 days in 1954 America. If you loved A Gentleman in Moscow, read this next.", score:89 },
  { id:6, title:"Thinking, Fast and Slow",     author:"Daniel Kahneman",    tags:["Psychology","Non-Fiction"],       primary:"Psychology",       why:"The definitive book on how your mind actually works. You'll make every decision differently after reading this.", score:88 },
];
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
  { Icon:Bookmark,      title:"Want-to-read intelligence",    desc:"AI tells you which book on your list to start first." },
  { Icon:MessageCircle, title:"Book club mode",               desc:"AI-generated discussion questions for any book." },
  { Icon:BookMarked,    title:"Author alerts",                desc:"New releases from authors you love, as they drop." },
];
const AI_SYSTEM = `You are LitSense — a warm, well-read AI book advisor. You speak like a brilliant friend who has read thousands of books across every genre. You give specific, honest, personal recommendations — never generic bestseller lists. You explain exactly why a book is right for this person. You ask thoughtful follow-ups when you need more context. You know obscure gems as well as essential reads. Use **bold** for book titles and author names. Use ## for section headers on longer responses. Be specific, warm, never generic. Under 220 words unless giving a detailed list.`;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0,10);

function renderAI(text) {
  return text.split("\n").map((line, i) => {
    if (/^#{1,3} /.test(line))      return <h4 key={i}>{line.replace(/^#{1,3} /, "")}</h4>;
    if (/^\*\*[^*]+\*\*$/.test(line.trim())) return <h4 key={i}>{line.trim().slice(2,-2)}</h4>;
    if (/^[-•] /.test(line))        return <li key={i}>{fmtLine(line.slice(2))}</li>;
    if (!line.trim())               return <br key={i} />;
    return <p key={i} style={{marginBottom:3}}>{fmtLine(line)}</p>;
  });
}
function fmtLine(t) {
  return t.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2,-2)}</strong>;
    if (p.startsWith("*")  && p.endsWith("*"))  return <em key={i}>{p.slice(1,-1)}</em>;
    return p;
  });
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function LitSense() {
  useEffect(() => {
    if (!document.getElementById("ls-css")) {
      const s = document.createElement("style");
      s.id = "ls-css"; s.textContent = CSS;
      document.head.appendChild(s);
    }
  }, []);

  // ── AUTH STATE ─────────────────────────────────────────────────────────────
  // In production: replace with Clerk's useUser() and useClerk() hooks
  const [isSignedIn, setIsSignedIn] = useState(() => {
    try { return !!localStorage.getItem("ls_user"); } catch { return false; }
  });
  const [isPro, setIsPro] = useState(() => {
    try { return localStorage.getItem("ls_pro") === "1"; } catch { return false; }
  });
  const [userEmail, setUserEmail] = useState(() => {
    try { return localStorage.getItem("ls_user") || ""; } catch { return ""; }
  });
  const [showAuth, setShowAuth]   = useState(false);
  const [authMode, setAuthMode]   = useState("signup"); // "signup" | "login"
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass]   = useState("");
  const [authError, setAuthError] = useState("");

  // ── QUESTION COUNTER ───────────────────────────────────────────────────────
  const loadCounter = () => {
    try {
      const raw = localStorage.getItem("ls_counter");
      if (!raw) return 0;
      const { count, date } = JSON.parse(raw);
      return date === today() ? count : 0;
    } catch { return 0; }
  };
  const [questionsUsed, setQuestionsUsed] = useState(loadCounter);

  const saveCounter = (n) => {
    try { localStorage.setItem("ls_counter", JSON.stringify({ count:n, date:today() })); } catch {}
  };

  const questionLimit  = isPro ? Infinity : isSignedIn ? LIMIT_FREE : LIMIT_ANON;
  const questionsLeft  = questionLimit === Infinity ? null : Math.max(0, questionLimit - questionsUsed);
  const atLimit        = !isPro && questionsUsed >= questionLimit;

  // ── SHELF STATE ────────────────────────────────────────────────────────────
  const loadShelf = () => {
    try {
      const raw = localStorage.getItem("ls_shelf");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const [readBooks, setReadBooks] = useState(() => {
    const s = loadShelf();
    return s?.readBooks ?? [];
  });
  const [currentBook, setCurrentBook] = useState(() => {
    const s = loadShelf();
    return s?.currentBook ?? "";
  });
  const [wantList, setWantList] = useState(() => {
    const s = loadShelf();
    return s?.wantList ?? [];
  });

  // Persist shelf when signed in
  useEffect(() => {
    if (!isSignedIn) return;
    try {
      localStorage.setItem("ls_shelf", JSON.stringify({ readBooks, currentBook, wantList }));
    } catch {}
  }, [readBooks, currentBook, wantList, isSignedIn]);

  // ── NAV / UI STATE ─────────────────────────────────────────────────────────
  const [tab, setTab]           = useState("discover");
  const [showPro, setPro]       = useState(false);
  const [mood, setMood]         = useState(null);
  const [genre, setGenre]       = useState(null);
  const [shelfTab, setShelfTab] = useState("read");
  const [bookInput, setBookInput] = useState("");
  const [wantInput, setWantInput] = useState("");

  // ── CHAT STATE ─────────────────────────────────────────────────────────────
  const [msgs, setMsgs]     = useState([]);
  const [chatIn, setChatIn] = useState("");
  const [chatLoad, setLoad] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs, chatLoad]);

  // ── SHELF ACTIONS ──────────────────────────────────────────────────────────
  const requireAuth = (cb) => {
    if (!isSignedIn) { setAuthMode("signup"); setShowAuth(true); return; }
    cb();
  };
  const addBook    = () => requireAuth(() => { if (!bookInput.trim()) return; setReadBooks(p=>[...p,{id:Date.now(),title:bookInput.trim(),author:"",rating:3}]); setBookInput(""); });
  const setRating  = (id, r) => setReadBooks(p=>p.map(b=>b.id===id?{...b,rating:r}:b));
  const removeBook = (id) => setReadBooks(p=>p.filter(b=>b.id!==id));
  const addWant    = () => requireAuth(() => { if (!wantInput.trim()) return; setWantList(p=>[...p,wantInput.trim()]); setWantInput(""); });

  // ── AI PROFILE BUILD ───────────────────────────────────────────────────────
  // Free accounts: only last MEM_BOOKS (5) rated books sent to AI
  // Pro: full history
  const buildProfile = useCallback(() => {
    const books = isPro ? readBooks : readBooks.slice(-MEM_BOOKS);
    return [
      books.length && `Books read: ${books.map(b=>`"${b.title}"${b.author?` by ${b.author}`:""} (${b.rating}/5)`).join(", ")}.`,
      currentBook && `Currently reading: ${currentBook}.`,
      wantList.length && `Want to read: ${wantList.slice(0,5).join(", ")}.`,
      mood  && `Current mood: ${mood}.`,
      genre && `Preferred genre: ${genre}.`,
    ].filter(Boolean).join(" ") || "";
  }, [readBooks, currentBook, wantList, mood, genre, isPro]);

  // ── SEND CHAT ──────────────────────────────────────────────────────────────
  const sendChat = async (msg, isRetry=false) => {
    if (chatLoad || !msg.trim()) return;

    // Check limit — enforce client-side (server enforces in production via /api/ai)
    if (atLimit) { setPro(true); return; }

    setLoad(true);
    const base    = isRetry ? msgs.slice(0,-1) : msgs;
    const newMsgs = [...base, { role:"user", content:msg }];
    setMsgs(newMsgs);
    setChatIn("");

    // Increment counter
    const next = questionsUsed + 1;
    setQuestionsUsed(next);
    saveCounter(next);

    const sys = `${AI_SYSTEM}\n\nReader profile: ${buildProfile() || "No reading history yet."}`;

    try {
      // ⚠️ PRODUCTION: Replace with "/api/ai" — do not ship with direct Anthropic call
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:700, system:sys, messages:newMsgs }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      const text = d.content?.[0]?.text;
      if (!text) throw new Error("Empty response");
      setMsgs([...newMsgs, { role:"assistant", content:text }]);
    } catch {
      // Roll back counter on failure so failed attempt doesn't cost a question
      setQuestionsUsed(questionsUsed);
      saveCounter(questionsUsed);
      setMsgs([...newMsgs, { role:"assistant", content:"Something went quiet — check your connection and try again.", isError:true, retryMsg:msg }]);
    }
    setLoad(false);
  };

  const goAsk = (prompt) => { setTab("ask"); setTimeout(() => sendChat(prompt), 80); };

  // ── AUTH HANDLERS ──────────────────────────────────────────────────────────
  // In production: replace with Clerk's openSignUp / openSignIn
  const handleAuth = () => {
    setAuthError("");
    if (!authEmail.trim() || !authPass.trim()) { setAuthError("Please fill in both fields."); return; }
    if (authMode === "signup") {
      const existing = localStorage.getItem(`ls_user_${authEmail.toLowerCase()}`);
      if (existing) { setAuthError("An account with this email already exists. Sign in instead."); return; }
      localStorage.setItem(`ls_user_${authEmail.toLowerCase()}`, authPass);
      localStorage.setItem("ls_user", authEmail.toLowerCase());
      setIsSignedIn(true);
      setUserEmail(authEmail.toLowerCase());
    } else {
      const stored = localStorage.getItem(`ls_user_${authEmail.toLowerCase()}`);
      if (!stored || stored !== authPass) { setAuthError("Incorrect email or password."); return; }
      localStorage.setItem("ls_user", authEmail.toLowerCase());
      setIsSignedIn(true);
      setUserEmail(authEmail.toLowerCase());
    }
    setShowAuth(false);
    setAuthEmail(""); setAuthPass(""); setAuthError("");
  };

  const handleSignOut = () => {
    localStorage.removeItem("ls_user");
    setIsSignedIn(false); setIsPro(false); setUserEmail("");
    // Clear shelf from memory (stays in localStorage for when they log back in)
    setReadBooks([]); setCurrentBook(""); setWantList([]);
  };

  // Simulate Pro upgrade — in production: Stripe Checkout → webhook → Supabase
  const handleUpgrade = () => {
    if (!isSignedIn) { setShowAuth(true); setAuthMode("signup"); setPro(false); return; }
    localStorage.setItem("ls_pro", "1");
    setIsPro(true);
    setPro(false);
  };

  // ── COMPUTED ───────────────────────────────────────────────────────────────
  // When user has rated books, sort featured list by genre match with their taste
  const topGenres = readBooks.length >= 1
    ? [...new Set(readBooks.flatMap(() => []))] // placeholder — expand with Supabase data
    : [];

  const visibleBooks = (() => {
    let books = genre
      ? FEATURED.filter(b => b.tags.some(t => t.toLowerCase().includes(genre.toLowerCase())))
      : FEATURED;

    // If user has taste (rated books), boost books matching their preferred genres
    if (readBooks.length >= 1 && !genre) {
      const ratedHighly = readBooks.filter(b => b.rating >= 4);
      // Boost score for books that match highly-rated book genres
      // For now sort by score descending (personalization hook ready for Supabase)
      books = [...books].sort((a, b) => b.score - a.score);
    }

    return books;
  })();

  const userInitial = userEmail ? userEmail[0].toUpperCase() : "";

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="ls">

      {/* ── HEADER ── */}
      <header className="ls-hdr">
        <div className="ls-logo">
          <img
            src="/litsense-logo.png"
            alt="LitSense"
            className="ls-logo-img"
          />
          <div className="ls-logo-sub">Books worth your time.</div>
        </div>
        <div className="ls-hdr-right">
          {!isSignedIn ? (
            <>
              <button className="ls-signin-btn" onClick={() => { setAuthMode("login"); setShowAuth(true); }}>Sign in</button>
              <button className="ls-pro-btn" onClick={() => setPro(true)}><Crown size={11} strokeWidth={2}/> Pro</button>
            </>
          ) : (
            <>
              {isPro && <span className="ls-pro-pip">PRO</span>}
              {!isPro && <button className="ls-pro-btn" onClick={() => setPro(true)}><Crown size={11} strokeWidth={2}/> Pro</button>}
              <div className="ls-user-avatar" title={`Signed in as ${userEmail}`} onClick={handleSignOut}>
                {userInitial}
              </div>
            </>
          )}
        </div>
      </header>

      <div className="ls-main">

        {/* ── DISCOVER ── */}
        {tab === "discover" && (
          <div className="ls-scroll">
            <div className="ls-hero">
              <div className="ls-hero-eyebrow">Built around your taste</div>
              <div className="ls-hero-title">Know what you'll <em>love next.</em></div>
              <div className="ls-hero-body">No bestseller lists. No guesswork. Just the right next book — and why.</div>
              <button className="ls-hero-cta" onClick={() => goAsk("Based on my reading history and taste, what's the single best book I should read next? Tell me exactly why it's right for me.")}>
                Find my next book <ChevronRight size={15} strokeWidth={2.5}/>
              </button>
              <div className="ls-hero-links">
                <button className="ls-hero-link" onClick={() => goAsk("Surprise me — recommend something I'd never pick for myself but would genuinely love.")}>Surprise me</button>
                <button className="ls-hero-link" onClick={() => goAsk("What are the most underrated books of the last three years — the ones most people haven't found yet?")}>Hidden gems</button>
                <button className="ls-hero-link" onClick={() => goAsk("I've been in a reading slump. What's the one book that will pull me back in?")}>End a slump</button>
              </div>
            </div>

            <div className="ls-sec-hdr">
              <span className="ls-sec-title">Set your mood</span>
              <span className="ls-sec-note">Shapes your AI picks</span>
              <div className="ls-sec-rule"/>
            </div>
            <div className="ls-mood-grid">
              {MOODS.map(({ id, name, sub, Icon }) => (
                <div key={id} className={`ls-mood-card${mood===id?" on":""}`} onClick={() => setMood(mood===id?null:id)}>
                  <div className="ls-mood-icon"><Icon size={20} strokeWidth={1.5}/></div>
                  <div className="ls-mood-name">{name}</div>
                  <div className="ls-mood-sub">{sub}</div>
                </div>
              ))}
            </div>
            {mood && (
              <div className="ls-mood-banner">
                <span className="ls-mood-banner-text">Mood set to <em>{mood}</em> — tap "Find my next book" to use it</span>
                <button className="ls-mood-banner-clear" onClick={() => setMood(null)}>Clear</button>
              </div>
            )}

            <div className="ls-sec-hdr">
              <span className="ls-sec-title">Browse by genre</span>
              <div className="ls-sec-rule"/>
            </div>
            <div className="ls-genre-rail">
              {GENRES.map(g => (
                <button key={g} className={`ls-genre-pill${genre===g?" on":""}`} onClick={() => setGenre(genre===g?null:g)}>{g}</button>
              ))}
            </div>
            {(mood || genre) && (
              <button className="ls-filter-cta" onClick={() => goAsk(`Based on my reading history${mood?`, I'm in the mood to ${mood}`:""}${genre?`, I prefer ${genre}`:""}. Give me three specific book recommendations with honest reasons why each one is right for me.`)}>
                Get my AI picks <ChevronRight size={16} strokeWidth={2.5}/>
              </button>
            )}

            <div className="ls-sec-hdr spaced">
              <span className="ls-sec-title">{readBooks.length >= 1 ? "Picked for you" : "Editor's picks"}</span>
              {readBooks.length === 0 && <span className="ls-sec-note">Curated by LitSense</span>}
              <div className="ls-sec-rule"/>
            </div>
            <div className="ls-book-list">
              {visibleBooks.length === 0 ? (
                <div className="ls-empty">
                  <div className="ls-empty-icon"><BookOpen size={32} strokeWidth={1}/></div>
                  <div className="ls-empty-title">No picks match that genre</div>
                  <div className="ls-empty-body">Try a different genre, or ask the AI for personalized picks in that category.</div>
                </div>
              ) : visibleBooks.map(b => (
                <div key={b.id} className="ls-book-card" onClick={() => goAsk(`Tell me about "${b.title}" by ${b.author}. Should I read it? Be specific and honest.`)}>
                  <div className="ls-book-spine"><BookOpen size={22} strokeWidth={1.5}/></div>
                  <div className="ls-book-info">
                    <div className="ls-book-title">{b.title}</div>
                    <div className="ls-book-author">{b.author}</div>
                    <div className="ls-book-tags">
                      <span className="ls-book-tag primary">{b.primary}</span>
                      {b.tags.slice(1).map((t,i) => <span key={i} className="ls-book-tag">{t}</span>)}
                    </div>
                    <div className="ls-book-why">{b.why}</div>
                  </div>
                  <div className="ls-book-score">{b.score}%</div>
                </div>
              ))}
            </div>
            <div className="ls-callout info">
              <Lightbulb size={14} strokeWidth={2} className="ls-callout-icon"/>
              <span>{readBooks.length >= 1 ? "The more you rate, the more accurate your picks become." : <>Rate books in <strong>My Shelf</strong> to get picks tailored to your taste.</>}</span>
            </div>
          </div>
        )}

        {/* ── MY SHELF ── */}
        {tab === "shelf" && (
          <div className="ls-scroll">
            <div className="ls-shelf-hdr">
              <div className="ls-shelf-hdr-title">My Shelf</div>
              <div className="ls-shelf-hdr-sub">Your reading history powers your recommendations</div>
            </div>

            {/* Gate: not signed in */}
            {!isSignedIn ? (
              <div className="ls-shelf-gate">
                <div className="ls-shelf-gate-icon"><Lock size={36} strokeWidth={1}/></div>
                <div className="ls-shelf-gate-title">Your shelf lives here</div>
                <div className="ls-shelf-gate-body">
                  Create a free account to save books, rate them, and get recommendations that actually know your taste.
                  {!isPro && <><br/><br/>Free accounts remember your last {MEM_BOOKS} rated books. Pro remembers everything.</>}
                </div>
                <button className="ls-action-btn" style={{marginTop:16,maxWidth:260}} onClick={() => { setAuthMode("signup"); setShowAuth(true); }}>
                  Create your free account
                </button>
                <button style={{background:"none",border:"none",color:"var(--muted)",fontSize:12,cursor:"pointer",marginTop:4}} onClick={() => { setAuthMode("login"); setShowAuth(true); }}>
                  Already have an account? Sign in
                </button>
              </div>
            ) : (
              <>
                <div className="ls-status-tabs">
                  {[["read","Finished"],["reading","Reading"],["want","Want to Read"]].map(([v,l]) => (
                    <button key={v} className={`ls-status-tab${shelfTab===v?" on":""}`} onClick={() => setShelfTab(v)}>{l}</button>
                  ))}
                </div>

                {/* FINISHED */}
                {shelfTab === "read" && (
                  <>
                    <div className="ls-input-card">
                      <div className="ls-input-label">Add a book you've read</div>
                      <div className="ls-input-row">
                        <input className="ls-input" placeholder="Book title..."
                          value={bookInput} onChange={e => setBookInput(e.target.value)}
                          onKeyDown={e => { if(e.key==="Enter") addBook(); }}/>
                        <button className="ls-add-btn" onClick={addBook}><Plus size={18} strokeWidth={2}/></button>
                      </div>
                    </div>
                    {!isPro && readBooks.length >= MEM_BOOKS && (
                      <div className="ls-callout info" style={{marginBottom:10}}>
                        <Lightbulb size={14} strokeWidth={2} className="ls-callout-icon"/>
                        <span>Free accounts send your <strong>last {MEM_BOOKS} books</strong> to the AI. <button style={{background:"none",border:"none",color:"var(--amber)",fontWeight:600,cursor:"pointer",padding:0,fontSize:12}} onClick={()=>setPro(true)}>Upgrade to Pro</button> to unlock your full history.</span>
                      </div>
                    )}
                    {readBooks.length === 0 ? (
                      <div className="ls-empty">
                        <div className="ls-empty-icon"><BookOpen size={36} strokeWidth={1}/></div>
                        <div className="ls-empty-title">Your shelf is empty</div>
                        <div className="ls-empty-body">Add books you've read and rate them. Each rating makes your recommendations more accurate.</div>
                      </div>
                    ) : (
                      <>
                        {readBooks.map(b => (
                          <div key={b.id} className="ls-book-row">
                            <div className="ls-book-row-left">
                              <div className="ls-book-row-title">{b.title}</div>
                              {b.author && <div className="ls-book-row-author">{b.author}</div>}
                            </div>
                            <div className="ls-book-row-right">
                              <div className="ls-star-row">
                                {[1,2,3,4,5].map(s => (
                                  <span key={s} className="ls-star" onClick={() => setRating(b.id,s)}>
                                    <Star size={13} strokeWidth={1.5}
                                      fill={b.rating>=s?"var(--amber)":"none"}
                                      color={b.rating>=s?"var(--amber)":"var(--faint)"}/>
                                  </span>
                                ))}
                              </div>
                              <button className="ls-remove-btn" onClick={() => removeBook(b.id)}><X size={14}/></button>
                            </div>
                          </div>
                        ))}
                        {readBooks.length >= 2 && (
                          <div className="ls-action-wrap">
                            <button className="ls-action-btn" onClick={() => goAsk("Based on everything I've rated, what does my reading taste say about me — and what should I read next?")}>
                              Analyze my taste & recommend
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {/* CURRENTLY READING */}
                {shelfTab === "reading" && (
                  <>
                    <div className="ls-input-card">
                      <div className="ls-input-label">Currently reading</div>
                      <input className="ls-input full" placeholder="What are you reading right now?"
                        value={currentBook} onChange={e => setCurrentBook(e.target.value)}/>
                    </div>
                    {currentBook ? (
                      <button className="ls-action-btn" onClick={() => goAsk(`I'm currently reading "${currentBook}". What should I read right after I finish?`)}>
                        What do I read after this?
                      </button>
                    ) : (
                      <div className="ls-empty">
                        <div className="ls-empty-icon"><BookOpen size={36} strokeWidth={1}/></div>
                        <div className="ls-empty-title">Nothing logged yet</div>
                        <div className="ls-empty-body">Enter what you're reading and get a recommendation for what comes next.</div>
                      </div>
                    )}
                  </>
                )}

                {/* WANT TO READ */}
                {shelfTab === "want" && (
                  <>
                    <div className="ls-input-card">
                      <div className="ls-input-label">Add to your list</div>
                      <div className="ls-input-row">
                        <input className="ls-input" placeholder="Book title..."
                          value={wantInput} onChange={e => setWantInput(e.target.value)}
                          onKeyDown={e => { if(e.key==="Enter") addWant(); }}/>
                        <button className="ls-add-btn" onClick={addWant}><Plus size={18} strokeWidth={2}/></button>
                      </div>
                    </div>
                    {wantList.length === 0 ? (
                      <div className="ls-empty">
                        <div className="ls-empty-icon"><Bookmark size={36} strokeWidth={1}/></div>
                        <div className="ls-empty-title">Your list is clear</div>
                        <div className="ls-empty-body">Add books you want to read. Ask the AI which to start with.</div>
                      </div>
                    ) : (
                      <>
                        {wantList.map((t, i) => (
                          <div key={i} className="ls-book-row">
                            <div className="ls-book-row-left"><div className="ls-book-row-title">{t}</div></div>
                            <div className="ls-book-row-actions">
                              <button className="ls-ask-ai-btn" onClick={() => goAsk(`Should I read "${t}"? Give me a real, honest take based on what I've read before.`)}>Ask AI</button>
                              <button className="ls-remove-btn" onClick={() => setWantList(p=>p.filter((_,j)=>j!==i))}><X size={14}/></button>
                            </div>
                          </div>
                        ))}
                        {wantList.length >= 2 && (
                          <div className="ls-action-wrap">
                            <button className="ls-action-btn" onClick={() => goAsk(`I have these on my list: ${wantList.join(", ")}. Based on my reading history, which should I read first and why?`)}>
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
        {tab === "ask" && (
          <>
            {/* Limit wall — hit daily quota */}
            {atLimit ? (
              <div className="ls-limit-wall">
                <div className="ls-limit-icon">
                  <BookOpen size={44} strokeWidth={1} color="var(--amber)"/>
                </div>
                <div className="ls-limit-title">
                  {isSignedIn ? <>You've used today's <em>questions.</em></> : <>Create an account for <em>more.</em></>}
                </div>
                <div className="ls-limit-body">
                  {isSignedIn
                    ? `You've used all ${LIMIT_FREE} of today's questions. Upgrade to Pro for unlimited conversations, any time.`
                    : `You've used all ${LIMIT_ANON} free questions. Create an account for ${LIMIT_FREE} questions a day — or go Pro for unlimited.`}
                </div>
                <button className="ls-limit-cta" onClick={() => { if (!isSignedIn) { setAuthMode("signup"); setShowAuth(true); } else setPro(true); }}>
                  {isSignedIn ? "Upgrade to Pro — $4.99/mo" : "Create a free account"}
                </button>
                {!isSignedIn && (
                  <button className="ls-limit-cta outline" onClick={() => setPro(true)}>
                    Upgrade to Pro — $4.99/mo
                  </button>
                )}
                <div className="ls-limit-note">Resets every day at midnight.</div>
              </div>
            ) : (
              <div className="ls-ask-msgs">
                {msgs.length === 0 && !chatLoad ? (
                  <div className="ls-welcome">
                    <div className="ls-welcome-icon"><BookOpen size={48} strokeWidth={1}/></div>
                    <div className="ls-welcome-title">Ask <em>LitSense</em></div>
                    <p className="ls-welcome-sub">Tell me what you loved. Tell me what you hated. I'll find your next book.</p>
                    <div className="ls-prompt-list">
                      {ASK_PROMPTS.map((p, i) => (
                        <button key={i} className="ls-prompt-btn" onClick={() => sendChat(p)}>{p}</button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {msgs.map((m, i) => (
                      <div key={i} className={`ls-msg ${m.role}`}>
                        <div className={`ls-av ${m.role==="assistant"?"ai":"user"}`}>
                          {m.role==="assistant" ? <BookOpen size={13} strokeWidth={2}/> : "ME"}
                        </div>
                        <div className={`ls-bubble ${m.isError?"error":m.role==="assistant"?"ai":"user"}`}>
                          {m.isError ? (
                            <>
                              <span>{m.content}</span>
                              <button className="ls-retry-btn" onClick={() => sendChat(m.retryMsg, true)}>
                                <RotateCcw size={12} strokeWidth={2}/> Try again
                              </button>
                            </>
                          ) : m.role==="assistant" ? renderAI(m.content) : m.content}
                        </div>
                      </div>
                    ))}
                    {chatLoad && (
                      <div className="ls-msg">
                        <div className="ls-av ai"><BookOpen size={13} strokeWidth={2}/></div>
                        <div className="ls-bubble ai">
                          <div className="ls-dots"><div className="ls-dot"/><div className="ls-dot"/><div className="ls-dot"/></div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div ref={endRef}/>
              </div>
            )}

            {/* Question counter bar */}
            {!atLimit && (
              <div className={`ls-counter${questionsLeft !== null && questionsLeft <= 1 ? " warn" : ""}`}>
                <span>
                  {isPro
                    ? "Unlimited questions · Pro"
                    : questionsLeft === null
                    ? ""
                    : questionsLeft === 0
                    ? "No questions remaining today"
                    : `${questionsLeft} question${questionsLeft===1?"":"s"} remaining today`}
                </span>
                {!isPro && (
                  <button className="ls-counter-upgrade" onClick={() => { if(!isSignedIn){ setAuthMode("signup"); setShowAuth(true); } else setPro(true); }}>
                    {isSignedIn ? "Go Pro for unlimited →" : `Sign up for ${LIMIT_FREE}/day →`}
                  </button>
                )}
              </div>
            )}

            {/* Chat input */}
            {!atLimit && (
              <div className="ls-input-row-chat">
                <textarea className="ls-chat-input" rows={1}
                  placeholder="Ask about any book, or tell me what you're looking for..."
                  value={chatIn}
                  onChange={e => setChatIn(e.target.value)}
                  onKeyDown={e => { if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); sendChat(chatIn); }}}/>
                <button className="ls-send-btn" onClick={() => sendChat(chatIn)} disabled={chatLoad||!chatIn.trim()}>
                  <Send size={16} strokeWidth={2}/>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── BOTTOM NAV ── */}
      <nav className="ls-nav">
        {[
          ["discover", <Search        size={20} strokeWidth={1.75}/>, "Discover"],
          ["shelf",    <Library       size={20} strokeWidth={1.75}/>, "My Shelf"],
          ["ask",      <MessageCircle size={20} strokeWidth={1.75}/>, "Ask"],
        ].map(([v, icon, label]) => (
          <button key={v} className={`ls-nav-btn${tab===v?" on":""}`} onClick={() => setTab(v)}>
            {icon}
            <span className="ls-nav-label">{label}</span>
          </button>
        ))}
      </nav>

      {/* ── PRO MODAL ── */}
      {showPro && (
        <div className="ls-overlay" onClick={() => setPro(false)}>
          <div className="ls-modal" onClick={e => e.stopPropagation()}>
            <div className="ls-modal-handle"/>
            <div className="ls-modal-eyebrow">LitSense Pro</div>
            <div className="ls-modal-title">Read <em>smarter.</em><br/>Every month.</div>
            <div className="ls-modal-sub">For readers who take books seriously. Cancel anytime — no commitment, no friction.</div>
            <div className="ls-pro-features">
              {PRO_FEATURES.map(({ Icon, title, desc }, i) => (
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
              {isSignedIn ? "Start your free 7-day trial" : "Create an account to get started"}
            </button>
            <button className="ls-modal-cancel" onClick={() => setPro(false)}>Maybe another time</button>
          </div>
        </div>
      )}

      {/* ── AUTH MODAL ── */}
      {/* In production: remove this entire modal and call Clerk's openSignUp / openSignIn */}
      {showAuth && (
        <div className="ls-auth-overlay" onClick={() => { setShowAuth(false); setAuthError(""); }}>
          <div className="ls-auth-modal" onClick={e => e.stopPropagation()}>
            <div className="ls-auth-handle"/>
            <div className="ls-auth-eyebrow">LitSense</div>
            <div className="ls-auth-title">
              {authMode === "signup" ? <>Your shelf, <em>remembered.</em></> : <>Welcome <em>back.</em></>}
            </div>
            <div className="ls-auth-sub">
              {authMode === "signup"
                ? `Free account gets ${LIMIT_FREE} questions per day and saves your last ${MEM_BOOKS} rated books.`
                : "Sign in to access your shelf and reading history."}
            </div>

            {authError && <div className="ls-auth-error">{authError}</div>}

            <div className="ls-auth-field">
              <div className="ls-auth-label">Email</div>
              <input className="ls-auth-input" type="email" placeholder="you@example.com"
                value={authEmail} onChange={e => setAuthEmail(e.target.value)}
                onKeyDown={e => { if(e.key==="Enter") handleAuth(); }}/>
            </div>
            <div className="ls-auth-field">
              <div className="ls-auth-label">Password</div>
              <input className="ls-auth-input" type="password" placeholder="••••••••"
                value={authPass} onChange={e => setAuthPass(e.target.value)}
                onKeyDown={e => { if(e.key==="Enter") handleAuth(); }}/>
            </div>

            <button className="ls-auth-cta" onClick={handleAuth}>
              {authMode === "signup" ? "Create free account" : "Sign in"}
            </button>

            <div className="ls-auth-switch">
              {authMode === "signup"
                ? <>Already have an account? <button onClick={() => { setAuthMode("login"); setAuthError(""); }}>Sign in</button></>
                : <>Don't have an account? <button onClick={() => { setAuthMode("signup"); setAuthError(""); }}>Sign up free</button></>}
            </div>

            <button className="ls-auth-cancel" onClick={() => { setShowAuth(false); setAuthError(""); }}>
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
