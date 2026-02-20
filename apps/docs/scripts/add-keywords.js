#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

/**
 * Keyword mappings for different page types
 */
const KEYWORD_MAPPINGS = {
  // Getting Started Pages
  'getting-started/introduction.mdx':
    'docx editor, microsoft word web, word compatibility, document editing api, contract management software, word documents online',
  'getting-started/ai-agents.mdx':
    'ai document editing, llm docx, chatgpt word documents, cursor integration, document automation ai, programmatic word editing',
  'getting-started/installation.mdx':
    'superdoc npm, docx editor install, word editor sdk, javascript document editor, react word editor, vue docx editor',
  'getting-started/configuration.mdx':
    'superdoc config, document editor setup, word editor options, docx api configuration, document modes, editor roles',

  // Framework Pages
  'getting-started/frameworks/react.mdx':
    'react docx editor, react word component, superdoc react, microsoft word react, document editor react hooks',
  'getting-started/frameworks/nextjs.mdx':
    'nextjs docx editor, next word editor, superdoc nextjs, ssr document editor, dynamic import docx',
  'getting-started/frameworks/vue.mdx':
    'vue docx editor, vue word component, superdoc vue, vue document editor, vue composition api',
  'getting-started/frameworks/angular.mdx':
    'angular docx editor, angular word component, superdoc angular, angular document editor, angular integration',
  'getting-started/frameworks/svelte.mdx':
    'svelte docx editor, svelte word component, superdoc svelte, svelte document editor, svelte integration',
  'getting-started/frameworks/vanilla-js.mdx':
    'vanilla javascript docx, plain js word editor, superdoc vanilla, no framework docx, pure javascript editor',
  'getting-started/frameworks/nuxt.mdx':
    'nuxt docx editor, nuxt word editor, superdoc nuxt, nuxt3 document editor, vue ssr docx',
  'getting-started/frameworks/blazor.mdx':
    'blazor docx editor, blazor word component, superdoc blazor, .net docx editor, c# document editor',
  'getting-started/frameworks/php.mdx':
    'php docx editor, php word editor, superdoc php, server side docx, php document editor',
  'getting-started/frameworks/ruby-on-rails.mdx':
    'rails docx editor, ruby word editor, superdoc rails, ruby document editor, rails integration',

  // Core Pages
  'core/superdoc/overview.mdx':
    'superdoc class, document editor api, docx sdk methods, word editor instance, document initialization',
  'core/superdoc/configuration.mdx':
    'superdoc configuration, editor config options, document settings, word editor setup, api configuration',
  'core/superdoc/methods.mdx':
    'superdoc methods, document api methods, editor functions, word document api, programmatic control',
  'core/superdoc/properties.mdx':
    'superdoc properties, editor state, document properties, word editor attributes, api properties',
  'core/superdoc/events.mdx':
    'superdoc events, document events, editor callbacks, word editor listeners, event handling',

  'core/supereditor/overview.mdx':
    'supereditor class, prosemirror docx, tiptap alternative, editor commands, document manipulation api',
  'core/supereditor/configuration.mdx':
    'supereditor config, editor configuration, prosemirror setup, document editor options, advanced config',
  'core/supereditor/methods.mdx':
    'supereditor methods, editor commands, prosemirror commands, document manipulation, editor api',
  'core/supereditor/hooks.mdx':
    'supereditor hooks, editor lifecycle, prosemirror hooks, document events, editor callbacks',

  'core/superdoc-ai/overview.mdx':
    'superdoc ai overview, ai document automation, llm document workflows, intelligent docx agent, ai-driven editing',
  'core/superdoc-ai/configuration.mdx':
    'superdoc ai configuration, ai workflow setup, llm integration options, automation settings, ai agent config',
  'core/superdoc-ai/methods.mdx':
    'superdoc ai methods, ai document actions, automation commands, llm task api, docx ai controls',
  'core/superdoc-ai/hooks.mdx':
    'superdoc ai hooks, ai lifecycle events, automation callbacks, llm response handling, intelligent document triggers',

  // Module Pages
  'modules/overview.mdx': 'superdoc modules, editor modules, document features, modular architecture, plugin system',
  'modules/collaboration/overview.mdx':
    'real-time document editing, collaborative word editing, websocket docx, multiplayer documents, yjs alternative',
  'modules/collaboration/backend.mdx':
    'collaboration backend, websocket server, real-time sync, document conflict resolution, collaborative editing server',
  'modules/comments.mdx':
    'word comments api, document annotations, threaded discussions, comment resolution, docx comments',
  'modules/toolbar.mdx':
    'word toolbar, document formatting controls, custom toolbar, editor ui components, formatting buttons',

  // API Reference Pages
  'api-reference/introduction.mdx':
    'superdoc api, docx api reference, word editor api, document editor sdk, api documentation',
  'api-reference/authentication.mdx':
    'superdoc auth, api authentication, bearer token, api key management, secure api access',
  'api-reference/quickstart.mdx':
    'superdoc quickstart, api quick start, docx api tutorial, word editor guide, getting started api',

  // Dev Pages
  'dev/api/editor.mdx':
    'editor api development, custom editor api, superdoc development, word editor customization, api development',
  'dev/ai/overview.mdx':
    'ai development, llm integration, ai document processing, intelligent document editing, ai-powered editing',
  'dev/solutions/legal/contracts.mdx':
    'legal document editing, contract management, legal tech solution, document automation legal, contract editor',

  // Resource Pages
  'resources/accessibility.mdx':
    'wcag compliance, screen reader support, keyboard navigation, aria labels, accessible documents, ada compliance',
  'resources/migration.mdx':
    'migrate from prosemirror, migrate from tiptap, switch to superdoc, document editor migration, upgrade guide',
  'resources/license.mdx':
    'agpl license, commercial license, open source docx, enterprise licensing, dual license, superdoc pricing',
};

