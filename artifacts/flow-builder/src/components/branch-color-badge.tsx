import { useState, useRef, useEffect } from "react";

const PALETTE = [
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#f59e0b",
  "#ef4444",
  "#14b8a6",
  "#64748b",
  "#0ea5e9",
];

export default function BranchColorBadge({
  label,
  color,
  onChange,
  size = "md",
}: {
  label: string;
  color?: string | null;
  onChange: (color: string | null) => void;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const sizeCls =
    size === "sm"
      ? "min-w-[28px] h-6 px-1 text-[10px] rounded"
      : "min-w-[34px] h-8 px-1.5 text-xs rounded-md";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={color ? { backgroundColor: color, color: "#fff" } : undefined}
        className={`nodrag inline-flex items-center justify-center font-bold cursor-pointer hover:opacity-90 transition-opacity ${sizeCls} ${
          color ? "" : "bg-waz/15 text-waz"
        }`}
        title="Customizar cor"
      >
        {label}
      </button>
      {open && (
        <div className="nodrag nowheel absolute left-0 top-full z-50 mt-1 w-[148px] rounded-lg border border-border bg-card p-2 shadow-lg">
          <div className="grid grid-cols-5 gap-1.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                style={{ backgroundColor: c }}
                className={`h-5 w-5 rounded-full border border-black/10 transition-transform hover:scale-110 ${
                  color === c ? "ring-2 ring-offset-1 ring-foreground" : ""
                }`}
                title={c}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="mt-2 w-full rounded-md border border-border py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Padrão
          </button>
        </div>
      )}
    </div>
  );
}
