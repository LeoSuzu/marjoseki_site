const { getFile, deleteFile } = require("./_github");

const UPLOAD_DIR = "assets/uploads";
// Matches the `${Date.now()}-${randomSlug()}.${extension}` names upload-image.js
// generates. Anything else in this folder (e.g. the hand-placed
// *-placeholder.svg template assets) is left alone.
const UPLOAD_FILENAME_PATTERN = /^\d{10,}-[a-z0-9]{1,12}\.(jpg|jpeg|png|webp|gif)$/i;

function collectReferencedUploadPaths(value, into) {
  if (typeof value === "string") {
    if (value.startsWith(`${UPLOAD_DIR}/`)) {
      into.add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectReferencedUploadPaths(item, into));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectReferencedUploadPaths(item, into));
  }
}

// Best-effort: a failure here should never fail the publish itself, since
// the important write (content/site.json) already succeeded by the time
// this runs.
async function cleanupOrphanedUploads(site, branch, token) {
  try {
    const referenced = new Set();
    collectReferencedUploadPaths(site, referenced);

    const listing = await getFile(UPLOAD_DIR, branch, token);
    if (!Array.isArray(listing)) {
      return;
    }

    for (const entry of listing) {
      if (entry.type !== "file" || !UPLOAD_FILENAME_PATTERN.test(entry.name)) {
        continue;
      }
      if (referenced.has(entry.path)) {
        continue;
      }
      await deleteFile(entry.path, branch, token, {
        sha: entry.sha,
        message: `Poista käyttämätön kuva: ${entry.name}`,
      });
    }
  } catch (error) {
    console.error("Orphaned upload cleanup failed", error);
  }
}

module.exports = { cleanupOrphanedUploads };
