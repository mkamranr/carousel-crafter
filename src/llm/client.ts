/**
 * An OpenAI-compatible chat client.
 *
 * Deliberately not an SDK. The `/v1/chat/completions` contract is the one thing Ollama,
 * vLLM, OpenRouter and the hosted APIs all agree on, and the slice of it used here — messages
 * in, streamed deltas out — is small enough that a dependency would cost more than it saves
 * and would drag in a vendor's own auth assumptions.
 *
 * The key is optional because a local runtime does not want one, and sending an empty
 * `Authorization` header to Ollama is worse than sending none.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  baseUrl: string;
  model: string;
  apiKey?: string | undefined;
  temperature?: number | undefined;
  messages: ChatMessage[];
  signal?: AbortSignal | undefined;
}

export class LlmError extends Error {}

const trimSlash = (url: string): string => url.replace(/\/+$/, '');

function headers(apiKey?: string): Record<string, string> {
  const base: Record<string, string> = { 'content-type': 'application/json' };
  // Only when there is one. An empty bearer token is rejected by some gateways that would
  // happily have served an unauthenticated request.
  if (apiKey && apiKey.trim() !== '') base.authorization = `Bearer ${apiKey.trim()}`;
  return base;
}

/**
 * Turn an upstream error into something a person can act on.
 *
 * The body usually says what is actually wrong — a bad model name, an expired key, a model
 * that is not pulled yet — and losing it behind "500" is the difference between a fix and a
 * guess.
 */
async function describeFailure(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  let detail = text.slice(0, 400);
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      const error = (parsed as { error: unknown }).error;
      detail =
        typeof error === 'string' ? error : ((error as { message?: string })?.message ?? detail);
    }
  } catch {
    // Not JSON. The raw text is still the best clue available.
  }
  return `${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`;
}

/**
 * Stream a completion, yielding text deltas as they arrive.
 *
 * Streamed rather than awaited because a local model on a laptop can take a minute to write
 * a carousel, and a minute of nothing is indistinguishable from a hang.
 */
export async function* streamChat(request: ChatRequest): AsyncGenerator<string> {
  const { baseUrl, model, apiKey, temperature, messages, signal } = request;
  if (!baseUrl?.trim()) throw new LlmError('No base URL configured. Set one in Settings.');
  if (!model?.trim()) throw new LlmError('No model configured. Set one in Settings.');

  let response: Response;
  try {
    response = await fetch(`${trimSlash(baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: headers(apiKey),
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        ...(temperature === undefined ? {} : { temperature }),
      }),
      signal: signal ?? null,
    });
  } catch (error) {
    // A refused connection here is nearly always a local runtime that is not running, which
    // is worth saying rather than surfacing a bare fetch failure.
    throw new LlmError(
      `Could not reach ${baseUrl}: ${(error as Error).message}. ` +
        `If this is a local model, check the server is running.`,
    );
  }

  if (!response.ok) throw new LlmError(await describeFailure(response));
  if (!response.body) throw new LlmError('The endpoint returned no response body.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line, and a chunk can split one anywhere — so only
    // whole frames are consumed and the remainder stays buffered.
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '' || payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // A frame that is not JSON is not fatal; some gateways interleave keep-alives.
        }
      }
    }
  }
}

/** The models an endpoint reports, so the editor can offer a list rather than a text box. */
export async function listModels(baseUrl: string, apiKey?: string): Promise<string[]> {
  if (!baseUrl?.trim()) return [];
  let response: Response;
  try {
    response = await fetch(`${trimSlash(baseUrl)}/models`, { headers: headers(apiKey) });
  } catch (error) {
    throw new LlmError(`Could not reach ${baseUrl}: ${(error as Error).message}`);
  }
  if (!response.ok) throw new LlmError(await describeFailure(response));

  const body = (await response.json()) as { data?: { id?: string }[] };
  return (body.data ?? [])
    .map((entry) => entry.id)
    .filter((id): id is string => typeof id === 'string')
    .sort();
}
