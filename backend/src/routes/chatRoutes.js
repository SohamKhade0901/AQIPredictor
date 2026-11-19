import express from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { generateChatResponse, getChatServiceStatus } from '../services/aiChatService.js';

const router = express.Router();

// Chat endpoint rate limiting (30 requests/min)
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many chat requests. Please wait a moment before sending another message.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Zod schema for chat request validation
const chatRequestSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty').max(2000, 'Message is too long (max 2000 chars)'),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'model', 'system']),
        content: z.string().max(4000),
      })
    )
    .optional()
    .default([]),
  context: z
    .object({
      stationId: z.string().optional(),
      stationName: z.string().optional(),
      currentAQI: z.number().optional().nullable(),
      currentPM25: z.number().optional().nullable(),
      category: z.string().optional(),
      weather: z
        .object({
          temperature: z.number().optional().nullable(),
          humidity: z.number().optional().nullable(),
          windSpeed: z.number().optional().nullable(),
          blh: z.number().optional().nullable(),
        })
        .optional()
        .nullable(),
    })
    .optional()
    .default({}),
});

/**
 * GET /api/chat/status
 * Returns current AI provider status and configuration info
 */
router.get('/chat/status', (req, res) => {
  try {
    const status = getChatServiceStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve AI chat status', details: err.message });
  }
});

/**
 * POST /api/chat
 * Generates AI response with voice-friendly grounding
 */
router.post('/chat', chatLimiter, async (req, res) => {
  try {
    const parseResult = chatRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.errors.map(e => e.message),
      });
    }

    const { message, history, context } = parseResult.data;
    const response = await generateChatResponse(message, history, context);

    return res.json(response);
  } catch (err) {
    console.error('[ChatRoutes] Error handling /api/chat:', err);
    return res.status(500).json({
      error: 'An error occurred while generating the AI response.',
      details: err.message,
    });
  }
});

export default router;

