import overviewKpi from '@/assets/overview-kpi-cards.png';
import overviewMap from '@/assets/overview-station-map.png';
import overviewChartsSn from '@/assets/overview-charts-sn.png';

import overviewChartsBitrate from '@/assets/overview-charts-bitrate.png';
import overviewTables from '@/assets/overview-tables.png';
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
        {/* Header */}
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
            the performance of the TPRFN (The Packet Radio Forwarding Network) amateur radio network.
            It ingests VARA HF syslog data from over 20 hub stations across the United States and
            transforms raw connection logs into actionable insights—tracking signal quality, session
            reliability, data throughput, and station activity. The entire dashboard can be filtered
            by hub station callsign and by date or date range, allowing operators to drill into
            specific stations or time periods. Network operators use it to identify underperforming
            links, detect inactive hubs, and understand propagation patterns over time.
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
            <img src={overviewKpi} alt="Dashboard header with KPI cards showing signal ratio, connect events, data transfer and S/N readings" className="w-full" />
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
            <img src={overviewMap} alt="Live station map showing hub and polling stations across the US with activity feed" className="w-full" />
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
              <p className="text-xs">Horizontal bar chart ranking each hub pair by average signal-to-noise ratio with color-coded quality badges (Excellent, Good, Fair, Poor, Bad). Includes distance estimates between stations.</p>
            </div>
            <div className="bg-card rounded-lg p-3 border border-border">
              <p className="font-semibold text-foreground mb-0.5">Data Transfer by Connection</p>
              <p className="text-xs">Stacked bar chart showing total bytes sent (TX) and received (RX) per hub pair, with distance and total KB displayed for each connection.</p>
            </div>
            <div className="bg-card rounded-lg p-3 border border-border">
              <p className="font-semibold text-foreground mb-0.5">Partner Session Quality</p>
              <p className="text-xs">Categorizes sessions into Data Exchanged, No Data (Probe), and Timeout—showing overall network health percentage and reliability per station pair.</p>
            </div>
            <div className="bg-card rounded-lg p-3 border border-border">
              <p className="font-semibold text-foreground mb-0.5">Bitrate Analysis</p>
              <p className="text-xs">Average bitrate by connection (TX/RX), S/N vs max bitrate correlation scatter plot, per-station bitrate breakdown, and a peak bitrate leaderboard ranking top sessions.</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-border overflow-hidden shadow-sm">
              <img src={overviewChartsSn} alt="S/N by hub connection and data transfer charts" className="w-full" />
            </div>
            <div className="rounded-xl border border-border overflow-hidden shadow-sm">
              <img src={overviewChartsBitrate} alt="Bitrate analysis, station bitrate, and peak bitrate leaderboard" className="w-full" />
            </div>
          </div>
        </section>

        {/* Hub Connections Table */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold tracking-widest uppercase text-accent">Data Tables</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            The <strong className="text-foreground">Hub Connection Details</strong> table ranks every station pair by average S/N with sortable columns for min/max S/N ranges, session counts, TX/RX data transfer totals, and S/N reading counts.
            Below it, the <strong className="text-foreground">Log Entries Table</strong> shows every raw syslog event with filterable columns for timestamp, event type, station, partner, S/N, TX, and RX bytes.
          </p>
          <div className="rounded-xl border border-border overflow-hidden shadow-sm">
            <img src={overviewTables} alt="Hub connection details table showing station pair metrics" className="w-full" />
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
              { icon: '🔔', title: 'Inactive Hub Alerts', desc: 'Automatically detects hub stations that have not connected to any other hub in the last 24 hours, displayed as a prominent banner with time-since-last-seen badges.' },
              { icon: '📅', title: 'Flexible Date Filtering', desc: 'Quick presets (Today, 7 days, 30 days, All Time) plus a custom date range picker. All charts and KPIs update with comparison metrics against the equivalent previous period.' },
              { icon: '✨', title: 'Analysis', desc: 'One-click analysis of overall network health, generating a natural-language summary with key findings, trends, and actionable recommendations based on current data.' },
              { icon: '📋', title: 'Net Session Logging', desc: 'Record and manage scheduled net sessions with start/end times, names, and notes. Sessions provide context for when organized activity occurred on the network.' },
              { icon: '📡', title: 'Station Location Polling', desc: 'Automated grid-square lookups via QRZ and HamQTH APIs for every callsign seen in logs. Supports manual coordinate overrides and pause/resume controls per station.' },
              { icon: '📤', title: 'Syslog Import Pipeline', desc: 'Bulk import of VARA HF syslog files with automatic parsing, deduplication, and storage. Supports both direct file upload and scheduled fetching from remote endpoints.' },
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
