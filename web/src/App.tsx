import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createPost,
  downloadExport,
  exportPost,
  fetchFontCss,
  listPosts,
  readConfig,
  readPost,
  savePost,
  readCaption,
  streamCaption,
  streamGenerate,
  writeConfig,
} from './api.js';
import { Backgrounds, type BackgroundScope } from './components/Backgrounds.js';
import { Caption } from './components/Caption.js';
import { Editor } from './components/Editor.js';
import { Generate } from './components/Generate.js';
import { Preview } from './components/Preview.js';
import { Settings, toConfig, toForm, type SettingsValue } from './components/Settings.js';
import { Toolbar } from './components/Toolbar.js';
import { setFrontmatter, splitFrontmatter } from '../../src/parse/frontmatter.js';
import { renderPreview, type PreviewResult } from './preview.js';

const CANVAS = { width: 1080, height: 1350 };
/** Long enough that typing a sentence does not queue a render per keystroke. */
const DEBOUNCE_MS = 300;

export function App() {
  const [posts, setPosts] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [source, setSource] = useState('');
  const [saved, setSaved] = useState('');
  const [fontCss, setFontCss] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  // Which post the current preview actually describes. Without this, "5 slides" in the
  // toolbar is ambiguous while a newly selected post is still rendering — it could be the
  // outgoing one. The footer publishes it so that state is observable rather than guessed.
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showBackgrounds, setShowBackgrounds] = useState(false);
  const [showCaption, setShowCaption] = useState(false);
  const [caption, setCaption] = useState('');
  const [captioning, setCaptioning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const generation = useRef<AbortController | null>(null);

  // Hidden: this frame exists to be measured, not seen. The visible one shows the settled
  // layout once the fit loop has finished, so the reader never watches it converge.
  const measuringFrame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [names, css, stored] = await Promise.all([listPosts(), fetchFontCss(), readConfig()]);
        setPosts(names);
        setFontCss(css);
        setConfig(stored.config);
        if (names[0]) setCurrent(names[0]);
      } catch (error) {
        setStatus((error as Error).message);
      }
    })();
  }, []);

  useEffect(() => {
    if (!current) return;
    void (async () => {
      try {
        const post = await readPost(current);
        setPreviewFor(null);
        setCaption((await readCaption(current).catch(() => ({ caption: '' }))).caption);
        setSource(post.source);
        setSaved(post.source);
        setStatus(null);
      } catch (error) {
        setStatus((error as Error).message);
      }
    })();
  }, [current]);

  // Re-renders through the same pipeline the exporter uses, debounced.
  useEffect(() => {
    const frame = measuringFrame.current;
    if (!frame || fontCss === null || source === '') return;

    let cancelled = false;
    const rendering = current;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await renderPreview(source, frame, { fontCss, file: config });
          if (cancelled) return;
          setPreview(result);
          setPreviewFor(rendering);
          setStatus(
            result.unfittable.length > 0
              ? `${result.unfittable.length} slide(s) cannot be made to fit — shorten them.`
              : null,
          );
        } catch (error) {
          if (!cancelled) setStatus((error as Error).message);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `config` is a dependency so saving settings re-renders the preview immediately — the
    // accent and handle live there, and seeing them change is the point of the panel.
  }, [source, fontCss, current, config]);

  const handleSave = useCallback(async () => {
    if (!current) return;
    try {
      await savePost(current, source);
      setSaved(source);
      setStatus('Saved.');
    } catch (error) {
      setStatus((error as Error).message);
    }
  }, [current, source]);

  const handleSaveSettings = useCallback(async (value: SettingsValue) => {
    setSavingSettings(true);
    try {
      const saved = await writeConfig(toConfig(value));
      setConfig(saved.config);
      setStatus('Settings saved.');
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setSavingSettings(false);
    }
  }, []);

  /**
   * Record a chosen background in the post's own frontmatter.
   *
   * Per-post rather than project-wide: a cover photo belongs to the deck it was chosen for.
   * Left unsaved on purpose, so the preview updates and the change is still yours to reject.
   */
  const setBackground = useCallback((file: string | null, credit: string | null) => {
    setSource((current) => setFrontmatter(current, { background: file, backgroundCredit: credit }));
  }, []);

  const handleNewPost = useCallback(async () => {
    try {
      const created = await createPost();
      setPosts(await listPosts());
      setCurrent(created.name);
      setStatus(`Created ${created.name}.`);
    } catch (error) {
      setStatus((error as Error).message);
    }
  }, []);

  const handleGenerate = useCallback(async (input: { topic: string; url: string }) => {
    generation.current?.abort();
    const controller = new AbortController();
    generation.current = controller;

    setGenerating(true);
    setStatus('Drafting…');
    // Cleared first so the draft is visibly replacing the post rather than appending to it.
    setSource('');

    try {
      await streamGenerate(input, (delta) => setSource((all) => all + delta), controller.signal);
      setStatus('Draft written. Review it before exporting.');
    } catch (error) {
      if (controller.signal.aborted) setStatus('Generation stopped.');
      else setStatus((error as Error).message);
    } finally {
      setGenerating(false);
      generation.current = null;
    }
  }, []);

  const handleCaption = useCallback(async () => {
    if (!current) return;
    setCaptioning(true);
    setCaption('');
    setStatus('Writing the caption…');
    try {
      await streamCaption(current, source, (delta) => setCaption((all) => all + delta));
      setStatus('Caption saved beside the post.');
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setCaptioning(false);
    }
  }, [current, source]);

  const handleExport = useCallback(async () => {
    if (!current) return;
    setBusy(true);
    try {
      const report = await exportPost(current, source);
      setSaved(source);
      // Downloaded as well as written to disk. The files on disk are what the CLI produces
      // and where a post's assets belong; the download is what the button implies.
      if (report.zip) downloadExport(current);
      setStatus(
        `${report.slideCount} slide(s) downloaded, and written to ${report.outDir}` +
          (report.caption ? ' with caption.txt' : '') +
          (report.warnings.length > 0 ? ` · ${report.warnings.join(' ')}` : ''),
      );
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [current, source]);

  // Read back from the source rather than held separately, so the editor stays the one place
  // the post is defined — hand-editing the frontmatter updates the panel too.
  let currentBackground: string | null = null;
  let backgroundScope: BackgroundScope = 'cover-cta';
  try {
    const data = splitFrontmatter(source).data;
    currentBackground = typeof data.background === 'string' ? data.background : null;
    if (data.backgroundOn === 'cover' || data.backgroundOn === 'all') {
      backgroundScope = data.backgroundOn;
    }
  } catch {
    // Frontmatter mid-edit is routinely unparseable; the panel simply shows nothing.
  }

  return (
    <div className="flex h-full flex-col bg-neutral-950 text-neutral-200">
      <Toolbar
        posts={posts}
        current={current}
        dirty={source !== saved}
        busy={busy}
        slideCount={preview?.slideCount ?? 0}
        onSelect={setCurrent}
        onSave={() => void handleSave()}
        onExport={() => void handleExport()}
        onToggleSettings={() => setShowSettings((open) => !open)}
        onToggleGenerate={() => setShowGenerate((open) => !open)}
        onToggleBackgrounds={() => setShowBackgrounds((open) => !open)}
        onToggleCaption={() => setShowCaption((open) => !open)}
        onNewPost={() => void handleNewPost()}
      />

      {showGenerate && (
        <Generate
          busy={generating}
          dirty={source !== saved}
          onGenerate={(topic) => void handleGenerate(topic)}
          onCancel={() => generation.current?.abort()}
          onClose={() => setShowGenerate(false)}
        />
      )}

      <div className="flex min-h-0 flex-1">
        <div className="grid min-w-0 flex-1 grid-cols-2 divide-x divide-neutral-800">
          <Editor value={source} onChange={setSource} onSave={() => void handleSave()} />
          <Preview html={preview?.html ?? ''} fits={preview?.fits ?? []} canvas={CANVAS} />
        </div>
        {showCaption && (
          <Caption
            caption={caption}
            busy={captioning}
            onGenerate={() => void handleCaption()}
            onClose={() => setShowCaption(false)}
          />
        )}
        {showBackgrounds && (
          <Backgrounds
            current={currentBackground}
            scope={backgroundScope}
            onChosen={(file, credit) => setBackground(file, credit)}
            onScope={(next) =>
              setSource((current) =>
                // The default is the absence of the key, so choosing it removes the line
                // rather than writing a value that means "as if unset".
                setFrontmatter(current, { backgroundOn: next === 'cover-cta' ? null : next }),
              )
            }
            onClear={() => setBackground(null, null)}
            onClose={() => setShowBackgrounds(false)}
          />
        )}
        {showSettings && (
          <Settings
            value={toForm(config)}
            saving={savingSettings}
            onSave={(value) => void handleSaveSettings(value)}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>

      <footer
        data-preview-for={previewFor ?? ''}
        className="border-t border-neutral-800 px-4 py-1.5 text-xs text-neutral-500"
      >
        {status ?? (preview ? `fitted in ${preview.passes} pass(es)` : 'loading…')}
      </footer>

      {/*
        Off-screen, NOT `display: none`. A hidden iframe has no layout at all, so every
        measurement comes back zero, the fit loop "converges" immediately, and the preview
        happily shows an overflowing slide that the exporter would have split. It also needs
        the real canvas width, or the text wraps at the wrong measure and the numbers describe
        a slide nobody will ever see.
      */}
      <iframe
        title="measuring"
        ref={measuringFrame}
        aria-hidden="true"
        tabIndex={-1}
        style={{
          position: 'fixed',
          left: -20000,
          top: 0,
          width: CANVAS.width,
          height: CANVAS.height,
          border: 0,
          visibility: 'hidden',
        }}
      />
    </div>
  );
}
