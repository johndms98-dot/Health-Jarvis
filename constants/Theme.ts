import { StyleSheet } from 'react-native';

// ── Jarvis Dark palette ──────────────────────────────────────────────────────
// Cyan-on-deep-navy — matches the "Health Jarvis" identity

export const C = {
  // Backgrounds
  bg:           '#060b18',
  bgCard:       '#0f1729',
  bgElevated:   '#182039',
  bgInset:      '#0a1020',
  // Borders
  border:       '#1a2744',
  borderLight:  '#243352',
  // Primary — Jarvis cyan
  primary:      '#06b6d4',
  primaryLight: '#22d3ee',
  primaryDim:   '#0891b2',
  primaryGlow:  '#06b6d418',
  // Semantic
  success:      '#10b981',
  warning:      '#f59e0b',
  danger:       '#ef4444',
  // Category
  movement:     '#3b82f6',
  sleep:        '#8b5cf6',
  heart:        '#ef4444',
  nutrition:    '#10b981',
  energy:       '#f59e0b',
  weight:       '#a78bfa',
  // Text
  textBright:   '#f1f5f9',
  textDefault:  '#e2e8f0',
  textSecondary:'#94a3b8',
  textTertiary: '#64748b',
  textMuted:    '#475569',
  textFaint:    '#334155',
} as const;

export const common = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingTop: 60, paddingBottom: 40 },
  card: { backgroundColor: C.bgCard, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardAccent: { borderTopWidth: 2, borderTopColor: C.primary },
  title: { fontSize: 26, fontWeight: '700', color: C.textBright },
  subtitle: { fontSize: 13, color: C.textTertiary },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: C.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.8, marginBottom: 8, marginTop: 12 },
  bar: { height: 5, backgroundColor: C.bgElevated, borderRadius: 3, overflow: 'hidden' as const },
  barFill: { height: 5, borderRadius: 3 },
  btnPrimary: { backgroundColor: C.primary, borderRadius: 12, padding: 14, alignItems: 'center' as const, flexDirection: 'row' as const, justifyContent: 'center' as const, gap: 6 },
  btnText: { fontSize: 15, fontWeight: '700', color: C.bg },
});
