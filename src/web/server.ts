/**
 * The local web server.
 *
 * Serves the editor UI, the markdown files in a folder you nominate, and the images beside
 * them — then runs the real `build()` pipeline on export. There is no auth and no upload
 * path because there is no remote: it reads and writes your own filesystem, which is exactly
 * what makes relative image paths resolve the same way they do on the command line.
 */

import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { build } from '../build.js';
import { parseConfigFile } from '../config/resolve.js';
import { DEFAULT_BASE_URL, type LlmConfig } from '../config/schema.js';
import { downloadPhoto, ImageSearchError, photoFilename, searchPhotos } from '../images/pexels.js';
import { listModels, LlmError, streamChat } from '../llm/client.js';
import { captionMessages, draftingMessages, sourceMessages } from '../llm/prompt.js';
import { fetchSource, isSupported, SourceError } from '../sources/index.js';
import { fontFaceCss } from '../render/fonts.js';

export interface WebServerOptions {
  /** Directory holding the markdown posts and their images. */
  root: string;
  port: number;
  /** The built frontend, served at `/`. Absent in tests. */
  clientDir?: string | undefined;
}

/**
 * Reject anything that escapes the served root.
 *
 * The server is local, but "local" is not "safe": the browser sends these names, and a
 * request for `../../.ssh/id_rsa` would otherwise be honoured. Resolving and then checking
 * containment is the check that actually holds, rather than screening for `..` by hand.
 */
function within(root: string, requested: string): string {
  const full = resolve(root, requested);
  const bounded = full === root || full.startsWith(root + sep);
  if (!bounded) throw new Error('Path escapes the served directory.');
  return full;
}

const isMarkdown = (name: string): boolean => extname(name).toLowerCase() === '.md';

/**
 * Settings live beside the posts they apply to, as an ordinary config file.
 *
 * Same file the CLI reads with `-c`, so the editor and the command line cannot end up with
 * different ideas about your handle or your accent colour.
 */
const CONFIG_NAME = 'carousel.config.json';

/**
 * Where the API key comes from.
 *
 * The environment wins over the config file, so a key can be supplied without ever writing
 * it to disk — `OPENAI_API_KEY=... carousel-crafter web ./posts`. The config file remains
 * available because typing a key into the panel is the path most people will take, and the
 * panel says plainly where it lands.
 */
function resolveKey(llm: LlmConfig | undefined): string | undefined {
  const fromEnv = process.env.OPENAI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const fromFile = llm?.apiKey?.trim();
  return fromFile === '' ? undefined : fromFile;
}

