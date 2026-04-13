// api/label.js — Vercel serverless function
// Generates a USPS Media Mail postage label via EasyPost.
// Called after payment is confirmed and seller is ready to ship.
//
// POST /api/label
// Body: {
//   to_name, to_street1, to_city, to_state, to_zip, to_country,
//   from_name, from_street1, from_city, from_state, from_zip, from_country,
//   weight_oz,        // weight in ounces (books ~12-16oz)
//   transaction_id    // for our records
// }
// Returns: { label_url, tracking_number, tracking_url, postage_cents }

const EASYPOST_API_KEY = process.env.EASYPOST_API_KEY;
const EASYPOST_BASE    = "https://api.easypost.com/v2";

async function ep(path, body) {
  const res = await fetch(`${EASYPOST_BASE}${path}`, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${EASYPOST_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "EasyPost error");
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!EASYPOST_API_KEY) {
    return res.status(500).json({ error: "EasyPost API key not configured." });
  }

  const {
    to_name, to_street1, to_city, to_state, to_zip, to_country = "US",
    from_name, from_street1, from_city, from_state, from_zip, from_country = "US",
    weight_oz = 14,   // default ~14oz for a typical paperback
    transaction_id,
  } = req.body;

  if (!to_name || !to_street1 || !to_city || !to_state || !to_zip) {
    return res.status(400).json({ error: "Missing required address fields." });
  }
  if (!from_name || !from_street1 || !from_city || !from_state || !from_zip) {
    return res.status(400).json({ error: "Missing sender address fields." });
  }

  try {
    // 1. Create shipment
    const shipment = await ep("/shipments", {
      shipment: {
        to_address: {
          name:    to_name,
          street1: to_street1,
          city:    to_city,
          state:   to_state,
          zip:     to_zip,
          country: to_country,
        },
        from_address: {
          name:    from_name,
          street1: from_street1,
          city:    from_city,
          state:   from_state,
          zip:     from_zip,
          country: from_country,
        },
        parcel: {
          weight: weight_oz,   // EasyPost uses ounces
          predefined_package: "Parcel",
        },
        options: {
          label_format: "PDF",
        },
      },
    });

    // 2. Find cheapest Media Mail rate (best for books)
    const rates     = shipment.rates || [];
    const mediaMail = rates.find(r =>
      r.carrier === "USPS" && r.service === "MediaMail"
    );
    // Fallback to cheapest available rate
    const chosenRate = mediaMail || rates.sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate))[0];

    if (!chosenRate) {
      return res.status(400).json({ error: "No shipping rates available for this address." });
    }

    // 3. Buy the label
    const purchased = await ep(`/shipments/${shipment.id}/buy`, {
      rate: { id: chosenRate.id },
    });

    const postage_cents = Math.round(parseFloat(chosenRate.rate) * 100);

    return res.status(200).json({
      label_url:       purchased.postage_label?.label_url,
      tracking_number: purchased.tracking_code,
      tracking_url:    `https://tools.usps.com/go/TrackConfirmAction?tLabels=${purchased.tracking_code}`,
      carrier:         chosenRate.carrier,
      service:         chosenRate.service,
      postage_cents,
      shipment_id:     purchased.id,
    });

  } catch (err) {
    console.error("EasyPost error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
