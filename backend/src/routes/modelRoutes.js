import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma, isDatabaseAvailable } from '../utils/prisma.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getFallbackMetrics() {
  const possiblePaths = [
    path.resolve(__dirname, '../../../ai-service/artifacts/evaluation_results.json'),
    path.resolve(process.cwd(), '../ai-service/artifacts/evaluation_results.json'),
    path.resolve(process.cwd(), 'ai-service/artifacts/evaluation_results.json'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        const list = JSON.parse(raw);
        const grouped = {};
        for (const m of list) {
          const modelName = m.model || m.modelName;
          if (!grouped[modelName]) {
            grouped[modelName] = {
              modelName,
              pollutant: m.pollutant || 'pm25',
              trainingPeriod: m.train_period || m.trainingPeriod || '2026-10-12 to 2026-10-19',
              testPeriod: m.test_period || m.testPeriod || '2026-10-20 to 2026-10-21',
              horizons: [],
            };
          }
          grouped[modelName].horizons.push({
            leadHours: m.lead_hours ?? m.leadHours,
            mae: m.mae,
            rmse: m.rmse,
            r2: m.r2,
          });
        }
        return { models: Object.values(grouped), count: list.length, source: 'artifacts' };
      } catch (err) {
        console.warn('[ModelRoutes] Error reading evaluation_results.json:', err.message);
      }
    }
  }
  return { models: [], count: 0 };
}

router.get('/model/metrics', async (req, res) => {
  if (isDatabaseAvailable()) {
    try {
      const metrics = await prisma.modelEvaluation.findMany({
        orderBy: [{ modelName: 'asc' }, { leadHours: 'asc' }],
      });

      if (metrics && metrics.length > 0) {
        const grouped = {};
        for (const m of metrics) {
          if (!grouped[m.modelName]) {
            grouped[m.modelName] = {
              modelName: m.modelName,
              pollutant: m.pollutant,
              trainingPeriod: m.trainingPeriod,
              testPeriod: m.testPeriod,
              horizons: [],
            };
          }
          grouped[m.modelName].horizons.push({
            leadHours: m.leadHours,
            mae: m.mae,
            rmse: m.rmse,
            r2: m.r2,
          });
        }
        return res.json({ models: Object.values(grouped), count: metrics.length, source: 'database' });
      }
    } catch {}
  }

  res.json(getFallbackMetrics());
});

export default router;
