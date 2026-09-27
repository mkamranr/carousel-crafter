import { afterEach, describe, expect, it, vi } from 'vitest';
import { listModels, LlmError, streamChat } from '../../src/llm/client.js';

/** A Response whose body streams the given chunks, exactly as split. */
function streaming(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status, statusText: status === 200 ? 'OK' : 'Error' });
}

const frame = (content: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

const collect = async (chunks: string[]): Promise<string> => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streaming(chunks)));
  let text = '';
  for await (const delta of streamChat({
    baseUrl: 'http://x/v1',
    model: 'm',
    messages: [{ role: 'user', content: 'hi' }],
  })) {
    text += delta;
  }
  return text;
};

afterEach(() => vi.unstubAllGlobals());

describe('streamChat', () => {
  it('yields the deltas of whole frames', async () => {
    expect(await collect([frame('Hello'), frame(' world')])).toBe('Hello world');
  });

  it('reassembles a frame split across chunk boundaries', async () => {
    // The network splits wherever it likes; a frame cut mid-JSON must not be dropped.
    const whole = frame('Hello') + frame(' world');
    const cut = Math.floor(whole.length / 2);
    expect(await collect([whole.slice(0, cut), whole.slice(cut)])).toBe('Hello world');
  });

  it('ignores the [DONE] sentinel', async () => {
    expect(await collect([frame('a'), 'data: [DONE]\n\n'])).toBe('a');
  });

  it('survives a keep-alive frame that is not JSON', async () => {
    expect(await collect([': ping\n\n', frame('a')])).toBe('a');
  });

  it('skips frames carrying no content delta', async () => {
    const empty = `data: ${JSON.stringify({ choices: [{ delta: {} }] })}\n\n`;
    expect(await collect([empty, frame('a')])).toBe('a');
  });

  it('sends no Authorization header when there is no key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streaming([frame('a')]));
    vi.stubGlobal('fetch', fetchMock);
    for await (const chunk of streamChat({ baseUrl: 'http://x/v1', model: 'm', messages: [] })) {
      void chunk; // drained deliberately; this test asserts on the request, not the output
    }
    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    // Ollama rejects an empty bearer token that it would have served unauthenticated.
    expect(headers.authorization).toBeUndefined();
  });

  it('sends a bearer token when a key is given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streaming([frame('a')]));
    vi.stubGlobal('fetch', fetchMock);
    for await (const chunk of streamChat({
      baseUrl: 'http://x/v1',
      model: 'm',
      apiKey: ' k ',
      messages: [],
    })) {
      void chunk; // drained deliberately; this test asserts on the request, not the output
    }
    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer k');
  });

  it('tolerates a trailing slash on the base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streaming([frame('a')]));
    vi.stubGlobal('fetch', fetchMock);
    for await (const chunk of streamChat({ baseUrl: 'http://x/v1//', model: 'm', messages: [] })) {
      void chunk; // drained deliberately; this test asserts on the request, not the output
    }
    expect(fetchMock.mock.calls[0]![0]).toBe('http://x/v1/chat/completions');
  });

  it('surfaces the upstream error message rather than the status alone', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { message: 'model not found' } }), { status: 404 }),
        ),
    );
    const run = async () => {
      for await (const chunk of streamChat({
        baseUrl: 'http://x/v1',
        model: 'nope',
        messages: [],
      })) {
        void chunk; // drained deliberately; this test asserts on the request, not the output
      }
    };
    await expect(run()).rejects.toThrow(/model not found/);
  });

  it('explains a refused connection as a server that may not be running', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const run = async () => {
      for await (const chunk of streamChat({ baseUrl: 'http://x/v1', model: 'm', messages: [] })) {
        void chunk; // drained deliberately; this test asserts on the request, not the output
      }
    };
    await expect(run()).rejects.toThrow(/check the server is running/);
  });

  it('refuses to start without a model', async () => {
    const run = async () => {
      for await (const chunk of streamChat({ baseUrl: 'http://x/v1', model: '', messages: [] })) {
        void chunk; // drained deliberately; this test asserts on the request, not the output
      }
    };
    await expect(run()).rejects.toThrow(LlmError);
  });
});

describe('listModels', () => {
  it('returns sorted ids', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: 'zeta' }, { id: 'alpha' }] }), {
          status: 200,
        }),
      ),
    );
    expect(await listModels('http://x/v1')).toEqual(['alpha', 'zeta']);
  });

  it('returns nothing for an endpoint with no base URL', async () => {
    expect(await listModels('')).toEqual([]);
  });
});
