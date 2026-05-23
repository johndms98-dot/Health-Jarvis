import { useEffect, useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, KeyboardAvoidingView,
  Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useHealthStore } from '../../src/store/healthStore';
import { useHealthData } from '../../src/hooks/useHealthData';
import { generateInsights } from '../../src/services/LLMService';
import { getDailyBrief, fetchBriefAiText, getDeepInsights, DailyBrief, DeepInsight } from '../../src/services/AIOptimizationService';
import { sendChatMessage, ChatMessage } from '../../src/services/ChatService';
import { loadGoals, saveGoals } from '../../src/services/GoalsService';
import { HealthGoals, DEFAULT_GOALS } from '../../src/models/Goals';
import { C } from '../../constants/Theme';

// ── Recovery score display ────────────────────────────────────────────────────
function RecoveryRing({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? '#34d399' : score >= 45 ? '#fbbf24' : '#f87171';
  return (
    <View style={s.recoveryRing}>
      <Text style={[s.recoveryScore, { color }]}>{Math.round(score)}</Text>
      <Text style={s.recoveryLabel}>Recovery Score</Text>
      <View style={[s.recoveryBadge, { backgroundColor: color + '22' }]}>
        <Text style={[s.recoveryStatus, { color }]}>{label.charAt(0).toUpperCase() + label.slice(1)}</Text>
      </View>
    </View>
  );
}

// ── Daily target row ──────────────────────────────────────────────────────────
function TargetRow({ icon, label, value, color = '#94a3b8' }: {
  icon: string; label: string; value: string; color?: string;
}) {
  return (
    <View style={s.targetRow}>
      <Ionicons name={icon as any} size={16} color={color} />
      <Text style={s.targetLabel}>{label}</Text>
      <Text style={[s.targetValue, { color }]}>{value}</Text>
    </View>
  );
}

export default function InsightsScreen() {
  const { snapshots, latestInsight, setInsight, cachedBrief, cachedBriefDate, cachedBriefAiText, setCachedBrief, setCachedBriefAiText } = useHealthStore();
  const { refresh } = useHealthData();
  const [goals, setGoals] = useState<HealthGoals>(DEFAULT_GOALS);
  const [brief, setBrief] = useState<DailyBrief | null>(cachedBrief);
  const [deepResult, setDeepResult] = useState<DeepInsight | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [loadingAiText, setLoadingAiText] = useState(false);
  const [loadingDeep, setLoadingDeep] = useState(false);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => { loadGoals().then(setGoals); }, []);

  // Auto-load brief when screen opens — pure local calc, no Gemini
  useEffect(() => {
    if (snapshots.length > 0) loadBrief();
  }, [snapshots.length]);

  async function onRefresh() {
    setRefreshing(true);
    const currentGoals = await loadGoals();
    setGoals(currentGoals);
    await refresh();
    loadBrief(true); // force recompute on manual refresh
    setRefreshing(false);
  }

  async function ensureSnapshots(): Promise<typeof snapshots> {
    let current = useHealthStore.getState().snapshots;
    if (current.length === 0) {
      try { await refresh(); current = useHealthStore.getState().snapshots; } catch {}
    }
    return current;
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  function loadBrief(forceRefresh = false) {
    const current = useHealthStore.getState().snapshots;
    if (current.length === 0) return;
    // Use cached brief if already computed today (unless forced)
    if (!forceRefresh && cachedBriefDate === todayStr && cachedBrief) {
      setBrief({ ...cachedBrief, aiText: cachedBriefAiText ?? undefined });
      return;
    }
    loadGoals().then(currentGoals => {
      setGoals(currentGoals);
      const result = getDailyBrief(current[0], current, currentGoals);
      const withAi = { ...result, aiText: cachedBriefAiText ?? undefined };
      setBrief(withAi);
      setCachedBrief(result, todayStr);
    });
  }

  async function loadAiText() {
    const current = useHealthStore.getState().snapshots;
    if (!brief || current.length === 0) return;
    // Already fetched AI text today — don't burn another quota slot
    if (cachedBriefAiText && cachedBriefDate === todayStr) {
      setBrief(prev => prev ? { ...prev, aiText: cachedBriefAiText } : prev);
      return;
    }
    setLoadingAiText(true);
    setError(null);
    try {
      const currentGoals = await loadGoals();
      const text = await fetchBriefAiText(current[0], current, currentGoals, brief);
      setCachedBriefAiText(text);
      setBrief(prev => prev ? { ...prev, aiText: text } : prev);
    } catch (err: any) {
      setError(err.message ?? 'AI commentary unavailable');
    }
    setLoadingAiText(false);
  }

  async function runDeepAnalysis() {
    const current = await ensureSnapshots();
    if (current.length === 0) { setError('No health data available. Pull down to refresh.'); return; }

    setLoadingDeep(true);
    setLoadingStep('Running deep analysis with Gemini AI…');
    setError(null);
    try {
      const currentGoals = await loadGoals();
      const result = await getDeepInsights(current, currentGoals);
      setDeepResult(result);
    } catch (err: any) {
      setError(err.message ?? 'Deep analysis failed');
    }
    setLoadingDeep(false);
    setLoadingStep('');
  }

  async function runWeeklyInsights() {
    const current = await ensureSnapshots();
    if (current.length === 0) { setError('No health data available.'); return; }

    setLoadingInsight(true);
    setError(null);
    try {
      const currentGoals = await loadGoals();
      const insight = await generateInsights(current, currentGoals);
      setInsight(insight);
    } catch (err: any) {
      setError(err.message ?? 'Failed to generate insights');
    }
    setLoadingInsight(false);
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const userMsg: ChatMessage = { role: 'user', content: text };
    const updated = [...chatMessages, userMsg];
    setChatMessages(updated);
    setChatInput('');
    setChatLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const currentGoals = await loadGoals();
      const res = await sendChatMessage(updated, snapshots, currentGoals, brief);
      const assistantMsg: ChatMessage = { role: 'assistant', content: res.reply };
      setChatMessages(prev => [...prev, assistantMsg]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

      // Handle AI-requested actions
      if (res.action?.type === 'update_goal') {
        const { field, value } = res.action;
        Alert.alert(
          'Apply change?',
          `Set ${field} to ${value}?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Apply',
              onPress: async () => {
                try {
                  const current = await loadGoals();
                  const updated = { ...current, [field]: value };
                  await saveGoals(updated);
                  setGoals(updated);
                  const confirmMsg: ChatMessage = { role: 'assistant', content: `✓ Done — ${field} updated to ${value}.` };
                  setChatMessages(prev => [...prev, confirmMsg]);
                } catch {
                  const errMsg: ChatMessage = { role: 'assistant', content: "Sorry, I couldn't save that change. Please update it manually in Goals." };
                  setChatMessages(prev => [...prev, errMsg]);
                }
              },
            },
          ],
        );
      }
    } catch (err: any) {
      const errMsg: ChatMessage = { role: 'assistant', content: `Sorry, something went wrong: ${err.message ?? 'unknown error'}` };
      setChatMessages(prev => [...prev, errMsg]);
    }
    setChatLoading(false);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView
      ref={scrollRef}
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#34d399" />}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.headerRow}>
        <View>
          <Text style={s.title}>AI Insights</Text>
          <Text style={s.subtitle}>Powered by Gemini 2.0 Flash</Text>
        </View>
        <TouchableOpacity style={s.goalsBtn} onPress={() => router.push('/goals')}>
          <Ionicons name="trophy-outline" size={13} color="#fbbf24" />
          <Text style={s.goalsBtnText}>Goals</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={s.errorCard}>
          <Ionicons name="warning" size={15} color={C.danger} />
          <Text style={s.errorText}> {error}</Text>
        </View>
      )}

      {/* ── Morning Brief ─────────────────────────────────────────────────── */}
      <View style={s.section}>
        <View style={s.sectionHeaderRow}>
          <Ionicons name="sunny-outline" size={16} color="#fbbf24" />
          <Text style={s.sectionTitle}>  Today's Brief</Text>
          <TouchableOpacity
            onPress={loadAiText}
            disabled={loadingAiText}
            style={[s.aiTextBtn, (cachedBriefAiText && cachedBriefDate === todayStr) && s.aiTextBtnDone]}
          >
            {loadingAiText
              ? <ActivityIndicator size="small" color={C.primary} />
              : <><Ionicons name="sparkles" size={13} color={cachedBriefAiText && cachedBriefDate === todayStr ? '#475569' : '#34d399'} />
                 <Text style={[s.aiTextBtnLabel, (cachedBriefAiText && cachedBriefDate === todayStr) && { color: '#475569' }]}>
                   {cachedBriefAiText && cachedBriefDate === todayStr ? 'AI done' : 'Ask AI'}
                 </Text></>
            }
          </TouchableOpacity>
        </View>

        {brief ? (
          <>
            <RecoveryRing score={brief.recoveryScore} label={brief.recoveryLabel} />
            <View style={s.targetsBox}>
              <TargetRow icon="flame-outline"   label="Calories"   value={`${brief.calorieTarget} kcal`}  color={C.danger} />
              <TargetRow icon="barbell-outline" label="Protein"    value={`${brief.proteinTarget}g`}      color={C.primary} />
              <TargetRow icon="walk-outline"    label="Steps"      value={brief.stepTarget.toLocaleString()} color="#60a5fa" />
              <TargetRow icon="moon-outline"    label="Sleep"      value={`${goals.sleepHours ?? 8}h goal`} color="#a78bfa" />
              <TargetRow icon="water-outline"   label="Water"      value={`${brief.waterTarget} cups`}    color="#38bdf8" />
            </View>
            <View style={s.workoutBox}>
              <Text style={s.workoutLabel}>Workout · {brief.workoutRecommendation.toUpperCase()}</Text>
              <Text style={s.workoutText}>{brief.workoutReason}</Text>
            </View>
            {brief.aiText ? (
              <View style={s.aiMessageBox}>
                <Ionicons name="sparkles" size={14} color={C.primary} />
                <Text style={s.aiMessageText}>{brief.aiText}</Text>
              </View>
            ) : null}
            {brief.headline ? (
              <Text style={s.headlineText}>{brief.headline}</Text>
            ) : null}
          </>
        ) : (
          <View style={s.loadingBox}>
            <ActivityIndicator color={C.primary} />
            <Text style={s.loadingText}>Loading health data…</Text>
          </View>
        )}
      </View>

      {/* ── 7-Day Weekly Insights ─────────────────────────────────────────── */}
      <View style={s.section}>
        <View style={s.sectionHeaderRow}>
          <Ionicons name="analytics-outline" size={16} color="#60a5fa" />
          <Text style={s.sectionTitle}>  7-Day Analysis</Text>
        </View>
        <Text style={s.sectionDesc}>What patterns emerged this week and what to adjust.</Text>

        <TouchableOpacity
          style={[s.btn, loadingInsight && s.btnDisabled]}
          onPress={runWeeklyInsights}
          disabled={loadingInsight}
        >
          {loadingInsight
            ? <ActivityIndicator color={C.bg} size="small" />
            : <><Ionicons name="sparkles" size={15} color={C.bg} /><Text style={s.btnText}> Analyze This Week</Text></>}
        </TouchableOpacity>

        {latestInsight && (
          <View style={s.insightCard}>
            <Text style={s.insightMeta}>
              Based on {latestInsight.basedOnDays} days · {new Date(latestInsight.generatedAt).toLocaleDateString()}
            </Text>
            <Text style={s.insightText}>{latestInsight.text}</Text>
            <View style={s.modelBadge}>
              <Ionicons name="hardware-chip-outline" size={11} color={C.textMuted} />
              <Text style={s.modelText}> Gemini 2.0 Flash · cloud AI</Text>
            </View>
          </View>
        )}
      </View>

      {/* ── Deep Analysis ─────────────────────────────────────────────────── */}
      <View style={s.section}>
        <View style={s.sectionHeaderRow}>
          <Ionicons name="telescope-outline" size={16} color="#a78bfa" />
          <Text style={s.sectionTitle}>  Deep Analysis</Text>
        </View>
        <Text style={s.sectionDesc}>
          30-90 days of data. Finds correlations, hidden patterns, and concrete actions — your personal health expert.
        </Text>

        <TouchableOpacity
          style={[s.btn, s.btnPurple, loadingDeep && s.btnDisabled]}
          onPress={runDeepAnalysis}
          disabled={loadingDeep}
        >
          {loadingDeep
            ? <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={[s.btnText, { color: '#fff', marginLeft: 8 }]}>{loadingStep || 'Analyzing…'}</Text>
              </>
            : <><Ionicons name="telescope-outline" size={15} color="#fff" /><Text style={[s.btnText, { color: '#fff' }]}> Deep Dive</Text></>}
        </TouchableOpacity>

        {deepResult && (
          <View style={s.deepCard}>
            {deepResult.headline ? (
              <Text style={s.deepHeadline}>{deepResult.headline}</Text>
            ) : null}
            {deepResult.findings && deepResult.findings.length > 0 && (
              <View style={s.deepSection}>
                <Text style={s.deepSectionTitle}>Key Findings</Text>
                {deepResult.findings.map((f, i) => (
                  <View key={i} style={s.deepItem}>
                    <View style={s.deepBullet} />
                    <Text style={s.deepItemText}>{f}</Text>
                  </View>
                ))}
              </View>
            )}
            {deepResult.patterns && deepResult.patterns.length > 0 && (
              <View style={s.deepSection}>
                <Text style={s.deepSectionTitle}>Patterns</Text>
                {deepResult.patterns.map((p, i) => (
                  <View key={i} style={s.deepItem}>
                    <Ionicons name="trending-up-outline" size={14} color="#a78bfa" style={{ marginTop: 2 }} />
                    <Text style={s.deepItemText}>{p}</Text>
                  </View>
                ))}
              </View>
            )}
            {deepResult.actions && deepResult.actions.length > 0 && (
              <View style={s.deepSection}>
                <Text style={s.deepSectionTitle}>Actions to Take</Text>
                {deepResult.actions.map((a, i) => (
                  <View key={i} style={s.deepItem}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={C.primary} style={{ marginTop: 2 }} />
                    <Text style={s.deepItemText}>{a}</Text>
                  </View>
                ))}
              </View>
            )}
            {deepResult.raw && !deepResult.findings?.length && (
              <Text style={s.insightText}>{deepResult.raw}</Text>
            )}
            <View style={s.modelBadge}>
              <Ionicons name="hardware-chip-outline" size={11} color={C.textMuted} />
              <Text style={s.modelText}> Gemini 2.0 Flash · {snapshots.length} days analyzed</Text>
            </View>
          </View>
        )}
      </View>

      {/* ── Ask the AI ────────────────────────────────────────────────────── */}
      <View style={s.section}>
        <View style={s.sectionHeaderRow}>
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={C.primary} />
          <Text style={s.sectionTitle}>  Ask the AI</Text>
          {chatMessages.length > 0 && (
            <TouchableOpacity onPress={() => setChatMessages([])} style={{ marginLeft: 'auto' }}>
              <Text style={{ fontSize: 12, color: '#475569' }}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={s.sectionDesc}>
          Ask why conclusions were made, explore your data, or say "set my step goal to 12,000" to take action.
        </Text>

        {chatMessages.length === 0 && (
          <View style={s.chatSuggestions}>
            {[
              'Why is my recovery score low?',
              "What's driving my weight trend?",
              'Set my protein goal to 180g',
            ].map(q => (
              <TouchableOpacity key={q} style={s.suggestionChip} onPress={() => { setChatInput(q); }}>
                <Text style={s.suggestionText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {chatMessages.map((msg, i) => (
          <View key={i} style={[s.chatBubble, msg.role === 'user' ? s.chatBubbleUser : s.chatBubbleAI]}>
            {msg.role === 'assistant' && (
              <Ionicons name="sparkles" size={12} color={C.primary} style={{ marginBottom: 4 }} />
            )}
            <Text style={[s.chatBubbleText, msg.role === 'user' && s.chatBubbleTextUser]}>
              {msg.content}
            </Text>
          </View>
        ))}

        {chatLoading && (
          <View style={[s.chatBubble, s.chatBubbleAI]}>
            <ActivityIndicator size="small" color={C.primary} />
          </View>
        )}
      </View>
    </ScrollView>

    {/* Pinned chat input */}
    <View style={s.chatInputBar}>
      <TextInput
        style={s.chatInput}
        value={chatInput}
        onChangeText={setChatInput}
        placeholder="Ask anything about your health data…"
        placeholderTextColor="#475569"
        multiline
        maxLength={500}
        returnKeyType="send"
        onSubmitEditing={sendChat}
      />
      <TouchableOpacity
        style={[s.chatSendBtn, (!chatInput.trim() || chatLoading) && s.chatSendBtnDisabled]}
        onPress={sendChat}
        disabled={!chatInput.trim() || chatLoading}
      >
        <Ionicons name="send" size={18} color={chatInput.trim() && !chatLoading ? '#0f172a' : '#475569'} />
      </TouchableOpacity>
    </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingTop: 60, paddingBottom: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '700', color: C.textBright, marginBottom: 2 },
  subtitle: { fontSize: 13, color: C.textTertiary },
  goalsBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.bgCard, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: C.border },
  goalsBtnText: { fontSize: 12, color: C.warning, fontWeight: '600' },
  errorCard: { backgroundColor: C.bgCard, borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, borderLeftWidth: 3, borderLeftColor: C.danger, borderWidth: 1, borderColor: C.border },
  errorText: { fontSize: 13, color: C.danger, flex: 1 },
  section: { backgroundColor: C.bgCard, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.border },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.textBright },
  sectionDesc: { fontSize: 13, color: C.textTertiary, marginBottom: 14, lineHeight: 18 },
  recoveryRing: { alignItems: 'center', paddingVertical: 16 },
  recoveryScore: { fontSize: 64, fontWeight: '800' },
  recoveryLabel: { fontSize: 13, color: C.textTertiary, marginTop: 4 },
  recoveryBadge: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  recoveryStatus: { fontSize: 13, fontWeight: '700' },
  targetsBox: { backgroundColor: C.bgInset, borderRadius: 10, padding: 12, marginBottom: 12, gap: 10 },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  targetLabel: { fontSize: 14, color: C.textSecondary, flex: 1 },
  targetValue: { fontSize: 14, fontWeight: '700' },
  workoutBox: { backgroundColor: C.bgInset, borderRadius: 10, padding: 12, marginBottom: 12 },
  workoutLabel: { fontSize: 11, fontWeight: '700', color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  workoutText: { fontSize: 14, color: C.textDefault, lineHeight: 20 },
  aiMessageBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  aiMessageText: { fontSize: 14, color: C.textSecondary, flex: 1, lineHeight: 20 },
  headlineText: { fontSize: 12, color: C.textMuted, marginTop: 8, textAlign: 'center' },
  emptyBrief: { alignItems: 'center', gap: 10, paddingVertical: 30 },
  emptyBriefText: { fontSize: 14, color: C.textMuted },
  aiTextBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto', backgroundColor: C.bgInset, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  aiTextBtnDone: { opacity: 0.5 },
  aiTextBtnLabel: { fontSize: 12, fontWeight: '600', color: C.primary },
  loadingBox: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  loadingText: { fontSize: 13, color: C.textTertiary },
  btn: { backgroundColor: C.primary, borderRadius: 10, padding: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 14 },
  btnPurple: { backgroundColor: '#7c3aed' },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 15, fontWeight: '700', color: C.bg },
  insightCard: { backgroundColor: C.bgInset, borderRadius: 10, padding: 14 },
  insightMeta: { fontSize: 11, color: C.textMuted, marginBottom: 10, fontWeight: '600' },
  insightText: { fontSize: 14, color: C.textDefault, lineHeight: 24 },
  modelBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  modelText: { fontSize: 11, color: C.textMuted },
  deepCard: { backgroundColor: C.bgInset, borderRadius: 10, padding: 14 },
  deepHeadline: { fontSize: 14, fontWeight: '700', color: C.textBright, marginBottom: 14 },
  deepSection: { marginBottom: 16 },
  deepSectionTitle: { fontSize: 12, fontWeight: '700', color: C.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  deepItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  deepBullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.weight, marginTop: 6 },
  deepItemText: { fontSize: 14, color: C.textDefault, flex: 1, lineHeight: 20 },
  // Chat
  chatSuggestions: { gap: 8, marginBottom: 4 },
  suggestionChip: { backgroundColor: C.bgInset, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start' },
  suggestionText: { fontSize: 13, color: C.textTertiary },
  chatBubble: { borderRadius: 14, padding: 12, marginBottom: 8, maxWidth: '90%' },
  chatBubbleUser: { backgroundColor: '#1d4ed8', alignSelf: 'flex-end' },
  chatBubbleAI: { backgroundColor: C.bgInset, alignSelf: 'flex-start' },
  chatBubbleText: { fontSize: 14, color: C.textDefault, lineHeight: 20 },
  chatBubbleTextUser: { color: '#fff' },
  chatInputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, paddingBottom: 28, backgroundColor: C.bgCard, borderTopWidth: 1, borderTopColor: C.border },
  chatInput: { flex: 1, backgroundColor: C.bgInset, borderRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, fontSize: 14, color: C.textBright, maxHeight: 100 },
  chatSendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  chatSendBtnDisabled: { backgroundColor: C.bgCard },
});
