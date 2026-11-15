// Entry point for the grading harness. Copies the playable game and its
// screenshots into the output directory, then writes the dossier last so
// the dossier describes exactly the bytes the grader received.
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-threejs.ts";

const root = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

mkdirSync(out, { recursive: true });
cpSync(join(root, "game"), join(out, "game"), { recursive: true });

const shotsSrc = join(root, "screenshots");
if (existsSync(shotsSrc)) {
  mkdirSync(join(out, "screenshots"), { recursive: true });
  cpSync(shotsSrc, join(out, "screenshots"), { recursive: true });
}

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(out, "dossier.json"), dossier);
