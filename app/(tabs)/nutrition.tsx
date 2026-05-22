import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, FlatList, ActivityIndicator, Alert, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  getFoodLogs, logFood, deleteFoodLog, FoodLog,
} from '../../src/services/SupabaseService';
import { searchFood, lookupBarcode, foodResultToLog, FoodResult } from '../../src/services/FoodDatabaseService';

const MEAL_TYPES: Array<FoodLog['meal_type']> = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_COLORS: Record<string, string> = {
  breakfast: '#fbbf24', lunch: '#34d399', dinner: '#60a5fa', snack: '#a78bfa',
};

function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayLongLabel(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── Macro progress bar ────────────────────────────────────────────────────────
function MacroBar({ label, value, target, unit = 'g', color }: {
  label: string; value: number; target: number; unit?: string; color: string;
}) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const over = value > target && target > 0;
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={s.macroLabel}>{label}</Text>
        <Text style={[s.macroValue, over && { color: '#f87171' }]}>
          {Math.round(value)}{unit} <Text style={s.macroTarget}>/ {Math.round(target)}{unit}</Text>
        </Text>
      </View>
      <View style={s.barBg}>
        <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: over ? '#f87171' : color }]} />
      </View>
    </View>
  );
}

// ── Food search modal ─────────────────────────────────────────────────────────
function FoodSearchModal({
  visible, mealType, onClose, onAdded,
}: {
  visible: boolean;
  mealType: FoodLog['meal_type'];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<'search' | 'scan'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<FoodResult | null>(null);
  const [servings, setServings] = useState('1');
  const [adding, setAdding] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);

  const reset = () => {
    setQuery(''); setResults([]); setSelected(null); setServings('1'); setScanned(false); setScanLoading(false);
  };

  const handleClose = () => { reset(); setMode('search'); onClose(); };

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const r = await searchFood(q);
      setResults(r);
    } catch {}
    setSearching(false);
  }, []);

  const handleBarcode = async ({ data: barcode }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    setScanLoading(true);
    try {
      const result = await lookupBarcode(barcode);
      // Switch mode AFTER lookup completes — avoids tearing down CameraView mid-flight
      setMode('search');
      setScanLoading(false);
      if (result) { setSelected(result); setResults([]); }
      else { Alert.alert('Not found', `Barcode ${barcode} wasn't found in our database.`); setScanned(false); }
    } catch {
      setMode('search');
      setScanLoading(false);
      setScanned(false);
    }
  };

  const addFood = async () => {
    if (!selected) return;
    const qty = parseFloat(servings) || 1;
    setAdding(true);
    try {
      // foodResultToLog scales all nutrients by servingQty/food.serving_qty
      const servingQty = selected.serving_qty * qty;
      const entry = foodResultToLog(selected, todayDate(), mealType, servingQty);
      await logFood(entry);
      onAdded();
      handleClose();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to log food');
    }
    setAdding(false);
  };

  if (!visible) return null;

  // Serving detail view
  if (selected) {
    return (
      <Modal visible animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Ionicons name="arrow-back" size={22} color="#94a3b8" />
              </TouchableOpacity>
              <Text style={s.modalTitle} numberOfLines={1}>{selected.name}</Text>
              <View style={{ width: 22 }} />
            </View>
            {selected.brand ? <Text style={s.brandText}>{selected.brand}</Text> : null}

            <ScrollView style={{ flex: 1, padding: 20 }} keyboardShouldPersistTaps="handled">
              <Text style={s.sectionLabel}>Per {selected.serving_qty} {selected.serving_unit}{selected.serving_weight_g ? ` (${selected.serving_weight_g}g)` : ''}</Text>
              <View style={s.nutriRow}><Text style={s.nutriLabel}>Calories</Text><Text style={s.nutriVal}>{Math.round(selected.calories ?? 0)}</Text></View>
              <View style={s.nutriRow}><Text style={s.nutriLabel}>Protein</Text><Text style={s.nutriVal}>{(+(selected.protein_g ?? 0)).toFixed(1)}g</Text></View>
              <View style={s.nutriRow}><Text style={s.nutriLabel}>Carbs</Text><Text style={s.nutriVal}>{(+(selected.carbs_g ?? 0)).toFixed(1)}g</Text></View>
              <View style={s.nutriRow}><Text style={s.nutriLabel}>Fat</Text><Text style={s.nutriVal}>{(+(selected.fat_g ?? 0)).toFixed(1)}g</Text></View>
              {selected.fiber_g != null && <View style={s.nutriRow}><Text style={s.nutriLabel}>Fiber</Text><Text style={s.nutriVal}>{(+selected.fiber_g).toFixed(1)}g</Text></View>}
              {selected.sugar_g != null && <View style={s.nutriRow}><Text style={s.nutriLabel}>Sugar</Text><Text style={s.nutriVal}>{(+selected.sugar_g).toFixed(1)}g</Text></View>}
              {selected.sodium_mg != null && <View style={s.nutriRow}><Text style={s.nutriLabel}>Sodium</Text><Text style={s.nutriVal}>{Math.round(selected.sodium_mg)}mg</Text></View>}
              {selected.saturated_fat_g != null && <View style={s.nutriRow}><Text style={s.nutriLabel}>Sat Fat</Text><Text style={s.nutriVal}>{(+selected.saturated_fat_g).toFixed(1)}g</Text></View>}

              <Text style={[s.sectionLabel, { marginTop: 24 }]}>Number of servings</Text>
              <TextInput
                style={s.servingInput}
                value={servings}
                onChangeText={setServings}
                keyboardType="decimal-pad"
                placeholder="1"
                placeholderTextColor="#475569"
              />

              <View style={s.totalBox}>
                <Text style={s.totalLabel}>Total ({parseFloat(servings) || 1}x serving)</Text>
                <Text style={s.totalCal}>{Math.round(selected.calories * (parseFloat(servings) || 1))} kcal</Text>
                <Text style={s.totalMacros}>
                  P: {Math.round(selected.protein_g * (parseFloat(servings) || 1))}g ·{' '}
                  C: {Math.round(selected.carbs_g * (parseFloat(servings) || 1))}g ·{' '}
                  F: {Math.round(selected.fat_g * (parseFloat(servings) || 1))}g
                </Text>
              </View>
            </ScrollView>

            <View style={s.modalFooter}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setSelected(null)}>
                <Text style={s.cancelBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.addBtn} onPress={addFood} disabled={adding}>
                {adding ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.addBtnText}>Add to {mealType}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  // Scanner mode
  if (mode === 'scan') {
    if (!permission?.granted) {
      return (
        <Modal visible animationType="slide" presentationStyle="pageSheet">
          <View style={[s.modal, { justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="camera-outline" size={60} color="#64748b" />
            <Text style={[s.modalTitle, { marginTop: 16, marginBottom: 8 }]}>Camera Permission</Text>
            <Text style={{ color: '#94a3b8', textAlign: 'center', marginBottom: 24, paddingHorizontal: 24 }}>
              Camera access is needed to scan barcodes.
            </Text>
            <TouchableOpacity style={s.addBtn} onPress={requestPermission}>
              <Text style={s.addBtnText}>Grant Access</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.cancelBtn, { marginTop: 12 }]} onPress={() => setMode('search')}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      );
    }
    return (
      <Modal visible animationType="slide" presentationStyle="fullScreen">
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
            onBarcodeScanned={scanned ? undefined : handleBarcode}
          />
          <View style={s.scanOverlay}>
            <View style={[s.scanFrame, scanLoading && { borderColor: '#fbbf24' }]} />
            {scanLoading
              ? <View style={s.scanHintRow}>
                  <ActivityIndicator size="small" color="#fbbf24" />
                  <Text style={[s.scanHint, { color: '#fbbf24', marginTop: 0, marginLeft: 8 }]}>Looking up barcode…</Text>
                </View>
              : <Text style={s.scanHint}>Point at a food barcode to scan</Text>
            }
            {!scanLoading && (
              <TouchableOpacity style={s.scanCancel} onPress={() => { setMode('search'); setScanned(false); }}>
                <Text style={s.scanCancelText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  // Search mode (default)
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={22} color="#94a3b8" />
            </TouchableOpacity>
            <Text style={s.modalTitle}>Add to {mealType}</Text>
            <TouchableOpacity onPress={() => { setMode('scan'); setScanned(false); }}>
              <Ionicons name="barcode-outline" size={24} color="#34d399" />
            </TouchableOpacity>
          </View>

          <View style={s.searchRow}>
            <Ionicons name="search-outline" size={18} color="#64748b" style={{ marginRight: 8 }} />
            <TextInput
              style={s.searchInput}
              placeholder="Search food (e.g. Greek yogurt, chicken breast…)"
              placeholderTextColor="#475569"
              value={query}
              onChangeText={(t) => { setQuery(t); doSearch(t); }}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={() => doSearch(query)}
            />
            {searching && <ActivityIndicator size="small" color="#34d399" />}
          </View>

          <FlatList
            data={results}
            keyExtractor={(_, i) => i.toString()}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListEmptyComponent={
              query.length > 1 && !searching ? (
                <Text style={{ color: '#475569', textAlign: 'center', marginTop: 40 }}>No results found</Text>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={s.resultRow} onPress={() => setSelected(item)}>
                <View style={{ flex: 1 }}>
                  <Text style={s.resultName} numberOfLines={1}>{item.name}</Text>
                  {item.brand ? <Text style={s.resultBrand}>{item.brand}</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.resultCal}>{item.calories ?? '?'} kcal</Text>
                  <Text style={s.resultServing}>per {item.serving_qty} {item.serving_unit}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function NutritionScreen() {
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [addModal, setAddModal] = useState<{ visible: boolean; meal: FoodLog['meal_type'] }>({
    visible: false, meal: 'breakfast',
  });

  // Default targets — will be overridden by goals from Supabase
  const targets = { calories: 2000, protein: 160, carbs: 200, fat: 65, fiber: 30 };

  async function loadLogs() {
    setLoading(true);
    try { setLogs(await getFoodLogs(todayDate())); } catch {}
    setLoading(false);
  }

  useEffect(() => { loadLogs(); }, []);

  const totals = logs.reduce(
    (acc, l) => ({
      calories: acc.calories + (l.calories ?? 0),
      protein: acc.protein + (l.protein_g ?? 0),
      carbs: acc.carbs + (l.carbs_g ?? 0),
      fat: acc.fat + (l.fat_g ?? 0),
      fiber: acc.fiber + (l.fiber_g ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );

  const remaining = Math.max(targets.calories - totals.calories, 0);
  const calPct = Math.min((totals.calories / targets.calories) * 100, 100);
  const calOver = totals.calories > targets.calories;

  const logsByMeal = (meal: FoodLog['meal_type']) => logs.filter(l => l.meal_type === meal);

  const handleDelete = (id: string) => {
    Alert.alert('Remove item', 'Remove this food from your log?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await deleteFoodLog(id!); loadLogs(); } },
    ]);
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>Nutrition</Text>
      <Text style={s.dateLabel}>{todayLongLabel()}</Text>

      {/* Calorie ring summary */}
      <View style={s.calorieCard}>
        <Text style={s.calorieLabel}>Calories</Text>
        <Text style={[s.calorieValue, calOver && { color: '#f87171' }]}>
          {Math.round(totals.calories).toLocaleString()}
        </Text>
        <Text style={s.calorieTarget}>
          of {targets.calories.toLocaleString()} · {calOver ? `${Math.round(totals.calories - targets.calories)} over` : `${Math.round(remaining)} remaining`}
        </Text>
        <View style={[s.barBg, { marginTop: 14, width: '100%' }]}>
          <View style={[s.barFill, { width: `${calPct}%` as any, backgroundColor: calOver ? '#f87171' : '#34d399' }]} />
        </View>
      </View>

      {/* Macro bars */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Macros</Text>
        <MacroBar label="Protein" value={totals.protein} target={targets.protein} color="#34d399" />
        <MacroBar label="Carbs"   value={totals.carbs}   target={targets.carbs}   color="#60a5fa" />
        <MacroBar label="Fat"     value={totals.fat}     target={targets.fat}     color="#fbbf24" />
        <MacroBar label="Fiber"   value={totals.fiber}   target={targets.fiber}   color="#a78bfa" />
      </View>

      {/* Meal sections */}
      {MEAL_TYPES.map((meal) => {
        const mealLogs = logsByMeal(meal);
        const mealCal = mealLogs.reduce((a, l) => a + (l.calories ?? 0), 0);
        return (
          <View key={meal} style={s.section}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[s.mealDot, { backgroundColor: MEAL_COLORS[meal] }]} />
                <Text style={s.sectionTitle}>{meal.charAt(0).toUpperCase() + meal.slice(1)}</Text>
                {mealCal > 0 && <Text style={s.mealCalBadge}>{Math.round(mealCal)} kcal</Text>}
              </View>
              <TouchableOpacity
                style={s.addMealBtn}
                onPress={() => setAddModal({ visible: true, meal })}
              >
                <Ionicons name="add" size={18} color="#34d399" />
              </TouchableOpacity>
            </View>

            {mealLogs.length === 0 ? (
              <TouchableOpacity
                style={s.emptyMeal}
                onPress={() => setAddModal({ visible: true, meal })}
              >
                <Ionicons name="add-circle-outline" size={20} color="#475569" />
                <Text style={s.emptyMealText}>Add food</Text>
              </TouchableOpacity>
            ) : (
              mealLogs.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={s.logRow}
                  onLongPress={() => item.id && handleDelete(item.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.logName} numberOfLines={1}>{item.food_name}</Text>
                    <Text style={s.logMacros}>
                      P: {Math.round(item.protein_g ?? 0)}g · C: {Math.round(item.carbs_g ?? 0)}g · F: {Math.round(item.fat_g ?? 0)}g
                    </Text>
                  </View>
                  <Text style={s.logCal}>{Math.round(item.calories ?? 0)} kcal</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        );
      })}

      <Text style={s.hintText}>Hold an item to remove it</Text>

      <FoodSearchModal
        visible={addModal.visible}
        mealType={addModal.meal}
        onClose={() => setAddModal(p => ({ ...p, visible: false }))}
        onAdded={loadLogs}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: '#f1f5f9', marginBottom: 2 },
  dateLabel: { fontSize: 14, color: '#64748b', marginBottom: 14 },
  calorieCard: { backgroundColor: '#1e293b', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 16 },
  calorieLabel: { fontSize: 14, color: '#94a3b8', marginBottom: 4 },
  calorieValue: { fontSize: 52, fontWeight: '800', color: '#34d399' },
  calorieTarget: { fontSize: 13, color: '#64748b', marginTop: 4 },
  section: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 },
  macroLabel: { fontSize: 14, color: '#cbd5e1' },
  macroValue: { fontSize: 13, fontWeight: '600', color: '#f1f5f9' },
  macroTarget: { color: '#475569', fontWeight: '400' },
  barBg: { height: 6, backgroundColor: '#334155', borderRadius: 3 },
  barFill: { height: 6, borderRadius: 3 },
  mealDot: { width: 8, height: 8, borderRadius: 4 },
  mealCalBadge: { fontSize: 12, color: '#64748b', marginLeft: 4 },
  addMealBtn: { padding: 4 },
  emptyMeal: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  emptyMealText: { fontSize: 14, color: '#475569' },
  logRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#334155' },
  logName: { fontSize: 14, color: '#f1f5f9', fontWeight: '500' },
  logMacros: { fontSize: 12, color: '#64748b', marginTop: 2 },
  logCal: { fontSize: 14, fontWeight: '700', color: '#34d399', marginLeft: 8 },
  hintText: { fontSize: 12, color: '#334155', textAlign: 'center', marginTop: 8 },
  // Modal styles
  modal: { flex: 1, backgroundColor: '#0f172a' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#f1f5f9', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  brandText: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', margin: 16, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, color: '#f1f5f9', fontSize: 15 },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  resultName: { fontSize: 14, fontWeight: '600', color: '#f1f5f9' },
  resultBrand: { fontSize: 12, color: '#64748b', marginTop: 2 },
  resultCal: { fontSize: 14, fontWeight: '700', color: '#34d399' },
  resultServing: { fontSize: 11, color: '#475569' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  nutriRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  nutriLabel: { fontSize: 14, color: '#cbd5e1' },
  nutriVal: { fontSize: 14, fontWeight: '600', color: '#f1f5f9' },
  servingInput: { backgroundColor: '#1e293b', borderRadius: 10, padding: 14, fontSize: 20, color: '#f1f5f9', textAlign: 'center', marginBottom: 16 },
  totalBox: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 24 },
  totalLabel: { fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },
  totalCal: { fontSize: 36, fontWeight: '800', color: '#34d399', marginTop: 4 },
  totalMacros: { fontSize: 13, color: '#94a3b8', marginTop: 6 },
  modalFooter: { flexDirection: 'row', padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: '#1e293b' },
  cancelBtn: { flex: 1, backgroundColor: '#1e293b', borderRadius: 12, padding: 14, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: '#94a3b8' },
  addBtn: { flex: 2, backgroundColor: '#34d399', borderRadius: 12, padding: 14, alignItems: 'center' },
  addBtnText: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  // Scanner
  scanOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 260, height: 160, borderWidth: 2, borderColor: '#34d399', borderRadius: 12 },
  scanHint: { color: '#fff', fontSize: 14, marginTop: 20, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  scanHintRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  scanCancel: { position: 'absolute', bottom: 60, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  scanCancelText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
