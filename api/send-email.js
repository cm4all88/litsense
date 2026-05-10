// api/send-email.js
// Sends transactional emails via Resend.
// POST /api/send-email
// Body: { type, to, data }
//
// Types:
//   welcome          → { name }
//   trial_ending     → { name, daysLeft, manageUrl }
//   drop_announced   → { name, dropTitle, dropTeaser, revealDate }
//   payment_failed   → { name }
//
// Setup: resend.com → add domain litsense.app → verify DNS → copy API key
// Add RESEND_API_KEY to Vercel env vars.

const FROM = "LitSense <hello@litsense.app>";
const REPLY_TO = "hello@litsense.app";

function welcomeHtml(name) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0f0c07;font-family:Georgia,serif;color:#f0e8d8;">
<div style="max-width:560px;margin:0 auto;padding:48px 32px;">
  <div style="font-family:'Georgia',serif;font-size:13px;letter-spacing:0.25em;color:#c9a84c;margin-bottom:32px;">LITSENSE</div>
  <h1 style="font-size:28px;font-weight:400;font-style:italic;color:#f0e8d8;margin:0 0 16px;line-height:1.3;">Your reading companion<br/>is ready.</h1>
  <p style="font-size:16px;color:#b8a88a;line-height:1.75;margin:0 0 24px;">Hi${name ? ` ${name}` : ''}, welcome to LitSense. Tell Sage what you've read, what you loved, what you abandoned. The more you share, the more personal your recommendations become.</p>
  <a href="https://litsense.app" style="display:inline-block;padding:13px 28px;background:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.35);color:#c9a84c;text-decoration:none;font-family:Georgia,serif;font-size:13px;letter-spacing:0.15em;border-radius:8px;">Open LitSense →</a>
  <div style="margin-top:48px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.07);font-size:12px;color:#6e5f47;line-height:1.6;">
    You're receiving this because you created a LitSense account.<br/>
    <a href="https://litsense.app/privacy.html" style="color:#6e5f47;">Privacy Policy</a> · <a href="https://litsense.app/terms.html" style="color:#6e5f47;">Terms</a>
  </div>
</div>
</body></html>`;
}

function trialEndingHtml(name, daysLeft, manageUrl) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0f0c07;font-family:Georgia,serif;color:#f0e8d8;">
<div style="max-width:560px;margin:0 auto;padding:48px 32px;">
  <div style="font-family:'Georgia',serif;font-size:13px;letter-spacing:0.25em;color:#c9a84c;margin-bottom:32px;">LITSENSE</div>
  <h1 style="font-size:28px;font-weight:400;font-style:italic;color:#f0e8d8;margin:0 0 16px;line-height:1.3;">Your trial ends<br/>in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.</h1>
  <p style="font-size:16px;color:#b8a88a;line-height:1.75;margin:0 0 24px;">Hi${name ? ` ${name}` : ''}, your LitSense free trial is almost up. To keep your unlimited recommendations, full shelves, and monthly drops, your subscription will continue automatically.</p>
  <p style="font-size:16px;color:#b8a88a;line-height:1.75;margin:0 0 28px;">If you'd like to cancel before you're charged, you can do that anytime from your account settings.</p>
  <a href="${manageUrl || 'https://litsense.app'}" style="display:inline-block;padding:13px 28px;background:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.35);color:#c9a84c;text-decoration:none;font-family:Georgia,serif;font-size:13px;letter-spacing:0.15em;border-radius:8px;">Manage subscription →</a>
  <div style="margin-top:48px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.07);font-size:12px;color:#6e5f47;line-height:1.6;">
    <a href="https://litsense.app/privacy.html" style="color:#6e5f47;">Privacy Policy</a> · <a href="https://litsense.app/terms.html" style="color:#6e5f47;">Terms</a>
  </div>
</div>
</body></html>`;
}

