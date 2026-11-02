import { register } from "node:module";

// Dipakai lewat `--import ./tests/register.mjs` pada skrip `npm test`.
register("./node-loader.mjs", import.meta.url);
