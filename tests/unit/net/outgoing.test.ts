import { describe, test, expect } from "bun:test";
import {
  isUrlAllowedForOutgoing,
  parseAllowedHosts,
} from "../../../src/server/utils/net/outgoing";

describe("outgoing", () => {
  describe("parseAllowedHosts", () => {
    test("unset or blank means no restriction", () => {
      expect(parseAllowedHosts(undefined)).toBeNull();
      expect(parseAllowedHosts(" , ")).toBeNull();
    });

    test("trims and lowercases entries", () => {
      expect(parseAllowedHosts(" Example.COM ,api.example.org")).toEqual([
        "example.com",
        "api.example.org",
      ]);
    });
  });

  describe("isUrlAllowedForOutgoing", () => {
    test("no allowlist allows everything", () => {
      expect(isUrlAllowedForOutgoing("https://any.com", null)).toBe(true);
    });

    test("allows only listed hosts", () => {
      const allowed = parseAllowedHosts("example.com,api.example.org");
      expect(isUrlAllowedForOutgoing("https://example.com/path", allowed)).toBe(true);
      expect(isUrlAllowedForOutgoing("http://api.example.org", allowed)).toBe(true);
      expect(isUrlAllowedForOutgoing("https://other.com", allowed)).toBe(false);
      expect(isUrlAllowedForOutgoing("https://sub.example.com", allowed)).toBe(false);
    });

    test("host matching is case-insensitive", () => {
      const allowed = parseAllowedHosts("Example.COM");
      expect(isUrlAllowedForOutgoing("https://EXAMPLE.COM", allowed)).toBe(true);
    });

    test("*.example.com matches subdomains but not the apex or lookalikes", () => {
      const allowed = parseAllowedHosts("*.example.com");
      expect(isUrlAllowedForOutgoing("https://a.example.com", allowed)).toBe(true);
      expect(isUrlAllowedForOutgoing("https://a.b.example.com", allowed)).toBe(true);
      expect(isUrlAllowedForOutgoing("https://example.com", allowed)).toBe(false);
      expect(isUrlAllowedForOutgoing("https://badexample.com", allowed)).toBe(false);
    });

    test("* allows any host", () => {
      const allowed = parseAllowedHosts("*");
      expect(isUrlAllowedForOutgoing("https://any.com", allowed)).toBe(true);
    });

    test("unparseable urls are refused when an allowlist is set", () => {
      expect(isUrlAllowedForOutgoing("not-a-url", parseAllowedHosts("*"))).toBe(false);
    });
  });
});
