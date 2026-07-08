/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // Initialize server-side Gemini API client
  const geminiApiKey = process.env.GEMINI_API_KEY;
  let aiClient: GoogleGenAI | null = null;

  if (geminiApiKey) {
    aiClient = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }

  // AI Analysis Endpoint - Proxies requests to Gemini server-side securely
  app.post("/api/analyze", async (req, res) => {
    try {
      if (!aiClient) {
        return res.status(500).json({
          error: "Gemini API Client is not configured. Please add your GEMINI_API_KEY in Settings > Secrets."
        });
      }

      const { metrics, reportingPeriod, topCcws, bottomCcws, topLgas, bottomLgas } = req.body;

      const prompt = `
        You are an expert Monitoring & Evaluation (M&E) and Health Programme Analyst specializing in HIV/OVC (Orphans and Vulnerable Children) programme management.
        Analyze the following performance metrics from the Child Monitor Plus (CMP) programme for the reporting period: "${reportingPeriod}".
        
        Metrics:
        - Active CMP Beneficiaries (Target): ${metrics.ActiveCMP}
        - Active CALHIV (Children Active on antiretroviral therapy): ${metrics.ActiveCALHIV}
        - Active HEI (HIV-Exposed Infants): ${metrics.ActiveHEI}
        - CALHIV Served (Served in period): ${metrics.CALHIVServed}
        - HEI Served (Served in period): ${metrics.HEIServed}
        - Total Served in Period: ${metrics.TotalServed}
        - Outstanding (Not served): ${metrics.Outstanding}
        - Overall Programme Coverage: ${metrics.Coverage.toFixed(2)}%

        Top Performing CCWs (Community Case Workers):
        ${JSON.stringify(topCcws)}

        Bottom Performing CCWs (Needs urgent attention):
        ${JSON.stringify(bottomCcws)}

        Top Performing LGAs:
        ${JSON.stringify(topLgas)}

        Bottom Performing LGAs:
        ${JSON.stringify(bottomLgas)}

        Generate a comprehensive, professional enterprise-grade analysis in JSON format, strictly following the provided schema. Do not use markdown wrappers like \`\`\`json inside your response content. Provide direct raw JSON.
      `;

      const response = await aiClient.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are a professional clinical and health program evaluation system. Write highly precise, data-driven assessments without fluff or generic advice.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              executiveSummary: {
                type: Type.STRING,
                description: "Executive summary of the HIV/OVC program performance in the specified period."
              },
              majorFindings: {
                type: Type.STRING,
                description: "Key analytical observations from the disaggregated CALHIV and HEI indicators."
              },
              performanceAnalysis: {
                type: Type.OBJECT,
                properties: {
                  highPerformingCCWs: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "List of top-performing CCWs with quick rationale."
                  },
                  lowPerformingCCWs: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "List of under-performing CCWs requiring urgent follow-up."
                  },
                  highPerformingLGAs: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "List of top-performing LGAs with comments."
                  },
                  lowPerformingLGAs: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "List of under-performing LGAs with comments."
                  }
                },
                required: ["highPerformingCCWs", "lowPerformingCCWs", "highPerformingLGAs", "lowPerformingLGAs"]
              },
              outstandingFollowUp: {
                type: Type.STRING,
                description: "Specific details on how to trace and address the outstanding children not served."
              },
              communitiesIntervention: {
                type: Type.STRING,
                description: "Detailed evaluation of communities that require immediate clinical or social intervention."
              },
              recommendations: {
                type: Type.STRING,
                description: "Actionable, concrete recommendations for Program Managers to improve coverage."
              },
              conclusion: {
                type: Type.STRING,
                description: "Overall M&E conclusion on program progress."
              }
            },
            required: [
              "executiveSummary",
              "majorFindings",
              "performanceAnalysis",
              "outstandingFollowUp",
              "communitiesIntervention",
              "recommendations",
              "conclusion"
            ]
          }
        }
      });

      const responseText = response.text || "{}";
      const cleanedJson = responseText.trim();
      
      res.json(JSON.parse(cleanedJson));
    } catch (error: any) {
      console.error("AI Analysis failed:", error);
      res.status(500).json({ error: error.message || "An error occurred during AI analysis." });
    }
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", time: new Date().toISOString() });
  });

  // Vite Integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[CAPRS Server] running on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start CAPRS server:", err);
});
