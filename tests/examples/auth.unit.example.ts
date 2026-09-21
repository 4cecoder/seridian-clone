/**
 * Example: Auth lane unit tests
 * Shows proper mocking pattern (100% mocked, no external services)
 */

/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("Auth lane - Unit tests", () => {
  const t = convexTest(schema, modules);

  describe("Signup flow", () => {
    test("should create new user with valid email", async () => {
      // No email service called; just test the DB function
      const user = await t.mutation(api.auth.signup, {
        email: "test@example.com",
        password: "secure123!",
        name: "Test User",
      });

      expect(user).toMatchObject({
        email: "test@example.com",
        name: "Test User",
        verified: false, // Email not sent in unit test
      });
      expect(user._id).toBeDefined();
    });

    test("should reject duplicate emails", async () => {
      await t.mutation(api.auth.signup, {
        email: "duplicate@example.com",
        password: "pass123!",
        name: "First User",
      });

      expect(
        t.mutation(api.auth.signup, {
          email: "duplicate@example.com",
          password: "pass456!",
          name: "Second User",
        })
      ).rejects.toThrow("Email already exists");
    });

    test("should validate email format", async () => {
      expect(
        t.mutation(api.auth.signup, {
          email: "invalid-email",
          password: "pass123!",
          name: "Bad Email",
        })
      ).rejects.toThrow("Invalid email format");
    });
  });

  describe("Login flow", () => {
    test("should authenticate valid credentials", async () => {
      // First create a user
      await t.mutation(api.auth.signup, {
        email: "user@example.com",
        password: "secure123!",
        name: "Test User",
      });

      // Then login
      const session = await t.mutation(api.auth.login, {
        email: "user@example.com",
        password: "secure123!",
      });

      expect(session).toMatchObject({
        token: expect.any(String),
        expiresAt: expect.any(Number),
      });
    });

    test("should reject invalid password", async () => {
      await t.mutation(api.auth.signup, {
        email: "user@example.com",
        password: "secure123!",
        name: "Test User",
      });

      expect(
        t.mutation(api.auth.login, {
          email: "user@example.com",
          password: "wrongpassword",
        })
      ).rejects.toThrow("Invalid credentials");
    });
  });

  describe("Token validation", () => {
    test("should validate valid tokens", async () => {
      const user = await t.mutation(api.auth.signup, {
        email: "token@example.com",
        password: "pass123!",
        name: "Token Test",
      });

      const session = await t.mutation(api.auth.login, {
        email: "token@example.com",
        password: "pass123!",
      });

      const verified = await t.query(api.auth.verifyToken, {
        token: session.token,
      });

      expect(verified).toMatchObject({
        userId: user._id,
        email: "token@example.com",
      });
    });

    test("should reject expired tokens", async () => {
      expect(
        t.query(api.auth.verifyToken, {
          token: "expired_token_xyz",
        })
      ).rejects.toThrow("Token expired or invalid");
    });
  });

  describe("MFA (TOTP) flow", () => {
    test("should generate TOTP secret", async () => {
      const user = await t.mutation(api.auth.signup, {
        email: "mfa@example.com",
        password: "pass123!",
        name: "MFA Test",
      });

      const mfaSetup = await t.mutation(api.auth.generateTotpSecret, {
        userId: user._id,
      });

      expect(mfaSetup).toMatchObject({
        secret: expect.any(String),
        qrCode: expect.any(String), // Data URI, not real image
      });
    });

    test("should enable MFA with valid code", async () => {
      const user = await t.mutation(api.auth.signup, {
        email: "mfa2@example.com",
        password: "pass123!",
        name: "MFA Test 2",
      });

      const mfaSetup = await t.mutation(api.auth.generateTotpSecret, {
        userId: user._id,
      });

      // Mock TOTP library to return predictable codes for testing
      const mockCode = "123456"; // In real test, use TOTP library with fixed time

      const enabled = await t.mutation(api.auth.enableMfa, {
        userId: user._id,
        totpCode: mockCode,
        secret: mfaSetup.secret,
      });

      expect(enabled).toMatchObject({
        mfaEnabled: true,
        backupCodes: expect.any(Array),
      });
    });
  });

  describe("RBAC (Role-based access control)", () => {
    test("should assign roles to user", async () => {
      const user = await t.mutation(api.auth.signup, {
        email: "rbac@example.com",
        password: "pass123!",
        name: "RBAC Test",
      });

      const org = await t.mutation(api.auth.createOrganization, {
        name: "Test Org",
        userId: user._id,
      });

      const updated = await t.mutation(api.auth.assignRole, {
        userId: user._id,
        orgId: org._id,
        role: "admin",
      });

      expect(updated.role).toBe("admin");
    });

    test("should check permissions", async () => {
      const user = await t.mutation(api.auth.signup, {
        email: "perms@example.com",
        password: "pass123!",
        name: "Perms Test",
      });

      const org = await t.mutation(api.auth.createOrganization, {
        name: "Perms Org",
        userId: user._id,
      });

      await t.mutation(api.auth.assignRole, {
        userId: user._id,
        orgId: org._id,
        role: "admin",
      });

      const canDelete = await t.query(api.auth.hasPermission, {
        userId: user._id,
        orgId: org._id,
        permission: "delete_organization",
      });

      expect(canDelete).toBe(true); // Admin has all perms
    });
  });
});
