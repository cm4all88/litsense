// src/ReadLocal.jsx
// ─────────────────────────────────────────────────────────────────────────────
// READ LOCAL — Cinematic nearby reading culture discovery.
//
// Requires: GOOGLE_PLACES_API_KEY in Vercel env vars + /api/places.js
// Feature flag: Admin → Feature Flags → read_local
// Falls back gracefully to curated demo data if API not yet configured.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ── ATMOSPHERIC PHOTOGRAPHY ───────────────────────────────────────────────────
// Curated bookstore/library/reading photography — used as cinematic backdrops.
// Real place photos from Google Places override these when available.
const ATMO = [
  "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=900&q=82", // cozy indie
  "https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=900&q=82", // grand library
  "https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=900&q=82", // shelves
  "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=900&q=82", // warm interior
  "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=900&q=82", // books on table
  "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=900&q=82", // indie storefront
  "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=900&q=82", // dark shelves
  "https://images.unsplash.com/photo-1457369804613-52c61a468e7d?w=900&q=82", // reading café
  "https://images.unsplash.com/photo-1580537659466-0a9bfa916a54?w=900&q=82", // library stacks
  "https://images.unsplash.com/photo-1550399105-c4db5fb85c18?w=900&q=82", // used bookstore
  "https://images.unsplash.com/photo-1589998059171-988d887df646?w=900&q=82", // light and books
  "https://images.unsplash.com/photo-1568667256549-094345857cbb?w=900&q=82", // minimal shelf
];

function getAtmo(seed) {
  let h = 0;
  const s = String(seed || "default");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ATMO[Math.abs(h) % ATMO.length];
}

// ── GEO UTILS ─────────────────────────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371e3, f1 = lat1*Math.PI/180, f2 = lat2*Math.PI/180;
  const df = (lat2-lat1)*Math.PI/180, dl = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(df/2)**2 + Math.cos(f1)*Math.cos(f2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function fmtDist(m) {
  if (m < 100)  return "steps away";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m/1609).toFixed(1)} mi`;
}

// ── VIBE TAGS ─────────────────────────────────────────────────────────────────
function inferVibeTags(place) {
  const n = (place.name||"").toLowerCase();
  const types = place.types||[];
  const tags = new Set();
  if (types.includes("library"))                        { tags.add("Free"); tags.add("Library"); }
  if (n.includes("used")||n.includes("second hand"))   tags.add("Used Books");
  if (n.includes("rare")||n.includes("antiquarian"))   { tags.add("Rare Books"); tags.add("Collector's"); }
  if (n.includes("café")||n.includes("cafe")||n.includes("coffee")) tags.add("Café Attached");
  if (n.includes("mystery"))   tags.add("Mystery Focus");
  if (n.includes("horror")||n.includes("weird"))  tags.add("Dark Fiction");
  if (n.includes("fantasy")||n.includes("dragon")) tags.add("Fantasy Focus");
  if (n.includes("sci-fi")||n.includes("scifi"))  tags.add("Sci-Fi Focus");
  if (n.includes("children")||n.includes("kids")) tags.add("Children's");
  if (n.includes("comic")||n.includes("graphic")||n.includes("manga")) tags.add("Comics");
  if (n.includes("poetry")||n.includes("poet"))   tags.add("Poetry");
  if (n.includes("art")||n.includes("design"))    tags.add("Art Books");
  if (n.includes("academic")||n.includes("scholar")) tags.add("Academic");
  if (place.openNow)       tags.add("Open Now");
  if (place.rating >= 4.5) tags.add("Highly Rated");
  if (tags.size <= (place.openNow||place.rating>=4.5 ? 1 : 0)) {
    if (types.includes("library")) { tags.add("Free"); tags.add("Quiet"); }
    else if (types.includes("cafe")) tags.add("Reading Café");
    else tags.add("Indie Bookstore");
  }
  return [...tags].slice(0,4);
}

// ── SAGE VOICE ────────────────────────────────────────────────────────────────
function buildSageNote(place, { topGenres=[] }={}) {
  const tags = place.vibeTags||[];
  if (tags.includes("Rare Books"))      return "Rare and out-of-print editions. The kind of place you browse for an hour and leave with something unexpected.";
  if (tags.includes("Used Books"))      return "Good for finding things you wouldn't have thought to look for.";
  if (tags.includes("Café Attached"))   return "You can stay. Buy the book, order something, start it there.";
  if (tags.includes("Free") && tags.includes("Library")) return "Free access, strong collection. Often underrated. Worth getting a card.";
  if (tags.includes("Dark Fiction")&&topGenres.some(g=>/horror|dark/i.test(g))) return "Carries the kind of atmospheric, unsettling fiction you've been reading lately.";
  if (tags.includes("Fantasy Focus")&&topGenres.some(g=>/fantasy/i.test(g)))    return "Heavy fantasy section — including some harder-to-find titles.";
  if (tags.includes("Highly Rated"))    return "Consistently well-regarded by readers. The kind of place people mention by name.";
  if ((place.distance||0) < 350)        return "Very close. Worth walking past even if you're not buying.";
  return "A solid addition to your reading world.";
}

function buildSageLocalIntro(places, { topGenres=[], currentBook="" }={}) {
  if (!places.length) return "Your neighborhood has more reading culture than most people realize. Let me show you what's here.";
  const p = places[0], n=(p.name||"").toLowerCase();
  const isLib = p.types?.includes("library");
  if (topGenres.some(g=>/horror|dark/i.test(g)) && (n.includes("horror")||n.includes("weird")))
    return `There's a store nearby that takes dark and atmospheric fiction seriously. Given what you've been reading, it's worth an afternoon.`;
  if (topGenres.some(g=>/literary|fiction|translation/i.test(g)) && isLib)
    return `This library has a surprisingly strong literary fiction section. The kind of place you'd spend more time in than planned.`;
  if (topGenres.some(g=>/fantasy|speculative/i.test(g)))
    return `There's a spot nearby with a serious speculative fiction section — staff picks, events, the works.`;
  if (topGenres.some(g=>/mystery|crime|noir/i.test(g)))
    return `A bookstore nearby with a strong mystery and noir presence. They host reading nights occasionally.`;
  if (currentBook) return `While you're in the middle of something, your neighborhood has a few places worth knowing for what comes next.`;
  const opts = [
    `There's a ${isLib?"library":"bookstore"} nearby that's more interesting than its exterior suggests.`,
    `${p.name||"A spot nearby"} caught my attention. The kind of place that suits the way you read.`,
    `Your neighborhood has some genuinely good reading spots. Here's what caught mine.`,
    `A few places worth knowing. The kind of spots readers keep coming back to.`,
  ];
  return opts[new Date().getDate()%opts.length];
}

