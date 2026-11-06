import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const Ticket = z.object({
  cliente: z.string(),
  urgencia: z.enum(["baja", "media", "alta"]),
  resumen: z.string(),
  requiereLlamada: z.boolean(),
});

const client = new Anthropic();

// Precios de Haiku 5.5 (prompts hasta 100.000 tokens), en USD por millón de tokens.
// Fuente: página de precios de Anthropic. Revisalos de vez en cuando.
const PRECIO_ENTRADA = 0.1;
const PRECIO_SALIDA = 0.5;

function costoUSD(tokensEntrada: number, tokensSalida: number): number {
  return (
    (tokensEntrada * PRECIO_ENTRADA + tokensSalida * PRECIO_SALIDA) / 1_000_000
  );
}

// Casos de prueba: cada uno es un experimento
const casos = [
  {
    nombre: "Urgente y claro",
    mensaje:
      "Hola, soy Ana de Ferretería Sur. Desde ayer el sistema de stock no carga " +
      "y no puedo facturar. Necesito que me llamen hoy.",
    maxTokens: 500,
  },
  {
    nombre: "Consulta poco urgente",
    mensaje: "Hola, soy Juan de Kiosco Norte. ¿Tienen horario de atención los sábados?",
    maxTokens: 500,
  },
  {
    nombre: "Sin datos (¿inventa algo?)",
    mensaje: "hola",
    maxTokens: 500,
  },
  {
    nombre: "Cortado por max_tokens",
    mensaje:
      "Hola, soy Ana de Ferretería Sur. Desde ayer el sistema de stock no carga " +
      "y no puedo facturar. Necesito que me llamen hoy.",
    maxTokens: 20,
  },
];

let costoTotal = 0;

for (const caso of casos) {
  console.log(`\n=== ${caso.nombre} ===`);
  console.log("Mensaje:", caso.mensaje);

  try {
    const res = await client.messages.parse({
      model: "claude-haiku-5-5",
      max_tokens: caso.maxTokens,
      system: "Extraés datos de mensajes de clientes de soporte. Respondé en español.",
      messages: [{ role: "user", content: caso.mensaje }],
      output_config: { format: zodOutputFormat(Ticket) },
    });

    const costo = costoUSD(res.usage.input_tokens, res.usage.output_tokens);
    costoTotal += costo;

    console.log("stop_reason:", res.stop_reason);
    console.log("Resultado:", res.parsed_output ?? "(sin resultado válido)");
    console.log(
      `Tokens: ${res.usage.input_tokens} entrada / ${res.usage.output_tokens} salida`,
    );
    console.log(`Costo: USD ${costo.toFixed(7)}`);
  } catch (error) {
    // Si la respuesta se corta, el SDK puede no poder armar el JSON
    console.error("Falló la llamada:", error instanceof Error ? error.message : error);
  }
}

console.log(`\nCosto total de las pruebas: USD ${costoTotal.toFixed(7)}`);
console.log(
  `Estimado para 1.000 mensajes como el primero: USD ${(costoUSD(439, 84) * 1000).toFixed(4)}`,
);