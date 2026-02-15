import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";

const DATA_ROOT_CANDIDATES = [
  path.resolve(process.cwd(), "../data"),
  path.resolve(process.cwd(), "data"),
  path.resolve(process.cwd(), "../../data")
];

function resolveDataFilePath(fileName: string): string {
  for (const root of DATA_ROOT_CANDIDATES) {
    const candidate = path.join(root, fileName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Could not locate data file "${fileName}". Checked: ${DATA_ROOT_CANDIDATES.join(", ")}`);
}

export function readDataJson<T>(fileName: string): T {
  const filePath = resolveDataFilePath(fileName);
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}
