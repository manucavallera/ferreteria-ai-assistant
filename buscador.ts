import { pipeline } from "@huggingface/transformers";
import { readdir, readFile } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { chunkText } from "./chunker.js";

export type Resultado = { texto: string; puntaje: number };

// Lee los .txt de una carpeta, los corta en chunks, calcula sus embeddings
// y devuelve una función `buscar(consulta)` que trae los chunks más relevantes.
export async function crearBuscador(carpeta = "docs") {
  const archivos = (await readdir(carpeta)).filter((f) => extname(f) === ".txt");

  const chunks: string[] = [];
  for (const archivo of archivos) {
    const texto = await readFile(join(carpeta, archivo), "utf-8");
    chunks.push(...chunkText(texto, basename(archivo, ".txt")));
  }

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

  const embeddingsChunks = await embed(chunks, "passage");

  function similitud(a: number[], b: number[]): number {
    let suma = 0;
    for (let i = 0; i < a.length; i++) suma += a[i]! * b[i]!;
    return suma;
  }

  const TOP_K = 3;
  const MARGEN = 0.03;

  async function buscar(consulta: string): Promise<Resultado[]> {
    const [emb] = await embed([consulta], "query");
    const ranking = chunks
      .map((texto, i) => ({ texto, puntaje: similitud(emb!, embeddingsChunks[i]!) }))
      .sort((a, b) => b.puntaje - a.puntaje);
    const mejor = ranking[0]!.puntaje;
    return ranking.filter((c) => c.puntaje >= mejor - MARGEN).slice(0, TOP_K);
  }

  return { buscar, cantidadChunks: chunks.length, cantidadArchivos: archivos.length };
}