const { isSessionValid } = require("./_auth");
const { getFile } = require("./_github");

const DRAFT_BRANCH = process.env.DRAFT_BRANCH || "drafts";
const FILE_PATH = "content/site.draft.json";

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!isSessionValid(req)) {
    return res.status(401).json({ ok: false, error: "Kirjaudu sisään." });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ ok: false, error: "Luonnoshaku ei ole käytössä (GITHUB_TOKEN puuttuu)." });
  }

  try {
    const file = await getFile(FILE_PATH, DRAFT_BRANCH, token);
    if (!file) {
      return res.status(404).json({ ok: false, error: "Palvelimelle ei ole tallennettu luonnosta." });
    }
    const site = JSON.parse(Buffer.from(file.content, "base64").toString("utf-8"));
    return res.status(200).json({ ok: true, site });
  } catch (error) {
    console.error("Draft fetch error", error);
    return res.status(502).json({ ok: false, error: "Luonnoksen haku epäonnistui." });
  }
};
