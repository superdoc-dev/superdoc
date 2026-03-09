import type { Executor } from '../types.js';
import { parseTarget } from './utils.js';

export async function routeControl(params: Record<string, unknown>, execute: Executor) {
  const action = params.action as string;
  const target = parseTarget(params);

  switch (action) {
    case 'list':
      return execute('contentControls.list', {});
    case 'get':
      return execute('contentControls.get', { target });
    case 'fill': {
      // Auto-detect control type and route to the right operation.
      const control = (await execute('contentControls.get', { target })) as Record<string, unknown>;
      const controlType = control?.controlType as string;

      switch (controlType) {
        case 'checkbox':
          return execute('contentControls.checkbox.setState', {
            target,
            checked: params.value === true || params.value === 'true',
          });
        case 'dropDownList':
        case 'comboBox':
          return execute('contentControls.choiceList.setSelected', { target, value: params.value });
        case 'date':
          return execute('contentControls.date.setValue', { target, value: params.value });
        default:
          // Default to text for plainText, richText, and unknown types
          return execute('contentControls.text.setValue', { target, value: params.value });
      }
    }
    case 'wrap':
      return execute('contentControls.wrap', { target, kind: params.type });
    default:
      throw new Error(`Unknown control action: "${action}".`);
  }
}
