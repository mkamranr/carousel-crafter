#!/usr/bin/env node
/**
 * Command wiring. No pipeline logic lives here — see `build.ts`.
 *
 * Exit codes: 0 success, 1 the deck was produced but is not postable as-is (a slide could
 * not be made to fit, or there are more than 20), 2 the input could not be used at all.
 * The distinction matters to a script: 1 means "look at the PNGs", 2 means "fix the file".
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { build, BuildInputError, MAX_SLIDES } from './build.js';
import { closeBrowser } from './capture/browser.js';
import { startServer } from './web/server.js';

const EXIT_NOT_POSTABLE = 1;
const EXIT_BAD_INPUT = 2;

interface BuildFlags {
  out: string;
  zip?: boolean;
  scale?: string;
  config?: string;
  open?: boolean;
  quiet?: boolean;
  handle?: string;
}

const program = new Command();

program
  .name('carousel-crafter')
  .description('Turn a Markdown file into a set of Instagram carousel PNGs.')
  .version('0.1.0');

program
  .command('build', { isDefault: true })
  .argument('<input>', 'markdown file to render')
  .option('-o, --out <dir>', 'output directory', './out')
  .option('--zip', 'also write carousel.zip')
  .option('--scale <n>', 'device scale factor (2 gives 2160x2700)')
  .option('-c, --config <path>', 'JSON config file')
  .option('--handle <handle>', 'account handle shown in the footer')
  .option('--open', 'open the output directory when done')
  .option('-q, --quiet', 'print warnings and errors only')
  .action(async (input: string, flags: BuildFlags) => {
    const scale = flags.scale === undefined ? undefined : Number(flags.scale);
    if (scale !== undefined && (!Number.isFinite(scale) || scale <= 0)) {
      fail(`--scale must be a positive number, got: ${flags.scale}`);
    }

    const out = resolve(flags.out);

    try {
      const report = await build({
        input,
        out,
        zip: flags.zip === true,
        configPath: flags.config,
        cli: { scale, handle: flags.handle },
      });

      if (!flags.quiet) {
        console.log(
          `${report.slideCount} slide(s) → ${out}` +
            (report.zip ? ` (+ ${report.zip})` : '') +
            ` in ${report.passes} pass(es)`,
        );
      }
      for (const warning of report.warnings) console.warn(`warning: ${warning}`);

      if (flags.open === true) openDirectory(out);

      const notPostable = report.unfittable.length > 0 || report.slideCount > MAX_SLIDES;
      process.exitCode = notPostable ? EXIT_NOT_POSTABLE : 0;
    } catch (error) {
      if (error instanceof BuildInputError) fail(error.message);
      throw error;
    } finally {
      await closeBrowser();
    }
  });

program
  .command('web')
  .description('open the live editor for a folder of markdown posts')
  .argument('[dir]', 'folder holding your .md posts and their images', '.')
  .option('-p, --port <n>', 'port to listen on', '5178')
  .option('--no-open', 'do not open a browser')
  .action(async (dir: string, flags: { port: string; open: boolean }) => {
    const root = resolve(dir);
    if (!existsSync(root)) fail(`No such directory: ${root}`);

    const port = Number(flags.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      fail(`--port must be a port number, got: ${flags.port}`);
    }

    // Resolved from this file, never the working directory: the CLI runs from wherever the
    // posts are, and the built UI lives next to the package.
    const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), '../web/dist');
    if (!existsSync(clientDir)) {
      fail('The web UI is not built. Run `npm run build:web` first.');
    }

    let url: string;
    try {
      url = await startServer({ root, port, clientDir });
    } catch (error) {
      // A raw EADDRINUSE stack is the least useful thing to print here, and when it scrolls
      // past in a log the previous server keeps answering — so the new code looks broken
      // while the old code is what you are actually talking to.
      if ((error as { code?: string }).code === 'EADDRINUSE') {
        fail(
          `Port ${port} is already in use — another Carousel-Crafter may still be running. ` +
            `Stop it, or start this one with a different --port.`,
        );
      }
      throw error;
    }

    console.log(`Carousel-Crafter → ${url}`);
    console.log(`Serving posts from ${root}`);
    if (flags.open) openUrl(url);
  });

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(EXIT_BAD_INPUT);
}

function openDirectory(dir: string): void {
  openUrl(dir);
}

function openUrl(target: string): void {
  // macOS only, which is where this runs. Detached so the CLI does not wait on Finder or a
  // browser launch.
  if (process.platform !== 'darwin') return;
  spawn('open', [target], { detached: true, stdio: 'ignore' }).unref();
}

await program.parseAsync(process.argv);
