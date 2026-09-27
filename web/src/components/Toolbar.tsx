interface ToolbarProps {
  posts: string[];
  current: string | null;
  dirty: boolean;
  busy: boolean;
  slideCount: number;
  onSelect: (name: string) => void;
  onSave: () => void;
  onExport: () => void;
  onToggleSettings: () => void;
  onToggleGenerate: () => void;
  onNewPost: () => void;
  onToggleBackgrounds: () => void;
  onToggleCaption: () => void;
}

export function Toolbar({
  posts,
  current,
  dirty,
  busy,
  slideCount,
  onSelect,
  onSave,
  onExport,
  onToggleSettings,
  onToggleGenerate,
  onNewPost,
  onToggleBackgrounds,
  onToggleCaption,
}: ToolbarProps) {
  return (
    <header className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-950 px-4 py-2.5">
      <span className="text-sm font-semibold tracking-tight text-neutral-100">
        Carousel-Crafter
      </span>

      <select
        value={current ?? ''}
        onChange={(event) => onSelect(event.target.value)}
        className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-200"
      >
        {posts.length === 0 && <option value="">no .md files found</option>}
        {posts.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={onNewPost}
        className="rounded-md border border-neutral-700 px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-800"
        title="Create an empty post"
      >
        New
      </button>

      <span className="text-xs text-neutral-500">
        {slideCount > 0 ? `${slideCount} slide${slideCount === 1 ? '' : 's'}` : ''}
        {dirty ? ' · unsaved' : ''}
      </span>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleGenerate}
          className="rounded-md border border-neutral-700 px-3 py-1 text-sm text-neutral-200 hover:bg-neutral-800"
        >
          Draft with AI
        </button>
        <button
          type="button"
          onClick={onToggleCaption}
          className="rounded-md border border-neutral-700 px-3 py-1 text-sm text-neutral-200 hover:bg-neutral-800"
        >
          Caption
        </button>
        <button
          type="button"
          onClick={onToggleBackgrounds}
          className="rounded-md border border-neutral-700 px-3 py-1 text-sm text-neutral-200 hover:bg-neutral-800"
        >
          Background
        </button>
        <button
          type="button"
          onClick={onToggleSettings}
          className="rounded-md border border-neutral-700 px-3 py-1 text-sm text-neutral-200 hover:bg-neutral-800"
        >
          Settings
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!current || !dirty || busy}
          className="rounded-md border border-neutral-700 px-3 py-1 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={!current || busy}
          className="rounded-md bg-amber-400 px-3 py-1 text-sm font-medium text-neutral-950 hover:bg-amber-300 disabled:opacity-40"
        >
          {busy ? 'Exporting…' : 'Export PNGs'}
        </button>
      </div>
    </header>
  );
}
