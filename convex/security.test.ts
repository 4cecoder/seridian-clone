/// <reference types="vite/client" />
// SER-13: every public Convex function on seridian.dev is staff-only, enforced
// server-side from ctx.auth, except the intentionally public published
// case-study list. Functions are discovered from the modules themselves, so
// a newly added public function is covered (and refused) automatically.
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const loaded = import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "!./_generated/**"], {
  eager: true,
}) as Record<
  string,
  Record<string, unknown>
>;

// Intentionally anonymous: rendered on the public /casestudies page.
const PUBLIC_FUNCTIONS = new Set(["caseStudies:listPublished"]);

const STAFF = {
  subject: "staff-1",
  issuer: "https://auth.seridian.dev",
  tokenIdentifier: "https://auth.seridian.dev|staff-1",
  email: "Staff@Seridian.dev",
  emailVerified: true,
};

type Kind = "query" | "mutation" | "action";
type PublicFn = { name: string; kind: Kind; args: Record<string, unknown> };

type ValidatorJson = {
  type: string;
  value?: unknown;
  tableName?: string;
};

function sample(validator: ValidatorJson): unknown {
  switch (validator.type) {
    case "string":
      return "x";
    case "number":
      return 0;
    case "bigint":
      return BigInt(0);
    case "boolean":
      return false;
    case "null":
    case "any":
      return null;
    case "literal":
      return validator.value;
    case "id":
      return `1${validator.tableName}`;
    case "array":
      return [];
    case "record":
      return {};
    case "bytes":
      return new ArrayBuffer(0);
    case "union":
      return sample((validator.value as ValidatorJson[])[0]);
    case "object":
      return Object.fromEntries(
        Object.entries(
          validator.value as Record<string, { fieldType: ValidatorJson; optional: boolean }>,
        )
          .filter(([, field]) => !field.optional)
          .map(([key, field]) => [key, sample(field.fieldType)]),
      );
    default:
      throw new Error(`no sample for validator type ${validator.type}`);
  }
}

