import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { invokeCommand } from '../index';
import type { CliIO } from '../lib/types';
import { InMemorySessionPool } from '../host/session-pool';
import { listContractOperations } from '../lib/contract';
import { createPreviewServer, openInBrowser, previewManager } from '../lib/preview';
import { getContextPaths } from '../lib/context';

// Store original console methods to restore for our output
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
};

function suppressConsole() {
  console.log = () => {};
  console.warn = () => {};
  console.info = () => {};
  console.debug = () => {};
}

function restoreConsole() {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
  console.debug = originalConsole.debug;
}

const INTERACTIVE_HELP = `SuperDoc Interactive Mode

Built-in commands (interactive only):
  :commands         List all available commands
  :help             Show this help
  :help <command>   Show detailed help for a command (e.g., :help find)
  :script <file>    Run a script file
  :status           Show current session & preview status
  :preview          Open document in browser (real-time sync)
  :preview stop     Stop preview server
  :quit / :exit     Exit the shell

Multiline mode:
  End a line with ; to continue on the next line.
  Press Enter on empty line to execute. Ctrl-C to cancel.
  Only the last command's output is shown.

Example session:
  > open ./contract.docx
  > :preview
  > find --type paragraph --limit 5
  > create paragraph --at document-start --text "Hello";
  create paragraph --at document-start --text "World";

  > save --in-place
  > :quit

Tip: Use ':commands' to see all operations.
`;

const BUILTIN_COMMANDS_HEADER = `Built-in commands:
  :commands         List all available commands
  :help             Show this help
  :help <command>   Show detailed help for a command
  :script <file>    Run a script file
  :status           Show current session & preview status
  :preview          Open document in browser
  :preview stop     Stop preview server
  :quit / :exit     Exit the shell

Document operations:
`;

type ParsedInteractiveCommand = {
  help: boolean;
  sessionId?: string;
};

export function parseInteractiveTokens(tokens: string[]): ParsedInteractiveCommand {
  let help = false;
  let sessionId: string | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }

    if (token === '--session' || token.startsWith('--session=')) {
      const value = token === '--session' ? tokens[++i] : token.slice('--session='.length);
      sessionId = value;
      continue;
    }

    // Unknown token - could extend later
  }

  return { help, sessionId };
}

/**
 * Parse a command line string into argv tokens, respecting quotes.
 */
