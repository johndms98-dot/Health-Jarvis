import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHealthStore } from '../../src/store/healthStore';
import { generateInsights } from '../../src/services/ClaudeService';

export default function InsightsScreen() {
  const { snapshots, latestInsight, setInsight } = useHealthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis() {
    if (snapshots.length === 0) {
      setError('No health data available. Pull down to refresh on the Dashboard tab first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const insight = await generateInsights(snapshots);
      setInsight(insight);
    } catch (err: any) {
      setError(err.message ?? 'Failed to generate insights');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>AI Insights</Text>
      <Text style={styles.subtitle}>
        Claude analyzes your last {snapshots.length} days of Garmin, Withings, and nutrition data.
      </Text>

      <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={runAnalysis} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#0f172a" />
          : <><Ionicons name="sparkles" size={16} color="#0f172a" /><Text style={styles.buttonText}> Generate Insights</Text></>
        }
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
        </View>
      )}

      {!latestInsight && !loading && !error && (
        <View style={styles.emptyState}>
          <Ionicons name="bulb-outline" size={48} color="#334155" />
          <Text style={styles.emptyText}>Tap the button above to get personalized health insights from Claude AI.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60 },
  title: { fontSize: 26, fontWeight: '700', color: '#f1f5f9', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#64748b', marginBottom: 20, lineHeight: 20 },
  button: { backgroundColor: '#34d399', borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginBottom: 16 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  errorCard: { backgroundColor: '#1e293b', borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#f87171' },
  errorText: { fontSize: 13, color: '#f87171', flex: 1 },
  insightCard: { backgroundColor: '#1e293b', borderRadius: 14, padding: 18 },
  insightHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  insightMeta: { fontSize: 12, color: '#64748b' },
  insightText: { fontSize: 15, color: '#e2e8f0', lineHeight: 24 },
  emptyState: { alignItems: 'center', marginTop: 60, gap: 16 },
  emptyText: { fontSize: 14, color: '#475569', textAlign: 'center', lineHeight: 22, maxWidth: 280 },
});
