import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("persistent error state has one page-topic h1", () => {
  const source = readFileSync(`${process.cwd()}/src/app/error.tsx`, "utf8");

  expect(source.match(/<h1(?:\s|>)/g)).toHaveLength(1);
  expect(source).not.toMatch(/<h2(?:\s|>)/);
});
