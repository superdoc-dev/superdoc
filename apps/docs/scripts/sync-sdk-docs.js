#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
// When running from apps/docs/ directory within the monorepo, look up to packages/
const sourceDir = process.argv[2] || path.join(__dirname, '../../../packages/super-editor/src/extensions');
const outputDir = 'extensions';

// Extensions to process
const SUPPORTED = [
  'block-node',
  'bold',
  'bullet-list',
  'color',
  'content-block',
  'custom-selection',
  'document',
  'dropcursor',
  'font-family',
  'font-size',
  'format-commands',
  'gapcursor',
  'heading',
  'highlight',
  'history',
  'image',
  'italic',
  'line-break',
  'line-height',
  'link',
  'linked-styles',
  'list-item',
  'mention',
  'noderesizer',
  'ordered-list',
  'page-number',
  'paragraph',
  'placeholder',
  'popover-plugin',
  'run-item',
  'search',
  'shape-container',
  'shape-textbox',
  'context-menu',
  'strike',
  'structured-content', // contains document-section
  'tab',
  'table',
  'table-cell',
  'table-header',
  'table-row',
  // 'text',  // not to be documented
  'text-align',
  'text-indent',
  'text-style',
  'text-transform',
  'underline',
];

const SKIP_FILES = ['index.js', '*View.js', '*-impl.js', '*.test.js', 'document-section.js'];

function shouldSkip(filename) {
  return SKIP_FILES.some((pattern) => {
    if (pattern.includes('*')) {
      return new RegExp('^' + pattern.replace('*', '.*') + '$').test(filename);
    }
    return filename === pattern;
  });
}

function getFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...getFiles(fullPath));
    } else if (item.endsWith('.js') && !shouldSkip(item)) {
      files.push(fullPath);
    }
  }
  return files;
}

function hasCategory(item, categoryName) {
  return (
    item.tags?.some((t) => t.title === 'category' && t.description?.toLowerCase() === categoryName.toLowerCase()) ||
    false
  );
}

function extractText(desc) {
  if (!desc) return '';
  if (typeof desc === 'string') return desc;
  if (typeof desc === 'object' && !desc.type && !desc.children) return String(desc);

  if (desc.type === 'root' && desc.children) {
    return desc.children
      .map((child) => {
        if (child.type === 'paragraph' && child.children) {
          return child.children
            .filter((n) => n.type === 'text')
            .map((n) => n.value)
            .join('');
        }
        return '';
      })
      .join('\n');
  }
  return '';
}

function formatType(type) {
  if (!type) return 'any';
  if (typeof type === 'string') return type;

  switch (type.type) {
    case 'NameExpression':
      return type.name;
    case 'TypeApplication':
      const base = type.expression?.name || 'unknown';
      const args = type.applications?.map(formatType).join(', ');
      return args ? `${base}<${args}>` : base;
    case 'UnionType':
      return type.elements.map(formatType).join(' | ');
    case 'OptionalType':
      return formatType(type.expression);
    default:
      return type.name || 'any';
  }
}

