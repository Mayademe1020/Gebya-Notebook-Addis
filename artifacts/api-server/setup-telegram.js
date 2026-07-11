#!/usr/bin/env node
/**
 * setup-telegram.js — Interactive setup for Telegram bot + automated reminders.
 *
 * Usage:
 *   node setup-telegram.js                     # Interactive mode
 *   node setup-telegram.js --token BOT_TOKEN   # One-shot mode
 *
 * What it does:
 *   1. Validates your Telegram bot token
 *   2. Gets bot info (username, name)
 *   3. Generates webhook secret + cron secret
 *   4. Registers webhook on Telegram
 *   5. Updates .env file
 *   6. Prints next steps for Vercel deployment
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');

const ENV_PATH = path.join(__dirname, '.env');
const ENV_EXAMPLE_PATH = path.join(__dirname, '.env.example');

// ─── Helpers ───────────────────────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Invalid JSON: ${data}`)); }
      });
    }).on('error', reject);
  });
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(body);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Invalid JSON: ${data}`)); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function generateSecret() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

function updateEnv(updates) {
  let env = '';
  if (fs.existsSync(ENV_PATH)) {
    env = fs.readFileSync(ENV_PATH, 'utf-8');
  } else if (fs.existsSync(ENV_EXAMPLE_PATH)) {
    env = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf-8');
  }

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^(#\\s*)?${key}=.*$`, 'm');
    if (regex.test(env)) {
      env = env.replace(regex, `${key}=${value}`);
    } else {
      env += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(ENV_PATH, env.trim() + '\n', 'utf-8');
}

function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  let token = null;

  // Parse --token flag
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--token' && args[i + 1]) {
      token = args[i + 1];
    }
  }

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   Gebya Telegram Bot Setup                      ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Step 1: Get token
  if (!token) {
    console.log('📋 STEP 1: Get your bot token');
    console.log('   1. Open Telegram and search for @BotFather');
    console.log('   2. Send: /newbot');
    console.log('   3. Choose a name (e.g. "Gebya Reminder Bot")');
    console.log('   4. Choose a username (e.g. "gebya_reminder_bot")');
    console.log('   5. Copy the token BotFather gives you\n');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    token = await askQuestion(rl, '🔑 Paste your bot token: ');
    rl.close();

    if (!token || !token.includes(':')) {
      console.error('❌ Invalid token format. Expected: 123456789:ABCdefGHI...');
      process.exit(1);
    }
  }

  // Step 2: Validate token
  console.log('\n🔍 Validating bot token...');
  const botInfo = await httpGet(`https://api.telegram.org/bot${token}/getMe`);

  if (!botInfo.ok) {
    console.error(`❌ Invalid token: ${botInfo.description || 'unknown error'}`);
    process.exit(1);
  }

  const botUsername = botInfo.result.username;
  const botName = botInfo.result.first_name;
  console.log(`✅ Bot found: ${botName} (@${botUsername})`);

  // Step 3: Generate secrets
  console.log('\n🔐 Generating secrets...');
  const webhookSecret = generateSecret();
  const cronSecret = generateSecret();
  console.log(`   Webhook secret: ${webhookSecret.slice(0, 8)}...`);
  console.log(`   Cron secret: ${cronSecret.slice(0, 8)}...`);

  // Step 4: Get deployment URL
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('\n🌐 STEP 2: Your Vercel deployment URL');
  console.log('   This is where your API server is deployed.');
  console.log('   Example: https://gebya-api.vercel.app\n');

  const deploymentUrl = await askQuestion(rl, '🔗 Paste your deployment URL (or press Enter to skip): ');
  rl.close();

  // Step 5: Register webhook
  if (deploymentUrl) {
    const webhookUrl = `${deploymentUrl.replace(/\/$/, '')}/api/telegram/webhook`;
    console.log(`\n📡 Registering webhook: ${webhookUrl}`);

    const result = await httpPost(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ['message', 'callback_query'],
      }
    );

    if (result.ok) {
      console.log('✅ Webhook registered successfully!');
    } else {
      console.log(`⚠️  Webhook registration failed: ${result.description}`);
      console.log('   You can register manually later.');
    }
  }

  // Step 6: Update .env
  console.log('\n📝 Updating .env file...');
  updateEnv({
    TELEGRAM_BOT_TOKEN: token,
    TELEGRAM_BOT_USERNAME: botUsername,
    TELEGRAM_WEBHOOK_SECRET: webhookSecret,
    REMINDER_CRON_SECRET: cronSecret,
    GEBYA_PUBLIC_API_BASE_URL: deploymentUrl || '',
  });
  console.log(`✅ .env updated: ${ENV_PATH}`);

  // Step 7: Print summary
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   Setup Complete!                                ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`
📋 What was configured:
   • Bot token: ${token.slice(0, 10)}...
   • Bot username: @${botUsername}
   • Webhook secret: ${webhookSecret.slice(0, 8)}...
   • Cron secret: ${cronSecret.slice(0, 8)}...

🚀 Next steps for Vercel deployment:

   1. Set these env vars in Vercel Dashboard → Settings → Environment Variables:

      TELEGRAM_BOT_TOKEN     = ${token.slice(0, 15)}...
      TELEGRAM_BOT_USERNAME  = ${botUsername}
      TELEGRAM_WEBHOOK_SECRET = ${webhookSecret}
      REMINDER_CRON_SECRET   = ${cronSecret}
      GEBYA_PUBLIC_API_BASE_URL = ${deploymentUrl || '(your-url)'}

   2. Redeploy the API server:
      cd artifacts/api-server && npx vercel --prod

   3. Test the bot:
      - Open Telegram, search for @${botUsername}
      - Send: /start
      - It should reply with a welcome message

   4. Test automated reminders:
      curl -X POST ${deploymentUrl || 'https://your-url'}/api/telegram/reminders/run \\
        -H "x-reminder-cron-secret: ${cronSecret}" \\
        -H "Content-Type: application/json" \\
        -d '{"shopId": 1}'

📱 For local development:
   The .env file is already updated. Run:
   cd artifacts/api-server && pnpm dev
`);
}

main().catch((err) => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
