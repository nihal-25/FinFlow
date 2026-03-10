import fs from "fs";
for (const pkg of ["types", "database", "kafka"]) {
  const dir = `/app/node_modules/@finflow/${pkg}`;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/package.json`, JSON.stringify({ main: `../../../packages/${pkg}/dist/index.js` }));
  } catch { /* not in Railway */ }
}
try { fs.writeFileSync("/app/apps/notification-service/dist/patches.js", ""); } catch { /* ok */ }
require("./server");
