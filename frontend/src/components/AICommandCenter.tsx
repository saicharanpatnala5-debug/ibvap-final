import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Mic,
  MicOff,
  Paperclip,
  Sparkles,
  Bot,
  User,
  Shield,
  ShieldAlert,
  Clock,
  Radio,
  TrendingUp,
  FileCheck,
  CheckCircle2,
  XCircle,
  Edit3,
  RefreshCw,
  Search,
  SlidersHorizontal,
  ChevronRight,
  Maximize2,
  Minimize2,
  Wifi,
  WifiOff,
  AlertTriangle,
  History,
  CornerDownRight,
  X,
  FileText,
  RotateCcw,
  Key,
  Eye,
  EyeOff,
  Trash2,
} from 'lucide-react';
import Markdown from 'react-markdown';
import {
  AIChatMessage,
  AIDecisionAuditEntry,
  AIRecommendation,
  AISessionMemory,
  AlertIncident,
  CameraFeedItem,
  PlateRegistryRecord,
} from '../types';
import {
  processAICommand,
  evaluateRealtimeAnomalies,
  generateExplainableRecommendation,
  generateInvestigationReport,
} from '../services/aiCommandCenter';
import { getActiveCameraFrameSnapshot } from '../services/cameraFrameRegistry';
import { entityStore } from '../services/entityStore';
import { loadStoredChatHistory, saveStoredChatHistory, loadStoredPlateRecords } from '../services/storageService';
import { ExplainableRecommendationCard } from './ExplainableRecommendationCard';
import { InvestigationReportCard } from './InvestigationReportCard';
import { AIPredictiveCard, AnomalyCard } from './AIPredictiveCard';

interface AICommandCenterProps {
  cameras: CameraFeedItem[];
  alerts: AlertIncident[];
  plateRecords?: PlateRegistryRecord[];
  onAcknowledgeAlert: (alertId: string) => void;
  onEscalateAlert: (alertId: string) => void;
  onCloseAlert: (alertId: string) => void;
  onSelectPlate?: (plate: string) => void;
  onOpenIncidentModal?: (incident: AlertIncident) => void;
  isDocked?: boolean;
  onToggleDock?: () => void;
  initialQuery?: string | null;
  onClearInitialQuery?: () => void;
}

