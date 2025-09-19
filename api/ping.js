// api/ping.js — minimal Node serverless function (CommonJS)
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  res.status(200).json({ ok: true, pong: Date.now() });
};
