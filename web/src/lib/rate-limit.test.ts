import assert from "node:assert/strict";
import test from "node:test";
import { isRateLimitAllowed, requestIp } from "./rate-limit";

test("업로드 제한은 5번째까지 허용하고 6번째부터 거부한다", () => {
  assert.equal(isRateLimitAllowed(1, 5), true);
  assert.equal(isRateLimitAllowed(5, 5), true);
  assert.equal(isRateLimitAllowed(6, 5), false);
});

test("검증 시도 제한은 30번째까지 허용한다", () => {
  assert.equal(isRateLimitAllowed(30, 30), true);
  assert.equal(isRateLimitAllowed(31, 30), false);
  assert.equal(isRateLimitAllowed(0, 30), false);
  assert.equal(isRateLimitAllowed(Number.NaN, 30), false);
});

test("Caddy가 추가한 X-Forwarded-For의 첫 주소를 사용한다", () => {
  const request = new Request("http://localhost/api/jobs", {
    headers: {
      "x-forwarded-for": "203.0.113.7, 10.0.0.2",
      "x-real-ip": "10.0.0.3",
    },
  });

  assert.equal(requestIp(request), "203.0.113.7");
});
