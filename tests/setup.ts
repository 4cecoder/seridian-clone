/**
 * Test environment setup - ensures we never accidentally use production services
 */

// 1. Strict environment detection
const env = process.env.NODE_ENV || "test";
const deployment = process.env.CONVEX_DEPLOYMENT || "local";

if (deployment === "prod" || deployment === "production") {
  throw new Error(
    "❌ FATAL: Tests are running against PRODUCTION. Aborting immediately."
  );
}

if (
  env === "test" &&
  (deployment === "staging" || deployment === "staging.seridian.dev")
) {
  throw new Error(
    "❌ Unit tests detected running in staging deployment. Unit tests must run locally with mocks only. E2E tests run in staging; unit tests run locally."
  );
}

// 2. Detect production API keys in environment
const dangerousPatterns = [
  { key: "RESEND_API_KEY", pattern: /^re_live_/, name: "Resend production" },
  { key: "STRIPE_API_KEY", pattern: /^sk_live_/, name: "Stripe production" },
  { key: "STRIPE_SECRET_KEY", pattern: /^sk_live_/, name: "Stripe production" },
];

for (const { key, pattern, name } of dangerousPatterns) {
  const value = process.env[key];
  if (value && pattern.test(value)) {
    throw new Error(
      `❌ PRODUCTION KEY DETECTED: ${name} key in ${key}. Delete it immediately. Use .env.example as reference.`
    );
  }
}

// 3. Ensure test env vars are set to safe/empty values
if (deployment === "local" && !process.env.CONVEX_URL) {
  // Local tests use in-memory Convex via convex-test, not a real deployment
  process.env.CONVEX_URL =
    process.env.CONVEX_URL || "https://test.convex.cloud";
}

// 4. Mock third-party services (only for tests)
if (env === "test") {
  // Mock Resend email service
  global.mockResend = {
    sentEmails: [] as Array<{
      to: string;
      subject: string;
      from: string;
      html?: string;
    }>,
    send: async (params: any) => {
      global.mockResend.sentEmails.push(params);
      return { id: `test_${Date.now()}`, from: params.from, to: params.to };
    },
    emails: {
      send: async (params: any) => {
        global.mockResend.sentEmails.push(params);
        return { id: `test_${Date.now()}` };
      },
    },
  };

  // Mock Stripe billing
  global.mockStripe = {
    charges: {
      create: async (params: any) => ({
        id: `ch_test_${Date.now()}`,
        amount: params.amount,
        status: "succeeded",
      }),
    },
    checkout: {
      sessions: {
        create: async (params: any) => ({
          id: `cs_test_${Date.now()}`,
          url: "https://checkout.stripe.com/test",
          payment_status: "unpaid",
        }),
      },
    },
  };

  // Mock S3/storage
  global.mockStorage = {
    files: new Map() as Map<string, Buffer>,
    put: async (key: string, data: Buffer) => {
      global.mockStorage.files.set(key, data);
      return { key };
    },
    get: async (key: string) => {
      return global.mockStorage.files.get(key);
    },
  };
}

// 5. Declare global mocks for TypeScript
declare global {
  var mockResend: any;
  var mockStripe: any;
  var mockStorage: any;
}

export {};
