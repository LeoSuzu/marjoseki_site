const REQUIRED_TOP_LEVEL_KEYS = ["global", "home", "palvelut", "kirjat", "yhteystiedot", "tapahtumia"];

function isValidSitePayload(site) {
  if (!site || typeof site !== "object" || Array.isArray(site)) {
    return false;
  }
  return REQUIRED_TOP_LEVEL_KEYS.every((key) => Object.prototype.hasOwnProperty.call(site, key));
}

module.exports = { isValidSitePayload, REQUIRED_TOP_LEVEL_KEYS };
