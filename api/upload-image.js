const { isSessionValid } = require("./_auth");
const { putFile } = require("./_github");

const BRANCH = process.env.GITHUB_BRANCH || "main";
const MAX_BYTES = 8 * 1024 * 1024;

const EXTENSION_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl || "");
  if (!match) {
    return null;
  }
  const [, mime, base64] = match;
  return { mime, base64 };
}

function randomSlug() {
  return Math.random().toString(36).slice(2, 8);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!isSessionValid(req)) {
    return res.status(401).json({ ok: false, error: "Kirjaudu sisään ennen kuvan lataamista." });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ ok: false, error: "Kuvan lataus ei ole käytössä (GITHUB_TOKEN puuttuu)." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
      return res.status(400).json({ ok: false, error: "Virheellinen pyyntö." });
    }
  }

  const parsed = parseDataUrl(body && body.dataUrl);
  if (!parsed || !EXTENSION_BY_MIME[parsed.mime]) {
    return res.status(400).json({ ok: false, error: "Tuntematon tai tukematon kuvamuoto." });
  }

  if (Buffer.byteLength(parsed.base64, "base64") > MAX_BYTES) {
    return res.status(400).json({ ok: false, error: "Kuva on liian suuri julkaistavaksi." });
  }

  const extension = EXTENSION_BY_MIME[parsed.mime];
  const path = `assets/uploads/${Date.now()}-${randomSlug()}.${extension}`;

  try {
    await putFile(path, BRANCH, token, {
      content: parsed.base64,
      message: "Lisää kuva muokkaustilasta",
    });
    return res.status(200).json({ ok: true, path });
  } catch (error) {
    console.error("Image upload error", error);
    return res.status(502).json({ ok: false, error: "Kuvan tallennus GitHubiin epäonnistui." });
  }
};
