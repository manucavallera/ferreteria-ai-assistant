import Anthropic from "@anthropic-ai/sdk";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { crearBuscador } from "./buscador.js";

const client = new Anthropic();

console.log("Cargando documentos y modelo de embeddings...");
const { buscar, cantidadChunks, cantidadArchivos } = await crearBuscador("docs");
console.log(`Listo: ${cantidadArchivos} archivo(s), ${cantidadChunks} chunks.\n`);

// --- "Base de datos" de mentira: más adelante será PostgreSQL ---
const inventario = [
  { producto: "martillo", stock: 12, minimo: 5 },
  { producto: "destornillador", stock: 3, minimo: 8 },
  { producto: "cinta métrica", stock: 0, minimo: 4 },
  { producto: "taladro", stock: 6, minimo: 2 },
];

// --- 1. Herramientas ---
const tools: Anthropic.Tool[] = [
  {
    name: "consultar_stock",
    description:
      "Devuelve el stock actual y el mínimo recomendado de un producto del inventario.",
    input_schema: {
      type: "object",
      properties: {
        producto: { type: "string", description: "Nombre del producto, ej: martillo" },
      },
      required: ["producto"],
    },
  },
  {
    name: "productos_bajo_minimo",
    description:
      "Lista los productos cuyo stock está por debajo del mínimo recomendado.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "reponer_stock",
    description:
      "Suma unidades al stock de un producto existente. Úsala solo cuando el usuario pida explícitamente reponer y haya indicado la cantidad.",
    input_schema: {
      type: "object",
      properties: {
        producto: { type: "string", description: "Nombre del producto" },
        cantidad: { type: "number", description: "Unidades a sumar (mayor que 0)" },
      },
      required: ["producto", "cantidad"],
    },
  },
  {
    name: "buscar_en_documentos",
    description:
      "Busca en los documentos de la ferretería: horarios, medios de pago, envíos, garantía, cambios y devoluciones, descuentos por cantidad y cuentas corrientes. NO sirve para stock ni precios de productos.",
    input_schema: {
      type: "object",
      properties: {
        consulta: {
          type: "string",
          description: "La pregunta o tema a buscar, ej: descuento por cantidad de tornillos",
        },
      },
      required: ["consulta"],
    },
  },
];

// --- 2. Ejecución de herramientas (la corre TU programa) ---
async function ejecutarHerramienta(nombre: string, input: unknown): Promise<string> {
  if (nombre === "consultar_stock") {
    const { producto } = input as { producto: string };
    const item = inventario.find(
      (i) => i.producto.toLowerCase() === producto.toLowerCase(),
    );
    return item ? JSON.stringify(item) : `No existe el producto "${producto}"`;
  }
  if (nombre === "productos_bajo_minimo") {
    return JSON.stringify(inventario.filter((i) => i.stock < i.minimo));
  }
  if (nombre === "reponer_stock") {
    const { producto, cantidad } = input as { producto: string; cantidad: number };
    const item = inventario.find(
      (i) => i.producto.toLowerCase() === producto.toLowerCase(),
    );
    if (!item) return `No existe el producto "${producto}"`;
    if (typeof cantidad !== "number" || !(cantidad > 0)) {
      return "La cantidad debe ser un número mayor que 0";
    }
    item.stock += cantidad;
    return JSON.stringify(item);
  }
  if (nombre === "buscar_en_documentos") {
    const { consulta } = input as { consulta: string };
    const resultados = await buscar(consulta);
    return resultados.map((r, i) => `[${i + 1}] ${r.texto}`).join("\n\n");
  }
  return `Herramienta desconocida: ${nombre}`;
}

// --- 3. Un turno: el bucle del agente para UN mensaje del usuario ---
const MAX_PASOS = 10;

const SYSTEM =
  "Sos el asistente de una ferretería. Para datos de stock usá las herramientas de inventario. " +
  "Para políticas del negocio (horarios, pagos, envíos, garantía, descuentos, cuenta corriente) usá buscar_en_documentos. " +
  "Respondé solo con la información que devuelvan las herramientas. " +
  "Si no la encontrás, decí que no lo sabés y no inventes. Respondé breve y en español.";

async function turno(messages: Anthropic.MessageParam[]): Promise<void> {
  for (let paso = 1; paso <= MAX_PASOS; paso++) {
    const res = await client.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 1024,
      system: SYSTEM,
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason !== "tool_use") {
      for (const bloque of res.content) {
        if (bloque.type === "text") console.log("\nAsistente:", bloque.text, "\n");
      }
      return;
    }

    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const bloque of res.content) {
      if (bloque.type === "tool_use") {
        const salida = await ejecutarHerramienta(bloque.name, bloque.input);
        const resumen = salida.length > 120 ? salida.slice(0, 120) + "..." : salida;
        console.log(`  [herramienta] ${bloque.name}(${JSON.stringify(bloque.input)}) -> ${resumen.replace(/\n/g, " ")}`);
        resultados.push({ type: "tool_result", tool_use_id: bloque.id, content: salida });
      }
    }
    messages.push({ role: "user", content: resultados });
  }
  console.error(`El agente no terminó en ${MAX_PASOS} pasos.`);
}

// --- 4. El chat: leer, responder, repetir ---
const rl = readline.createInterface({ input, output });
const messages: Anthropic.MessageParam[] = [];

console.log('Chat de la ferretería. Escribí "salir" para terminar.\n');

while (true) {
  const texto = (await rl.question("Vos: ")).trim();
  if (texto === "") continue;
  if (texto.toLowerCase() === "salir") break;
  messages.push({ role: "user", content: texto });
  await turno(messages);
}

rl.close();