import { writeFile } from "node:fs/promises";

import { qualifiedChinese } from "../src/resume/fixtures/zh-qualified.js";

const structure = qualifiedChinese();
await writeFile("local-output/structure.json", JSON.stringify(structure, null, 2));
const bulletCount = structure.sections
  .flatMap((section) => section.items)
  .flatMap((item) => item.bullets).length;
console.log("structure.json written, bullets:", bulletCount);