function publicFunctions(): PublicFn[] {
  const found: PublicFn[] = [];
  for (const [path, exports] of Object.entries(loaded)) {
    if (path.includes("_generated") || path.endsWith(".test.ts")) continue;
    const moduleName = path.replace(/^\.\//, "").replace(/\.ts$/, "");
    for (const [exportName, value] of Object.entries(exports)) {
      const fn = value as {
        isPublic?: boolean;
        isQuery?: boolean;
        isMutation?: boolean;
        isAction?: boolean;
        exportArgs?: () => string;
      };
      if (!fn || !fn.isPublic || typeof fn.exportArgs !== "function") continue;
      const kind: Kind = fn.isQuery ? "query" : fn.isMutation ? "mutation" : "action";
      const argsJson = JSON.parse(fn.exportArgs()) as ValidatorJson;
      const args = argsJson.type === "object" ? (sample(argsJson) as Record<string, unknown>) : {};
      found.push({ name: `${moduleName}:${exportName}`, kind, args });
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

type Caller = {
  query: (ref: never, args: never) => Promise<unknown>;
  mutation: (ref: never, args: never) => Promise<unknown>;
  action: (ref: never, args: never) => Promise<unknown>;
};

async function call(caller: Caller, fn: PublicFn): Promise<string | null> {
  const ref = makeFunctionReference(fn.name) as never;
  try {
    await caller[fn.kind](ref, fn.args as never);
    return null;
  } catch (error) {
    const data = (error as { data?: unknown }).data;
    return typeof data === "string" ? data : String((error as Error).message ?? error);
  }
}

describe("SER-13 legacy Convex functions are staff-only", () => {
  beforeEach(() => {
    vi.stubEnv("STAFF_EMAILS", "someone@else.dev, staff@seridian.dev");
    // No real network from any action under test.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network disabled in tests");
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const guarded = publicFunctions().filter((fn) => !PUBLIC_FUNCTIONS.has(fn.name));

  test("discovers the whole public surface (guards against an empty loop)", () => {
    expect(guarded.length).toBeGreaterThan(100);
    expect(guarded.map((fn) => fn.name)).toEqual(
      expect.arrayContaining([
        "clients:create",
        "deals:update",
        "proposals:accept",
        "users:upsert",
        "agent_bootstrap:resetSystemForTesting",
        "githubSync:syncAllGitHub",
      ]),
    );
  });

  test("@regression SER-13 anonymous callers are refused by every public CRM/backend function", async () => {
    const t = convexTest({ schema, modules });
    const open: string[] = [];
    for (const fn of guarded) {
      const error = await call(t as unknown as Caller, fn);
      if (!error?.startsWith("UNAUTHENTICATED")) open.push(`${fn.name} -> ${error ?? "ok"}`);
    }
    expect(open).toEqual([]);
  });

  test("@regression SER-13 signed-in non-staff callers are refused by every public function", async () => {
    const t = convexTest({ schema, modules }).withIdentity({
      ...STAFF,
      subject: "outsider",
      email: "outsider@example.com",
    });
    const open: string[] = [];
    for (const fn of guarded) {
      const error = await call(t as unknown as Caller, fn);
      if (!error?.startsWith("FORBIDDEN")) open.push(`${fn.name} -> ${error ?? "ok"}`);
    }
    expect(open).toEqual([]);
  });

  test("a staff email that is not verified by the identity provider is refused", async () => {
    const t = convexTest({ schema, modules }).withIdentity({ ...STAFF, emailVerified: false });
    await expect(t.query(api.clients.list, {})).rejects.toThrow(/FORBIDDEN/);
  });

  test("no staff are configured (STAFF_EMAILS unset) => everyone is refused", async () => {
    vi.stubEnv("STAFF_EMAILS", "");
    const t = convexTest({ schema, modules }).withIdentity(STAFF);
    await expect(t.query(api.clients.list, {})).rejects.toThrow(/FORBIDDEN/);
  });

  test("a userId-style argument cannot stand in for identity", async () => {
    const t = convexTest({ schema, modules });
    await expect(
      t.mutation(api.users.upsert, { pubkey: "staff-1", name: "Staff", status: "online" }),
    ).rejects.toThrow(/UNAUTHENTICATED/);
    const rows = await t.run((ctx) => ctx.db.query("users").collect());
    expect(rows).toEqual([]);
  });

  test("verified staff pass the guard on every public function", async () => {
    const t = convexTest({ schema, modules }).withIdentity(STAFF);
    const blocked: string[] = [];
    for (const fn of guarded) {
      const error = await call(t as unknown as Caller, fn);
      if (error && /^(UNAUTHENTICATED|FORBIDDEN)/.test(error)) blocked.push(fn.name);
    }
    expect(blocked).toEqual([]);
  });

  test("staff can still run the CRM end to end", async () => {
    const t = convexTest({ schema, modules }).withIdentity(STAFF);
    const clientId = await t.mutation(api.clients.create, {
      name: "Ada",
      company: "Acme",
      email: "ops@acme.test",
      status: "active",
    });
    const clients = await t.query(api.clients.list, {});
    expect(clients.map((c) => c._id)).toContain(clientId);
  });

  test("the public case-study list stays anonymous and only returns published entries", async () => {
    const t = convexTest({ schema, modules });
    await t.run(async (ctx) => {
      await ctx.db.insert("caseStudies", caseStudy("Public", true));
      await ctx.db.insert("caseStudies", caseStudy("Draft", false));
    });
    const published = await t.query(api.caseStudies.listPublished, {});
    expect(published.map((c) => c.title)).toEqual(["Public"]);
    await expect(t.query(api.caseStudies.list, {})).rejects.toThrow(/UNAUTHENTICATED/);
  });
});

function caseStudy(title: string, published: boolean) {
  return {
    title,
    summary: "s",
    challenge: "c",
    solution: "s",
    results: "r",
    technologies: [],
    published,
    order: 0,
  };
}
