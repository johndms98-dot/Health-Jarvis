import { useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHealthData } from '../../src/hooks/useHealthData';

function MetricCard({ label, value, unit, icon, color = '#34d399' }: {
  label: string; value: string | number | undefined; unit?: string; icon: string; color?: string;
}) {
  return (
    <View style={styles.card}>
      <Ionicons name={icon as any} size={20} color={color} style={{ marginBottom: 6 }} />
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.cardValue}>
        {value != null ? String(value) : '—'}
        {value != null && unit ? <Text style={styles.cardUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

function BodyBattery({ value }: { value?: number }) {
  const color = value == null ? '#64748b' : value >= 60 ? '#34d399' : value >= 30 ? '#fbbf24' : '#f87171';
  return (
    <View style={[styles.card, styles.cardWide]}>
      <Ionicons name="battery-charging" size={20} color={color} style={{ marginBottom: 6 }} />
      <Text style={styles.cardLabel}>Body Battery</Text>
      <Text style={[styles.cardValue, { color }]}>{value != null ? `${value}/100` : '—'}</Text>
      {value != null && (
        <View style={styles.batteryBar}>
          <View style={[styles.batteryFill, { width: `${value}%` as any, backgroundColor: color }]} />
        </View>
      )}
    </View>
  );
}

export default function DashboardScreen() {
  const { refresh, isLoading, snapshots, activities, lastSyncedAt, proxyReachable } = useHealthData();
  const today = snapshots[0];

  useEffect(() => { refresh(); }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor="#34d399" />}
    >
      <Text style={styles.title}>Health Dashboard</Text>
      {!proxyReachable && (
        <View style={styles.banner}>
          <Ionicons name="warning" size={14} color="#fbbf24" />
          <Text style={styles.bannerText}>  Mac proxy offline — showing cached data</Text>
        </View>
      )}
      {lastSyncedAt && (
        <Text style={styles.syncText}>Last synced {new Date(lastSyncedAt).toLocaleTimeString()}</Text>
      )}

      <Text style={styles.section}>Today</Text>
      <View style={styles.grid}>
        <BodyBattery value={today?.bodyBattery} />
        <MetricCard label="Steps" value={today?.steps?.toLocaleString()} icon="footsteps" />
        <MetricCard label="Sleep" value={today?.sleepHours?.toFixed(1)} unit="hrs" icon="moon" color="#818cf8" />
        <MetricCard label="Sleep Score" value={today?.sleepScore} unit="/100" icon="star" color="#818cf8" />
        <MetricCard label="HRV" value={today?.hrv} unit="ms" icon="heart" color="#f87171" />
        <MetricCard label="Resting HR" value={today?.restingHeartRate} unit="bpm" icon="pulse" color="#f87171" />
        <MetricCard label="SpO2" value={today?.spo2?.toFixed(1)} unit="%" icon="water" color="#60a5fa" />
        <MetricCard label="Stress" value={today?.avgStress} unit="/100" icon="thunderstorm" color="#fbbf24" />
        <MetricCard label="Respiration" value={today?.respirationAvg?.toFixed(0)} unit="br/min" icon="fitness" />
        <MetricCard label="Weight" value={today?.weightKg?.toFixed(1)} unit="kg" icon="scale" color="#a78bfa" />
        <MetricCard label="Body Fat" value={today?.bodyFatPct?.toFixed(1)} unit="%" icon="body" color="#a78bfa" />
        <MetricCard label="Muscle" value={today?.muscleMassKg?.toFixed(1)} unit="kg" icon="barbell" color="#a78bfa" />
      </View>

      {activities.length > 0 && (
        <>
          <Text style={styles.section}>Recent Activities</Text>
          {activities.slice(0, 5).map((a) => (
            <View key={a.id} style={styles.activityRow}>
              <View>
                <Text style={styles.activityName}>{a.name}</Text>
                <Text style={styles.activityMeta}>{a.date} · {a.durationMinutes}min{a.distanceKm ? ` · ${a.distanceKm.toFixed(1)}km` : ''}</Text>
              </View>
              {a.avgHeartRate && <Text style={styles.activityHR}>{a.avgHeartRate} bpm</Text>}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60 },
  title: { fontSize: 26, fontWeight: '700', color: '#f1f5f9', marginBottom: 4 },
  syncText: { fontSize: 12, color: '#64748b', marginBottom: 12 },
  banner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 8, padding: 10, marginBottom: 8 },
  bannerText: { fontSize: 13, color: '#fbbf24' },
  section: { fontSize: 16, fontWeight: '600', color: '#94a3b8', marginTop: 20, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, width: '47%' },
  cardWide: { width: '100%' },
  cardLabel: { fontSize: 12, color: '#64748b', marginBottom: 2 },
  cardValue: { fontSize: 22, fontWeight: '700', color: '#f1f5f9' },
  cardUnit: { fontSize: 14, fontWeight: '400', color: '#94a3b8' },
  batteryBar: { height: 4, backgroundColor: '#334155', borderRadius: 2, marginTop: 8 },
  batteryFill: { height: 4, borderRadius: 2 },
  activityRow: { backgroundColor: '#1e293b', borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activityName: { fontSize: 14, fontWeight: '600', color: '#f1f5f9' },
  activityMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  activityHR: { fontSize: 13, color: '#f87171', fontWeight: '600' },
});
