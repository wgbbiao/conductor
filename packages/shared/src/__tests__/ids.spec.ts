import { describe, it, expect } from "vitest";
import { newId } from "../ids";

describe("newId", () => {
  it("带前缀且全局唯一", () => {
    const a = newId("wi"); // work-item
    const b = newId("wi");
    expect(a).toMatch(/^wi_[A-Za-z0-9_-]{16,}$/);
    expect(a).not.toBe(b);
  });
});
