import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const rosterActions = vi.hoisted(() => ({
  archiveCharacter: vi.fn(),
  createGameAccount: vi.fn(),
  saveCharacter: vi.fn(),
}));
const navigationMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/features/roster/actions", () => ({
  archiveCharacter: rosterActions.archiveCharacter,
  createGameAccount: rosterActions.createGameAccount,
  saveCharacter: rosterActions.saveCharacter,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: navigationMocks.refresh }),
}));

import { CharacterForm } from "@/features/roster/character-form";
import { CharacterList } from "@/features/roster/character-list";

afterEach(cleanup);
afterEach(() => navigationMocks.refresh.mockReset());

describe("CharacterForm", () => {
  test("requires the dealer damage metric and presents it in an accessible dialog", () => {
    render(
      <CharacterForm
        accounts={[{ id: "account-1", name: "主账号", characters: [] }]}
        triggerLabel="新增角色"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "新增角色" }));

    expect(screen.getByRole("dialog", { name: "新增角色" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "新增角色" })).toHaveFocus();
    expect(screen.getByLabelText("账号")).toBeRequired();
    expect(screen.getByLabelText("角色名")).toBeRequired();
    expect(screen.getByLabelText("职业")).toBeRequired();
    expect(screen.getByLabelText("名望")).toBeRequired();
    expect(screen.getByLabelText("强度档位")).toBeRequired();
    expect(screen.getByLabelText("模拟伤害")).toBeRequired();
  });

  test("switches the required metric for buffer characters without carrying over the dealer value", () => {
    render(
      <CharacterForm
        accounts={[{ id: "account-1", name: "主账号", characters: [] }]}
        triggerLabel="新增角色"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "新增角色" }));
    fireEvent.change(screen.getByLabelText("模拟伤害"), { target: { value: "1234" } });
    fireEvent.change(screen.getByLabelText("定位"), { target: { value: "buffer" } });

    expect(screen.queryByLabelText("模拟伤害")).not.toBeInTheDocument();
    expect(screen.getByLabelText("奶量")).toBeRequired();
    expect(screen.getByLabelText("奶量")).toHaveValue(null);
  });

  test("clears the inline account form after a successful account save", async () => {
    rosterActions.createGameAccount.mockResolvedValueOnce({ ok: true, value: "account-2" });
    render(<CharacterForm accounts={[]} triggerLabel="新增角色" />);

    fireEvent.click(screen.getByRole("button", { name: "新增角色" }));
    const accountName = screen.getByLabelText("新账号名");
    fireEvent.change(accountName, { target: { value: "备用账号" } });
    fireEvent.click(screen.getByRole("button", { name: "添加账号" }));

    await waitFor(() => expect(accountName).toHaveValue(""));
    expect(navigationMocks.refresh).toHaveBeenCalledOnce();
  });

  test("does not duplicate an inline account that arrives in refreshed account props", async () => {
    rosterActions.createGameAccount.mockResolvedValueOnce({ ok: true, value: "account-2" });
    const { rerender } = render(<CharacterForm accounts={[]} triggerLabel="新增角色" />);

    fireEvent.click(screen.getByRole("button", { name: "新增角色" }));
    fireEvent.change(screen.getByLabelText("新账号名"), { target: { value: "备用账号" } });
    fireEvent.click(screen.getByRole("button", { name: "添加账号" }));
    await waitFor(() => expect(screen.getByRole("option", { name: "备用账号" })).toBeInTheDocument());

    rerender(<CharacterForm accounts={[{ id: "account-2", name: "备用账号", characters: [] }]} triggerLabel="新增角色" />);

    expect(screen.getAllByRole("option", { name: "备用账号" })).toHaveLength(1);
  });

  test("closes the dialog with Escape", () => {
    render(<CharacterForm accounts={[]} triggerLabel="新增角色" />);

    fireEvent.click(screen.getByRole("button", { name: "新增角色" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增角色" })).toHaveFocus();
  });
});

describe("CharacterList", () => {
  test("shows a Chinese empty state and role-specific character metric", () => {
    const { rerender } = render(<CharacterList accounts={[]} />);
    expect(screen.getByText("还没有角色")).toBeInTheDocument();

    rerender(<CharacterList accounts={[{
      id: "account-1",
      name: "主账号",
      characters: [{ id: "character-1", name: "奶妈", class_name: "圣职者", role: "buffer", fame: 80000, strength_tier: "high", simulated_damage: null, buffer_power: 980, notes: "主力" }],
    }]} />);

    expect(screen.getByText("奶量 980")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑奶妈" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "归档奶妈" })).toBeInTheDocument();
  });
});
