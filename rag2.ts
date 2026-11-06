import Anthropic from "@anthropic-ai/sdk";
import { pipeline } from "@huggingface/transformers";
import { readdir, readFile } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { chunkText } from "./chunker.js";

const client = new Anthropic();

// --- 1. Leer todos los .txt de la carpeta docs y cortarlos en chunks ---
const CARPETA = "docs";
const archivos = (await readdir(CARPETA)).filter((f) => extname(f) === ".txt");

const chunks: string[] = [];
for (const archivo of archivos) {
  const texto = await readFile(join(CARPETA, archivo), "utf-8");
  chunks.push(...chunkText(texto, basename(archivo, ".txt")));
}
console.log(`Leí ${archivos.length} archivo(s) y los corté en ${chunks.length} chunks.`);

// --- 2. Modelo de embeddings local ---
console.log("Cargando modelo de embeddings...");
const extractor = await pipeline("feature-extraction", "Xenova/multilingual-e5-small", {
  dtype: "q8",
});

async function embed(textos: string[], tipo: "query" | "passage"): Promise<number[][]> {
  const salida = await extractor(
    textos.map((t) => `${tipo}: ${t}`),
    { pooling: "mean", normalize: true },
  );
  return salida.tolist() as number[][];
}

function similitud(a: number[], b: number[]): number {
  let suma = 0;
  for (let i = 0; i < a.length; i++) suma += a[i]! * b[i]!;
  return suma;
}

// --- 3. Un embedding por chunk ---
const embeddingsChunks = await embed(chunks, "passage");

// --- 4. Buscar los chunks más cercanos a la pregunta ---
const pregunta = process.argv[2] ?? "¿Hacen descuento si compro 10 cajas de tornillos?";
console.log("\nPregunta:", pregunta);

const [embeddingPregunta] = await embed([pregunta], "query");

const ranking = chunks
  .map((texto, i) => ({ texto, puntaje: similitud(embeddingPregunta!, embeddingsChunks[i]!) }))
  .sort((a, b) => b.puntaje - a.puntaje);

// Nos quedamos con los que estén cerca del mejor (máximo TOP_K)
const TOP_K = 3;
const MARGEN = 0.03;
const mejor = ranking[0]!.puntaje;
const elegidos = ranking.filter((c) => c.puntaje >= mejor - MARGEN).slice(0, TOP_K);

console.log("\nChunks encontrados:");
for (const c of elegidos) {
  console.log(`  [${c.puntaje.toFixed(3)}] ${c.texto.replace(/\n/g, " | ")}`);
}
const segundo = ranking[1]!.puntaje;
console.log(`  (mejor ${mejor.toFixed(3)}, diferencia con el 2º: ${(mejor - segundo).toFixed(3)})`);

// --- 5. Claude responde usando SOLO esos chunks ---
const contexto = elegidos.map((c, i) => `[${i + 1}] ${c.texto}`).join("\n\n");

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