// ── DEMO PLACES (shown when API key not yet configured) ───────────────────────
function makeDemoPlaces(loc) {
  return [
    { id:"rl-d1", name:"The Open Book",    types:["book_store"], lat:loc.lat+0.003, lng:loc.lng+0.002, address:"Near you", rating:4.8, openNow:true,  distance:320,  vibeTags:["Indie Bookstore","Staff Picks","Open Now","Literary"], sageNote:"A well-curated indie with a strong literary fiction section and staff that actually reads.", photoUrl:ATMO[0] },
    { id:"rl-d2", name:"Chapter & Verse",  types:["book_store"], lat:loc.lat+0.006, lng:loc.lng-0.003, address:"Nearby",   rating:4.5, openNow:false, distance:690,  vibeTags:["Used Books","Collector's","Rare Books"],              sageNote:"The kind of used bookstore where you find things you didn't know you were looking for.", photoUrl:ATMO[9] },
    { id:"rl-d3", name:"Central Library",  types:["library"],    lat:loc.lat-0.004, lng:loc.lng+0.005, address:"Nearby",   rating:4.6, openNow:true,  distance:880,  vibeTags:["Free","Library","Quiet","Open Now"],                  sageNote:"Stronger collection than most people expect. Free access, late hours several days a week.", photoUrl:ATMO[8] },
    { id:"rl-d4", name:"Pages & Pour",     types:["cafe","book_store"], lat:loc.lat+0.008, lng:loc.lng+0.005, address:"Nearby", rating:4.7, openNow:true, distance:1200, vibeTags:["Café Attached","New Books","Reading Space","Open Now"], sageNote:"You can stay. Buy the book, order something, start it there. Good for long afternoons.", photoUrl:ATMO[7] },
  ];
}

