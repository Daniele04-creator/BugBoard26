/// <reference types="node" />
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { apiConfiguration } from "./apiConfiguration";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    const target = resolve(directory);
    if (
      dirname(target) !== resolve(tmpdir()) ||
      !basename(target).startsWith("bugboard-csp-")
    )
      throw new Error("Refusing cleanup outside the owned temporary directory");
    rmSync(target, { recursive: true, force: true });
  }
});
describe("API address and production connection policy", () => {
  it("derives a single explicit origin while preserving supported roots, ports and IP hosts", () => {
    expect(apiConfiguration(undefined)).toEqual({
      baseUrl: "/api/v1",
      connectOrigin: null,
    });
    expect(apiConfiguration("/gateway/api/v1/")).toEqual({
      baseUrl: "/gateway/api/v1",
      connectOrigin: null,
    });
    expect(apiConfiguration("HTTPS://api.example.test:8443/api/v1/")).toEqual({
      baseUrl: "https://api.example.test:8443/api/v1",
      connectOrigin: "https://api.example.test:8443",
    });
    expect(apiConfiguration("http://127.0.0.1:8080/api/v1").connectOrigin).toBe(
      "http://127.0.0.1:8080",
    );
    expect(apiConfiguration("http://[::1]:8080/api/v1").connectOrigin).toBe(
      "http://[::1]:8080",
    );
  });
  it("rejects header controls, credentials, query, fragment, protocol-relative and hostname injection inputs", () => {
    for (const value of [
      "https://api.test/api/v1\r\nX-Header: bad",
      "https://name:private@api.test/api/v1",
      "https://api.test/api/v1?secret=bad",
      "https://api.test/api/v1#fragment",
      "//api.test/api/v1",
      "javascript:alert(1)",
      'https://evil"host/api/v1',
      "https://evil'host/api/v1",
      "https://evil;host/api/v1",
      "https://$request_id/api/v1",
    ])
      expect(() => apiConfiguration(value), value).toThrow();
  });
  it("renders the actual Nginx CSP header with only the configured origin and preserves all other directives", () => {
    const directory = mkdtempSync(join(tmpdir(), "bugboard-csp-"));
    temporaryDirectories.push(directory);
    const input = join(directory, "template.conf"),
      output = join(directory, "nginx.conf");
    const template = readFileSync(resolve("../deploy/nginx.conf"), "utf8");
    writeFileSync(input, template);
    const render = (value: string) =>
      execFileSync(
        process.execPath,
        [resolve("scripts/render-nginx.mjs"), input, output],
        { env: { ...process.env, VITE_API_BASE_URL: value }, stdio: "pipe" },
      );
    render("https://api.example.test:8443/gateway/api/v1");
    const rendered = readFileSync(output, "utf8");
    expect(rendered).toBe(
      template.replace(
        "connect-src 'self';",
        "connect-src 'self' https://api.example.test:8443;",
      ),
    );
    expect(rendered).not.toContain("https://api.example.test:8443/gateway");
    render("/api/v1");
    expect(readFileSync(output, "utf8")).toBe(template);
    writeFileSync(input, "connect-src 'self'; connect-src 'self';");
    expect(() => render("/api/v1")).toThrow();
    writeFileSync(input, template);
    expect(() => render("https://evil;host/api/v1")).toThrow();
  });
});
