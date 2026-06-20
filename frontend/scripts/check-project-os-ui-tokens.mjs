import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const tokenizedRoots = [
  'src/components/project-os',
  'src/pages',
];

const disallowed = [
  /bg-\[/,
  /shadow-\[/,
  /max-w-\[1480px\]/,
  /min-h-\[calc\(100vh-/,
];

const ignoredPathParts = [
  'src/pages/OverviewPage/',
  'src/pages/OnboardingPage/',
];

const failures = [];

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return walk(entryPath);
    }
    return entryPath;
  });
}

const tokenizedFiles = tokenizedRoots
  .flatMap((relativeRoot) => walk(path.join(root, relativeRoot)))
  .filter((file) => /\.(tsx|ts)$/.test(file))
  .map((file) => path.relative(root, file))
  .filter((relativeFile) => !ignoredPathParts.some((ignored) => relativeFile.startsWith(ignored)));

for (const relativeFile of tokenizedFiles) {
  const file = path.join(root, relativeFile);
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of disallowed) {
    if (pattern.test(content)) {
      failures.push(`${relativeFile} still contains ${pattern}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
