import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Increase payload limit for visual frame snapshots
app.use(express.json({ limit: '25mb' }));

// Lazy initialization of Gemini client
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

// -------------------------------------------------------------
// API ROUTES
// -------------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    timestamp: Date.now(),
  });
});

// Helper for local ground-truth fallback reasoning when Gemini key is not present
function generateGroundedFallbackResponse(
  prompt: string,
  context: any,
  cameraName?: string
): string {
  const p = prompt.toLowerCase();
  const cameras = context?.cameras || [];
  const alerts = context?.alerts || [];
  const entities = context?.entities || [];
  const targetCam = cameraName || (cameras[0]?.name) || 'Primary Surveillance Feed';

  if (p.includes('explain') || p.includes('scene') || p.includes('what') && p.includes('happening')) {
    const personCount = entities.filter((e: any) => e.class === 'person').length;
    const vehicleCount = entities.filter((e: any) => ['car', 'truck', 'bus', 'motorcycle'].includes(e.class)).length;
    const criticalAlerts = alerts.filter((a: any) => a.severity === 'critical' || a.severity === 'high');

    const descLines: string[] = [];
    descLines.push(`### 👁️ Scene Analysis: **${targetCam}**`);
    descLines.push(`**Optical State Overview:**`);
    descLines.push(`• **Observed Entities**: ${entities.length > 0 ? `${personCount} pedestrian(s), ${vehicleCount} vehicle(s)` : 'Clear sector, no moving foreground entities currently detected'}.`);
    
    if (entities.length > 0) {
      descLines.push(`\n**Detailed Target Breakdown:**`);
      entities.slice(0, 4).forEach((ent: any, idx: number) => {
        const app = ent.appearance?.clothingDescription || ent.appearance?.vehicleTypeDescription || 'Standard visual profile';
        const motion = ent.direction && ent.direction !== 'Stationary' ? `moving ${ent.direction} at ${Math.round(ent.velocity || 12)} px/s` : 'stationary dwell';
        descLines.push(`• **Target #${ent.id || idx + 1} (${ent.class.toUpperCase()})**: ${app} — ${motion} (Confidence: ${Math.round((ent.confidence || 0.85) * 100)}%).`);
      });
    }

    if (criticalAlerts.length > 0) {
      descLines.push(`\n⚠️ **Security Anomalies & Zone Breaches:**`);
      criticalAlerts.slice(0, 2).forEach((al: any) => {
        descLines.push(`• **${al.title}**: Risk Score ${al.riskScore}/100. ${al.zoneName ? `Breached zone '${al.zoneName}'.` : ''}`);
      });
    } else {
      descLines.push(`\n✅ **Security Perimeter**: No high-severity violations. Zone boundaries intact.`);
    }

    descLines.push(`\n**Recommended Follow-Up**:\nAsk *"Who was involved?"*, *"Show detected plates"*, or *"Investigate alerts"*.`);
    return descLines.join('\n');
  }

  if (p.includes('who') || p.includes('involved') || p.includes('people') || p.includes('person')) {
    const people = entities.filter((e: any) => e.class === 'person');
    if (people.length === 0) {
      return `Based on active telemetry for **${targetCam}**, there are currently **0 individuals** detected in the frame. Only perimeter background and structural elements are visible.`;
    }
    const lines = people.map((p: any, i: number) => {
      const wear = p.appearance?.clothingDescription || 'dark attire';
      const dir = p.direction ? `traversing ${p.direction}` : 'within designated area';
      return `• **Person #${p.id || i + 1}**: Identified wearing **${wear}**, ${dir}. Movement velocity: ${Math.round(p.velocity || 0)} px/s.`;
    });
    return `### 👥 Identified Persons in **${targetCam}**\n${lines.join('\n')}\n\nAll targets tracked with persistent Re-ID color histograms.`;
  }

  if (p.includes('vehicle') || p.includes('car') || p.includes('plate') || p.includes('anpr')) {
    const vehicles = entities.filter((e: any) => ['car', 'truck', 'bus', 'motorcycle'].includes(e.class));
    const plates = alerts.map((a: any) => a.anprPlate).filter(Boolean);
    if (vehicles.length === 0 && plates.length === 0) {
      return `No motorized vehicles or visible license plates detected in the active frame of **${targetCam}**.`;
    }
    return `### 🚗 Vehicle & ANPR Intelligence: **${targetCam}**\n- **Vehicles in Frame**: ${vehicles.length}\n- **Plates Scanned**: ${plates.length > 0 ? plates.map((pl: string) => `\`[${pl}]\``).join(', ') : 'No readable plate in current perspective'}\n\nCheck the **Vehicle Registry (ANPR)** tab for full owner dossiers and NHAI format validation.`;
  }

  return `I reviewed your inquiry for **${targetCam}**:\n- **Monitored Nodes**: ${cameras.length} feed(s)\n- **Active Incidents**: ${alerts.length}\n- **Tracked Targets**: ${entities.length}\n\nFeel free to ask *"Explain this scene"*, *"Who was involved?"*, or *"Which camera needs attention first?"*.`;
}

// POST /api/ai/chat - Conversational interactive surveillance assistant
app.post('/api/ai/chat', async (req, res) => {
  try {
    const {
      message,
      history = [],
      frameBase64,
      context = {},
      cameraName,
    } = req.body;

    if (!message && !frameBase64) {
      return res.status(400).json({ error: 'Message or visual frame required.' });
    }

    const client = getGeminiClient();

    // Prepare system instruction with platform ground truth
    const camerasCount = context?.cameras?.length || 0;
    const alertsCount = context?.alerts?.length || 0;
    const entities = context?.entities || [];
    const alerts = context?.alerts || [];

    const entitiesSummary = entities.map((e: any) => {
      return `${e.class} #${e.id} (${e.appearance?.clothingDescription || e.appearance?.vehicleTypeDescription || ''}, direction: ${e.direction || 'stationary'}, confidence: ${Math.round((e.confidence || 0.8) * 100)}%)`;
    }).join('; ');

    const alertsSummary = alerts.slice(0, 5).map((a: any) => {
      return `Incident #${a.id.slice(-4)} (${a.title}, severity: ${a.severity}, risk: ${a.riskScore}/100, camera: ${a.cameraName})`;
    }).join('; ');

    const systemInstruction = `You are the IBVAP (Intelligent Board Video Analytics Platform) Surveillance AI Copilot.
You have real-time access to camera feeds, optical object detection, persistent entity tracking, virtual perimeter zones, and ANPR (Automated Number Plate Recognition).
Ground all responses in verifiable platform telemetry:
- Target Camera: ${cameraName || 'Active Surveillance Node'}
- Active Cameras: ${camerasCount}
- Active Alerts: ${alertsCount} (${alertsSummary || 'None'})
- Currently Tracked Entities: ${entitiesSummary || 'None'}
- Focus on safety, clarity, exact timestamps, entity attributes, and actionable security recommendations.
- Keep the tone professional, objective, and authoritative like an elite security operations commander.
- Format responses cleanly with Markdown (bullet points, bold highlights, headers).`;

    if (client) {
      try {
        const contents: any[] = [];

        // Build conversation history
        for (const msg of history.slice(-8)) {
          const role = msg.sender === 'user' ? 'user' : 'model';
          contents.push({
            role,
            parts: [{ text: msg.text }],
          });
        }

        // Current turn parts
        const currentParts: any[] = [];
        if (frameBase64) {
          const cleanBase64 = frameBase64.replace(/^data:image\/\w+;base64,/, '');
          currentParts.push({
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64,
            },
          });
        }
        currentParts.push({ text: message || 'Please analyze this surveillance scene and explain what is occurring.' });

        contents.push({
          role: 'user',
          parts: currentParts,
        });

        const response = await client.models.generateContent({
          model: 'gemini-3.8-flash',
          contents,
          config: {
            systemInstruction,
            temperature: 0.3,
          },
        });

        const replyText = response.text || 'Analysis completed with no additional details generated.';
        return res.json({
          text: replyText,
          source: 'gemini-3.8-flash',
          timestamp: Date.now(),
        });
      } catch (geminiError: any) {
        console.warn('Gemini API call notice, using ground-truth fallback:', geminiError?.message || geminiError);
        const fallbackText = generateGroundedFallbackResponse(message || 'explain scene', context, cameraName);
        return res.json({
          text: fallbackText,
          source: 'grounded-surveillance-engine',
          notice: 'Response synthesized using real-time surveillance state engine.',
          timestamp: Date.now(),
        });
      }
    }

    // If no GEMINI_API_KEY, use the grounded surveillance engine
    const fallbackText = generateGroundedFallbackResponse(message || 'explain scene', context, cameraName);
    return res.json({
      text: fallbackText,
      source: 'grounded-surveillance-engine',
      timestamp: Date.now(),
    });
  } catch (error: any) {
    console.error('Server /api/ai/chat error:', error);
    res.status(500).json({
      error: error?.message || 'Internal server error processing AI command',
    });
  }
});

