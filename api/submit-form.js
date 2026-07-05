const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const rateLimitHits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const hits = (rateLimitHits.get(ip) || []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );
  hits.push(now);
  rateLimitHits.set(ip, hits);
  return hits.length > RATE_LIMIT_MAX_REQUESTS;
}

const FORM_DEFINITIONS = {
  "book-order": {
    subject: (fields) => `Kirjatilaus: ${fields.bookTitle || "kirja"}`,
    requiredFields: ["name", "address", "postalCode", "phone", "bookTitle"],
    renderBody: (fields) =>
      [
        `Kirja: ${fields.bookTitle}`,
        `Nimi: ${fields.name}`,
        `Osoite: ${fields.address}`,
        `Postinumero ja postitoimipaikka: ${fields.postalCode}`,
        `Puhelin: ${fields.phone}`,
        `Omistuskirjoitus / muut toiveet: ${fields.notes || "-"}`,
      ].join("\n"),
  },
  "event-inquiry": {
    subject: (fields) => `Tilaisuuskysely: ${fields.name || "uusi kysely"}`,
    requiredFields: ["name", "email", "eventType", "eventLocation", "guestCount"],
    renderBody: (fields) =>
      [
        `Nimi: ${fields.name}`,
        `Puhelin: ${fields.phone || "-"}`,
        `Sähköposti: ${fields.email}`,
        `Minkälainen tilaisuus: ${fields.eventType}`,
        `Missä tilaisuus pidetään: ${fields.eventLocation}`,
        `Henkilömäärä: ${fields.guestCount}`,
        `Muuta: ${fields.notes || "-"}`,
      ].join("\n"),
  },
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

  const { formType, fields, website } = body || {};

  // Honeypot: real visitors never fill this hidden field.
  if (website) {
    return res.status(200).json({ ok: true });
  }

  const definition = FORM_DEFINITIONS[formType];
  if (!definition) {
    return res.status(400).json({ ok: false, error: "Unknown form type." });
  }

  const missing = definition.requiredFields.filter(
    (name) => !fields || !String(fields[name] || "").trim(),
  );
  if (missing.length > 0) {
    return res.status(400).json({ ok: false, error: `Puuttuvat kentät: ${missing.join(", ")}` });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_EMAIL;
  const fromEmail = process.env.FROM_EMAIL;

  if (!apiKey || !toEmail || !fromEmail) {
    return res.status(500).json({
      ok: false,
      error: "Lomakkeen lähetys ei ole vielä käytössä. Ota yhteyttä sähköpostilla.",
    });
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: toEmail,
        reply_to: fields.email || undefined,
        subject: definition.subject(fields),
        text: definition.renderBody(fields),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Resend error", detail);
      return res
        .status(502)
        .json({ ok: false, error: "Lomakkeen lähetys epäonnistui. Yritä myöhemmin uudelleen." });
    }
  } catch (error) {
    console.error(error);
    return res
      .status(502)
      .json({ ok: false, error: "Lomakkeen lähetys epäonnistui. Yritä myöhemmin uudelleen." });
  }

  return res.status(200).json({ ok: true });
};
