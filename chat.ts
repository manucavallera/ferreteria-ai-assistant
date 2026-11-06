import Anthropic from "@anthropic-ai/sdk";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const client = new Anthropic();

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
];

// --- 2. Ejecución de herramientas (la corre TU programa) ---
function ejecutarHerramienta(nombre: string, input: unknown): string {
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
  return `Herramienta desconocida: ${nombre}`;
}

// --- 3. Un turno: el bucle del agente para UN mensaje del usuario ---
// `messages` se comparte entre turnos: así el modelo "recuerda" la charla.
const MAX_PASOS = 10;

async function turno(messages: Anthropic.MessageParam[]): Promise<void> {
  for (let paso = 1; paso <= MAX_PASOS; paso++) {
    const res = await client.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 1024,
      system: "Sos un asistente de una ferretería. Usá las herramientas para responder con datos reales.",
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason !== "tool_use") {
      for (const bloque of res.content) {
        if (bloque.type === "text") console.log("\nAsistente:", bloque.text);
      }
      return;
    }

    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const bloque of res.content) {
      if (bloque.type === "tool_use") {
        const salida = ejecutarHerramienta(bloque.name, bloque.input);
        console.log(`  [herramienta] ${bloque.name}(${JSON.stringify(bloque.input)}) -> ${salida}`);
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