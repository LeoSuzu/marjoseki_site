const { isSessionValid } = require("./_auth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ isAdmin: false });
  }

  return res.status(200).json({ isAdmin: isSessionValid(req) });
};
