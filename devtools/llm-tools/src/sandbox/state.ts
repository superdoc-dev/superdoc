export type SandboxBlock = {
  blockId: string;
  type: 'paragraph' | 'heading' | 'listItem';
  text: string;
};

export type SandboxState = {
  blocks: SandboxBlock[];
};

export function getBlockById(state: SandboxState, blockId: string): SandboxBlock | null {
  return state.blocks.find((block) => block.blockId === blockId) ?? null;
}
