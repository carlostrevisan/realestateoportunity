import DataCenterPanel from "../components/DataCenterPanel.jsx";

export default function DataCenter() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">Data Center</h1>
      <p className="text-gray-400 mb-6 text-sm">
        Trigger MLS scrapes, monitor data freshness, and export opportunity reports.
      </p>
      <DataCenterPanel />
    </div>
  );
}
