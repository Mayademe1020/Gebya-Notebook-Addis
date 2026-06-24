/**
 * Reminder Configuration Service
 * 
 * Manages shop-level and per-customer reminder frequency settings.
 * - Stores configurations in Vercel KV (Upstash Redis) or in-memory fallback
 * - Defaults to shop setting if no per-customer override exists
 * - Uses same KV backend and pattern as telegramStore.ts
 */

import type { ReminderFrequency, ReminderConfiguration } from '../types/reminders.js';

// ─── storage backend selection ────────────────────────────────────────
const KV_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)?.trim();
const KV_TOKEN = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)?.trim();
const kvEnabled = Boolean(KV_URL && KV_TOKEN);

// In-memory fallback (used when KV is not configured)
const memConfig = new Map<string, ReminderConfiguration>();

// ─── KV command helper ────────────────────────────────────────────────

async function kvCmd(args: (string | number)[]): Promise<unknown> {
  const res = await fetch(KV_URL as string, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    throw new Error(`KV command failed (${res.status})`);
  }
  const data = (await res.json()) as { result?: unknown };
  return data?.result ?? null;
}

// ─── key scheme ───────────────────────────────────────────────────────

const configKey = (shopId: number, customerId: number | null): string => {
  const cId = customerId !== null && customerId !== undefined ? customerId : 'default';
  return `reminder:config:${shopId}:${cId}`;
};

// ─── low-level accessors (KV or memory) ───────────────────────────────

async function readConfig(key: string): Promise<ReminderConfiguration | null> {
  if (kvEnabled) {
    try {
      const raw = await kvCmd(["GET", key]);
      if (!raw || typeof raw !== "string") return null;
      return JSON.parse(raw) as ReminderConfiguration;
    } catch (error) {
      console.error(`[ReminderConfig] Error reading from KV: ${error}`);
      return null;
    }
  }
  return memConfig.get(key) ?? null;
}

async function writeConfig(key: string, config: ReminderConfiguration): Promise<void> {
  if (kvEnabled) {
    try {
      await kvCmd(["SET", key, JSON.stringify(config)]);
    } catch (error) {
      console.error(`[ReminderConfig] Error writing to KV: ${error}`);
      throw error;
    }
  } else {
    memConfig.set(key, config);
  }
}

async function deleteConfig(key: string): Promise<void> {
  if (kvEnabled) {
    try {
      await kvCmd(["DEL", key]);
    } catch (error) {
      console.error(`[ReminderConfig] Error deleting from KV: ${error}`);
      throw error;
    }
  } else {
    memConfig.delete(key);
  }
}

// ─── validation helpers ───────────────────────────────────────────────

function validateFrequency(frequency: unknown): frequency is ReminderFrequency {
  return frequency === 'daily' || frequency === 'weekly' || frequency === 'disabled';
}

function validateId(id: unknown, fieldName: string): asserts id is number {
  if (!Number.isInteger(id) || (id as number) <= 0) {
    throw new Error(`Invalid ${fieldName}: must be a positive integer`);
  }
}

// ─── public API ────────────────────────────────────────────────────────

/**
 * Get or create the shop's default reminder frequency
 * Defaults to 'daily' if not set
 */
