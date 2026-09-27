interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
}

export function Editor({ value, onChange, onSave }: EditorProps) {
  return (
    <textarea
      value={value}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 's') {
          event.preventDefault();
          onSave();
        }
      }}
      className="h-full w-full resize-none bg-neutral-950 p-4 font-mono text-[13px] leading-relaxed text-neutral-200 outline-none"
      placeholder={'# Your hook\n\n---\n\n## A point worth making'}
    />
  );
}
