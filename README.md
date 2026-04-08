# LitSense — AI Book Advisor

Books worth your time.

## Deploy to Vercel

1. Push this repo to GitHub
2. Import into Vercel at vercel.com
3. Add environment variable: `ANTHROPIC_API_KEY`
4. Connect domain `litsense.app` in Vercel → Domains
5. Add the DNS records Vercel provides into Cloudflare

## Before going live

In `src/App.jsx`, the sendChat() function must call `/api/ai` not the Anthropic API directly.
Find this line and update it:

```
// Change this:
const res = await fetch("https://api.anthropic.com/v1/messages", {

// To this:
const res = await fetch("/api/ai", {
```

Then remove the `"Content-Type": "application/json"` header line — the proxy handles it.

## Local development

```bash
npm install
npm run dev
```

Create a `.env.local` file with your `ANTHROPIC_API_KEY`.

## Logo files

Place these in the `/public` folder:
- `litsense-logo.png` — wordmark for the app header
- `litsense-icon.png` — icon mark for favicon and App Store