export async function createServer(options: WebServerOptions): Promise<FastifyInstance> {
  const root = resolve(options.root);
  const app = Fastify({ logger: false });

  await app.register(fastifyStatic, {
    root,
    // Not '/assets/': Vite emits the built app's own bundles there, and the two would
    // collide — the app's JavaScript would be looked up in the posts folder and 404.
    prefix: '/files/',
    // Only the images a post references; the markdown itself goes through the API so it is
    // never served as a downloadable file by accident.
    index: false,
  });

  if (options.clientDir) {
    await app.register(fastifyStatic, {
      root: options.clientDir,
      prefix: '/',
      decorateReply: false,
    });
  }

  app.get('/api/posts', async () => {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && isMarkdown(entry.name))
      .map((entry) => entry.name)
      .sort();
  });

  /**
   * Create an empty post.
   *
   * Exists so drafting has somewhere safe to land. Without it the only place a generated
   * draft can go is over the post currently open, and one Save later the original is gone.
   * The name is derived rather than asked for; renaming a file is something the filesystem
   * already does well.
   */
  app.post('/api/posts', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const taken = new Set(await readdir(root));

    let name = `draft-${today}.md`;
    for (let n = 2; taken.has(name); n += 1) name = `draft-${today}-${n}.md`;

    await writeFile(within(root, name), '', 'utf8');
    return { name };
  });

  app.get<{ Params: { name: string } }>('/api/posts/:name', async (request, reply) => {
    const name = basename(request.params.name);
    if (!isMarkdown(name)) return reply.code(400).send({ error: 'Not a markdown file.' });
    try {
      return { name, source: await readFile(within(root, name), 'utf8') };
    } catch {
      return reply.code(404).send({ error: `No such post: ${name}` });
    }
  });

  app.put<{ Params: { name: string }; Body: { source: string } }>(
    '/api/posts/:name',
    async (request, reply) => {
      const name = basename(request.params.name);
      if (!isMarkdown(name)) return reply.code(400).send({ error: 'Not a markdown file.' });
      if (typeof request.body?.source !== 'string') {
        return reply.code(400).send({ error: 'Body must be { source: string }.' });
      }
      await writeFile(within(root, name), request.body.source, 'utf8');
      return { name, saved: true };
    },
  );

  // Fetched once by the preview and cached there. ~118KB of base64, and identical to what
  // the exporter inlines — the preview must use the same faces or it measures the wrong
  // metrics and disagrees with the export about what fits.
  app.get('/api/font-css', async (_request, reply) => {
    reply.header('cache-control', 'public, max-age=31536000, immutable');
    reply.type('text/css');
    return fontFaceCss();
  });

  app.get('/api/config', async () => {
    try {
      const raw: unknown = JSON.parse(await readFile(join(root, CONFIG_NAME), 'utf8'));
      return { config: parseConfigFile(raw), path: join(root, CONFIG_NAME) };
    } catch {
      // No file yet, or an unreadable one. An empty config is the honest answer — the editor
      // shows blank fields and writing them creates the file.
      return { config: {}, path: join(root, CONFIG_NAME) };
    }
  });

  app.put<{ Body: unknown }>('/api/config', async (request) => {
    // Validated before it touches disk: a typo like `acent` should be refused here rather
    // than silently ignored on the next render.
    const config = parseConfigFile(request.body);
    await writeFile(join(root, CONFIG_NAME), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    return { config, saved: true };
  });

  app.post<{ Body: { name?: string; source?: string; zip?: boolean } }>(
    '/api/export',
    async (request, reply) => {
      const name = basename(request.body?.name ?? '');
      if (!isMarkdown(name)) return reply.code(400).send({ error: 'Not a markdown file.' });

      // Written to disk first when the editor has unsaved changes, so the export renders
      // what is on screen and image paths still resolve relative to the post.
      const path = within(root, name);
      if (typeof request.body?.source === 'string') {
        await writeFile(path, request.body.source, 'utf8');
      }

      const outDir = join(root, '.carousel-crafter', name.replace(/\.md$/i, ''));
      const configPath = join(root, CONFIG_NAME);
      const report = await build({
        input: path,
        out: outDir,
        zip: true,
        configPath: existsSync(configPath) ? configPath : undefined,
      });

      // Copied next to the PNGs: at posting time the caption and the images are wanted in
      // the same place, and hunting for it back in the posts folder is friction.
      let caption = false;
      try {
        const text = await readFile(within(root, captionNameFor(name)), 'utf8');
        await writeFile(join(outDir, 'caption.txt'), text, 'utf8');
        caption = true;
      } catch {
        // No caption written for this post yet. Not a reason to fail the export.
      }

      return {
        slideCount: report.slideCount,
        passes: report.passes,
        warnings: report.warnings,
        outDir,
        files: report.files,
        zip: report.zip,
        caption,
      };
    },
  );

  /** The stored LLM settings, with the environment's key folded in. */
  async function llmSettings(): Promise<{ llm: LlmConfig; apiKey: string | undefined }> {
    try {
      const raw: unknown = JSON.parse(await readFile(join(root, CONFIG_NAME), 'utf8'));
      const llm = parseConfigFile(raw).llm ?? {};
      return { llm, apiKey: resolveKey(llm) };
    } catch {
      return { llm: {}, apiKey: resolveKey(undefined) };
    }
  }

  app.get('/api/llm/models', async (_request, reply) => {
    const { llm, apiKey } = await llmSettings();
    try {
      return { models: await listModels(llm.baseUrl ?? DEFAULT_BASE_URL, apiKey) };
    } catch (error) {
      // A listing failure is informational, not fatal — plenty of endpoints do not expose
      // /v1/models, and generation may still work with a model name typed by hand.
      reply.code(200);
      return { models: [], error: (error as Error).message };
    }
  });

  /** What a link contains, without drafting from it — the editor previews this first. */
  app.get<{ Querystring: { url?: string } }>('/api/source', async (request, reply) => {
    const url = request.query.url?.trim();
    if (!url) return reply.code(400).send({ error: 'Give a link to read.' });
    try {
      const source = await fetchSource(url);
      // The body is megabytes of README nobody needs in the editor; the facts are the part
      // worth showing before committing to a draft.
      return { kind: source.kind, title: source.title, url: source.url, facts: source.facts };
    } catch (error) {
      const message = error instanceof SourceError ? error.message : String(error);
      return reply.code(400).send({ error: message });
    }
  });

  app.post<{ Body: { topic?: string; url?: string } }>('/api/generate', async (request, reply) => {
    const topic = request.body?.topic?.trim() ?? '';
    const url = request.body?.url?.trim() ?? '';
    if (!topic && !url) return reply.code(400).send({ error: 'Give the post a topic or a link.' });
    if (url && !isSupported(url)) {
      return reply.code(400).send({
        error: 'Only GitHub repositories and Hugging Face models or datasets can be read.',
      });
    }

    // Fetched before the stream opens, so a bad link is still a clean 400 rather than an
    // error written into the middle of a draft.
    let messages;
    try {
      messages = url ? sourceMessages(await fetchSource(url), topic) : draftingMessages(topic);
    } catch (error) {
      const message = error instanceof SourceError ? error.message : String(error);
      return reply.code(400).send({ error: message });
    }

    const { llm, apiKey } = await llmSettings();

    // Streamed as plain text rather than re-emitted as SSE: the client only needs the deltas,
    // and re-framing them would mean parsing the same envelope twice.
    reply.raw.writeHead(200, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    });

    try {
      for await (const delta of streamChat({
        baseUrl: llm.baseUrl ?? DEFAULT_BASE_URL,
        model: llm.model ?? '',
        apiKey,
        temperature: llm.temperature,
        messages,
      })) {
        reply.raw.write(delta);
      }
    } catch (error) {
      // The headers are already sent, so the only honest place left for an error is the body.
      // The client watches for this marker and shows what follows rather than treating a
      // truncated draft as a finished one.
      const message = error instanceof LlmError ? error.message : String(error);
      reply.raw.write(`\n\n[[carousel-crafter:error]] ${message}`);
    } finally {
      reply.raw.end();
    }

    return reply;
  });

  /** The Pexels key, environment first, for the same reason as the model key. */
  async function pexelsKey(): Promise<string> {
    const fromEnv = process.env.PEXELS_API_KEY?.trim();
    if (fromEnv) return fromEnv;
    try {
      const raw: unknown = JSON.parse(await readFile(join(root, CONFIG_NAME), 'utf8'));
      return parseConfigFile(raw).images?.pexelsApiKey?.trim() ?? '';
    } catch {
      return '';
    }
  }

  app.get<{ Querystring: { q?: string } }>('/api/images/search', async (request, reply) => {
    const query = request.query.q?.trim();
    if (!query) return reply.code(400).send({ error: 'Give the search a term.' });
    try {
      return { photos: await searchPhotos(query, await pexelsKey()) };
    } catch (error) {
      const message = error instanceof ImageSearchError ? error.message : String(error);
      return reply.code(400).send({ error: message });
    }
  });

  app.post<{ Body: { url?: string; id?: number; query?: string; credit?: string } }>(
    '/api/images/download',
    async (request, reply) => {
      const { url, id, query, credit } = request.body ?? {};
      if (!url || typeof id !== 'number') {
        return reply.code(400).send({ error: 'Pick a photo first.' });
      }

      // Downloaded into the posts folder so it becomes an ordinary local file — by render
      // time nothing is fetched, which is what keeps exports offline and reproducible.
      const name = photoFilename(query ?? 'photo', id, url);
      try {
        const bytes = await downloadPhoto(url, within(root, name));
        return { name, bytes, credit: credit ?? null };
      } catch (error) {
        const message = error instanceof ImageSearchError ? error.message : String(error);
        return reply.code(400).send({ error: message });
      }
    },
  );

  /** The caption file that belongs to a post. */
  const captionNameFor = (post: string) => `${post.replace(/\.md$/i, '')}.caption.txt`;

  app.get<{ Params: { name: string } }>('/api/caption/:name', async (request, reply) => {
    const name = basename(request.params.name);
    if (!isMarkdown(name)) return reply.code(400).send({ error: 'Not a markdown file.' });
    try {
      return { caption: await readFile(within(root, captionNameFor(name)), 'utf8') };
    } catch {
      return { caption: '' };
    }
  });

  /**
   * Draft a caption from the post's own markdown, and save it beside the post.
   *
   * A plain .txt file rather than frontmatter: a caption is prose with line breaks and a row
   * of hashtags, which YAML would make awkward to read and awkward to copy. Living next to
   * the post means the export can carry it into the output folder with the images.
   */
  app.post<{ Body: { name?: string; source?: string } }>('/api/caption', async (request, reply) => {
    const name = basename(request.body?.name ?? '');
    const markdown = request.body?.source ?? '';
    if (!isMarkdown(name)) return reply.code(400).send({ error: 'Not a markdown file.' });
    if (markdown.trim() === '') {
      return reply.code(400).send({ error: 'Write the post before captioning it.' });
    }

    const { llm, apiKey } = await llmSettings();
    reply.raw.writeHead(200, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-accel-buffering': 'no',
    });

    let caption = '';
    try {
      for await (const delta of streamChat({
        baseUrl: llm.baseUrl ?? DEFAULT_BASE_URL,
        model: llm.model ?? '',
        apiKey,
        temperature: llm.temperature,
        messages: captionMessages(markdown),
      })) {
        caption += delta;
        reply.raw.write(delta);
      }
      // Written only on a clean finish; half a caption saved over a good one is worse than
      // none, and the editor still shows what streamed.
      await writeFile(within(root, captionNameFor(name)), caption.trim(), 'utf8');
    } catch (error) {
      const message = error instanceof LlmError ? error.message : String(error);
      reply.raw.write(`\n\n[[carousel-crafter:error]] ${message}`);
    } finally {
      reply.raw.end();
    }

    return reply;
  });

  /**
   * Hand the finished ZIP to the browser.
   *
   * Export writes to disk because that is where the CLI puts things and where a post's
   * assets belong, but a button labelled "Export PNGs" that produces no file is a button
   * that appears not to work. The archive is served as an attachment so the browser saves it
   * rather than navigating to it.
   */
  app.get<{ Params: { name: string } }>('/api/export/:name/zip', async (request, reply) => {
    const name = basename(request.params.name);
    if (!isMarkdown(name)) return reply.code(400).send({ error: 'Not a markdown file.' });

    const stem = name.replace(/\.md$/i, '');
    const zipPath = join(root, '.carousel-crafter', stem, 'carousel.zip');

    let bytes: Buffer;
    try {
      bytes = await readFile(zipPath);
    } catch {
      return reply.code(404).send({ error: 'Nothing exported for this post yet.' });
    }

    return (
      reply
        .header('content-type', 'application/zip')
        // Named after the post, because ten files called carousel.zip in a downloads folder
        // are indistinguishable a week later.
        .header('content-disposition', `attachment; filename="${stem}.zip"`)
        .send(bytes)
    );
  });

  app.setErrorHandler((error: unknown, _request, reply) => {
    // Surfaced rather than swallowed: a path-escape rejection or an unreadable image should
    // reach the editor as a message, not a blank 500.
    reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
  });

  return app;
}

/**
 * Loopback by default, overridable for containers.
 *
 * Loopback inside a container is unreachable from the host, so the image sets
 * CAROUSEL_CRAFTER_HOST=0.0.0.0. That is safe only because the port is published to
 * 127.0.0.1 — this server has no authentication and serves the filesystem it is pointed at,
 * so it must never be reachable from a network.
 */
function bindHost(): string {
  return process.env.CAROUSEL_CRAFTER_HOST?.trim() || '127.0.0.1';
}

export async function startServer(options: WebServerOptions): Promise<string> {
  const app = await createServer(options);
  const host = bindHost();
  await app.listen({ port: options.port, host });
  // Always printed as loopback: 0.0.0.0 is a bind address, not somewhere you can click.
  return `http://127.0.0.1:${options.port}`;
}
