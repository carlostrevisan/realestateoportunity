import { useState } from "react";
import ModelingSliders from "../components/ModelingSliders.jsx";

export default function ModelingTool() {
  const [params, setParams] = useState({
    constructionCostPerSqft: 175,
    acquisitionMarkup: 0,
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">Modeling Tool</h1>
      <p className="text-gray-400 mb-6 text-sm">
        Adjust construction cost assumptions to see how opportunity scores change.
        Formula:{" "}
        <code className="bg-gray-800 px-2 py-0.5 rounded text-blue-300">
          opportunity = predicted_rebuild_value - acquisition_cost - (sqft × $/sqft)
        </code>
      </p>

      <ModelingSliders params={params} onChange={setParams} />
    </div>
  );
}
