import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// 1. La forma que queremos que tenga la respuesta
const Ticket = z.object({
  cliente: z.string(),
  urgencia: z.enum(["baja", "media", "alta"]),
  resumen: z.string(),
  requiereLlamada: z.boolean(),
});

const client = new Anthropic();

// 2. Un mensaje de ejemplo, como si lo escribiera un cliente
const mensaje =
  "Hola, soy Ana de Ferretería Sur. Desde ayer el sistema de stock no carga " +
  "y no puedo facturar. Necesito que me llamen hoy.";

// 3. La llamada: le pedimos el formato con el esquema
const res = await client.messages.parse({
  model: "claude-haiku-5-5",
  max_tokens: 500,
  system: "Extraés datos de mensajes de clientes de soporte. Respondé en español.",
  messages: [{ role: "user", content: mensaje }],
  output_config: { format: zodOutputFormat(Ticket) },
});

// 4. Revisar que terminó bien y mostrar el resultado
if (res.stop_reason !== "end_turn" || !res.parsed_output) {
  console.error("Respuesta incompleta o rechazada:", res.stop_reason);
  process.exit(1);
}

console.log(res.parsed_output);
console.log("Tokens de entrada:", res.usage.input_tokens);
console.log("Tokens de salida:", res.usage.output_tokens);