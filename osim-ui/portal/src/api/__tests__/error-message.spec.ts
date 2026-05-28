import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/fetch";
import { apiErrorMessage, extractErrorCode } from "@/api/error-message";

describe("apiErrorMessage", () => {
  it("liefert deutsche Nachricht für bekannten Code (E_MODEL_LOCKED)", () => {
    const err = new ApiError(409, "Conflict", {
      type: "about:blank",
      title: "E_MODEL_LOCKED",
      status: 409,
      detail: "model is locked by user xyz",
      code: "E_MODEL_LOCKED",
    });

    expect(apiErrorMessage(err)).toBe(
      "Modell wird gerade von einem anderen Nutzer bearbeitet.",
    );
  });

  it("liefert detail-Text wenn Code unbekannt aber detail vorhanden", () => {
    const err = new ApiError(500, "Internal Server Error", {
      code: "E_UNKNOWN_CODE",
      detail: "Engine-Worker antwortet nicht.",
    });

    expect(apiErrorMessage(err, "Vorgang fehlgeschlagen")).toBe(
      "Engine-Worker antwortet nicht.",
    );
  });

  it("liefert Fallback-String wenn weder Code noch Detail bekannt", () => {
    const err = new ApiError(500, "Internal Server Error", {
      code: "E_UNKNOWN_CODE",
    });

    expect(apiErrorMessage(err, "Vorgang fehlgeschlagen")).toBe(
      "Vorgang fehlgeschlagen (HTTP 500).",
    );
  });

  it("liefert err.message für plain Error (kein ApiError)", () => {
    expect(apiErrorMessage(new Error("Network down"))).toBe("Network down");
  });
});

describe("extractErrorCode", () => {
  it("extrahiert top-level code", () => {
    expect(
      extractErrorCode(
        new ApiError(409, "Conflict", { code: "E_MODEL_LOCKED" }),
      ),
    ).toBe("E_MODEL_LOCKED");
  });

  it("extrahiert nested detail.code als Fallback", () => {
    expect(
      extractErrorCode(
        new ApiError(422, "Unprocessable", {
          detail: { code: "E_INVALID_REQUEST", message: "..." },
        }),
      ),
    ).toBe("E_INVALID_REQUEST");
  });

  it("returnt leeren String wenn weder Code noch detail.code vorhanden", () => {
    expect(extractErrorCode(new ApiError(500, "Boom", { detail: "x" }))).toBe(
      "",
    );
  });

  it("returnt leeren String für non-ApiError", () => {
    expect(extractErrorCode(new Error("plain"))).toBe("");
    expect(extractErrorCode(null)).toBe("");
    expect(extractErrorCode(undefined)).toBe("");
  });
});