// ── DEMO EVENTS ───────────────────────────────────────────────────────────────
const DEMO_EVENTS = [
  { id:"ev1", title:"Literary Fiction Night",   venue:"The Open Book",   type:"Reading Group",    month:"JAN", day:"18", desc:"Monthly discussion. This month: Yellowface by R.F. Kuang." },
  { id:"ev2", title:"Horror & Weird Fiction",   venue:"Chapter & Verse", type:"Author Event",     month:"JAN", day:"23", desc:"Signed copies + reading from local horror anthology." },
  { id:"ev3", title:"Poetry Open Mic",          venue:"Pages & Pour",    type:"Community Night",  month:"FEB", day:"2",  desc:"Open mic + curated reading. All voices welcome." },
];

// ── STYLES ────────────────────────────────────────────────────────────────────
const RL_CSS = `
.rl-root{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden;background:var(--bg,#09080a);-webkit-overflow-scrolling:touch;}
.rl-perm{min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 28px;text-align:center;position:relative;overflow:hidden;}
.rl-perm-bg{position:absolute;inset:-5%;background-size:cover;background-position:center;filter:brightness(0.22) saturate(0.65);}
.rl-perm-z{position:relative;z-index:1;max-width:340px;}
.rl-eyebrow{font-size:9.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gold,#c9a84c);margin-bottom:14px;display:flex;align-items:center;justify-content:center;gap:6px;}
.rl-serif{font-family:'Fraunces','Lora',Georgia,serif;}
.rl-perm-title{font-family:'Fraunces','Lora',Georgia,serif;font-size:34px;font-weight:700;color:var(--text,#f0e8d8);line-height:1.15;margin-bottom:12px;}
.rl-perm-body{font-size:15px;color:var(--muted,#7a6a50);line-height:1.8;margin-bottom:30px;}
.rl-btn-gold{padding:14px 30px;border-radius:99px;border:none;background:var(--gold,#c9a84c);color:#060402;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:.03em;transition:transform .15s,opacity .15s;}
.rl-btn-gold:active{transform:scale(.97);}
.rl-btn-gold:disabled{opacity:.45;cursor:not-allowed;}
.rl-denied{max-width:320px;padding:20px;text-align:center;margin:auto;}
.rl-hero{position:relative;height:58vw;min-height:270px;max-height:400px;overflow:hidden;}
.rl-hero-bg{position:absolute;inset:-8%;background-size:cover;background-position:center;filter:brightness(0.38) saturate(0.75);}
.rl-hero-grad{position:absolute;inset:0;background:linear-gradient(to bottom,transparent 25%,rgba(9,7,5,.92) 100%);}
.rl-hero-bot{position:absolute;bottom:0;left:0;right:0;padding:18px 20px 22px;}
.rl-sage-intro{font-family:'Lora',Georgia,serif;font-size:17px;font-style:italic;color:var(--text,#f0e8d8);line-height:1.65;margin-bottom:9px;}
.rl-hero-count{font-size:11px;color:rgba(186,170,142,.7);letter-spacing:.03em;}
.rl-sec{padding:22px 0 4px;}
.rl-sec-hdr{font-size:9.5px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:var(--muted,#7a6a50);padding:0 20px;margin-bottom:14px;}
.rl-featured{margin:0 20px 24px;border-radius:18px;overflow:hidden;cursor:pointer;box-shadow:0 24px 64px rgba(0,0,0,.6);position:relative;animation:rl-in .5s ease both;}
.rl-feat-bg{width:100%;aspect-ratio:16/10;display:block;background-size:cover;background-position:center;filter:brightness(0.52) saturate(0.8);transition:filter .35s;}
.rl-featured:active .rl-feat-bg{filter:brightness(0.65) saturate(0.9);}
.rl-feat-grad{position:absolute;inset:0;background:linear-gradient(to bottom,transparent 30%,rgba(6,4,2,.96) 100%);}
.rl-feat-tags{position:absolute;top:14px;right:14px;display:flex;flex-direction:column;align-items:flex-end;gap:5px;}
.rl-vtag{padding:3px 10px;border-radius:99px;font-size:8.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.18);color:rgba(240,232,216,.88);backdrop-filter:blur(8px);white-space:nowrap;}
.rl-vtag-gold{background:rgba(201,168,76,.18);border-color:rgba(201,168,76,.42);color:var(--gold,#c9a84c);}
.rl-feat-body{position:absolute;bottom:0;left:0;right:0;padding:18px 18px 20px;}
.rl-feat-name{font-family:'Fraunces','Lora',Georgia,serif;font-size:22px;font-weight:700;color:var(--text,#f0e8d8);line-height:1.2;margin-bottom:5px;}
.rl-feat-meta{font-size:12px;color:rgba(186,170,142,.8);margin-bottom:9px;display:flex;align-items:center;gap:10px;}
.rl-feat-note{font-size:13px;color:rgba(186,170,142,.82);font-style:italic;line-height:1.6;}
.rl-scroll-row{display:flex;gap:12px;overflow-x:auto;padding:0 20px 4px;scrollbar-width:none;}
.rl-scroll-row::-webkit-scrollbar{display:none;}
.rl-pcard{width:196px;min-width:196px;border-radius:14px;overflow:hidden;cursor:pointer;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);flex-shrink:0;transition:transform .2s,border-color .2s;animation:rl-in .5s ease both;}
.rl-pcard:active{transform:scale(.97);}
.rl-pcard-img{width:100%;aspect-ratio:1;display:block;background-size:cover;background-position:center;filter:brightness(0.65) saturate(0.8);}
.rl-pcard-body{padding:11px 12px 14px;}
.rl-pcard-name{font-family:'Lora',Georgia,serif;font-size:14px;font-weight:700;color:var(--text,#f0e8d8);line-height:1.3;margin-bottom:3px;}
.rl-pcard-dist{font-size:11px;color:var(--muted,#7a6a50);margin-bottom:8px;}
.rl-pcard-tags{display:flex;flex-wrap:wrap;gap:4px;}
.rl-ptag{padding:2px 7px;border-radius:99px;font-size:8.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.22);color:var(--gold,#c9a84c);}
.rl-ecard{margin:0 20px 10px;padding:15px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);display:flex;gap:13px;align-items:flex-start;cursor:pointer;transition:border-color .2s;animation:rl-in .5s ease both;}
.rl-ecard:hover{border-color:rgba(201,168,76,.3);}
.rl-edate{min-width:44px;text-align:center;padding:7px 5px;background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.22);border-radius:8px;flex-shrink:0;}
.rl-edate-mo{font-size:8.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--gold,#c9a84c);}
.rl-edate-day{font-family:'Fraunces',Georgia,serif;font-size:20px;font-weight:800;color:var(--text,#f0e8d8);line-height:1;}
.rl-etitle{font-size:14px;font-weight:700;color:var(--text,#f0e8d8);margin-bottom:3px;line-height:1.3;}
.rl-evenue{font-size:11px;color:var(--muted,#7a6a50);margin-bottom:5px;}
.rl-etype{font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--gold,#c9a84c);}
.rl-map-btn{display:flex;align-items:center;justify-content:center;gap:8px;margin:0 20px 28px;padding:14px;border-radius:14px;border:1px solid rgba(201,168,76,.28);background:rgba(201,168,76,.05);color:var(--gold,#c9a84c);font-size:13px;font-weight:700;cursor:pointer;transition:background .2s;letter-spacing:.02em;}
.rl-map-btn:hover{background:rgba(201,168,76,.1);}
#rl-map{width:100%;height:62vw;min-height:340px;max-height:500px;}
.rl-map-container{margin:0 0 24px;background:#090909;position:relative;overflow:hidden;}
.rl-map-close{position:absolute;top:12px;right:12px;z-index:500;padding:7px 14px;background:rgba(9,7,5,.8);border:1px solid rgba(255,255,255,.18);border-radius:8px;color:rgba(240,232,216,.85);font-size:11px;font-weight:600;cursor:pointer;backdrop-filter:blur(6px);}
.rl-sheet-wrap{position:fixed;inset:0;z-index:400;display:flex;flex-direction:column;justify-content:flex-end;}
.rl-sheet-scrim{position:absolute;inset:0;background:rgba(0,0,0,.62);backdrop-filter:blur(4px);}
.rl-sheet{position:relative;background:#111018;border-radius:20px 20px 0 0;max-height:88dvh;overflow-y:auto;padding-bottom:max(24px,env(safe-area-inset-bottom));animation:rl-up .3s cubic-bezier(.25,.46,.45,.94);}
.rl-sheet-handle{width:36px;height:4px;border-radius:2px;background:rgba(255,255,255,.14);margin:12px auto 0;}
.rl-sheet-img-wrap{width:100%;aspect-ratio:16/9;overflow:hidden;}
.rl-sheet-img{width:100%;height:100%;object-fit:cover;display:block;background-size:cover;background-position:center;filter:brightness(0.65) saturate(0.8);}
.rl-sheet-body{padding:18px 20px 24px;}
.rl-sheet-name{font-family:'Fraunces','Lora',Georgia,serif;font-size:24px;font-weight:700;color:var(--text,#f0e8d8);line-height:1.2;margin-bottom:5px;}
.rl-sheet-meta{font-size:12.5px;color:rgba(186,170,142,.8);margin-bottom:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
.rl-sheet-note{font-size:14px;color:rgba(186,170,142,.85);font-style:italic;line-height:1.7;margin-bottom:16px;padding:11px 14px;background:rgba(201,168,76,.06);border-left:2px solid rgba(201,168,76,.38);border-radius:0 8px 8px 0;}
.rl-sheet-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px;}
.rl-sheet-tag{padding:4px 11px;border-radius:99px;font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.25);color:var(--gold,#c9a84c);}
.rl-sheet-actions{display:flex;gap:8px;}
.rl-dir-btn{flex:1;padding:13px;border-radius:12px;border:none;background:var(--gold,#c9a84c);color:#060402;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;}
.rl-sage-btn{padding:13px 16px;border-radius:12px;border:1px solid rgba(201,168,76,.35);background:rgba(201,168,76,.08);color:var(--gold,#c9a84c);font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;}
.rl-skel{background:linear-gradient(90deg,rgba(255,255,255,.04) 25%,rgba(255,255,255,.08) 50%,rgba(255,255,255,.04) 75%);background-size:200% 100%;animation:rl-shim 1.8s infinite;border-radius:8px;}
.rl-rating{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--gold,#c9a84c);font-weight:700;}
.rl-dot{width:3px;height:3px;border-radius:50%;background:rgba(186,170,142,.4);}
@keyframes rl-shim{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes rl-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes rl-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
.rl-leaflet-fix .leaflet-pane,.rl-leaflet-fix .leaflet-top,.rl-leaflet-fix .leaflet-bottom{z-index:10}
`;

