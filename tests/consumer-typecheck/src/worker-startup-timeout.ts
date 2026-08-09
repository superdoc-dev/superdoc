import type { Config } from 'superdoc';

// SD-4118: applications serving a large worker chunk need to move the boot
// handshake budget without patching the shipped bundle.
const config: Config = {
  selector: '#editor',
  workerStartupTimeoutMs: 60_000,
};

void config;
