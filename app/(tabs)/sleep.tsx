import { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHealthData } from '../../src/hooks/useHealthData';
import { loadGoals } from '../../src/services/GoalsService';
import { HealthGoals, DEFAULT_GOALS } from '../../src/models/Goals';
import { HealthSnapshot } from '../../src/models/HealthSnapshot';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function sleepColor(hours: number, goal: number): string {
  if (hours >= goal * 0.95) return '#34d399';       // green — on target
  if (hours >= goal * 0.8) return '#fbbf24';        // yellow — a bit short
  return '#f87171';                                  // red — significantly short
}

function scoreColor(score: number): string {
  if (score >= 75) return '#34d399';
  if (score >= 55) return '#fbbf24';
  return '#f87171';
}

interface SleepAnalysis {
  avgHours: number;
  avgDeep: number;
  avgREM: number;
  avgLight: number;
  avgScore: number;
  consistency: number;  // range of sleep hours (lower = more consistent)
  insights: { icon: string; color: string; text: string }[];
}

function analyzeSleep(snapshots: HealthSnapshot[], goalHours: number): SleepAnalysis | null {
  const days = snapshots.filter(s => s.sleepHours != null && s.sleepHours > 0);
  if (days.length === 0) return null;

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const avgHours  = avg(days.map(s => s.sleepHours!));
  const deepDays  = days.filter(s => s.deepSleepHours != null);
  const remDays   = days.filter(s => s.remSleepHours != null);
  const lightDays = days.filter(s => s.lightSleepHours != null);
  const scoreDays = days.filter(s => s.sleepScore != null);

  const avgDeep   = avg(deepDays.map(s => s.deepSleepHours!));
  const avgREM    = avg(remDays.map(s => s.remSleepHours!));
  const avgLight  = avg(lightDays.map(s => s.lightSleepHours!));
  const avgScore  = avg(scoreDays.map(s => s.sleepScore!));

  const hours = days.map(s => s.sleepHours!);
  const consistency = Math.max(...hours) - Math.min(...hours);

  const insights: { icon: string; color: string; text: string }[] = [];

  const deficit = goalHours - avgHours;
  if (deficit > 0.5) {
    insights.push({
      icon: 'moon',
      color: '#f87171',
      text: `Averaging ${avgHours.toFixed(1)}h — ${deficit.toFixed(1)}h under your ${goalHours}h goal. Try moving bedtime 30 min earlier tonight.`,
    });
  } else if (deficit <= 0) {
    insights.push({
      icon: 'checkmark-circle',
      color: '#34d399',
      text: `Averaging ${avgHours.toFixed(1)}h — you're meeting your ${goalHours}h sleep goal this week.`,
    });
  } else {
    insights.push({
      icon: 'moon',
      color: '#fbbf24',
      text: `Averaging ${avgHours.toFixed(1)}h, just ${deficit.toFixed(1)}h short of your goal. Close but worth tightening up.`,
    });
  }

  if (avgDeep > 0 && avgDeep < 1.0) {
    insights.push({
      icon: 'alert-circle',
      color: '#fbbf24',
      text: `Deep sleep is averaging only ${avgDeep.toFixed(1)}h. Avoid alcohol 3+ hours before bed and keep your room below 68°F (20°C).`,
    });
  } else if (avgDeep >= 1.5) {
    insights.push({
      icon: 'star',
      color: '#34d399',
      text: `Deep sleep is strong at ${avgDeep.toFixed(1)}h avg — this is peak physical recovery time.`,
    });
  }

  if (avgREM > 0 && avgREM < 1.2) {
    insights.push({
      icon: 'alert-circle',
      color: '#fbbf24',
      text: `REM sleep is low at ${avgREM.toFixed(1)}h avg. REM handles memory and mood — consistent sleep schedule helps the most.`,
    });
  } else if (avgREM >= 1.5) {
    insights.push({
      icon: 'checkmark-circle',
      color: '#34d399',
      text: `REM sleep looks solid at ${avgREM.toFixed(1)}h avg — memory consolidation and mood regulation are well-supported.`,
    });
  }

  if (consistency > 1.5) {
    insights.push({
      icon: 'time',
      color: '#fbbf24',
      text: `Sleep schedule varies by ${consistency.toFixed(1)} hours this week. Irregular timing reduces sleep quality even if total hours look fine.`,
    });
  } else if (consistency <= 0.75 && days.length >= 4) {
    insights.push({
      icon: 'checkmark-circle',
      color: '#34d399',
      text: `Very consistent sleep schedule (only ${consistency.toFixed(1)}h variation) — your circadian rhythm is well-anchored.`,
    });
  }

  if (avgScore > 0) {
    if (avgScore >= 75) {
      insights.push({ icon: 'trophy', color: '#34d399', text: `Sleep quality score of ${avgScore.toFixed(0)}/100 is excellent this week.` });
    } else if (avgScore < 55) {
      insights.push({ icon: 'alert-circle', color: '#f87171', text: `Sleep quality score averaging ${avgScore.toFixed(0)}/100 — check if high stress days correlate with poor scores.` });
    }
  }

  return { avgHours, avgDeep, avgREM, avgLight, avgScore, consistency, insights };
}