function extractProperties(td) {
  const propertyTags = td.tags?.filter((tag) => tag.title === 'property') || [];

  return propertyTags
    .filter((tag) => {
      // Only filter out if @internal is at the very start of the description
      const desc = extractText(tag.description);
      return !desc.match(/^@(internal|private)\s/);
    })
    .map((tag) => {
      const isOptional = tag.type?.type === 'OptionalType';
      const actualType = isOptional ? tag.type.expression : tag.type;
      let defaultValue = tag.default?.replace(/^['"]|['"]$/g, '');
      // Remove @internal/@private prefix from description if it exists elsewhere
      let description = extractText(tag.description).replace(/@(internal|private)\s+/gi, '');

      return {
        name: tag.name,
        type: formatType(actualType),
        description,
        optional: isOptional,
        default: defaultValue,
      };
    });
}

function extractTags(item) {
  if (!item?.tags) return {};

  const tags = {};
  item.tags.forEach((tag) => {
    if (['sidebartitle', 'snippetpath', 'shortcut', 'note', 'usage', 'example'].includes(tag.title.toLowerCase())) {
      const key = tag.title.toLowerCase();
      if (key === 'shortcut') {
        // Handle multiple shortcuts
        if (!tags.shortcuts) tags.shortcuts = [];
        tags.shortcuts.push(tag.description);
      } else {
        tags[key] = tag.description || '';
      }
    }
  });

  return tags;
}

/**
 * Get SEO keywords for an extension
 */
function getKeywordsForExtension(name) {
  const keywordMap = {
    'block-node': 'block node, block elements, document structure, word block, document blocks',
    bold: 'bold text, text formatting, strong emphasis, font weight, document styling, word bold',
    'bullet-list': 'bullet points, unordered lists, list formatting, document lists, word bullet lists',
    bookmarks: 'document bookmarks, navigation markers, word bookmarks, document anchors, internal links',
    'content-block': 'content blocks, structured content, document sections, block elements, word content blocks',
    color: 'text color, font color, document styling, color picker, word text color',
    'custom-selection': 'text selection, custom selection, document selection, word selection, editor selection',
    document: 'document management, docx document, word document, document api, document editor',
    dropcursor: 'drop cursor, drop selection, drop navigation, text drop, word drop cursor',
    'font-family': 'font family, typeface, font selection, text fonts, word fonts, typography',
    'font-size': 'font size, text size, typography, text formatting, word font size',
    'format-commands': 'formatting commands, text formatting, document formatting, word commands, editor commands',
    gapcursor: 'gap cursor, gap selection, gap navigation, text gap, word gap cursor',
    heading: 'document headings, h1 h2 h3, document structure, heading levels, word headings, document hierarchy',
    history: 'undo redo, edit history, document history, version control, word undo, document revisions',
    highlight: 'text highlighting, background color, mark text, document annotation, word highlight',
    italic: 'italic text, text emphasis, oblique font, document formatting, word italic, text style',
    image: 'image insertion, image insertion, image insertion, image insertion, image insertion, image insertion',
    'line-break': 'line breaks, paragraph breaks, document formatting, word line breaks, text breaks',
    'line-height': 'line height, line spacing, text spacing, paragraph spacing, word line height',
    link: 'hyperlinks, web links, document links, word hyperlinks, url links, external links',
    'linked-styles': 'linked styles, style inheritance, document styles, word linked styles, style inheritance',
    // 'list-item': 'list items, list formatting, document lists, word list items, list numbering',
    table: 'word tables, complex tables, merge cells, split cells, table borders, docx tables, nested tables',
    'table-cell': 'table cells, cell formatting, table data, word table cells, cell properties',
    'table-header': 'table headers, table headings, table structure, word table headers, table formatting',
    'table-row': 'table rows, row formatting, table structure, word table rows, table layout',
    'text-align': 'text alignment, paragraph alignment, document alignment, word alignment, text justify',
    'text-indent': 'text indentation, paragraph indentation, document indentation, word indentation, text indent',
    'text-style': 'text styling, font formatting, text appearance, document formatting, word text style',
    'text-transform':
      'text transformation, case conversion, document transformation, word text transform, text capitalization',
    underline: 'underline text, text decoration, underlined words, document formatting, word underline',
    search: 'document search, find replace, regex search, text search, word search, document navigation',
    strike: 'strikethrough text, crossed out text, deletion mark, document editing, word strikethrough',
    // 'link': 'hyperlinks, web links, document links, word hyperlinks, url links, external links',
    // 'structured-content': 'structured content, document structure, content organization, document sections, word structure',
    // 'track-changes': 'tracked changes, revision tracking, document revisions, change history, word track changes, document collaboration',
    // 'field-annotation': 'form fields, document fields, fillable forms, docx forms, word form fields, document automation',
    // 'document-section': 'document sections, locked sections, content controls, section protection, word sections, document structure',
    // 'comments': 'word comments api, document annotations, threaded discussions, comment resolution, docx comments'
  };

  return keywordMap[name] || `${name} extension, superdoc ${name}, word ${name}, document ${name}, docx ${name}`;
}

/**
 * Extract GitHub path from full file path
 */
function getGithubPath(fullPath) {
  if (!fullPath) return null;

  // Normalize path separators
  const normalized = fullPath.replace(/\\/g, '/');

  // Extract from 'packages/' onward
  const match = normalized.match(/(packages\/.+)/);
  return match ? match[1] : null;
}

async function parseExtension(name, files) {
  const documentation = await import('documentation');
  const data = await documentation.build(files, {
    shallow: false,
    inferPrivate: '^_',
    github: false,
  });

  if (!data?.length) return null;

  const moduleDoc = data.find((d) => d.kind === 'module');
  const allTypedefs = data.filter((d) => d.kind === 'typedef' && !d.tags?.some((t) => t.title === 'private'));

  const ext = {
    name: moduleDoc?.name || name,
    description: extractText(moduleDoc?.description),
    tags: extractTags(moduleDoc),
    options: allTypedefs.find((td) => hasCategory(td, 'Options')),
    attributes: allTypedefs.find((td) => hasCategory(td, 'Attributes')),
    typedefs: allTypedefs.filter(
      (td) => !hasCategory(td, 'Options') && !hasCategory(td, 'Attributes') && !hasCategory(td, 'Commands'),
    ),
    commands: data.filter((d) => d.kind === 'function' && hasCategory(d, 'Command')),
    helpers: data.filter((d) => d.kind === 'function' && hasCategory(d, 'Helper')),
    githubPath: getGithubPath(moduleDoc?.context?.file) || `packages/super-editor/src/extensions/${name}`,
  };

  // Process typedefs
  if (ext.options)
    ext.options = { ...ext.options, properties: extractProperties(ext.options), examples: ext.options.examples || [] };
  if (ext.attributes) ext.attributes = { ...ext.attributes, properties: extractProperties(ext.attributes) };
  ext.typedefs = ext.typedefs.map((td) => ({
    ...td,
    properties: extractProperties(td),
    description: extractText(td.description),
  }));

  // Process functions
  ext.commands = ext.commands.map((cmd) => ({
    name: cmd.name,
    description: extractText(cmd.description),
    params: (cmd.params || []).map((p) => ({
      name: p.name,
      type: formatType(p.type),
      description: extractText(p.description),
      optional: p.optional || false,
      default: p.default,
    })),
    returns: cmd.returns?.[0]
      ? {
          type: formatType(cmd.returns[0].type),
          description: extractText(cmd.returns[0].description),
        }
      : undefined,
    examples: (cmd.examples || []).map((e) => e.description),
    tags: extractTags(cmd),
  }));

  ext.helpers = ext.helpers.map((h) => ({
    name: h.name,
    description: extractText(h.description),
    params: (h.params || []).map((p) => ({
      name: p.name,
      type: formatType(p.type),
      description: extractText(p.description),
      optional: p.optional || false,
    })),
    returns: h.returns?.[0]
      ? {
          type: formatType(h.returns[0].type),
          description: extractText(h.returns[0].description),
        }
      : undefined,
    examples: (h.examples || []).map((e) => e.description),
    tags: extractTags(h),
  }));

  return ext;
}

/**
 * Generate Mintlify MDX
 */
function generateMDX(ext) {
  const lines = [];

  // Frontmatter
  lines.push('---');
  lines.push(`title: ${ext.name} extension`);
  lines.push(`sidebarTitle: "${ext.tags.sidebartitle || ext.name}"`);
  lines.push(`keywords: "${getKeywordsForExtension(ext.name)}"`);
  lines.push('---\n');

  // Snippet
  if (ext.tags.snippetpath) {
    lines.push(`import Description from '${ext.tags.snippetpath}'\n`);
    lines.push('<Description />\n');
  }

  // Options
  if (ext.options?.properties?.length > 0) {
    lines.push('## Options\n');
    lines.push('Configure the extension behavior:\n');

    ext.options.properties.forEach((prop) => {
      lines.push(
        `<ParamField path="${prop.name}" type="${prop.type}"${!prop.optional ? ' required' : ''}${prop.default ? ` default="${prop.default}"` : ''}>`,
      );
      lines.push(`  ${prop.description}`);
      lines.push('</ParamField>\n');
    });

    // Options from JSDoc @example
    if (ext.options.examples?.length > 0) {
      lines.push('**Example:**\n');
      lines.push('```javascript');
      lines.push(ext.options.examples[0].description);
      lines.push('```\n');
    }
  }

  // Attributes
  if (ext.attributes?.properties?.length > 0) {
    lines.push('## Attributes\n');
    lines.push('Node attributes that can be set and retrieved:\n');

    ext.attributes.properties.forEach((prop) => {
      lines.push(
        `<ParamField path="${prop.name}" type="${prop.type}"${!prop.optional ? ' required' : ''}${prop.default ? ` default="${prop.default}"` : ''}>`,
      );
      lines.push(`  ${prop.description}`);
      lines.push('</ParamField>\n');
    });
  }

  // Commands
  if (ext.commands.length > 0) {
    lines.push('## Commands\n');

    ext.commands.forEach((cmd) => {
      lines.push(`### \`${cmd.name}\`\n`);
      lines.push(cmd.description + '\n');

      if (cmd.tags.note) {
        lines.push('<Note>');
        lines.push(cmd.tags.note);
        lines.push('</Note>\n');
      }

      if (cmd.examples?.length) {
        lines.push('**Example:**\n');
        lines.push('```javascript');
        // Ensure examples have editor.commands prefix if not already present
        let example = cmd.examples[0].trim();
        if (!example.includes('editor.commands.') && !example.includes('//')) {
          // If it's a simple command call without editor prefix, add it
          example = example.replace(/^([a-zA-Z]+)/, 'editor.commands.$1');
        }
        lines.push(example);
        lines.push('```\n');
      }

      if (cmd.params?.length) {
        lines.push('**Parameters:**\n');
        cmd.params.forEach((param) => {
          lines.push(`<ParamField path="${param.name}" type="${param.type}"${!param.optional ? ' required' : ''}>`);
          lines.push(`  ${param.description || ''}`);
          lines.push('</ParamField>');
        });
        lines.push('');
      }

      if (cmd.returns) {
        lines.push(`**Returns:** \`${cmd.returns.type}\` ${cmd.returns.description || ''}\n`);
      }
    });
  }

  // Helpers section
  if (ext.helpers.length > 0) {
    lines.push('## Helpers\n');
    ext.helpers.forEach((helper) => {
      lines.push(`### \`${helper.name}\`\n`);
      lines.push(helper.description + '\n');

      // Examples (if available)
      if (helper.examples?.length) {
        lines.push('**Example:**\n');
        lines.push('```javascript');
        lines.push(helper.examples[0].trim());
        lines.push('```\n');
      }

      // Parameters (if any)
      if (helper.params?.length) {
        lines.push('**Parameters:**\n');
        helper.params.forEach((param) => {
          lines.push(`<ParamField path="${param.name}" type="${param.type}"${!param.optional ? ' required' : ''}>`);
          lines.push(`  ${param.description || ''}`);
          lines.push('</ParamField>');
        });
        lines.push('');
      }

      // Returns - check if it's a typedef
      if (helper.returns) {
        const returnType = helper.returns.type;
        // Check if the return type references a typedef (like Array<BlockNodeInfo>)
        const typedefMatch = returnType.match(/(?:Array<)?(\w+)>?/);
        const baseType = typedefMatch ? typedefMatch[1] : returnType;
        const isTypedef = ext.typedefs?.some((t) => t.name === baseType);

        lines.push('**Returns:**\n');

        if (isTypedef) {
          // Link to the typedef instead of duplicating description
          lines.push(`<ResponseField name="return" type="${returnType}" required>`);
          lines.push(`  See [${baseType}](#${baseType.toLowerCase()}) type definition`);
          lines.push('</ResponseField>\n');
        } else {
          // Simple type, include description
          lines.push(`<ResponseField name="return" type="${returnType}" required>`);
          lines.push(`  ${helper.returns.description || ''}`);
          lines.push('</ResponseField>\n');
        }
      }
    });
  }

  // Shortcuts
  if (ext.tags.shortcuts?.length > 0) {
    lines.push('## Keyboard Shortcuts\n');
    lines.push('| Command | Shortcut | Description |');
    lines.push('|---------|----------|-------------|');
    ext.tags.shortcuts.forEach((shortcut) => {
      const [key, command, description] = shortcut.split('|').map((s) => s.trim());
      lines.push(`| ${command}() | \`${key.replace(/Mod/g, '⌘/Ctrl')}\` | ${description} |`);
    });
    lines.push('');
  }

  // Types
  if (ext.typedefs?.length > 0) {
    lines.push('## Types\n');
    ext.typedefs.forEach((typedef) => {
      lines.push(`### \`${typedef.name}\`\n`);
      if (typedef.description) lines.push(typedef.description + '\n');

      // Show properties if they exist
      if (typedef.properties?.length > 0) {
        lines.push(`<Expandable title="Properties">`);
        typedef.properties.forEach((prop) => {
          lines.push(`<ResponseField name="${prop.name}" type="${prop.type}"${!prop.optional ? ' required' : ''}>`);
          lines.push(`  ${prop.description || ''}`);
          lines.push('</ResponseField>');
        });
        lines.push(`</Expandable>\n`);
      }
    });
  }

  // Add source code section at the very end
  lines.push('\n## Source Code\n');
  lines.push(`import { SourceCodeLink } from '/snippets/components/source-code-link.jsx'\n`);
  lines.push(`<SourceCodeLink path="${ext.githubPath}" />\n`);

  return lines.join('\n');
}

/**
 * Main
 */
async function main() {
  console.log('📚 Syncing SDK documentation\n');

  try {
    fs.mkdirSync(outputDir, { recursive: true });

    for (const name of SUPPORTED) {
      const extPath = path.join(sourceDir, name);
      if (!fs.existsSync(extPath)) {
        console.log(`⚠️  ${name} not found`);
        continue;
      }

      console.log(`📁 Processing ${name}...`);
      const files = getFiles(extPath);
      const extension = await parseExtension(name, files);

      if (!extension) {
        console.log(`   No module found`);
        continue;
      }

      const content = generateMDX(extension);
      fs.writeFileSync(path.join(outputDir, `${name}.mdx`), content);

      const stats = [];
      if (extension.options) stats.push('options');
      if (extension.attributes) stats.push('attributes');
      if (extension.commands.length) stats.push(`${extension.commands.length} commands`);
      if (extension.helpers.length) stats.push(`${extension.helpers.length} helpers`);

      console.log(`   ✓ ${stats.join(', ')}`);
    }

    console.log('\n✅ Complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
