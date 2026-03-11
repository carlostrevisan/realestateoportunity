import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Label, Val, StatusDot, Panel, Btn, StatusBadge } from "../UI.jsx";

// ─────────────────────────────────────────────────────────────────────────────
// Label
// ─────────────────────────────────────────────────────────────────────────────

describe("Label", () => {
  it("renders its children as text", () => {
    // Arrange & Act
    render(<Label>Price Range</Label>);
    // Assert
    expect(screen.getByText("Price Range")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Val
// ─────────────────────────────────────────────────────────────────────────────

describe("Val", () => {
  it("renders children with default (primary) color when no variant prop is set", () => {
    render(<Val>$450,000</Val>);
    const el = screen.getByText("$450,000");
    expect(el).toHaveClass("text-plt-primary");
  });

  it("applies success color class when green prop is truthy", () => {
    render(<Val green>$450,000</Val>);
    expect(screen.getByText("$450,000")).toHaveClass("text-plt-success");
  });

  it("applies warning color class when yellow prop is truthy", () => {
    render(<Val yellow>$80,000</Val>);
    expect(screen.getByText("$80,000")).toHaveClass("text-plt-warning");
  });

  it("applies danger color class when red prop is truthy", () => {
    render(<Val red>-$30,000</Val>);
    expect(screen.getByText("-$30,000")).toHaveClass("text-plt-danger");
  });

  it("applies large text class when lg prop is set", () => {
    render(<Val lg>$720,000</Val>);
    expect(screen.getByText("$720,000")).toHaveClass("text-xl");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// StatusDot
// ─────────────────────────────────────────────────────────────────────────────

describe("StatusDot", () => {
  it("renders a span element", () => {
    const { container } = render(<StatusDot status="completed" />);
    expect(container.querySelector("span")).toBeInTheDocument();
  });

  it("applies the success class for completed status", () => {
    const { container } = render(<StatusDot status="completed" />);
    expect(container.querySelector("span")).toHaveClass("bg-plt-success");
  });

  it("applies the danger class for failed status", () => {
    const { container } = render(<StatusDot status="failed" />);
    expect(container.querySelector("span")).toHaveClass("bg-plt-danger");
  });

  it("applies the accent class for running status", () => {
    const { container } = render(<StatusDot status="running" />);
    expect(container.querySelector("span")).toHaveClass("bg-plt-accent");
  });

  it("applies the warning class for pending status", () => {
    const { container } = render(<StatusDot status="pending" />);
    expect(container.querySelector("span")).toHaveClass("bg-plt-warning");
  });

  it("falls back to the idle (border) class for unknown status", () => {
    const { container } = render(<StatusDot status="unknown_value" />);
    expect(container.querySelector("span")).toHaveClass("bg-plt-border");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Panel
// ─────────────────────────────────────────────────────────────────────────────

describe("Panel", () => {
  it("renders the title text", () => {
    render(<Panel title="Opportunity Score">content</Panel>);
    expect(screen.getByText("Opportunity Score")).toBeInTheDocument();
  });

  it("renders the tag when provided", () => {
    render(<Panel title="ML Status" tag="v2.1">content</Panel>);
    expect(screen.getByText("v2.1")).toBeInTheDocument();
  });

  it("omits the tag element when tag prop is not provided", () => {
    render(<Panel title="ML Status">content</Panel>);
    expect(screen.queryByText("v2.1")).not.toBeInTheDocument();
  });

  it("renders child content inside the panel body", () => {
    render(<Panel title="Data">child node</Panel>);
    expect(screen.getByText("child node")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Btn
// ─────────────────────────────────────────────────────────────────────────────

describe("Btn", () => {
  it("renders its label text", () => {
    render(<Btn>Sync Data</Btn>);
    expect(screen.getByRole("button", { name: "Sync Data" })).toBeInTheDocument();
  });

  it("calls onClick handler when clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    const handleClick = vi.fn();

    // Act
    render(<Btn onClick={handleClick}>Train Model</Btn>);
    await user.click(screen.getByRole("button", { name: "Train Model" }));

    // Assert
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Btn onClick={handleClick} disabled>Train Model</Btn>);

    await user.click(screen.getByRole("button", { name: "Train Model" }));

    expect(handleClick).not.toHaveBeenCalled();
  });

  it("renders with the primary variant class by default", () => {
    render(<Btn>Action</Btn>);
    expect(screen.getByRole("button")).toHaveClass("bg-plt-accent");
  });

  it("renders with the danger variant class when variant='danger'", () => {
    render(<Btn variant="danger">Delete</Btn>);
    expect(screen.getByRole("button")).toHaveClass("bg-plt-danger");
  });

  it("renders with the success variant class when variant='success'", () => {
    render(<Btn variant="success">Save</Btn>);
    expect(screen.getByRole("button")).toHaveClass("bg-plt-success");
  });

  it("renders with the ghost variant class when variant='ghost'", () => {
    render(<Btn variant="ghost">Cancel</Btn>);
    expect(screen.getByRole("button")).toHaveClass("bg-transparent");
  });

  it("is marked as disabled in the DOM when disabled prop is true", () => {
    render(<Btn disabled>Locked</Btn>);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// StatusBadge
// ─────────────────────────────────────────────────────────────────────────────

describe("StatusBadge", () => {
  const job = { id: "abc123def456", type: "scrape", status: "completed" };

  it("renders the job type label", () => {
    render(<StatusBadge job={job} isActive={false} onClick={() => {}} />);
    expect(screen.getByText("scrape")).toBeInTheDocument();
  });

  it("renders a shortened job id as a hash fragment", () => {
    render(<StatusBadge job={job} isActive={false} onClick={() => {}} />);
    expect(screen.getByText("#abc123")).toBeInTheDocument();
  });

  it("calls onClick when the badge is clicked", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<StatusBadge job={job} isActive={false} onClick={handleClick} />);

    await user.click(screen.getByRole("button"));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("applies the active accent style when isActive is true", () => {
    render(<StatusBadge job={job} isActive={true} onClick={() => {}} />);
    expect(screen.getByRole("button")).toHaveClass("bg-plt-accent");
  });

  it("does not apply the accent style when isActive is false", () => {
    render(<StatusBadge job={job} isActive={false} onClick={() => {}} />);
    expect(screen.getByRole("button")).not.toHaveClass("bg-plt-accent");
  });
});
