import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import Operations from "../Operations";
import { describe, it, expect, vi } from "vitest";
import { useAuth } from "@clerk/react";

// Mocking Recharts because it's not standard-DOM-friendly
vi.mock("recharts", () => ({
  BarChart: ({ children }) => <div>{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Cell: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}));

// Mocking window.confirm and window.prompt
window.confirm = vi.fn(() => true);
window.prompt = vi.fn(() => "carlosishere");

describe("Operations Page", () => {
  it("renders controls panel with sign-in banner when signed out", async () => {
    render(<Operations />);

    await waitFor(() => {
      expect(screen.getByText(/Sign in to use controls/i)).toBeDefined();
    });
    expect(screen.getAllByText(/Controls/i).length).toBeGreaterThan(0);
  });

  it("switches to the model tab", async () => {
    const user = userEvent.setup();
    render(<Operations />);
    
    const modelTab = screen.getByRole("tab", { name: /Model Engine/i });
    await user.click(modelTab);
    
    await waitFor(() => {
      expect(screen.getByText(/Trained models/i)).toBeDefined();
    }, { timeout: 3000 });
    expect(screen.getByText(/New Training Run/i)).toBeDefined();
  });

  it("can trigger a training run when signed in", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isSignedIn: true,
      userId: "user_test",
      getToken: vi.fn().mockResolvedValue("test-token"),
    });

    const user = userEvent.setup();
    render(<Operations />);

    const modelTab = screen.getByRole("tab", { name: /Model Engine/i });
    await user.click(modelTab);

    await waitFor(async () => {
      const trainBtn = screen.getByRole("button", { name: /Start Training Run/i });
      await user.click(trainBtn);
    }, { timeout: 3000 });

    await waitFor(() => {
      expect(screen.getByText(/Starting.../i)).toBeDefined();
    }, { timeout: 3000 });
  });

  it("shows history in telemetry panel", async () => {
    const user = userEvent.setup();
    render(<Operations />);
    
    const historyTab = screen.getByRole("tab", { name: /History/i });
    await user.click(historyTab);
    
    await waitFor(() => {
      expect(screen.getByText("TRAIN")).toBeDefined();
    }, { timeout: 3000 });
  });
});