export const AICommandCenter: React.FC<AICommandCenterProps> = ({
  cameras,
  alerts,
  plateRecords,
  onAcknowledgeAlert,
  onEscalateAlert,
  onCloseAlert,
  onSelectPlate,
  onOpenIncidentModal,
  isDocked = false,
  onToggleDock,
  initialQuery,
  onClearInitialQuery,
}) => {
  // Active Subtab inside Command Center: 'chat' | 'anomalies_predictions' | 'audit_log'
  const [activeSubTab, setActiveSubTab] = useState<'chat' | 'anomalies_predictions' | 'audit_log'>('chat');

  // Copilot connection / model status state
  const [copilotStatus, setCopilotStatus] = useState<{
    online: boolean;
    model?: string;
    reason?: string;
  }>({ online: false, reason: 'Checking copilot connection...' });

  useEffect(() => {
    let isMounted = true;
    async function fetchCopilotStatus() {
      try {
        const res = await fetch('/api/health');
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data.geminiReachable) {
            setCopilotStatus({ online: true, model: data.model });
          } else {
            const reason = data.lastErrorCode || (data.hasGeminiKey ? 'Gemini API unreachable' : 'no API key configured');
            setCopilotStatus({ online: false, reason });
          }
        }
      } catch {
        if (isMounted) {
          setCopilotStatus({ online: false, reason: 'gateway unreachable' });
        }
      }
    }
    fetchCopilotStatus();
    return () => { isMounted = false; };
  }, []);

  // In-app Gemini API Key Modal state
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [keyInputValue, setKeyInputValue] = useState('');
  const [showKeySecret, setShowKeySecret] = useState(false);
  const [rememberKey, setRememberKey] = useState(true);
  const [keyModalLoading, setKeyModalLoading] = useState(false);
  const [keyModalError, setKeyModalError] = useState<string | null>(null);

  const handleOpenKeyModal = () => {
    setKeyModalError(null);
    setKeyInputValue('');
    setIsKeyModalOpen(true);
  };

  const handleSaveKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = keyInputValue.trim();
    if (!clean) {
      setKeyModalError('Please enter a valid Gemini API key.');
      return;
    }
    setKeyModalLoading(true);
    setKeyModalError(null);
    try {
      const res = await fetch('/api/ai/set-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: clean, remember: rememberKey }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCopilotStatus({ online: true, model: data.model });
        setIsKeyModalOpen(false);
        setKeyInputValue('');
      } else {
        setKeyModalError(data.message || 'Key verification failed. Please check the key.');
      }
    } catch {
      setKeyModalError('Network error connecting to gateway.');
    } finally {
      setKeyModalLoading(false);
    }
  };

  const handleRemoveKey = async () => {
    setKeyModalLoading(true);
    setKeyModalError(null);
    try {
      const res = await fetch('/api/ai/remove-key', { method: 'POST' });
      if (res.ok) {
        setCopilotStatus({ online: false, reason: 'NO_API_KEY' });
        setIsKeyModalOpen(false);
        setKeyInputValue('');
      }
    } catch {
      setKeyModalError('Failed to remove key from gateway.');
    } finally {
      setKeyModalLoading(false);
    }
  };

  // Chat message state initialized from persistent storage
  const [messages, setMessages] = useState<AIChatMessage[]>(() => {
    const stored = loadStoredChatHistory();
    if (stored && stored.length > 0) return stored;
    return [
      {
        id: 'welcome-msg',
        sender: 'ai',
        source: 'fallback',
        reason: 'platform initialized',
        text: `**IBVAP AI Command Center is active & grounded in live surveillance state.**

I continuously analyze your registered cameras (${cameras.length} active), real-time alerts (${alerts.length} logged), virtual perimeter breaches, and ANPR license plate scans.

Ask me anything or pick a quick command to begin:`,
        timestamp: Date.now() - 10000,
      },
    ];
  });

  // Persist chat messages on update
  useEffect(() => {
    saveStoredChatHistory(messages);
  }, [messages]);

  const [inputQuery, setInputQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{
    name: string;
    type: 'image' | 'video' | 'doc';
    url: string;
  } | null>(null);

  // Network / Connectivity Status
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // AI Session Memory
  const [sessionMemory, setSessionMemory] = useState<AISessionMemory>({
    investigationCount: 0,
  });

  // Decisions Audit Log (Operator decisions on recommendations)
  const [decisionAuditLog, setDecisionAuditLog] = useState<AIDecisionAuditEntry[]>([]);

  // Speech Recognition ref
  const speechRecognitionRef = useRef<any>(null);

  // File input ref for multimodal
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat container
  const chatScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);

  // Voice Input (Web Speech API)
  const handleToggleVoice = () => {
    if (isListening) {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported on this browser. Try Chrome or Edge.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputQuery(transcript);
        }
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Voice recognition init failed:', err);
      setIsListening(false);
    }
  };

  // Multimodal file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileType = file.type.startsWith('video')
      ? 'video'
      : file.type.startsWith('image')
      ? 'image'
      : 'doc';
    const previewUrl = URL.createObjectURL(file);

    setAttachedFile({
      name: file.name,
      type: fileType,
      url: previewUrl,
    });
  };

  // Dispatch Query Execution
  const handleExecuteQuery = async (queryText: string) => {
    const text = queryText.trim();
    if (!text && !attachedFile) return;

    const userMessage: AIChatMessage = {
      id: `user-msg-${Date.now()}`,
      sender: 'user',
      text: text || `[Uploaded visual asset: ${attachedFile?.name}]`,
      timestamp: Date.now(),
      attachment: attachedFile || undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery('');
    const currentAttachment = attachedFile;
    setAttachedFile(null);
    setIsProcessing(true);

    try {
      // 1. Check for live camera frame snapshot (optical ground truth)
      const frameSnapshot = getActiveCameraFrameSnapshot(sessionMemory.focusedCameraId);
      const targetCamName = frameSnapshot?.cameraName || cameras[0]?.name || 'Primary Surveillance Feed';
      const targetCamId = frameSnapshot?.cameraId || sessionMemory.focusedCameraId || cameras[0]?.id;
      
      const lower = text.toLowerCase();
      const shouldIncludeFrame =
        currentAttachment?.type === 'image' ||
        lower.includes('scene') ||
        lower.includes('explain') ||
        lower.includes('footage') ||
        lower.includes('look') ||
        lower.includes('who') ||
        lower.includes('vehicle') ||
        lower.includes('pedestrian') ||
        lower.includes('how many') ||
        lower.includes('count') ||
        lower.includes('breakdown') ||
        lower.includes('plate') ||
        lower.includes('what');

      const frameBase64 = currentAttachment?.type === 'image'
        ? currentAttachment.url
        : shouldIncludeFrame
        ? frameSnapshot?.dataUrl
        : undefined;

      // 2. Prepare conversation history for natural conversational context & follow-ups
      const historyPayload = messages
        .filter((m) => m.id !== 'welcome-msg')
        .slice(-8)
        .map((m) => ({
          sender: m.sender,
          text: m.text,
        }));

      // 3. Prepare structured telemetry context
      const storedPlates = plateRecords || loadStoredPlateRecords();
      const allZones = cameras.flatMap((c) => c.zones || []);

      const sharedState = entityStore.getCameraState(targetCamId);
      const visibleNow = frameSnapshot?.trackedObjects || sharedState?.visibleEntitiesNow || [];
      const clipTotal = frameSnapshot?.clipTotalEntities || sharedState?.cumulativeUniqueEntities || [];
      const currentTime = frameSnapshot?.currentTime ?? sharedState?.videoTime ?? 0;

      const contextPayload = {
        cameras: cameras.map((c) => ({ id: c.id, name: c.name, status: c.status, zones: c.zones })),
        alerts: alerts.slice(0, 20),
        entities: visibleNow,
        clipTotalEntities: clipTotal,
        plates: storedPlates.slice(0, 20),
        zones: allZones,
        videoTime: currentTime,
      };

      let aiMessageText = '';
      let aiSource: 'gemini' | 'fallback' = 'fallback';
      let aiReason: string | undefined = undefined;
      let aiModel: string | undefined = undefined;

      // Call backend AI Copilot endpoint
      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            history: historyPayload,
            frameBase64,
            cameraId: targetCamId,
            cameraName: targetCamName,
            currentTime,
            context: contextPayload,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.text) {
            aiMessageText = data.text;
          }
          if (data.source === 'gemini') {
            aiSource = 'gemini';
            aiModel = data.model;
          } else {
            aiSource = 'fallback';
            aiReason = data.reason || 'local engine';
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          aiSource = 'fallback';
          aiReason = errData.reason || `server error ${res.status}`;
        }
      } catch (networkErr: any) {
        console.warn('AI endpoint network notice, utilizing grounded fallback engine:', networkErr);
        aiSource = 'fallback';
        aiReason = 'network error';
      }

      // Also compute structured action recommendations (investigation report, action dispatch)
      const localAnalysis = await processAICommand(
        text,
        {
          cameras,
          alerts,
          sessionMemory,
        },
        currentAttachment || undefined
      );

      const finalMessage: AIChatMessage = {
        id: `ai-msg-${Date.now()}`,
        sender: 'ai',
        text: aiMessageText || localAnalysis.text,
        timestamp: Date.now(),
        source: aiSource,
        reason: aiReason,
        model: aiModel,
        recommendation: localAnalysis.recommendation,
        investigationReport: localAnalysis.investigationReport,
        predictiveSignals: localAnalysis.predictiveSignals,
        referencedEntities: localAnalysis.referencedEntities,
      };

      setMessages((prev) => [...prev, finalMessage]);

      // Update session memory
      if (finalMessage.referencedEntities?.incidentIds?.[0]) {
        setSessionMemory((m) => ({
          ...m,
          focusedIncidentId: finalMessage.referencedEntities?.incidentIds?.[0],
        }));
      }
      if (finalMessage.referencedEntities?.cameraIds?.[0]) {
        setSessionMemory((m) => ({
          ...m,
          focusedCameraId: finalMessage.referencedEntities?.cameraIds?.[0],
        }));
      }
    } catch (err: any) {
      console.error('AI Command processing error:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'ai',
          text: `⚠️ **Diagnostic Notice**: Encountered an issue executing command: "${queryText}".
Reason: ${err?.message || 'Inference engine timeout or parsing mismatch'}.

**Live Grounding State:**
- Cameras Active: **${cameras.length}**
- Logged Incidents: **${alerts.length}**
- High/Critical Alerts: **${alerts.filter((a) => a.severity === 'critical' || a.severity === 'high').length}**

Try clicking one of the suggested command actions above or retry your query.`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Automatically execute pending initial query forwarded from CommandBar
  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      handleExecuteQuery(initialQuery.trim());
      onClearInitialQuery?.();
    }
  }, [initialQuery]);

  // Form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleExecuteQuery(inputQuery);
  };

  // Helper to find recommendation across messages
  const updateRecommendationState = (
    recId: string,
    updates: Partial<AIRecommendation>
  ) => {
    setMessages((prev) =>
      prev.map((msg) => {
        let updated = false;
        let newRec = msg.recommendation;
        let newReport = msg.investigationReport;

        if (msg.recommendation && msg.recommendation.id === recId) {
          newRec = { ...msg.recommendation, ...updates };
          updated = true;
        }
        if (
          msg.investigationReport &&
          msg.investigationReport.recommendation &&
          msg.investigationReport.recommendation.id === recId
        ) {
          newReport = {
            ...msg.investigationReport,
            recommendation: {
              ...msg.investigationReport.recommendation,
              ...updates,
            },
          };
          updated = true;
        }

        if (updated) {
          return {
            ...msg,
            recommendation: newRec,
            investigationReport: newReport,
          };
        }
        return msg;
      })
    );
  };

  // Human-in-the-loop decision: Accept
  const handleAcceptRecommendation = (recId: string, note?: string) => {
    // Find target recommendation
    let targetRec: AIRecommendation | undefined;
    for (const msg of messages) {
      if (msg.recommendation?.id === recId) targetRec = msg.recommendation;
      if (msg.investigationReport?.recommendation?.id === recId)
        targetRec = msg.investigationReport.recommendation;
      if (targetRec) break;
    }

    const now = Date.now();
    updateRecommendationState(recId, {
      status: 'accepted',
      decidedAt: now,
      operatorNote: note || 'Operator approved AI recommendation without modification.',
    });

    // Execute real platform action if tied to incident
    if (targetRec?.incidentId) {
      if (targetRec.actionType === 'escalate' || targetRec.actionType === 'dispatch') {
        onEscalateAlert(targetRec.incidentId);
      } else if (targetRec.actionType === 'acknowledge') {
        onAcknowledgeAlert(targetRec.incidentId);
      }
    }

    // Log to Decision Audit Log
    const auditEntry: AIDecisionAuditEntry = {
      id: `dec-${now}`,
      recommendationId: recId,
      suggestionTitle: targetRec?.title || 'Operational Recommendation',
      recommendedAction: targetRec?.recommendedAction || 'Action approved',
      decision: 'accepted',
      operator: 'Security Operator (Watch Station 1)',
      note: note || 'Confirmed and committed to field operations.',
      appliedAction: targetRec?.recommendedAction || 'Action applied',
      timestamp: now,
      sourceCamera: targetRec?.cameraName,
      sourceIncidentId: targetRec?.incidentId,
    };
    setDecisionAuditLog((prev) => [auditEntry, ...prev]);
  };

  // Human-in-the-loop decision: Modify
  const handleModifyRecommendation = (
    recId: string,
    modifiedAction: string,
    note?: string
  ) => {
    let targetRec: AIRecommendation | undefined;
    for (const msg of messages) {
      if (msg.recommendation?.id === recId) targetRec = msg.recommendation;
      if (msg.investigationReport?.recommendation?.id === recId)
        targetRec = msg.investigationReport.recommendation;
      if (targetRec) break;
    }

    const now = Date.now();
    updateRecommendationState(recId, {
      status: 'modified',
      decidedAt: now,
      modifiedAction,
      operatorNote: note || 'Operator modified the tactical directive.',
    });

    if (targetRec?.incidentId) {
      onEscalateAlert(targetRec.incidentId);
    }

    const auditEntry: AIDecisionAuditEntry = {
      id: `dec-${now}`,
      recommendationId: recId,
      suggestionTitle: targetRec?.title || 'Operational Recommendation',
      recommendedAction: targetRec?.recommendedAction || '',
      decision: 'modified',
      operator: 'Security Operator (Watch Station 1)',
      note: note || 'Tactical directive customized by human controller.',
      appliedAction: modifiedAction,
      timestamp: now,
      sourceCamera: targetRec?.cameraName,
      sourceIncidentId: targetRec?.incidentId,
    };
    setDecisionAuditLog((prev) => [auditEntry, ...prev]);
  };

  // Human-in-the-loop decision: Reject
  const handleRejectRecommendation = (recId: string, reason: string) => {
    let targetRec: AIRecommendation | undefined;
    for (const msg of messages) {
      if (msg.recommendation?.id === recId) targetRec = msg.recommendation;
      if (msg.investigationReport?.recommendation?.id === recId)
        targetRec = msg.investigationReport.recommendation;
      if (targetRec) break;
    }

    const now = Date.now();
    updateRecommendationState(recId, {
      status: 'rejected',
      decidedAt: now,
      operatorNote: `Rejected by operator: ${reason}`,
    });

    const auditEntry: AIDecisionAuditEntry = {
      id: `dec-${now}`,
      recommendationId: recId,
      suggestionTitle: targetRec?.title || 'Operational Recommendation',
      recommendedAction: targetRec?.recommendedAction || '',
      decision: 'rejected',
      operator: 'Security Operator (Watch Station 1)',
      note: `Operator rejection reason: ${reason}`,
      appliedAction: 'None (Action dismissed)',
      timestamp: now,
      sourceCamera: targetRec?.cameraName,
      sourceIncidentId: targetRec?.incidentId,
    };
    setDecisionAuditLog((prev) => [auditEntry, ...prev]);
  };

  // Real-time anomalies & predictions snapshot
  const { anomalies, predictions } = evaluateRealtimeAnomalies(cameras, alerts);

  // Quick Prompt Chips
  const promptChips = [
    { label: "👁️ Explain what's going on in the footage", query: "Explain what's going on in the footage" },
    { label: "🚗 How many vehicles & pedestrians were detected?", query: "How many vehicles and pedestrians were detected?" },
    { label: "⚠️ Why did the alert fire?", query: "Why did the alert fire?" },
    { label: "📋 Show plates read & review", query: "Show license plates read and needing review" },
    { label: "🕒 What happened at 10 seconds?", query: "What happened at 10s?" },
    { label: "📍 Which zone had security activity?", query: "Which zone had security activity?" },
    { label: "Recommend action", query: "Recommend action" },
    { label: "Show today's critical events", query: "Show me today's critical events" },
    { label: "Predictive intelligence scan", query: "Run predictive intelligence scan" },
  ];

  return (
    <div
      id="ai-command-center-container"
      className={`flex flex-col rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-100 shadow-2xl overflow-hidden ${
        isDocked ? 'h-[calc(100vh-100px)] w-full' : 'h-[calc(100vh-140px)] w-full'
      }`}
    >
      {/* 1. Header & Live Intelligence Status Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-neutral-800 bg-neutral-900/90 px-4 py-3 gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-amber-600 to-amber-400 text-neutral-950 font-bold shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                AI Command Center
              </h2>
              <span className="rounded bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-mono font-medium text-amber-400">
                Ground-Truth Intelligence
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">
              Autonomous reasoning & forensic copilot grounded in live surveillance state
            </p>
          </div>
        </div>

        {/* Live Grounding & Network Indicator (Clickable to open Key Modal) */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            id="copilot-status-badge"
            onClick={handleOpenKeyModal}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-mono font-medium border cursor-pointer hover:brightness-110 active:scale-95 transition-all shadow-xs ${
              copilotStatus.online
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300 hover:border-emerald-600'
                : 'bg-amber-950/60 border-amber-800 text-amber-300 hover:border-amber-600'
            }`}
            title={
              copilotStatus.online
                ? `Online: Connected to ${copilotStatus.model} (Click to manage key)`
                : `Offline mode: ${copilotStatus.reason} (Click to configure Gemini API key)`
            }
          >
            <span className={`h-2 w-2 rounded-full ${copilotStatus.online ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
            <span id="copilot-status-text">
              {copilotStatus.online ? `Online: ${copilotStatus.model}` : `Offline mode: ${copilotStatus.reason}`}
            </span>
            <Key className="h-3 w-3 opacity-60 ml-0.5" />
          </button>

          {onToggleDock && (
            <button
              type="button"
              onClick={onToggleDock}
              className="rounded-lg border border-neutral-800 bg-neutral-900 p-1.5 text-neutral-400 hover:text-white transition-colors"
              title={isDocked ? 'Expand to Full View' : 'Dock to Side Panel'}
            >
              {isDocked ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* 2. Sub-navigation tabs: Chat | Anomalies & Predictions | Human Decisions Audit */}
      <div className="flex items-center border-b border-neutral-800 bg-neutral-950 px-4 text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveSubTab('chat')}
          className={`flex items-center gap-1.5 border-b-2 py-2.5 px-3 transition-colors ${
            activeSubTab === 'chat'
              ? 'border-amber-400 text-amber-300 font-semibold'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Bot className="h-3.5 w-3.5" />
          Interactive Command Console
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('anomalies_predictions')}
          className={`flex items-center gap-1.5 border-b-2 py-2.5 px-3 transition-colors ${
            activeSubTab === 'anomalies_predictions'
              ? 'border-amber-400 text-amber-300 font-semibold'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          Anomalies & Predictive Intelligence
          {(anomalies.length > 0 || predictions.length > 0) && (
            <span className="rounded-full bg-indigo-950 border border-indigo-700 px-1.5 text-[10px] font-mono text-indigo-300">
              {anomalies.length + predictions.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('audit_log')}
          className={`flex items-center gap-1.5 border-b-2 py-2.5 px-3 transition-colors ${
            activeSubTab === 'audit_log'
              ? 'border-amber-400 text-amber-300 font-semibold'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <History className="h-3.5 w-3.5" />
          Human + AI Decision Log
          {decisionAuditLog.length > 0 && (
            <span className="rounded-full bg-emerald-950 border border-emerald-800 px-1.5 text-[10px] font-mono text-emerald-300">
              {decisionAuditLog.length}
            </span>
          )}
        </button>
      </div>

      {/* 3. Main Workspace Area depending on SubTab */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* SUBTAB 1: Interactive Command Console */}
        {activeSubTab === 'chat' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Quick Prompt Chips Ribbon */}
            <div className="border-b border-neutral-800/80 bg-neutral-900/40 px-4 py-2 overflow-x-auto flex items-center gap-1.5 no-scrollbar">
              <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide shrink-0 mr-1 flex items-center gap-1">
                <CornerDownRight className="h-3 w-3" /> Quick Action:
              </span>
              {promptChips.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleExecuteQuery(chip.query)}
                  className="shrink-0 rounded-full border border-neutral-800 bg-neutral-900/90 hover:bg-neutral-800 hover:border-amber-500/40 px-2.5 py-1 text-[11px] font-medium text-neutral-300 hover:text-amber-300 transition-colors whitespace-nowrap"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Conversation Feed */}
            <div
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-4 text-xs sm:text-sm"
            >
              {messages.map((msg) => {
                const isAi = msg.sender === 'ai';

                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3 ${isAi ? 'justify-start' : 'justify-end'}`}
                  >
                    {isAi && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}

                    <div
                      data-testid={`chat-bubble-${msg.sender}`}
                      className={`max-w-[88%] sm:max-w-[80%] rounded-xl p-3.5 ${
                        isAi
                          ? 'border border-neutral-800 bg-neutral-900/90 text-neutral-100 shadow-sm'
                          : 'bg-amber-500 text-neutral-950 font-medium'
                      }`}
                    >
                      {/* Attached media preview if present */}
                      {msg.attachment && (
                        <div className="mb-2 rounded-lg overflow-hidden border border-neutral-800 bg-neutral-950 p-2 text-xs">
                          <div className="flex items-center gap-2 mb-1 text-neutral-300 font-mono">
                            <Paperclip className="h-3 w-3 text-amber-400" />
                            <span>{msg.attachment.name}</span>
                          </div>
                          {msg.attachment.type === 'image' && (
                            <img
                              src={msg.attachment.url}
                              alt="Surveillance Attachment"
                              className="max-h-48 rounded object-cover"
                            />
                          )}
                        </div>
                      )}

                      {/* AI Engine & Fallback Status Badge */}
                      {isAi && (
                        <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-neutral-800/80">
                          <div className="flex items-center gap-1.5">
                            {msg.source === 'gemini' ? (
                              <span
                                className="inline-flex items-center gap-1 rounded bg-emerald-950/80 border border-emerald-700/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"
                                title={`Grounded by Gemini Multimodal API (${msg.model || 'gemini-2.5-flash'})`}
                              >
                                <Sparkles className="h-2.5 w-2.5 text-emerald-400" />
                                <span>Gemini AI {msg.model ? `(${msg.model})` : ''}</span>
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 rounded bg-amber-950/80 border border-amber-700/60 px-2 py-0.5 text-[10px] font-semibold text-amber-300"
                                title={`Grounded by Local Heuristic Engine (${msg.reason || 'telemetry'})`}
                              >
                                <Bot className="h-2.5 w-2.5 text-amber-400" />
                                <span>Local Heuristic Fallback {msg.reason ? `• ${msg.reason}` : ''}</span>
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[10px] text-neutral-500">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                      )}

                      {/* Primary Text Content */}
                      {isAi ? (
                        <div className="markdown-body text-neutral-100 text-xs sm:text-sm leading-relaxed space-y-2 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-amber-400 [&_h3]:mt-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_strong]:text-amber-300 [&_code]:bg-neutral-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-neutral-200">
                          <Markdown>{msg.text}</Markdown>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap leading-relaxed text-neutral-950 font-medium text-xs sm:text-sm">
                          {msg.text}
                        </div>
                      )}

                      {/* Structured Investigation Report Card */}
                      {msg.investigationReport && (
                        <div className="mt-3">
                          <InvestigationReportCard
                            report={msg.investigationReport}
                            onAcceptRec={handleAcceptRecommendation}
                            onModifyRec={handleModifyRecommendation}
                            onRejectRec={handleRejectRecommendation}
                            onOpenFullIncident={(incId) => {
                              const found = alerts.find((a) => a.id === incId);
                              if (found && onOpenIncidentModal) onOpenIncidentModal(found);
                            }}
                            onSelectPlate={onSelectPlate}
                          />
                        </div>
                      )}

                      {/* Standalone Explainable Recommendation Card */}
                      {!msg.investigationReport && msg.recommendation && (
                        <div className="mt-3">
                          <ExplainableRecommendationCard
                            recommendation={msg.recommendation}
                            onAccept={handleAcceptRecommendation}
                            onModify={handleModifyRecommendation}
                            onReject={handleRejectRecommendation}
                            onInvestigateIncident={(incId) => {
                              handleExecuteQuery(`Investigate incident ${incId}`);
                            }}
                          />
                        </div>
                      )}

                      {/* Predictive Signals Cards */}
                      {msg.predictiveSignals && msg.predictiveSignals.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {msg.predictiveSignals.map((pred) => (
                            <AIPredictiveCard
                              key={pred.id}
                              prediction={pred}
                              onAcceptPreemptive={(predId) => {
                                handleExecuteQuery(
                                  `Dispatching preemptive patrol to ${pred.cameraName}`
                                );
                              }}
                              onDismissPreemptive={() => {}}
                            />
                          ))}
                        </div>
                      )}

                      {/* Timestamp & Retry Action */}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div
                          className={`text-[10px] ${
                            isAi ? 'text-neutral-500' : 'text-neutral-900/80 font-mono'
                          }`}
                        >
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                        {isAi && msg.id !== 'welcome-msg' && (
                          <button
                            type="button"
                            onClick={() => {
                              const prevUserMsg = [...messages].slice(0, messages.indexOf(msg)).reverse().find((m) => m.sender === 'user');
                              if (prevUserMsg) {
                                handleExecuteQuery(prevUserMsg.text);
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded bg-neutral-800/80 hover:bg-neutral-800 border border-neutral-700/60 px-2 py-0.5 text-[10px] text-neutral-400 hover:text-amber-300 transition-colors"
                            title="Retry query"
                          >
                            <RotateCcw className="h-2.5 w-2.5" />
                            <span>Retry</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {!isAi && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-neutral-300">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Processing indicator */}
              {isProcessing && (
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-sm">
                    <Sparkles className="h-4 w-4 animate-pulse" />
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900/90 px-4 py-2.5 text-xs text-neutral-300 shadow-md flex flex-col gap-1 max-w-sm">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                      </span>
                      <span className="font-medium text-neutral-200">Surveillance Copilot Thinking</span>
                    </div>
                    <p className="text-[11px] text-neutral-400">
                      Analyzing live video frames, tracked entities, and zone telemetry...
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Input Bar & Controls */}
            <div className="border-t border-neutral-800 bg-neutral-900/90 p-3">
              {/* Attachment Preview Chip */}
              {attachedFile && (
                <div className="mb-2 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-3.5 w-3.5" />
                    <span>Attached: <strong>{attachedFile.name}</strong></span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttachedFile(null)}
                    className="text-neutral-400 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex items-center gap-2">
                {/* Multimodal Attachment Button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  id="ai-attach-file-btn"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach Surveillance Snapshot / Clip for Multi-Modal Analysis"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
                >
                  <Paperclip className="h-4 w-4" />
                </button>

                {/* Voice Input Button (Web Speech) */}
                <button
                  id="ai-voice-mic-btn"
                  type="button"
                  onClick={handleToggleVoice}
                  title={isListening ? 'Stop Listening' : 'Dictate Query via Microphone'}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    isListening
                      ? 'border-red-500 bg-red-950 text-red-400 animate-pulse'
                      : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                  }`}
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>

                {/* Text Command Field */}
                <div className="relative flex-1">
                  <input
                    id="ai-command-input"
                    type="text"
                    value={inputQuery}
                    onChange={(e) => setInputQuery(e.target.value)}
                    placeholder={
                      isListening
                        ? 'Listening to microphone...'
                        : 'Ask your data (e.g. "Show critical alerts", "Investigate event #1", "Why is camera 1 high risk?")...'
                    }
                    disabled={isProcessing}
                    className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3.5 py-2 text-xs sm:text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                {/* Submit Button */}
                <button
                  id="ai-command-submit-btn"
                  type="submit"
                  disabled={isProcessing || (!inputQuery.trim() && !attachedFile)}
                  className="flex h-9 px-3.5 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:pointer-events-none text-neutral-950 font-semibold text-xs transition-colors"
                >
                  <span>Execute</span>
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* SUBTAB 2: Anomalies & Predictive Intelligence */}
        {activeSubTab === 'anomalies_predictions' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-indigo-400" />
                Real-Time Anomaly & Predictive Intelligence Engine
              </h3>
              <p className="text-xs text-neutral-400 mt-1">
                Continuous baseline evaluation against historical patterns (time of day, object
                frequencies, and trajectory dynamics). Deviations are surfaced as explainable anomaly
                flags.
              </p>
            </div>

            {/* Predictive Intelligence Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Active Predictive Signals ({predictions.length})
                </span>
                <span className="text-[11px] text-neutral-500">Early-warning precursor detection</span>
              </div>

              {predictions.length === 0 ? (
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 text-xs text-neutral-400 text-center">
                  No active escalation precursors detected across current telemetry windows. All
                  motion streams reflect standard probability patterns.
                </div>
              ) : (
                predictions.map((p) => (
                  <AIPredictiveCard
                    key={p.id}
                    prediction={p}
                    onAcceptPreemptive={() => {
                      handleExecuteQuery(
                        `Execute preemptive dispatch to ${p.cameraName} for predicted perimeter risk`
                      );
                      setActiveSubTab('chat');
                    }}
                    onDismissPreemptive={() => {}}
                  />
                ))
              )}
            </div>

            {/* Real-time Anomalies Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Surveillance Behavioral Anomalies ({anomalies.length})
                </span>
                <span className="text-[11px] text-neutral-500">
                  Statistical deviations from camera baseline
                </span>
              </div>

              {anomalies.length === 0 ? (
                <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 text-xs text-neutral-400 text-center">
                  Zero anomalous behavioral deviations detected. All tracked subjects conform to
                  standard zone parameters.
                </div>
              ) : (
                anomalies.map((anom) => <AnomalyCard key={anom.id} anomaly={anom} />)
              )}
            </div>
          </div>
        )}

        {/* SUBTAB 3: Human + AI Decision Log (Audit & Trust Layer) */}
        {activeSubTab === 'audit_log' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                <History className="h-4 w-4 text-amber-400" />
                Human + AI Collaboration & Decision Audit Trail
              </h3>
              <p className="text-xs text-neutral-400 mt-1">
                Every AI recommendation concludes with an operator decision (Accept / Modify / Reject).
                Full tamper-evident record of AI suggestions vs. human operator determinations.
              </p>
            </div>

            {decisionAuditLog.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900/40 p-8 text-center text-neutral-400 text-xs">
                No human operator decisions logged in this session yet. When you Accept, Modify, or
                Reject an AI Recommendation, the verifiable outcome will be preserved here for audit
                inspection.
              </div>
            ) : (
              <div className="space-y-3">
                {decisionAuditLog.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-xs space-y-2 shadow-md"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        {log.decision === 'accepted' ? (
                          <span className="flex items-center gap-1 rounded bg-emerald-950 border border-emerald-800 px-2 py-0.5 text-emerald-400 font-semibold text-[11px]">
                            <CheckCircle2 className="h-3 w-3" /> ACCEPTED
                          </span>
                        ) : log.decision === 'modified' ? (
                          <span className="flex items-center gap-1 rounded bg-amber-950 border border-amber-800 px-2 py-0.5 text-amber-400 font-semibold text-[11px]">
                            <Edit3 className="h-3 w-3" /> MODIFIED
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 rounded bg-red-950 border border-red-800 px-2 py-0.5 text-red-400 font-semibold text-[11px]">
                            <XCircle className="h-3 w-3" /> REJECTED
                          </span>
                        )}
                        <strong className="text-neutral-200">{log.suggestionTitle}</strong>
                      </div>
                      <span className="font-mono text-[11px] text-neutral-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-neutral-300">
                      <div>
                        <span className="text-neutral-500">AI Suggested Action: </span>
                        <span>{log.recommendedAction}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500">Executed Resolution: </span>
                        <strong className="text-neutral-200">{log.appliedAction}</strong>
                      </div>
                    </div>

                    {log.note && (
                      <div className="rounded bg-neutral-950/60 p-2 text-[11px] text-neutral-400 border border-neutral-800/60 italic">
                        Operator Log Note: &quot;{log.note}&quot; — <span className="text-neutral-500 font-sans not-italic">{log.operator}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* In-App Gemini API Key Configuration Modal */}
      {isKeyModalOpen && (
        <div
          id="gemini-key-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <div
            id="gemini-key-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gemini-key-modal-title"
            className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-neutral-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Key className="h-5 w-5" />
                </div>
                <div>
                  <h3 id="gemini-key-modal-title" className="text-base font-bold text-neutral-100">
                    Gemini API Key Configuration
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Connect Google Gemini for live multimodal vision & streaming chat
                  </p>
                </div>
              </div>
              <button
                type="button"
                id="close-key-modal-btn"
                onClick={() => setIsKeyModalOpen(false)}
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Current Status Pill */}
            <div className="mt-4 flex items-center justify-between rounded-xl bg-neutral-950 p-3 border border-neutral-800 text-xs">
              <span className="text-neutral-400">Current Status:</span>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    copilotStatus.online ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
                  }`}
                />
                <span className={`font-mono font-medium ${copilotStatus.online ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {copilotStatus.online ? `Online (${copilotStatus.model})` : `Offline (${copilotStatus.reason || 'NO_API_KEY'})`}
                </span>
              </div>
            </div>

            <p className="mt-3 text-xs text-neutral-300 leading-relaxed">
              Create an API key at{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-amber-400 hover:underline inline-flex items-center gap-0.5"
              >
                aistudio.google.com/apikey
              </a>
              . The key is verified with a minimal probe call and held in server memory. It is never logged or exposed in browser bundles.
            </p>

            {/* Error Message if any */}
            {keyModalError && (
              <div
                id="key-error-message"
                className="mt-3 flex items-start gap-2.5 rounded-xl border border-red-800/80 bg-red-950/60 p-3 text-xs text-red-200"
              >
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span>{keyModalError}</span>
                  <button
                    type="button"
                    id="retry-key-btn"
                    onClick={() => handleSaveKey()}
                    className="ml-2 font-bold underline hover:text-white"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveKey} className="mt-4 flex flex-col gap-4">
              <div>
                <label htmlFor="gemini-api-key-input" className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Gemini API Key
                </label>
                <div className="relative">
                  <input
                    id="gemini-api-key-input"
                    type={showKeySecret ? 'text' : 'password'}
                    value={keyInputValue}
                    onChange={(e) => setKeyInputValue(e.target.value)}
                    placeholder="AIzaSy..."
                    autoFocus
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3.5 py-2.5 pr-10 text-xs font-mono text-neutral-100 placeholder-neutral-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeySecret(!showKeySecret)}
                    className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-200"
                    title={showKeySecret ? 'Hide Key' : 'Show Key'}
                  >
                    {showKeySecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="remember-key-checkbox"
                  checked={rememberKey}
                  onChange={(e) => setRememberKey(e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-700 bg-neutral-950 text-amber-500 focus:ring-amber-500"
                />
                <label htmlFor="remember-key-checkbox" className="text-xs text-neutral-400 select-none cursor-pointer">
                  Remember on this machine (saves locally to gitignored <code className="text-neutral-300">gateway/.env.local</code>)
                </label>
              </div>

              <div className="mt-2 flex items-center justify-between border-t border-neutral-800 pt-4">
                {copilotStatus.online ? (
                  <button
                    type="button"
                    id="remove-gemini-key-btn"
                    onClick={handleRemoveKey}
                    disabled={keyModalLoading}
                    className="flex items-center gap-1.5 rounded-xl border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-900/40 hover:text-red-300 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove Key</span>
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsKeyModalOpen(false)}
                    className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-xs font-semibold text-neutral-300 hover:bg-neutral-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="save-gemini-key-btn"
                    disabled={keyModalLoading || !keyInputValue.trim()}
                    className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-neutral-950 hover:bg-amber-400 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {keyModalLoading ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Save & Connect</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
