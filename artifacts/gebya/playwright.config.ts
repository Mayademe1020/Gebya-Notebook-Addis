import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const e2ePort = Number(process.env.GEBYA_E2E_PORT || 4174);
const e2eBaseURL = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: {
    baseURL: e2eBaseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `node ./node_modules/vite/bin/vite.js preview --config vite.config.ts --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    url: e2eBaseURL,
    reuseExistingServer: false,
    timeout: 120000,
    cwd: configDir,
  },
});
