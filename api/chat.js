// api/chat.js — Vercel Serverless Function (Node) con CORS + guardrails + fallback local

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function clampLines(text, maxLines = 3) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  return lines.slice(0, maxLines).join(" ").slice(0, 320);
}

function localFallback(message) {
  const msg = String(message || "").toLowerCase();

  if (/\b(horario|hora|abren|abrís|cerráis|cierran|abierto|abiertos)\b/.test(msg)) {
    return "Abrimos de lunes a viernes de 9:00 a 19:00, y sábados de 10:00 a 14:00.";
  }
  if (/\b(reserva|reservar|cita|agendar|appointment|turno)\b/.test(msg)) {
    return "Para reservar, dime día y hora preferidos (ej: 'viernes a las 17:30') y tu nombre.";
  }
  if (/\b(pedido|encargo|orden|order|comprar|precio|presupuesto)\b/.test(msg)) {
    return "¿Qué te gustaría pedir? Indica producto y cantidad, y te confirmo disponibilidad.";
  }
  if (/\b(hola|buenas|qué tal|buenos días|buenas tardes|hey)\b/.test(msg)) {
    return "¡Hola! Puedo ayudarte con horarios, reservas y pedidos. ¿Qué necesitas?";
  }
  return "Esta es una demo. Para verlo aplicado a tu negocio, agenda una llamada.";
}

const SYSTEM_PROMPT =
  "Eres un asistente DEMO de AutoEngine. Responde SOLO sobre horarios, reservas y pedidos, " +
  "y precios aproximados sin comprometer. Máximo 2–3 líneas. " +
  "Si te preguntan algo fuera de esto, responde: 'Esta es una demo. Para verlo aplicado a tu negocio, agenda una llamada.' " +
  "Sé claro, directo y amable. No uses emojis. Español neutro.";

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed. Use POST." });

  try {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch {}
    }
    body = body && typeof body === "object" ? body : {};

    const message = typeof body.message === "string" ? body.message : "";
    const history = Array.isArray(body.history) ? body.history : [];
    if (!message.trim()) return res.status(400).json({ error: 'Missing "message" string' });

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(-8),
      { role: "user", content: message },
    ];

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const reply = localFallback(message);
      return res.status(200).json({ reply });
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 120,
        messages,
      }),
    });

    // Si falla la API, usa fallback local
    if (!r.ok) {
      const reply = localFallback(message);
      return res.status(200).json({ reply });
    }

    const data = await r.json();
    let raw =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      "";

    if (!raw || !String(raw).trim()) {
      raw = localFallback(message);
    }

    const reply = clampLines(raw, 3);
    return res.status(200).json({ reply });
  } catch (e) {
    const reply = localFallback("");
    return res.status(200).json({ reply });
  }
}