// ── MAP VIEW (Leaflet, CartoDB Dark Matter tiles) ─────────────────────────────
function MapView({ places, userLoc, onPlaceTap }) {
  const divRef   = useRef(null);
  const mapRef   = useRef(null);
  const [ready, setReady] = useState(false);
  const [err,   setErr]   = useState("");

  useEffect(() => {
    const init = () => {
      if (!divRef.current || mapRef.current) return;
      const L = window.L;
      const center = places.length > 0
        ? [places[0].lat, places[0].lng]
        : (userLoc ? [userLoc.lat, userLoc.lng] : [40.7128, -74.006]);

      const map = L.map(divRef.current, { center, zoom: 14, zoomControl: false });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap contributors © CARTO", maxZoom: 19,
      }).addTo(map);

      // Custom glowing gold marker
      const markerHtml = `<div style="width:14px;height:14px;border-radius:50%;background:#c9a84c;border:2px solid rgba(9,7,5,.85);box-shadow:0 0 14px rgba(201,168,76,.7),0 0 4px rgba(201,168,76,.5);"></div>`;
      const markerIcon = L.divIcon({ className:"", html:markerHtml, iconSize:[14,14], iconAnchor:[7,7] });

      // User location dot
      if (userLoc) {
        const userHtml = `<div style="width:10px;height:10px;border-radius:50%;background:#6ea8c8;border:2px solid rgba(9,7,5,.85);box-shadow:0 0 10px rgba(110,168,200,.6);"></div>`;
        L.marker([userLoc.lat, userLoc.lng], { icon: L.divIcon({ className:"", html:userHtml, iconSize:[10,10], iconAnchor:[5,5] }) }).addTo(map);
      }

      places.forEach(p => {
        L.marker([p.lat, p.lng], { icon: markerIcon }).addTo(map).on("click", () => onPlaceTap(p));
      });

      mapRef.current = map;
      setReady(true);
    };

    if (window.L) { init(); return; }

    // Load Leaflet from CDN
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    js.onload = init;
    js.onerror = () => setErr("Map failed to load. Check your connection.");
    document.head.appendChild(js);

    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  return (
    <div className="rl-map-container rl-leaflet-fix">
      <div ref={divRef} id="rl-map"/>
      {err && <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"#090909", color:"rgba(186,170,142,.6)", fontSize:13 }}>{err}</div>}
      {!ready && !err && <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"#090909", color:"rgba(186,170,142,.4)", fontSize:13 }}>Loading map…</div>}
    </div>
  );
}

