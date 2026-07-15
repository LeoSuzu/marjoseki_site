const OWNER_REPO = process.env.GITHUB_REPO || "LeoSuzu/marjoseki_site";

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "User-Agent": "marjoseki-site-publisher",
    Accept: "application/vnd.github+json",
  };
}

async function getFile(path, branch, token) {
  const response = await fetch(
    `https://api.github.com/repos/${OWNER_REPO}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    { headers: githubHeaders(token) },
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub read error (${response.status}): ${detail}`);
  }
  return response.json();
}

async function putFile(path, branch, token, { content, message, sha }) {
  const response = await fetch(`https://api.github.com/repos/${OWNER_REPO}/contents/${path}`, {
    method: "PUT",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ message, content, branch, ...(sha ? { sha } : {}) }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub write error (${response.status}): ${detail}`);
  }
  return response.json();
}

async function ensureBranch(branch, token) {
  const refResponse = await fetch(
    `https://api.github.com/repos/${OWNER_REPO}/git/ref/heads/${encodeURIComponent(branch)}`,
    { headers: githubHeaders(token) },
  );
  if (refResponse.ok) {
    return;
  }
  if (refResponse.status !== 404) {
    const detail = await refResponse.text();
    throw new Error(`GitHub ref lookup error (${refResponse.status}): ${detail}`);
  }

  const baseBranch = process.env.GITHUB_BRANCH || "main";
  const baseRefResponse = await fetch(
    `https://api.github.com/repos/${OWNER_REPO}/git/ref/heads/${encodeURIComponent(baseBranch)}`,
    { headers: githubHeaders(token) },
  );
  if (!baseRefResponse.ok) {
    const detail = await baseRefResponse.text();
    throw new Error(`GitHub base ref lookup error (${baseRefResponse.status}): ${detail}`);
  }
  const baseRef = await baseRefResponse.json();

  const createResponse = await fetch(`https://api.github.com/repos/${OWNER_REPO}/git/refs`, {
    method: "POST",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseRef.object.sha }),
  });
  if (!createResponse.ok) {
    const detail = await createResponse.text();
    throw new Error(`GitHub branch create error (${createResponse.status}): ${detail}`);
  }
}

module.exports = { OWNER_REPO, getFile, putFile, ensureBranch };
