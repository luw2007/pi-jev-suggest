/**
 * Minimal JEV choice client: one POST, one deadline, fail closed on anything off-contract.
 * Request body is `{ model, state, questions: { [id]: { type: "choice", instructions, criteria } } }`;
 * the answer is `answers[id].choice`.
 */
import { isRecord } from "./validation.ts";

export type JevIdentity = "exact" | "prefix" | "none";

export interface JevEndpoint {
  url: string;
  model: string;
  /** Environment variable holding the bearer token. The token is never read from the config file. */
  keyEnv: string;
  identity: JevIdentity;
  timeoutMs: number;
}

export interface JevChoiceQuestion {
  id: string;
  instructions: string;
  criteria: Record<string, string>;
}

export type JevFailure =
  | { kind: "http"; status: number }
  | { kind: "timeout" }
  | { kind: "aborted" }
  | { kind: "network" }
  | { kind: "malformed"; reason: string };

export type JevResult = { ok: true; choice: string } | { ok: false; failure: JevFailure };

function modelAccepted(reported: unknown, endpoint: JevEndpoint): boolean {
  if (endpoint.identity === "none") return true;
  if (typeof reported !== "string") return false;
  return endpoint.identity === "exact" ? reported === endpoint.model : reported.startsWith(endpoint.model);
}

export async function choose(
  endpoint: JevEndpoint,
  key: string,
  state: Record<string, string>,
  question: JevChoiceQuestion,
  signal: AbortSignal,
): Promise<JevResult> {
  if (signal.aborted) return { ok: false, failure: { kind: "aborted" } };
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, endpoint.timeoutMs);
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: endpoint.model,
        state,
        questions: {
          [question.id]: { type: "choice", instructions: question.instructions, criteria: question.criteria },
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, failure: { kind: "http", status: response.status } };

    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      if (error instanceof SyntaxError && !timedOut && !signal.aborted) {
        return { ok: false, failure: { kind: "malformed", reason: `response is not valid JSON: ${error.message}` } };
      }
      throw error;
    }
    const body = json;
    if (!isRecord(body)) return { ok: false, failure: { kind: "malformed", reason: "response is not an object" } };
    if (!modelAccepted(body.model, endpoint)) {
      return { ok: false, failure: { kind: "malformed", reason: `model is not ${endpoint.model}` } };
    }

    const answers = isRecord(body.answers) ? body.answers : undefined;
    const answer = answers?.[question.id];
    if (!isRecord(answer)) return { ok: false, failure: { kind: "malformed", reason: "answer missing" } };
    if (answer.type !== "choice") return { ok: false, failure: { kind: "malformed", reason: "answer is not a choice" } };
    const choice = answer.choice;
    if (typeof choice !== "string" || !Object.hasOwn(question.criteria, choice)) {
      return { ok: false, failure: { kind: "malformed", reason: "choice outside the option set" } };
    }
    return { ok: true, choice };
  } catch {
    if (timedOut) return { ok: false, failure: { kind: "timeout" } };
    if (signal.aborted) return { ok: false, failure: { kind: "aborted" } };
    return { ok: false, failure: { kind: "network" } };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

export function describeFailure(failure: JevFailure): string {
  switch (failure.kind) {
    case "http":
      return `HTTP ${failure.status}`;
    case "malformed":
      return `malformed response: ${failure.reason}`;
    default:
      return failure.kind;
  }
}
