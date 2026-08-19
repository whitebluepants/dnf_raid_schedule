import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AppShell } from "@/components/app-shell";

describe("AppShell", () => {
  test("exposes navigation, identity, and a main landmark", () => {
    render(
      <AppShell userName="团长" memberRole="leader">
        <p>内容</p>
      </AppShell>,
    );

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "活动" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "我的角色" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "配置" })).toBeInTheDocument();
    expect(screen.getByText("团长")).toBeInTheDocument();
    expect(screen.getByText("团长 / leader")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开菜单" })).toBeInTheDocument();
  });
});
