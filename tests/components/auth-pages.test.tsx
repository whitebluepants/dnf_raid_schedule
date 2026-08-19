import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

import LoginPage from "@/app/(auth)/login/page";
import RegisterPage from "@/app/(auth)/register/page";

describe("authentication pages", () => {
  test("login uses a nickname rather than an email address", () => {
    render(<LoginPage />);

    expect(screen.getByLabelText("昵称")).toBeInTheDocument();
    expect(screen.queryByLabelText("邮箱")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "登录" })).toBeInTheDocument();
  });

  test("registration asks only for a nickname and password", () => {
    render(<RegisterPage />);

    expect(screen.getByLabelText("昵称")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.queryByLabelText("游戏昵称")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("邮箱")).not.toBeInTheDocument();
  });
});
