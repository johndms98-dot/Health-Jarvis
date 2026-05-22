import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useHealthStore } from '../../src/store/healthStore';
import { useHealthData } from '../../src/hooks/useHealthData';
import { generateInsights } from '../../src/services/LLMService';
import { getDailyBrief, getDeepInsights, DailyBrief, DeepInsight } from '../../src/services/AIOptimizationService';
import { loadGoals } from '../../src/services/GoalsService';
import { HealthGoals, DEFAULT_GOALS } from '../../src/models/Goals';

// ── Recovery score display ────────────────────────────────────────────────────
function RecoveryRing({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? '#34d399' : score >= 45 ? '#fbbf24' : '#f87171';
  return (
    <View style={s.recoveryRing}>
      <Text style={[s.recoveryScore, { color }]}>{Math.round(score)}</Text>
      <Text style={s.recoveryLabel}>Recovery Score</Text>
      <View style={[s.recoveryBadge, { backgroundColor: color + '22' }]}>
        <Text style={[s.recoveryStatus, { color }]}>{label.charAt(0).toUpperCase() + label.slice(1)}</Text>
      </View>
    </View>
  );
}

// ── Daily target row ──────────────────────────────────────────────────────────
function TargetRow({ icon, label, value, color = '#94a3b8' }: {
  icon: string; label: string; value: string; color?: string;
}) {
  return (
    <View style={s.targetRow}>
      <Ionicons name={icon as any} size={16} color={color} />
      <Text style={s.targetLabel}>{label}</Text>
      <Text style={[s.targetValue, { color }]}>{value}</Text>
    </View>
  );
}

export default function InsightsScreen() {
  const { snapshots, latestInsight, setInsight } = useHealthStore();
  const { refresh } = useHealthData();
  const [goals, setGoals] = useState<HealthGoals>(DEFAULT_GOALS);
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [deepResult, setDeepResult] = useState<DeepInsight | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [loadingDeep, setLoadingDeep] = useState(false);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadGoals().then(setGoals); }, []);

  // Auto-load morning brief when screen opens and we have data
  useEffect(() => {
    if (snapshots.length > 0 && !brief && !loadingBrief) {
      loadBrief();
    }
  }, [snapshots.length]);

  async function onRefresh() {
    setRefreshing(true);
    const currentGoals = await loadGoals();
    setGoals(currentGoals);
    await refresh();
    loadBrief();
    setRefreshing(false);
  }

  async function ensureSnapshots(): Promise<typeof snapshots> {
    let current = useHealthStore.getState().snapshots;
    if (current.length === 0) {
      try { await refresh(); current = useHealthStore.getState().snapshots; } catch {}
    }
    return current;
  }

  async function loadBrief() {
    const current = await ensureSnapshots();
    if (current.length === 0) return;

    setLoadingBrief(true);
    setError(null);
    try {
      const currentGoals = await loadGoals();
      setGoals(currentGoals);
      const result = await getDailyBrief(current[0], current, currentGoals);
      setBrief(result);
    } catch (err: any) {
      setError(err.message ?? 'Failed to generate daily brief');
    }
    setLoadingBrief(false);
  }

  async function runDeepAnalysis() {
    const current = await ensureSnapshots();
    if (current.length === 0) { setError('No health data available. Pull down to refresh.'); return; }

    setLoadingDeep(true);
    setLoadingStep('Running deep analysis with Gemini AI…');
    setError(null);
    try {
      const currentGoals = await loadGoals();
      const result = await getDeepInsights(current, currentGoals);
      setDeepResult(result);
    } catch (err: any) {
      setError(err.message ?? 'Deep analysis failed');
    }
    setLoadingDeep(false);
    setLoadingStep('');
  }

  async function runWeeklyInsights() {
    const current = await ensureSnapshots();
    if (current.length === 0) { setError('No health data available.'); return; }

    setLoadingInsight(true);
    setError(null);
    try {
      const currentGoals = await loadGoals();
      const insight = await generateInsights(current, currentGoals);
      setInsight(insight);
    } catch (err: any) {
      setError(err.message ?? 'Failed to generate insights');
    }
    setLoadingInsight(false);
  }

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#34d399" />}
    >
      <View style={s.headerRow}>
        <View>
          <Text style={s.title}>AI Insights</Text>
          <Text style={s.subtitle}>Powered by Gemini 2.0 Flash</Text>
        </View>
        <TouchableOpacity style={s.goalsBtn} onPress={() => router.push('/goals')}>
          <Ionicons name="trophy-outline" size={13} color="#fbbf24" />
          <Text style={s.goalsBtnText}>Goals</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={s.errorCard}>
          <Ionicons name="warning" size={15} color="#f87171" />
          <Text style={s.errorText}> {error}</Text>
        </View>
      )}

      {/* ── Morning Brief ─────────────────────────────────────────────────── */}
      <View style={s.section}>
        <View style={s.sectionHeaderRow}>
          <Ionicons name="sunny-outline" size={16} color="#fbbf24" />
          <Text style={s.sectionTitle}>  Today's Brief</Text>
          <TouchableOpacity onPress={loadBrief} disabled={loadingBrief} style={{ marginLeft: 'auto' }}>
            {loadingBrief
              ? <ActivityIndicator size="small" color="#34d399" />
              : <Ionicons name="refresh-outline" size={16} color="#64748b" />}
          </TouchableOpacity>
        </View>

        {brief ? (
          <>
            <RecoveryRing score={brief.recoveryScore} label={brief.recoveryLabel} />
            <View style={s.targetsBox}>
              <TargetRow icon="flame-outline"   label="Calories"   value={`${brief.calorieTarget} kcal`}  color="#f87171" />
              <TargetRow icon="barbell-outline" label="Protein"    value={`${brief.proteinTarget}g`}      color="#34d399" />
              <TargetRow icon="walk-outline"    label="Steps"      value={brief.stepTarget.toLocaleString()} color="#60a5fa" />
              <TargetRow icon="moon-outline"    label="Sleep goal" value={`${brief.waterTarget}L water`}  color="#a78bfa" />
            </View>
            <View style={s.workoutBox}>
              <Text style={s.workoutLabel}>Workout · {brief.workoutRecommendation.toUpperCase()}</Text>
              <Text style={s.workoutText}>{brief.workoutReason}</Text>
            </View>
            {brief.aiText ? (
              <View style={s.aiMessageBox}>
                <Ionicons name="sparkles" size={14} color="#34d399" />
                <Text style={s.aiMessageText}>{brief.aiText}</Text>
              </View>
            ) : null}
            {brief.headline ? (
              <Text style={s.headlineText}>{brief.headline}</Text>
            ) : null}
          </>
        ) : !loadingBrief ? (
          <TouchableOpacity style={s.emptyBrief} onPress={loadBrief}>
            <Ionicons name="sunny-outline" size={36} color="#334155" />
            <Text style={s.emptyBriefText}>Tap to generate today's brief</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.loadingBox}>
            <ActivityIndicator color="#34d399" />
            <Text style={s.loadingText}>Calculating recovery & targets…</Text>
          </View>
        )}
      </View>

      {/* ── 7-Day Weekly Insights ─────────────────────────────────────────── */}
      <View style={s.section}>
        <View style={s.sectionHeaderRow}>
          <Ionicons name="analytics-outline" size={16} color="#60a5fa" />
          <Text style={s.sectionTitle}>  7-Day Analysis</Text>
        </View>
        <Text style={s.sectionDesc}>What patterns emerged this week and what to adjust.</Text>

        <TouchableOpacity
          style={[s.btn, loadingInsight && s.btnDisabled]}
          onPress={runWeeklyInsights}
          disabled={loadingInsight}
        >
          {loadingInsight
            ? <ActivityIndicator color="#0f172a" size="small" />
            : <><Ionicons name="sparkles" size={15} color="#0f172a" /><Text style={s.btnText}> Analyze This Week</Text></>}
        </TouchableOpacity>

        {latestInsight && (
          <View style={s.insightCard}>
            <Text style={s.insightMeta}>
              Based on {latestInsight.basedOnDays} days · {new Date(latestInsight.generatedAt).toLocaleDateString()}
            </Text>
            <Text style={s.insightText}>{latestInsight.text}</Text>
            <View style={s.modelBadge}>
              <Ionicons name="hardware-chip-outline" size={11} color="#475569" />
              <Text style={s.modelText}> Gemini 2.0 Flash · cloud AI</Text>
            </View>
          </View>
        )}
      </View>

      {/* ── Deep Analysis ─────────────────────────────────────────────────── */}
      <View style={s.section}>
        <View style={s.sectionHeaderRow}>
          <Ionicons name="telescope-outline" size={16} color="#a78bfa" />
          <Text style={s.sectionTitle}>  Deep Analysis</Text>
        </View>
        <Text style={s.sectionDesc}>
          30-90 days of data. Finds correlations, hidden patterns, and concrete actions — your personal health expert.
        </Text>

        <TouchableOpacity
          style={[s.btn, s.btnPurple, loadingDeep && s.btnDisabled]}
          onPress={runDeepAnalysis}
          disabled={loadingDeep}
        >
          {loadingDeep
            ? <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={[s.btnText, { color: '#fff', marginLeft: 8 }]}>{loadingStep || 'Analyzing…'}</Text>
              </>
            : <><Ionicons name="telescope-outline" size={15} color="#fff" /><Text style={[s.btnText, { color: '#fff' }]}> Deep Dive</Text></>}
        </TouchableOpacity>

        {deepResult && (
          <View style={s.deepCard}>
            {deepResult.headline ? (
              <Text style={s.deepHeadline}>{deepResult.headline}</Text>
            ) : null}
            {deepResult.findings && deepResult.findings.length > 0 && (
              <View style={s.deepSection}>
                <Text style={s.deepSectionTitle}>Key Findings</Text>
                {deepResult.findings.map((f, i) => (
                  <View key={i} style={s.deepItem}>
                    <View style={s.deepBullet} />
                    <Text style={s.deepItemText}>{f}</Text>
                  </View>
                ))}
              </View>
            )}
            {deepResult.patterns && deepResult.patterns.length > 0 && (
              <View style={s.deepSection}>
                <Text style={s.deepSectionTitle}>Patterns</Text>
                {deepResult.patterns.map((p, i) => (
                  <View key={i} style={s.deepItem}>
                    <Ionicons name="trending-up-outline" size={14} color="#a78bfa" style={{ marginTop: 2 }} />
                    <Text style={s.deepItemText}>{p}</Text>
                  </View>
                ))}
              </View>
            )}
            {deepResult.actions && deepResult.actions.length > 0 && (
              <View style={s.deepSection}>
                <Text style={s.deepSectionTitle}>Actions to Take</Text>
                {deepResult.actions.map((a, i) => (
                  <View key={i} style={s.deepItem}>
                    <Ionicons name="checkmark-circle-outline" size={14} color="#34d399" style={{ marginTop: 2 }} />
                    <Text style={s.deepItemText}>{a}</Text>
                  </View>
                ))}
              </View>
            )}
            {deepResult.raw && !deepResult.findings?.length && (
              <Text style={s.insightText}>{deepResult.raw}</Text>
            )}
            <View style={s.modelBadge}>
              <Ionicons name="hardware-chip-outline" size={11} color="#475569" />
              <Text style={s.modelText}> Gemini 2.0 Flash · {snapshots.length} days analyzed</Text>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60, paddingBottom: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '700', color: '#f1f5f9', marginBottom: 2 },
  subtitle: { fontSize: 13, color: '#64748b' },
  goalsBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1e293b', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  goalsBtnText: { fontSize: 12, color: '#fbbf24', fontWeight: '600' },
  errorCard: { backgroundColor: '#1e293b', borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, borderLeftWidth: 3, borderLeftColor: '#f87171' },
  errorText: { fontSize: 13, color: '#f87171', flex: 1 },
  section: { backgroundColor: '#1e293b', borderRadius: 14, padding: 16, marginBottom: 14 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#f1f5f9' },
  sectionDesc: { fontSize: 13, color: '#64748b', marginBottom: 14, lineHeight: 18 },
  recoveryRing: { alignItems: 'center', paddingVertical: 16 },
  recoveryScore: { fontSize: 64, fontWeight: '800' },
  recoveryLabel: { fontSize: 13, color: '#64748b', marginTop: 4 },
  recoveryBadge: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  recoveryStatus: { fontSize: 13, fontWeight: '700' },
  targetsBox: { backgroundColor: '#0f172a', borderRadius: 10, padding: 12, marginBottom: 12, gap: 10 },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  targetLabel: { fontSize: 14, color: '#94a3b8', flex: 1 },
  targetValue: { fontSize: 14, fontWeight: '700' },
  workoutBox: { backgroundColor: '#0f172a', borderRadius: 10, padding: 12, marginBottom: 12 },
  workoutLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  workoutText: { fontSize: 14, color: '#e2e8f0', lineHeight: 20 },
  aiMessageBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#334155' },
  aiMessageText: { fontSize: 14, color: '#94a3b8', flex: 1, lineHeight: 20 },
  headlineText: { fontSize: 12, color: '#475569', marginTop: 8, textAlign: 'center' },
  emptyBrief: { alignItems: 'center', gap: 10, paddingVertical: 30 },
  emptyBriefText: { fontSize: 14, color: '#475569' },
  loadingBox: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  loadingText: { fontSize: 13, color: '#64748b' },
  btn: { backgroundColor: '#34d399', borderRadius: 10, padding: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 14 },
  btnPurple: { backgroundColor: '#7c3aed' },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  insightCard: { backgroundColor: '#0f172a', borderRadius: 10, padding: 14 },
  insightMeta: { fontSize: 11, color: '#475569', marginBottom: 10, fontWeight: '600' },
  insightText: { fontSize: 14, color: '#e2e8f0', lineHeight: 24 },
  modelBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#334155' },
  modelText: { fontSize: 11, color: '#475569' },
  deepCard: { backgroundColor: '#0f172a', borderRadius: 10, padding: 14 },
  deepHeadline: { fontSize: 14, fontWeight: '700', color: '#f1f5f9', marginBottom: 14 },
  deepSection: { marginBottom: 16 },
  deepSectionTitle: { fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  deepItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  deepBullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#a78bfa', marginTop: 6 },
  deepItemText: { fontSize: 14, color: '#e2e8f0', flex: 1, lineHeight: 20 },
});
