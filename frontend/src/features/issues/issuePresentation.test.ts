import { describe, expect, it, vi } from "vitest";
import {
  codePoints,
  dateTime,
  normalized,
  parseIssueQuery,
  todayRome,
} from "./issuePresentation";
describe("issue list URL contract", () => {
  it("renders four-digit years and Rome daylight-saving boundaries", () => {
    expect(dateTime("2026-03-29T00:30:00Z")).toBe("29/03/2026 01:30");
    expect(dateTime("2026-03-29T01:30:00Z")).toBe("29/03/2026 03:30");
    expect(dateTime("2026-10-06T22:30:00Z")).toBe("07/10/2026 00:30");
  });
  it.each([
    [
      "2026-01-09T22:59:59Z",
      "2026-01-09T23:00:00Z",
      "2026-01-09",
      "2026-01-10",
    ],
    [
      "2026-07-09T21:59:59Z",
      "2026-07-09T22:00:00Z",
      "2026-07-09",
      "2026-07-10",
    ],
  ])(
    "refreshes the Rome date at midnight starting from %s",
    (before, after, dateBefore, dateAfter) => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date(before));
        expect(todayRome()).toBe(dateBefore);
        vi.setSystemTime(new Date(after));
        expect(todayRome()).toBe(dateAfter);
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it("accepts repeated OR filters and literal wildcard search", () => {
    expect(
      parseIssueQuery(
        new URLSearchParams(
          "status=TODO&status=IN_PROGRESS&type=BUG&q=%25_login&sort=dueDate,asc",
        ),
      ),
    ).toEqual({ page: 0, size: 20, sort: "dueDate,asc" });
  });
  it.each([
    "status=RESOLVED,DUPLICATE",
    "status=OTHER",
    "page=-1",
    "page=1.2",
    "size=0",
    "size=101",
    "sort=title,random",
    "archived=true",
    "reporterId=BB-1",
    "assignedTo=somebody",
    "q=a&q=b",
    "labelId=invalid",
    "page=999999999999999999999",
  ])("rejects invalid query %s instead of silently rewriting it", (query) => {
    expect(() => parseIssueQuery(new URLSearchParams(query))).toThrow();
  });
  it("counts Unicode code points and normalizes composed text before validation", () => {
    expect(codePoints("😃".repeat(160))).toBe(160);
    expect(normalized("  cafe\u0301  ")).toBe("café");
    expect(() =>
      parseIssueQuery(new URLSearchParams({ q: "😃".repeat(100) })),
    ).not.toThrow();
    expect(() =>
      parseIssueQuery(new URLSearchParams({ q: "😃".repeat(101) })),
    ).toThrow();
  });
});
