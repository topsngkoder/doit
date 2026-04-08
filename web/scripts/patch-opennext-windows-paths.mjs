import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const handlerPath = path.resolve(".open-next/server-functions/default/handler.mjs");

const replacements = [
  {
    from: /require\('[A-Za-z]:[^']*\/\.open-next\/server-functions\/default\/cache\.cjs'\)/g,
    to: 'require("./cache.cjs")'
  },
  {
    from: /require\('[A-Za-z]:[^']*\/\.open-next\/server-functions\/default\/composable-cache\.cjs'\)/g,
    to: 'require("./composable-cache.cjs")'
  }
];

async function main() {
  const original = await readFile(handlerPath, "utf8");

  let updated = original;
  for (const replacement of replacements) {
    updated = updated.replace(replacement.from, replacement.to);
  }

  if (updated === original) {
    console.log("OpenNext path patch: no Windows absolute paths found.");
    return;
  }

  await writeFile(handlerPath, updated, "utf8");
  console.log("OpenNext path patch: replaced Windows absolute paths in handler.mjs.");
}

main().catch((error) => {
  console.error("OpenNext path patch failed.");
  console.error(error);
  process.exitCode = 1;
});
