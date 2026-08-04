import { describe, expect, it } from "vitest";
import { buildUrl } from "../../src/domain/url";

describe("buildUrl", () => {
  it("accepts localhost with port and path", () => {
    expect(buildUrl("http://localhost", ":3000/api").href).toBe("http://localhost:3000/api");
  });

  it("accepts empty path", () => {
    expect(buildUrl("http://localhost", "").href).toBe("http://localhost/");
  });

  it("keeps a leading-slash path as is", () => {
    expect(buildUrl("http://127.0.0.1", "/health").href).toBe("http://127.0.0.1/health");
  });

  it("prepends a slash to a bare path", () => {
    expect(buildUrl("http://localhost", "api/users").href).toBe("http://localhost/api/users");
  });

  it("accepts https origins", () => {
    expect(buildUrl("https://127.0.0.1", ":8443/").hostname).toBe("127.0.0.1");
  });

  it("trims whitespace around the path", () => {
    expect(buildUrl("http://localhost", "  :3000/api  ").href).toBe("http://localhost:3000/api");
  });

  it('rejects a userinfo trick that changes the host ("@evil.com")', () => {
    // new URL("http://localhost:80@evil.com/") resolves hostname to evil.com
    expect(() => buildUrl("http://localhost", ":80@evil.com/")).toThrow(
      /Only localhost and 127\.0\.0\.1/,
    );
  });

  it("rejects malformed paths", () => {
    expect(() => buildUrl("http://localhost", ":not-a-port/")).toThrow();
  });
});
