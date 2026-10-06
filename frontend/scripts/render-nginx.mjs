import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";
import { apiConfiguration } from "../src/api/apiConfiguration.ts";

if (process.argv.length !== 4)
  throw new Error(
    "Usage: node scripts/render-nginx.mjs INPUT_TEMPLATE OUTPUT_CONFIG",
  );
const config = apiConfiguration(process.env.VITE_API_BASE_URL);
const template = await readFile(process.argv[2], "utf8");
const directive = /connect-src\s+'self'(?=\s*;)/g;
if ([...template.matchAll(directive)].length !== 1)
  throw new Error(
    "Nginx template must contain exactly one self-only connect-src directive",
  );
const sources = config.connectOrigin
  ? `'self' ${config.connectOrigin}`
  : "'self'";
const rendered = template.replace(directive, `connect-src ${sources}`);
await mkdir(dirname(process.argv[3]), { recursive: true });
await writeFile(process.argv[3], rendered);
