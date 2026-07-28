import { describe, it, expect } from "vitest";
import { buildPersonActionSummary } from "./personAnalysisMapping";
import type { PersonActionCount } from "@workspace/api-client-react";

describe("buildPersonActionSummary", () => {
  it("orders rows in the fixed serve→receive→set→attack→block→dig order regardless of input order", () => {
    const input: PersonActionCount[] = [
      { action: "dig", count: 3 },
      { action: "serve", count: 5 },
      { action: "attack", count: 8 },
    ];
    const rows = buildPersonActionSummary(input);
    expect(rows.map((r) => r.action)).toEqual([
      "serve",
      "receive",
      "set",
      "attack",
      "block",
      "dig",
    ]);
  });

  it("fills in 0 for actions missing from the backend response (not silently dropped)", () => {
    const input: PersonActionCount[] = [{ action: "serve", count: 5 }];
    const rows = buildPersonActionSummary(input);
    expect(rows.find((r) => r.action === "block")).toEqual({
      action: "block",
      label: "攔網",
      count: 0,
    });
  });

  it("attaches the Chinese label for each action", () => {
    const rows = buildPersonActionSummary([{ action: "attack", count: 1 }]);
    expect(rows.find((r) => r.action === "attack")?.label).toBe("攻擊");
  });
});
