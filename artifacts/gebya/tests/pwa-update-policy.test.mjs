// The app must never reload itself under the user.
//
// vite-plugin-pwa's `autoUpdate` calls updateSW() the moment a new service
// worker appears, which reloads the page wherever the user is — including the
// middle of a sale. That throws away a half-typed transaction, which for a
// shopkeeper is worse than running one build behind. Updates are applied from
// the banner instead (PwaInstallPanel -> usePwaInstall.applyUpdate), so the
// user decides when.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const config = readFileSync(join(here, '../vite.config.ts'), 'utf8');

describe('PWA update policy', () => {
  it('registers the service worker in prompt mode', () => {
    expect(config).toMatch(/registerType:\s*["']prompt["']/);
  });

  it('does not silently reload the page on a new build', () => {
    expect(config).not.toMatch(/registerType:\s*["']autoUpdate["']/);
  });
});