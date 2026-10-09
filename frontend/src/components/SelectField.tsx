import { Children, isValidElement, useEffect, useId, useRef, useState } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { IconCheck, IconChevronDown, IconSearch } from "./Icons";

type ControlProps = SelectHTMLAttributes<HTMLSelectElement> & { leadingVisual?: (value: string) => ReactNode };
type Choice = { value: string; label: string; disabled?: boolean };
function choices(children: ReactNode): Choice[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean; label?: string }>(child)) return [];
    if (child.type === "optgroup") return choices(child.props.children);
    if (child.type !== "option") return [];
    const label = child.props.label ?? Children.toArray(child.props.children).join("");
    return [{ value: String(child.props.value ?? label), label, disabled: child.props.disabled }];
  });
}
export function SelectControl({ children, leadingVisual, id: suppliedId, className = "", ...props }: ControlProps) {
  const generated = useId();
  const id = suppliedId ?? generated;
  const native = useRef<HTMLSelectElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [uncontrolled, setUncontrolled] = useState(String(props.defaultValue ?? ""));
  const [position, setPosition] = useState({ top: 0, left: 0, width: 240, maxHeight: 350 });
  const options = choices(children);
  const selected = String(props.value ?? uncontrolled);
  const current = options.find((option) => option.value === selected) ?? options[0];
  const visible = options.filter((option) => option.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const label = props["aria-label"] ?? "Seleziona";
  function close(restore = false) { setOpen(false); setSearch(""); if (restore) trigger.current?.focus(); }
  function show() {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(Math.max(rect.width, 240), window.innerWidth - 24);
    const below = window.innerHeight - rect.bottom - 18;
    const above = rect.top - 18;
    const height = Math.min(options.length * 36 + (options.length > 6 ? 60 : 12), 350);
    const upward = below < height && above > below;
    const maxHeight = Math.max(100, Math.min(height, upward ? above : below));
    setPosition({ top: upward ? rect.top - maxHeight - 6 : rect.bottom + 6, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width, maxHeight });
    setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => { if (!trigger.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) { setOpen(false); setSearch(""); } };
    document.addEventListener("pointerdown", dismiss);
    const resize = () => setOpen(false);
    window.addEventListener("resize", resize);
    const scroll = (event: Event) => { if (!(event.target instanceof Node && popup.current?.contains(event.target))) setOpen(false); };
    window.addEventListener("scroll", scroll, true);
    const first = popup.current?.querySelector<HTMLElement>(options.length > 6 ? "input" : '[aria-selected="true"]');
    (first ?? popup.current?.querySelector<HTMLElement>('[role="option"]'))?.focus();
    return () => { document.removeEventListener("pointerdown", dismiss); window.removeEventListener("resize", resize); window.removeEventListener("scroll", scroll, true); };
  }, [open, options.length]);
  if (props.multiple) return <select {...props} id={id} className={className}>{children}</select>;
  return <>
    <select {...props} id={`${id}-native`} ref={native} hidden tabIndex={-1} aria-hidden="true" onChange={(event) => { setUncontrolled(event.target.value); props.onChange?.(event); }} onInvalid={() => trigger.current?.focus()}>{children}</select>
    <button type="button" id={id} ref={trigger} className={`select-control ${className}`} aria-label={props["aria-label"] ? `${props["aria-label"]}: ${current?.label ?? ""}` : undefined} aria-labelledby={props["aria-labelledby"] ? `${props["aria-labelledby"]} ${id}-value` : undefined} aria-describedby={props["aria-describedby"]} aria-invalid={props["aria-invalid"]} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${id}-options` : undefined} disabled={props.disabled} onClick={() => open ? close() : show()} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); show(); } }}>
      {current && leadingVisual?.(current.value)}<span id={`${id}-value`} className="select-value">{current?.label ?? label}</span><IconChevronDown />
    </button>
    {open && createPortal(<div ref={popup} className="select-popover" style={position} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
      if (event.key === "Tab") close(true);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const nodes = Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? []);
        if (!nodes.length) return;
        const index = nodes.indexOf(document.activeElement as HTMLButtonElement);
        let nextIndex;
        if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = nodes.length - 1;
        else if (index < 0) nextIndex = event.key === "ArrowDown" ? 0 : nodes.length - 1;
        else nextIndex = (index + (event.key === "ArrowDown" ? 1 : -1) + nodes.length) % nodes.length;
        nodes[nextIndex].focus();
      }
    }}>
      {options.length > 6 && <div className="select-search"><IconSearch /><input aria-label={`Cerca in ${label}`} placeholder="Cerca…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>}
      <div role="listbox" id={`${id}-options`} aria-label={label} className="select-options">{visible.map((option) => <button type="button" role="option" key={option.value} aria-selected={option.value === current?.value} disabled={option.disabled} onClick={() => {
        if (native.current) { native.current.value = option.value; native.current.dispatchEvent(new Event("change", { bubbles: true })); }
        close(true);
      }}><span className="select-check">{option.value === current?.value && <IconCheck />}</span>{leadingVisual?.(option.value)}<span>{option.label}</span></button>)}{!visible.length && <p className="select-no-results">Nessun risultato</p>}</div>
    </div>, trigger.current?.closest("dialog") ?? document.body)}
  </>;
}
export function SelectField({ label, error, hint, id: suppliedId, children, ...props }: ControlProps & { label: string; error?: string; hint?: string }) {
  const generated = useId(); const id = suppliedId ?? generated;
  return <div className="field"><label htmlFor={id} id={`${id}-label`}>{label}{props.required && " *"}</label><SelectControl {...props} id={id} aria-label={props["aria-label"] ?? label} aria-labelledby={`${id}-label`} aria-invalid={Boolean(error) || undefined} aria-describedby={[hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined}>{children}</SelectControl>{hint && <p className="field-hint" id={`${id}-hint`}>{hint}</p>}{error && <p className="field-error" id={`${id}-error`}>{error}</p>}</div>;
}
