/**
 * Unit Tests for ReminderSchedulerService
 *
 * Tests cover:
 * - isCustomerEligibleToday: frequency window logic (24h/7d)
 * - queueReminder: builds correct metadata, calculates priority
 */

import { describe, it, expect } from "vitest";
import {
  isCustomerEligibleToday,
  queueReminder,
} from "../reminderScheduler.js";
import type {
  EligibleCustomer,
  ReminderLanguage,
} from "../../types/reminders.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const WEEK_IN_MS = 7 * DAY_IN_MS;

describe("isCustomerEligibleToday", () => {
  it("returns true for daily, no prior send", () => {
    const eligible = isCustomerEligibleToday(1, "daily", null);
    expect(eligible).toBe(true);
  });

  it("returns false for daily, sent 12h ago", () => {
    const lastSent = Date.now() - 12 * 60 * 60 * 1000;
    const eligible = isCustomerEligibleToday(1, "daily", lastSent);
    expect(eligible).toBe(false);
  });

  it("returns true for daily, sent 25h ago", () => {
    const lastSent = Date.now() - 25 * 60 * 60 * 1000;
    const eligible = isCustomerEligibleToday(1, "daily", lastSent);
    expect(eligible).toBe(true);
  });

  it("returns true for weekly, no prior send", () => {
    const eligible = isCustomerEligibleToday(1, "weekly", null);
    expect(eligible).toBe(true);
  });

  it("returns false for weekly, sent 3 days ago", () => {
    const lastSent = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const eligible = isCustomerEligibleToday(1, "weekly", lastSent);
    expect(eligible).toBe(false);
  });

  it("returns true for weekly, sent 8 days ago", () => {
    const lastSent = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const eligible = isCustomerEligibleToday(1, "weekly", lastSent);
    expect(eligible).toBe(true);
  });

  it("returns false for disabled frequency", () => {
    const eligible = isCustomerEligibleToday(1, "disabled", null);
    expect(eligible).toBe(false);
  });

  it("returns false for disabled, regardless of last send", () => {
    const lastSent = Date.now() - 100 * 24 * 60 * 60 * 1000;
    const eligible = isCustomerEligibleToday(1, "disabled", lastSent);
    expect(eligible).toBe(false);
  });

  it("returns false for daily at exactly 24h boundary", () => {
    const lastSent = Date.now() - DAY_IN_MS;
    const eligible = isCustomerEligibleToday(1, "daily", lastSent);
    expect(eligible).toBe(false);
  });

  it("returns false for weekly at exactly 7d boundary", () => {
    const lastSent = Date.now() - WEEK_IN_MS;
    const eligible = isCustomerEligibleToday(1, "weekly", lastSent);
    expect(eligible).toBe(false);
  });
});

