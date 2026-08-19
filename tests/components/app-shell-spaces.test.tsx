import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { AppShell } from "@/components/app-shell";

describe("AppShell spaces navigation", () => {
  test("links signed-in members to their spaces", () => {
    render(
      <AppShell userName="团长" memberRole="admin">
        <p>内容</p>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "空间" })).toHaveAttribute(
      "href",
      "/spaces",
    );
  });
});
