import { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { fetchNutrition, MealBreakdown } from '../../src/services/MFPService';

interface NutritionTotals {
  calories?: number;
  protein?: number;
  carbohydrates?: number;
  fat?: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
}

function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function MacroBar({ label, value, unit = 'g', max, color }: {
  label: string; value?: number; unit?: string; max: number; color: string;
}) {
  const pct = value != null ? Math.min((value / max) * 100, 100) : 0;
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text style={styles.macroValue}>{value != null ? `${Math.round(value)}${unit}` : '—'}</Text>
      </View>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function todayLongLabel(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function NutritionScreen() {
  const [totals, setTotals] = useState<NutritionTotals>({});
  const [meals, setMeals] = useState<MealBreakdown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const date = todayDate();
      const data = await fetchNutrition(date);
      setTotals(data.rawTotals ?? {});
      setMeals(data.meals);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load nutrition data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const cal = totals.calories;
  const calTarget = 2000;
  const calPct = cal != null && cal > 0 ? Math.min((cal / calTarget) * 100, 100) : 0;
  const remaining = cal != null ? Math.max(calTarget - Math.round(cal), 0) : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#34d399" />}
    >
      <Text style={styles.title}>Nutrition</Text>
      <Text style={styles.dateLabel}>{todayLongLabel()}</Text>

      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.calorieCard}>
        <Text style={styles.calorieLabel}>Calories Today</Text>
        <Text style={styles.calorieValue}>{cal != null ? Math.round(cal).toLocaleString() : '—'}</Text>
        {cal != null && (
          <Text style={styles.calorieTarget}>
            of {calTarget.toLocaleString()} target{remaining != null && remaining > 0 ? ` · ${remaining.toLocaleString()} remaining` : ''}
          </Text>
        )}
        {cal != null && cal > 0 && (
          <View style={[styles.barBg, { marginTop: 12 }]}>
            <View style={[styles.barFill, { width: `${calPct}%` as any, backgroundColor: calPct >= 100 ? '#f87171' : '#34d399' }]} />
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Macros</Text>
        <MacroBar label="Protein"      value={totals.protein}        max={180} color="#34d399" />
        <MacroBar label="Carbs"        value={totals.carbohydrates}  max={250} color="#60a5fa" />
        <MacroBar label="Fat"          value={totals.fat}            max={80}  color="#fbbf24" />
        <MacroBar label="Fiber"        value={totals.fiber}          max={35}  color="#a78bfa" />
        <MacroBar label="Sugar"        value={totals.sugar}          max={50}  color="#f87171" />
        <MacroBar label="Sodium"       value={totals.sodium}         unit="mg" max={2300} color="#94a3b8" />
      </View>

      {meals.filter(m => m.calories > 0).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Meals</Text>
          {meals.filter(m => m.calories > 0).map((m) => (
            <View key={m.name} style={styles.mealRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.mealName}>{m.name}</Text>
                <Text style={styles.mealMacros}>P: {Math.round(m.protein)}g · C: {Math.round(m.carbs)}g · F: {Math.round(m.fat)}g</Text>
              </View>
              <Text style={styles.mealCal}>{Math.round(m.calories)} kcal</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60 },
  title: { fontSize: 26, fontWeight: '700', color: '#f1f5f9', marginBottom: 2 },
  dateLabel: { fontSize: 14, color: '#64748b', marginBottom: 14 },
  errorCard: { backgroundColor: '#1e293b', borderRadius: 10, padding: 14, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#f87171' },
  errorText: { fontSize: 13, color: '#f87171' },
  calorieCard: { backgroundColor: '#1e293b', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 16 },
  calorieLabel: { fontSize: 14, color: '#64748b', marginBottom: 4 },
  calorieValue: { fontSize: 52, fontWeight: '800', color: '#34d399' },
  calorieTarget: { fontSize: 13, color: '#64748b', marginTop: 2 },
  section: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#94a3b8', marginBottom: 14 },
  macroLabel: { fontSize: 14, color: '#cbd5e1' },
  macroValue: { fontSize: 14, fontWeight: '600', color: '#f1f5f9' },
  barBg: { height: 6, backgroundColor: '#334155', borderRadius: 3, width: '100%' },
  barFill: { height: 6, borderRadius: 3 },
  mealRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 12, marginTop: 12 },
  mealName: { fontSize: 14, fontWeight: '600', color: '#f1f5f9' },
  mealMacros: { fontSize: 12, color: '#64748b', marginTop: 3 },
  mealCal: { fontSize: 15, fontWeight: '700', color: '#34d399' },
});
