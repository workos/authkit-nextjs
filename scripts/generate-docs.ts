#!/usr/bin/env npx tsx
/**
 * Generates embedded documentation for AI coding agents.
 *
 * Creates three artifacts in dist/docs/:
 * - SKILL.md - Entry point with YAML frontmatter
 * - SOURCE_MAP.json - Export → type → implementation mapping
 * - topics/ - Documentation extracted from README.md
 *
 * Usage:
 *   pnpm generate:docs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

// ============================================================================
// Types
// ============================================================================

interface ExportInfo {
  types: string;
  implementation: string;
  line?: number;
  category: string;
}

interface InterfaceInfo {
  file: string;
  line: number;
}

interface ModuleInfo {
  types: string;
  implementation: string;
}

interface SourceMap {
  version: string;
  package: string;
  exports: Record<string, ExportInfo>;
  interfaces: Record<string, InterfaceInfo>;
  modules: Record<string, ModuleInfo>;
}

interface Topic {
  id: string;
  title: string;
  content: string;
  order: number;
}

// ============================================================================
// Export Parsing
// ============================================================================

/**
 * Parse exports from a TypeScript index file
 */
function parseExports(indexPath: string): Map<string, { source: string; isType: boolean }> {
  const exports = new Map<string, { source: string; isType: boolean }>();

  if (!fs.existsSync(indexPath)) {
    return exports;
  }

  const content = fs.readFileSync(indexPath, 'utf-8');

  // Step 1: Build a map of imported names to their source files
  const importMap = new Map<string, string>();
  const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    const names = match[1].split(',').map((n) => n.trim());
    const source = match[2].replace('.js', '.ts');

    for (const name of names) {
      const cleanName = name.split(' as ')[0].trim();
      if (cleanName) {
        importMap.set(cleanName, source);
      }
    }
  }

  // Step 2: Match direct exports with 'from': export { Name1, Name2 } from './file.js';
  const namedExportRegex = /export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;

  while ((match = namedExportRegex.exec(content)) !== null) {
    const names = match[1].split(',').map((n) => n.trim());
    const source = match[2].replace('.js', '.ts');

    for (const name of names) {
      // Handle "type Name" exports
      const isType = name.startsWith('type ');
      const cleanName = name.replace(/^type\s+/, '').split(' as ')[0].trim();
      if (cleanName) {
        exports.set(cleanName, { source, isType });
      }
    }
  }

  // Step 3: Match bare exports (no 'from' clause): export { Name1, Name2 };
  // These re-export previously imported names
  const bareExportRegex = /export\s*\{([^}]+)\}\s*;/g;

  while ((match = bareExportRegex.exec(content)) !== null) {
    const names = match[1].split(',').map((n) => n.trim());

    for (const name of names) {
      const cleanName = name.split(' as ')[0].trim();
      if (cleanName && importMap.has(cleanName)) {
        const source = importMap.get(cleanName)!;
        exports.set(cleanName, { source, isType: false });
      }
    }
  }

  // Step 4: Match: export * from './interfaces.js';
  const starExportRegex = /export\s*\*\s*from\s*['"]([^'"]+)['"]/g;
  while ((match = starExportRegex.exec(content)) !== null) {
    const source = match[1].replace('.js', '.ts');
    exports.set(`*:${source}`, { source, isType: false });
  }

  return exports;
}

/**
 * Parse interface definitions from interfaces.ts
 */
function parseInterfaces(filePath: string): Map<string, number> {
  const interfaces = new Map<string, number>();

  if (!fs.existsSync(filePath)) {
    return interfaces;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    // Match: export interface Name {
    const interfaceMatch = lines[i].match(/^export\s+interface\s+(\w+)/);
    if (interfaceMatch) {
      interfaces.set(interfaceMatch[1], i + 1);
    }
  }

  return interfaces;
}

/**
 * Find the line number where an export is defined in a source file
 */
function findExportLine(filePath: string, exportName: string): number | undefined {
  const fullPath = path.join(PROJECT_ROOT, 'src', filePath);

  if (!fs.existsSync(fullPath)) {
    return undefined;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n');

  const patterns = [
    // export function name
    new RegExp(`^export\\s+(async\\s+)?function\\s+${exportName}\\s*[<(]`),
    // export const name =
    new RegExp(`^export\\s+const\\s+${exportName}\\s*=`),
    // export class name
    new RegExp(`^export\\s+class\\s+${exportName}\\s`),
    // function name (non-exported, then re-exported)
    new RegExp(`^(async\\s+)?function\\s+${exportName}\\s*[<(]`),
    // const name =
    new RegExp(`^const\\s+${exportName}\\s*=`),
    // class name
    new RegExp(`^class\\s+${exportName}\\s`),
  ];

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      if (pattern.test(lines[i])) {
        return i + 1;
      }
    }
  }

  return undefined;
}

