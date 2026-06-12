import { chromium, devices } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '../..');
const repoRoot = path.resolve(appDir, '../..');
const defaultOutputDir = path.resolve(repoRoot, 'output/perf');
const seedScriptPath = path.resolve(scriptDir, 'seedPowerUserDb.mjs');

function parseArgs(argv) {
  const args = {
    url: 'http://127.0.0.1:4173',
    runs: 5,
    cpuThrottle: 4,
    network: 'fast3g',
    outputDir: defaultOutputDir,
    transactions: 5000,
    customers: 500,
    catalog: 1000,
    startServer: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--url') {
      args.url = next;
      index += 1;
    } else if (arg === '--runs') {
      args.runs = Number(next);
      index += 1;
    } else if (arg === '--cpu-throttle') {
      args.cpuThrottle = Number(next);
      index += 1;
    } else if (arg === '--network') {
      args.network = next;
      index += 1;
    } else if (arg === '--output-dir') {
      args.outputDir = path.resolve(next);
      index += 1;
    } else if (arg === '--transactions') {
      args.transactions = Number(next);
      index += 1;
    } else if (arg === '--customers') {
      args.customers = Number(next);
      index += 1;
    } else if (arg === '--catalog') {
      args.catalog = Number(next);
      index += 1;
    } else if (arg === '--no-server') {
      args.startServer = false;
    }
  }

  return args;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(label, timeoutMs, task) {
  let timeoutId = null;
  try {
    return await Promise.race([
      task(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function waitForUrl(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await wait(500);
  }

  throw new Error(`Timed out waiting for ${url}${lastError ? `: ${lastError.message}` : ''}`);
}

function startPreviewServer() {
  const child = spawn('pnpm', ['serve'], {
    cwd: appDir,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '4173' },
  });

  child.stdout.on('data', (chunk) => process.stdout.write(`[vite-preview] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[vite-preview] ${chunk}`));

  return child;
}

async function stopPreviewServer(child) {
  if (!child?.pid) return;

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: false,
      });
      killer.on('close', () => resolve());
      killer.on('error', () => resolve());
    });
    return;
  }

  child.kill('SIGTERM');
}

async function configureThrottling(page, args) {
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: args.cpuThrottle });

  if (args.network !== 'none') {
    await client.send('Network.enable');

    const profiles = {
      fast3g: {
        offline: false,
        latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
      },
      slow3g: {
        offline: false,
        latency: 400,
        downloadThroughput: (400 * 1024) / 8,
        uploadThroughput: (400 * 1024) / 8,
      },
    };

    const profile = profiles[args.network] || profiles.fast3g;
    await client.send('Network.emulateNetworkConditions', profile);
  }

  return client;
}

async function installSeeder(page) {
  const seedSource = await fs.readFile(seedScriptPath, 'utf8');
  const browserSource = seedSource
    .replace(/export\s+\{\s*seedPowerUserDatabase\s*\};?\s*$/m, '')
    + '\nwindow.__seedPowerUserDatabase = seedPowerUserDatabase;\n';
  await page.addScriptTag({ content: browserSource });
}

async function waitForQuietWindow(page, quietWindowMs = 1000, timeoutMs = 20_000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const quiet = await page.evaluate((windowMs) => {
      const perf = window.__gebyaPerf;
      const now = performance.now();
      const lastLongTask = perf?.longTasks?.at(-1);
      return !lastLongTask || now - lastLongTask.end >= windowMs;
    }, quietWindowMs);

    if (quiet) return;
    await wait(100);
  }
}

