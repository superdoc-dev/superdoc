import { getBrowserType } from './browser-utils';
import { loginToGoogle } from '../tests/interactions/helpers/google-docs-helpers';

async function main() {
  const browserType = getBrowserType('chromium');
  const browserInstance = await browserType.launch({ headless: false });
  try {
    await loginToGoogle(browserInstance);
  } finally {
    browserInstance.close();
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  await main();
}