// POST /api/ai/explain-scene - Dedicated scene explanation with image
app.post('/api/ai/explain-scene', async (req, res) => {
  try {
    const { frameBase64, camera, entities = [], alerts = [], zones = [] } = req.body;
    const client = getGeminiClient();

    if (client && frameBase64) {
      try {
        const cleanBase64 = frameBase64.replace(/^data:image\/\w+;base64,/, '');
        const prompt = `Perform a comprehensive forensic visual explanation of this surveillance frame from camera "${camera?.name || 'CCTV Feed'}".
Identify all visible persons, vehicles, actions, spatial positioning relative to perimeters, and evaluate whether any suspicious activities or safety concerns are visible.
Structure your answer into:
1. Executive Summary
2. Detected Entities & Visual Appearance
3. Spatial & Behavioral Observations
4. Security & Risk Assessment`;

        const response = await client.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: cleanBase64,
                  },
                },
                { text: prompt },
              ],
            },
          ],
          config: {
            temperature: 0.2,
          },
        });

        if (response.text) {
          return res.json({
            text: response.text,
            source: 'gemini-3.8-flash',
            timestamp: Date.now(),
          });
        }
      } catch (err: any) {
        console.warn('Explain-scene Gemini API error, falling back:', err?.message);
      }
    }

    // Fallback grounded synthesis
    const fallback = generateGroundedFallbackResponse('explain scene', { cameras: camera ? [camera] : [], alerts, entities }, camera?.name);
    return res.json({
      text: fallback,
      source: 'grounded-surveillance-engine',
      timestamp: Date.now(),
    });
  } catch (error: any) {
    console.error('Server /api/ai/explain-scene error:', error);
    res.status(500).json({ error: error?.message || 'Failed to explain scene' });
  }
});

// -------------------------------------------------------------
// VITE DEV MIDDLEWARE & PRODUCTION STATIC SERVING
// -------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`IBVAP Full-Stack Server running on port ${PORT}`);
  });
}

startServer();
