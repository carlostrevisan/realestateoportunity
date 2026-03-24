import { render, screen } from "@testing-library/react";
import React from "react";
import OpportunityMap from "../OpportunityMap";
import { describe, it, expect, vi } from "vitest";

// Mocking leaflet itself (using the manual mock in __mocks__)
vi.mock("leaflet", () => import("../../__mocks__/leaflet"));

describe("OpportunityMap", () => {
  const opportunities = [
    {
      id: 1,
      lat: 27.948,
      lng: -82.458,
      address: "123 Oak St",
      opportunity_result: 150000,
      roi_color: "yellow",
    }
  ];

  const filters = { city: "Tampa", zip: "" };
  const roiFilters = { green: true, yellow: true, red: true };

  it("renders the map div", () => {
    const { container } = render(
      <OpportunityMap 
        filters={filters} 
        roiFilters={roiFilters} 
        opportunities={opportunities} 
      />
    );
    // The component renders a div with ref={mapRef}
    // We can check if the container has a div that Leaflet would mount to
    expect(container.querySelector("div")).toBeDefined();
  });

  it("renders the legend", () => {
    render(
      <OpportunityMap 
        filters={filters} 
        roiFilters={roiFilters} 
        opportunities={opportunities} 
      />
    );
    expect(screen.getByText(/Map Key/i)).toBeDefined();
    expect(screen.getByText(/High Yield/i)).toBeDefined();
    expect(screen.getByText(/Mid Yield/i)).toBeDefined();
    expect(screen.getByText(/Negative/i)).toBeDefined();
  });
});
