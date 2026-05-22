import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useHealthStore } from '../src/store/healthStore';
import { fetchGarminSnapshot } from '../src/services/GarminService';
import { fetchNutrition } from '../src/services/MFPService';
import { HealthSnapshot } from '../src/models/HealthSnapshot';
import { kgToLbs } from '../src/utils/units';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

function pastDates(days: number): string[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
}

function Pill({ value, label, color = '#94a3b8' }: { value: string; label: string; color?: string }) {
  return (
    <View style={pill.wrap}>
      <Text style={[pill.value, { color }]}>{value}</Text>
      <Text style={pill.label}>{label}</Text>
    </View>
  );
}

function DayCard({ snap, expanded, onPress }: {
  snap: HealthSnapshot; expanded: boolean; onPress: () => void;
}) {
  const isToday = snap.date === pastDates(1)[0];
  const bbColor = snap.bodyBattery == null ? '#64748b'
    : snap.bodyBattery >= 60 ? '#34d399'
    : snap.bodyBattery >= 30 ? '#fbbf24' : '#f87171';
  const sleepColor = snap.sleepHours == null ? '#64748b'
    : snap.sleepHours >= 7.5 ? '#818cf8'
    : snap.sleepHours >= 6 ? '#fbbf24' : '#f87171';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <View style={[card.base, expanded && card.expanded]}>
        {/* Row 1: date + top metrics */}
        <View style={card.header}>
          <View>
            <Text style={card.date}>{formatDate(snap.date)}{isToday ? '  · Today' : ''}</Text>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#475569" />
        </View>

        {/* Key metrics summary row */}
        <View style={card.pillRow}>
          {snap.bodyBattery != null && (
            <Pill value={String(snap.bodyBattery)} label="battery" color={bbColor} />
          )}
          {snap.steps != null && (
            <Pill value={snap.steps >= 1000 ? `${(snap.steps/1000).toFixed(1)}k` : String(snap.steps)} label="steps" color={snap.steps >= 10000 ? '#34d399' : '#94a3b8'} />
          )}
          {snap.sleepHours != null && snap.sleepHours > 0 && (
            <Pill value={snap.sleepHours.toFixed(1)+'h'} label="sleep" color={sleepColor} />
          )}
          {snap.hrv != null && (
            <Pill value={`${snap.hrv}ms`} label="HRV" color={snap.hrv >= 50 ? '#34d399' : snap.hrv >= 30 ? '#fbbf24' : '#f87171'} />
          )}
          {snap.caloriesConsumed != null && (
            <Pill value={Math.round(snap.caloriesConsumed).toLocaleString()} label="kcal" />
          )}
        </View>

        {/* Expanded detail */}
        {expanded && (
          <View style={card.detail}>
            <View style={card.detailGrid}>
              {snap.sleepScore != null && <DetailRow icon="star" label="Sleep score" value={`${snap.sleepScore}/100`} />}
              {snap.deepSleepHours != null && snap.deepSleepHours > 0 && <DetailRow icon="moon" label="Deep sleep" value={`${snap.deepSleepHours.toFixed(1)}h`} />}
              {snap.remSleepHours != null && snap.remSleepHours > 0 && <DetailRow icon="moon-outline" label="REM sleep" value={`${snap.remSleepHours.toFixed(1)}h`} />}
              {snap.restingHeartRate != null && <DetailRow icon="pulse" label="Resting HR" value={`${snap.restingHeartRate} bpm`} />}
              {snap.avgStress != null && <DetailRow icon="thunderstorm" label="Avg stress" value={`${snap.avgStress}/100`} />}
              {snap.spo2 != null && <DetailRow icon="water" label="SpO2" value={`${snap.spo2.toFixed(1)}%`} />}
              {snap.respirationAvg != null && <DetailRow icon="fitness" label="Respiration" value={`${snap.respirationAvg.toFixed(0)} br/min`} />}
              {snap.weightKg != null && <DetailRow icon="scale" label="Weight" value={`${kgToLbs(snap.weightKg).toFixed(1)} lbs`} />}
              {snap.bodyFatPct != null && <DetailRow icon="body" label="Body fat" value={`${snap.bodyFatPct.toFixed(1)}%`} />}
              {snap.proteinG != null && <DetailRow icon="fish" label="Protein" value={`${Math.round(snap.proteinG)}g`} />}
              {snap.carbsG != null && <DetailRow icon="nutrition" label="Carbs" value={`${Math.round(snap.carbsG)}g`} />}
              {snap.fatG != null && <DetailRow icon="water-outline" label="Fat" value={`${Math.round(snap.fatG)}g`} />}
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={detail.row}>
      <Ionicons name={icon as any} size={13} color="#475569" />
      <Text style={detail.label}>{label}</Text>
      <Text style={detail.value}>{value}</Text>
    </View>
  );
}

export default function HistoryScreen() {
  const { snapshots: storeSnapshots } = useHealthStore();
  const [snapshots, setSnapshots] = useState<HealthSnapshot[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedDays, setLoadedDays] = useState(7);

  useEffect(() => {
    // Seed from store first (instant), then try to fetch more
    if (storeSnapshots.length > 0) {
      setSnapshots(storeSnapshots as HealthSnapshot[]);
    }
    fetchHistory(14);
  }, []);

  async function fetchHistory(days: number) {
    setLoading(true);
    const dates = pastDates(days);
    const results: HealthSnapshot[] = [];

    await Promise.all(dates.map(async (date) => {
      try {
        const [garmin, nutrition] = await Promise.allSettled([
          fetchGarminSnapshot(date),
          fetchNutrition(date).then(n => n.snapshot),
        ]);
        const parts: Partial<HealthSnapshot>[] = [{ date }];
        if (garmin.status === 'fulfilled') parts.push(garmin.value);
        if (nutrition.status === 'fulfilled' && nutrition.value) parts.push(nutrition.value);
        results.push(Object.assign({}, ...parts) as HealthSnapshot);
      } catch {
        results.push({ date } as HealthSnapshot);
      }
    }));

    // Sort newest first
    results.sort((a, b) => b.date.localeCompare(a.date));
    setSnapshots(results);
    setLoadedDays(days);
    setLoading(false);
  }

  function toggle(date: string) {
    setExpanded(prev => prev === date ? null : date);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-down" size={24} color="#94a3b8" />
        </TouchableOpacity>
        <Text style={styles.title}>History</Text>
        {loading
          ? <ActivityIndicator color="#34d399" size="small" />
          : <TouchableOpacity onPress={() => fetchHistory(loadedDays === 14 ? 30 : 14)}>
              <Text style={styles.loadMore}>{loadedDays === 14 ? '30 days' : '14 days'}</Text>
            </TouchableOpacity>
        }
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {snapshots.length === 0 && !loading && (
          <Text style={styles.empty}>No data yet — pull down to refresh on the Dashboard first.</Text>
        )}
        {snapshots.map(snap => (
          <DayCard
            key={snap.date}
            snap={snap}
            expanded={expanded === snap.date}
            onPress={() => toggle(snap.date)}
          />
        ))}
        {snapshots.length > 0 && (
          <TouchableOpacity style={styles.loadMoreButton} onPress={() => fetchHistory(loadedDays === 14 ? 30 : 14)} disabled={loading}>
            <Text style={styles.loadMoreButtonText}>
              {loading ? 'Loading…' : loadedDays === 14 ? 'Load 30 days' : 'Load 14 days'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const card = StyleSheet.create({
  base: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, marginBottom: 8 },
  expanded: { borderColor: '#334155', borderWidth: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  date: { fontSize: 14, fontWeight: '600', color: '#f1f5f9' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detail: { marginTop: 14, borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 12 },
  detailGrid: { gap: 8 },
});

const pill = StyleSheet.create({
  wrap: { alignItems: 'center' },
  value: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 10, color: '#475569', marginTop: 1 },
});

const detail = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 13, color: '#64748b', flex: 1 },
  value: { fontSize: 13, fontWeight: '600', color: '#f1f5f9' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 56 },
  backButton: { padding: 4 },
  title: { fontSize: 20, fontWeight: '700', color: '#f1f5f9' },
  loadMore: { fontSize: 14, color: '#34d399' },
  content: { padding: 16, paddingTop: 0, paddingBottom: 40 },
  empty: { fontSize: 14, color: '#475569', textAlign: 'center', marginTop: 40 },
  loadMoreButton: { backgroundColor: '#1e293b', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  loadMoreButtonText: { fontSize: 14, color: '#34d399' },
});
