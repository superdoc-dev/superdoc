import type { ParsedArgs } from './args';
import { getBooleanOption, getStringOption } from './args';
import { CliError } from './errors';

export type ChangeMode = 'direct' | 'tracked';

export function resolveChangeMode(parsed: ParsedArgs, commandName: string): ChangeMode {
  const tracked = getBooleanOption(parsed, 'tracked');
  const direct = getBooleanOption(parsed, 'direct');
  const mode = getStringOption(parsed, 'change-mode');

  if (tracked && direct) {
    throw new CliError('INVALID_ARGUMENT', `${commandName}: use only one of --tracked or --direct.`);
  }

  if (mode && mode !== 'direct' && mode !== 'tracked') {
    throw new CliError('INVALID_ARGUMENT', `${commandName}: --change-mode must be "direct" or "tracked".`);
  }

  const requested = tracked ? 'tracked' : direct ? 'direct' : mode;
  return (requested as ChangeMode | undefined) ?? 'direct';
}
