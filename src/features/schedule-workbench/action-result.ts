import { CurrentSpaceError } from "@/lib/current-space";
import type { ScheduleMutationResult } from "./repository";

export async function runScheduleAction<T>(operation: () => Promise<ScheduleMutationResult<T>>): Promise<ScheduleMutationResult<T>> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof CurrentSpaceError) return { status: "forbidden", message: "当前空间不可访问，请重新选择空间" };
    return { status: "error", message: "操作失败，请稍后重试" };
  }
}
