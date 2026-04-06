/**
 * Apply Supabase migrations using DATABASE_URL (Postgres connection string).
 * Run from project root: node web/scripts/run-migrations.js
 * Or from web folder: npm run db:migrate  or  node scripts/run-migrations.js
 */
const path = require("path");
const fs = require("fs");

// Project root: directory that contains supabase/migrations (parent of web when script lives in web/scripts)
const scriptDir = __dirname;
const possibleRoots = [
  path.join(scriptDir, "..", ".."),
  path.join(process.cwd(), ".."),
  process.cwd(),
];
const projectRoot = possibleRoots.find((r) =>
  fs.existsSync(path.join(r, "supabase", "migrations"))
);
if (!projectRoot) {
  console.error("Cannot find supabase/migrations. Run from project root or from web folder.");
  process.exit(1);
}

const migrationsDir = path.join(projectRoot, "supabase", "migrations");
function loadEnvFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  });
}

const envPath = path.join(projectRoot, "web", ".env.local");
if (!fs.existsSync(envPath)) {
  const fallback = path.join(scriptDir, "..", ".env.local");
  if (fs.existsSync(fallback)) {
    loadEnvFile(fallback);
  }
} else {
  loadEnvFile(envPath);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Add it to web/.env.local (Supabase Dashboard → Settings → Database → Connection string URI)."
  );
  process.exit(1);
}

async function main() {
  const pg = await import("pg");
  const client = new pg.default.Client({ connectionString: DATABASE_URL });
  await client.connect();

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, "utf8");
    console.log("Applying:", file);
    await client.query(sql);
    console.log("  OK");
  }

  await client.end();
  console.log("All migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
