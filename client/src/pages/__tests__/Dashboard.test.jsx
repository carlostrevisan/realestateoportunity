import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "../Dashboard.jsx";

// OpportunityMap is a heavy Leaflet component. Replace with a lightweight stub
// so tests focus on the Dashboard shell, not map internals.
vi.mock("../../components/OpportunityMap.jsx", () => ({
  default: () => <div data-testid="opportunity-map">Map Stub</div>,
}));

// ---------------------------------------------------------------------------
// Fetch mock helpers
//
// We mock `globalThis.fetch` directly (rather than relying on MSW) to avoid
// AbortSignal compatibility issues between happy-dom's AbortController
// and MSW's undici interceptor. The mock simply ignores the signal and
// returns the configured response.
// ---------------------------------------------------------------------------

const FILTERS_RESPONSE = {
  cities: ["Tampa", "Orlando"],
  zips: ["33606", "33629", "32803"],
};

const GEOJSON_EMPTY = { type: "FeatureCollection", features: [], meta: { total: 0, showing: 0, limit: 1000, listing_type: "for_sale" } };

function makeFetchMock(responses = {}) {
  return vi.fn((url) => {
    const key = Object.keys(responses).find((k) => url.includes(k));
    const data = key ? responses[key] : {};
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
    });
  });
}

beforeEach(() => {
  globalThis.fetch = makeFetchMock({
    "/api/opportunities/filters": FILTERS_RESPONSE,
    "/api/opportunities": GEOJSON_EMPTY,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper: render Dashboard inside a router (required by react-router-dom hooks)
function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Initial render
// ─────────────────────────────────────────────────────────────────────────────

describe("Dashboard — initial render", () => {
  it("renders the filter bar labels", () => {
    // Arrange & Act
    renderDashboard();
    // Assert — key filter labels are visible
    expect(screen.getByText("Inventory Type")).toBeInTheDocument();
    expect(screen.getByText("Market / City")).toBeInTheDocument();
    expect(screen.getByText("ZIP Code")).toBeInTheDocument();
    expect(screen.getByText("Min. Opportunity")).toBeInTheDocument();
  });

  it("renders the map stub", () => {
    renderDashboard();
    expect(screen.getByTestId("opportunity-map")).toBeInTheDocument();
  });

  it("does not show the property sidebar on first render (no property selected)", () => {
    renderDashboard();
    // The sidebar shows financials and comps only when a property is selected
    expect(screen.queryByText(/Financials/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Comparable Sales/i)).not.toBeInTheDocument();
  });

  it("does not show the Reset button when no filters are active", () => {
    renderDashboard();
    expect(screen.queryByRole("button", { name: /Reset/i })).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// API data loading — filters dropdown
// ─────────────────────────────────────────────────────────────────────────────

describe("Dashboard — filter dropdowns populate from API", () => {
  it("populates the Market / City dropdown with values from /api/opportunities/filters", async () => {
    // Arrange
    renderDashboard();

    // Act + Assert — wait for the component to re-render after the API call
    await waitFor(() => {
      const citySelect = document.querySelector('select[name="city"]');
      // The mock returns ["Tampa", "Orlando"]
      expect(within(citySelect).getByText("Tampa")).toBeInTheDocument();
    });
  });

  it("populates the ZIP Code dropdown with values from /api/opportunities/filters", async () => {
    renderDashboard();

    await waitFor(() => {
      const zipSelect = document.querySelector('select[name="zip"]');
      // The mock returns ["33606", "33629", "32803"]
      expect(within(zipSelect).getByText("33606")).toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROI colour toggle buttons
// ─────────────────────────────────────────────────────────────────────────────

describe("Dashboard — ROI colour toggles", () => {
  it("renders all four ROI label texts: High, Mid, Loss, None", () => {
    renderDashboard();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Mid")).toBeInTheDocument();
    expect(screen.getByText("Loss")).toBeInTheDocument();
    expect(screen.getByText("None")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Inventory type selector
// ─────────────────────────────────────────────────────────────────────────────

describe("Dashboard — Inventory Type selector", () => {
  it("defaults to 'Active Listings'", () => {
    renderDashboard();
    const select = document.querySelector('select[name="listing_type"]');
    expect(select.value).toBe("for_sale");
    expect(within(select).getByText("Active Listings")).toBeInTheDocument();
  });

  it("shows Sold History and All Properties options", () => {
    renderDashboard();
    const select = document.querySelector('select[name="listing_type"]');
    expect(within(select).getByText("Sold History")).toBeInTheDocument();
    expect(within(select).getByText("All Properties")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reset button — appears when filters are active
// ─────────────────────────────────────────────────────────────────────────────

describe("Dashboard — Reset button visibility", () => {
  it("shows the Reset button when the user types in the min ROI field", async () => {
    // Arrange
    const user = userEvent.setup();
    renderDashboard();

    // Act — type a value into the Min Opportunity input
    const minRoiInput = document.querySelector('input[name="min_roi"]');
    await user.type(minRoiInput, "50000");

    // Assert
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Reset/i })).toBeInTheDocument();
    });
  });

  it("hides the Reset button after clicking it", async () => {
    const user = userEvent.setup();
    renderDashboard();

    // Activate a filter
    const minRoiInput = document.querySelector('input[name="min_roi"]');
    await user.type(minRoiInput, "50000");
    await waitFor(() => expect(screen.getByRole("button", { name: /Reset/i })).toBeInTheDocument());

    // Click Reset
    await user.click(screen.getByRole("button", { name: /Reset/i }));

    // The Reset button should disappear
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Reset/i })).not.toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// API error handling
// ─────────────────────────────────────────────────────────────────────────────

describe("Dashboard — graceful API error handling", () => {
  it("does not crash when /api/opportunities/filters returns a network error", async () => {
    // Arrange — override fetch to reject for this test
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    // Act
    renderDashboard();

    // Assert — app still renders without throwing
    await waitFor(() => {
      expect(screen.getByText("Inventory Type")).toBeInTheDocument();
    });

    // City dropdown falls back to empty list (only "All Markets" option)
    const citySelect = document.querySelector('select[name="city"]');
    expect(citySelect.options.length).toBe(1);
  });
});
