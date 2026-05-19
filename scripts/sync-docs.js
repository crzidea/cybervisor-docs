#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const SOURCE = path.resolve(__dirname, "..", "..", "cybervisor", "docs");
const DEST = path.resolve(__dirname, "..", "docs");

if (!fs.existsSync(SOURCE)) {
  console.error(
    `Error: source directory not found at ${SOURCE}\n` +
      "Make sure the cybervisor repository is cloned alongside cybervisor-docs."
  );
  process.exit(1);
}

function readdirRecursive(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...readdirRecursive(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function rewriteLinks(content, filePath) {
  content = content.replace(
    /\[([^\]]*)\]\(\.\.\/README\.md\)/g,
    "[$1](https://github.com/crzidea/cybervisor)"
  );

  content = content.replace(
    /\[([^\]]*)\]\(\.\.\/cybervisor-container\/?([^)]*)\)/g,
    "[$1](https://github.com/crzidea/cybervisor-container)"
  );

  content = content.replace(
    /\.\.\/cybervisor-container/g,
    "https://github.com/crzidea/cybervisor-container"
  );

  content = content.replace(
    /\[([^\]]*)\]\((?!http)([^)]+\.md)\)/g,
    (match, text, href) => {
      const resolved = path.resolve(path.dirname(filePath), href);
      const relFromRoot = path.relative(SOURCE, resolved).replace(/\\/g, "/");
      const vpressHref = "/" + relFromRoot.replace(/\.md$/, ".html");
      return `[${text}](${vpressHref})`;
    }
  );

  return content;
}

const existingFiles = fs.existsSync(DEST)
  ? readdirRecursive(DEST).filter((f) => !f.includes(".vitepress"))
  : [];

const sourceFiles = readdirRecursive(SOURCE);
const sourceRels = new Set(sourceFiles.map((f) => path.relative(SOURCE, f)));

for (const existing of existingFiles) {
  const rel = path.relative(DEST, existing);
  if (!sourceRels.has(rel)) {
    fs.unlinkSync(existing);
  }
}

function removeEmptyDirs(dir) {
  if (!fs.existsSync(dir) || dir === path.join(DEST, ".vitepress")) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const sub = path.join(dir, entry.name);
      removeEmptyDirs(sub);
    }
  }
  const remaining = fs.readdirSync(dir).filter(
    (name) => name !== ".vitepress" || dir !== DEST
  );
  if (remaining.length === 0 && dir !== DEST) {
    fs.rmdirSync(dir);
  }
}

removeEmptyDirs(DEST);

for (const srcFile of sourceFiles) {
  const rel = path.relative(SOURCE, srcFile);
  const destFile = path.join(DEST, rel);

  const destDir = path.dirname(destFile);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  if (srcFile.endsWith(".md")) {
    let content = fs.readFileSync(srcFile, "utf8");
    content = rewriteLinks(content, srcFile);

    const hasFrontmatter = content.startsWith("---");

    if (!hasFrontmatter) {
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : path.basename(srcFile, ".md");
      content = `---\ntitle: ${title}\n---\n\n${content}`;
    }

    fs.writeFileSync(destFile, content);
  } else {
    fs.writeFileSync(destFile, fs.readFileSync(srcFile));
  }
}

const sourceFilesList = sourceFiles
  .filter((f) => f.endsWith(".md"))
  .map((f) => path.relative(SOURCE, f));

console.log(
  `Synced ${sourceFilesList.length} docs files from ${SOURCE} to ${DEST}`
);
console.log("Files:", sourceFilesList.join(", "));