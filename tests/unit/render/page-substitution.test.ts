import { describe, expect, test } from "bun:test";
import { buildThemedLayoutPage } from "../../../src/server/routes/pages/render";
import {
  beforeHeadEnd,
  subFirst,
  windowGlobalScript,
} from "../../../src/server/render/substitute";

const DOLLAR_PATTERNS = "price $& then $$ and $' plus $` end";

describe("page placeholder substitution", () => {
  test("a themed page containing replacement patterns survives intact", async () => {
    const html = await buildThemedLayoutPage(`<p id="probe">${DOLLAR_PATTERNS}</p>`);
    expect(html).toContain(`<p id="probe">${DOLLAR_PATTERNS}</p>`);
    expect(html).not.toContain("__PAGE_CONTENT__");
  });

  test("placeholder and head helpers insert values verbatim", () => {
    expect(subFirst("<b>__X__</b>", "__X__", DOLLAR_PATTERNS)).toBe(`<b>${DOLLAR_PATTERNS}</b>`);
    expect(beforeHeadEnd("<head></head>", DOLLAR_PATTERNS)).toBe(
      `<head>${DOLLAR_PATTERNS}\n  </head>`,
    );
  });

  test("window globals cannot close their own script tag", () => {
    const script = windowGlobalScript("__PROBE__", { value: "</script><b>$&</b>" });
    expect(script).toBe(
      '<script>window.__PROBE__={"value":"<\\/script><b>$&<\\/b>"}</script>',
    );
  });
});
