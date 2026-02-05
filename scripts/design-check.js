const fs = require('fs');
const path = require('path');

const roots = ['src/screens', 'src/components'];
const exts = new Set(['.ts', '.tsx']);

const patterns = [
  /#[0-9a-fA-F]{3,8}\b/g, // hex colors
  /rgba?\(/g, // rgb/rgba
  /\bborderRadius\s*:\s*\d+/g,
  /\bpadding\s*:\s*\d+/g,
  /\bmargin\s*:\s*\d+/g,
  /\bpadding(Top|Right|Bottom|Left|Horizontal|Vertical)\s*:\s*\d+/g,
  /\bmargin(Top|Right|Bottom|Left|Horizontal|Vertical)\s*:\s*\d+/g,
  /\belevation\s*:\s*\d+/g,
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (exts.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

let hits = 0;

for (const root of roots) {
  for (const file of walk(root)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const re of patterns) {
      re.lastIndex = 0;
      const m = re.exec(text);
      if (m) {
        hits++;
        console.log(`${file}: match "${m[0]}"`);
      }
    }
  }
}

if (hits > 0) {
  console.error(
    `\n❌ design:check failed (${hits} files with matches). Remove hardcodes and use theme tokens.`,
  );
  process.exit(1);
} else {
  console.log(
    '✅ design:check passed (no hardcoded colors/spacing/radius/shadows in screens/components).',
  );
}
