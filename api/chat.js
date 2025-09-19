// api/chat.js — Demo con IA adaptativa y permisiva dentro del marco (reservas, pedidos, horarios)

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

Tu papel es responder como si fueras el chatbot de un negocio local. Sé permisivo dentro del marco y adapta tu respuesta al contexto del cliente:

- Si el cliente menciona productos, encargos, tartas o similares → respóndele como si fueras una pastelería que gestiona pedidos.
- Si el cliente habla de cortes, citas, revisiones dentales, revisiones de la vista, limpiezas, consultas médicas/ópticas, tratamientos estéticos o fisioterapia → respóndele como si fueras una peluquería o clínica (dental, estética, médica, fisioterapia, optometría/oftalmología) que gestiona reservas de citas.
- Si el cliente habla de coches, revisiones, reparaciones o taller → respóndele como si fueras un taller mecánico que agenda servicios.
- Si el cliente pregunta por horarios o disponibilidad → contesta con horarios ficticios de negocio local.

Importante:
- Trata expresiones como "revisión dental", "limpieza dental", "revisión de la vista", "consulta", "tratamiento", "corte" como **reservas de cita**, no como diagnóstico.
- El objetivo es sonar como un negocio real que toma citas y pedidos, aunque el usuario use distintas palabras.

Reglas:
- Responde en español neutro, máximo 2–3 líneas.
- Sé claro, directo y amable.
- Si la pregunta no tiene nada que ver con horarios, reservas o pedidos (p.ej., política, ciencia, deportes), responde exactamente:
"Esta es una demo. Solo puedo responder sobre horarios, reservas y pedidos."
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
        max_tokens: 140,
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


