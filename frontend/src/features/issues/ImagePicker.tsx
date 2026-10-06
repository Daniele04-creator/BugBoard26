import { useEffect, useId, useState } from "react";
import { Button } from "../../components/Button";
export async function validateImage(file: File) {
  if (!["image/png", "image/jpeg"].includes(file.type))
    throw new Error("Scegli un’immagine PNG o JPEG.");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("L’immagine supera il limite di 5 MiB.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("L’immagine non può essere letta.");
  }
  try {
    if (
      bitmap.width > 4096 ||
      bitmap.height > 4096 ||
      bitmap.width * bitmap.height > 16_000_000
    )
      throw new Error(
        "Immagine troppo grande: massimo 4096 pixel per lato e 16 milioni di pixel.",
      );
  } finally {
    bitmap.close();
  }
}
export function ImagePicker({
  file,
  onChange,
  disabled = false,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="field">
      <label htmlFor={id}>Immagine opzionale</label>
      <input
        id={id}
        type="file"
        accept="image/png,image/jpeg"
        disabled={disabled}
        aria-describedby={`${id}-help ${id}-error`}
        onChange={async (e) => {
          const chosen = e.target.files?.[0];
          setError("");
          if (!chosen) return;
          try {
            await validateImage(chosen);
            onChange(chosen);
          } catch (problem) {
            setError(
              problem instanceof Error
                ? problem.message
                : "Immagine non valida.",
            );
            e.target.value = "";
          }
        }}
      />
      <p id={`${id}-help`} className="field-hint">
        Una sola immagine PNG o JPEG, massimo 5 MiB, 4096 pixel per lato e 16
        milioni di pixel.
      </p>
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
      {file && (
        <>
          <p>
            {file.name} · {Math.ceil(file.size / 1024)} KiB
          </p>
          {preview && (
            <img
              className="issue-preview"
              src={preview}
              alt={`Anteprima di ${file.name}`}
            />
          )}
          <Button
            disabled={disabled}
            onClick={() => {
              onChange(null);
              setError("");
            }}
          >
            Rimuovi selezione
          </Button>
        </>
      )}
    </div>
  );
}
