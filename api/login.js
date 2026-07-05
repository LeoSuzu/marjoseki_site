const { setSessionCookie, timingSafeEqualString } = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminUsername || !adminPassword) {
    return res.status(500).json({ ok: false, error: "Admin credentials are not configured." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
      return res.status(400).json({ ok: false, error: "Invalid request body." });
    }
  }

  const { username, password } = body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "Username and password are required." });
  }

  const usernameMatches = timingSafeEqualString(username, adminUsername);
  const passwordMatches = timingSafeEqualString(password, adminPassword);

  if (!usernameMatches || !passwordMatches) {
    return res.status(401).json({ ok: false, error: "Invalid credentials." });
  }

  setSessionCookie(res);
  return res.status(200).json({ ok: true });
};
