import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import app from '../src/app.js';

describe('AI Chatbot API Tests', () => {
  it('GET /api/chat/status should return status and provider information', async () => {
    const res = await request(app).get('/api/chat/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('activeProvider');
    expect(res.body).toHaveProperty('supportedProviders');
    expect(Array.isArray(res.body.supportedProviders)).toBe(true);
    expect(res.body.supportedProviders).toContain('gemini');
  });

  it('POST /api/chat with empty message should return 400 validation error', async () => {
    const res = await request(app).post('/api/chat').send({ message: '' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('POST /api/chat without body should return 400 validation error', async () => {
    const res = await request(app).post('/api/chat').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('POST /api/chat with atmospheric inversion query should explain PBL collapse', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({
        message: 'Why is air pollution worse at night in Delhi?',
        history: [],
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('reply');
    expect(res.body.reply.toLowerCase()).toContain('boundary layer');
  });

  describe('Strict Intent-Based Query Tests', () => {
    it('1. Current AQI query returns only current reading and no future forecasts', async () => {
      const res = await request(app)
        .post('/api/chat')
        .send({
          message: 'What is the current AQI in Anand Vihar?',
          history: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('CURRENT_AQI');
      const text = res.body.reply;
      expect(text).toContain('Anand Vihar');
      expect(text).toContain('Current AQI');
      expect(text).toContain('Measurement Timestamp');
      // Must not append upcoming forecasts
      expect(text).not.toContain('Upcoming Multi-Horizon');
      expect(text).not.toContain('24-Hour Forecast');
      expect(text).not.toContain('48-Hour Forecast');
      expect(text).not.toContain('72-Hour Forecast');
    });

    it('2. 24-hour forecast query returns only 24h prediction and no current AQI or other horizons', async () => {
      const res = await request(app)
        .post('/api/chat')
        .send({
          message: 'What will the AQI in Anand Vihar be after 24 hours?',
          history: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('FORECAST_24H');
      const text = res.body.reply;
      expect(text).toContain('Anand Vihar');
      expect(text).toContain('Predicted AQI after 24 Hours');
      expect(text).toContain('Forecast Target Time');
      // Must not include current AQI or 48h/72h
      expect(text).not.toContain('Current AQI:');
      expect(text).not.toContain('48-Hour Forecast');
      expect(text).not.toContain('72-Hour Forecast');
    });

    it('3. 48-hour forecast query returns only 48h prediction', async () => {
      const res = await request(app)
        .post('/api/chat')
        .send({
          message: 'Predict AQI for ITO after 48 hours.',
          history: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('FORECAST_48H');
      const text = res.body.reply;
      expect(text).toContain('ITO');
      expect(text).toContain('Predicted AQI after 48 Hours');
      expect(text).toContain('Forecast Target Time');
      expect(text).not.toContain('Current AQI:');
      expect(text).not.toContain('24-Hour Forecast');
      expect(text).not.toContain('72-Hour Forecast');
    });

    it('4. 72-hour forecast query returns only 72h prediction', async () => {
      const res = await request(app)
        .post('/api/chat')
        .send({
          message: 'What will the AQI in Rohini be after 72 hours?',
          history: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('FORECAST_72H');
      const text = res.body.reply;
      expect(text).toContain('Rohini');
      expect(text).toContain('Predicted AQI after 72 Hours');
      expect(text).not.toContain('Current AQI:');
      expect(text).not.toContain('24-Hour Forecast');
      expect(text).not.toContain('48-Hour Forecast');
    });

    it('5. Multi-horizon query returns exactly the two requested horizons', async () => {
      const res = await request(app)
        .post('/api/chat')
        .send({
          message: 'Current AQI and 24h forecast in Gurugram',
          history: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('MULTI_HORIZON');
      const text = res.body.reply;
      expect(text).toContain('Gurugram Sector 51');
      expect(text).toContain('Current Observed Telemetry');
      expect(text).toContain('Predicted AQI after 24 Hours');
      // 48h and 72h must be omitted
      expect(text).not.toContain('48 Hours:');
      expect(text).not.toContain('72 Hours:');
    });

    it('6. Station comparison query returns only the requested comparison', async () => {
      const res = await request(app)
        .post('/api/chat')
        .send({
          message: 'Compare 24h AQI in Anand Vihar and Punjabi Bagh',
          history: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('COMPARE_AQI');
      const text = res.body.reply;
      expect(text).toContain('Anand Vihar');
      expect(text).toContain('Punjabi Bagh');
      expect(text).toContain('24 Hours Air Quality Comparison');
      expect(text).not.toContain('Current Air Quality Comparison');
    });

    it('7. Follow-up query maintains previous station from history context', async () => {
      const res = await request(app)
        .post('/api/chat')
        .send({
          message: 'What about after 48 hours?',
          history: [
            { role: 'user', content: 'What is the current AQI in Anand Vihar?' },
            { role: 'assistant', content: 'Current AQI in Anand Vihar is 274.' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('FORECAST_48H');
      const text = res.body.reply;
      expect(text).toContain('Anand Vihar');
      expect(text).toContain('Predicted AQI after 48 Hours');
      expect(text).not.toContain('Current AQI:');
    });

    it('8. Ambiguous/missing station query asks for clarification', async () => {
      const res = await request(app)
        .post('/api/chat')
        .send({
          message: 'What is the current AQI?',
          history: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('STATION_CLARIFICATION');
      const text = res.body.reply;
      expect(text).toContain('Which monitoring station or area in Delhi NCR');
      expect(text).toContain('Anand Vihar');
      expect(text).toContain('Punjabi Bagh');
    });
  });
});
