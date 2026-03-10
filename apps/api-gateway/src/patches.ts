import fs from "fs";
// Replace npm workspace symlinks with real dirs so Node.js can resolve @finflow/* packages.
// Railway's Nixpacks runtime only copies packages/*/dist, not package.json, breaking symlinks.
for (const pkg of ["types", "database", "redis", "kafka"]) {
  const dir = `/app/node_modules/@finflow/${pkg}`;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      `${dir}/package.json`,
      JSON.stringify({ main: `../../../packages/${pkg}/dist/index.js` })
    );
  } catch {
    // not in a Railway container, skip
  }
}
