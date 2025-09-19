// api/chat.js — Demo IA: reservas/pedidos/horarios + atención al cliente básica + cierra cuando ya tiene lo necesario

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function clampLines(text, maxLines = 3) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  return lines.slice(0, maxLines).join(" ").slice(0, 320);
}

// CTA para fuera de tema
const OUT_OF_SCOPE_MESSAGE =
  "Esto es una demo. Si quieres un chatbot como este, adaptado a tu negocio (reservas, pedidos y atención al cliente), agenda una llamada y lo vemos en 10 minutos.";

const SYSTEM_PROMPT = `
Eres un asistente DEMO de AutoEngine.

Actúas como recepcionista de un negocio local (pastelería, peluquería/estética, clínica —dental, médica ligera, fisio, optometría—, o taller mecánico).
Responde en español neutro, con **máximo 2–3 líneas**, tono amable y directo.

Qué puedes hacer:
- Gestionar **reservas, pedidos y horarios**.
- Responder **preguntas básicas de atención al cliente** del sector:
  • Pastelería: pedidos/encargos, alérgenos generales, recogida/entrega, precios orientativos.
  • Peluquería/Clínica: citas, revisiones, limpiezas, molestias/síntomas → da orientación general y propone cita (sin diagnóstico).
  • Taller: revisiones/averías comunes, tiempos/precios orientativos y propuesta de cita.

Horarios y disponibilidad:
- Cualquier pregunta de horario/disponibilidad es válida. Da horario ficticio estándar: **L–V 9:00–19:00, S 10:00–14:00, D cerrado**.
- Si piden disponibilidad, ofrece **2–3 opciones concretas** (p. ej., hoy 12:00 / mañana 10:30 / viernes 17:00).

Cierre de conversación:
- Pide solo lo que falte entre **día**, **hora** y **motivo**.
- Cuando ya tengas los tres, **confirma y cierra** en un único mensaje. Ejemplo:
  "Perfecto, te confirmo la cita para mañana a las 12:00 para revisar la suspensión. ¡Te esperamos!"
- No prolongues la conversación más de **2–3 turnos** si ya puedes cerrar.

Límites:
- No des diagnósticos médicos ni instrucciones técnicas avanzadas.
- Ante síntomas o averías, orienta y invita a cita (sin bloquear).
- **Solo si la pregunta es totalmente fuera del negocio** (política, ciencia, deportes, etc.), responde EXACTAMENTE:
  "${OUT_OF_SCOPE_MESSAGE}"
`;

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed. Use POST." });

  try {
    // Aceptar body como string u objeto
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
        max_tokens: 200,
        messages,
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return res.status(500).json({ error: "LLM error", detail: errText.slice(0, 300) });
    }

    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() || "";

    const reply = clampLines(raw || OUT_OF_SCOPE_MESSAGE, 3);
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e?.message || e) });
  }
}




