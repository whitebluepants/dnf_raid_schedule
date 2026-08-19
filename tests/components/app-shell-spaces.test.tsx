import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { AppShell } from "@/components/app-shell";

describe("AppShell spaces navigation", () => {
  test("switches signed-in members between their spaces from the header", () => {
    render(
      <AppShell userName="团长" memberRole="admin" currentSpaceName="第一团" spaces={[{ id: "space-1", name: "第一团", inviteCode: "DNF-ONE", active: true }, { id: "space-2", name: "第二团", inviteCode: "DNF-TWO", active: false }]}>
        <p>内容</p>
      </AppShell>,
    );

    expect(screen.queryByRole("link", { name: "空间" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "当前空间：第一团" })).toBeInTheDocument();
  });
});
