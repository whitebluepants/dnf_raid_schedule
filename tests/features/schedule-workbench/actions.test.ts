import { describe, expect, test } from "vitest";

import { CurrentSpaceError } from "@/lib/current-space";
import { runScheduleAction } from "@/features/schedule-workbench/action-result";

describe("schedule workbench actions", () => {
  test("maps current-space and database read failures to discriminated results", async () => {
    await expect(runScheduleAction(async () => { throw new CurrentSpaceError("current_space_forbidden"); })).resolves.toEqual({
      status: "forbidden",
      message: "当前空间不可访问，请重新选择空间",
    });
    await expect(runScheduleAction(async () => { throw new Error("private database details"); })).resolves.toEqual({
      status: "error",
      message: "操作失败，请稍后重试",
    });
  });
});