describe("queueReminder", () => {
  it("creates reminder with correct metadata", async () => {
    const now = Date.now();
    const customer: EligibleCustomer = {
      customerId: 42,
      customerName: "Test Customer",
      balance: 1500.5,
      dueDate: now + 7 * 24 * 60 * 60 * 1000,
      customerCreatedAt: now - 30 * 24 * 60 * 60 * 1000,
      chatId: "123456789",
      updatesEnabled: true,
      telegramLanguage: "en" as ReminderLanguage,
      reminderConfig: {
        id: "config-1",
        shopId: 1,
        customerId: 42,
        frequency: "daily",
        lastReminderSentAt: null,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    };

    const config = {
      frequency: "daily",
      lastReminderSentAt: null,
      enabled: true,
    };

    const queued = await queueReminder(customer, config);
    expect(queued).not.toBeNull();
    expect(queued!.customerId).toBe(42);
    expect(queued!.chatId).toBe("123456789");
    expect(queued!.balance).toBe(1500.5);
    expect(queued!.language).toBe("en");
    expect(queued!.daysHeld).toBeGreaterThan(0);
  });

  it("calculates daysHeld from customerCreatedAt", async () => {
    const now = Date.now();
    const customerCreatedAt = now - 45 * 24 * 60 * 60 * 1000;

    const customer: EligibleCustomer = {
      customerId: 99,
      customerName: "Old Debtor",
      balance: 5000,
      dueDate: null,
      customerCreatedAt,
      chatId: "9999",
      updatesEnabled: true,
      telegramLanguage: "am",
      reminderConfig: {
        id: "config-99",
        shopId: 1,
        customerId: 99,
        frequency: "daily",
        lastReminderSentAt: null,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    };

    const config = {
      frequency: "daily",
      lastReminderSentAt: null,
      enabled: true,
    };

    const queued = await queueReminder(customer, config);
    expect(queued).not.toBeNull();
    expect(queued!.daysHeld).toBe(45);
  });

  it("sets priority based on daysHeld (older = lower priority number = higher priority)", async () => {
    const now = Date.now();

    const newDebtCustomer: EligibleCustomer = {
      customerId: 101,
      customerName: "New Debtor",
      balance: 1000,
      dueDate: null,
      customerCreatedAt: now - 1 * 24 * 60 * 60 * 1000,
      chatId: "101",
      updatesEnabled: true,
      telegramLanguage: "en",
      reminderConfig: {
        id: "config-101",
        shopId: 1,
        customerId: 101,
        frequency: "daily",
        lastReminderSentAt: null,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    };

    const oldDebtCustomer: EligibleCustomer = {
      customerId: 102,
      customerName: "Old Debtor",
      balance: 2000,
      dueDate: null,
      customerCreatedAt: now - 100 * 24 * 60 * 60 * 1000,
      chatId: "102",
      updatesEnabled: true,
      telegramLanguage: "en",
      reminderConfig: {
        id: "config-102",
        shopId: 1,
        customerId: 102,
        frequency: "daily",
        lastReminderSentAt: null,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    };

    const config = {
      frequency: "daily",
      lastReminderSentAt: null,
      enabled: true,
    };

    const newQueued = await queueReminder(newDebtCustomer, config);
    const oldQueued = await queueReminder(oldDebtCustomer, config);

    expect(newQueued).not.toBeNull();
    expect(oldQueued).not.toBeNull();
    // Older debt (100 days) should have HIGHER priority number than newer debt (1 day)
    // Because priority = daysHeld (and older means more days)
    expect(oldQueued!.priority).toBeGreaterThan(newQueued!.priority);
  });

  it("returns null when config.enabled is false", async () => {
    const now = Date.now();
    const customer: EligibleCustomer = {
      customerId: 200,
      customerName: "Disabled Customer",
      balance: 500,
      dueDate: null,
      customerCreatedAt: now - 10 * 24 * 60 * 60 * 1000,
      chatId: "200",
      updatesEnabled: true,
      telegramLanguage: "en",
      reminderConfig: {
        id: "config-200",
        shopId: 1,
        customerId: 200,
        frequency: "daily",
        lastReminderSentAt: null,
        enabled: false,
        createdAt: now,
        updatedAt: now,
      },
    };

    const config = {
      frequency: "daily",
      lastReminderSentAt: null,
      enabled: false,
    };

    const queued = await queueReminder(customer, config);
    expect(queued).toBeNull();
  });

  it("includes dueDate when provided", async () => {
    const now = Date.now();
    const dueDate = now + 14 * 24 * 60 * 60 * 1000;

    const customer: EligibleCustomer = {
      customerId: 300,
      customerName: "Customer with Due Date",
      balance: 2500,
      dueDate,
      customerCreatedAt: now - 5 * 24 * 60 * 60 * 1000,
      chatId: "300",
      updatesEnabled: true,
      telegramLanguage: "am",
      reminderConfig: {
        id: "config-300",
        shopId: 1,
        customerId: 300,
        frequency: "weekly",
        lastReminderSentAt: null,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    };

    const config = {
      frequency: "weekly",
      lastReminderSentAt: null,
      enabled: true,
    };

    const queued = await queueReminder(customer, config);
    expect(queued).not.toBeNull();
    expect(queued!.dueDate).toBe(dueDate);
  });

  it("generates unique IDs for each reminder", async () => {
    const now = Date.now();
    const customer: EligibleCustomer = {
      customerId: 400,
      customerName: "Test",
      balance: 100,
      dueDate: null,
      customerCreatedAt: now - 1 * 24 * 60 * 60 * 1000,
      chatId: "400",
      updatesEnabled: true,
      telegramLanguage: "en",
      reminderConfig: {
        id: "config-400",
        shopId: 1,
        customerId: 400,
        frequency: "daily",
        lastReminderSentAt: null,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    };

    const config = {
      frequency: "daily",
      lastReminderSentAt: null,
      enabled: true,
    };

    const queued1 = await queueReminder(customer, config);
    const queued2 = await queueReminder(customer, config);

    expect(queued1).not.toBeNull();
    expect(queued2).not.toBeNull();
    expect(queued1!.id).not.toBe(queued2!.id);
  });

  it("sets queuedAt to current time", async () => {
    const before = Date.now();
    const customer: EligibleCustomer = {
      customerId: 500,
      customerName: "Test",
      balance: 100,
      dueDate: null,
      customerCreatedAt: before - 1 * 24 * 60 * 60 * 1000,
      chatId: "500",
      updatesEnabled: true,
      telegramLanguage: "en",
      reminderConfig: {
        id: "config-500",
        shopId: 1,
        customerId: 500,
        frequency: "daily",
        lastReminderSentAt: null,
        enabled: true,
        createdAt: before,
        updatedAt: before,
      },
    };

    const config = {
      frequency: "daily",
      lastReminderSentAt: null,
      enabled: true,
    };

    const queued = await queueReminder(customer, config);
    const after = Date.now();

    expect(queued).not.toBeNull();
    expect(queued!.queuedAt).toBeGreaterThanOrEqual(before);
    expect(queued!.queuedAt).toBeLessThanOrEqual(after);
  });
});