/**
 * Add keywords to a file if they don't already exist
 */
function addKeywords(filePath, keywords) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf8');

  // Check if keywords already exist
  if (content.includes('keywords:')) {
    console.log(`   Already has keywords: ${filePath}`);
    return false;
  }

  // Check if file has frontmatter
  if (!content.startsWith('---')) {
    console.log(`   No frontmatter found: ${filePath}`);
    return false;
  }

  // Add keywords after title (or before closing ---)
  const frontmatterMatch = content.match(/^(---\n(?:.*\n)*?)(---)/m);
  if (!frontmatterMatch) {
    console.log(`   Invalid frontmatter: ${filePath}`);
    return false;
  }

  const frontmatter = frontmatterMatch[1];
  const rest = content.substring(frontmatterMatch[0].length);

  // Add keywords before the closing ---
  const newFrontmatter = frontmatter + `keywords: "${keywords}"\n`;
  const newContent = newFrontmatter + '---' + rest;

  fs.writeFileSync(filePath, newContent);
  console.log(`   ✓ Added keywords: ${filePath}`);
  return true;
}

/**
 * Process all files in a directory recursively
 */
function processDirectory(dirPath, basePath = '') {
  const items = fs.readdirSync(dirPath);
  let processedCount = 0;

  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const relativePath = path.join(basePath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip node_modules and other irrelevant directories
      if (['node_modules', 'public', '.git', 'scripts', 'snippets'].includes(item)) {
        continue;
      }
      processedCount += processDirectory(fullPath, relativePath);
    } else if (item.endsWith('.mdx')) {
      const keywords = KEYWORD_MAPPINGS[relativePath];
      if (keywords) {
        if (addKeywords(fullPath, keywords)) {
          processedCount++;
        }
      } else {
        console.log(`   No keywords defined for: ${relativePath}`);
      }
    }
  }

  return processedCount;
}

/**
 * Main function
 */
async function main() {
  console.log('🔍 Adding keywords to documentation pages\n');

  try {
    const processedCount = processDirectory('.');

    console.log(`\n✅ Complete! Added keywords to ${processedCount} files.`);
    console.log('\n📝 Note: Extension files will get keywords automatically when you run sync-sdk-docs.js');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { addKeywords, KEYWORD_MAPPINGS };
