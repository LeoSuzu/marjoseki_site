const crypto = require("crypto");

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const MAX_FIELD_LENGTH = 2000;
const RESEND_TIMEOUT_MS = 10000;
const rateLimitHits = new Map();

// The published payment/delivery instructions live in the content file Marjo
// edits, so the order confirmation quotes whatever is currently on the site
// instead of a copy that silently drifts. Guarded: a missing or malformed
// content file must never take the form down.
let siteContent = null;
try {
  siteContent = require("../content/site.json");
} catch (error) {
  console.warn("site.json not available to submit-form; using fallback copy.");
}

function isRateLimited(ip) {
  const now = Date.now();
  const hits = (rateLimitHits.get(ip) || []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );
  hits.push(now);
  rateLimitHits.set(ip, hits);
  return hits.length > RATE_LIMIT_MAX_REQUESTS;
}

const escapeHtml = (value) =>
  String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());

// Deliberately simple: the goal is a sane, on-brand HTML mail, not a layout
// engine. Rows render as a label/value list that degrades gracefully.
const renderEmailShell = ({ heading, intro, rows, footer }) => {
  const rowsHtml = rows
    .filter(([, value]) => String(value || "").trim())
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e2ece0;vertical-align:top;width:38%;color:#45663f;font-weight:700;">${escapeHtml(label)}</td>
          <td style="padding:10px 0;border-bottom:1px solid #e2ece0;vertical-align:top;color:#383d2d;">${escapeHtml(value).replace(/\n/g, "<br />")}</td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="fi">
  <body style="margin:0;padding:24px;background:#e7f7e0;font-family:'Helvetica Neue',Arial,sans-serif;color:#383d2d;line-height:1.6;">
    <div style="max-width:560px;margin:0 auto;background:#fdfbf5;border-radius:20px;padding:28px;border:1px solid #d7eeca;">
      <h1 style="margin:0 0 4px;font-size:22px;color:#383d2d;">${escapeHtml(heading)}</h1>
      ${intro ? `<p style="margin:0 0 20px;color:#756a55;">${escapeHtml(intro).replace(/\n/g, "<br />")}</p>` : ""}
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:15px;">
        ${rowsHtml}
      </table>
      ${footer ? `<p style="margin:22px 0 0;padding-top:16px;border-top:1px solid #e2ece0;color:#756a55;font-size:14px;">${escapeHtml(footer).replace(/\n/g, "<br />")}</p>` : ""}
      <p style="margin:20px 0 0;color:#8a8271;font-size:12px;">marjoseki.fi</p>
    </div>
  </body>
</html>`;
};

const renderTextBody = (rows, footer) =>
  rows
    .filter(([, value]) => String(value || "").trim())
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n") + (footer ? `\n\n${footer}` : "");

const FORM_DEFINITIONS = {
  "book-order": {
    subject: (fields) => `Kirjatilaus: ${fields.bookTitle || "kirja"}`,
    requiredFields: ["name", "address", "postalCode", "phone", "bookTitle"],
    rows: (fields) => [
      ["Kirja", fields.bookTitle],
      ["Nimi", fields.name],
      ["Osoite", fields.address],
      ["Postinumero ja postitoimipaikka", fields.postalCode],
      ["Puhelin", fields.phone],
      ["Sähköposti", fields.email || "-"],
      ["Omistuskirjoitus / muut toiveet", fields.notes || "-"],
    ],
    confirmation: (fields) => ({
      subject: `Kiitos tilauksestasi — ${fields.bookTitle || "kirja"}`,
      heading: "Kiitos tilauksestasi!",
      intro: `Hei ${fields.name}, sain tilauksesi ja palaan asiaan pian. Alla vielä tilauksen tiedot.`,
      rows: [
        ["Kirja", fields.bookTitle],
        ["Nimi", fields.name],
        ["Osoite", fields.address],
        ["Postinumero ja postitoimipaikka", fields.postalCode],
        ["Puhelin", fields.phone],
        ["Omistuskirjoitus / muut toiveet", fields.notes || "-"],
      ],
      footer:
        siteContent?.kirjat?.order?.instructions ||
        "Maksuohjeet ja postituskulut vahvistetaan sinulle erikseen.",
    }),
  },
  "event-inquiry": {
    subject: (fields) => `Tilaisuuskysely: ${fields.name || "uusi kysely"}`,
    requiredFields: ["name", "email", "eventType", "eventLocation", "guestCount"],
    rows: (fields) => [
      ["Nimi", fields.name],
      ["Puhelin", fields.phone || "-"],
      ["Sähköposti", fields.email],
      ["Minkälainen tilaisuus", fields.eventType],
      ["Missä tilaisuus pidetään", fields.eventLocation],
      ["Henkilömäärä", fields.guestCount],
      ["Muuta", fields.notes || "-"],
    ],
    confirmation: (fields) => ({
      subject: "Kiitos yhteydenotostasi",
      heading: "Kiitos yhteydenotostasi!",
      intro: `Hei ${fields.name}, sain kyselysi ja vastaan sinulle mahdollisimman pian. Alla vielä lähettämäsi tiedot.`,
      rows: [
        ["Minkälainen tilaisuus", fields.eventType],
        ["Missä tilaisuus pidetään", fields.eventLocation],
        ["Henkilömäärä", fields.guestCount],
        ["Muuta", fields.notes || "-"],
      ],
      footer: "Jos tiedoissa on korjattavaa, vastaa suoraan tähän viestiin.",
    }),
  },
};

const sendEmail = async (apiKey, payload, idempotencyKey) => {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  // Guards against duplicate mail when a visitor double-submits or the
  // platform retries the function: same key + same payload is a no-op.
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey.slice(0, 256);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend ${response.status}: ${detail}`);
  }

  return response.json().catch(() => ({}));
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
  if (isRateLimited(ip)) {
    return res
      .status(429)
      .json({ ok: false, error: "Liian monta yritystä. Yritä hetken kuluttua uudelleen." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
      return res.status(400).json({ ok: false, error: "Invalid request body." });
    }
  }

  const { formType, fields: rawFields, website } = body || {};

  // Honeypot: real visitors never fill this hidden field.
  if (website) {
    return res.status(200).json({ ok: true });
  }

  const definition = FORM_DEFINITIONS[formType];
  if (!definition) {
    return res.status(400).json({ ok: false, error: "Unknown form type." });
  }

  // Normalise once: coerce to string, trim, and cap length so an oversized
  // paste can't be forwarded verbatim into an email.
  const fields = {};
  Object.entries(rawFields || {}).forEach(([key, value]) => {
    fields[key] = String(value == null ? "" : value)
      .trim()
      .slice(0, MAX_FIELD_LENGTH);
  });

  const missing = definition.requiredFields.filter((name) => !fields[name]);
  if (missing.length > 0) {
    return res.status(400).json({ ok: false, error: `Puuttuvat kentät: ${missing.join(", ")}` });
  }

  if (fields.email && !isValidEmail(fields.email)) {
    return res.status(400).json({ ok: false, error: "Tarkista sähköpostiosoite." });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_EMAIL;
  const fromEmail = process.env.FROM_EMAIL;
  const fromName = process.env.FROM_NAME || "Marjo Seki";

  if (!apiKey || !toEmail || !fromEmail) {
    return res.status(500).json({
      ok: false,
      error: "Lomakkeen lähetys ei ole vielä käytössä. Ota yhteyttä sähköpostilla.",
    });
  }

  // Mail goes out under Marjo's own verified domain with her name on it,
  // rather than a bare no-reply address.
  const from = fromEmail.includes("<") ? fromEmail : `${fromName} <${fromEmail}>`;
  const rows = definition.rows(fields);
  // Same submission retried => same key => Resend returns the original send
  // rather than mailing Marjo twice.
  const submissionId = crypto
    .createHash("sha256")
    .update(`${formType}:${JSON.stringify(fields)}`)
    .digest("hex")
    .slice(0, 32);

  try {
    await sendEmail(
      apiKey,
      {
        from,
        to: toEmail,
        reply_to: fields.email || undefined,
        subject: definition.subject(fields),
        text: renderTextBody(rows),
        html: renderEmailShell({
          heading: definition.subject(fields),
          intro: "Uusi viesti marjoseki.fi-sivustolta.",
          rows,
        }),
      },
      `${formType}/${submissionId}`,
    );
  } catch (error) {
    console.error("Resend notification failed", error);
    return res
      .status(502)
      .json({ ok: false, error: "Lomakkeen lähetys epäonnistui. Yritä myöhemmin uudelleen." });
  }

  // Best-effort acknowledgement to the sender, from Marjo's own domain. The
  // submission has already reached her at this point, so a failure here is
  // logged but must not turn a successful order into an error for the visitor.
  if (fields.email && definition.confirmation) {
    const confirmation = definition.confirmation(fields);
    try {
      await sendEmail(
        apiKey,
        {
          from,
          to: fields.email,
          reply_to: toEmail,
          subject: confirmation.subject,
          text: renderTextBody(confirmation.rows, confirmation.footer),
          html: renderEmailShell({
            heading: confirmation.heading,
            intro: confirmation.intro,
            rows: confirmation.rows,
            footer: confirmation.footer,
          }),
        },
        `${formType}-confirmation/${submissionId}`,
      );
    } catch (error) {
      console.error("Resend confirmation failed", error);
    }
  }

  return res.status(200).json({ ok: true });
};
