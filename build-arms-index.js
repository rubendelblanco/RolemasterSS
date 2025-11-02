// build-arms-index.js
// Generates index.json files for attack tables

import { readdirSync, writeFileSync } from "fs";
import { join } from "path";

const dir = "./module/combat/tables/arms";

try {
    const files = readdirSync(dir)
        .filter(f => f.endsWith(".json") && f !== "index.json")
        .map(f => f.replace(/\.json$/, ""));

    const output = JSON.stringify(files, null, 2);
    writeFileSync(join(dir, "index.json"), output);
    console.log(`✅ Generated ${dir}/index.json (${files.length} entries)`);
} catch (err) {
    console.error("❌ Error:", err.message);
}
