/**
 * The caption panel.
 *
 * Kept beside the post as a plain `.txt` rather than in frontmatter: a caption is prose with
 * line breaks and a row of hashtags, which YAML would make awkward to read and awkward to
 * copy out. Export carries it into the output folder with the images.
 */

import { useEffect, useState } from 'react';

interface CaptionProps {
  caption: string;
  busy: boolean;
  onGenerate: () => void;
  onClose: () => void;
}

export function Caption({ caption, busy, onGenerate, onClose }: CaptionProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the text is selectable either way.
    }
  };

  const words = caption.split(/\s+/).filter((word) => word !== '' && !word.startsWith('#')).length;

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 border-l border-neutral-800 bg-neutral-950 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-100">Caption</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 text-neutral-500 hover:text-neutral-200"
        >
          ✕
        </button>
      </div>

      <textarea
        readOnly
        value={caption}
        placeholder="Generate a caption from the post you have written."
        className="min-h-0 flex-1 resize-none rounded border border-neutral-800 bg-neutral-900 p-2 text-sm leading-relaxed text-neutral-200 placeholder:text-neutral-600"
      />

      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>{caption ? `${words} words` : ''}</span>
        {caption && (
          <button type="button" onClick={() => void copy()} className="hover:text-neutral-200">
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={onGenerate}
        className="rounded-md bg-amber-400 px-3 py-1.5 text-sm font-medium text-neutral-950 hover:bg-amber-300 disabled:opacity-40"
      >
        {busy ? 'Writing…' : caption ? 'Rewrite caption' : 'Write caption'}
      </button>

      <p className="text-xs leading-relaxed text-neutral-500">
        Saved beside the post and copied into the export folder as caption.txt.
      </p>
    </aside>
  );
}
