import { describe, it, expect } from "vitest";
import { buildPersonActionSummary, buildPersonOutcomeSummary } from "./personAnalysisMapping";
import type { PersonActionCount, PersonOutcomeBreakdown } from "@workspace/api-client-react";

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

describe("buildPersonOutcomeSummary", () => {
  it("orders rows in the fixed serve→receive→set→attack→block→dig order regardless of input order", () => {
    const input: PersonOutcomeBreakdown[] = [
      { action: "dig", points: 1, losses: 0, inPlay: 0, unknown: 0 },
      { action: "serve", points: 2, losses: 1, inPlay: 0, unknown: 0 },
    ];
    const rows = buildPersonOutcomeSummary(input);
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
    const input: PersonOutcomeBreakdown[] = [
      { action: "serve", points: 5, losses: 2, inPlay: 0, unknown: 0 },
    ];
    const rows = buildPersonOutcomeSummary(input);
    expect(rows.find((r) => r.action === "block")).toEqual({
      action: "block",
      label: "攔網",
      points: 0,
      losses: 0,
      unknown: 0,
    });
  });

  it("carries points/losses/unknown through unchanged for an action that has data", () => {
    const input: PersonOutcomeBreakdown[] = [
      { action: "attack", points: 7, losses: 3, inPlay: 1, unknown: 2 },
    ];
    const rows = buildPersonOutcomeSummary(input);
    expect(rows.find((r) => r.action === "attack")).toEqual({
      action: "attack",
      label: "攻擊",
      points: 7,
      losses: 3,
      unknown: 2,
    });
  });

  it("empty input still returns the fixed zero-filled shape for all six actions", () => {
    const rows = buildPersonOutcomeSummary([]);
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.points === 0 && r.losses === 0 && r.unknown === 0)).toBe(true);
  });
});
