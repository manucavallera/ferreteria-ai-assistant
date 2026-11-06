import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// --- "Base de datos" de mentira: más adelante será PostgreSQL ---
const inventario = [
  { producto: "martillo", stock: 12, minimo: 5 },
  { producto: "destornillador", stock: 3, minimo: 8 },
  { producto: "cinta métrica", stock: 0, minimo: 4 },
  { producto: "taladro", stock: 6, minimo: 2 },
];

// --- 1. Las herramientas que el modelo puede pedir ---
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

// --- 2. El código que ejecuta cada herramienta (lo corre TU programa) ---
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
    // El modelo puede equivocarse: validamos acá, en nuestro código
    if (typeof cantidad !== "number" || !(cantidad > 0)) {
      return "La cantidad debe ser un número mayor que 0";
    }
    item.stock += cantidad;
    return JSON.stringify(item);
  }
  return `Herramienta desconocida: ${nombre}`;
}

// --- 3. El bucle del agente ---
const pregunta =
  process.argv[2] ?? "¿Qué productos tengo que reponer y cuántos martillos hay?";
console.log("Pregunta:", pregunta);

const messages: Anthropic.MessageParam[] = [{ role: "user", content: pregunta }];
const MAX_PASOS = 10;
let terminado = false;

for (let paso = 1; paso <= MAX_PASOS; paso++) {
  const res = await client.messages.create({
    model: "claude-haiku-5-5",
    max_tokens: 1024,
    system: "Sos un asistente de una ferretería. Usá las herramientas para responder con datos reales.",
    tools,
    messages,
  });

  console.log(`[paso ${paso}] stop_reason:`, res.stop_reason);

  // Guardamos lo que dijo el modelo en el historial
  messages.push({ role: "assistant", content: res.content });

  // Si no pidió ninguna herramienta, terminó: mostramos la respuesta
  if (res.stop_reason !== "tool_use") {
    for (const bloque of res.content) {
      if (bloque.type === "text") console.log("\nRespuesta:", bloque.text);
    }
    terminado = true;
    break;
  }

  // Si pidió herramientas: las ejecutamos y devolvemos los resultados
  const resultados: Anthropic.ToolResultBlockParam[] = [];
  for (const bloque of res.content) {
    if (bloque.type === "tool_use") {
      const salida = ejecutarHerramienta(bloque.name, bloque.input);
      console.log(`[paso ${paso}] ${bloque.name}(${JSON.stringify(bloque.input)}) -> ${salida}`);
      resultados.push({ type: "tool_result", tool_use_id: bloque.id, content: salida });
    }
  }
  messages.push({ role: "user", content: resultados });
}

if (!terminado) console.error(`El agente no terminó en ${MAX_PASOS} pasos.`);