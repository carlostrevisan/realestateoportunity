import { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

// Example property for live preview
const EXAMPLE_PROPERTY = {
  address: "123 Example St, Tampa FL 33629",
  sqft: 1800,
  predicted_rebuild_value: 650000,
  acquisition_cost: 380000,
};

export default function ModelingSliders({ params, onChange }) {
  const { constructionCostPerSqft } = params;

  const constructionCost = EXAMPLE_PROPERTY.sqft * constructionCostPerSqft;
  const opportunityResult =
    EXAMPLE_PROPERTY.predicted_rebuild_value -
    EXAMPLE_PROPERTY.acquisition_cost -
    constructionCost;

  const roiColor =
    opportunityResult > 200000
      ? "text-green-400"
      : opportunityResult >= 0
      ? "text-yellow-400"
      : "text-red-400";

  return (
    <div className="space-y-6">
      {/* Construction cost slider */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Construction Cost Assumptions</h2>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm text-gray-300">
                Cost per sqft
              </label>
              <span className="text-blue-400 font-mono font-semibold">
                ${constructionCostPerSqft}/sqft
              </span>
            </div>
            <input
              type="range"
              min={100}
              max={400}
              step={5}
              value={constructionCostPerSqft}
              onChange={(e) =>
                onChange((prev) => ({
                  ...prev,
                  constructionCostPerSqft: Number(e.target.value),
                }))
              }
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>$100 (budget)</span>
              <span>$175 (FL market avg)</span>
              <span>$400 (luxury)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-1">Live Example</h2>
        <p className="text-xs text-gray-500 mb-4">{EXAMPLE_PROPERTY.address}</p>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex justify-between border-b border-gray-700 pb-1">
              <span className="text-gray-400">Sqft</span>
              <span>{EXAMPLE_PROPERTY.sqft.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-b border-gray-700 pb-1">
              <span className="text-gray-400">Acquisition Cost</span>
              <span>${EXAMPLE_PROPERTY.acquisition_cost.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-b border-gray-700 pb-1">
              <span className="text-gray-400">Construction Cost</span>
              <span>${constructionCost.toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-b border-gray-700 pb-1">
              <span className="text-gray-400">Predicted Rebuild Value</span>
              <span>${EXAMPLE_PROPERTY.predicted_rebuild_value.toLocaleString()}</span>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center bg-gray-900 rounded-lg p-4">
            <div className="text-xs text-gray-400 mb-1">Opportunity Result</div>
            <div className={`text-3xl font-bold ${roiColor}`}>
              ${opportunityResult.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {opportunityResult > 0 ? "Profitable teardown" : "Not profitable"}
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Note: Changing sliders here updates the live preview only. To re-score all
        properties in the database with new assumptions, run{" "}
        <code className="bg-gray-800 px-1 rounded">
          docker-compose run data-worker python ml_model.py --score
        </code>
      </p>
    </div>
  );
}
