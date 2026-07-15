const { isSessionValid } = require("./_auth");
const { getFile, putFile, ensureBranch } = require("./_github");
const { isValidSitePayload } = require("./_site-payload");

const DRAFT_BRANCH = process.env.DRAFT_BRANCH || "drafts";
const FILE_PATH = "content/site.draft.json";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!isSessionValid(req)) {
    return res.status(401).json({ ok: false, error: "Kirjaudu sisään." });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(200).json({ ok: true, skipped: true });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
      return res.status(400).json({ ok: false, error: "Virheellinen pyyntö." });
    }
  }

  const site = body && body.site;
  if (!isValidSitePayload(site)) {
    return res.status(400).json({ ok: false, error: "Sisältö vaikutti puutteelliselta." });
  }

  const nextContent = `${JSON.stringify(site, null, 2)}\n`;
  const nextContentBase64 = Buffer.from(nextContent, "utf-8").toString("base64");

  try {
    await ensureBranch(DRAFT_BRANCH, token);
    const currentFile = await getFile(FILE_PATH, DRAFT_BRANCH, token);

    if (currentFile && Buffer.from(currentFile.content, "base64").toString("utf-8") === nextContent) {
      return res.status(200).json({ ok: true, unchanged: true });
    }

    await putFile(FILE_PATH, DRAFT_BRANCH, token, {
      content: nextContentBase64,
      message: "Automaattinen luonnostallennus",
      sha: currentFile ? currentFile.sha : undefined,
    });

    return res.status(200).json({ ok: true, savedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Draft save error", error);
    return res.status(502).json({ ok: false, error: "Luonnoksen tallennus epäonnistui." });
  }
};
