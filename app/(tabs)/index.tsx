import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useHealthData } from '../../src/hooks/useHealthData';
import { loadGoals } from '../../src/services/GoalsService';
import { HealthGoals, DEFAULT_GOALS, adjustedTargets, computeAdjustedBattery } from '../../src/models/Goals';
import { HealthSnapshot } from '../../src/models/HealthSnapshot';
import { kgToLbs } from '../../src/utils/units';
import { C } from '../../constants/Theme';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── Vitality Score ───────────────────────────────────────────────────────────

function computeVitalityScore(
  today: Partial<HealthSnapshot> | undefined,
  goals: HealthGoals,
  dynamicCalTarget?: number,
): { score: number; breakdown: { label: string; pct: number; weight: number }[] } {
  if (!today) return { score: 0, breakdown: [] };

  const sleepScore = today.sleepHours != null && goals.sleepHours > 0
    ? Math.min((today.sleepHours / goals.sleepHours) * 100, 100) : 50;

  const bbScore = today.bodyBattery != null ? today.bodyBattery : 50;

  const calTarget = dynamicCalTarget ?? goals.dailyCalories;
  let nutriScore = 50;
  if (today.caloriesConsumed != null && calTarget > 0) {
    const ratio = today.caloriesConsumed / calTarget;
    if (ratio >= 0.8 && ratio <= 1.1) nutriScore = 100;
    else if (ratio >= 0.6 && ratio <= 1.25) nutriScore = 70;
    else if (ratio < 0.3 || ratio > 1.5) nutriScore = 20;
    else nutriScore = 45;
    if (today.proteinG != null && goals.proteinG > 0 && today.proteinG >= goals.proteinG * 0.9) {
      nutriScore = Math.min(nutriScore + 10, 100);
    }
  }

  const stepsScore = today.steps != null && goals.dailySteps > 0
    ? Math.min((today.steps / goals.dailySteps) * 100, 100) : 50;

  let hrvScore = 50;
  if (today.hrv != null) {
    if (today.hrv >= 70) hrvScore = 100;
    else if (today.hrv >= 50) hrvScore = 80;
    else if (today.hrv >= 35) hrvScore = 60;
    else if (today.hrv >= 20) hrvScore = 35;
    else hrvScore = 15;
  }

  const score = Math.round(
    sleepScore * 0.30 + bbScore * 0.25 + nutriScore * 0.20 + stepsScore * 0.15 + hrvScore * 0.10,
  );

  return {
    score,
    breakdown: [
      { label: 'Sleep',     pct: Math.round(sleepScore),  weight: 30 },
      { label: 'Battery',   pct: Math.round(bbScore),     weight: 25 },
      { label: 'Nutrition', pct: Math.round(nutriScore),  weight: 20 },
      { label: 'Steps',     pct: Math.round(stepsScore),  weight: 15 },
      { label: 'HRV',       pct: Math.round(hrvScore),    weight: 10 },
    ],
  };
}

// ── Vitality Score Card ──────────────────────────────────────────────────────

