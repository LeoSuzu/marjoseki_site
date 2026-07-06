const { isSessionValid } = require("./_auth");

const OWNER_REPO = process.env.GITHUB_REPO || "LeoSuzu/marjoseki_site";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const FILE_PATH = "content/site.json";

// Very light shape check: catches corrupt payloads without hardcoding the
// full schema here (that lives in content/site.json / admin/config.yml).
const REQUIRED_TOP_LEVEL_KEYS = ["global", "home", "palvelut", "kirjat", "yhteystiedot", "tapahtumia"];

function isValidSitePayload(site) {
  if (!site || typeof site !== "object" || Array.isArray(site)) {
    return false;
  }
  return REQUIRED_TOP_LEVEL_KEYS.every((key) => Object.prototype.hasOwnProperty.call(site, key));
}

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

  const apiBase = `https://api.github.com/repos/${OWNER_REPO}/contents/${FILE_PATH}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "User-Agent": "marjoseki-site-publisher",
    Accept: "application/vnd.github+json",
  };

  try {
    const currentFileResponse = await fetch(`${apiBase}?ref=${encodeURIComponent(BRANCH)}`, { headers });
    if (!currentFileResponse.ok) {
      const detail = await currentFileResponse.text();
      console.error("GitHub read error", currentFileResponse.status, detail);
      return res.status(502).json({ ok: false, error: "Nykyisen sisällön haku GitHubista epäonnistui." });
    }
    const currentFile = await currentFileResponse.json();

    const nextContent = `${JSON.stringify(site, null, 2)}\n`;
    const nextContentBase64 = Buffer.from(nextContent, "utf-8").toString("base64");

    if (currentFile.content && Buffer.from(currentFile.content, "base64").toString("utf-8") === nextContent) {
      return res.status(200).json({ ok: true, unchanged: true });
    }

    const updateResponse = await fetch(apiBase, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Sisällön päivitys muokkaustilasta",
        content: nextContentBase64,
        sha: currentFile.sha,
        branch: BRANCH,
      }),
    });

    if (!updateResponse.ok) {
      const detail = await updateResponse.text();
      console.error("GitHub write error", updateResponse.status, detail);
      return res.status(502).json({ ok: false, error: "Tallennus GitHubiin epäonnistui." });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Publish error", error);
    return res.status(500).json({ ok: false, error: "Julkaisu epäonnistui odottamattoman virheen vuoksi." });
  }
};