function parseCommandLine(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escape = false;

  for (const char of line) {
    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    if (char === '\\' && !inSingleQuote) {
      escape = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (char === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

export async function runInteractive(tokens: string[], io: CliIO): Promise<number> {
  const parsed = parseInteractiveTokens(tokens);

  if (parsed.help) {
    io.stdout(INTERACTIVE_HELP);
    return 0;
  }

  const sessionPool = new InMemorySessionPool();
  let activeSessionId: string | undefined = parsed.sessionId;

  // Buffer for multiline commands (lines ending with ;)
  const commandBuffer: string[] = [];

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
    terminal: true,
  });

  const setPrompt = (multiline: boolean) => {
    rl.setPrompt(multiline ? '' : '> ');
  };

  /**
   * Execute a single CLI command and return the result.
   */
  async function executeCommand(
    commandLine: string,
    showOutput: boolean,
  ): Promise<{ output: string | null; newSessionId?: string; sessionClosed?: boolean }> {
    const argv = parseCommandLine(commandLine);
    if (argv.length === 0) {
      return { output: null };
    }

    // Inject active session if not overridden in command
    if (activeSessionId && !argv.includes('--session')) {
      argv.push('--session', activeSessionId);
    }

    suppressConsole();

    try {
      const result = await invokeCommand(argv, {
        ioOverrides: {
          stdout: () => {},
          stderr: () => {},
        },
        executionMode: 'host',
        sessionPool,
      });

      restoreConsole();

      let output: string | null = null;
      let newSessionId: string | undefined;
      let sessionClosed = false;

      if (result.helpText) {
        output = result.helpText;
      } else if (result.versionText) {
        output = result.versionText;
      } else if (result.execution) {
        const exec = result.execution as unknown as Record<string, unknown>;
        const data = exec.data as Record<string, unknown> | undefined;

        // Track session from open/close commands
        if (exec.command === 'open' && data?.contextId) {
          newSessionId = data.contextId as string;
        } else if (exec.command === 'close') {
          sessionClosed = true;
        }

        if (showOutput) {
          // Show pretty output first if available, then full JSON
          const parts: string[] = [];
          if (exec.pretty) {
            parts.push(String(exec.pretty));
          }
          parts.push(JSON.stringify(exec, null, 2));
          output = parts.join('\n\n');
        }
      }

      return { output, newSessionId, sessionClosed };
    } catch (err) {
      restoreConsole();
      const message = err instanceof Error ? err.message : String(err);
      return { output: `Error: ${message}` };
    }
  }

  /**
   * Execute multiple commands in sequence, showing only the last command's output.
   */
  async function executeCommands(commands: string[]): Promise<void> {
    for (let i = 0; i < commands.length; i++) {
      const isLast = i === commands.length - 1;
      const result = await executeCommand(commands[i], isLast);

      // Update session state
      if (result.newSessionId) {
        activeSessionId = result.newSessionId;
      } else if (result.sessionClosed) {
        activeSessionId = undefined;
      }

      // Only show output for the last command
      if (isLast && result.output) {
        process.stdout.write(result.output + '\n');
      }
    }

    // Auto-checkpoint if preview is active (so browser sees changes)
    if (activeSessionId && previewManager.get(activeSessionId)) {
      try {
        await sessionPool.checkpoint(activeSessionId);
      } catch {
        // Ignore checkpoint errors
      }
    }
  }

  /**
   * Handle built-in shell commands (prefixed with :). Returns true if handled.
   */
  async function handleBuiltinCommand(cmd: string): Promise<boolean> {
    if (cmd === ':help') {
      io.stdout(INTERACTIVE_HELP);
      return true;
    }

    // ':help <command>' → search for matching commands, then show details
    if (cmd.startsWith(':help ')) {
      const commandQuery = cmd.slice(6).trim().toLowerCase();
      if (commandQuery) {
        const allOps = listContractOperations();

        // First: exact match on full command
        const exactMatch = allOps.find((op) => op.command.join(' ').toLowerCase() === commandQuery);
        if (exactMatch) {
          const argv = ['describe', 'command', exactMatch.id, '--pretty'];
          suppressConsole();
          try {
            const result = await invokeCommand(argv, {
              ioOverrides: { stdout: () => {}, stderr: () => {} },
              executionMode: 'host',
              sessionPool,
            });
            restoreConsole();
            if (result.execution) {
              process.stdout.write(result.execution.pretty + '\n');
            }
          } catch (err) {
            restoreConsole();
            const message = err instanceof Error ? err.message : String(err);
            process.stderr.write(`Error: ${message}\n`);
          }
          return true;
        }

        // Second: partial match on first two tokens
        const matches = allOps.filter((op) => {
          const opTokens = op.command.slice(0, 2);
          return opTokens.some((token) => token.toLowerCase().includes(commandQuery));
        });

        if (matches.length === 0) {
          process.stdout.write(`No commands found matching "${commandQuery}"\n`);
        } else if (matches.length === 1) {
          // Single match - show detailed help
          const argv = ['describe', 'command', matches[0].id, '--pretty'];
          suppressConsole();
          try {
            const result = await invokeCommand(argv, {
              ioOverrides: { stdout: () => {}, stderr: () => {} },
              executionMode: 'host',
              sessionPool,
            });
            restoreConsole();
            if (result.execution) {
              process.stdout.write(result.execution.pretty + '\n');
            }
          } catch (err) {
            restoreConsole();
            const message = err instanceof Error ? err.message : String(err);
            process.stderr.write(`Error: ${message}\n`);
          }
        } else {
          // Multiple matches - list them
          process.stdout.write(`Commands matching "${commandQuery}":\n`);
          for (const op of matches) {
            process.stdout.write(`  ${op.command.join(' ')}\n`);
          }
          process.stdout.write(`\nUse 'help <full command>' for details.\n`);
        }
        return true;
      }
    }

    // ':commands' → describe --pretty with built-ins header
    if (cmd === ':commands') {
      suppressConsole();
      try {
        const result = await invokeCommand(['describe', '--pretty'], {
          ioOverrides: { stdout: () => {}, stderr: () => {} },
          executionMode: 'host',
          sessionPool,
        });
        restoreConsole();
        if (result.execution) {
          process.stdout.write(BUILTIN_COMMANDS_HEADER + result.execution.pretty + '\n');
        }
      } catch (err) {
        restoreConsole();
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error: ${message}\n`);
      }
      return true;
    }

    // ':status' → show current session status including preview
    if (cmd === ':status') {
      if (!activeSessionId) {
        process.stdout.write('No active session. Use "open <file>" to start.\n');
      } else {
        const previewServer = previewManager.get(activeSessionId);
        process.stdout.write(`Session: ${activeSessionId}\n`);
        if (previewServer) {
          process.stdout.write(`Preview: ${previewServer.url}\n`);
        } else {
          process.stdout.write('Preview: not active (use ":preview" to start)\n');
        }
      }
      return true;
    }

    // ':preview' → start preview server for current session
    if (cmd === ':preview') {
      if (!activeSessionId) {
        process.stderr.write('No active session. Use "open <file>" first.\n');
        return true;
      }

      const existingServer = previewManager.get(activeSessionId);
      if (existingServer) {
        process.stdout.write(`Preview already running: ${existingServer.url}\n`);
        return true;
      }

      try {
        // Get the working document path from the session context
        const paths = getContextPaths(activeSessionId);
        const documentPath = paths.workingDocPath;

        // First checkpoint to ensure the working doc is up to date
        await sessionPool.checkpoint(activeSessionId);

        const previewServer = await createPreviewServer({
          documentPath,
        });
        previewManager.register(activeSessionId, previewServer);
        process.stdout.write(`Preview started: ${previewServer.url}\n`);
        process.stdout.write(`Serving: ${documentPath}\n`);

        // Try to open browser
        try {
          await openInBrowser(previewServer.url);
        } catch {
          process.stdout.write('(Browser did not open automatically)\n');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Failed to start preview: ${message}\n`);
      }
      return true;
    }

    // ':preview stop' → stop preview server
    if (cmd === ':preview stop') {
      if (!activeSessionId) {
        process.stderr.write('No active session.\n');
        return true;
      }

      const stopped = await previewManager.stop(activeSessionId);
      if (stopped) {
        process.stdout.write('Preview stopped.\n');
      } else {
        process.stdout.write('No preview server was running.\n');
      }
      return true;
    }

    // ':script <file>' → run a script file
    if (cmd.startsWith(':script ')) {
      const scriptPath = cmd.slice(':script '.length).trim();
      if (!scriptPath) {
        process.stderr.write('Usage: :script <file>\n');
        return true;
      }

      let content: string;
      try {
        content = await readFile(scriptPath, 'utf-8');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error reading script: ${message}\n`);
        return true;
      }

      // Parse lines: strip trailing ;, skip empty lines and comments
      const scriptCommands = content
        .split('\n')
        .map((line) => {
          const trimmed = line.trim();
          return trimmed.endsWith(';') ? trimmed.slice(0, -1).trim() : trimmed;
        })
        .filter((line) => line.length > 0 && !line.startsWith('#'));

      if (scriptCommands.length === 0) {
        process.stderr.write('Script contains no commands.\n');
        return true;
      }

      // Execute script commands
      for (let i = 0; i < scriptCommands.length; i++) {
        const isLast = i === scriptCommands.length - 1;
        const result = await executeCommand(scriptCommands[i], isLast);

        if (result.newSessionId) {
          activeSessionId = result.newSessionId;
        } else if (result.sessionClosed) {
          activeSessionId = undefined;
        }

        if (isLast && result.output) {
          process.stdout.write(result.output + '\n');
        }
      }

      // Auto-checkpoint if preview is active
      if (activeSessionId && previewManager.get(activeSessionId)) {
        try {
          await sessionPool.checkpoint(activeSessionId);
        } catch {
          // Ignore checkpoint errors
        }
      }

      return true;
    }

    return false;
  }

  io.stdout('SuperDoc Interactive Mode. Type ":help" for commands, ":exit" to quit.\n');
  rl.prompt();

  return new Promise((resolve) => {
    rl.on('line', async (line) => {
      const trimmed = line.trim();

      // Empty line
      if (!trimmed) {
        // If we're in multiline mode, execute buffered commands
        if (commandBuffer.length > 0) {
          const commands = [...commandBuffer];
          commandBuffer.length = 0;
          setPrompt(false);
          await executeCommands(commands);
          rl.prompt();
          return;
        }
        rl.prompt();
        return;
      }

      // Check for multiline continuation (line ends with ;)
      if (trimmed.endsWith(';')) {
        const command = trimmed.slice(0, -1).trim();
        if (command) {
          commandBuffer.push(command);
        }
        setPrompt(true);
        rl.prompt();
        return;
      }

      // Not a continuation - collect all commands to execute
      const commands = [...commandBuffer, trimmed];
      commandBuffer.length = 0;
      setPrompt(false);

      // Handle :exit/:quit
      if (commands.length === 1 && (commands[0] === ':exit' || commands[0] === ':quit')) {
        rl.close();
        return;
      }

      // Handle built-in commands (only for single commands)
      if (commands.length === 1) {
        const handled = await handleBuiltinCommand(commands[0]);
        if (handled) {
          rl.prompt();
          return;
        }
      }

      // Execute all commands (document operations)
      await executeCommands(commands);
      rl.prompt();
    });

    rl.on('close', async () => {
      // Clean up preview servers and sessions
      await previewManager.stopAll();
      await sessionPool.disposeAll();
      resolve(0);
    });

    rl.on('SIGINT', () => {
      // If in multiline mode, cancel the buffer instead of exiting
      if (commandBuffer.length > 0) {
        commandBuffer.length = 0;
        setPrompt(false);
        process.stdout.write('\n(multiline input cancelled)\n');
        rl.prompt();
        return;
      }
      rl.close();
    });
  });
}

/**
 * Run a script file containing CLI commands.
 * Each line is a command (trailing ; is optional and stripped).
 * Only the last command's output is printed.
 */
export async function runScript(scriptPath: string, io: CliIO): Promise<number> {
  let content: string;
  try {
    content = await readFile(scriptPath, 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    io.stderr(`Error reading script: ${message}\n`);
    return 1;
  }

  // Parse lines: strip trailing ;, skip empty lines and comments
  const commands = content
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      // Strip trailing semicolon if present
      return trimmed.endsWith(';') ? trimmed.slice(0, -1).trim() : trimmed;
    })
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  if (commands.length === 0) {
    io.stderr('Script contains no commands.\n');
    return 1;
  }

  const sessionPool = new InMemorySessionPool();
  let activeSessionId: string | undefined;

  suppressConsole();

  try {
    for (let i = 0; i < commands.length; i++) {
      const isLast = i === commands.length - 1;
      const commandLine = commands[i];
      const argv = parseCommandLine(commandLine);

      if (argv.length === 0) continue;

      // Inject active session if not overridden
      if (activeSessionId && !argv.includes('--session')) {
        argv.push('--session', activeSessionId);
      }

      try {
        const result = await invokeCommand(argv, {
          ioOverrides: { stdout: () => {}, stderr: () => {} },
          executionMode: 'host',
          sessionPool,
        });

        // Track session state
        if (result.execution) {
          const exec = result.execution as unknown as Record<string, unknown>;
          const data = exec.data as Record<string, unknown> | undefined;

          if (exec.command === 'open' && data?.contextId) {
            activeSessionId = data.contextId as string;
          } else if (exec.command === 'close') {
            activeSessionId = undefined;
          }

          // Only show output for the last command
          if (isLast) {
            restoreConsole();
            const parts: string[] = [];
            if (exec.pretty) {
              parts.push(String(exec.pretty));
            }
            parts.push(JSON.stringify(exec, null, 2));
            process.stdout.write(parts.join('\n\n') + '\n');
          }
        } else if (isLast) {
          restoreConsole();
          if (result.helpText) {
            process.stdout.write(result.helpText + '\n');
          }
        }
      } catch (err) {
        restoreConsole();
        const message = err instanceof Error ? err.message : String(err);
        io.stderr(`Error on line ${i + 1}: ${message}\n`);
        io.stderr(`  Command: ${commandLine}\n`);
        await sessionPool.disposeAll();
        return 1;
      }
    }

    restoreConsole();
    await sessionPool.disposeAll();
    return 0;
  } catch (err) {
    restoreConsole();
    const message = err instanceof Error ? err.message : String(err);
    io.stderr(`Script error: ${message}\n`);
    await sessionPool.disposeAll();
    return 1;
  }
}
