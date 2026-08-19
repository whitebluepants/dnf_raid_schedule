import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { ScheduleWorkbenchData } from "@/features/schedule-workbench/repository";
import { ScheduleWorkbench } from "@/features/schedule-workbench/schedule-workbench";
import { saveScheduleDraft } from "@/features/schedule-workbench/actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/schedule-workbench/actions", () => ({
  generateAndPersistSchedule: vi.fn(),
  publishSchedule: vi.fn(),
  replaceScheduleSnapshot: vi.fn().mockResolvedValue({ status: "success", data: { version: 2 } }),
  saveScheduleDraft: vi.fn().mockResolvedValue({ status: "success", data: { versions: { "wave-1": 2 } } }),
  setMemberAttendance: vi.fn(),
}));

const character = (id: string, name: string, accountId: string) => ({
  id,
  accountId,
  profileId: `profile-${id}`,
  name,
  memberName: `成员-${name}`,
  accountName: `账号-${accountId}`,
  role: "dealer" as const,
  fame: 70000,
  strengthTier: "high" as const,
  damageScore: 100,
  buffScore: null,
});

const data = (): ScheduleWorkbenchData => ({
  event: { id: "event-1", title: "周六攻坚", gameWeek: "2026-08-17", eventDate: "2026-08-22T12:00:00Z", status: "draft" },
  waves: [{
    id: "wave-1",
    number: 1,
    difficulty: "hard",
    status: "draft",
    version: 1,
    teams: {
      red: { color: "red", slots: [
        { slotId: "red-1", role: "buffer", character: null, locked: true },
        { slotId: "red-2", role: "dealer", character: character("a", "阿修罗", "one"), locked: false },
        { slotId: "red-3", role: "dealer", character: null, locked: false },
        { slotId: "red-4", role: "dealer", character: null, locked: false },
      ] },
      yellow: { color: "yellow", slots: [
        { slotId: "yellow-1", role: "buffer", character: null, locked: false },
        { slotId: "yellow-2", role: "dealer", character: character("b", "剑魂", "two"), locked: false },
        { slotId: "yellow-3", role: "dealer", character: null, locked: false },
        { slotId: "yellow-4", role: "dealer", character: null, locked: false },
      ] },
      green: { color: "green", slots: [
        { slotId: "green-1", role: "buffer", character: null, locked: false },
        { slotId: "green-2", role: "dealer", character: null, locked: false },
        { slotId: "green-3", role: "dealer", character: null, locked: false },
        { slotId: "green-4", role: "dealer", character: null, locked: false },
      ] },
    },
    gaps: [],
  }],
  characters: [character("a", "阿修罗", "one"), character("b", "剑魂", "two"), character("c", "漫游", "three"), character("d", "同账号角色", "one")],
  weeklyUsedCharacterIds: [],
  difficultyPresets: {},
  ownAttendance: "participating",
  canManage: true,
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ScheduleWorkbench", () => {
  test("places a candidate, swaps occupied slots, and returns a selected slot to the pool", () => {
    render(<ScheduleWorkbench initialData={data()} />);

    fireEvent.click(screen.getByRole("button", { name: /候补角色 漫游/ }));
    fireEvent.click(screen.getByRole("button", { name: /^红队 3号 C 槽位/ }));
    expect(screen.getByRole("button", { name: /^红队 3号 C 槽位.*漫游/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^红队 2号 C 槽位.*阿修罗/ }));
    fireEvent.click(screen.getByRole("button", { name: /^黄队 2号 C 槽位.*剑魂/ }));
    expect(screen.getByRole("button", { name: /^红队 2号 C 槽位.*剑魂/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^黄队 2号 C 槽位.*阿修罗/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^黄队 2号 C 槽位.*阿修罗/ }));
    fireEvent.click(screen.getByRole("button", { name: "移回候补" }));
    expect(screen.getByRole("button", { name: /候补角色 阿修罗/ })).toBeInTheDocument();
  });

  test("visually locks a slot and prevents placement into it", () => {
    render(<ScheduleWorkbench initialData={data()} />);

    const lockedSlot = screen.getByRole("button", { name: /^红队 1号 奶 槽位.*已锁定/ });
    expect(within(lockedSlot).getByText("已锁定")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /候补角色 漫游/ }));
    fireEvent.click(lockedSlot);

    expect(screen.getByText("该槽位已锁定，请先解锁")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /候补角色 漫游/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("blocks publishing an incomplete schedule in the client", () => {
    render(<ScheduleWorkbench initialData={data()} />);

    fireEvent.click(screen.getByRole("button", { name: "发布排表" }));

    expect(screen.getByText("排表还有空槽位，补齐后才能发布")).toBeInTheDocument();
  });

  test("prevents placing two characters from the same account in one wave", () => {
    render(<ScheduleWorkbench initialData={data()} />);

    fireEvent.click(screen.getByRole("button", { name: /候补角色 同账号角色/ }));
    fireEvent.click(screen.getByRole("button", { name: /^红队 3号 C 槽位/ }));

    expect(screen.getByText("同一波次不能安排同一账号的多个角色")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^红队 3号 C 槽位，空/ })).toBeInTheDocument();
  });

  test("preserves dirty local edits on a remote refresh until the user reloads the server version", async () => {
    const { rerender } = render(<ScheduleWorkbench initialData={data()} />);
    fireEvent.click(screen.getByRole("button", { name: /候补角色 漫游/ }));
    fireEvent.click(screen.getByRole("button", { name: /^红队 3号 C 槽位/ }));
    expect(screen.getByRole("button", { name: /^红队 3号 C 槽位.*漫游/ })).toBeInTheDocument();

    const refreshed = data();
    refreshed.waves[0].version = 8;
    rerender(<ScheduleWorkbench initialData={refreshed} />);

    await waitFor(() => expect(screen.getByText("服务器排表已更新，本地未保存修改仍保留")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^红队 3号 C 槽位.*漫游/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "载入服务器版本" }));
    expect(screen.getByRole("button", { name: /^红队 3号 C 槽位，空/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(saveScheduleDraft).toHaveBeenCalledWith(expect.objectContaining({ expectedVersions: { "wave-1": 8 } })));
  });
});