async function measureOneRun(context, args, runIndex) {
  const page = await context.newPage();
  const client = await configureThrottling(page, args);

  await page.addInitScript(() => {
    window.__gebyaPerf = {
      longTasks: [],
      appReadyAt: null,
    };

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__gebyaPerf.longTasks.push({
          name: entry.name,
          start: entry.startTime,
          duration: entry.duration,
          end: entry.startTime + entry.duration,
        });
      }
    });

    observer.observe({ type: 'longtask', buffered: true });
  });

  await page.goto(args.url, { waitUntil: 'domcontentloaded' });
  await page.getByText(/Power Mart Addis/i).waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('nav').waitFor({ state: 'visible', timeout: 30_000 });

  await page.evaluate(() => {
    window.__gebyaPerf.appReadyAt = performance.now();
  });

  await waitForQuietWindow(page);

  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const paintEntries = Object.fromEntries(
      performance.getEntriesByType('paint').map((entry) => [entry.name, entry.startTime])
    );
    const longTasks = window.__gebyaPerf.longTasks;
    const appReadyAt = window.__gebyaPerf.appReadyAt;
    const quietLongTask = longTasks.at(-1);
    const quietWindowEnd = Math.max(appReadyAt || 0, quietLongTask ? quietLongTask.end + 1000 : 0);

    return {
      navigation: navigation ? navigation.toJSON() : null,
      paints: paintEntries,
      appReadyMs: appReadyAt,
      ttiProxyMs: quietWindowEnd,
      totalBlockingTimeMs: longTasks.reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0),
      maxLongTaskMs: longTasks.reduce((max, task) => Math.max(max, task.duration), 0),
      longTaskCount: longTasks.length,
      longTasks,
      transferSizeBytes: performance.getEntriesByType('resource')
        .reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
    };
  });

  await client.detach();
  await page.close();

  return {
    run: runIndex,
    appReadyMs: Math.round(metrics.appReadyMs),
    ttiProxyMs: Math.round(metrics.ttiProxyMs),
    totalBlockingTimeMs: Math.round(metrics.totalBlockingTimeMs),
    maxLongTaskMs: Math.round(metrics.maxLongTaskMs),
    longTaskCount: metrics.longTaskCount,
    firstContentfulPaintMs: Math.round(metrics.paints['first-contentful-paint'] || 0),
    domContentLoadedMs: Math.round(metrics.navigation?.domContentLoadedEventEnd || 0),
    loadEventEndMs: Math.round(metrics.navigation?.loadEventEnd || 0),
    transferSizeBytes: metrics.transferSizeBytes,
    longTasks: metrics.longTasks,
  };
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((total, value) => total + value, 0);
  const percentile = (p) => {
    if (!sorted.length) return 0;
    const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[index];
  };

  return {
    min: Math.round(sorted[0] || 0),
    median: Math.round(percentile(50)),
    p75: Math.round(percentile(75)),
    max: Math.round(sorted.at(-1) || 0),
    mean: Math.round(sum / Math.max(1, values.length)),
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  await fs.mkdir(args.outputDir, { recursive: true });
  const stageLogPath = path.join(args.outputDir, 'power-user-cold-load-stage.log');
  const logStage = async (message) => {
    const line = `${new Date().toISOString()} ${message}`;
    console.log(line);
    await fs.appendFile(stageLogPath, `${line}\n`);
  };

  let server = null;
  if (args.startServer) {
    await logStage('starting vite preview server');
    server = startPreviewServer();
    await withTimeout('wait for preview server', 120_000, () => waitForUrl(args.url));
    await logStage('preview server is reachable');
  }

  const profileDir = path.join(args.outputDir, `power-user-profile-${Date.now()}`);
  const device = devices['Pixel 5'];
  await logStage(`launching chromium profile ${profileDir}`);
  const context = await withTimeout('launch chromium', 60_000, () => chromium.launchPersistentContext(profileDir, {
    ...device,
    headless: true,
    serviceWorkers: 'block',
    bypassCSP: true,
    args: [
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--no-first-run',
    ],
  }));
  await logStage('chromium launched');

  try {
    await logStage('preparing origin for IndexedDB seed');
    const seedPage = await context.newPage();
    await seedPage.route('**/*', async (route) => {
      if (route.request().resourceType() === 'document') {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><html><head><title>Gebya perf seed</title></head><body>seed</body></html>',
        });
      } else {
        await route.abort();
      }
    });
    await withTimeout('open seed page', 30_000, () => seedPage.goto(args.url, { waitUntil: 'domcontentloaded' }));
    await installSeeder(seedPage);
    await logStage('seeding IndexedDB power-user dataset');
    const seedResult = await withTimeout('seed IndexedDB', 120_000, () => seedPage.evaluate(async (seedOptions) => {
      return await window.__seedPowerUserDatabase(seedOptions);
    }, {
      transactions: args.transactions,
      customers: args.customers,
      catalog: args.catalog,
    }));
    await logStage(`seed complete ${JSON.stringify(seedResult.counts)}`);
    await seedPage.close();

    const runs = [];
    for (let index = 1; index <= args.runs; index += 1) {
      await logStage(`measuring cold load run ${index}/${args.runs}`);
      runs.push(await withTimeout(`measure run ${index}`, 90_000, () => measureOneRun(context, args, index)));
      await logStage(`completed run ${index}/${args.runs}`);
    }

    const report = {
      generatedAt: new Date().toISOString(),
      appUrl: args.url,
      device: 'Pixel 5',
      throttling: {
        cpuThrottle: args.cpuThrottle,
        network: args.network,
      },
      seed: seedResult,
      metrics: {
        ttiProxyMs: summarize(runs.map((item) => item.ttiProxyMs)),
        totalBlockingTimeMs: summarize(runs.map((item) => item.totalBlockingTimeMs)),
        appReadyMs: summarize(runs.map((item) => item.appReadyMs)),
        firstContentfulPaintMs: summarize(runs.map((item) => item.firstContentfulPaintMs)),
        maxLongTaskMs: summarize(runs.map((item) => item.maxLongTaskMs)),
      },
      runs,
      notes: [
        'ttiProxyMs is navigation start to app-visible plus a 1000ms quiet window with no browser long tasks.',
        'totalBlockingTimeMs is sum(max(0, longTask.duration - 50ms)) captured by PerformanceObserver longtask entries.',
        'serviceWorkers are blocked so repeated runs do not hide app startup behind a warm PWA cache.',
      ],
    };

    const reportPath = path.join(args.outputDir, `power-user-cold-load-${Date.now()}.json`);
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    await logStage(`wrote report ${reportPath}`);

    console.log(JSON.stringify({
      reportPath,
      seed: report.seed.counts,
      metrics: report.metrics,
    }, null, 2));
  } finally {
    await context.close();
    if (server) {
      await stopPreviewServer(server);
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
