import { describe, expect, it } from "vitest";
import { formatPhone, isValidEmail, isValidPhone } from "@/lib/validate";

describe("電話番号", () => {
  it.each(["090-1234-5678", "09012345678", "090 1234 5678", "(090)1234-5678", "+81 90-1234-5678", "０９０－１２３４－５６７８", "084-123-4567"])("%s は通る", (p) => {
    expect(isValidPhone(p)).toBe(true);
  });
  it.each(["1234", "090-1234", "abc", "+1 555 123 4567"])("%s ははじく", (p) => {
    expect(isValidPhone(p)).toBe(false);
  });
  it("表記をそろえる", () => {
    expect(formatPhone("+81 90 1234 5678")).toBe("090-1234-5678");
    expect(formatPhone("084-123-4567")).toBe("0841234567");
  });
});

describe("メール", () => {
  it("古い携帯の形も通す", () => {
    expect(isValidEmail("abc.@docomo.ne.jp")).toBe(true);
    expect(isValidEmail("a..b@ezweb.ne.jp")).toBe(true);
    expect(isValidEmail("taro@example.com")).toBe(true);
  });
  it("明らかにおかしいものははじく", () => {
    expect(isValidEmail("x")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@c.jp")).toBe(false);
  });
});
