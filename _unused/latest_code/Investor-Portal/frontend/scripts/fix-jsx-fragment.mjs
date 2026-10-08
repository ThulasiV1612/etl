import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(
  __dirname,
  "../src/modules/Landing_Page/components/files2/Files2LandingBody.tsx",
)
let s = fs.readFileSync(file, "utf8")

s = s.replace(/<br>/g, "<br />")
s = s.replace(/stroke-width=/g, "strokeWidth=")
s = s.replace(/stroke-linecap=/g, "strokeLinecap=")
s = s.replace(/stroke-linejoin=/g, "strokeLinejoin=")
s = s.replace(/stroke-dasharray=/g, "strokeDasharray=")
s = s.replace(/fill-rule=/g, "fillRule=")
s = s.replace(/clip-rule=/g, "clipRule=")

s = s.replace(
  `<div className="brand">
          <div className="brand-icon">SX</div>
          <span>SyndicationX</span>
        </div>`,
  `<div className="brand">
          <BrandLogo height={42} />
        </div>`,
)

const header = `import { BrandLogo } from "./BrandLogo"

/* Sections from files2/index.html */
`
s = s.replace(/^\/\* Auto-generated[\s\S]*?\n/, header)

fs.writeFileSync(file, s)
console.log("fixed", file)
