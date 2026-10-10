import { loadEnvFile } from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

try { loadEnvFile(".env"); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const url = new URL(process.env.VITE_SUPABASE_URL || "http://localhost");
const match = /^([a-z0-9]+)\.supabase\.co$/.exec(url.hostname);
if (!match || url.protocol !== "https:") {
  throw new Error("VITE_SUPABASE_URL must point to the intended hosted Supabase project.");
}
// Run the installed CLI with argument boundaries preserved; no shell or Docker.
const cli = fileURLToPath(new URL("../node_modules/supabase/dist/supabase.js", import.meta.url));
const child = spawn(process.execPath, [cli, "functions", "deploy", "register-participant", "--project-ref", match[1], "--use-api", "--no-verify-jwt"], {
  stdio: "inherit", windowsHide: true,
});
child.on("error", () => { console.error("Unable to start installed Supabase CLI"); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
