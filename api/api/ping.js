// api/ping.js — función de prueba
module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();
  res.status(200).json({ ok: true, pong: Date.now() });
};
