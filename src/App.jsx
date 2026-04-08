/**
 * LitSense — AI Book Advisor
 * v9 · Cinematic Dark · Real Covers · Why Explanations
 *
 * ⚠️  PRODUCTION: Replace fetch URL with "/api/ai" before deploying.
 * Replace localStorage auth simulation with Clerk.
 *
 * Book covers: Open Library free API — no key needed.
 * https://covers.openlibrary.org/b/isbn/{ISBN}-L.jpg
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

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=DM+Sans:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}

.ls {
  font-family:'DM Sans',sans-serif;
  height:100dvh;display:flex;flex-direction:column;overflow:hidden;
  background:#0a0806;color:#f0e8d8;

  --gold:    #d4941a;
  --gold-r:  #e8a820;
  --gold-l:  rgba(212,148,26,.14);
  --gold-d:  #9a6808;
  --sage:    #4a8060;
  --rust:    #b84028;

  --bg:      #0a0806;
  --bg2:     #141008;
  --bg3:     #1e1610;
  --card:    #1a1410;
  --card2:   #241c14;
  --lift:    #2e2418;

  --text:    #f0e8d8;
  --text2:   #b0a080;
  --muted:   #706040;
  --faint:   #3c2e1e;

  --r-sm:  6px;
  --r-md:  12px;
  --r-lg:  18px;
  --r-pill:99px;
  --glow:  rgba(212,148,26,.22);
}
.ls ::-webkit-scrollbar{display:none;}

/* ── HEADER ── */
.ls-hdr{
  height:54px;min-height:54px;padding:0 16px;
  display:flex;align-items:center;justify-content:space-between;
  background:linear-gradient(180deg,rgba(10,8,6,.99) 0%,rgba(10,8,6,.85) 100%);
  border-bottom:1px solid rgba(255,255,255,.05);
  flex-shrink:0;z-index:10;
}
.ls-logo{display:flex;flex-direction:column;gap:1px;}
.ls-logo-img{height:26px;width:auto;display:block;filter:brightness(1.3);}
.ls-logo-name{font-family:'Lora',serif;font-size:21px;font-weight:700;letter-spacing:-.4px;line-height:1;color:var(--text);}
.ls-logo-name em{color:var(--gold);font-style:italic;}
.ls-logo-sub{font-size:8px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:var(--muted);}
.ls-hdr-right{display:flex;align-items:center;gap:8px;}
.ls-signin-btn{
  padding:6px 13px;border-radius:var(--r-pill);
  border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.05);color:var(--text2);
  font-size:12px;font-weight:600;cursor:pointer;transition:all .18s;
}
.ls-signin-btn:hover{border-color:var(--gold);color:var(--gold);background:var(--gold-l);}
.ls-pro-btn{
  display:flex;align-items:center;gap:5px;
  padding:6px 14px;border-radius:var(--r-pill);
  background:var(--gold);color:#0a0806;border:none;
  font-size:12px;font-weight:700;cursor:pointer;transition:all .18s;
  box-shadow:0 0 18px var(--glow);
}
.ls-pro-btn:hover{background:var(--gold-r);box-shadow:0 0 28px rgba(212,148,26,.35);}
.ls-user-avatar{
  width:30px;height:30px;border-radius:50%;
  background:var(--card2);border:1.5px solid rgba(212,148,26,.3);
  display:flex;align-items:center;justify-content:center;
  font-size:11px;font-weight:700;color:var(--gold);cursor:pointer;
}
.ls-pro-pip{font-size:9px;font-weight:700;color:#0a0806;background:var(--gold);padding:2px 8px;border-radius:var(--r-pill);}

/* ── BOTTOM NAV ── */
.ls-nav{
  display:flex;background:rgba(10,8,6,.98);
  border-top:1px solid rgba(255,255,255,.06);
  flex-shrink:0;padding-bottom:env(safe-area-inset-bottom,0);
}
.ls-nav-btn{flex:1;padding:10px 4px 8px;border:none;background:transparent;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;color:var(--muted);transition:color .15s;}
.ls-nav-btn.on{color:var(--gold);}
.ls-nav-label{font-family:'Lora',serif;font-size:9px;font-weight:500;font-style:italic;color:inherit;}

/* ── LAYOUT ── */
.ls-main{flex:1;overflow:hidden;display:flex;flex-direction:column;}
.ls-scroll{flex:1;overflow-y:auto;}

/* ── CINEMATIC HERO ── */
.ls-hero{
  padding:32px 16px 24px;
  background:linear-gradient(180deg,
    rgba(10,8,6,0) 0%,rgba(10,8,6,.5) 50%,rgba(10,8,6,1) 100%),
    radial-gradient(ellipse 100% 80% at 50% 0%,rgba(212,148,26,.1) 0%,transparent 70%),
    linear-gradient(145deg,#1a1208,#0e0c06);
  position:relative;overflow:hidden;
}
.ls-hero::after{
  content:'';position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(ellipse 60% 40% at 80% 20%,rgba(212,148,26,.04) 0%,transparent 60%);
}
.ls-hero-eyebrow{
  font-size:9.5px;font-weight:700;letter-spacing:3px;
  text-transform:uppercase;color:var(--gold);margin-bottom:10px;
  display:flex;align-items:center;gap:8px;
}
.ls-hero-eyebrow::before{content:'';width:22px;height:1.5px;background:var(--gold);border-radius:1px;}
.ls-hero-title{
  font-family:'Lora',serif;
  font-size:28px;font-weight:700;line-height:1.22;
  color:var(--text);margin-bottom:10px;letter-spacing:-.4px;
}
.ls-hero-title em{color:var(--gold);font-style:italic;}
.ls-hero-body{font-size:14px;line-height:1.7;color:var(--text2);margin-bottom:20px;max-width:290px;}
.ls-hero-cta{
  display:inline-flex;align-items:center;gap:9px;
  padding:13px 24px;border:none;border-radius:var(--r-pill);
  background:var(--gold);color:#0a0806;
  font-family:'Lora',serif;font-size:14px;font-weight:700;font-style:italic;
  cursor:pointer;transition:all .2s;margin-bottom:14px;
  box-shadow:0 4px 24px rgba(212,148,26,.4);
}
.ls-hero-cta:hover{background:var(--gold-r);transform:translateY(-2px);box-shadow:0 8px 32px rgba(212,148,26,.5);}
.ls-hero-links{display:flex;gap:8px;flex-wrap:wrap;}
.ls-hero-link{
  padding:7px 14px;border-radius:var(--r-pill);
  border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.06);color:var(--text2);
  font-size:12px;font-weight:600;cursor:pointer;transition:all .18s;
}
.ls-hero-link:hover{border-color:var(--gold);color:var(--gold);background:var(--gold-l);}

/* ── PROOF CARD ── */
.ls-proof{margin-top:22px;padding-top:20px;border-top:1px solid rgba(255,255,255,.06);}
.ls-proof-label{font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:12px;}
.ls-proof-card{
  display:flex;gap:12px;
  background:rgba(255,255,255,.03);border-radius:var(--r-md);
  padding:14px;border:1px solid rgba(255,255,255,.06);
}
.ls-proof-cover{
  width:52px;min-width:52px;height:72px;border-radius:6px;overflow:hidden;
  background:var(--card2);flex-shrink:0;
  box-shadow:3px 3px 12px rgba(0,0,0,.5);
}
.ls-proof-cover img{width:100%;height:100%;object-fit:cover;display:block;}
.ls-proof-body{flex:1;min-width:0;}
.ls-proof-title{font-family:'Lora',serif;font-size:13px;font-weight:600;color:var(--text);margin-bottom:1px;line-height:1.3;}
.ls-proof-author{font-size:10.5px;color:var(--muted);font-style:italic;margin-bottom:8px;}
.ls-proof-reason{
  font-size:11.5px;line-height:1.62;color:var(--text2);font-style:italic;
  padding:7px 10px;
  background:var(--gold-l);
  border-left:2px solid var(--gold);
  border-radius:0 5px 5px 0;
}
.ls-proof-reason strong{color:var(--gold);font-style:normal;font-weight:600;}

/* ── SECTION HEADERS ── */
.ls-sec-hdr{display:flex;align-items:center;justify-content:space-between;padding:0 16px;margin-bottom:12px;}
.ls-sec-hdr.spaced{margin-top:28px;}
.ls-sec-title{font-family:'Lora',serif;font-size:15px;font-weight:600;color:var(--text);letter-spacing:-.1px;}
.ls-sec-sub{font-size:10px;font-weight:500;color:var(--muted);}

/* ── MOOD CHIPS ── */
.ls-mood-row{display:flex;gap:9px;overflow-x:auto;padding:0 16px 6px;margin-bottom:24px;}
.ls-mood-chip{
  flex-shrink:0;display:flex;align-items:center;gap:6px;
  padding:9px 15px;border-radius:var(--r-pill);
  background:var(--card2);border:1px solid rgba(255,255,255,.06);
  color:var(--text2);cursor:pointer;transition:all .18s;
  font-size:13px;font-weight:500;white-space:nowrap;
}
.ls-mood-chip:hover{border-color:var(--gold);color:var(--gold);background:var(--gold-l);}
.ls-mood-chip.on{background:var(--gold);color:#0a0806;border-color:var(--gold);font-weight:700;box-shadow:0 0 16px var(--glow);}
.ls-mood-chip.on svg{color:#0a0806;}
.ls-mood-banner{
  margin:-16px 16px 20px;padding:9px 13px;border-radius:var(--r-md);
  background:var(--gold-l);border:1px solid rgba(212,148,26,.2);
  display:flex;align-items:center;justify-content:space-between;
}
.ls-mood-banner-text{font-size:12px;color:var(--gold);font-family:'Lora',serif;font-style:italic;font-weight:500;}
.ls-mood-banner-clear{background:transparent;border:none;color:var(--gold);font-size:11px;font-weight:600;cursor:pointer;}

/* ── GENRE PILLS ── */
.ls-genre-row{display:flex;gap:7px;overflow-x:auto;padding:0 16px 4px;margin-bottom:20px;}
.ls-genre-pill{
  padding:7px 16px;border-radius:var(--r-pill);
  border:1px solid rgba(255,255,255,.09);
  background:var(--card);color:var(--text2);
  font-size:12.5px;font-weight:500;
  cursor:pointer;transition:all .18s;white-space:nowrap;flex-shrink:0;
}
.ls-genre-pill:hover{border-color:var(--gold);color:var(--gold);background:var(--gold-l);}
.ls-genre-pill.on{background:var(--gold);border-color:var(--gold);color:#0a0806;font-weight:700;box-shadow:0 0 14px var(--glow);}

/* ── FILTER CTA ── */
.ls-filter-cta{
  display:flex;align-items:center;justify-content:center;gap:8px;
  margin:0 16px 24px;padding:13px;border-radius:var(--r-md);border:1px solid rgba(212,148,26,.25);
  background:rgba(212,148,26,.1);color:var(--gold);
  font-family:'Lora',serif;font-size:14px;font-weight:600;font-style:italic;
  cursor:pointer;transition:all .18s;
}
.ls-filter-cta:hover{background:rgba(212,148,26,.18);box-shadow:0 0 20px var(--glow);}

/* ── BOOK CARDS — NETFLIX STYLE ── */
.ls-books{display:flex;flex-direction:column;gap:16px;padding:0 16px 8px;}
.ls-book-card{
  display:flex;gap:14px;padding:14px;
  background:var(--card);border-radius:var(--r-lg);
  border:1px solid rgba(255,255,255,.04);
  cursor:pointer;transition:all .2s;
  box-shadow:0 4px 20px rgba(0,0,0,.3);
}
.ls-book-card:hover{
  background:var(--card2);border-color:rgba(212,148,26,.2);
  box-shadow:0 8px 32px rgba(0,0,0,.5),0 0 0 1px rgba(212,148,26,.1);
  transform:translateY(-2px);
}

/* ── BOOK COVER ── */
.ls-book-cover{
  width:72px;min-width:72px;height:104px;
  border-radius:8px;overflow:hidden;flex-shrink:0;
  background:var(--card2);
  box-shadow:4px 4px 16px rgba(0,0,0,.6);
  position:relative;
}
.ls-book-cover img{width:100%;height:100%;object-fit:cover;display:block;}
.ls-book-cover-fallback{
  width:100%;height:100%;
  display:flex;flex-direction:column;justify-content:flex-end;
  padding:10px 9px 10px;position:relative;
}
.ls-book-cover-lines{
  position:absolute;top:10px;left:9px;right:9px;
  display:flex;flex-direction:column;gap:4px;
}
.ls-book-cover-line{
  height:1.5px;background:rgba(212,148,26,.2);border-radius:1px;
}
.ls-book-cover-line.short{width:60%;}
.ls-book-cover-title{
  font-family:'Lora',serif;font-size:11px;font-weight:700;
  color:rgba(240,232,216,.9);line-height:1.3;
  position:relative;z-index:1;margin-bottom:4px;
}
.ls-book-cover-author{
  font-size:9px;font-weight:400;font-style:italic;
  color:rgba(212,148,26,.7);position:relative;z-index:1;
}

/* ── BOOK INFO ── */
.ls-book-info{flex:1;min-width:0;display:flex;flex-direction:column;}
.ls-book-header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px;}
.ls-book-title{font-family:'Lora',serif;font-size:15px;font-weight:600;line-height:1.28;color:var(--text);letter-spacing:-.1px;}
.ls-book-score-badge{
  flex-shrink:0;display:flex;align-items:center;
  font-size:10px;font-weight:700;color:var(--gold);
  background:var(--gold-l);border:1px solid rgba(212,148,26,.2);
  padding:2px 7px;border-radius:var(--r-pill);white-space:nowrap;
}
.ls-book-author{font-size:11.5px;font-style:italic;color:var(--muted);margin-bottom:10px;}
.ls-book-tags{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;}
.ls-book-tag{padding:2px 8px;border-radius:var(--r-pill);font-size:9.5px;font-weight:600;background:var(--bg3);color:var(--muted);}
.ls-book-tag.primary{background:rgba(212,148,26,.15);color:var(--gold);}

/* ── WHY PANEL ── */
.ls-book-why{
  flex:1;
  font-size:12px;line-height:1.65;color:var(--text2);
  padding:9px 11px;
  background:rgba(255,255,255,.03);
  border-left:2px solid rgba(212,148,26,.4);
  border-radius:0 6px 6px 0;
  font-style:italic;
}
.ls-book-why strong{color:var(--gold);font-style:normal;font-weight:600;}

/* ── CALLOUT ── */
.ls-callout{
  margin:0 16px 20px;border-radius:var(--r-md);padding:11px 13px;
  display:flex;gap:9px;align-items:flex-start;font-size:12.5px;line-height:1.65;
}
.ls-callout.info{background:var(--gold-l);border:1px solid rgba(212,148,26,.18);color:var(--gold);}
.ls-callout-icon{flex-shrink:0;margin-top:1px;}

/* ── SHELF ── */
.ls-shelf-scroll{flex:1;overflow-y:auto;padding:20px 16px 32px;}
.ls-shelf-hdr{margin-bottom:20px;}
.ls-shelf-hdr-title{font-family:'Lora',serif;font-size:22px;font-weight:700;font-style:italic;color:var(--text);margin-bottom:4px;}
.ls-shelf-hdr-sub{font-size:13px;color:var(--text2);}
.ls-status-tabs{display:flex;gap:4px;margin-bottom:18px;background:var(--card);border-radius:var(--r-md);padding:4px;}
.ls-status-tab{flex:1;padding:8px 4px;border-radius:var(--r-sm);border:none;background:transparent;color:var(--muted);font-family:'Lora',serif;font-size:12px;font-weight:500;font-style:italic;cursor:pointer;text-align:center;transition:all .18s;}
.ls-status-tab.on{background:var(--card2);color:var(--gold);font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.4);}

/* ── SHELF GATE ── */
.ls-shelf-gate{display:flex;flex-direction:column;align-items:center;text-align:center;padding:52px 24px;gap:12px;}
.ls-shelf-gate-icon{color:var(--gold);opacity:.45;margin-bottom:4px;}
.ls-shelf-gate-title{font-family:'Lora',serif;font-size:21px;font-weight:700;color:var(--text);}
.ls-shelf-gate-body{font-size:14px;color:var(--text2);max-width:240px;line-height:1.72;}

/* ── INPUTS ── */
.ls-input-card{background:var(--card);border-radius:var(--r-md);padding:16px;margin-bottom:14px;border:1px solid rgba(255,255,255,.05);}
.ls-input-label{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:10px;}
.ls-input-row{display:flex;gap:8px;}
.ls-input{flex:1;background:var(--bg2);border:1px solid rgba(255,255,255,.08);border-radius:var(--r-sm);color:var(--text);font-family:'DM Sans',sans-serif;font-size:14px;padding:10px 13px;outline:none;transition:border-color .2s;}
.ls-input:focus{border-color:var(--gold);}
.ls-input::placeholder{color:var(--muted);}
.ls-input.full{width:100%;}
.ls-add-btn{padding:10px 15px;border-radius:var(--r-sm);border:none;background:var(--gold);color:#0a0806;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .18s;flex-shrink:0;}
.ls-add-btn:hover{background:var(--gold-r);}

/* ── BOOK ROWS (shelf) ── */
.ls-book-row{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-radius:var(--r-md);background:var(--card);border:1px solid rgba(255,255,255,.04);margin-bottom:7px;}
.ls-book-row-left{flex:1;min-width:0;}
.ls-book-row-right{display:flex;align-items:center;gap:8px;flex-shrink:0;}
.ls-book-row-actions{display:flex;gap:7px;flex-shrink:0;align-items:center;}
.ls-book-row-title{font-size:13.5px;font-weight:500;color:var(--text);margin-bottom:2px;}
.ls-book-row-author{font-size:11px;color:var(--muted);font-style:italic;}
.ls-star-row{display:flex;gap:3px;align-items:center;}
.ls-star{cursor:pointer;transition:all .1s;display:inline-flex;align-items:center;}
.ls-remove-btn{background:transparent;border:none;color:var(--faint);cursor:pointer;padding:4px 6px;transition:color .15s;display:flex;align-items:center;}
.ls-remove-btn:hover{color:var(--rust);}

/* ── BUTTONS ── */
.ls-action-wrap{margin-top:16px;}
.ls-action-btn{width:100%;padding:14px;border-radius:var(--r-md);border:none;background:var(--gold);color:#0a0806;font-family:'Lora',serif;font-size:15px;font-weight:700;font-style:italic;cursor:pointer;transition:all .18s;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 20px rgba(212,148,26,.3);}
.ls-action-btn:hover{background:var(--gold-r);transform:translateY(-1px);}
.ls-action-btn:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none;}
.ls-ask-ai-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:var(--r-sm);border:1px solid rgba(255,255,255,.1);background:transparent;color:var(--text2);font-size:11.5px;font-weight:600;cursor:pointer;transition:all .18s;}
.ls-ask-ai-btn:hover{border-color:var(--gold);color:var(--gold);background:var(--gold-l);}

/* ── EMPTY STATES ── */
.ls-empty{text-align:center;padding:48px 24px;display:flex;flex-direction:column;align-items:center;gap:10px;}
.ls-empty-icon{color:var(--faint);margin-bottom:4px;opacity:.4;}
.ls-empty-title{font-family:'Lora',serif;font-size:17px;font-weight:600;font-style:italic;color:var(--text);}
.ls-empty-body{font-size:13.5px;color:var(--text2);max-width:220px;line-height:1.7;}

/* ── QUESTION COUNTER ── */
.ls-counter{padding:6px 16px;display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:var(--muted);border-top:1px solid rgba(255,255,255,.05);background:rgba(10,8,6,.97);flex-shrink:0;}
.ls-counter.warn{color:var(--rust);}
.ls-counter-upgrade{font-size:11.5px;font-weight:600;color:var(--gold);background:none;border:none;cursor:pointer;padding:0;}

/* ── LIMIT WALL ── */
.ls-limit-wall{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:36px 24px;gap:12px;}
.ls-limit-title{font-family:'Lora',serif;font-size:22px;font-weight:700;color:var(--text);line-height:1.25;}
.ls-limit-title em{color:var(--gold);font-style:italic;}
.ls-limit-body{font-size:14px;color:var(--text2);max-width:240px;line-height:1.72;}
.ls-limit-cta{margin-top:8px;padding:13px 32px;border-radius:var(--r-pill);border:none;background:var(--gold);color:#0a0806;font-family:'Lora',serif;font-size:15px;font-weight:700;font-style:italic;cursor:pointer;box-shadow:0 4px 20px rgba(212,148,26,.35);transition:all .18s;}
.ls-limit-cta:hover{background:var(--gold-r);transform:translateY(-1px);}
.ls-limit-cta.outline{background:transparent;color:var(--gold);border:1.5px solid var(--gold);box-shadow:none;margin-top:4px;}
.ls-limit-note{font-size:11.5px;color:var(--muted);margin-top:4px;}

/* ── ASK CHAT ── */
.ls-ask-msgs{flex:1;overflow-y:auto;padding:20px 16px;display:flex;flex-direction:column;gap:16px;}
.ls-welcome{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;gap:10px;padding:28px 20px;}
.ls-welcome-icon{color:var(--gold);filter:drop-shadow(0 4px 16px rgba(212,148,26,.3));margin-bottom:8px;}
.ls-welcome-title{font-family:'Lora',serif;font-size:28px;font-weight:700;color:var(--text);line-height:1.2;}
.ls-welcome-title em{color:var(--gold);font-style:italic;}
.ls-welcome-sub{font-size:14px;color:var(--text2);max-width:250px;line-height:1.72;margin-bottom:8px;}
.ls-prompt-list{display:flex;flex-direction:column;gap:7px;width:100%;max-width:320px;}
.ls-prompt-btn{
  padding:12px 16px;border-radius:var(--r-md);
  border:1px solid rgba(255,255,255,.07);background:var(--card);color:var(--text2);
  font-family:'Lora',serif;font-size:13px;font-weight:400;font-style:italic;
  cursor:pointer;text-align:left;transition:all .18s;
  box-shadow:0 2px 8px rgba(0,0,0,.3);line-height:1.45;
}
.ls-prompt-btn:hover{color:var(--gold);background:var(--gold-l);border-color:rgba(212,148,26,.25);transform:translateY(-1px);}

/* ── MESSAGES ── */
.ls-msg{display:flex;gap:10px;max-width:100%;animation:msgIn .2s ease-out;}
.ls-msg.user{flex-direction:row-reverse;align-self:flex-end;}
@keyframes msgIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.ls-av{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.ls-av.ai{background:linear-gradient(135deg,var(--card2),var(--lift));border:1.5px solid rgba(212,148,26,.25);color:var(--gold);}
.ls-av.user{background:var(--bg3);color:var(--text2);font-size:11px;font-weight:700;}
.ls-bubble{padding:12px 16px;border-radius:16px;font-size:14px;line-height:1.75;max-width:calc(100% - 44px);}
.ls-bubble.ai{background:var(--card);border:1px solid rgba(255,255,255,.05);color:var(--text);border-radius:4px 16px 16px 16px;}
.ls-bubble.user{background:var(--bg3);border:1px solid rgba(255,255,255,.06);color:var(--text2);border-radius:16px 4px 16px 16px;}
.ls-bubble.error{background:rgba(184,64,40,.08);border:1px solid rgba(184,64,40,.2);color:var(--rust);border-radius:4px 16px 16px 16px;display:flex;flex-direction:column;gap:9px;}
.ls-bubble.ai strong{color:var(--gold);font-weight:600;}
.ls-bubble.ai em{color:var(--sage);font-style:normal;font-weight:600;}
.ls-bubble.ai h4{font-family:'Lora',serif;font-size:12.5px;font-weight:600;font-style:italic;color:var(--text2);margin:12px 0 5px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,.06);}
.ls-bubble.ai h4:first-child{margin-top:0;}
.ls-bubble.ai li{margin-bottom:5px;padding-left:14px;color:var(--text2);}
.ls-retry-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:6px;border:1px solid rgba(184,64,40,.3);background:transparent;color:var(--rust);font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;align-self:flex-start;}
.ls-dots{display:flex;gap:5px;align-items:center;padding:5px 2px;}
.ls-dot{width:6px;height:6px;border-radius:50%;background:var(--gold);animation:ldot 1.2s ease-in-out infinite;}
.ls-dot:nth-child(2){animation-delay:.2s;}.ls-dot:nth-child(3){animation-delay:.4s;}
@keyframes ldot{0%,60%,100%{transform:translateY(0);opacity:.3}30%{transform:translateY(-6px);opacity:1}}

/* ── CHAT INPUT ── */
.ls-input-row-chat{display:flex;gap:9px;padding:10px 16px;border-top:1px solid rgba(255,255,255,.05);background:rgba(10,8,6,.98);flex-shrink:0;}
textarea.ls-chat-input{flex:1;background:var(--card);border:1px solid rgba(255,255,255,.08);border-radius:12px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:14px;padding:11px 14px;resize:none;outline:none;line-height:1.5;min-height:46px;max-height:110px;transition:border-color .2s;}
textarea.ls-chat-input:focus{border-color:var(--gold);}
textarea.ls-chat-input::placeholder{color:var(--muted);}
.ls-send-btn{width:46px;height:46px;border-radius:12px;border:none;flex-shrink:0;background:var(--gold);color:#0a0806;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .18s;box-shadow:0 3px 12px rgba(212,148,26,.35);}
.ls-send-btn:hover{background:var(--gold-r);}
.ls-send-btn:active{transform:scale(.93);}
.ls-send-btn:disabled{opacity:.35;cursor:not-allowed;box-shadow:none;}

/* ── MODALS ── */
.ls-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(10px);display:flex;align-items:flex-end;justify-content:center;z-index:200;animation:fadeIn .22s ease;}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.ls-modal{background:var(--bg3);border-radius:22px 22px 0 0;padding:8px 20px 48px;width:100%;max-width:480px;animation:slideUp .3s cubic-bezier(.32,.72,0,1);box-shadow:0 -12px 48px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.06);border-bottom:none;}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.ls-modal-handle{width:36px;height:4px;border-radius:2px;background:var(--faint);margin:14px auto 22px;}
.ls-modal-eyebrow{font-size:9.5px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--gold);margin-bottom:7px;}
.ls-modal-title{font-family:'Lora',serif;font-size:28px;font-weight:700;color:var(--text);margin-bottom:7px;line-height:1.2;}
.ls-modal-title em{color:var(--gold);font-style:italic;}
.ls-modal-sub{font-size:14px;color:var(--text2);line-height:1.68;margin-bottom:22px;}
.ls-pro-features{display:flex;flex-direction:column;gap:12px;margin-bottom:26px;}
.ls-pro-feature{display:flex;align-items:flex-start;gap:12px;}
.ls-pro-feat-icon{width:32px;height:32px;border-radius:var(--r-sm);background:var(--gold-l);border:1px solid rgba(212,148,26,.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--gold);}
.ls-pro-feat-text{flex:1;}
.ls-pro-feat-title{font-size:14px;font-weight:600;color:var(--text);margin-bottom:2px;}
.ls-pro-feat-desc{font-size:12px;color:var(--muted);line-height:1.55;}
.ls-modal-price-row{display:flex;align-items:baseline;gap:7px;margin-bottom:16px;}
.ls-modal-price{font-family:'Lora',serif;font-size:38px;font-weight:700;color:var(--text);}
.ls-modal-price-period{font-size:14px;color:var(--muted);}
.ls-modal-price-note{font-size:12px;color:var(--sage);font-weight:600;}
.ls-modal-cta{width:100%;padding:16px;border-radius:var(--r-md);border:none;background:var(--gold);color:#0a0806;font-family:'Lora',serif;font-size:17px;font-weight:700;font-style:italic;cursor:pointer;margin-bottom:11px;box-shadow:0 6px 24px rgba(212,148,26,.4);transition:all .18s;}
.ls-modal-cta:hover{background:var(--gold-r);transform:translateY(-1px);}
.ls-modal-cancel{width:100%;padding:13px;border-radius:var(--r-md);border:1px solid rgba(255,255,255,.1);background:transparent;color:var(--muted);font-size:14px;cursor:pointer;transition:all .15s;}
.ls-modal-cancel:hover{color:var(--text2);}

/* ── AUTH MODAL ── */
.ls-auth-overlay{position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(10px);display:flex;align-items:flex-end;justify-content:center;z-index:300;animation:fadeIn .22s ease;}
.ls-auth-modal{background:var(--bg3);border-radius:22px 22px 0 0;padding:8px 20px 48px;width:100%;max-width:480px;animation:slideUp .3s cubic-bezier(.32,.72,0,1);box-shadow:0 -12px 48px rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.06);border-bottom:none;}
.ls-auth-handle{width:36px;height:4px;border-radius:2px;background:var(--faint);margin:14px auto 22px;}
.ls-auth-eyebrow{font-size:9.5px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--gold);margin-bottom:7px;}
.ls-auth-title{font-family:'Lora',serif;font-size:24px;font-weight:700;color:var(--text);margin-bottom:5px;line-height:1.25;}
.ls-auth-title em{color:var(--gold);font-style:italic;}
.ls-auth-sub{font-size:13.5px;color:var(--text2);line-height:1.65;margin-bottom:22px;}
.ls-auth-field{display:flex;flex-direction:column;gap:6px;margin-bottom:13px;}
.ls-auth-label{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);}
.ls-auth-input{width:100%;background:var(--bg2);border:1px solid rgba(255,255,255,.08);border-radius:var(--r-sm);color:var(--text);font-family:'DM Sans',sans-serif;font-size:15px;padding:12px 14px;outline:none;transition:border-color .2s;}
.ls-auth-input:focus{border-color:var(--gold);}
.ls-auth-input::placeholder{color:var(--muted);}
.ls-auth-error{font-size:13px;color:var(--rust);margin-bottom:13px;padding:10px 13px;background:rgba(184,64,40,.08);border-radius:var(--r-sm);border:1px solid rgba(184,64,40,.2);}
.ls-auth-cta{width:100%;padding:15px;border-radius:var(--r-md);border:none;background:var(--gold);color:#0a0806;font-family:'Lora',serif;font-size:17px;font-weight:700;font-style:italic;cursor:pointer;margin-bottom:13px;box-shadow:0 6px 24px rgba(212,148,26,.4);transition:all .18s;margin-top:4px;}
.ls-auth-cta:hover{background:var(--gold-r);transform:translateY(-1px);}
.ls-auth-switch{text-align:center;font-size:13.5px;color:var(--text2);margin-bottom:11px;}
.ls-auth-switch button{background:none;border:none;color:var(--gold);font-weight:600;cursor:pointer;padding:0;}
.ls-auth-cancel{display:block;width:100%;padding:12px;border-radius:var(--r-md);border:1px solid rgba(255,255,255,.1);background:transparent;color:var(--muted);font-size:13.5px;cursor:pointer;transition:all .15s;text-align:center;}
.ls-auth-cancel:hover{color:var(--text2);}
/* Disable hover scale on touch — tap opens modal */
@media(hover:none){.ls-tile-wrap:hover .ls-tile{transform:scale(1);box-shadow:none;}.ls-tile-wrap:hover .ls-tile-overlay{opacity:0;}.ls-tile-wrap,.ls-tile{transition:none;}}
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

// ── BOOK TILE (Netflix-style horizontal card with hover overlay) ──────────────
function BookTile({ book: b, onAsk, onTap }) {
  const handleClick = () => onTap(b);
  const handleAskAI = (e) => { e.stopPropagation(); onAsk(`Tell me about "${b.title}" by ${b.author}. Should I read it? Be specific and honest.`); };

  return (
    <div className="ls-tile-wrap">
      <div className="ls-tile" onClick={handleClick}>
        <div className="ls-tile-cover">
          <BookCover isbn={b.isbn} title={b.title} author={b.author} color={b.color}/>
          <div className="ls-tile-score">{b.score}%</div>
          {/* Hover overlay — desktop only (CSS hides on touch) */}
          <div className="ls-tile-overlay">
            <div className="ls-tile-ov-title">{b.title}</div>
            <div className="ls-tile-ov-author">{b.author}</div>
            <div className="ls-tile-ov-why" dangerouslySetInnerHTML={{__html: b.why}}/>
            <button className="ls-tile-ov-btn" onClick={handleAskAI}>Ask AI →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── TILE MODAL (mobile tap replacement for hover overlay) ─────────────────────
function TileModal({ book: b, onClose, onAsk }) {
  if (!b) return null;
  return (
    <div className="ls-tile-modal-overlay" onClick={onClose}>
      <div className="ls-tile-modal" onClick={e => e.stopPropagation()}>
        <div className="ls-tile-modal-handle"/>
        <div className="ls-tile-modal-cover">
          <BookCover isbn={b.isbn} title={b.title} author={b.author} color={b.color}/>
        </div>
        <div className="ls-tile-modal-title">{b.title}</div>
        <div className="ls-tile-modal-author">{b.author}</div>
        <div className="ls-tile-modal-why-label">Why we recommend this</div>
        <div className="ls-tile-modal-why" dangerouslySetInnerHTML={{__html: b.why}}/>
        <button className="ls-tile-modal-cta" onClick={() => { onAsk(`Tell me about "${b.title}" by ${b.author}. Should I read it?`); onClose(); }}>
          Ask LitSense about this book
        </button>
        <button className="ls-tile-modal-cancel" onClick={onClose}>Close</button>
      </div>
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
  const questionLimit = isPro ? Infinity : isSignedIn ? LIMIT_FREE : LIMIT_ANON;
  const questionsLeft = questionLimit === Infinity ? null : Math.max(0, questionLimit - questionsUsed);
  const atLimit = !isPro && questionsUsed >= questionLimit;

  // ── SHELF ─────────────────────────────────────────────────────────────────
  const loadShelf = () => { try { const r = localStorage.getItem("ls_shelf"); return r ? JSON.parse(r) : null; } catch { return null; } };
  const [readBooks, setReadBooks]     = useState(() => loadShelf()?.readBooks ?? []);
  const [currentBook, setCurrentBook] = useState(() => loadShelf()?.currentBook ?? "");
  const [wantList, setWantList]       = useState(() => loadShelf()?.wantList ?? []);
  useEffect(() => { if (!isSignedIn) return; try { localStorage.setItem("ls_shelf",JSON.stringify({readBooks,currentBook,wantList})); } catch {} }, [readBooks,currentBook,wantList,isSignedIn]);

  // ── UI STATE ──────────────────────────────────────────────────────────────
  const [tab, setTab]             = useState("discover");
  const [showPro, setPro]         = useState(false);
  const [mood, setMood]           = useState(null);
  const [genre, setGenre]         = useState(null);
  const [shelfTab, setShelfTab]   = useState("read");
  const [bookInput, setBookInput] = useState("");
  const [wantInput, setWantInput] = useState("");
  const [tappedBook, setTappedBook] = useState(null);
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
  const visibleBooks = genre
    ? BOOKS.filter(b=>b.tags.some(t=>t.toLowerCase().includes(genre.toLowerCase())))
    : BOOKS;
  const userInitial = userEmail ? userEmail[0].toUpperCase() : "";

  return (
    <div className="ls">

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

              {/* Proof card — real cover + why */}
              <div className="ls-proof">
                <div className="ls-proof-label">How LitSense recommends</div>
                <div className="ls-proof-card">
                  <BookCover isbn="9780802162175" title="The Covenant of Water" author="Abraham Verghese" color={["#1a2430","#0e1820"]}/>
                  <div className="ls-proof-body">
                    <div className="ls-proof-title">The Covenant of Water</div>
                    <div className="ls-proof-author">Abraham Verghese</div>
                    <div className="ls-proof-reason">
                      Because you gave <strong>Pachinko</strong> five stars and loved <strong>A Gentleman in Moscow</strong> for its patience — you want literary fiction that earns its length. This is that book.
                    </div>
                  </div>
                </div>
              </div>
            </div>

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
                <span className="ls-mood-banner-text">Mood: <em>{mood}</em> — tap "Find my next book" to use it</span>
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

            {/* Netflix-style horizontal tile row */}
            <div className="ls-sec-hdr" style={{padding:"0 16px",marginBottom:8,marginTop:24}}>
              <span className="ls-sec-title">{readBooks.length>=1?"Picked for you":"Editor's picks"}</span>
              {readBooks.length===0 && <span className="ls-sec-sub">Curated by LitSense</span>}
            </div>
            {visibleBooks.length===0 ? (
              <div className="ls-empty" style={{padding:"32px 16px"}}>
                <div className="ls-empty-icon"><BookOpen size={36} strokeWidth={1}/></div>
                <div className="ls-empty-title">No picks in that genre</div>
                <div className="ls-empty-body">Try a different genre or ask the AI for personalized picks.</div>
              </div>
            ) : (
              <div className="ls-row-outer">
                <div className="ls-row-track">
                  {visibleBooks.map(b=>(
                    <BookTile
                      key={b.id}
                      book={b}
                      onAsk={goAsk}
                      onTap={setTappedBook}
                    />
                  ))}
                </div>
              </div>
            )}
            <div style={{height:8}}/>

                        <div className="ls-callout info">
              <Lightbulb size={14} strokeWidth={2} className="ls-callout-icon"/>
              <span>
                {readBooks.length>=1
                  ? "The more you rate, the more accurate your picks become."
                  : <span>Rate books in <strong>My Shelf</strong> to get picks tailored to your taste.</span>}
              </span>
            </div>
            <div style={{height:8}}/>
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
                <div className="ls-status-tabs">
                  {[["read","Finished"],["reading","Reading"],["want","Want to Read"]].map(([v,l])=>(
                    <button key={v} className={`ls-status-tab${shelfTab===v?" on":""}`} onClick={()=>setShelfTab(v)}>{l}</button>
                  ))}
                </div>

                {shelfTab==="read" && (
                  <>
                    <div className="ls-input-card">
                      <div className="ls-input-label">Add a book you've read</div>
                      <div className="ls-input-row">
                        <input className="ls-input" placeholder="Book title..." value={bookInput}
                          onChange={e=>setBookInput(e.target.value)}
                          onKeyDown={e=>{if(e.key==="Enter")addBook();}}/>
                        <button className="ls-add-btn" onClick={addBook}><Plus size={18} strokeWidth={2}/></button>
                      </div>
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
                      <div className="ls-input-label">Add to your list</div>
                      <div className="ls-input-row">
                        <input className="ls-input" placeholder="Book title..." value={wantInput}
                          onChange={e=>setWantInput(e.target.value)}
                          onKeyDown={e=>{if(e.key==="Enter")addWant();}}/>
                        <button className="ls-add-btn" onClick={addWant}><Plus size={18} strokeWidth={2}/></button>
                      </div>
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
  );
}
