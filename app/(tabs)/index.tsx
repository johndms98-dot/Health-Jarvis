import { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useHealthData } from '../../src/hooks/useHealthData';
import { loadGoals } from '../../src/services/GoalsService';
import { HealthGoals, DEFAULT_GOALS, adjustedTargets, computeAdjustedBattery } from '../../src/models/Goals';
import { HealthSnapshot } from '../../src/models/HealthSnapshot';
import { kgToLbs } from '../../src/utils/units';

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── Body Battery card (full width) ───────────────────────────────────────────

function BodyBatteryCard({
  garminValue, adjustedValue,
}: { garminValue?: number; adjustedValue?: number }) {
  const display = adjustedValue ?? garminValue;
  const color = display == null ? '#64748b'
    : display >= 60 ? '#34d399'
    : display >= 30 ? '#fbbf24' : '#f87171';
  const label = display == null ? '—'
    : display >= 75 ? 'High' : display >= 50 ? 'Moderate' : display >= 25 ? 'Low' : 'Drained';
  const adjusted = adjustedValue != null && garminValue != null && adjustedValue !== garminValue;

  return (
    <View style={[card.base, card.full]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="battery-charging" size={18} color={color} />
            <Text style={card.label}>Body Battery</Text>
            {adjusted && (
              <View style={card.badge}>
                <Text style={card.badgeText}>+diet</Text>
              </View>
            )}
          </View>
          <Text style={[card.bigValue, { color }]}>
            {display != null ? display : '—'}
            <Text style={card.unit}>/100</Text>
          </Text>
          <Text style={[card.sublabel, { color }]}>{label}</Text>
          {adjusted && garminValue != null && (
            <Text style={card.footnote}>Garmin: {garminValue} · nutrition adjusted</Text>
          )}
        </View>
        {display != null && (
          <View style={card.gauge}>
            <View style={[card.gaugeFill, { height: `${display}%` as any, backgroundColor: color }]} />
          </View>
        )}
      </View>
      {display != null && (
        <View style={[card.bar, { marginTop: 12 }]}>
          <View style={[card.barFill, { width: `${display}%` as any, backgroundColor: color }]} />
        </View>
      )}
    </View>
  );
}

// ── Half-width cards ──────────────────────────────────────────────────────────

function MovementCard({ steps, activeCalories, goal }: {
  steps?: number; activeCalories?: number; goal: number;
}) {
  const pct = steps != null ? Math.min((steps / goal) * 100, 100) : 0;
  const color = pct >= 100 ? '#34d399' : pct >= 60 ? '#fbbf24' : '#f87171';
  return (
    <View style={[card.base, card.half]}>
      <Ionicons name="footsteps" size={16} color={color} style={{ marginBottom: 4 }} />
      <Text style={card.label}>Movement</Text>
      <Text style={[card.bigValue, { color }]}>{steps != null ? steps.toLocaleString() : '—'}</Text>
      <Text style={card.sublabel}>goal {goal.toLocaleString()}</Text>
      <View style={[card.bar, { marginTop: 8 }]}>
        <View style={[card.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      {activeCalories != null && (
        <Text style={card.footnote}>{activeCalories.toLocaleString()} active kcal</Text>
      )}
    </View>
  );
}

function SleepCard({ hours, score, goal }: { hours?: number; score?: number; goal: number }) {
  const color = hours == null ? '#64748b'
    : hours >= goal * 0.95 ? '#818cf8'
    : hours >= goal * 0.8  ? '#fbbf24' : '#f87171';
  return (
    <View style={[card.base, card.half]}>
      <Ionicons name="moon" size={16} color={color} style={{ marginBottom: 4 }} />
      <Text style={card.label}>Sleep</Text>
      <Text style={[card.bigValue, { color }]}>
        {hours != null && hours > 0 ? hours.toFixed(1) : '—'}
        <Text style={card.unit}>h</Text>
      </Text>
      <Text style={card.sublabel}>goal {goal}h</Text>
      {score != null && (
        <>
          <View style={[card.bar, { marginTop: 8 }]}>
            <View style={[card.barFill, { width: `${score}%` as any, backgroundColor: color }]} />
          </View>
          <Text style={card.footnote}>Score {score}/100</Text>
        </>
      )}
    </View>
  );
}

function HeartCard({ hrv, rhr }: { hrv?: number; rhr?: number }) {
  const hrvColor = hrv == null ? '#64748b'
    : hrv >= 50 ? '#34d399' : hrv >= 30 ? '#fbbf24' : '#f87171';
  return (
    <View style={[card.base, card.half]}>
      <Ionicons name="heart" size={16} color="#f87171" style={{ marginBottom: 4 }} />
      <Text style={card.label}>Heart Health</Text>
      <Text style={[card.bigValue, { color: hrvColor }]}>
        {hrv ?? '—'}
        <Text style={card.unit}> ms</Text>
      </Text>
      <Text style={card.sublabel}>HRV</Text>
      {rhr != null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
          <Ionicons name="pulse" size={12} color="#f87171" />
          <Text style={card.footnote}>{rhr} bpm resting</Text>
        </View>
      )}
    </View>
  );
}

function NutritionCard({ eaten, target, proteinEaten, proteinTarget }: {
  eaten?: number; target: number; proteinEaten?: number; proteinTarget: number;
}) {
  const calPct  = eaten != null ? Math.min((eaten / target) * 100, 100) : 0;
  const protPct = proteinEaten != null ? Math.min((proteinEaten / proteinTarget) * 100, 100) : 0;
  const calColor = calPct >= 100 ? '#f87171' : calPct >= 70 ? '#fbbf24' : '#34d399';
  return (
    <View style={[card.base, card.half]}>
      <Ionicons name="flame" size={16} color="#fb923c" style={{ marginBottom: 4 }} />
      <Text style={card.label}>Nutrition</Text>
      <Text style={[card.bigValue, { color: calColor }]}>
        {eaten != null ? Math.round(eaten).toLocaleString() : '—'}
      </Text>
      <Text style={card.sublabel}>of {target.toLocaleString()} kcal</Text>
      <View style={[card.bar, { marginTop: 8 }]}>
        <View style={[card.barFill, { width: `${calPct}%` as any, backgroundColor: calColor }]} />
      </View>
      {proteinEaten != null && (
        <>
          <View style={[card.bar, { marginTop: 4, backgroundColor: '#1a2540' }]}>
            <View style={[card.barFill, { width: `${protPct}%` as any, backgroundColor: '#34d399' }]} />
          </View>
          <Text style={card.footnote}>{Math.round(proteinEaten)}g / {proteinTarget}g protein</Text>
        </>
      )}
    </View>
  );
}

// ── Goals pills with streak ───────────────────────────────────────────────────

/**
 * Count consecutive days meeting a goal.
 * Starts from yesterday (index 1) — today is still in progress so it won't
 * kill a streak mid-day. Today adds +1 only if it's already met.
 */
function streakFor(
  snapshots: Partial<HealthSnapshot>[],
  metFn: (s: Partial<HealthSnapshot>) => boolean,
): number {
  let count = 0;
  // Count from yesterday backwards through history
  for (let i = 1; i < snapshots.length; i++) {
    if (metFn(snapshots[i])) count++;
    else break;
  }
  // Include today only if already met (bonus, doesn't break if not yet)
  if (snapshots.length > 0 && metFn(snapshots[0])) count++;
  return count;
}

function GoalPill({ icon, label, done, streak }: {
  icon: string; label: string; done: boolean; streak: number;
}) {
  const hasStreak = streak > 0;
  return (
    <View style={[pill.base, done && pill.done]}>
      <Ionicons name={icon as any} size={12} color={done ? '#0f172a' : '#64748b'} />
      <Text style={[pill.label, done && pill.labelDone]}>{label}</Text>
      <View style={[pill.streakBadge, hasStreak ? pill.streakGreen : pill.streakRed]}>
        <Ionicons
          name={hasStreak ? 'flame' : 'close-circle'}
          size={11}
          color="#fff"
        />
        <Text style={pill.streakText}>{streak}</Text>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { refresh, isLoading, snapshots, activities, lastSyncedAt, proxyReachable } = useHealthData();
  const [goals, setGoals] = useState<HealthGoals>(DEFAULT_GOALS);
  const today = snapshots[0];

  useEffect(() => {
    refresh();
    loadGoals().then(setGoals);
  }, []);

  // Reload goals every 3s in case user just saved from Goals modal
  useEffect(() => {
    const id = setInterval(() => loadGoals().then(setGoals), 3000);
    return () => clearInterval(id);
  }, []);

  const targets = adjustedTargets(goals, today?.activeCalories, today?.steps);

  // Weight display (Withings kg → lbs, or manual lbs from Goals)
  const weightLbs = today?.weightKg != null
    ? kgToLbs(today.weightKg)
    : goals.currentWeightLbs;
  const targetLbs = goals.targetWeightLbs;

  // Dynamic body battery (Garmin + nutrition context)
  const adjustedBB = computeAdjustedBattery(
    today?.bodyBattery,
    today?.proteinG,
    today?.caloriesConsumed,
    today?.waterCups,
    targets,
    goals.waterCups,
  );

  // Goals progress — today
  const stepsHit   = (today?.steps ?? 0) >= goals.dailySteps;
  const sleepHit   = (today?.sleepHours ?? 0) > 0 && (today?.sleepHours ?? 0) >= goals.sleepHours * 0.9;
  const proteinHit = (today?.proteinG ?? 0) >= goals.proteinG * 0.9;
  const caloriesOk = (today?.caloriesConsumed ?? 0) > 0 && (today?.caloriesConsumed ?? 0) <= goals.dailyCalories * 1.1;

  // Streaks — consecutive days meeting each goal exactly (no buffer — if you set 8h, you need 8h)
  const stepsStreak   = streakFor(snapshots, s => (s.steps ?? 0) >= goals.dailySteps);
  const sleepStreak   = streakFor(snapshots, s => (s.sleepHours ?? 0) >= goals.sleepHours);
  const proteinStreak = streakFor(snapshots, s => (s.proteinG ?? 0) >= goals.proteinG);
  const calStreak     = streakFor(snapshots, s => (s.caloriesConsumed ?? 0) > 0 && (s.caloriesConsumed ?? 0) <= goals.dailyCalories);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor="#34d399" />}
    >
      {/* Header row */}
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.dateLabel}>{todayLabel()}</Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/history')}>
            <Ionicons name="time-outline" size={20} color="#64748b" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/goals')}>
            <Ionicons name="settings-outline" size={20} color="#64748b" />
          </TouchableOpacity>
        </View>
      </View>

      {!proxyReachable && (
        <View style={styles.banner}>
          <Ionicons name="warning" size={14} color="#fbbf24" />
          <Text style={styles.bannerText}>  Mac proxy offline — showing cached data</Text>
        </View>
      )}
      {lastSyncedAt && (
        <Text style={styles.syncText}>Synced {new Date(lastSyncedAt).toLocaleTimeString()}</Text>
      )}

      {/* Top 5 metric cards */}
      <BodyBatteryCard garminValue={today?.bodyBattery} adjustedValue={adjustedBB} />

      <View style={styles.row}>
        <MovementCard steps={today?.steps} activeCalories={today?.activeCalories} goal={goals.dailySteps} />
        <SleepCard hours={today?.sleepHours} score={today?.sleepScore} goal={goals.sleepHours} />
      </View>

      <View style={styles.row}>
        <HeartCard hrv={today?.hrv} rhr={today?.restingHeartRate} />
        <NutritionCard
          eaten={today?.caloriesConsumed}
          target={targets.calories}
          proteinEaten={today?.proteinG}
          proteinTarget={targets.protein}
        />
      </View>

      {/* Weight strip */}
      {weightLbs != null && (
        <View style={styles.weightStrip}>
          <Ionicons name="scale-outline" size={15} color="#a78bfa" />
          <Text style={styles.weightText}>{weightLbs.toFixed(1)} lbs</Text>
          {targetLbs != null && (
            <Text style={styles.weightGoal}>
              {'  ·  '}Goal: {targetLbs} lbs
              {'  ·  '}{Math.abs(weightLbs - targetLbs).toFixed(1)} lbs {weightLbs > targetLbs ? 'to lose' : 'to gain'}
            </Text>
          )}
          {today?.bodyFatPct != null && (
            <Text style={styles.weightGoal}>{'  ·  '}{today.bodyFatPct.toFixed(1)}% fat</Text>
          )}
        </View>
      )}

      {/* Goals progress */}
      <Text style={styles.sectionLabel}>Today's Goals</Text>
      <View style={styles.pillRow}>
        <GoalPill icon="footsteps" label={`${goals.dailySteps.toLocaleString()} steps`} done={stepsHit}   streak={stepsStreak} />
        <GoalPill icon="moon"      label={`${goals.sleepHours}h sleep`}                 done={sleepHit}   streak={sleepStreak} />
        <GoalPill icon="fish"      label={`${goals.proteinG}g protein`}                 done={proteinHit} streak={proteinStreak} />
        <GoalPill icon="flame"     label={`≤${goals.dailyCalories.toLocaleString()} kcal`} done={caloriesOk} streak={calStreak} />
      </View>

      {/* Recent activities */}
      {activities.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Recent Activities</Text>
          {activities.slice(0, 4).map((a) => (
            <View key={a.id} style={styles.activityRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.activityName}>{a.name}</Text>
                <Text style={styles.activityMeta}>
                  {a.date} · {a.durationMinutes}min
                  {a.distanceKm ? ` · ${a.distanceKm.toFixed(1)}km` : ''}
                </Text>
              </View>
              {a.avgHeartRate && <Text style={styles.activityHR}>{a.avgHeartRate} bpm</Text>}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const card = StyleSheet.create({
  base: { backgroundColor: '#1e293b', borderRadius: 16, padding: 16, marginBottom: 10 },
  full: { width: '100%' },
  half: { flex: 1 },
  label: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  bigValue: { fontSize: 28, fontWeight: '800', color: '#f1f5f9' },
  unit: { fontSize: 14, fontWeight: '400', color: '#94a3b8' },
  sublabel: { fontSize: 12, color: '#64748b', marginTop: 2 },
  footnote: { fontSize: 11, color: '#475569', marginTop: 4 },
  badge: { backgroundColor: '#334155', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  badgeText: { fontSize: 10, color: '#94a3b8' },
  bar: { height: 5, backgroundColor: '#334155', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3 },
  gauge: { width: 12, height: 70, backgroundColor: '#334155', borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  gaugeFill: { width: '100%', borderRadius: 6 },
});

const pill = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1e293b', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  done: { backgroundColor: '#34d399' },
  label: { fontSize: 12, color: '#64748b' },
  labelDone: { color: '#0f172a', fontWeight: '600' },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 3, marginLeft: 4 },
  streakGreen: { backgroundColor: '#16a34a' },
  streakRed:   { backgroundColor: '#dc2626' },
  streakText:  { fontSize: 11, fontWeight: '800', color: '#fff' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 56, paddingBottom: 40 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  title: { fontSize: 26, fontWeight: '700', color: '#f1f5f9' },
  dateLabel: { fontSize: 13, color: '#64748b', marginTop: 2 },
  headerButtons: { flexDirection: 'row', gap: 4, marginTop: 4 },
  iconButton: { padding: 6 },
  banner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 8, padding: 10, marginBottom: 10 },
  bannerText: { fontSize: 13, color: '#fbbf24' },
  syncText: { fontSize: 12, color: '#475569', marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 0 },
  weightStrip: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, backgroundColor: '#1e293b', borderRadius: 10, padding: 12, marginTop: 2, marginBottom: 12 },
  weightText: { fontSize: 14, color: '#a78bfa', fontWeight: '600' },
  weightGoal: { fontSize: 13, color: '#64748b' },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 12 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  activityRow: { backgroundColor: '#1e293b', borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  activityName: { fontSize: 14, fontWeight: '600', color: '#f1f5f9' },
  activityMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  activityHR: { fontSize: 13, color: '#f87171', fontWeight: '600' },
});
