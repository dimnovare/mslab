import { expect, test } from "vitest";
import { parseRowId, ROW_ID_MAX } from "@/lib/row-id";

test("a row id: digits only, no leading zero, 1 … 2147483647", () => {
  expect(ROW_ID_MAX).toBe(2_147_483_647);
  expect(parseRowId("1")).toBe(1);
  expect(parseRowId("2147483647")).toBe(2147483647);
  for (const bad of ["0", "01", "2147483648", "1a", "", "-1", "1.5", " 1", "1 ", "99999999999"]) expect(parseRowId(bad), JSON.stringify(bad)).toBeNull();
});
