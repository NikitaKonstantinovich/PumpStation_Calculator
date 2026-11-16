import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";

const configFile = new URL("../.env.ai.local", import.meta.url);
const bindingNames = [
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_VECTOR_STORE_ID",
  "AI_ASSISTANT_ENABLED",
];

// Runtime only: never import this loader into Vite's build configuration or client code.
export async function loadLocalAIEnv(file = configFile, environment = process.env) {
  let local = {};
  try {
    local = parseEnv(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      // Configuration values (including the key) must never appear in diagnostics.
      throw new Error("Could not read .env.ai.local. Check its format and file permissions.");
    }
  }

  return Object.fromEntries(bindingNames.flatMap((name) => {
    const value = environment[name] ?? local[name];
    return typeof value === "string" ? [[name, value.trim()]] : [];
  }));
}
