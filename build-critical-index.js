import { readdirSync, writeFileSync } from "fs";
import { join } from "path";

const langs = ["en", "es"];
const baseDir = "./module/combat/tables/critical";

for (const lang of langs) {
    const dir = join(baseDir, lang);
    const files = readdirSync(dir)
        .filter(f => f.endsWith(".json") && f !== "index.json")
        .map(f => f.replace(/\.json$/, ""));
    writeFileSync(join(dir, "index.json"), JSON.stringify(files, null, 2));
    console.log(`✅ ${lang}: ${files.length} critical tables`);
}
