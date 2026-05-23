import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { loadGoals, saveGoals } from '../src/services/GoalsService';
import { HealthGoals, DEFAULT_GOALS } from '../src/models/Goals';
import { C } from '../constants/Theme';

function Field({
  label, value, onChangeText, unit, keyboardType = 'decimal-pad', placeholder,
}: {
  label: string; value: string; onChangeText: (t: string) => void;
  unit?: string; keyboardType?: any; placeholder?: string;
}) {
  return (
    <View style={field.row}>
      <Text style={field.label}>{label}</Text>
      <View style={field.inputWrap}>
        <TextInput
          style={field.input}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          placeholder={placeholder ?? '—'}
          placeholderTextColor="#475569"
        />
        {unit ? <Text style={field.unit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

export default function GoalsScreen() {
  const [goals, setGoals] = useState<HealthGoals>(DEFAULT_GOALS);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadGoals().then(setGoals); }, []);

  function setNum(key: keyof HealthGoals, raw: string) {
    const num = parseFloat(raw);
    setGoals(prev => ({ ...prev, [key]: isNaN(num) ? undefined : num }));
  }

  function setStr(key: keyof HealthGoals, val: string) {
    setGoals(prev => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveGoals(goals);
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save goals. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function resetToDefaults() {
    Alert.alert('Reset Goals', 'Reset all goals to defaults?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => setGoals({ ...DEFAULT_GOALS }) },
    ]);
  }

  const g = goals;
  const s = (v?: number) => v != null ? String(v) : '';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-down" size={24} color="#94a3b8" />
          </TouchableOpacity>
          <Text style={styles.title}>Weekly Goals</Text>
          <TouchableOpacity onPress={resetToDefaults}>
            <Text style={styles.resetText}>Reset</Text>
          </TouchableOpacity>
        </View>

        {/* Weight — lbs */}
        <Section title="Weight & Body" icon="scale-outline">
          <Field
            label="Current weight"
            value={s(g.currentWeightLbs)}
            onChangeText={v => setNum('currentWeightLbs', v)}
            unit="lbs"
            placeholder="e.g. 185"
          />
          <Field
            label="Target weight"
            value={s(g.targetWeightLbs)}
            onChangeText={v => setNum('targetWeightLbs', v)}
            unit="lbs"
            placeholder="e.g. 170"
          />
          <Field
            label="Target body fat"
            value={s(g.targetBodyFatPct)}
            onChangeText={v => setNum('targetBodyFatPct', v)}
            unit="%"
            placeholder="e.g. 18"
          />
          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={13} color="#475569" />
            <Text style={styles.noteText}>
              {' '}Renpho syncs weight to Apple Health automatically once you install an EAS build. Enter your current weight above to use it in meal planning and insights now.
            </Text>
          </View>
        </Section>

        {/* Nutrition */}
        <Section title="Daily Nutrition" icon="nutrition-outline">
          <Field label="Calories"  value={s(g.dailyCalories)} onChangeText={v => setNum('dailyCalories', v)} unit="kcal" keyboardType="number-pad" />
          <Field label="Protein"   value={s(g.proteinG)}      onChangeText={v => setNum('proteinG', v)}      unit="g" />
          <Field label="Carbs"     value={s(g.carbsG)}        onChangeText={v => setNum('carbsG', v)}        unit="g" />
          <Field label="Fat"       value={s(g.fatG)}          onChangeText={v => setNum('fatG', v)}          unit="g" />
          <Field label="Fiber"     value={s(g.fiberG)}        onChangeText={v => setNum('fiberG', v)}        unit="g" />
          <Field label="Water"     value={s(g.waterCups)}     onChangeText={v => setNum('waterCups', v)}     unit="cups" />
          <View style={styles.note}>
            <Ionicons name="flash-outline" size={13} color="#475569" />
            <Text style={styles.noteText}>
              {' '}On high-activity days these targets auto-adjust up based on calories burned.
            </Text>
          </View>
        </Section>

        {/* Activity */}
        <Section title="Activity" icon="footsteps-outline">
          <Field label="Daily steps"         value={s(g.dailySteps)}     onChangeText={v => setNum('dailySteps', v)}     unit="steps"    keyboardType="number-pad" />
          <Field label="Workouts per week"   value={s(g.weeklyWorkouts)} onChangeText={v => setNum('weeklyWorkouts', v)} unit="sessions" keyboardType="number-pad" />
        </Section>

        {/* Sleep */}
        <Section title="Sleep" icon="moon-outline">
          <Field label="Sleep goal" value={s(g.sleepHours)} onChangeText={v => setNum('sleepHours', v)} unit="hrs" />
          <Field label="Bedtime"    value={g.bedtime  ?? ''} onChangeText={v => setStr('bedtime', v)}   keyboardType="default" placeholder="23:00" />
          <Field label="Wake time"  value={g.wakeTime ?? ''} onChangeText={v => setStr('wakeTime', v)}  keyboardType="default" placeholder="07:00" />
        </Section>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save Goals'}</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon as any} size={15} color="#64748b" />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const field = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.bgInset },
  label: { fontSize: 14, color: C.textDefault, flex: 1 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { backgroundColor: C.bgInset, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 14, color: C.textBright, minWidth: 72, textAlign: 'right' },
  unit: { fontSize: 13, color: C.textTertiary, minWidth: 42 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingTop: 56, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  backButton: { padding: 4 },
  title: { fontSize: 20, fontWeight: '700', color: C.textBright },
  resetText: { fontSize: 14, color: C.textTertiary },
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 0.7 },
  sectionBody: { backgroundColor: C.bgCard, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: C.border },
  note: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10 },
  noteText: { fontSize: 12, color: C.textMuted, flex: 1, lineHeight: 18 },
  saveButton: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  saveButtonText: { fontSize: 16, fontWeight: '700', color: C.bg },
});