export async function getShopDefault(shopId: number): Promise<ReminderFrequency> {
  try {
    validateId(shopId, 'shopId');
    
    const key = configKey(shopId, null);
    let config = await readConfig(key);
    
    if (!config) {
      // Create default configuration
      config = {
        id: `${shopId}-default-${Date.now()}`,
        shopId,
        customerId: null,
        frequency: 'daily',
        lastReminderSentAt: null,
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await writeConfig(key, config);
      console.log(`[ReminderConfig] Created shop default for shop ${shopId}: daily`);
    }
    
    return config.frequency;
  } catch (error) {
    console.error(`[ReminderConfig] Error getting shop default for shop ${shopId}: ${error}`);
    throw new Error(`Failed to get shop default reminder frequency: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Set the shop's default reminder frequency
 */
export async function setShopDefault(
  shopId: number,
  frequency: ReminderFrequency
): Promise<void> {
  try {
    validateId(shopId, 'shopId');
    if (!validateFrequency(frequency)) {
      throw new Error(`Invalid frequency: "${frequency}". Must be "daily", "weekly", or "disabled"`);
    }

    const key = configKey(shopId, null);
    const existing = await readConfig(key);
    
    const config: ReminderConfiguration = {
      id: existing?.id ?? `${shopId}-default-${Date.now()}`,
      shopId,
      customerId: null,
      frequency,
      lastReminderSentAt: existing?.lastReminderSentAt ?? null,
      enabled: existing?.enabled ?? true,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    
    await writeConfig(key, config);
    console.log(`[ReminderConfig] Set shop ${shopId} default frequency to: ${frequency}`);
  } catch (error) {
    console.error(`[ReminderConfig] Error setting shop default for shop ${shopId}: ${error}`);
    throw new Error(`Failed to set shop default reminder frequency: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get customer-specific reminder frequency, falling back to shop default if not set
 */
export async function getCustomerFrequency(
  shopId: number,
  customerId: number
): Promise<ReminderFrequency> {
  try {
    validateId(shopId, 'shopId');
    validateId(customerId, 'customerId');
    
    const key = configKey(shopId, customerId);
    const customerConfig = await readConfig(key);
    
    // If customer has override, return it
    if (customerConfig) {
      return customerConfig.frequency;
    }
    
    // Otherwise, fall back to shop default
    const shopDefault = await getShopDefault(shopId);
    return shopDefault;
  } catch (error) {
    console.error(`[ReminderConfig] Error getting customer frequency for shop ${shopId}, customer ${customerId}: ${error}`);
    throw new Error(`Failed to get customer reminder frequency: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Set a customer-specific reminder frequency override
 */
export async function setCustomerFrequency(
  shopId: number,
  customerId: number,
  frequency: ReminderFrequency
): Promise<void> {
  try {
    validateId(shopId, 'shopId');
    validateId(customerId, 'customerId');
    if (!validateFrequency(frequency)) {
      throw new Error(`Invalid frequency: "${frequency}". Must be "daily", "weekly", or "disabled"`);
    }

    const key = configKey(shopId, customerId);
    const existing = await readConfig(key);
    
    const config: ReminderConfiguration = {
      id: existing?.id ?? `${shopId}-${customerId}-${Date.now()}`,
      shopId,
      customerId,
      frequency,
      lastReminderSentAt: existing?.lastReminderSentAt ?? null,
      enabled: existing?.enabled ?? true,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    
    await writeConfig(key, config);
    console.log(`[ReminderConfig] Set customer ${customerId} (shop ${shopId}) frequency to: ${frequency}`);
  } catch (error) {
    console.error(`[ReminderConfig] Error setting customer frequency for shop ${shopId}, customer ${customerId}: ${error}`);
    throw new Error(`Failed to set customer reminder frequency: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Check if reminders are enabled for a customer
 * Returns false if frequency is 'disabled', true otherwise
 */
export async function isRemindersEnabled(
  shopId: number,
  customerId: number
): Promise<boolean> {
  try {
    validateId(shopId, 'shopId');
    validateId(customerId, 'customerId');
    
    const frequency = await getCustomerFrequency(shopId, customerId);
    return frequency !== 'disabled';
  } catch (error) {
    console.error(`[ReminderConfig] Error checking if reminders enabled for shop ${shopId}, customer ${customerId}: ${error}`);
    // Default to false on error for safety
    return false;
  }
}

/**
 * Clear a customer-specific override, reverting to shop default
 */
export async function clearCustomerOverride(
  shopId: number,
  customerId: number
): Promise<void> {
  try {
    validateId(shopId, 'shopId');
    validateId(customerId, 'customerId');
    
    const key = configKey(shopId, customerId);
    await deleteConfig(key);
    console.log(`[ReminderConfig] Cleared override for customer ${customerId} (shop ${shopId})`);
  } catch (error) {
    console.error(`[ReminderConfig] Error clearing override for shop ${shopId}, customer ${customerId}: ${error}`);
    throw new Error(`Failed to clear customer reminder override: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ─── test utilities (exported only for testing) ────────────────────────

/**
 * Clear all in-memory configurations (for testing only)
 */
export function clearAllConfigs(): void {
  memConfig.clear();
}

/**
 * Get current storage backend status (for testing/debugging)
 */
export function getStorageStatus() {
  return {
    backend: kvEnabled ? 'kv' : 'memory',
    configCount: memConfig.size,
  };
}
