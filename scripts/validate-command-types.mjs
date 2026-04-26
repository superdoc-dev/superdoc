#!/usr/bin/env node
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const commandsDir = path.join(repoRoot, 'packages/super-editor/src/editors/v1/core/commands');
const extensionTypesDir = path.join(repoRoot, 'packages/super-editor/src/editors/v1/extensions/types');

function createSourceFile(filePath, content, scriptKind) {
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKind);
}

function hasExportModifier(node) {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function collectExportedCommandNames(sourceFile) {
  const commandNames = [];

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && hasExportModifier(statement)) {
      commandNames.push(statement.name.text);
      continue;
    }

    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          commandNames.push(declaration.name.text);
        }
      }
    }
  }

  return commandNames;
}

function collectCoreCommandTypeNames(sourceFile) {
  const commandNames = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isTypeAliasDeclaration(statement) || statement.name.text !== 'CoreCommandNames') {
      continue;
    }

    const { type } = statement;
    if (!ts.isUnionTypeNode(type)) {
      continue;
    }

    for (const member of type.types) {
      if (!ts.isLiteralTypeNode(member) || !ts.isStringLiteral(member.literal)) {
        continue;
      }

      commandNames.add(member.literal.text);
    }
  }

  return commandNames;
}

function collectInterfaceCommandNames(sourceFile) {
  const commandNames = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isInterfaceDeclaration(statement)) {
      continue;
    }

    if (!/(Commands|Augmentations)$/.test(statement.name.text)) {
      continue;
    }

    for (const member of statement.members) {
      if (!ts.isPropertySignature(member) && !ts.isMethodSignature(member)) {
        continue;
      }

      if (member.name && ts.isIdentifier(member.name)) {
        commandNames.add(member.name.text);
      }
    }
  }

  return commandNames;
}

async function loadCoreExports() {
  const indexPath = path.join(commandsDir, 'index.js');
  const content = await readFile(indexPath, 'utf8');
  const sourceFile = createSourceFile(indexPath, content, ts.ScriptKind.JS);
  const exportedCommandNames = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) {
      continue;
    }

    if (!ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }

    const modulePath = statement.moduleSpecifier.text;
    if (!modulePath.startsWith('./') || !modulePath.endsWith('.js')) {
      continue;
    }

    const moduleFilePath = path.join(commandsDir, modulePath.replace('./', ''));
    const moduleContent = await readFile(moduleFilePath, 'utf8');
    const moduleSourceFile = createSourceFile(moduleFilePath, moduleContent, ts.ScriptKind.JS);

    for (const commandName of collectExportedCommandNames(moduleSourceFile)) {
      exportedCommandNames.add(commandName);
    }
  }

  return [...exportedCommandNames];
}

async function loadMappedCommands() {
  const mapPath = path.join(commandsDir, 'core-command-map.d.ts');
  const mapContent = await readFile(mapPath, 'utf8');
  const mapSourceFile = createSourceFile(mapPath, mapContent, ts.ScriptKind.TS);
  const typedCommands = collectCoreCommandTypeNames(mapSourceFile);

  const extensionTypeFiles = await readdir(extensionTypesDir);

  for (const fileName of extensionTypeFiles) {
    if (!fileName.endsWith('.ts')) {
      continue;
    }

    const filePath = path.join(extensionTypesDir, fileName);
    const fileContent = await readFile(filePath, 'utf8');
    const sourceFile = createSourceFile(filePath, fileContent, ts.ScriptKind.TS);

    for (const commandName of collectInterfaceCommandNames(sourceFile)) {
      typedCommands.add(commandName);
    }
  }

  return typedCommands;
}

async function main() {
  try {
    const exportsList = await loadCoreExports();
    const mapped = await loadMappedCommands();
    const missing = exportsList.filter((name) => !mapped.has(name));

    if (missing.length) {
      console.warn('[validate-command-types] missing type entries:', missing.join(', '));
    } else {
      console.log('[validate-command-types] all core commands mapped ✔');
    }
  } catch (error) {
    console.error('[validate-command-types] failed:', error);
    process.exitCode = 1;
  }
}

main();
