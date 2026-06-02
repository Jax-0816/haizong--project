import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(envPath) {
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function loadEnvFiles(mode = process.env.NODE_ENV || "development") {
  const cwd = process.cwd();
  const candidates = [
    ".env",
    `.env.${mode}`,
    ".env.local",
    `.env.${mode}.local`,
  ];

  candidates.forEach((name) => loadEnvFile(resolve(cwd, name)));
}

export function getEnv(name, fallback = "") {
  const value = process.env[name];
  return value === undefined ? fallback : value;
}

export function getBooleanEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

export function requireEnv(name, hint) {
  const value = process.env[name];
  if (!value) {
    const error = new Error(hint ?? `Missing ${name}`);
    error.statusCode = 400;
    error.code = "MISSING_CONFIG";
    throw error;
  }
  return value;
}
