/**
 * CLI: parse profession TXT and output skillCategoryCosts as JSON.
 * Usage:
 *   node module/tools/run_parser.js                    -> uses Cleric sample
 *   node module/tools/run_parser.js archivo.txt       -> parses file
 *   type archivo.txt | node module/tools/run_parser.js -> pipe from stdin
 */
import { parseProfessionTxt, getClericCosts } from "./profession_txt_parser.js";
import { readFileSync } from "fs";

let txt;
if (process.argv[2]) {
  txt = readFileSync(process.argv[2], "utf8");
} else if (!process.stdin.isTTY) {
  txt = await new Promise((r) => {
    let data = "";
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => r(data));
  });
} else {
  // No args, use Cleric sample
  const costs = getClericCosts();
  console.log(JSON.stringify(costs, null, 2));
  process.exit(0);
}

const { costs, unmapped } = parseProfessionTxt(txt);
if (unmapped.length > 0) {
  console.error("Unmapped lines:", unmapped);
}
console.log(JSON.stringify(costs, null, 2));
