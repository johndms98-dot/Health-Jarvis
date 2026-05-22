import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHealthStore } from '../../src/store/healthStore';
import { loadGoals, loadRecentIngredients, addRecentIngredients } from '../../src/services/GoalsService';
import { generateMealIdeas } from '../../src/services/LLMService';
import { HealthGoals, DEFAULT_GOALS, adjustedTargets } from '../../src/models/Goals';

export default function MealsScreen() {
  const { snapshots } = useHealthStore();
  const today = snapshots[0];

  const [goals, setGoals] = useState<HealthGoals>(DEFAULT_GOALS);
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [recentIngredients, setRecentIngredients] = useState<string[]>([]);
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    loadGoals().then(setGoals);
    loadRecentIngredients().then(setRecentIngredients);
  }, []);

  function addIngredient(name: string) {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed || ingredients.includes(trimmed)) return;
    setIngredients(prev => [...prev, trimmed]);
    setInputText('');
  }

  function removeIngredient(name: string) {
    setIngredients(prev => prev.filter(i => i !== name));
  }

  function handleInputSubmit() {
    // Support comma-separated entry
    const items = inputText.split(',').map(s => s.trim()).filter(Boolean);
    items.forEach(addIngredient);
    setInputText('');
  }

  async function handleGenerate() {
    if (ingredients.length === 0) {
      setError('Add at least one ingredient first.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult('');

    try {
      const updated = await addRecentIngredients(ingredients);
      setRecentIngredients(updated);

      const text = await generateMealIdeas(ingredients, today ?? {}, goals);
      setResult(text);
    } catch (e: any) {
      setError(e.message ?? 'Failed to generate meal ideas');
    } finally {
      setLoading(false);
    }
  }

  // Activity context for the info banner
  const targets = adjustedTargets(goals, today?.activeCalories, today?.steps);
  const eaten = today?.caloriesConsumed ?? 0;
  const remaining = Math.max(targets.calories - eaten, 0);
  const proteinRemaining = Math.max(targets.protein - (today?.proteinG ?? 0), 0).toFixed(1);
  const isHighActivity = (today?.activeCalories ?? 0) > 400 || (today?.steps ?? 0) > 10000;

  const suggestRecent = recentIngredients.filter(r => !ingredients.includes(r)).slice(0, 16);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Meal Planner</Text>
        <Text style={styles.subtitle}>Tell me what's in your fridge — I'll suggest meals that fit your day.</Text>

        {/* Activity-aware context banner */}
        {today && (
          <View style={[styles.contextBanner, isHighActivity && styles.contextBannerActive]}>
            <Ionicons
              name={isHighActivity ? 'flame' : 'restaurant-outline'}
              size={14}
              color={isHighActivity ? '#fb923c' : '#64748b'}
            />
            <Text style={[styles.contextText, isHighActivity && styles.contextTextActive]}>
              {isHighActivity
                ? `Active day: ${(today.steps ?? 0).toLocaleString()} steps · targets bumped to ${targets.calories} kcal / ${targets.protein}g protein`
                : `Today: ${Math.round(eaten)} kcal eaten · ${remaining} kcal remaining · ${proteinRemaining}g protein to go`
              }
            </Text>
          </View>
        )}

        {/* Ingredient input */}
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Add ingredient (or comma-separated list)"
            placeholderTextColor="#475569"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleInputSubmit}
            returnKeyType="done"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.addButton}
            onPress={handleInputSubmit}
            disabled={!inputText.trim()}
          >
            <Ionicons name="add" size={22} color="#0f172a" />
          </TouchableOpacity>
        </View>

        {/* Current ingredients chips */}
        {ingredients.length > 0 && (
          <View style={styles.chipSection}>
            <Text style={styles.chipSectionLabel}>IN YOUR FRIDGE</Text>
            <View style={styles.chipRow}>
              {ingredients.map(ing => (
                <TouchableOpacity key={ing} style={styles.chipActive} onPress={() => removeIngredient(ing)}>
                  <Text style={styles.chipActiveText}>{ing}</Text>
                  <Ionicons name="close" size={12} color="#0f172a" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Recently used ingredients */}
        {suggestRecent.length > 0 && (
          <View style={styles.chipSection}>
            <Text style={styles.chipSectionLabel}>RECENTLY USED</Text>
            <View style={styles.chipRow}>
              {suggestRecent.map(ing => (
                <TouchableOpacity key={ing} style={styles.chipRecent} onPress={() => addIngredient(ing)}>
                  <Ionicons name="time-outline" size={11} color="#64748b" />
                  <Text style={styles.chipRecentText}>{ing}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Generate button */}
        <TouchableOpacity
          style={[styles.generateButton, (loading || ingredients.length === 0) && styles.generateButtonDisabled]}
          onPress={handleGenerate}
          disabled={loading || ingredients.length === 0}
        >
          {loading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ActivityIndicator color="#0f172a" />
              <Text style={styles.generateButtonText}>Generating ideas (~30s)…</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="sparkles" size={16} color="#0f172a" />
              <Text style={styles.generateButtonText}>Suggest Meals</Text>
            </View>
          )}
        </TouchableOpacity>

        {error && (
          <View style={styles.errorCard}>
            <Ionicons name="warning" size={15} color="#f87171" />
            <Text style={styles.errorText}> {error}</Text>
          </View>
        )}

        {/* Results */}
        {result !== '' && (
          <View style={styles.resultsCard}>
            <View style={styles.resultsHeader}>
              <Ionicons name="restaurant" size={16} color="#34d399" />
              <Text style={styles.resultsHeaderText}>  Meal Ideas</Text>
            </View>
            <Text style={styles.resultsText}>{result}</Text>
            <View style={styles.modelBadge}>
              <Ionicons name="hardware-chip-outline" size={11} color="#475569" />
              <Text style={styles.modelBadgeText}> llama3.2 · runs locally on your Mac</Text>
            </View>
          </View>
        )}

        {result === '' && !loading && !error && (
          <View style={styles.emptyState}>
            <Ionicons name="restaurant-outline" size={48} color="#334155" />
            <Text style={styles.emptyTitle}>What's in the fridge?</Text>
            <Text style={styles.emptyText}>
              Add your ingredients above and tap Suggest Meals. I'll pick 3 meals that match your remaining calorie and protein budget for the day.
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: '#f1f5f9', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#64748b', marginBottom: 14, lineHeight: 20 },

  contextBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1e293b', borderRadius: 10, padding: 12, marginBottom: 14,
  },
  contextBannerActive: { borderLeftWidth: 3, borderLeftColor: '#fb923c' },
  contextText: { fontSize: 13, color: '#64748b', flex: 1, lineHeight: 18 },
  contextTextActive: { color: '#fb923c' },

  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  input: {
    flex: 1, backgroundColor: '#1e293b', borderRadius: 10, padding: 12,
    fontSize: 14, color: '#f1f5f9', borderWidth: 1, borderColor: '#334155',
  },
  addButton: {
    backgroundColor: '#34d399', borderRadius: 10, width: 46, alignItems: 'center', justifyContent: 'center',
  },

  chipSection: { marginBottom: 14 },
  chipSectionLabel: { fontSize: 11, fontWeight: '600', color: '#475569', letterSpacing: 0.8, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipActive: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#34d399', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
  },
  chipActiveText: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  chipRecent: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#1e293b', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#334155',
  },
  chipRecentText: { fontSize: 13, color: '#94a3b8' },

  generateButton: {
    backgroundColor: '#34d399', borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  generateButtonDisabled: { opacity: 0.5 },
  generateButtonText: { fontSize: 16, fontWeight: '700', color: '#0f172a' },

  errorCard: {
    flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 10, padding: 12,
    marginBottom: 14, borderLeftWidth: 3, borderLeftColor: '#f87171',
  },
  errorText: { fontSize: 13, color: '#f87171', flex: 1 },

  resultsCard: { backgroundColor: '#1e293b', borderRadius: 14, padding: 18, marginBottom: 14 },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  resultsHeaderText: { fontSize: 15, fontWeight: '700', color: '#f1f5f9' },
  resultsText: { fontSize: 14, color: '#cbd5e1', lineHeight: 24 },
  modelBadge: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#334155',
  },
  modelBadgeText: { fontSize: 11, color: '#475569' },

  emptyState: { alignItems: 'center', marginTop: 40, gap: 12, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#94a3b8' },
  emptyText: { fontSize: 14, color: '#475569', textAlign: 'center', lineHeight: 22 },
});
