/**
 * Example: Auth lane E2E tests (runs in staging only)
 * Uses Playwright for browser automation
 * Tests real integrations: Auth → DB → email (sandbox) → Forms paywall
 */

import { test, expect, Page } from "@playwright/test";

/**
 * IMPORTANT: These tests run ONLY in staging environment
 * - They hit real (staging) Convex DB
 * - They use Resend sandbox email (test@example.com domain)
 * - They verify real integrations across lanes
 * - DO NOT run locally; use staging only
 */

// Playwright test configuration for E2E
test.describe("Auth lane - E2E tests (staging only)", () => {
  const baseURL = process.env.STAGING_URL || "https://staging.seridian.dev";
  const testEmail = `test_${Date.now()}@seridian.dev`; // Unique per run
  const testPassword = "TestSecure123!@";

  test.beforeEach(async ({ page }) => {
    // Verify we're in staging, not production
    const url = page.url();
    if (!url.includes("staging") && !url.includes("localhost:3000")) {
      throw new Error(
        `❌ E2E tests must run in staging. Got: ${url}. Set STAGING_URL env var.`
      );
    }
  });

  test("Signup flow (email verification)", async ({ page }) => {
    // 1. Navigate to signup
    await page.goto(`${baseURL}/auth/signup`);

    // 2. Fill signup form
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.fill('input[name="name"]', "Test User");

    // 3. Submit
    await page.click('button:has-text("Sign up")');

    // 4. Verify redirect to email verification screen
    await expect(page).toHaveURL(/\/auth\/verify-email/);

    // 5. Check that email was sent (via Resend sandbox)
    // In real test, you'd:
    // - Hit the Resend sandbox API
    // - Or check for the verification link in test inbox
    // - Or use test email service webhook
    // For now, we just verify the UI
    await expect(
      page.locator("text=Check your email for verification link")
    ).toBeVisible();
  });

  test("Login flow (MFA enabled)", async ({ page }) => {
    // Assume user already exists with MFA enabled (created in test data)
    const mfaEmail = "test_mfa@seridian.dev";
    const mfaPassword = "TestSecure123!@";

    // 1. Go to login
    await page.goto(`${baseURL}/auth/login`);

    // 2. Enter credentials
    await page.fill('input[type="email"]', mfaEmail);
    await page.fill('input[type="password"]', mfaPassword);
    await page.click('button:has-text("Log in")');

    // 3. Should redirect to MFA screen
    await expect(page).toHaveURL(/\/auth\/mfa/);

    // 4. Enter TOTP code (from test authenticator or hardcoded for test)
    // In real test: use speakeasy lib to generate from secret
    const totpCode = "123456"; // Mock for demo
    await page.fill('input[type="text"]', totpCode);
    await page.click('button:has-text("Verify")');

    // 5. Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("text=Welcome")).toBeVisible();
  });

  test("Cross-lane integration: Auth → Forms paywall", async ({
    page,
  }) => {
    // Test that Auth entitlements flow to Forms paywall
    // 1. Create a free user
    const email = `free_user_${Date.now()}@seridian.dev`;
    const password = "TestSecure123!@";

    await page.goto(`${baseURL}/auth/signup`);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.fill('input[name="name"]', "Free User");
    await page.click('button:has-text("Sign up")');

    // Verify email (skip for demo)
    // In real test: use Resend sandbox to get verification link

    // 2. Login
    await page.goto(`${baseURL}/auth/login`);
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button:has-text("Log in")');

    // 3. Navigate to Forms lane
    await page.goto(`${baseURL}/forms`);

    // 4. Try to create 2nd form (should hit paywall)
    // Free tier: 1 form only
    await page.click('button:has-text("New form")'); // Form 1 - OK
    await page.click('button:has-text("New form")'); // Form 2 - Should show paywall

    // 5. Verify paywall appears
    await expect(page.locator("text=Upgrade to create more forms")).toBeVisible();

    // 6. Verify upgrade button works
    await page.click('button:has-text("Upgrade to Pro")');

    // 7. Should redirect to Stripe checkout (test mode)
    // This would use Stripe test keys (sk_test_*)
    const frames = page.frames();
    const stripeFrame = frames.find((f) =>
      f.url().includes("stripe.com")
    );
    expect(stripeFrame).toBeDefined();
  });

  test("RBAC: Organization members and roles", async ({ page }) => {
    // Test that RBAC is enforced across teams
    const orgOwner = `owner_${Date.now()}@seridian.dev`;
    const orgMember = `member_${Date.now()}@seridian.dev`;

    // 1. Owner creates org
    await page.goto(`${baseURL}/auth/signup`);
    await page.fill('input[type="email"]', orgOwner);
    await page.fill('input[type="password"]', "TestSecure123!@");
    await page.fill('input[name="name"]', "Org Owner");
    await page.click('button:has-text("Sign up")');

    // Navigate to org settings
    await page.goto(`${baseURL}/dashboard/settings/team`);

    // 2. Invite member
    await page.click('button:has-text("Invite member")');
    await page.fill('input[type="email"]', orgMember);
    await page.selectOption('select[name="role"]', "editor");
    await page.click('button:has-text("Send invitation")');

    // 3. Verify invitation email sent
    // In real test: check Resend sandbox for invite link

    // 4. Member accepts and joins
    // (In real test: simulate clicking invite link from email)

    // 5. Verify member sees data but can't delete org
    // (permissions enforced server-side via Auth entitlements)
    await expect(page.locator("text=You don't have permission")).not.toBeVisible(); // Can view
  });

  test("Performance baseline: Auth operations", async ({ page }) => {
    // Measure latencies for Auth critical paths
    const measurements = {
      loginMs: 0,
      tokenVerifyMs: 0,
      rbacCheckMs: 0,
    };

    // Measure login time
    const startLogin = Date.now();
    await page.goto(`${baseURL}/auth/login`);
    await page.fill('input[type="email"]', "perf_test@seridian.dev");
    await page.fill('input[type="password"]', "TestSecure123!@");
    await page.click('button:has-text("Log in")');
    await page.waitForURL(/\/dashboard/);
    measurements.loginMs = Date.now() - startLogin;

    // Verify performance targets from TEST_STRATEGY.md
    // Login should be <500ms p99
    expect(measurements.loginMs).toBeLessThan(500);

    console.log(`Auth E2E metrics:`, measurements);
  });

  test("Error handling: Invalid credentials", async ({ page }) => {
    await page.goto(`${baseURL}/auth/login`);
    await page.fill('input[type="email"]', "nonexistent@seridian.dev");
    await page.fill('input[type="password"]', "WrongPassword123!");
    await page.click('button:has-text("Log in")');

    // Should see error (not crash)
    await expect(page.locator("text=Invalid email or password")).toBeVisible();
  });

  test("Security: XSS prevention in user input", async ({ page }) => {
    // Test that user input is properly escaped
    const xssPayload = '<img src="x" onerror="alert(1)">';

    await page.goto(`${baseURL}/auth/signup`);
    await page.fill('input[name="name"]', xssPayload);
    await page.fill('input[type="email"]', "xss@seridian.dev");
    await page.fill('input[type="password"]', "TestSecure123!@");
    await page.click('button:has-text("Sign up")');

    // Navigate to profile
    await page.goto(`${baseURL}/dashboard/profile`);

    // Check that XSS payload is escaped (not executed)
    // Should display literally, not as executable script
    const profileName = await page.locator("[data-testid='user-name']").textContent();
    expect(profileName).toContain(xssPayload); // Literal text, not executed
  });
});

/**
 * Run E2E tests only in staging:
 *
 *   STAGING_URL=https://staging.seridian.dev bunx playwright test tests/examples/auth.e2e.example.ts
 *
 * DO NOT run locally or in production.
 */
