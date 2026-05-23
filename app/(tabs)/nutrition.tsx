import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, FlatList, ActivityIndicator, Alert, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  getFoodLogs, logFood, deleteFoodLog, FoodLog,
  getSavedMeals, createSavedMeal, deleteSavedMeal, SavedMeal, SavedMealItem,
} from '../../src/services/SupabaseService';
import { searchFood, lookupBarcode, foodResultToLog, FoodResult } from '../../src/services/FoodDatabaseService';
import { loadGoals } from '../../src/services/GoalsService';
import { HealthGoals, DEFAULT_GOALS, adjustedTargets } from '../../src/models/Goals';
import { useHealthStore } from '../../src/store/healthStore';
import { C } from '../../constants/Theme';

const MEAL_TYPES: Array<FoodLog['meal_type']> = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_COLORS: Record<string, string> = {
  breakfast: C.warning, lunch: C.success, dinner: C.movement, snack: C.weight,
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
        <Text style={[s.macroValue, over && { color: C.danger }]}>
          {Math.round(value)}{unit} <Text style={s.macroTarget}>/ {Math.round(target)}{unit}</Text>
        </Text>
      </View>
      <View style={s.barBg}>
        <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: over ? C.danger : color }]} />
      </View>
    </View>
  );
}

// ── Water Tracker ─────────────────────────────────────────────────────────────
function WaterTracker({ cups, goal, onIncrement, onDecrement }: {
  cups: number; goal: number; onIncrement: () => void; onDecrement: () => void;
}) {
  const pct = goal > 0 ? Math.min((cups / goal) * 100, 100) : 0;
  return (
    <View style={s.section}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="water" size={16} color={C.primary} />
          <Text style={s.sectionTitle}>Water</Text>
        </View>
        <Text style={{ fontSize: 13, color: C.textTertiary }}>{cups} / {goal} cups</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity onPress={onDecrement} style={s.waterBtn} disabled={cups <= 0}>
          <Ionicons name="remove" size={18} color={cups > 0 ? C.textSecondary : C.textFaint} />
        </TouchableOpacity>
        <View style={[s.barBg, { flex: 1 }]}>
          <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: C.primary }]} />
        </View>
        <TouchableOpacity onPress={onIncrement} style={s.waterBtn}>
          <Ionicons name="add" size={18} color={C.primary} />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 8 }}>
        {Array.from({ length: goal }, (_, i) => (
          <View key={i} style={[s.waterDot, i < cups && s.waterDotFilled]} />
        ))}
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
  const [scanLoading, setScanLoading] = useState(false);
  const scanLock = useRef(false);

  const reset = () => {
    setQuery(''); setResults([]); setSelected(null); setServings('1'); setScanLoading(false);
    scanLock.current = false;
  };

  const handleClose = () => { reset(); setMode('search'); onClose(); };

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try { setResults(await searchFood(q)); } catch {}
    setSearching(false);
  }, []);

  const handleBarcode = async ({ data: barcode }: { data: string }) => {
    if (scanLock.current) return;
    scanLock.current = true;
    setScanLoading(true);
    try {
      const result = await lookupBarcode(barcode);
      if (result) {
        setSelected(result);
        setResults([]);
        setMode('search');
      } else {
        setMode('search');
        Alert.alert('Not found', `Barcode ${barcode} wasn't found in our database.`);
        scanLock.current = false;
      }
      setScanLoading(false);
    } catch {
      setMode('search'); setScanLoading(false);
      scanLock.current = false;
    }
  };

  const addFood = async () => {
    if (!selected) return;
    const qty = parseFloat(servings) || 1;
    setAdding(true);
    try {
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

  if (selected) {
    return (
      <Modal visible animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Ionicons name="arrow-back" size={22} color={C.textSecondary} />
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
                placeholderTextColor={C.textMuted}
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

  if (mode === 'scan') {
    if (!permission?.granted) {
      return (
        <Modal visible animationType="slide" presentationStyle="pageSheet">
          <View style={[s.modal, { justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="camera-outline" size={60} color={C.textTertiary} />
            <Text style={[s.modalTitle, { marginTop: 16, marginBottom: 8 }]}>Camera Permission</Text>
            <Text style={{ color: C.textSecondary, textAlign: 'center', marginBottom: 24, paddingHorizontal: 24 }}>
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
            onBarcodeScanned={handleBarcode}
          />
          <View style={s.scanOverlay}>
            <View style={[s.scanFrame, scanLoading && { borderColor: C.warning }]} />
            {scanLoading
              ? <View style={s.scanHintRow}>
                  <ActivityIndicator size="small" color={C.warning} />
                  <Text style={[s.scanHint, { color: C.warning, marginTop: 0, marginLeft: 8 }]}>Looking up barcode…</Text>
                </View>
              : <Text style={s.scanHint}>Point at a food barcode to scan</Text>
            }
            {!scanLoading && (
              <TouchableOpacity style={s.scanCancel} onPress={() => { setMode('search'); scanLock.current = false; }}>
                <Text style={s.scanCancelText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={22} color={C.textSecondary} />
            </TouchableOpacity>
            <Text style={s.modalTitle}>Add to {mealType}</Text>
            <TouchableOpacity onPress={() => { setMode('scan'); scanLock.current = false; }}>
              <Ionicons name="barcode-outline" size={24} color={C.primary} />
            </TouchableOpacity>
          </View>

          <View style={s.searchRow}>
            <Ionicons name="search-outline" size={18} color={C.textTertiary} style={{ marginRight: 8 }} />
            <TextInput
              style={s.searchInput}
              placeholder="Search food (e.g. Greek yogurt, chicken breast…)"
              placeholderTextColor={C.textMuted}
              value={query}
              onChangeText={(t) => { setQuery(t); doSearch(t); }}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={() => doSearch(query)}
            />
            {searching && <ActivityIndicator size="small" color={C.primary} />}
          </View>

          <FlatList
            data={results}
            keyExtractor={(_, i) => i.toString()}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListEmptyComponent={
              query.length > 1 && !searching ? (
                <Text style={{ color: C.textMuted, textAlign: 'center', marginTop: 40 }}>No results found</Text>
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

// ── Create Saved Meal Modal ──────────────────────────────────────────────────
function CreateSavedMealModal({
  visible, onClose, onSaved,
}: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const [mealName, setMealName] = useState('');
  const [items, setItems] = useState<(FoodResult & { qty: number })[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'name' | 'foods'>('name');

  const reset = () => {
    setMealName(''); setItems([]); setQuery(''); setResults([]); setStep('name');
  };
  const handleClose = () => { reset(); onClose(); };

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try { setResults(await searchFood(q)); } catch {}
    setSearching(false);
  }, []);

  const addItem = (food: FoodResult) => {
    setItems(prev => {
      if (prev.find(i => i.name === food.name && i.brand === food.brand)) return prev;
      return [...prev, { ...food, qty: 1 }];
    });
    setQuery(''); setResults([]);
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const totalCal = items.reduce((a, i) => a + (i.calories ?? 0) * i.qty, 0);
  const totalP = items.reduce((a, i) => a + (i.protein_g ?? 0) * i.qty, 0);
  const totalC = items.reduce((a, i) => a + (i.carbs_g ?? 0) * i.qty, 0);
  const totalF = items.reduce((a, i) => a + (i.fat_g ?? 0) * i.qty, 0);

  const handleSave = async () => {
    if (!mealName.trim() || items.length === 0) return;
    setSaving(true);
    try {
      const mealItems: SavedMealItem[] = items.map(i => ({
        food_name: i.name,
        serving_qty: i.serving_qty * i.qty,
        serving_unit: i.serving_unit,
        calories: (i.calories ?? 0) * i.qty,
        protein_g: (i.protein_g ?? 0) * i.qty,
        carbs_g: (i.carbs_g ?? 0) * i.qty,
        fat_g: (i.fat_g ?? 0) * i.qty,
        fiber_g: i.fiber_g != null ? i.fiber_g * i.qty : undefined,
      }));
      await createSavedMeal({
        name: mealName.trim(), items: mealItems,
        total_calories: totalCal, total_protein_g: totalP,
        total_carbs_g: totalC, total_fat_g: totalF,
        total_fiber_g: items.reduce((a, i) => a + (i.fiber_g ?? 0) * i.qty, 0),
      });
      onSaved();
      handleClose();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to save meal');
    }
    setSaving(false);
  };

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={22} color={C.textSecondary} />
            </TouchableOpacity>
            <Text style={s.modalTitle}>
              {step === 'name' ? 'Name Your Meal' : `Add Foods — ${mealName}`}
            </Text>
            <View style={{ width: 22 }} />
          </View>

          {step === 'name' ? (
            <View style={{ padding: 24 }}>
              <Text style={s.sectionLabel}>Meal template name</Text>
              <TextInput
                style={s.servingInput}
                placeholder="e.g. Post-workout shake"
                placeholderTextColor={C.textMuted}
                value={mealName}
                onChangeText={setMealName}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={() => { if (mealName.trim()) setStep('foods'); }}
              />
              <TouchableOpacity
                style={[s.addBtn, { marginTop: 12, opacity: mealName.trim() ? 1 : 0.4 }]}
                onPress={() => { if (mealName.trim()) setStep('foods'); }}
                disabled={!mealName.trim()}
              >
                <Text style={s.addBtnText}>Next — Add Foods</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={s.searchRow}>
                <Ionicons name="search-outline" size={18} color={C.textTertiary} style={{ marginRight: 8 }} />
                <TextInput
                  style={s.searchInput}
                  placeholder="Search and add foods…"
                  placeholderTextColor={C.textMuted}
                  value={query}
                  onChangeText={t => { setQuery(t); doSearch(t); }}
                  returnKeyType="search"
                  onSubmitEditing={() => doSearch(query)}
                  autoFocus
                />
                {searching && <ActivityIndicator size="small" color={C.primary} />}
              </View>

              {results.length > 0 && (
                <FlatList
                  data={results.slice(0, 6)}
                  keyExtractor={(_, i) => i.toString()}
                  style={{ maxHeight: 220, borderBottomWidth: 1, borderBottomColor: C.border }}
                  contentContainerStyle={{ paddingHorizontal: 16 }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity style={s.resultRow} onPress={() => addItem(item)}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.resultName} numberOfLines={1}>{item.name}</Text>
                        {item.brand ? <Text style={s.resultBrand}>{item.brand}</Text> : null}
                      </View>
                      <Text style={s.resultCal}>{item.calories ?? '?'} kcal</Text>
                    </TouchableOpacity>
                  )}
                />
              )}

              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
                {items.length === 0 ? (
                  <View style={{ alignItems: 'center', marginTop: 32 }}>
                    <Ionicons name="add-circle-outline" size={40} color={C.textFaint} />
                    <Text style={{ color: C.textMuted, marginTop: 8 }}>Search and tap foods to add them</Text>
                  </View>
                ) : (
                  items.map((item, idx) => (
                    <View key={idx} style={[s.logRow, { paddingVertical: 12 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.logName} numberOfLines={1}>{item.name}</Text>
                        <Text style={s.logMacros}>{Math.round((item.calories ?? 0) * item.qty)} kcal · {item.serving_qty * item.qty} {item.serving_unit}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity onPress={() => setItems(prev => prev.map((x, i) => i === idx ? { ...x, qty: Math.max(0.5, x.qty - 0.5) } : x))}>
                          <Ionicons name="remove-circle-outline" size={22} color={C.textTertiary} />
                        </TouchableOpacity>
                        <Text style={{ color: C.textBright, fontWeight: '700', width: 28, textAlign: 'center' }}>{item.qty}</Text>
                        <TouchableOpacity onPress={() => setItems(prev => prev.map((x, i) => i === idx ? { ...x, qty: x.qty + 0.5 } : x))}>
                          <Ionicons name="add-circle-outline" size={22} color={C.textTertiary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeItem(idx)}>
                          <Ionicons name="close-circle" size={22} color={C.textFaint} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
                {items.length > 0 && (
                  <View style={s.totalBox}>
                    <Text style={s.totalLabel}>Total</Text>
                    <Text style={s.totalCal}>{Math.round(totalCal)} kcal</Text>
                    <Text style={s.totalMacros}>P: {Math.round(totalP)}g · C: {Math.round(totalC)}g · F: {Math.round(totalF)}g</Text>
                  </View>
                )}
              </ScrollView>

              <View style={s.modalFooter}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setStep('name')}>
                  <Text style={s.cancelBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.addBtn, { opacity: items.length === 0 || saving ? 0.5 : 1 }]}
                  onPress={handleSave}
                  disabled={items.length === 0 || saving}
                >
                  {saving
                    ? <ActivityIndicator color={C.bg} size="small" />
                    : <Text style={s.addBtnText}>Save Template</Text>
                  }
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function NutritionScreen() {
  const { snapshots } = useHealthStore();
  const today = snapshots[0];
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [addModal, setAddModal] = useState<{ visible: boolean; meal: FoodLog['meal_type'] }>({
    visible: false, meal: 'breakfast',
  });
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [createMealVisible, setCreateMealVisible] = useState(false);
  const [goals, setGoals] = useState<HealthGoals>(DEFAULT_GOALS);
  const [waterCups, setWaterCups] = useState(0);

  useEffect(() => {
    loadGoals().then(setGoals);
    loadLogs();
    loadSavedMeals();
  }, []);

  const dynTargets = adjustedTargets(goals, today?.activeCalories, today?.steps);
  const targets = {
    calories: dynTargets.calories,
    protein: dynTargets.protein,
    carbs: dynTargets.carbs,
    fat: dynTargets.fat,
    fiber: goals.fiberG,
  };

  async function loadLogs() {
    setLoading(true);
    try { setLogs(await getFoodLogs(todayDate())); } catch {}
    setLoading(false);
  }

  async function loadSavedMeals() {
    try { setSavedMeals(await getSavedMeals()); } catch {}
  }

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

  const handleLogSavedMeal = (meal: SavedMeal) => {
    Alert.alert(
      `Log "${meal.name}"`,
      `${Math.round(meal.total_calories)} kcal · ${Math.round(meal.total_protein_g)}g protein\n\nLog to which meal?`,
      MEAL_TYPES.map(mt => ({
        text: mt.charAt(0).toUpperCase() + mt.slice(1),
        onPress: async () => {
          try {
            await Promise.all(meal.items.map(item =>
              logFood({
                date: todayDate(), meal_type: mt,
                food_name: item.food_name, serving_qty: item.serving_qty,
                serving_unit: item.serving_unit, calories: item.calories,
                protein_g: item.protein_g, carbs_g: item.carbs_g, fat_g: item.fat_g,
                fiber_g: item.fiber_g ?? 0, sugar_g: 0, sodium_mg: 0, saturated_fat_g: 0,
              })
            ));
            loadLogs();
          } catch (e: any) {
            Alert.alert('Error', e.message ?? 'Failed to log meal');
          }
        },
      })).concat([{ text: 'Cancel', style: 'cancel' } as any]),
    );
  };

  const handleDeleteSavedMeal = (meal: SavedMeal) => {
    Alert.alert('Delete Template', `Delete "${meal.name}"? This won't affect past food logs.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        if (meal.id) { await deleteSavedMeal(meal.id); loadSavedMeals(); }
      }},
    ]);
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>Nutrition</Text>
      <Text style={s.dateLabel}>{todayLongLabel()}</Text>

      {/* Calorie summary */}
      <View style={[s.calorieCard, { borderTopWidth: 2, borderTopColor: calOver ? C.danger : C.primary }]}>
        <Text style={s.calorieLabel}>Calories</Text>
        <Text style={[s.calorieValue, calOver && { color: C.danger }]}>
          {Math.round(totals.calories).toLocaleString()}
        </Text>
        <Text style={s.calorieTarget}>
          of {targets.calories.toLocaleString()} · {calOver ? `${Math.round(totals.calories - targets.calories)} over` : `${Math.round(remaining)} remaining`}
        </Text>
        <View style={[s.barBg, { marginTop: 14, width: '100%' }]}>
          <View style={[s.barFill, { width: `${calPct}%` as any, backgroundColor: calOver ? C.danger : C.primary }]} />
        </View>
      </View>

      {/* Macro bars */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Macros</Text>
        <MacroBar label="Protein" value={totals.protein} target={targets.protein} color={C.success} />
        <MacroBar label="Carbs" value={totals.carbs} target={targets.carbs} color={C.movement} />
        <MacroBar label="Fat" value={totals.fat} target={targets.fat} color={C.warning} />
        <MacroBar label="Fiber" value={totals.fiber} target={targets.fiber} color={C.weight} />
      </View>

      {/* Water tracker */}
      <WaterTracker
        cups={waterCups}
        goal={goals.waterCups}
        onIncrement={() => setWaterCups(c => c + 1)}
        onDecrement={() => setWaterCups(c => Math.max(0, c - 1))}
      />

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
              <TouchableOpacity style={s.addMealBtn} onPress={() => setAddModal({ visible: true, meal })}>
                <Ionicons name="add" size={18} color={C.primary} />
              </TouchableOpacity>
            </View>
            {mealLogs.length === 0 ? (
              <TouchableOpacity style={s.emptyMeal} onPress={() => setAddModal({ visible: true, meal })}>
                <Ionicons name="add-circle-outline" size={20} color={C.textMuted} />
                <Text style={s.emptyMealText}>Add food</Text>
              </TouchableOpacity>
            ) : (
              mealLogs.map((item) => (
                <TouchableOpacity key={item.id} style={s.logRow} onLongPress={() => item.id && handleDelete(item.id)}>
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

      {/* Saved Meal Templates */}
      <View style={[s.section, { marginTop: 8 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={s.sectionTitle}>Meal Templates</Text>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            onPress={() => setCreateMealVisible(true)}
          >
            <Ionicons name="add" size={16} color={C.primary} />
            <Text style={{ fontSize: 13, color: C.primary, fontWeight: '600' }}>Create</Text>
          </TouchableOpacity>
        </View>
        {savedMeals.length === 0 ? (
          <TouchableOpacity style={s.emptyMeal} onPress={() => setCreateMealVisible(true)}>
            <Ionicons name="bookmark-outline" size={20} color={C.textMuted} />
            <Text style={s.emptyMealText}>Save a meal template for one-tap logging</Text>
          </TouchableOpacity>
        ) : (
          savedMeals.map(meal => (
            <TouchableOpacity
              key={meal.id} style={[s.logRow, { paddingVertical: 12 }]}
              onPress={() => handleLogSavedMeal(meal)}
              onLongPress={() => handleDeleteSavedMeal(meal)}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.logName}>{meal.name}</Text>
                <Text style={s.logMacros}>
                  P: {Math.round(meal.total_protein_g)}g · C: {Math.round(meal.total_carbs_g)}g · F: {Math.round(meal.total_fat_g)}g
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={s.logCal}>{Math.round(meal.total_calories)} kcal</Text>
                <Ionicons name="chevron-forward" size={14} color={C.textFaint} />
              </View>
            </TouchableOpacity>
          ))
        )}
        {savedMeals.length > 0 && (
          <Text style={[s.hintText, { marginTop: 4 }]}>Tap to log · Hold to delete</Text>
        )}
      </View>

      <FoodSearchModal
        visible={addModal.visible} mealType={addModal.meal}
        onClose={() => setAddModal(p => ({ ...p, visible: false }))} onAdded={loadLogs}
      />
      <CreateSavedMealModal
        visible={createMealVisible}
        onClose={() => setCreateMealVisible(false)} onSaved={loadSavedMeals}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: C.textBright, marginBottom: 2 },
  dateLabel: { fontSize: 14, color: C.textTertiary, marginBottom: 14 },
  calorieCard: { backgroundColor: C.bgCard, borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: C.border },
  calorieLabel: { fontSize: 14, color: C.textSecondary, marginBottom: 4 },
  calorieValue: { fontSize: 52, fontWeight: '800', color: C.primary },
  calorieTarget: { fontSize: 13, color: C.textTertiary, marginTop: 4 },
  section: { backgroundColor: C.bgCard, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  macroLabel: { fontSize: 14, color: C.textDefault },
  macroValue: { fontSize: 13, fontWeight: '600', color: C.textBright },
  macroTarget: { color: C.textMuted, fontWeight: '400' },
  barBg: { height: 6, backgroundColor: C.bgElevated, borderRadius: 3 },
  barFill: { height: 6, borderRadius: 3 },
  mealDot: { width: 8, height: 8, borderRadius: 4 },
  mealCalBadge: { fontSize: 12, color: C.textTertiary, marginLeft: 4 },
  addMealBtn: { padding: 4 },
  emptyMeal: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  emptyMealText: { fontSize: 14, color: C.textMuted },
  logRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border },
  logName: { fontSize: 14, color: C.textBright, fontWeight: '500' },
  logMacros: { fontSize: 12, color: C.textTertiary, marginTop: 2 },
  logCal: { fontSize: 14, fontWeight: '700', color: C.primary, marginLeft: 8 },
  hintText: { fontSize: 12, color: C.textFaint, textAlign: 'center', marginTop: 8 },
  // Water
  waterBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.bgElevated, alignItems: 'center', justifyContent: 'center' },
  waterDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.bgElevated },
  waterDotFilled: { backgroundColor: C.primary },
  // Modal
  modal: { flex: 1, backgroundColor: C.bg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { fontSize: 17, fontWeight: '700', color: C.textBright, flex: 1, textAlign: 'center', marginHorizontal: 8 },
  brandText: { fontSize: 13, color: C.textTertiary, textAlign: 'center', marginTop: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgCard, margin: 16, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, color: C.textBright, fontSize: 15 },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  resultName: { fontSize: 14, fontWeight: '600', color: C.textBright },
  resultBrand: { fontSize: 12, color: C.textTertiary, marginTop: 2 },
  resultCal: { fontSize: 14, fontWeight: '700', color: C.primary },
  resultServing: { fontSize: 11, color: C.textMuted },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: C.textTertiary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  nutriRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  nutriLabel: { fontSize: 14, color: C.textDefault },
  nutriVal: { fontSize: 14, fontWeight: '600', color: C.textBright },
  servingInput: { backgroundColor: C.bgCard, borderRadius: 10, padding: 14, fontSize: 20, color: C.textBright, textAlign: 'center', marginBottom: 16, borderWidth: 1, borderColor: C.border },
  totalBox: { backgroundColor: C.bgCard, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: C.border },
  totalLabel: { fontSize: 12, color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  totalCal: { fontSize: 36, fontWeight: '800', color: C.primary, marginTop: 4 },
  totalMacros: { fontSize: 13, color: C.textSecondary, marginTop: 6 },
  modalFooter: { flexDirection: 'row', padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: C.border },
  cancelBtn: { flex: 1, backgroundColor: C.bgCard, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: C.textSecondary },
  addBtn: { flex: 2, backgroundColor: C.primary, borderRadius: 12, padding: 14, alignItems: 'center' },
  addBtnText: { fontSize: 15, fontWeight: '700', color: C.bg },
  // Scanner
  scanOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 260, height: 160, borderWidth: 2, borderColor: C.primary, borderRadius: 12 },
  scanHint: { color: '#fff', fontSize: 14, marginTop: 20, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  scanHintRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  scanCancel: { position: 'absolute', bottom: 60, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  scanCancelText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
