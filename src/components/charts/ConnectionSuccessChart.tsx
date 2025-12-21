import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { HubConnection } from '@/lib/syslogParser';

interface ConnectionSuccessChartProps {
  hubConnections: Map<string, HubConnection>;
}

const STATUS_COLORS = {
  success: 'hsl(142, 70%, 45%)',
  connectionFailed: 'hsl(0, 84%, 60%)',
  signalLost: 'hsl(38, 92%, 50%)',
};

export function ConnectionSuccessChart({ hubConnections }: ConnectionSuccessChartProps) {
  const { pieData, snComparisonData, stats } = useMemo(() => {
    let totalSuccess = 0;
    let connectionFailed = 0; // TX: 0, RX: 0
    let signalLost = 0; // Had data, then timed out

    // Track S/N values for successful vs failed sessions
    const successSNValues: number[] = [];
    const failedSNValues: number[] = [];

    hubConnections.forEach((hub) => {
      hub.disconnectRecords.forEach((record) => {
        // Find S/N records close to this disconnect (within 5 minutes before)
        const relatedSN = hub.snRecords.filter(sn => {
          const timeDiff = record.timestamp.getTime() - sn.timestamp.getTime();
          return timeDiff >= 0 && timeDiff < 300000; // Within 5 minutes before disconnect
        });
        
        const avgSN = relatedSN.length > 0 
          ? relatedSN.reduce((sum, r) => sum + r.snValue, 0) / relatedSN.length 
          : null;

        if (record.disconnectType === 'normal') {
          totalSuccess++;
          if (avgSN !== null) successSNValues.push(avgSN);
        } else if (record.disconnectType === 'timeout') {
          if (avgSN !== null) failedSNValues.push(avgSN);
          
          // Categorize the failure
          if (record.txBytes === 0 && record.rxBytes === 0) {
            connectionFailed++;
          } else {
            signalLost++;
          }
        }
      });
    });

    const totalFailed = connectionFailed + signalLost;
    const total = totalSuccess + totalFailed;
    const successRate = total > 0 ? ((totalSuccess / total) * 100).toFixed(1) : '0';

    // Calculate average S/N
    const avgSuccessSN = successSNValues.length > 0 
      ? successSNValues.reduce((a, b) => a + b, 0) / successSNValues.length 
      : 0;
    const avgFailedSN = failedSNValues.length > 0 
      ? failedSNValues.reduce((a, b) => a + b, 0) / failedSNValues.length 
      : 0;

    return {
      pieData: [
        { name: 'Success', value: totalSuccess, color: STATUS_COLORS.success },
        { name: 'Connection Failed', value: connectionFailed, color: STATUS_COLORS.connectionFailed },
        { name: 'Signal Lost', value: signalLost, color: STATUS_COLORS.signalLost },
      ].filter(d => d.value > 0),
      snComparisonData: [
        { name: 'Successful', sn: parseFloat(avgSuccessSN.toFixed(1)), fill: STATUS_COLORS.success },
        { name: 'Failed', sn: parseFloat(avgFailedSN.toFixed(1)), fill: STATUS_COLORS.connectionFailed },
      ],
      stats: {
        success: totalSuccess,
        connectionFailed,
        signalLost,
        total,
        successRate,
        avgSuccessSN: avgSuccessSN.toFixed(1),
        avgFailedSN: avgFailedSN.toFixed(1),
      },
    };
  }, [hubConnections]);

  return (
    <div className="chart-card h-full">
      <div className="mb-2">
        <h3 className="text-lg font-semibold text-foreground">Connection Analysis</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Success vs failure breakdown</p>
      </div>
      
      <div className="grid grid-cols-2 gap-2 h-[180px]">
        {/* Pie chart for success/failure breakdown */}
        <div className="h-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="45%"
                innerRadius={30}
                outerRadius={50}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  boxShadow: 'var(--shadow-lg)',
                  fontSize: '11px',
                }}
                formatter={(value: number, name: string) => [
                  `${value} (${((value / stats.total) * 100).toFixed(1)}%)`,
                  name
                ]}
              />
              <Legend 
                verticalAlign="bottom"
                wrapperStyle={{ fontSize: '9px', paddingTop: '4px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Bar chart for S/N comparison */}
        <div className="h-full flex flex-col">
          <p className="text-[10px] text-muted-foreground text-center mb-1">Avg S/N (dB)</p>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={snComparisonData} layout="vertical" margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis 
                  type="number" 
                  tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  width={55}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}
                  formatter={(value: number) => [`${value} dB`, 'Avg S/N']}
                />
                <Bar dataKey="sn" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Stats summary */}
      <div className="mt-2 pt-2 border-t border-border/50 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs font-medium text-green-500">{stats.success}</p>
          <p className="text-[9px] text-muted-foreground">Success</p>
        </div>
        <div>
          <p className="text-xs font-medium text-red-500">{stats.connectionFailed}</p>
          <p className="text-[9px] text-muted-foreground">No Connect</p>
        </div>
        <div>
          <p className="text-xs font-medium text-amber-500">{stats.signalLost}</p>
          <p className="text-[9px] text-muted-foreground">Signal Lost</p>
        </div>
      </div>
    </div>
  );
}
