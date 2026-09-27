/**
 * Generation, end to end, against a stub OpenAI-compatible endpoint.
 *
 * A stub rather than a real model: the point is the contract — SSE in, plain text out, the
 * key in the right place, failures reaching the editor — not what any particular model says.
 */

import { createServer as createHttpServer, type Server } from 'node:http';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../../src/web/server.js';

const SOURCE_FIXTURES = fileURLToPath(new URL('../fixtures', import.meta.url));

/** A throwaway copy — see the note in web.test.ts. This suite writes a config file. */
let FIXTURES = '';
let CONFIG = '';
/** Ephemeral, not fixed: a hardcoded port turns "something else is running" into a test
 *  failure that looks like a code defect. Both are read back after listen. */
let appPort = 0;
let stubPort = 0;

let app: FastifyInstance;
let stub: Server;
/** What the stub last received, so the request itself can be asserted. */
let lastRequest: { auth: string | undefined; body: string } = { auth: undefined, body: '' };
let mode: 'ok' | 'fail' = 'ok';

const sse = (content: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

beforeAll(async () => {
  stub = createHttpServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      lastRequest = {
        auth: request.headers.authorization,
        body: Buffer.concat(chunks).toString(),
      };

      if (request.url === '/v1/models') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ data: [{ id: 'zeta' }, { id: 'alpha' }] }));
        return;
      }

      if (mode === 'fail') {
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'model not found' } }));
        return;
      }

      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write(sse('# Hook\n'));
      response.write(sse('\n---\n\n## Point\n'));
      response.end('data: [DONE]\n\n');
    });
  });
  await new Promise<void>((done) => stub.listen(0, '127.0.0.1', done));
  stubPort = (stub.address() as { port: number }).port;

  FIXTURES = await mkdtemp(join(tmpdir(), 'cc-llm-'));
  await cp(SOURCE_FIXTURES, FIXTURES, { recursive: true });
  CONFIG = join(FIXTURES, 'carousel.config.json');

  await writeFile(
    CONFIG,
    JSON.stringify({
      llm: { baseUrl: `http://127.0.0.1:${stubPort}/v1`, model: 'stub', apiKey: 'sk-test' },
    }),
  );

  app = await createServer({ root: FIXTURES, port: 0 });
  await app.listen({ port: 0, host: '127.0.0.1' });
  appPort = (app.server.address() as { port: number }).port;
}, 30_000);

afterAll(async () => {
  await app?.close();
  await new Promise<void>((done) => stub.close(() => done()));
  if (FIXTURES) await rm(FIXTURES, { recursive: true, force: true });
});

const generate = (topic: string) =>
  fetch(`http://127.0.0.1:${appPort}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic }),
  });

describe('generation', () => {
  it('streams the model output back as plain text', async () => {
    mode = 'ok';
    const text = await (await generate('server components')).text();
    expect(text).toBe('# Hook\n\n---\n\n## Point\n');
  });

  it('sends the configured key and the topic upstream', async () => {
    mode = 'ok';
    await (await generate('a very specific topic')).text();
    expect(lastRequest.auth).toBe('Bearer sk-test');
    expect(lastRequest.body).toContain('a very specific topic');
    // Streaming must be requested, or the client waits for a single blocking response.
    expect(JSON.parse(lastRequest.body).stream).toBe(true);
  });

  it('asks for a topic rather than generating from nothing', async () => {
    const response = await generate('   ');
    expect(response.status).toBe(400);
  });

  it('reports an upstream failure in the body, since headers are already sent', async () => {
    mode = 'fail';
    const text = await (await generate('anything')).text();
    // The client watches for this marker; without it a failed draft looks like a short one.
    expect(text).toContain('[[carousel-crafter:error]]');
    expect(text).toContain('model not found');
  });

  it('lets OPENAI_API_KEY override the key stored on disk', async () => {
    mode = 'ok';
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-from-env';
    try {
      await (await generate('anything')).text();
      // The whole point of the environment path: a key can be supplied without ever being
      // written into the posts folder, and it must win over one that was.
      expect(lastRequest.auth).toBe('Bearer sk-from-env');
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  });

  it('proxies the endpoint model list', async () => {
    const body = (await (await fetch(`http://127.0.0.1:${appPort}/api/llm/models`)).json()) as {
      models: string[];
    };
    expect(body.models).toEqual(['alpha', 'zeta']);
  });
});
