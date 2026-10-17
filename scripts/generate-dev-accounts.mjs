import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedDataPath = path.join(rootDir, "supabase", "seed-data.json");
const accountsPath = path.join(rootDir, "dev.md");

export const generateDevAccounts = async (password = process.env.SEED_PASSWORD || "overlfowDev123!") => {
  const seedData = JSON.parse(await readFile(seedDataPath, "utf8"));
  if (!Array.isArray(seedData.users)) {
    throw new Error("Seed data must contain a users array.");
  }
  const accountRows = seedData.users.map((user) => `| ${user.role} | ${user.email} | ${password} |`).join("\n");
  await writeFile(
    accountsPath,
    `# Local Development Accounts\n\nThese accounts are for local development only.\n\n| Role | Email | Password |\n| --- | --- | --- |\n${accountRows}\n`,
  );
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await generateDevAccounts();
    console.log("Local development account guide generated.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Local development account guide generation failed.");
    process.exitCode = 1;
  }
}
