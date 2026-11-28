/**
 * @vitest-environment node
 *
 * H3: downloading the shop's own data must not depend on "view reports".
 *
 * `/sync/pull` was gated on `can_view_reports`. When an owner switched that
 * permission off for a staff member — a normal privacy action — the phone's
 * pull returned 403. The client treated every 403 as an expired session,
 * deleted its JWT and stopped syncing its own sales.
 *
 * The gate is now membership: a valid token plus an active business member is
 * enough to receive the data that phone is already allowed to write. A missing
 * or invalid token is still 401 (the client refreshes once, then may sign out);
 * a valid token with no membership is 403 (session alive, not in this shop).
 */
process.env.JWT_SECRET = "test-secret-for-unit-tests";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { requireMembership } from "../rbac.js";

const state = vi.hoisted(() => ({ rows: [] as any[] }));

vi.mock("@workspace/db", () => ({
  // Only the membership lookup in requireDeviceContext is needed: it is
  // `.select(...).from(...).where(...).limit(1)`.
  requireDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => state.rows,
        }),
      }),
    }),
  }),
}));

vi.mock("../auth.js", () => ({
  verifyJwt: (token: string) => (token === "valid-token" ? { userId: 7 } : null),
}));

function makeReq(headers: Record<string, string>) {
  return {
    headers,
    method: "GET",
    originalUrl: "/sync/pull",
    url: "/sync/pull",
  } as any;
}

function makeRes() {
  const res: any = { statusCode: 0, body: null };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: any) => {
    res.body = body;
    return res;
  };
  return res;
}

async function run(headers: Record<string, string>) {
  const req = makeReq(headers);
  const res = makeRes();
  const next = vi.fn();
  await requireMembership(req, res, next);
  return { req, res, next };
}

beforeEach(() => {
  state.rows = [];
});

describe("requireMembership (sync pull gate)", () => {
  it("lets an active member pull even when they may not view reports", async () => {
    state.rows = [
      { role: "cashier", permissions: { can_view_reports: false }, businessId: 3 },
    ];

    const { req, res, next } = await run({ authorization: "Bearer valid-token" });

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
    expect(req.deviceContext).toMatchObject({ userId: 7, businessId: 3 });
    // The permission is still false in the context; membership alone allowed it.
    expect(req.deviceContext.permissions.can_view_reports).toBe(false);
  });

  it("attaches the resolved member context for downstream handlers", async () => {
    state.rows = [{ role: "trusted_staff", permissions: {}, businessId: 9 }];

    const { req } = await run({ authorization: "Bearer valid-token" });

    expect(req.deviceContext).toEqual(
      expect.objectContaining({ userId: 7, businessId: 9, role: "trusted_staff" }),
    );
  });

  it("returns 403 for a valid token with no active membership", async () => {
    state.rows = [];

    const { res, next } = await run({ authorization: "Bearer valid-token" });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/not a member/i);
    expect(res.body.hint).toMatch(/owner/i);
  });

  it("does not leak the shop id or row counts in the 403 body", async () => {
    state.rows = [];

    const { res } = await run({ authorization: "Bearer valid-token" });

    expect(Object.keys(res.body).sort()).toEqual(["error", "hint"]);
    // A fixed message and hint only: no business id, no table name, no counts.
    expect(JSON.stringify(res.body)).not.toMatch(/business_id|businessId|shop_id|\d/);
  });

  it("returns 401 when there is no token", async () => {
    const { res, next } = await run({});

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when the token is invalid or expired", async () => {
    const { res, next } = await run({ authorization: "Bearer expired-token" });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

describe("/sync/pull route wiring", () => {
  it("uses the membership gate, not can_view_reports", () => {
    const source = readFileSync(new URL("../sync.ts", import.meta.url), "utf8");
    const start = source.indexOf('router.get("/pull"');
    const end = source.indexOf('router.get("/balance-check"', start);
    expect(start).toBeGreaterThan(-1);

    const pullBlock = source.slice(start, end > start ? end : start + 500);
    expect(pullBlock).toContain("requireMembership");
    expect(pullBlock).not.toContain("can_view_reports");
  });
});
