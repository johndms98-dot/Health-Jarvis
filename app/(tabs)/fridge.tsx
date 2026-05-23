import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  FridgeItem,
  getFridgeItems,
  addFridgeItem,
  deleteFridgeItem,
  clearFridgeItems,
} from '../../src/services/SupabaseService';
import { useHealthStore } from '../../src/store/healthStore';
import { C } from '../../constants/Theme';

export default function FridgeScreen() {
  const [items, setItems] = useState<FridgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  const nameRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setItems(await getFridgeItems());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const item = await addFridgeItem({ name: trimmed, quantity: qty.trim() || undefined, unit: unit.trim() || undefined });
    if (item) {
      setItems(prev => [item, ...prev]);
      setName(''); setQty(''); setUnit('');
      nameRef.current?.focus();
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Remove', 'Remove this item from your fridge?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await deleteFridgeItem(id);
        setItems(prev => prev.filter(i => i.id !== id));
      }},
    ]);
  };

  const handleClear = () => {
    Alert.alert('Clear fridge', 'Remove all items?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: async () => {
        await clearFridgeItems();
        setItems([]);
      }},
    ]);
  };

  const handleSendToMealPlanner = () => {
    const ingredients = items.map(i => {
      const parts = [i.name];
      if (i.quantity) parts.unshift(i.quantity + (i.unit ? i.unit : ''));
      return parts.join(' ');
    });
    useHealthStore.getState().setFridgeIngredients(ingredients);
    router.push('/(tabs)/meals');
  };

  const QUICK_UNITS = ['g', 'kg', 'oz', 'lb', 'cup', 'ml', 'L', 'pcs'];

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>Fridge</Text>
          <Text style={s.subtitle}>{items.length} item{items.length !== 1 ? 's' : ''} stocked</Text>
        </View>
        {items.length > 0 && (
          <TouchableOpacity onPress={handleClear} style={s.clearBtn}>
            <Ionicons name="trash-outline" size={16} color={C.danger} />
            <Text style={s.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Add item row */}
      <View style={s.addCard}>
        <Text style={s.addLabel}>Add ingredient</Text>
        <View style={s.addRow}>
          <TextInput
            ref={nameRef}
            style={[s.input, { flex: 2 }]}
            placeholder="e.g. chicken breast"
            placeholderTextColor="#475569"
            value={name}
            onChangeText={setName}
            returnKeyType="next"
            autoCorrect={false}
            autoCapitalize="none"
          />
          <TextInput
            style={[s.input, { width: 56, textAlign: 'center' }]}
            placeholder="Qty"
            placeholderTextColor="#475569"
            value={qty}
            onChangeText={setQty}
            keyboardType="decimal-pad"
            returnKeyType="next"
          />
          <TextInput
            style={[s.input, { width: 56, textAlign: 'center' }]}
            placeholder="Unit"
            placeholderTextColor="#475569"
            value={unit}
            onChangeText={setUnit}
            returnKeyType="done"
            onSubmitEditing={handleAdd}
            autoCapitalize="none"
          />
          <TouchableOpacity style={s.addBtn} onPress={handleAdd}>
            <Ionicons name="add" size={22} color={C.bg} />
          </TouchableOpacity>
        </View>
        {/* Quick unit chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          {QUICK_UNITS.map(u => (
            <TouchableOpacity
              key={u}
              style={[s.unitChip, unit === u && s.unitChipActive]}
              onPress={() => setUnit(u === unit ? '' : u)}
            >
              <Text style={[s.unitChipText, unit === u && s.unitChipTextActive]}>{u}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Item list */}
      {loading ? (
        <Text style={s.emptyText}>Loading...</Text>
      ) : items.length === 0 ? (
        <View style={s.emptyState}>
          <Ionicons name="cube-outline" size={48} color={C.textFaint} />
          <Text style={s.emptyTitle}>Fridge is empty</Text>
          <Text style={s.emptyText}>Add what you have on hand above. Then send it all to the Meal Planner with one tap.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id ?? i.name}
          contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
          renderItem={({ item }) => (
            <View style={s.itemRow}>
              <Ionicons name="ellipse" size={8} color={C.primary} style={{ marginTop: 4 }} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.itemName}>{item.name}</Text>
                {(item.quantity || item.unit) && (
                  <Text style={s.itemQty}>{[item.quantity, item.unit].filter(Boolean).join(' ')}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => handleDelete(item.id!)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close-circle" size={20} color={C.textFaint} />
              </TouchableOpacity>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: C.border }} />}
        />
      )}

      {/* Send to Meal Planner CTA */}
      {items.length > 0 && (
        <View style={s.ctaBar}>
          <TouchableOpacity style={s.ctaBtn} onPress={handleSendToMealPlanner}>
            <Ionicons name="restaurant-outline" size={18} color={C.bg} />
            <Text style={s.ctaBtnText}>Send to Meal Planner</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: '800', color: C.textBright },
  subtitle: { fontSize: 13, color: C.textTertiary, marginTop: 2 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: C.bgCard, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  clearBtnText: { color: C.danger, fontSize: 13, fontWeight: '600' },

  addCard: { backgroundColor: C.bgCard, borderRadius: 16, margin: 16, marginTop: 0, padding: 16, borderWidth: 1, borderColor: C.border },
  addLabel: { fontSize: 12, color: C.textTertiary, fontWeight: '600', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { backgroundColor: C.bgInset, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: C.textBright, fontSize: 15 },
  addBtn: { backgroundColor: C.primary, borderRadius: 10, padding: 11, alignItems: 'center', justifyContent: 'center' },
  unitChip: { paddingHorizontal: 12, paddingVertical: 5, backgroundColor: C.bgInset, borderRadius: 20, marginRight: 6 },
  unitChipActive: { backgroundColor: C.primary },
  unitChipText: { color: C.textTertiary, fontSize: 12, fontWeight: '600' },
  unitChipTextActive: { color: C.bg },

  itemRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 4 },
  itemName: { fontSize: 15, color: C.textBright, fontWeight: '500' },
  itemQty: { fontSize: 12, color: C.textTertiary, marginTop: 2 },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.textBright, marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 14, color: C.textTertiary, textAlign: 'center', lineHeight: 20 },

  ctaBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 34, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border },
  ctaBtn: { backgroundColor: C.primary, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaBtnText: { color: C.bg, fontSize: 16, fontWeight: '700' },
});
