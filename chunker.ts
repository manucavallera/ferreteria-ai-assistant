// Corta un texto en chunks respetando párrafos.
// Cada chunk lleva el título del documento adelante, para dar contexto al buscarlo.

export function chunkText(
  texto: string,
  titulo: string,
  maxCaracteres = 600,
  minCaracteres = 80,
): string[] {
  // 1. Separar en párrafos (bloques separados por líneas en blanco)
  const parrafos = texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // 2. Si un párrafo es muy largo, partirlo por oraciones
  const piezas: string[] = [];
  for (const p of parrafos) {
    if (p.length <= maxCaracteres) {
      piezas.push(p);
    } else {
      const oraciones = p.split(/(?<=[.!?])\s+/);
      let actual = "";
      for (const o of oraciones) {
        if ((actual + " " + o).trim().length > maxCaracteres && actual !== "") {
          piezas.push(actual.trim());
          actual = o;
        } else {
          actual = (actual + " " + o).trim();
        }
      }
      if (actual) piezas.push(actual.trim());
    }
  }

  // 3. Pegar las piezas muy cortas (títulos sueltos) con la siguiente
  const unidas: string[] = [];
  let pendiente = "";
  for (const pieza of piezas) {
    const candidata = pendiente ? `${pendiente}\n${pieza}` : pieza;
    if (pieza.length < minCaracteres) {
      pendiente = candidata; // es muy corta: esperar a la que sigue
    } else {
      unidas.push(candidata);
      pendiente = "";
    }
  }
  if (pendiente) unidas.push(pendiente);

  // 4. Agregar el título del documento a cada chunk
  return unidas.map((p) => `${titulo} — ${p}`);
}