function dropAnnouncedHtml(name, dropTitle, dropTeaser, revealDate) {
  const reveal = revealDate ? new Date(revealDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : 'soon';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0f0c07;font-family:Georgia,serif;color:#f0e8d8;">
<div style="max-width:560px;margin:0 auto;padding:48px 32px;">
  <div style="font-family:'Georgia',serif;font-size:13px;letter-spacing:0.25em;color:#c9a84c;margin-bottom:32px;">LITSENSE CLUB</div>
  <div style="font-size:11px;letter-spacing:0.2em;color:#6e5f47;margin-bottom:12px;">THIS MONTH'S DROP</div>
  <h1 style="font-size:28px;font-weight:400;font-style:italic;color:#f0e8d8;margin:0 0 16px;line-height:1.3;">${dropTitle || 'Something new<br/>has arrived.'}</h1>
  <p style="font-size:16px;color:#b8a88a;line-height:1.75;margin:0 0 8px;">${dropTeaser || 'Your monthly Club drop is ready.'}</p>
  <p style="font-size:14px;color:#6e5f47;margin:0 0 28px;">Reveals ${reveal}.</p>
  <a href="https://litsense.app" style="display:inline-block;padding:13px 28px;background:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.35);color:#c9a84c;text-decoration:none;font-family:Georgia,serif;font-size:13px;letter-spacing:0.15em;border-radius:8px;">See your drop →</a>
  <div style="margin-top:48px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.07);font-size:12px;color:#6e5f47;line-height:1.6;">
    You're receiving this as a LitSense Club member.<br/>
    <a href="https://litsense.app/privacy.html" style="color:#6e5f47;">Privacy Policy</a> · <a href="https://litsense.app/terms.html" style="color:#6e5f47;">Terms</a>
  </div>
</div>
</body></html>`;
}

function paymentFailedHtml(name) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0f0c07;font-family:Georgia,serif;color:#f0e8d8;">
<div style="max-width:560px;margin:0 auto;padding:48px 32px;">
  <div style="font-family:'Georgia',serif;font-size:13px;letter-spacing:0.25em;color:#c9a84c;margin-bottom:32px;">LITSENSE</div>
  <h1 style="font-size:28px;font-weight:400;font-style:italic;color:#f0e8d8;margin:0 0 16px;line-height:1.3;">We couldn't process<br/>your payment.</h1>
  <p style="font-size:16px;color:#b8a88a;line-height:1.75;margin:0 0 24px;">Hi${name ? ` ${name}` : ''}, your latest LitSense payment didn't go through. Update your payment method to keep your subscription active.</p>
  <a href="https://litsense.app" style="display:inline-block;padding:13px 28px;background:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.35);color:#c9a84c;text-decoration:none;font-family:Georgia,serif;font-size:13px;letter-spacing:0.15em;border-radius:8px;">Update payment method →</a>
  <div style="margin-top:48px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.07);font-size:12px;color:#6e5f47;">
    <a href="https://litsense.app/privacy.html" style="color:#6e5f47;">Privacy Policy</a> · <a href="https://litsense.app/terms.html" style="color:#6e5f47;">Terms</a>
  </div>
</div>
</body></html>`;
}

function marketplaceSoldHtml(title, author, price) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0f0c07;font-family:Georgia,serif;color:#f0e8d8;">
<div style="max-width:560px;margin:0 auto;padding:48px 32px;">
  <div style="font-family:'Georgia',serif;font-size:13px;letter-spacing:0.25em;color:#c9a84c;margin-bottom:32px;">LITSENSE MARKETPLACE</div>
  <h1 style="font-size:28px;font-weight:400;font-style:italic;color:#f0e8d8;margin:0 0 16px;line-height:1.3;">Your book sold!</h1>
  <p style="font-size:16px;color:#b8a88a;line-height:1.75;margin:0 0 8px;"><strong style="color:#f0e8d8;">${title}${author ? ` by ${author}` : ""}</strong> sold for $${Number(price).toFixed(2)}.</p>
  <p style="font-size:16px;color:#b8a88a;line-height:1.75;margin:0 0 24px;">Payment is held in escrow. We'll email you a prepaid USPS Media Mail shipping label within 24 hours. Ship the book within 3 days of receiving the label.</p>
  <div style="padding:16px 20px;background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:10px;margin-bottom:28px;">
    <div style="font-size:13px;color:#c9a84c;font-weight:700;margin-bottom:8px;">What happens next</div>
    <ol style="margin:0;padding-left:18px;font-size:14px;color:#b8a88a;line-height:2;">
      <li>We'll send your prepaid shipping label</li>
      <li>Pack the book carefully and drop it off at any USPS location</li>
      <li>Buyer confirms delivery</li>
      <li>Funds are released to you (minus 10% platform fee)</li>
    </ol>
  </div>
  <p style="font-size:14px;color:#6e5f47;line-height:1.6;">Questions? Reply to this email or contact <a href="mailto:hello@litsense.app" style="color:#c9a84c;">hello@litsense.app</a>.</p>
  <div style="margin-top:48px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.07);font-size:12px;color:#6e5f47;line-height:1.6;">
    <a href="https://litsense.app/privacy.html" style="color:#6e5f47;">Privacy Policy</a> · <a href="https://litsense.app/terms.html" style="color:#6e5f47;">Terms</a>
  </div>
</div>
</body></html>`;
}

function getEmailContent(type, data = {}) {
  switch (type) {
    case 'welcome':
      return {
        subject: 'Welcome to LitSense',
        html: welcomeHtml(data.name),
      };
    case 'trial_ending':
      return {
        subject: `Your LitSense trial ends in ${data.daysLeft || 1} day${data.daysLeft === 1 ? '' : 's'}`,
        html: trialEndingHtml(data.name, data.daysLeft, data.manageUrl),
      };
    case 'drop_announced':
      return {
        subject: `Your ${new Date().toLocaleString('en-US', { month: 'long' })} drop is here`,
        html: dropAnnouncedHtml(data.name, data.dropTitle, data.dropTeaser, data.revealDate),
      };
    case 'payment_failed':
      return {
        subject: 'Action needed — LitSense payment failed',
        html: paymentFailedHtml(data.name),
      };
    case 'marketplace_sold':
      return {
        subject: `Your book sold on LitSense — ${data.title || ""}`,
        html: marketplaceSoldHtml(data.title, data.author, data.price),
      };
    default:
      return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "RESEND_API_KEY not configured" });

  const { type, to, data = {} } = req.body || {};
  if (!type || !to) return res.status(400).json({ error: "type and to are required" });

  const content = getEmailContent(type, data);
  if (!content) return res.status(400).json({ error: `Unknown email type: ${type}` });

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: FROM,
        reply_to: REPLY_TO,
        to: [to],
        subject: content.subject,
        html: content.html,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error("Resend error:", result);
      return res.status(response.status).json({ error: result.message || "Failed to send email" });
    }

    return res.status(200).json({ success: true, id: result.id });
  } catch (err) {
    console.error("send-email error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
