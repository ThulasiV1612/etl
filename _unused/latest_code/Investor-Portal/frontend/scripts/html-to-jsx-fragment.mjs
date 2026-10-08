import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "../..")
const html = fs.readFileSync(path.join(root, "files2/index.html"), "utf8")
const start = html.indexOf("<!-- ═══════════ ABOUT")
const end = html.indexOf("<!-- SCRIPTS -->")
let body = html.slice(start, end)
body = body
  .replace(/class=/g, "className=")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/\bid=/g, " id=")

const out = `/* Auto-generated from files2/index.html — do not edit by hand */\nexport function Files2LandingBody() {\n  return (\n    <>\n${body}\n    </>\n  )\n}\n`

fs.writeFileSync(
  path.join(root, "frontend/src/modules/Landing_Page/components/files2/Files2LandingBody.tsx"),
  out,
)
console.log("wrote", out.length, "chars")