function SleepBar({ snapshot, goalHours, maxHours }: {
  snapshot: HealthSnapshot; goalHours: number; maxHours: number;
}) {
  const hours = snapshot.sleepHours ?? 0;
  const pct = maxHours > 0 ? Math.min(hours / maxHours, 1) : 0;
  const color = sleepColor(hours, goalHours);
  const dayLabel = DAY_LABELS[new Date(snapshot.date + 'T12:00:00').getDay()];

  return (
    <View style={bar.row}>
      <Text style={bar.dayLabel}>{dayLabel}</Text>
      <View style={bar.track}>
        <View style={[bar.fill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
        {/* Goal marker */}
        <View style={[bar.goalLine, { left: `${Math.min(goalHours / maxHours, 1) * 100}%` as any }]} />
      </View>
      <Text style={[bar.hoursLabel, { color }]}>{hours > 0 ? `${hours.toFixed(1)}h` : '—'}</Text>
    </View>
  );
}

export default function SleepScreen() {
  const { refresh, isLoading, snapshots } = useHealthData();
  const [goals, setGoals] = useState<HealthGoals>(DEFAULT_GOALS);

  useEffect(() => {
    loadGoals().then(setGoals);
    if (snapshots.length === 0) refresh();
  }, []);

  const analysis = analyzeSleep(snapshots, goals.sleepHours);
  const sleepDays = snapshots.filter(s => (s.sleepHours ?? 0) > 0);
  const maxHours = Math.max(goals.sleepHours * 1.15, ...sleepDays.map(s => s.sleepHours ?? 0));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor="#818cf8" />}
    >
      <Text style={styles.title}>Sleep</Text>
      <Text style={styles.subtitle}>Last 7 nights · goal: {goals.sleepHours}h</Text>

      {/* 7-night bar chart */}
      <View style={styles.card}>
        {snapshots.length === 0 ? (
          <Text style={styles.empty}>Pull down to load sleep data.</Text>
        ) : (
          [...snapshots].reverse().map(s => (
            <SleepBar key={s.date} snapshot={s} goalHours={goals.sleepHours} maxHours={maxHours} />
          ))
        )}
      </View>

      {/* Summary stats */}
      {analysis && (
        <>
          <View style={styles.statsRow}>
            <StatChip label="Avg Total" value={`${analysis.avgHours.toFixed(1)}h`} color="#818cf8" />
            {analysis.avgDeep > 0 && <StatChip label="Avg Deep" value={`${analysis.avgDeep.toFixed(1)}h`} color="#6366f1" />}
            {analysis.avgREM > 0 && <StatChip label="Avg REM" value={`${analysis.avgREM.toFixed(1)}h`} color="#a78bfa" />}
            {analysis.avgScore > 0 && (
              <StatChip label="Avg Score" value={`${analysis.avgScore.toFixed(0)}`} color={scoreColor(analysis.avgScore)} />
            )}
          </View>

          {/* Insights */}
          <Text style={styles.sectionTitle}>What the data says</Text>
          {analysis.insights.map((ins, i) => (
            <View key={i} style={styles.insightRow}>
              <Ionicons name={ins.icon as any} size={18} color={ins.color} style={{ marginTop: 1 }} />
              <Text style={styles.insightText}>{ins.text}</Text>
            </View>
          ))}
        </>
      )}

      {!analysis && snapshots.length > 0 && (
        <Text style={styles.empty}>No sleep data found in last 7 days.</Text>
      )}
    </ScrollView>
  );
}

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={stat.chip}>
      <Text style={stat.label}>{label}</Text>
      <Text style={[stat.value, { color }]}>{value}</Text>
    </View>
  );
}

const bar = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  dayLabel: { width: 32, fontSize: 12, color: '#64748b' },
  track: { flex: 1, height: 12, backgroundColor: '#334155', borderRadius: 6, overflow: 'visible', position: 'relative' },
  fill: { height: 12, borderRadius: 6 },
  goalLine: { position: 'absolute', top: -3, width: 2, height: 18, backgroundColor: '#475569', borderRadius: 1 },
  hoursLabel: { width: 38, fontSize: 12, fontWeight: '600', textAlign: 'right' },
});

const stat = StyleSheet.create({
  chip: { backgroundColor: '#1e293b', borderRadius: 10, padding: 12, flex: 1, alignItems: 'center' },
  label: { fontSize: 11, color: '#64748b', marginBottom: 4 },
  value: { fontSize: 18, fontWeight: '700' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: '#f1f5f9', marginBottom: 2 },
  subtitle: { fontSize: 14, color: '#64748b', marginBottom: 16 },
  card: { backgroundColor: '#1e293b', borderRadius: 14, padding: 16, marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#64748b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  insightRow: { flexDirection: 'row', gap: 10, marginBottom: 14, alignItems: 'flex-start' },
  insightText: { flex: 1, fontSize: 14, color: '#cbd5e1', lineHeight: 22 },
  empty: { fontSize: 14, color: '#475569', textAlign: 'center', paddingVertical: 20 },
});
