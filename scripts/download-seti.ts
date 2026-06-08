import { mkdir } from "node:fs/promises";
import { join } from "node:path";

async function downloadSetiAssets() {
  const targetDir = join(import.meta.dirname, "../resources/seti");
  console.log(`Creating resources directory at: ${targetDir}`);
  await mkdir(targetDir, { recursive: true });

  const jsonUrl =
    "https://raw.githubusercontent.com/microsoft/vscode/main/extensions/theme-seti/icons/vs-seti-icon-theme.json";
  const woffUrl =
    "https://github.com/microsoft/vscode/raw/main/extensions/theme-seti/icons/seti.woff";

  console.log(`Downloading vs-seti-icon-theme.json from:\n  ${jsonUrl}`);
  const jsonResponse = await fetch(jsonUrl);
  if (!jsonResponse.ok) {
    throw new Error(`Failed to download JSON mapping: ${jsonResponse.statusText}`);
  }
  const jsonText = await jsonResponse.text();
  const jsonPath = join(targetDir, "vs-seti-icon-theme.json");
  await Bun.write(jsonPath, jsonText);
  console.log(`Saved JSON mapping to: ${jsonPath}`);

  console.log(`Downloading seti.woff from:\n  ${woffUrl}`);
  const woffResponse = await fetch(woffUrl);
  if (!woffResponse.ok) {
    throw new Error(`Failed to download font: ${woffResponse.statusText}`);
  }
  const woffBuffer = await woffResponse.arrayBuffer();
  const woffPath = join(targetDir, "seti.woff");
  await Bun.write(woffPath, woffBuffer);
  console.log(`Saved WOFF font to: ${woffPath}`);

  console.log("Seti assets successfully downloaded!");
}

downloadSetiAssets().catch((err) => {
  console.error("Error downloading Seti assets:", err);
  process.exit(1);
});
