const { isSessionValid } = require("./_auth");
const { getFile, putFile } = require("./_github");
const { isValidSitePayload } = require("./_site-payload");
const { cleanupOrphanedUploads } = require("./_uploads-cleanup");

const BRANCH = process.env.GITHUB_BRANCH || "main";
const FILE_PATH = "content/site.json";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!isSessionValid(req)) {
    return res.status(401).json({ ok: false, error: "Kirjaudu sisään ennen julkaisua." });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({ ok: false, error: "Julkaisu ei ole käytössä (GITHUB_TOKEN puuttuu)." });
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
    return res.status(400).json({ ok: false, error: "Sisältö vaikutti puutteelliselta, julkaisua ei tehty." });
  }

  const nextContent = `${JSON.stringify(site, null, 2)}\n`;
  const nextContentBase64 = Buffer.from(nextContent, "utf-8").toString("base64");

  try {
    const currentFile = await getFile(FILE_PATH, BRANCH, token);

    if (currentFile && Buffer.from(currentFile.content, "base64").toString("utf-8") === nextContent) {
      return res.status(200).json({ ok: true, unchanged: true });
    }

    await putFile(FILE_PATH, BRANCH, token, {
      content: nextContentBase64,
      message: "Sisällön päivitys muokkaustilasta",
      sha: currentFile ? currentFile.sha : undefined,
    });

    await cleanupOrphanedUploads(site, BRANCH, token);

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Publish error", error);
    return res.status(502).json({ ok: false, error: "Tallennus GitHubiin epäonnistui." });
  }
};
