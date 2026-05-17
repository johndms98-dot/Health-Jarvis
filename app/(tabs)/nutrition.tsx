import { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { useHealthStore } from '../../src/store/healthStore';
import { fetchNutrition, MealBreakdown } from '../../src/services/MFPService';

function MacroBar({ label, value, max, color }: { label: string; value?: number; max: number; color: string }) {
  const pct = value != null ? Math.min((value / max) * 100, 100) : 0;
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text style={styles.macroValue}>{value != null ? `${value}g` : '—'}</Text>
      </View>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

export default function NutritionScreen() {
  const { snapshots } = useHealthStore();
  const today = snapshots[0];
  const [meals, setMeals] = useState<MealBreakdown[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadMeals() {
    if (!today?.date) return;
    setLoading(true);
    try {
      const data = await fetchNutrition(today.date);
      setMeals(data.meals);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadMeals(); }, [today?.date]);

  const calTarget = 2000;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadMeals} tintColor="#34d399" />}
    >
      <Text style={styles.title}>Nutrition</Text>

      <View style={styles.calorieCard}>
        <Text style={styles.calorieLabel}>Calories Today</Text>
        <Text style={styles.calorieValue}>{today?.caloriesConsumed ?? '—'}</Text>
        {today?.caloriesConsumed != null && (
          <Text style={styles.calorieTarget}>/ {calTarget} target</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Macros</Text>
        <MacroBar label="Protein" value={today?.proteinG} max={180} color="#34d399" />
        <MacroBar label="Carbs" value={today?.carbsG} max={250} color="#60a5fa" />
        <MacroBar label="Fat" value={today?.fatG} max={80} color="#fbbf24" />
        <MacroBar label="Fiber" value={today?.fiberG} max={35} color="#a78bfa" />
        <MacroBar label="Sugar" value={today?.sugarG} max={50} color="#f87171" />
      </View>

      {today?.waterCups != null && (
        <View style={styles.waterCard}>
          <Text style={styles.waterLabel}>💧 Water</Text>
          <Text style={styles.waterValue}>{today.waterCups} cups</Text>
        </View>
      )}

      {meals.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Meals</Text>
          {meals.map((m) => (
            <View key={m.name} style={styles.mealRow}>
              <Text style={styles.mealName}>{m.name}</Text>
              <Text style={styles.mealCal}>{m.calories} kcal</Text>
              <Text style={styles.mealMacros}>P: {m.protein}g · C: {m.carbs}g · F: {m.fat}g</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.section7}>7-Day Trend</Text>
      {snapshots.slice(0, 7).map((s) => (
        <View key={s.date} style={styles.trendRow}>
          <Text style={styles.trendDate}>{s.date.slice(5)}</Text>
          <Text style={styles.trendCal}>{s.caloriesConsumed ?? '—'} kcal</Text>
          <Text style={styles.trendPro}>P: {s.proteinG ?? '?'}g</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60 },
  title: { fontSize: 26, fontWeight: '700', color: '#f1f5f9', marginBottom: 16 },
  calorieCard: { backgroundColor: '#1e293b', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 16 },
  calorieLabel: { fontSize: 14, color: '#64748b', marginBottom: 4 },
  calorieValue: { fontSize: 48, fontWeight: '800', color: '#34d399' },
  calorieTarget: { fontSize: 14, color: '#64748b', marginTop: 2 },
  section: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#94a3b8', marginBottom: 12 },
  macroLabel: { fontSize: 14, color: '#cbd5e1' },
  macroValue: { fontSize: 14, fontWeight: '600', color: '#f1f5f9' },
  barBg: { height: 6, backgroundColor: '#334155', borderRadius: 3 },
  barFill: { height: 6, borderRadius: 3 },
  waterCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  waterLabel: { fontSize: 14, color: '#94a3b8' },
  waterValue: { fontSize: 18, fontWeight: '700', color: '#60a5fa' },
  mealRow: { borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 10, marginTop: 10 },
  mealName: { fontSize: 14, fontWeight: '600', color: '#f1f5f9' },
  mealCal: { fontSize: 13, color: '#34d399', marginTop: 2 },
  mealMacros: { fontSize: 12, color: '#64748b', marginTop: 2 },
  section7: { fontSize: 16, fontWeight: '600', color: '#94a3b8', marginTop: 8, marginBottom: 8 },
  trendRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#1e293b', borderRadius: 8, padding: 10, marginBottom: 6 },
  trendDate: { fontSize: 13, color: '#94a3b8', width: 50 },
  trendCal: { fontSize: 13, color: '#f1f5f9', flex: 1, textAlign: 'center' },
  trendPro: { fontSize: 13, color: '#34d399', width: 70, textAlign: 'right' },
});
