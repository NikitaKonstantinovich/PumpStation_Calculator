import { loadLocalAIEnv } from "./local-ai-env.mjs";

class ConnectionError extends Error {}

async function main() {
  const settings = await loadLocalAIEnv();
  const key = settings.OPENAI_API_KEY;
  if (!key || !/^sk-[A-Za-z0-9_-]{30,}$/.test(key)) {
    throw new ConnectionError("Set OPENAI_API_KEY in .env.ai.local, then save the file.");
  }
  const model = settings.OPENAI_MODEL || "gpt-6-luna";
  if (!/^gpt-[a-z0-9.-]+$/.test(model)) {
    throw new ConnectionError("OPENAI_MODEL must contain an OpenAI GPT model ID.");
  }
  console.log("API key loaded; its value is hidden.");

  async function request(path, body) {
    let response;
    try {
      response = await fetch(`https://api.openai.com/v1/${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new ConnectionError("OpenAI connection failed or timed out. Check network access to api.openai.com.");
    }
    if (!response.ok) {
      const hints = {
        400: "Check model and request settings.",
        401: "Check whether the key is valid and has expired or been revoked.",
        403: "Check API key permissions, project model access and account availability.",
        404: "Check whether this model is available to your API project.",
        429: "Check API credits and rate limits in the OpenAI project.",
      };
      // Error bodies can contain credentials. Report only status and fixed guidance.
      throw new ConnectionError(`OpenAI ${path}: HTTP ${response.status}. ${hints[response.status] || "Try again later."}`);
    }
    return response.json();
  }

  const models = await request("models");
  if (!models.data?.some((entry) => entry.id === model)) {
    throw new ConnectionError("Key accepted, but OPENAI_MODEL was not found in this project's model list.");
  }
  console.log(`Model access confirmed: ${model}.`);

  // This explicitly invoked check makes one small billable request; no documents are sent.
  const result = await request("responses", {
    model,
    input: "Reply with exactly OK.",
    reasoning: { effort: "none" },
    max_output_tokens: 64,
    store: false,
  });
  const answer = result.output
    ?.filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("")
    .trim();
  if (result.status !== "completed" || !answer) {
    throw new ConnectionError("The API accepted the request but did not return a completed text answer.");
  }
  console.log(answer === "OK" ? "Responses API: OK." : "Responses API: text answer received.");
  const usage = result.usage;
  if (Number.isSafeInteger(usage?.input_tokens) && Number.isSafeInteger(usage?.output_tokens)) {
    console.log(`Tokens used: ${usage.input_tokens} input, ${usage.output_tokens} output.`);
  }
  console.log("Connection check passed. No documentation was uploaded.");
}

main().catch((error) => {
  console.error(error instanceof ConnectionError
    ? error.message
    : "Connection check failed. Check local configuration and try again; sensitive error details were hidden.");
  process.exitCode = 1;
});
