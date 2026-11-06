# Asistente de ferretería (agente + RAG)

Asistente de consultas para un negocio, hecho con TypeScript y la API de Claude.
Combina **datos en vivo** (herramientas de inventario) y **conocimiento del negocio**
(búsqueda por embeddings sobre documentos).

## Qué hace
- Consulta stock, lista productos bajo el mínimo y repone unidades.
- Responde políticas del negocio (horarios, pagos, envíos, garantía, descuentos)
  buscando en los documentos de la carpeta `docs/`.
- Si no encuentra la información, lo dice y no inventa.
- Mantiene la conversación entre mensajes.

## Cómo funciona
1. Los documentos `.txt` se cortan en chunks y se convierten en embeddings (modelo local).
2. El agente decide qué herramienta usar: inventario o búsqueda en documentos.
3. Claude responde usando solo lo que devolvieron las herramientas.

## Cómo correrlo
```bash
npm install
# crear un archivo .env con: ANTHROPIC_API_KEY=tu-clave
npx tsx --env-file=.env chat2.ts
```

## Archivos principales
- `chat2.ts`: el asistente completo (agente + RAG).
- `buscador.ts` y `chunker.ts`: búsqueda por embeddings y corte de documentos.
- `chat.ts`, `agents.ts`: versiones anteriores solo con herramientas de inventario.
- `ticket.ts`, `rag.ts`, `rag2.ts`, `pruebas.ts`: ejemplos de etapas previas.

## Stack
TypeScript, Claude API (tool use), Transformers.js (embeddings multilingües), Zod.

## Estado
Proyecto de práctica con inventario y documentos de ejemplo (datos inventados).