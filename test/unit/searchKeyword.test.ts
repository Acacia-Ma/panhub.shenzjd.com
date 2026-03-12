import { describe, expect, it } from "vitest";
import {
  buildSearchKeywordVariants,
  matchesSearchKeyword,
  normalizeSearchKeyword,
} from "../../server/core/utils/searchKeyword";

describe("search keyword helpers", () => {
  it("normalizes punctuation and whitespace", () => {
    expect(normalizeSearchKeyword(" 肖申克 的 救赎 4K ")).toBe("肖申克的救赎4k");
  });

  it("builds useful variants for cjk queries", () => {
    const variants = buildSearchKeywordVariants("肖申克的救赎 4K");

    expect(variants).toContain("肖申克的救赎 4K");
    expect(variants).toContain("肖申克 救赎");
    expect(variants).toContain("肖申克");
    expect(variants).toContain("救赎");
  });

  it("matches text by normalized phrase", () => {
    expect(matchesSearchKeyword("肖申克的救赎 (1994) 4K", "肖申克的救赎")).toBe(true);
  });

  it("matches text by cjk keyword variants", () => {
    expect(matchesSearchKeyword("经典高分电影: 肖申克 4K 修复版", "肖申克的救赎 4K")).toBe(true);
  });
});
