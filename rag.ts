import Anthropic from "@anthropic-ai/sdk";
import { pipeline } from "@huggingface/transformers";

const client = new Anthropic();

// --- 1. Los "chunks": pedazos de los documentos de la ferretería ---
const chunks = [
  "Descuentos por cantidad: en tornillos, la compra de 10 cajas o más tiene un 8% de descuento. Con 50 cajas o más, el descuento sube al 12%.",
  "Horario de atención: lunes a viernes de 8:00 a 18:00 y sábados de 8:00 a 13:00. Domingos y feriados permanecemos cerrados.",
  "Garantía: los taladros y herramientas eléctricas tienen 12 meses de garantía con la factura de compra. La garantía no cubre golpes ni mal uso.",
  "Envíos: hacemos entregas a domicilio dentro de la ciudad. Compras de más de $50.000 tienen envío gratis; por debajo de ese monto, el envío cuesta $2.500.",
  "Medios de pago: aceptamos efectivo, transferencia y tarjetas de débito y crédito. Con efectivo o transferencia hay un 5% de descuento.",
  "Devoluciones: se aceptan cambios dentro de los 15 días con el producto sin uso y el ticket. No se devuelven cortes de caño ni pinturas preparadas.",
];

// --- 2. Modelo de embeddings local (se descarga la primera vez) ---
console.log("Cargando modelo de embeddings (la primera vez se descarga)...");
const extractor = await pipeline("feature-extraction", "Xenova/multilingual-e5-small", {
  dtype: "q8", // versión liviana (~118 MB)
});

// Este modelo (E5) pide un prefijo según el tipo de texto
async function embed(textos: string[], tipo: "query" | "passage"): Promise<number[][]> {
  const salida = await extractor(
    textos.map((t) => `${tipo}: ${t}`),
    { pooling: "mean", normalize: true },
  );
  return salida.tolist() as number[][];
}

// Como los vectores están normalizados, el producto punto = similitud
function similitud(a: number[], b: number[]): number {
  let suma = 0;
  for (let i = 0; i < a.length; i++) suma += a[i]! * b[i]!;
  return suma;
}

// --- 3. Preparación: un embedding por chunk ---
const embeddingsChunks = await embed(chunks, "passage");

// --- 4. Cada pregunta: buscar los chunks más cercanos ---
const pregunta = process.argv[2] ?? "¿Hacen descuento si compro 10 cajas de tornillos?";
console.log("\nPregunta:", pregunta);

const [embeddingPregunta] = await embed([pregunta], "query");

const ranking = chunks
  .map((texto, i) => ({ texto, puntaje: similitud(embeddingPregunta!, embeddingsChunks[i]!) }))
  .sort((a, b) => b.puntaje - a.puntaje);

const TOP_K = 2;
const elegidos = ranking.slice(0, TOP_K);

console.log("\nChunks encontrados:");
for (const c of elegidos) {
  console.log(`  [${c.puntaje.toFixed(3)}] ${c.texto}`);
}

// --- 5. Claude responde usando SOLO esos chunks ---
const contexto = elegidos.map((c, i) => `[${i + 1}] ${c.texto}`).join("\n");

const res = await client.messages.create({
  model: "claude-haiku-5-5",
  max_tokens: 500,
  system:
    "Sos el asistente de una ferretería. Respondé usando SOLO la información del contexto. " +
    "Si la respuesta no está en el contexto, decí que no lo sabés. Respondé breve y en español.",
  messages: [
    { role: "user", content: `Contexto:\n${contexto}\n\nPregunta: ${pregunta}` },
  ],
});

console.log("\nRespuesta:");
for (const bloque of res.content) {
  if (bloque.type === "text") console.log(bloque.text);
}
console.log(`\nTokens: ${res.usage.input_tokens} entrada / ${res.usage.output_tokens} salida`);