import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useHealthStore } from '../../src/store/healthStore';
import { useHealthData } from '../../src/hooks/useHealthData';
import { generateInsights } from '../../src/services/LLMService';
import { loadGoals } from '../../src/services/GoalsService';
import { HealthGoals, DEFAULT_GOALS } from '../../src/models/Goals';

export default function InsightsScreen() {
  const { snapshots, latestInsight, setInsight } = useHealthStore();
  const { refresh } = useHealthData();
  const [goals, setGoals] = useState<HealthGoals>(DEFAULT_GOALS);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadGoals().then(setGoals); }, []);

  async function runAnalysis() {
    setLoading(true);
    setError(null);

    let dataSnapshots = snapshots;

    if (dataSnapshots.length === 0) {
      setLoadingStep('Loading your health data…');
      try { await refresh(); } catch {}
      dataSnapshots = useHealthStore.getState().snapshots;
    }

    if (dataSnapshots.length === 0) {
      setError('Could not load health data. Make sure your Mac proxy is running and you are on the same Wi-Fi network.');
      setLoading(false);
      return;
    }

    const currentGoals = await loadGoals();
    setGoals(currentGoals);

    setLoadingStep('Analyzing with AI (may take ~30s)…');
    try {
      const insight = await generateInsights(dataSnapshots, currentGoals);
      setInsight(insight);
    } catch (err: any) {
      setError(err.message ?? 'Failed to generate insights');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  }

  const daysLabel = snapshots.length > 0 ? `${snapshots.length} days of` : 'your';
  const hasGoals = goals.targetWeightLbs != null || goals.dailySteps !== DEFAULT_GOALS.dailySteps;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>AI Insights</Text>
          <Text style={styles.subtitle}>
            Analyzes {daysLabel} Garmin, Withings, and nutrition data.
          </Text>
        </View>
        <TouchableOpacity style={styles.goalsButton} onPress={() => router.push('/goals')}>
          <Ionicons name="trophy-outline" size={14} color="#fbbf24" />
          <Text style={styles.goalsButtonText}>{hasGoals ? 'Goals set' : 'Set goals'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={runAnalysis}
        disabled={loading}
      >
        {loading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color="#0f172a" />
            <Text style={styles.buttonText}>{loadingStep || 'Working…'}</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="sparkles" size={16} color="#0f172a" />
            <Text style={styles.buttonText}>Generate Insights</Text>
          </View>
        )}
      </TouchableOpacity>

      {error && (
        <View style={styles.errorCard}>
          <Ionicons name="warning" size={16} color="#f87171" />
          <Text style={styles.errorText}> {error}</Text>
        </View>
      )}

      {latestInsight && (
        <View style={styles.insightCard}>
          <View style={styles.insightHeader}>
            <Ionicons name="sparkles" size={16} color="#34d399" />
            <Text style={styles.insightMeta}>
              {'  '}Based on {latestInsight.basedOnDays} days · {new Date(latestInsight.generatedAt).toLocaleDateString()}
            </Text>
          </View>
          <Text style={styles.insightText}>{latestInsight.text}</Text>
          <View style={styles.modelBadge}>
            <Ionicons name="hardware-chip-outline" size={11} color="#475569" />
            <Text style={styles.modelText}> llama3.2 · runs locally on your Mac</Text>
          </View>
        </View>
      )}

      {!latestInsight && !loading && !error && (
        <View style={styles.emptyState}>
          <Ionicons name="bulb-outline" size={48} color="#334155" />
          <Text style={styles.emptyTitle}>Your Personal Health Coach</Text>
          <Text style={styles.emptyText}>
            Tap Generate Insights to get specific, actionable recommendations based on your real health numbers. Your weekly goals are included in the analysis. Runs locally on your Mac — completely free.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '700', color: '#f1f5f9', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#64748b', lineHeight: 18, maxWidth: 240 },
  goalsButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1e293b', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  goalsButtonText: { fontSize: 12, color: '#fbbf24', fontWeight: '600' },
  button: { backgroundColor: '#34d399', borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  errorCard: { backgroundColor: '#1e293b', borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#f87171' },
  errorText: { fontSize: 13, color: '#f87171', flex: 1 },
  insightCard: { backgroundColor: '#1e293b', borderRadius: 14, padding: 18 },
  insightHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  insightMeta: { fontSize: 12, color: '#64748b' },
  insightText: { fontSize: 15, color: '#e2e8f0', lineHeight: 26 },
  modelBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#334155' },
  modelText: { fontSize: 11, color: '#475569' },
  emptyState: { alignItems: 'center', marginTop: 60, gap: 12, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#94a3b8' },
  emptyText: { fontSize: 14, color: '#475569', textAlign: 'center', lineHeight: 22 },
});
