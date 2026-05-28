import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError } from "@/api/fetch";
import { auth } from "@/auth/firebase";

// Hilfstyp: `auth` ist im Setup-Mock auf `{ currentUser: null }` geschrumpft.
// Tests, die einen User brauchen, kasten auf diese minimale Form.
type MockableAuth = { currentUser: { getIdToken: () => Promise<string> } | null };

describe("apiFetch", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    (auth as unknown as MockableAuth).currentUser = null;
  });

  it("fügt Bearer-Token hinzu wenn user authentisiert", async () => {
    (auth as unknown as MockableAuth).currentUser = {
      getIdToken: vi.fn().mockResolvedValue("FAKE_TOKEN"),
    };
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await apiFetch<{ ok: boolean }>("/api/v1/auth/me");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer FAKE_TOKEN");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("wirft ApiError bei 401 mit parsed body", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          type: "about:blank",
          title: "Unauthorized",
          status: 401,
          detail: "Bearer-Token fehlt.",
          code: "E_UNAUTHENTICATED",
        }),
        { status: 401, statusText: "Unauthorized" },
      ),
    );

    await expect(apiFetch("/api/v1/auth/me")).rejects.toThrowError(ApiError);

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: "E_UNAUTHENTICATED" }),
        { status: 401, statusText: "Unauthorized" },
      ),
    );
    try {
      await apiFetch("/api/v1/auth/me");
      expect.fail("expected ApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(401);
      expect(apiErr.body).toEqual({ code: "E_UNAUTHENTICATED" });
    }
  });

  it("returnt undefined bei 204 No Content", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await apiFetch<void>("/api/v1/some-empty-endpoint");

    expect(result).toBeUndefined();
  });
});
