import { describe, it, expect } from '@jest/globals';
import {
  formatInIST,
  formatTimeOnlyIST,
  validateObservationFreshness,
  getLatestStationObservation,
} from '../src/utils/freshnessValidator.js';

describe('Freshness Validator and IST Formatting Utility', () => {
  describe('formatInIST and formatTimeOnlyIST', () => {
    it('should format UTC timestamp into Asia/Kolkata timezone', () => {
      // 2026-11-02T04:30:00.000Z is 10:00 AM IST (+5:30)
      const utcIso = '2026-11-02T04:30:00.000Z';
      const formatted = formatInIST(utcIso);
      expect(formatted).toContain('IST');
      expect(formatted).toContain('10:00 AM');
    });

    it('should format time only into Asia/Kolkata format', () => {
      const utcIso = '2026-11-02T07:15:00.000Z'; // 12:45 PM IST
      const timeStr = formatTimeOnlyIST(utcIso);
      expect(timeStr).toBe('12:45 PM IST');
    });

    it('should handle invalid or null timestamps gracefully', () => {
      expect(formatInIST(null)).toBeNull();
      expect(formatInIST('invalid-date')).toBeNull();
      expect(formatTimeOnlyIST(null)).toBeNull();
    });
  });

  describe('validateObservationFreshness', () => {
    it('should classify null observation as unavailable', () => {
      const result = validateObservationFreshness(null, 120);
      expect(result.status).toBe('unavailable');
      expect(result.isUnavailable).toBe(true);
      expect(result.isFresh).toBe(false);
      expect(result.isStale).toBe(false);
      expect(result.freshnessLabel).toBe('Unavailable');
    });

    it('should classify recent observation (e.g. 30 mins ago) as fresh', () => {
      const recentDate = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const observation = {
        value: 145.2,
        timestamp: recentDate,
        unit: 'µg/m³',
      };

      const result = validateObservationFreshness(observation, 120);
      expect(result.status).toBe('fresh');
      expect(result.isFresh).toBe(true);
      expect(result.isStale).toBe(false);
      expect(result.isUnavailable).toBe(false);
      expect(result.freshnessLabel).toBe('Live / Fresh');
      expect(result.staleWarning).toBeNull();
      expect(result.measurementTimeIST).toContain('IST');
    });

    it('should classify observation beyond threshold (e.g. 180 mins ago) as stale', () => {
      const staleDate = new Date(Date.now() - 180 * 60 * 1000).toISOString();
      const observation = {
        value: 165.0,
        timestamp: staleDate,
        unit: 'µg/m³',
      };

      const result = validateObservationFreshness(observation, 120);
      expect(result.status).toBe('stale');
      expect(result.isStale).toBe(true);
      expect(result.isFresh).toBe(false);
      expect(result.isUnavailable).toBe(false);
      expect(result.freshnessLabel).toBe('Stale Data');
      expect(result.staleWarning).toContain('Last observed');
      expect(result.staleWarning).toContain('ago');
      expect(result.ageMinutes).toBeGreaterThanOrEqual(179);
    });

    it('should classify observation older than 48 hours as unavailable', () => {
      const oldDate = new Date(Date.now() - 50 * 3600 * 1000).toISOString();
      const observation = {
        value: 120.0,
        timestamp: oldDate,
        unit: 'µg/m³',
      };

      const result = validateObservationFreshness(observation, 120);
      expect(result.status).toBe('unavailable');
      expect(result.isUnavailable).toBe(true);
      expect(result.isFresh).toBe(false);
      expect(result.isStale).toBe(false);
      expect(result.staleWarning).toContain('exceeds 48h limit');
    });
  });

  describe('getLatestStationObservation', () => {
    it('should resolve Anand Vihar station and return valid observation structure', async () => {
      const obs = await getLatestStationObservation('anand-vihar', { forceRefresh: false });
      expect(obs).not.toBeNull();
      expect(['235', 'anand-vihar']).toContain(obs.stationId);
      expect(obs.stationName).toBe('Anand Vihar');
      expect(obs).toHaveProperty('freshness');
      expect(['fresh', 'stale', 'unavailable']).toContain(obs.freshness.status);
      expect(obs).toHaveProperty('currentAqi');
      expect(obs).toHaveProperty('currentCategory');
      expect(obs).toHaveProperty('source');
      if (obs.timestamp) {
        expect(obs.measurementTimeIST).toContain('IST');
      }
    }, 15000);

    it('should return unavailable for unknown station identifier', async () => {
      const obs = await getLatestStationObservation('non-existent-station-999');
      expect(obs).not.toBeNull();
      expect(obs.freshness.status).toBe('unavailable');
      expect(obs.value).toBeNull();
      expect(obs.currentAqi).toBeNull();
      expect(obs.hasData).toBe(false);
    });
  });
});