function VitalityScoreCard({ score, breakdown }: {
  score: number;
  breakdown: { label: string; pct: number; weight: number }[];
}) {
  const tier = score >= 80 ? 'Excellent' : score >= 65 ? 'Good' : score >= 45 ? 'Fair' : 'Low';
  const tierColor = score >= 80 ? C.primary : score >= 65 ? C.success : score >= 45 ? C.warning : C.danger;
  return (
    <View style={[vCard.base, { borderTopWidth: 2, borderTopColor: tierColor }]}>
      <View style={vCard.row}>
        <View>
          <Text style={vCard.label}>Vitality Score</Text>
          <Text style={vCard.score}>{score}</Text>
          <View style={[vCard.badge, { backgroundColor: tierColor + '20' }]}>
            <Text style={[vCard.badgeText, { color: tierColor }]}>{tier}</Text>
          </View>
        </View>
        <View style={vCard.bars}>
          {breakdown.map(b => (
            <View key={b.label} style={vCard.barRow}>
              <Text style={vCard.barLabel}>{b.label}</Text>
              <View style={vCard.barTrack}>
                <View style={[vCard.barFill, {
                  width: `${b.pct}%` as any,
                  backgroundColor: b.pct >= 70 ? C.success : b.pct >= 45 ? C.warning : C.danger,
                }]} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const vCard = StyleSheet.create({
  base: { backgroundColor: C.bgCard, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 12, color: C.textTertiary, marginBottom: 4 },
  score: { fontSize: 56, fontWeight: '800', color: C.textBright },
  badge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeText: { fontWeight: '700', fontSize: 12 },
  bars: { gap: 6, minWidth: 120 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barLabel: { fontSize: 11, color: C.textTertiary, width: 52 },
  barTrack: { flex: 1, height: 4, backgroundColor: C.bgElevated, borderRadius: 2 },
  barFill: { height: 4, borderRadius: 2 },
});

// ── Body Battery ─────────────────────────────────────────────────────────────

function BodyBatteryCard({ garminValue, adjustedValue }: {
  garminValue?: number; adjustedValue?: number;
}) {
  const display = adjustedValue ?? garminValue;
  const color = display == null ? C.textTertiary
    : display >= 80 ? C.success : display >= 41 ? C.warning : C.danger;
  const label = display == null ? '—'
    : display >= 75 ? 'High' : display >= 50 ? 'Moderate' : display >= 25 ? 'Low' : 'Drained';
  const adjusted = adjustedValue != null && garminValue != null && adjustedValue !== garminValue;

  return (
    <View style={[card.base, { borderTopWidth: 2, borderTopColor: C.energy }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="battery-charging" size={18} color={color} />
            <Text style={card.label}>Body Battery</Text>
            {adjusted && (
              <View style={card.badge}><Text style={card.badgeText}>+diet</Text></View>
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

// ── Half-width cards ─────────────────────────────────────────────────────────

function MovementCard({ steps, activeCalories, goal }: {
  steps?: number; activeCalories?: number; goal: number;
}) {
  const pct = steps != null ? Math.min((steps / goal) * 100, 100) : 0;
  return (
    <View style={[card.base, card.half]}>
      <Ionicons name="footsteps" size={16} color={C.movement} style={{ marginBottom: 4 }} />
      <Text style={card.label}>Movement</Text>
      <Text style={[card.bigValue, { color: C.movement }]}>{steps != null ? steps.toLocaleString() : '—'}</Text>
      <Text style={card.sublabel}>goal {goal.toLocaleString()}</Text>
      <View style={[card.bar, { marginTop: 8 }]}>
        <View style={[card.barFill, { width: `${pct}%` as any, backgroundColor: C.movement }]} />
      </View>
      {activeCalories != null && (
        <Text style={card.footnote}>{activeCalories.toLocaleString()} active kcal</Text>
      )}
    </View>
  );
}

function SleepCard({ hours, score, goal }: { hours?: number; score?: number; goal: number }) {
  const color = hours == null ? C.textTertiary
    : hours >= goal * 0.95 ? C.sleep : hours >= goal * 0.8 ? C.warning : C.danger;
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
  return (
    <View style={[card.base, card.half]}>
      <Ionicons name="heart" size={16} color={C.heart} style={{ marginBottom: 4 }} />
      <Text style={card.label}>Heart Health</Text>
      <Text style={[card.bigValue, { color: C.heart }]}>
        {hrv ?? '—'}
        <Text style={card.unit}> ms</Text>
      </Text>
      <Text style={card.sublabel}>HRV</Text>
      {rhr != null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
          <Ionicons name="pulse" size={12} color={C.heart} />
          <Text style={card.footnote}>{rhr} bpm resting</Text>
        </View>
      )}
    </View>
  );
}

function NutritionCard({ eaten, target, proteinEaten, proteinTarget }: {
  eaten?: number; target: number; proteinEaten?: number; proteinTarget: number;
}) {
  const calPct = eaten != null ? Math.min((eaten / target) * 100, 100) : 0;
  const protPct = proteinEaten != null ? Math.min((proteinEaten / proteinTarget) * 100, 100) : 0;
  return (
    <View style={[card.base, card.half]}>
      <Ionicons name="leaf" size={16} color={C.nutrition} style={{ marginBottom: 4 }} />
      <Text style={card.label}>Nutrition</Text>
      <Text style={[card.bigValue, { color: C.nutrition }]}>
        {eaten != null ? Math.round(eaten).toLocaleString() : '—'}
      </Text>
      <Text style={card.sublabel}>of {target.toLocaleString()} kcal</Text>
      <View style={[card.bar, { marginTop: 8 }]}>
        <View style={[card.barFill, { width: `${calPct}%` as any, backgroundColor: C.nutrition }]} />
      </View>
      {proteinEaten != null && (
        <>
          <View style={[card.bar, { marginTop: 4 }]}>
            <View style={[card.barFill, { width: `${protPct}%` as any, backgroundColor: C.nutrition }]} />
          </View>
          <Text style={card.footnote}>{Math.round(proteinEaten)}g / {proteinTarget}g protein</Text>
        </>
      )}
    </View>
  );
}

// ── Stress & SpO2 strip ──────────────────────────────────────────────────────

function BiometricsStrip({ stress, spo2, respiration }: {
  stress?: number; spo2?: number; respiration?: number;
}) {
  if (stress == null && spo2 == null && respiration == null) return null;
  return (
    <View style={styles.bioStrip}>
      {stress != null && (
        <View style={styles.bioItem}>
          <Ionicons name="thunderstorm-outline" size={14} color={stress <= 35 ? C.success : stress <= 55 ? C.warning : C.danger} />
          <Text style={styles.bioValue}>{stress}</Text>
          <Text style={styles.bioLabel}>Stress</Text>
        </View>
      )}
      {spo2 != null && (
        <View style={styles.bioItem}>
          <Ionicons name="water-outline" size={14} color={spo2 >= 95 ? C.primary : C.warning} />
          <Text style={styles.bioValue}>{spo2.toFixed(1)}%</Text>
          <Text style={styles.bioLabel}>SpO2</Text>
        </View>
      )}
      {respiration != null && (
        <View style={styles.bioItem}>
          <Ionicons name="fitness-outline" size={14} color={C.textSecondary} />
          <Text style={styles.bioValue}>{respiration.toFixed(0)}</Text>
          <Text style={styles.bioLabel}>br/min</Text>
        </View>
      )}
    </View>
  );
}

// ── 7-day trend dots ─────────────────────────────────────────────────────────

function TrendDots({ snapshots, metric, color, goal }: {
  snapshots: Partial<HealthSnapshot>[]; metric: keyof HealthSnapshot; color: string; goal?: number;
}) {
  const vals = [...snapshots].reverse().map(s => s[metric] as number | undefined);
  const valid = vals.filter((v): v is number => v != null && v > 0);
  if (valid.length < 2) return null;
  const max = Math.max(...valid, goal ?? 0);
  return (
    <View style={styles.trendRow}>
      {vals.map((v, i) => {
        const h = v != null && v > 0 ? Math.max((v / max) * 16, 3) : 2;
        const met = goal != null && v != null && v >= goal;
        return (
          <View key={i} style={[styles.trendDot, {
            height: h,
            backgroundColor: v != null && v > 0 ? (met ? C.success : color) : C.bgElevated,
          }]} />
        );
      })}
    </View>
  );
}

function WeekTrends({ snapshots, goals }: { snapshots: Partial<HealthSnapshot>[]; goals: HealthGoals }) {
  if (snapshots.length < 2) return null;
  return (
    <View style={styles.trendsCard}>
      <Text style={styles.trendsTitle}>7-Day Trends</Text>
      <View style={styles.trendsGrid}>
        <View style={styles.trendItem}>
          <Text style={[styles.trendLabel, { color: C.movement }]}>Steps</Text>
          <TrendDots snapshots={snapshots} metric="steps" color={C.movement} goal={goals.dailySteps} />
        </View>
        <View style={styles.trendItem}>
          <Text style={[styles.trendLabel, { color: C.sleep }]}>Sleep</Text>
          <TrendDots snapshots={snapshots} metric="sleepHours" color={C.sleep} goal={goals.sleepHours} />
        </View>
        <View style={styles.trendItem}>
          <Text style={[styles.trendLabel, { color: C.heart }]}>HRV</Text>
          <TrendDots snapshots={snapshots} metric="hrv" color={C.heart} />
        </View>
        <View style={styles.trendItem}>
          <Text style={[styles.trendLabel, { color: C.energy }]}>Battery</Text>
          <TrendDots snapshots={snapshots} metric="bodyBattery" color={C.energy} />
        </View>
      </View>
    </View>
  );
}

// ── Goals pills with streak ──────────────────────────────────────────────────

function streakFor(
  snapshots: Partial<HealthSnapshot>[],
  metFn: (s: Partial<HealthSnapshot>) => boolean,
): number {
  let count = 0;
  for (let i = 1; i < snapshots.length; i++) {
    if (metFn(snapshots[i])) count++;
    else break;
  }
  if (snapshots.length > 0 && metFn(snapshots[0])) count++;
  return count;
}

function GoalPill({ icon, label, done, streak }: {
  icon: string; label: string; done: boolean; streak: number;
}) {
  return (
    <View style={[pill.base, done && pill.done]}>
      <Ionicons name={icon as any} size={12} color={done ? C.bg : C.textTertiary} />
      <Text style={[pill.label, done && pill.labelDone]}>{label}</Text>
      <View style={[pill.streakBadge, streak > 0 ? pill.streakGreen : pill.streakRed]}>
        <Ionicons name={streak > 0 ? 'flame' : 'close-circle'} size={11} color="#fff" />
        <Text style={pill.streakText}>{streak}</Text>
      </View>
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { refresh, isLoading, snapshots, activities, lastSyncedAt, proxyReachable } = useHealthData();
  const [goals, setGoals] = useState<HealthGoals>(DEFAULT_GOALS);
  const today = snapshots[0];

  useEffect(() => { refresh(); }, []);

  // Reload goals when screen gains focus (replaces 3s polling)
  useFocusEffect(
    useCallback(() => { loadGoals().then(setGoals); }, []),
  );

  const targets = adjustedTargets(goals, today?.activeCalories, today?.steps);

  const weightLbs = today?.weightKg != null ? kgToLbs(today.weightKg) : goals.currentWeightLbs;
  const targetLbs = goals.targetWeightLbs;

  const adjustedBB = computeAdjustedBattery(
    today?.bodyBattery, today?.proteinG, today?.caloriesConsumed, today?.waterCups,
    targets, goals.waterCups,
  );

  const { score: vitalityScore, breakdown: vitalityBreakdown } = computeVitalityScore(today, goals, targets.calories);

  const stepsHit   = (today?.steps ?? 0) >= goals.dailySteps;
  const sleepHit   = (today?.sleepHours ?? 0) > 0 && (today?.sleepHours ?? 0) >= goals.sleepHours * 0.9;
  const proteinHit = (today?.proteinG ?? 0) >= goals.proteinG * 0.9;
  const caloriesOk = (today?.caloriesConsumed ?? 0) > 0 && (today?.caloriesConsumed ?? 0) <= targets.calories * 1.1;

  const stepsStreak   = streakFor(snapshots, s => (s.steps ?? 0) >= goals.dailySteps);
  const sleepStreak   = streakFor(snapshots, s => (s.sleepHours ?? 0) >= goals.sleepHours);
  const proteinStreak = streakFor(snapshots, s => (s.proteinG ?? 0) >= goals.proteinG);
  const calStreak     = streakFor(snapshots, s => {
    const dynTarget = adjustedTargets(goals, s.activeCalories, s.steps).calories;
    return (s.caloriesConsumed ?? 0) > 0 && (s.caloriesConsumed ?? 0) <= dynTarget * 1.1;
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={C.primary} />}
    >
      {/* Header */}
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.greeting}>{greeting()}</Text>
          <Text style={styles.dateLabel}>{todayLabel()}</Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/history')}>
            <Ionicons name="time-outline" size={20} color={C.textTertiary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/goals')}>
            <Ionicons name="settings-outline" size={20} color={C.textTertiary} />
          </TouchableOpacity>
        </View>
      </View>

      {!proxyReachable && (
        <View style={styles.banner}>
          <Ionicons name="warning" size={14} color={C.warning} />
          <Text style={styles.bannerText}>  Garmin proxy offline — showing cached data</Text>
        </View>
      )}
      {lastSyncedAt && (
        <Text style={styles.syncText}>Synced {new Date(lastSyncedAt).toLocaleTimeString()}</Text>
      )}

      <VitalityScoreCard score={vitalityScore} breakdown={vitalityBreakdown} />

      <BodyBatteryCard garminValue={today?.bodyBattery} adjustedValue={adjustedBB} />

      <View style={styles.row}>
        <MovementCard steps={today?.steps} activeCalories={today?.activeCalories} goal={goals.dailySteps} />
        <SleepCard hours={today?.sleepHours} score={today?.sleepScore} goal={goals.sleepHours} />
      </View>

      <View style={styles.row}>
        <HeartCard hrv={today?.hrv} rhr={today?.restingHeartRate} />
        <NutritionCard
          eaten={today?.caloriesConsumed} target={targets.calories}
          proteinEaten={today?.proteinG} proteinTarget={targets.protein}
        />
      </View>

      {/* Stress, SpO2, Respiration */}
      <BiometricsStrip stress={today?.avgStress} spo2={today?.spo2} respiration={today?.respirationAvg} />

      {/* Weight strip */}
      {weightLbs != null && (
        <View style={styles.weightStrip}>
          <Ionicons name="scale-outline" size={15} color={C.weight} />
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

      {/* 7-day trends */}
      <WeekTrends snapshots={snapshots} goals={goals} />

      {/* Goals progress */}
      <Text style={styles.sectionLabel}>Today's Goals</Text>
      <View style={styles.pillRow}>
        <GoalPill icon="footsteps" label={`${goals.dailySteps.toLocaleString()} steps`} done={stepsHit} streak={stepsStreak} />
        <GoalPill icon="moon" label={`${goals.sleepHours}h sleep`} done={sleepHit} streak={sleepStreak} />
        <GoalPill icon="fish" label={`${goals.proteinG}g protein`} done={proteinHit} streak={proteinStreak} />
        <GoalPill icon="flame" label={`≤${targets.calories.toLocaleString()} kcal`} done={caloriesOk} streak={calStreak} />
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
  base: { backgroundColor: C.bgCard, borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  half: { flex: 1 },
  label: { fontSize: 12, color: C.textTertiary, marginBottom: 4 },
  bigValue: { fontSize: 28, fontWeight: '800', color: C.textBright },
  unit: { fontSize: 14, fontWeight: '400', color: C.textSecondary },
  sublabel: { fontSize: 12, color: C.textTertiary, marginTop: 2 },
  footnote: { fontSize: 11, color: C.textMuted, marginTop: 4 },
  badge: { backgroundColor: C.bgElevated, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  badgeText: { fontSize: 10, color: C.textSecondary },
  bar: { height: 5, backgroundColor: C.bgElevated, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3 },
  gauge: { width: 12, height: 70, backgroundColor: C.bgElevated, borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  gaugeFill: { width: '100%', borderRadius: 6 },
});

const pill = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.bgCard, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: C.border },
  done: { backgroundColor: C.primary, borderColor: C.primary },
  label: { fontSize: 12, color: C.textTertiary },
  labelDone: { color: C.bg, fontWeight: '600' },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 3, marginLeft: 4 },
  streakGreen: { backgroundColor: '#16a34a' },
  streakRed: { backgroundColor: '#dc2626' },
  streakText: { fontSize: 11, fontWeight: '800', color: '#fff' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingTop: 56, paddingBottom: 40 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  greeting: { fontSize: 26, fontWeight: '700', color: C.textBright },
  dateLabel: { fontSize: 13, color: C.textTertiary, marginTop: 2 },
  headerButtons: { flexDirection: 'row', gap: 4, marginTop: 4 },
  iconButton: { padding: 6 },
  banner: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgCard, borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  bannerText: { fontSize: 13, color: C.warning },
  syncText: { fontSize: 12, color: C.textMuted, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 0 },
  // Biometrics strip
  bioStrip: { flexDirection: 'row', backgroundColor: C.bgCard, borderRadius: 12, padding: 14, marginTop: 2, marginBottom: 12, borderWidth: 1, borderColor: C.border, justifyContent: 'space-around' },
  bioItem: { alignItems: 'center', gap: 4 },
  bioValue: { fontSize: 15, fontWeight: '700', color: C.textBright },
  bioLabel: { fontSize: 10, color: C.textMuted },
  // Weight
  weightStrip: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, backgroundColor: C.bgCard, borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  weightText: { fontSize: 14, color: C.weight, fontWeight: '600' },
  weightGoal: { fontSize: 13, color: C.textTertiary },
  // Trends
  trendsCard: { backgroundColor: C.bgCard, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  trendsTitle: { fontSize: 11, fontWeight: '600', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  trendsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  trendItem: { alignItems: 'center', gap: 6, flex: 1 },
  trendLabel: { fontSize: 10, fontWeight: '600' },
  trendRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 18 },
  trendDot: { width: 5, borderRadius: 2 },
  // Goals
  sectionLabel: { fontSize: 11, fontWeight: '600', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 12 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  // Activities
  activityRow: { backgroundColor: C.bgCard, borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  activityName: { fontSize: 14, fontWeight: '600', color: C.textBright },
  activityMeta: { fontSize: 12, color: C.textTertiary, marginTop: 2 },
  activityHR: { fontSize: 13, color: C.heart, fontWeight: '600' },
});
