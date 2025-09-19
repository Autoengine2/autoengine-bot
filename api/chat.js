// api/chat.js — Demo con IA que pide lo necesario y cierra la conversación

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function clampLines(text, maxLines = 3) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  return lines.slice(0, maxLines).join(" ").slice(0, 320);
}

const SYSTEM_PROMPT = `
Eres un asistente DEMO de AutoEngine.

Actúas como recepcionista de un negocio local. Tu objetivo es **gestionar reservas, pedidos y horarios**, recogiendo solo la información necesaria y cerrando la conversación cuando ya esté todo claro.

Instrucciones:
- Pregunta únicamente por la información básica que falte:
  • Día  
  • Hora  
  • Motivo del servicio o pedido
- Si el cliente ya ha dado todo (día, hora y motivo), confirma la reserva o pedido en un mensaje final y **cierra la conversación**. Ejemplo:
"Perfecto, te confirmo la cita para mañana a las 12:00 para revisar la suspensión. ¡Te esperamos!"
- Una vez cerrado, no sigas la conversación.
- Adáptate al contexto:
  • Pastelería → pedidos de tartas/pasteles.  
  • Peluquería o clínica (dental, estética, médica, fisioterapia, optometría) → reservas de citas.  
  • Taller mecánico → revisiones/reparaciones de coches.  
- Usa horarios ficticios cuando te pidan disponibilidad.
- Siempre responde en español neutro, máximo 2–3 líneas.
- Si el usuario pregunta algo fuera de estos temas (p. ej. política, ciencia, deportes), responde exactamente:
"Esta es una demo. Solo puedo responder sobre horarios, reservas y pedidos."
`;

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed. Use POST." });

  try {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch {} }
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
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.5,
        max_tokens: 160,
        messages,
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return res.status(500).json({ error: "LLM error", detail: errText.slice(0, 300) });
    }

    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() || "";

    const reply = clampLines(
      raw || "Esta es una demo. Solo puedo responder sobre horarios, reservas y pedidos.",
      3
    );
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e?.message || e) });
  }
}




