const graphemes = new Intl.Segmenter("it", { granularity: "grapheme" });

export interface AvatarProps {
  name: string;
  id: string;
  size?: number;
  className?: string;
}

export function Avatar({ name, id, size = 32, className = "" }: AvatarProps) {
  const words = name.normalize("NFC").trim().split(/\s+/);
  const first = [...graphemes.segment(words[0] ?? "")][0]?.segment ?? "";
  const last =
    words.length > 1
      ? ([...graphemes.segment(words.at(-1) ?? "")][0]?.segment ?? "")
      : "";
  const initials = [
    ...graphemes.segment((first + last).toLocaleUpperCase("it")),
  ]
    .slice(0, 2)
    .map((part) => part.segment)
    .join("");
  const tone = Number.parseInt(id.slice(0, 8), 16) % 3;
  const color = tone === 1 ? "green" : tone === 2 ? "purple" : "gray";
  return (
    <span
      aria-hidden="true"
      className={`avatar avatar-${color} ${className}`}
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}
