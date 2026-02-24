import overviewKpi from '@/assets/overview-kpi-cards.jpg';
import overviewMap from '@/assets/overview-station-map.jpg';
import overviewCharts from '@/assets/overview-charts.jpg';

export default function DashboardOverview() {
  const handlePrint = () => window.print();

  return (
    <div className="bg-white text-gray-900 min-h-screen">
      {/* Print button - hidden when printing */}
      <div className="print:hidden fixed top-4 right-4 z-50">
        <button
          onClick={handlePrint}
          className="bg-teal-600 text-white px-5 py-2.5 rounded-lg shadow-lg hover:bg-teal-700 transition font-medium flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>
          Save as PDF
        </button>
      </div>

      {/* ============ PAGE 1 ============ */}
      <div className="pdf-page px-12 py-10 max-w-[850px] mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-2">
          <div className="w-12 h-12 rounded-xl bg-teal-600 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"/><path d="m2 12 10-8 10 8"/><path d="m2 12 10 8 10-8"/></svg>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              TPRFN <span className="text-teal-600">Health Dashboard</span>
            </h1>
            <p className="text-sm text-gray-500 font-medium">RF Connection Analytics &amp; Network Monitoring</p>
          </div>
        </div>

        <hr className="my-5 border-gray-200" />

        {/* Intro */}
        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2 text-gray-800">Overview</h2>
          <p className="text-sm leading-relaxed text-gray-700">
            The TPRFN Health Dashboard is a real-time analytics platform built to monitor and analyze
            the performance of the TPRFN (The Preparedness Radio Frequency Network) amateur radio network.
            It ingests VARA HF syslog data from over 20 hub stations across the United States and
            transforms raw connection logs into actionable insights—tracking signal quality, session
            reliability, data throughput, and station activity. Network operators use it to identify
            underperforming links, detect inactive hubs, and understand propagation patterns over time.
          </p>
        </section>

        {/* KPI Section */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2 text-gray-800">📊 Key Performance Indicators</h2>
          <p className="text-sm text-gray-600 mb-3">
            Four KPI cards at the top of the dashboard provide an at-a-glance summary: <strong>Average S/N Ratio</strong> across
            all connections, total <strong>Connect Events</strong> (VARA HF session starts), cumulative <strong>Data Transfer</strong> volumes
            (TX/RX), and the number of <strong>S/N Readings</strong> collected. Each card includes comparison metrics
            against the previous time period to show trends.
          </p>
          <img src={overviewKpi} alt="KPI cards showing signal ratio, connect events, data transfer and S/N readings" className="w-full rounded-lg border border-gray-200 shadow-sm" />
        </section>

        {/* Map Section */}
        <section className="mb-2">
          <h2 className="text-lg font-semibold mb-2 text-gray-800">🗺️ Live Station Map</h2>
          <p className="text-sm text-gray-600 mb-3">
            An interactive Leaflet map plots all hub and polling station locations in real time. Stations
            are color-coded by type (hub, polling, active) and connection lines visualize which stations
            are currently linked. The map supports <strong>Live Mode</strong> with an auto-refreshing activity feed,
            plus overlay modes to color stations by S/N ratio, bitrate, or session count. Fullscreen mode
            is available for presentations.
          </p>
          <img src={overviewMap} alt="Live station map showing hub and polling stations across the US with connection lines" className="w-full rounded-lg border border-gray-200 shadow-sm" />
        </section>
      </div>

      {/* ============ PAGE 2 ============ */}
      <div className="pdf-page px-12 py-10 max-w-[850px] mx-auto">
        {/* Charts Section */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2 text-gray-800">📈 Signal &amp; Performance Charts</h2>
          <p className="text-sm text-gray-600 mb-3">
            The dashboard includes a rich suite of interactive charts powered by Recharts:
          </p>
          <ul className="text-sm text-gray-600 space-y-1.5 mb-3 pl-5 list-disc">
            <li><strong>S/N by Hub</strong> — Horizontal bar chart ranking each hub connection by average signal-to-noise ratio, with color-coded quality badges (Excellent → Bad).</li>
            <li><strong>Signal Quality Pie Chart</strong> — Donut chart breaking down all S/N readings into five quality tiers with percentage labels.</li>
            <li><strong>S/N Heatmap</strong> — Time-of-day vs. date heatmap revealing propagation patterns and optimal operating windows.</li>
            <li><strong>Bitrate Analysis</strong> — Station-level bitrate distributions and a peak bitrate leaderboard.</li>
            <li><strong>Connection Success Rate</strong> — Tracks session reliability per hub pair over the selected date range.</li>
            <li><strong>Disconnect Analysis</strong> — Identifies patterns in session terminations to diagnose link instability.</li>
          </ul>
          <img src={overviewCharts} alt="Signal quality charts including bar chart, pie chart, and heatmap" className="w-full rounded-lg border border-gray-200 shadow-sm" />
        </section>

        {/* Additional Features */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2 text-gray-800">⚙️ Additional Features</h2>
          <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="font-semibold text-gray-800 mb-1">🔔 Inactive Hub Alerts</p>
              <p>Automatically detects hubs with no activity in the past 24 hours and displays a prominent banner with the last-seen timestamp for each.</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="font-semibold text-gray-800 mb-1">📅 Flexible Date Filtering</p>
              <p>Quick presets (Today, 7 Days, 30 Days, Custom) with comparison periods. Station-level drill-down via dropdown or by clicking hub pairs.</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="font-semibold text-gray-800 mb-1">🤖 AI Dashboard Analysis</p>
              <p>One-click AI-powered analysis generates a natural-language summary of current network health, notable trends, and recommended actions.</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="font-semibold text-gray-800 mb-1">📋 Net Session Logging</p>
              <p>Record and manage scheduled net sessions with start/end times and notes, providing historical context alongside syslog data.</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="font-semibold text-gray-800 mb-1">📡 Station Location Polling</p>
              <p>Automated grid-square lookups for callsigns via QRZ and HamQTH APIs, with manual override and pause/resume controls.</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="font-semibold text-gray-800 mb-1">📤 Syslog Import Pipeline</p>
              <p>Bulk import raw VARA HF syslog files via a dedicated import page. Parsed entries are deduplicated and stored in the cloud database.</p>
            </div>
          </div>
        </section>

        <hr className="my-4 border-gray-200" />
        <p className="text-xs text-gray-400 text-center">
          TPRFN Health Dashboard • tprfn-health-dashboard.lovable.app • Generated {new Date().toLocaleDateString()}
        </p>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .pdf-page { page-break-after: always; padding: 0.5in 0.75in; max-width: none; }
          .pdf-page:last-child { page-break-after: auto; }
        }
      `}</style>
    </div>
  );
}
