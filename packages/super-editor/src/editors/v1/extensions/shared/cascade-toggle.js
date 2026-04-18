/**
 * Utility helpers for cascade-aware mark toggles.
 */
export function createCascadeToggleCommands({
  markName,
  setCommand,
  unsetCommand,
  toggleCommand,
  negationAttrs,
  isNegation,
  extendEmptyMarkRange,
} = {}) {
  if (!markName) throw new Error('createCascadeToggleCommands requires a markName');

  const capitalized = markName.charAt(0).toUpperCase() + markName.slice(1);
  const setName = setCommand ?? `set${capitalized}`;
  const unsetName = unsetCommand ?? `unset${capitalized}`;
  const toggleName = toggleCommand ?? `toggle${capitalized}`;

  const cascadeOptions = {};
  if (negationAttrs) cascadeOptions.negationAttrs = negationAttrs;
  if (typeof isNegation === 'function') cascadeOptions.isNegation = isNegation;
  if (extendEmptyMarkRange !== undefined) cascadeOptions.extendEmptyMarkRange = extendEmptyMarkRange;

  return {
    [setName]:
      () =>
      ({ commands }) =>
        commands.setMark(markName),

    [unsetName]:
      () =>
      ({ commands }) =>
        commands.unsetMark(markName),

    [toggleName]:
      () =>
      ({ commands }) =>
        commands.toggleMarkCascade(markName, cascadeOptions),
  };
}