/**
 * Categorize an export by its source file
 */
function categorizeExport(source: string): string {
  if (source.includes('session')) return 'session';
  if (source.includes('auth')) return 'auth';
  if (source.includes('middleware')) return 'middleware';
  if (source.includes('errors')) return 'errors';
  if (source.includes('workos')) return 'client';
  if (source.includes('validate')) return 'validation';
  if (source.includes('components') || source.includes('provider') || source.includes('impersonation')) {
    return 'components';
  }
  return 'core';
}

// ============================================================================
// README Topic Parsing
// ============================================================================

/**
 * Parse README.md into topic sections
 */
function parseReadmeIntoTopics(readmePath: string): Topic[] {
  if (!fs.existsSync(readmePath)) {
    console.warn('README.md not found');
    return [];
  }

  const content = fs.readFileSync(readmePath, 'utf-8');
  const sections: { id: string; title: string; content: string; order: number }[] = [];

  // Section 1: Getting Started (Installation + Pre-flight)
  const installMatch = content.match(/## Installation[\s\S]*?(?=## Video|## Pre-flight)/);
  const preflightMatch = content.match(/## Pre-flight[\s\S]*?(?=## Setup)/);
  if (installMatch || preflightMatch) {
    let gettingStarted = '# Getting Started\n\n';
    if (installMatch) gettingStarted += installMatch[0].replace(/^## /, '### ');
    if (preflightMatch) gettingStarted += '\n' + preflightMatch[0].replace(/^## /, '### ');
    sections.push({ id: '01-getting-started', title: 'Getting Started', content: gettingStarted, order: 1 });
  }

  // Section 2: Setup (Callback route)
  const setupMatch = content.match(/## Setup[\s\S]*?(?=### Proxy \/ Middleware)/);
  if (setupMatch) {
    sections.push({
      id: '02-setup',
      title: 'Setup',
      content: '# Setup\n\n' + setupMatch[0].replace(/^## Setup\n+/, ''),
      order: 2,
    });
  }

  // Section 3: Middleware
  const middlewareMatch = content.match(/### Proxy \/ Middleware[\s\S]*?(?=## Usage)/);
  if (middlewareMatch) {
    sections.push({
      id: '03-middleware',
      title: 'Middleware',
      content: '# Middleware\n\n' + middlewareMatch[0].replace(/^### /, '## '),
      order: 3,
    });
  }

  // Section 4: Client Components
  const clientMatch = content.match(/### Wrap your app[\s\S]*?### Get the current user in a client component[\s\S]*?(?=### Get the enabled flags)/);
  if (clientMatch) {
    sections.push({
      id: '04-client-components',
      title: 'Client Components',
      content: '# Client Components\n\n' + clientMatch[0].replace(/^### /gm, '## '),
      order: 4,
    });
  }

  // Section 5: Session Management
  const sessionMatch = content.match(/### Get the current user in a server component[\s\S]*?(?=### Wrap your app)/);
  const refreshMatch = content.match(/### Refreshing the session[\s\S]*?(?=### Access Token)/);
  const requireMatch = content.match(/### Requiring auth[\s\S]*?(?=### Refreshing)/);
  if (sessionMatch || refreshMatch || requireMatch) {
    let sessionContent = '# Session Management\n\n';
    if (sessionMatch) sessionContent += sessionMatch[0].replace(/^### /gm, '## ');
    if (requireMatch) sessionContent += '\n' + requireMatch[0].replace(/^### /gm, '## ');
    if (refreshMatch) sessionContent += '\n' + refreshMatch[0].replace(/^### /gm, '## ');
    sections.push({ id: '05-session-management', title: 'Session Management', content: sessionContent, order: 5 });
  }

  // Section 6: API Reference (collect remaining advanced topics)
  const advancedPatterns = [
    /### Signing out[\s\S]*?(?=### Visualizing)/,
    /### Visualizing an impersonation[\s\S]*?(?=### Get the access token)/,
    /### Get the access token[\s\S]*?(?=### Sign up paths)/,
    /### Sign up paths[\s\S]*?(?=### Validate an API key)/,
    /### Validate an API key[\s\S]*?(?=### Advanced:)/,
    /### Advanced: Direct access[\s\S]*?(?=### Advanced: Custom)/,
    /### Advanced: Custom authentication[\s\S]*?(?=### CDN Deployments)/,
  ];

  let apiRefContent = '# API Reference\n\n';
  for (const pattern of advancedPatterns) {
    const match = content.match(pattern);
    if (match) {
      apiRefContent += match[0].replace(/^### /gm, '## ') + '\n\n';
    }
  }

  if (apiRefContent.length > 30) {
    sections.push({ id: '06-api-reference', title: 'API Reference', content: apiRefContent, order: 6 });
  }

  // Convert to topics
  return sections.map((s) => ({
    id: s.id,
    title: s.title,
    content: cleanMarkdown(s.content),
    order: s.order,
  }));
}

/**
 * Clean up markdown content for output
 */
function cleanMarkdown(content: string): string {
  let result = content;

  // Remove video tutorial section (HTML/image)
  result = result.replace(/<a[^>]*youtube[^>]*>[\s\S]*?<\/a>/gi, '');

  // Clean up multiple blank lines
  result = result.replace(/\n{3,}/g, '\n\n');

  // Ensure proper newlines around code blocks
  result = result.replace(/```(\w+)\n/g, '```$1\n');

  return result.trim();
}

// ============================================================================
// Source Map Generation
// ============================================================================

function generateSourceMap(): SourceMap {
  const packageJson = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));

  const sourceMap: SourceMap = {
    version: packageJson.version,
    package: packageJson.name,
    exports: {},
    interfaces: {},
    modules: {
      '.': {
        types: 'dist/esm/types/index.d.ts',
        implementation: 'dist/esm/index.js',
      },
      './components': {
        types: 'dist/esm/types/components/index.d.ts',
        implementation: 'dist/esm/components/index.js',
      },
    },
  };

  // Parse main index exports
  const mainExports = parseExports(path.join(PROJECT_ROOT, 'src', 'index.ts'));
  const componentExports = parseExports(path.join(PROJECT_ROOT, 'src', 'components', 'index.ts'));
  const interfaces = parseInterfaces(path.join(PROJECT_ROOT, 'src', 'interfaces.ts'));

  // Process main exports
  for (const [name, info] of mainExports) {
    if (name.startsWith('*:')) continue; // Skip star exports

    const line = findExportLine(info.source, name);
    const category = categorizeExport(info.source);

    sourceMap.exports[name] = {
      types: `dist/esm/types/${info.source.replace('.ts', '.d.ts').replace('./', '')}`,
      implementation: `dist/esm/${info.source.replace('.ts', '.js').replace('./', '')}`,
      line,
      category,
    };
  }

  // Process component exports
  for (const [name, info] of componentExports) {
    if (name.startsWith('*:')) continue;

    const componentSource = info.source.replace('./', 'components/');
    const line = findExportLine(componentSource, name);

    sourceMap.exports[name] = {
      types: `dist/esm/types/${componentSource.replace('.ts', '.d.ts')}`,
      implementation: `dist/esm/${componentSource.replace('.ts', '.js')}`,
      line,
      category: 'components',
    };
  }

  // Process interfaces
  for (const [name, line] of interfaces) {
    sourceMap.interfaces[name] = {
      file: 'dist/esm/types/interfaces.d.ts',
      line,
    };
  }

  return sourceMap;
}

// ============================================================================
// Output Generation
// ============================================================================

function generateSkillMd(sourceMap: SourceMap, topics: Topic[]): string {
  const topExports = Object.entries(sourceMap.exports)
    .filter(([_, info]) => info.category !== 'components')
    .slice(0, 15)
    .map(([name, info]) => `  - \`${name}\`: ${info.types}${info.line ? ` (line ${info.line})` : ''}`)
    .join('\n');

  const componentExports = Object.entries(sourceMap.exports)
    .filter(([_, info]) => info.category === 'components')
    .map(([name, info]) => `  - \`${name}\`: ${info.types}${info.line ? ` (line ${info.line})` : ''}`)
    .join('\n');

  const interfaceList = Object.entries(sourceMap.interfaces)
    .slice(0, 10)
    .map(([name, info]) => `  - \`${name}\`: ${info.file} (line ${info.line})`)
    .join('\n');

  const topicLinks = topics.map((t) => `- [${t.title}](topics/${t.id}.md)`).join('\n');

  return `---
name: authkit-nextjs-docs
description: Documentation for @workos-inc/authkit-nextjs - Next.js authentication helpers using WorkOS & AuthKit
---

# @workos-inc/authkit-nextjs Documentation

> **Version**: ${sourceMap.version} | **Package**: ${sourceMap.package}

## Quick Navigation

Use SOURCE_MAP.json to find any export:

\`\`\`bash
cat dist/docs/SOURCE_MAP.json | jq '.exports.withAuth'
\`\`\`

Each export maps to:
- **types**: \`.d.ts\` file with TypeScript definitions
- **implementation**: \`.js\` file with source code
- **line**: Line number where the export is defined

## Main Exports

${topExports}

## Component Exports

Import from \`@workos-inc/authkit-nextjs/components\`:

${componentExports}

## Key Interfaces

${interfaceList}

See SOURCE_MAP.json for the complete list.

## Available Topics

${topicLinks}

## Module Structure

\`\`\`
@workos-inc/authkit-nextjs
├── . (main)          → Session management, auth helpers, middleware
└── ./components      → React components, hooks (AuthKitProvider, useAuth)
\`\`\`
`;
}

function generateReadme(sourceMap: SourceMap, topics: Topic[]): string {
  const topicList = topics.map((t) => `├── ${t.id}.md`).join('\n');

  return `# ${sourceMap.package} Documentation

> Embedded documentation for AI coding agents

## Quick Start

\`\`\`bash
# Read the skill overview
cat dist/docs/SKILL.md

# Get the source map
cat dist/docs/SOURCE_MAP.json

# Read topic documentation
cat dist/docs/topics/01-getting-started.md
\`\`\`

## Structure

\`\`\`
dist/docs/
├── SKILL.md           # Entry point for AI agents
├── README.md          # This file
├── SOURCE_MAP.json    # Export → file mapping
└── topics/
${topicList}
\`\`\`

## Version

Package: ${sourceMap.package}
Version: ${sourceMap.version}
`;
}

function writeOutputFiles(sourceMap: SourceMap, topics: Topic[]): void {
  const docsDir = path.join(PROJECT_ROOT, 'dist', 'docs');
  const topicsDir = path.join(docsDir, 'topics');

  // Create directories
  if (fs.existsSync(docsDir)) {
    fs.rmSync(docsDir, { recursive: true });
  }
  fs.mkdirSync(topicsDir, { recursive: true });

  // Write SOURCE_MAP.json
  const sourceMapPath = path.join(docsDir, 'SOURCE_MAP.json');
  fs.writeFileSync(sourceMapPath, JSON.stringify(sourceMap, null, 2), 'utf-8');
  console.info('  Generated: SOURCE_MAP.json');

  // Write SKILL.md
  const skillMd = generateSkillMd(sourceMap, topics);
  fs.writeFileSync(path.join(docsDir, 'SKILL.md'), skillMd, 'utf-8');
  console.info('  Generated: SKILL.md');

  // Write README.md
  const readme = generateReadme(sourceMap, topics);
  fs.writeFileSync(path.join(docsDir, 'README.md'), readme, 'utf-8');
  console.info('  Generated: README.md');

  // Write topic files
  for (const topic of topics) {
    const topicPath = path.join(topicsDir, `${topic.id}.md`);
    fs.writeFileSync(topicPath, topic.content, 'utf-8');
    console.info(`  Generated: topics/${topic.id}.md`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.info('\n📚 Generating embedded documentation for @workos-inc/authkit-nextjs\n');

  // Step 1: Generate SOURCE_MAP
  console.info('1. Generating SOURCE_MAP.json...');
  const sourceMap = generateSourceMap();
  console.info(`   Found ${Object.keys(sourceMap.exports).length} exports, ${Object.keys(sourceMap.interfaces).length} interfaces\n`);

  // Step 2: Parse README into topics
  console.info('2. Parsing README.md into topics...');
  const readmePath = path.join(PROJECT_ROOT, 'README.md');
  const topics = parseReadmeIntoTopics(readmePath);
  console.info(`   Extracted ${topics.length} topics\n`);

  // Step 3: Write output files
  console.info('3. Writing output files...');
  writeOutputFiles(sourceMap, topics);

  console.info('\n✅ Documentation generation complete!');
  console.info('   Output directory: dist/docs/\n');
}

main().catch((error) => {
  console.error('Failed to generate docs:', error);
  process.exit(1);
});
