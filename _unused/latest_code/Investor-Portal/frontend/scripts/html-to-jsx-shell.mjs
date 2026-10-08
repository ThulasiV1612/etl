import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "../..")
const html = fs.readFileSync(path.join(root, "files2/index.html"), "utf8")
const start = html.indexOf("<!-- PRELOADER -->")
const end = html.indexOf("<!-- ═══════════ ABOUT")
let shell = html.slice(start, end)
shell = shell
  .replace(/class=/g, "className=")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<a href="#" className="brand">[\s\S]*?<\/a>/, "{{BRAND}}")
  .replace(/<a href="#" className="nav-signin">Sign In<\/a>/, "{{SIGNIN}}")
  .replace(/<a href="#contact" className="nav-cta magnetic">/, "{{GET_STARTED}}")

fs.writeFileSync(path.join(root, "frontend/scripts/_shell-fragment.txt"), shell)
console.log("shell len", shell.length)