// ── PLACE DETAIL SHEET ────────────────────────────────────────────────────────
function PlaceSheet({ place, onClose, onOpenChat }) {
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(place.name + " " + (place.address||""))}`;
  const sagePrompt = `I'm thinking about visiting ${place.name}. Tell me what kinds of books I should look for there based on what you know about how I read.`;

  return (
    <div className="rl-sheet-wrap">
      <div className="rl-sheet-scrim" onClick={onClose}/>
      <div className="rl-sheet">
        <div className="rl-sheet-handle"/>
        <div className="rl-sheet-img-wrap">
          <div className="rl-sheet-img" style={{ backgroundImage:`url(${place.photoUrl})` }}/>
        </div>
        <div className="rl-sheet-body">
          <div className="rl-sheet-name">{place.name}</div>
          <div className="rl-sheet-meta">
            <span>{fmtDist(place.distance||0)}</span>
            {place.rating && <>
              <span className="rl-dot"/>
              <span className="rl-rating">★ {place.rating.toFixed(1)}</span>
            </>}
            {place.openNow !== undefined && <>
              <span className="rl-dot"/>
              <span style={{ color: place.openNow ? "#6dbf6d" : "rgba(186,170,142,.5)" }}>
                {place.openNow ? "Open now" : "Closed"}
              </span>
            </>}
            {place.address && <>
              <span className="rl-dot"/>
              <span>{place.address}</span>
            </>}
          </div>
          {place.sageNote && <div className="rl-sheet-note">"{place.sageNote}"</div>}
          {place.vibeTags?.length > 0 && (
            <div className="rl-sheet-tags">
              {place.vibeTags.map(t => <span key={t} className="rl-sheet-tag">{t}</span>)}
            </div>
          )}
          <div className="rl-sheet-actions">
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="rl-dir-btn" style={{ textDecoration:"none" }}>
              Get Directions
            </a>
            {onOpenChat && (
              <button className="rl-sage-btn" onClick={() => { onClose(); onOpenChat(sagePrompt); }}>
                Ask Sage →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function ReadLocal({ readBooks=[], reactions={}, savedBooks=[], currentBook="", intelligence={}, isSignedIn, userId, onOpenChat }) {
  const [locState,  setLocState]  = useState("idle"); // idle | requesting | granted | denied | error
  const [location,  setLocation]  = useState(null);
  const [places,    setPlaces]    = useState([]);
  const [events,    setEvents]    = useState(DEMO_EVENTS);
  const [loading,   setLoading]   = useState(false);
  const [selected,  setSelected]  = useState(null);
  const [showMap,   setShowMap]   = useState(false);
  const [intro,     setIntro]     = useState("");
  const fetchedRef = useRef(false);

  // Derive top genres from reading history
  const topGenres = useMemo(() => {
    const counts = {};
    [...savedBooks, ...readBooks].forEach(b => {
      (b.tags||b.genres||[]).forEach(g => { counts[g]=(counts[g]||0)+1; });
    });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([g])=>g).slice(0,5);
  }, [savedBooks, readBooks]);

  const userContext = useMemo(() => ({
    topGenres, currentBook, archetype: intelligence?.archetype||""
  }), [topGenres, currentBook, intelligence]);

  const processPlaces = useCallback((raw, loc) => {
    const enriched = raw.map(p => ({
      ...p,
      distance: haversine(loc.lat, loc.lng, p.lat, p.lng),
      vibeTags: inferVibeTags(p),
    })).map(p => ({
      ...p,
      sageNote: buildSageNote(p, userContext),
      photoUrl: p.photoUrl || getAtmo(p.id||p.name),
    })).sort((a,b) => a.distance - b.distance);

    setPlaces(enriched);
    setIntro(buildSageLocalIntro(enriched, userContext));
  }, [userContext]);

  const fetchPlaces = useCallback(async (loc) => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/api/places?lat=${loc.lat}&lng=${loc.lng}&radius=5000`);
      if (!res.ok) throw new Error("API not configured");
      const data = await res.json();
      if (!data.places?.length) throw new Error("No places returned");
      processPlaces(data.places, loc);
    } catch {
      // Fall back to demo places so the UI is never empty
      processPlaces(makeDemoPlaces(loc), loc);
    }
    setLoading(false);
  }, [processPlaces]);

  const requestLocation = useCallback(() => {
    setLocState("requesting");
    navigator.geolocation.getCurrentPosition(
      pos => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(loc);
        setLocState("granted");
        fetchPlaces(loc);
        try { sessionStorage.setItem("rl_loc", JSON.stringify(loc)); } catch {}
      },
      () => setLocState("denied"),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 }
    );
  }, [fetchPlaces]);

  // Restore cached location on mount
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem("rl_loc");
      if (cached) {
        const loc = JSON.parse(cached);
        setLocation(loc);
        setLocState("granted");
        fetchPlaces(loc);
      }
    } catch {}
  }, [fetchPlaces]);

  const featuredPlace = places[0] || null;
  const otherPlaces   = places.slice(1);

  // ── PERMISSION SCREEN ──────────────────────────────────────────────────────
  if (locState === "idle" || locState === "requesting") {
    return (
      <div className="rl-root">
        <style>{RL_CSS}</style>
        <div className="rl-perm">
          <div className="rl-perm-bg" style={{ backgroundImage:`url(${ATMO[0]})` }}/>
          <div className="rl-perm-z">
            <div className="rl-eyebrow">
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
              Read Local
            </div>
            <div className="rl-perm-title rl-serif">Your reading neighborhood.</div>
            <div className="rl-perm-body">
              Independent bookstores, libraries, reading cafés, and literary events near you — curated by Sage based on how you read.
            </div>
            <button className="rl-btn-gold" onClick={requestLocation} disabled={locState === "requesting"}>
              {locState === "requesting" ? "Finding your location…" : "Find places near me"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── LOCATION DENIED ────────────────────────────────────────────────────────
  if (locState === "denied") {
    return (
      <div className="rl-root">
        <style>{RL_CSS}</style>
        <div className="rl-perm">
          <div className="rl-perm-bg" style={{ backgroundImage:`url(${ATMO[1]})` }}/>
          <div className="rl-perm-z">
            <div className="rl-eyebrow">Location needed</div>
            <div className="rl-perm-title rl-serif">Permission denied.</div>
            <div className="rl-perm-body">
              To find nearby bookstores and events, LitSense needs location access. Enable it in your browser settings and try again.
            </div>
            <button className="rl-btn-gold" onClick={requestLocation}>Try again</button>
          </div>
        </div>
      </div>
    );
  }

  // ── LOADING SKELETON ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rl-root">
        <style>{RL_CSS}</style>
        <div className="rl-hero">
          <div className="rl-hero-bg" style={{ backgroundImage:`url(${ATMO[3]})`, animation:"none" }}/>
          <div className="rl-hero-grad"/>
          <div className="rl-hero-bot">
            <div className="rl-eyebrow">Read Local</div>
            <div className="rl-skel" style={{ height:18, width:"82%", marginBottom:8 }}/>
            <div className="rl-skel" style={{ height:14, width:"55%", opacity:.6 }}/>
          </div>
        </div>
        <div className="rl-sec">
          <div className="rl-sec-hdr">Nearby</div>
          <div className="rl-skel" style={{ height:200, borderRadius:16, margin:"0 20px 20px" }}/>
        </div>
        <div className="rl-sec">
          <div className="rl-sec-hdr">More places</div>
          <div className="rl-scroll-row">
            {[0,1,2].map(i => (
              <div key={i} className="rl-skel" style={{ width:196, minWidth:196, height:260, borderRadius:14, flexShrink:0 }}/>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN EXPERIENCE ────────────────────────────────────────────────────────
  return (
    <div className="rl-root">
      <style>{RL_CSS}</style>

      {/* ── CINEMATIC HERO ── */}
      <div className="rl-hero">
        <div className="rl-hero-bg" style={{ backgroundImage:`url(${featuredPlace?.photoUrl||ATMO[0]})` }}/>
        <div className="rl-hero-grad"/>
        <div className="rl-hero-bot">
          <div className="rl-eyebrow">
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
            Read Local
          </div>
          {intro && <div className="rl-sage-intro">"{intro}"</div>}
          <div className="rl-hero-count">
            {places.length} {places.length === 1 ? "place" : "places"} nearby
          </div>
        </div>
      </div>

      {/* ── FEATURED PLACE ── */}
      {featuredPlace && (
        <div className="rl-sec">
          <div className="rl-sec-hdr">Featured nearby</div>
          <div className="rl-featured" onClick={() => setSelected(featuredPlace)}>
            <div className="rl-feat-bg" style={{ backgroundImage:`url(${featuredPlace.photoUrl})` }}/>
            <div className="rl-feat-grad"/>
            <div className="rl-feat-tags">
              {featuredPlace.vibeTags?.slice(0,3).map((t,i) => (
                <span key={t} className={`rl-vtag ${i===0?"rl-vtag-gold":""}`}>{t}</span>
              ))}
            </div>
            <div className="rl-feat-body">
              <div className="rl-feat-name">{featuredPlace.name}</div>
              <div className="rl-feat-meta">
                <span>{fmtDist(featuredPlace.distance||0)}</span>
                {featuredPlace.rating && <>
                  <span className="rl-dot"/>
                  <span className="rl-rating">★ {featuredPlace.rating.toFixed(1)}</span>
                </>}
                {featuredPlace.openNow !== undefined && <>
                  <span className="rl-dot"/>
                  <span style={{ color: featuredPlace.openNow ? "#6dbf6d" : "rgba(186,170,142,.5)" }}>
                    {featuredPlace.openNow ? "Open now" : "Closed"}
                  </span>
                </>}
              </div>
              {featuredPlace.sageNote && (
                <div className="rl-feat-note">"{featuredPlace.sageNote}"</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MORE PLACES ── */}
      {otherPlaces.length > 0 && (
        <div className="rl-sec">
          <div className="rl-sec-hdr">More nearby</div>
          <div className="rl-scroll-row">
            {otherPlaces.map((p, i) => (
              <div key={p.id} className="rl-pcard" style={{ animationDelay:`${i*0.07}s` }}
                onClick={() => setSelected(p)}>
                <div className="rl-pcard-img" style={{ backgroundImage:`url(${p.photoUrl})` }}/>
                <div className="rl-pcard-body">
                  <div className="rl-pcard-name">{p.name}</div>
                  <div className="rl-pcard-dist">
                    {fmtDist(p.distance||0)}
                    {p.rating && ` · ★ ${p.rating.toFixed(1)}`}
                    {p.openNow && " · Open"}
                  </div>
                  <div className="rl-pcard-tags">
                    {(p.vibeTags||[]).slice(0,3).map(t => (
                      <span key={t} className="rl-ptag">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── EVENTS ── */}
      {events.length > 0 && (
        <div className="rl-sec" style={{ paddingTop:28 }}>
          <div className="rl-sec-hdr">Upcoming events</div>
          {events.map((ev, i) => (
            <div key={ev.id} className="rl-ecard" style={{ animationDelay:`${i*0.08}s` }}>
              <div className="rl-edate">
                <div className="rl-edate-mo">{ev.month}</div>
                <div className="rl-edate-day">{ev.day}</div>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div className="rl-etitle">{ev.title}</div>
                <div className="rl-evenue">{ev.venue}</div>
                <div className="rl-etype">{ev.type}</div>
                {ev.desc && <div style={{ fontSize:12, color:"rgba(186,170,142,.65)", marginTop:5, lineHeight:1.55 }}>{ev.desc}</div>}
              </div>
            </div>
          ))}
          <div style={{ margin:"4px 20px 8px", fontSize:11, color:"rgba(186,170,142,.35)", fontStyle:"italic", lineHeight:1.6 }}>
            Events sourced from local bookstores. To list an event, contact hello@litsense.app.
          </div>
        </div>
      )}

      {/* ── MAP TOGGLE ── */}
      <div style={{ paddingTop:20 }}>
        <button className="rl-map-btn" onClick={() => setShowMap(v => !v)}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
          {showMap ? "Hide map" : "Show on map"}
        </button>

        {showMap && (
          <div style={{ position:"relative" }}>
            <MapView places={places} userLoc={location} onPlaceTap={setSelected}/>
            <button className="rl-map-close" onClick={() => setShowMap(false)}>Close map</button>
          </div>
        )}
      </div>

      {/* ── PLACE DETAIL SHEET ── */}
      {selected && (
        <PlaceSheet
          place={selected}
          onClose={() => setSelected(null)}
          onOpenChat={onOpenChat}
        />
      )}
    </div>
  );
}
