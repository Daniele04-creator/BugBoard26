export interface ApiConfiguration {
  baseUrl: string;
  connectOrigin: string | null;
}

export function apiConfiguration(value: string | undefined): ApiConfiguration {
  const raw = value ?? "/api/v1";
  if (
    Array.from(raw).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new Error("VITE_API_BASE_URL cannot contain control characters");
  const configured = raw.trim() || "/api/v1";
  if (configured.startsWith("//"))
    throw new Error("VITE_API_BASE_URL cannot be protocol-relative");
  const baseUrl = configured === "/" ? "" : configured.replace(/\/+$/, "");
  if (/[\s\\?#]/.test(baseUrl) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(baseUrl))
    throw new Error(
      "VITE_API_BASE_URL must not contain whitespace, query, fragment or dot segments",
    );
  if (!baseUrl || baseUrl.startsWith("/"))
    return { baseUrl, connectOrigin: null };
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(
      "VITE_API_BASE_URL must be an HTTP(S) URL or root-relative path",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "VITE_API_BASE_URL must be an HTTP(S) URL without credentials, query or fragment",
    );
  const hostname = url.hostname.toLowerCase();
  const ipv6 = /^\[[0-9a-f:]+\]$/.test(hostname);
  const dns = hostname
    .replace(/\.$/, "")
    .split(".")
    .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
  if (!ipv6 && (!dns || hostname.length > 254))
    throw new Error("VITE_API_BASE_URL must have a valid DNS or IP hostname");
  return { baseUrl: url.href.replace(/\/+$/, ""), connectOrigin: url.origin };
}
