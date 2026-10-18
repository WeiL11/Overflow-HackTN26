import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const parseStatusEnv = (output) =>
  Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.replace(/^"(.*)"$/, "$1")]),
  );

// API URL and keys of the local Supabase stack (refuses anything but localhost).
export const getLocalCredentials = () => {
  try {
    const output = execFileSync("npx", ["supabase", "status", "-o", "env"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 15000,
    });
    const values = parseStatusEnv(output);
    const required = ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY"];
    if (required.some((key) => !values[key])) {
      throw new Error("Supabase status did not return the required local credentials.");
    }
    const apiUrl = new URL(values.API_URL);
    if (!["localhost", "127.0.0.1"].includes(apiUrl.hostname)) {
      throw new Error("Seeding is only allowed against a local Supabase API.");
    }
    return { apiUrl: apiUrl.toString().replace(/\/$/, ""), anonKey: values.ANON_KEY, serviceRoleKey: values.SERVICE_ROLE_KEY };
  } catch (error) {
    if (error instanceof Error && error.message.includes("required local credentials")) {
      throw error;
    }
    if (error instanceof Error && error.message.includes("only allowed")) {
      throw error;
    }
    throw new Error("Unable to read local Supabase status.");
  }
};
