import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
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
  const { pieData, stats } = useMemo(() => {
    let totalSuccess = 0;
    let connectionFailed = 0; // TX: 0, RX: 0 - never connected
    let signalLost = 0; // Had data, then timed out

    // Track S/N values for successful vs failed sessions
    const successSNValues: number[] = [];
    const failedSNValues: number[] = [];

    hubConnections.forEach((hub) => {
      hub.disconnectRecords.forEach((record) => {
        // Find S/N records close to this disconnect (within 5 minutes before)
        const relatedSN = hub.snRecords.filter(sn => {
          const timeDiff = record.timestamp.getTime() - sn.timestamp.getTime();
          return timeDiff >= 0 && timeDiff < 300000;
        });
        
        const avgSN = relatedSN.length > 0 
          ? relatedSN.reduce((sum, r) => sum + r.snValue, 0) / relatedSN.length 
          : null;

        if (record.disconnectType === 'timeout') {
          if (avgSN !== null) failedSNValues.push(avgSN);
          
          // Categorize the failure
          if (record.txBytes === 0 && record.rxBytes === 0) {
            connectionFailed++;
          } else {
            signalLost++;
          }
        } else {
          // 'normal' or 'command' disconnects are successful
          totalSuccess++;
          if (avgSN !== null) successSNValues.push(avgSN);
        }
      });
    });

    const totalFailed = connectionFailed + signalLost;
    const total = totalSuccess + totalFailed;

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
        { name: 'No Connect', value: connectionFailed, color: STATUS_COLORS.connectionFailed },
        { name: 'Signal Lost', value: signalLost, color: STATUS_COLORS.signalLost },
      ].filter(d => d.value > 0),
      stats: {
        success: totalSuccess,
        connectionFailed,
        signalLost,
        total,
        avgSuccessSN: avgSuccessSN.toFixed(1),
        avgFailedSN: avgFailedSN.toFixed(1),
      },
    };
  }, [hubConnections]);

  return (
    <div className="chart-card h-full">
      <div className="mb-2">
        <h3 className="text-lg font-semibold text-foreground">Session Outcomes</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {stats.total} sessions • Avg S/N: Success {stats.avgSuccessSN} dB / Failed {stats.avgFailedSN} dB
        </p>
      </div>
      
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="45%"
              innerRadius={40}
              outerRadius={65}
              paddingAngle={2}
              dataKey="value"
              label={({ name, value, percent }) => 
                percent > 0.03 ? `${value}` : ''
              }
              labelLine={false}
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
                fontSize: '12px',
              }}
              formatter={(value: number, name: string) => [
                `${value} sessions (${((value / stats.total) * 100).toFixed(1)}%)`,
                name
              ]}
            />
            <Legend 
              verticalAlign="bottom"
              wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
              formatter={(value) => {
                const item = pieData.find(d => d.name === value);
                return (
                  <span className="text-xs text-foreground">
                    {value}: {item?.value || 0}
                  </span>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
