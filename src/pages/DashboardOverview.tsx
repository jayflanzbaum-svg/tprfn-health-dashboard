import overviewKpi from '@/assets/overview-kpi-cards.jpg';
import overviewMap from '@/assets/overview-station-map.jpg';
import overviewCharts from '@/assets/overview-charts.jpg';
import overviewTables from '@/assets/overview-tables.jpg';
import { Radio } from 'lucide-react';

export default function DashboardOverview() {
  const handlePrint = () => window.print();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Print button - hidden when printing */}
      <div className="print:hidden fixed top-4 right-4 z-50">
        <button
          onClick={handlePrint}
          className="bg-accent text-accent-foreground px-5 py-2.5 rounded-lg shadow-lg hover:opacity-90 transition font-medium flex items-center gap-2 text-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>
          Save as PDF
        </button>
      </div>

      {/* ============ PAGE 1 ============ */}
      <div className="pdf-page px-6 md:px-12 py-8 max-w-[900px] mx-auto">
        {/* Header - matches dashboard header */}
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Radio className="w-6 h-6 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              TPRFN <span className="text-accent">HEALTH DASHBOARD</span>
            </h1>
            <p className="text-xs text-muted-foreground font-medium tracking-wide">RF Connection Analytics • Overview Guide</p>
          </div>
        </div>

        <div className="h-px bg-border my-5" />

        {/* Intro */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2">What is the TPRFN Health Dashboard?</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
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
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold tracking-widest uppercase text-accent">Key Metrics</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Four KPI cards provide an at-a-glance summary: <strong className="text-foreground">Average S/N Ratio</strong> across
            all connections, total <strong className="text-foreground">Connect Events</strong> (VARA HF session starts), cumulative <strong className="text-foreground">Data Transfer</strong> volumes
            (TX/RX), and the number of <strong className="text-foreground">S/N Readings</strong> collected. Each card includes comparison metrics
            against the previous time period to show trends.
          </p>
          <div className="rounded-xl border border-border overflow-hidden shadow-sm">
            <img src={overviewKpi} alt="KPI cards showing signal ratio, connect events, data transfer and S/N readings" className="w-full" />
          </div>
        </section>

        {/* Map Section */}
        <section className="mb-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold tracking-widest uppercase text-accent">Live Station Map</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            An interactive Leaflet map plots all hub and polling station locations in real time. Stations
            are color-coded by type—<strong className="text-foreground">hub</strong> (blue), <strong className="text-foreground">polling</strong> (orange), and <strong className="text-foreground">active</strong> (green)—with connection lines visualizing live links. The map supports <strong className="text-foreground">Live Mode</strong> with an auto-refreshing activity feed,
            plus overlay modes to color stations by S/N ratio, bitrate, or session count.
          </p>
          <div className="rounded-xl border border-border overflow-hidden shadow-sm">
            <img src={overviewMap} alt="Live station map showing hub and polling stations across the US with connection lines" className="w-full" />
          </div>
        </section>
      </div>

      {/* ============ PAGE 2 ============ */}
      <div className="pdf-page px-6 md:px-12 py-8 max-w-[900px] mx-auto">
        {/* Charts Section */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold tracking-widest uppercase text-accent">Signal & Performance Charts</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-muted-foreground mb-4">
            <div className="bg-card rounded-lg p-3 border border-border">
              <p className="font-semibold text-foreground mb-0.5">S/N by Hub Connection</p>
              <p className="text-xs">Horizontal bar chart ranking each hub pair by average signal-to-noise ratio with color-coded quality badges.</p>
            </div>
            <div className="bg-card rounded-lg p-3 border border-border">
              <p className="font-semibold text-foreground mb-0.5">Signal Quality Distribution</p>
              <p className="text-xs">Donut chart breaking down all S/N readings into five tiers: Excellent, Good, Fair, Poor, and Bad.</p>
            </div>
            <div className="bg-card rounded-lg p-3 border border-border">
              <p className="font-semibold text-foreground mb-0.5">S/N Heatmap</p>
              <p className="text-xs">Time-of-day vs. date heatmap revealing propagation patterns and optimal operating windows.</p>
            </div>
            <div className="bg-card rounded-lg p-3 border border-border">
              <p className="font-semibold text-foreground mb-0.5">Bitrate Analysis</p>
              <p className="text-xs">Station-level bitrate distributions and a peak bitrate leaderboard for top performers.</p>
            </div>
            <div className="bg-card rounded-lg p-3 border border-border">
              <p className="font-semibold text-foreground mb-0.5">Connection Success Rate</p>
              <p className="text-xs">Tracks session reliability per hub pair over the selected date range.</p>
            </div>
            <div className="bg-card rounded-lg p-3 border border-border">
              <p className="font-semibold text-foreground mb-0.5">Disconnect Analysis</p>
              <p className="text-xs">Identifies patterns in session terminations to diagnose link instability.</p>
            </div>
          </div>
          <div className="rounded-xl border border-border overflow-hidden shadow-sm">
            <img src={overviewCharts} alt="Signal quality charts including bar chart, pie chart, and heatmap" className="w-full" />
          </div>
        </section>

        {/* Hub Connections & Log Table */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold tracking-widest uppercase text-accent">Data Tables</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            The <strong className="text-foreground">Hub Connections Table</strong> ranks every station pair by average S/N with min/max ranges, session counts, and data transfer totals.
            Below it, the <strong className="text-foreground">Log Entries Table</strong> shows every raw syslog event with filterable columns for timestamp, event type, station, partner, S/N, TX, and RX.
          </p>
          <div className="rounded-xl border border-border overflow-hidden shadow-sm">
            <img src={overviewTables} alt="Hub connections table and log entries showing station pair data" className="w-full" />
          </div>
        </section>

        {/* Additional Features */}
        <section className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold tracking-widest uppercase text-accent">Additional Features</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            {[
              { icon: '🔔', title: 'Inactive Hub Alerts', desc: 'Auto-detects hubs with no 24h activity' },
              { icon: '📅', title: 'Flexible Date Filtering', desc: 'Quick presets + custom ranges with comparison periods' },
              { icon: '🤖', title: 'AI Dashboard Analysis', desc: 'One-click AI summary of network health' },
              { icon: '📋', title: 'Net Session Logging', desc: 'Record scheduled nets with start/end times' },
              { icon: '📡', title: 'Station Location Polling', desc: 'Auto grid-square lookups via QRZ/HamQTH' },
              { icon: '📤', title: 'Syslog Import Pipeline', desc: 'Bulk import + deduplication of VARA HF logs' },
            ].map((f) => (
              <div key={f.title} className="bg-card rounded-lg p-2.5 border border-border">
                <p className="font-semibold text-foreground mb-0.5">{f.icon} {f.title}</p>
                <p className="text-muted-foreground leading-snug">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="h-px bg-border my-4" />
        <p className="text-[10px] text-muted-foreground text-center font-mono">
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
