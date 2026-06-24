import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "src/services/__tests__/reminderConfiguration.test.ts",
      "src/services/__tests__/reminderHistory.test.ts",
      "src/services/__tests__/reminderHistory.simple.test.ts",
      "src/routes/__tests__/reminders.test.ts",
    ],
  },
});