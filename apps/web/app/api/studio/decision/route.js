import { spawn } from "node:child_process";
import { join } from "node:path";

export const runtime = "nodejs";

const worker = join(process.cwd(), "lib/phoenix-worker.mjs");

export async function POST(request) {
  const body = await request.text();
  const child = spawn(process.execPath, [worker], { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdin.end(body);
  const code = await new Promise((resolve) => child.on("close", resolve));
  if (code !== 0) {
    return Response.json({ ok: false, error: "calibration_failed" }, { status: 500 });
  }
  try {
    return Response.json(JSON.parse(stdout));
  } catch {
    return Response.json({ ok: false, error: "calibration_unreadable", detail: stderr.slice(0, 500) }, { status: 500 });
  }
}
