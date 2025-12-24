// Tests commented out
/*
import { describe, it, expect, jest } from '@jest/globals';
import { sendResponse, admin, getMongoId, validateObjectIdOrThrow, getShippingCost } from '../utils/helper.js';
import mongoose from 'mongoose';

describe('Helper Functions', () => {
  describe('sendResponse', () => {
    it('should send a successful response for 2xx status codes', () => {
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      sendResponse(mockRes, 200, 'Success', { data: 'test' });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Success',
        data: { data: 'test' }
      });
    });

    it('should send an error response for non-2xx status codes', () => {
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      sendResponse(mockRes, 400, 'Bad Request', null);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Bad Request',
        data: null
      });
    });
  });

  describe('getMongoId', () => {
    it('should return a valid ObjectId for a valid string', () => {
      const validId = new mongoose.Types.ObjectId().toString();
      const result = getMongoId(validId);
      expect(result).toBeInstanceOf(mongoose.Types.ObjectId);
    });

    it('should return null for invalid ID', () => {
      const result = getMongoId('invalid-id');
      expect(result).toBeNull();
    });

    it('should return null for null or undefined', () => {
      expect(getMongoId(null)).toBeNull();
      expect(getMongoId(undefined)).toBeNull();
    });
  });

  describe('validateObjectIdOrThrow', () => {
    it('should not throw for valid ObjectId', () => {
      const validId = new mongoose.Types.ObjectId().toString();
      expect(() => validateObjectIdOrThrow(validId)).not.toThrow();
    });

    it('should throw error for invalid ObjectId', () => {
      expect(() => validateObjectIdOrThrow('invalid-id')).toThrow();
      expect(() => validateObjectIdOrThrow('invalid-id')).toThrow('Invalid ID');
    });

    it('should use custom param name in error message', () => {
      expect(() => validateObjectIdOrThrow('invalid', 'ProductID')).toThrow('Invalid ProductID');
    });
  });

  describe('getShippingCost', () => {
    it('should return 0 for zero or negative amount', () => {
      expect(getShippingCost('ground', 0)).toBe(0);
      expect(getShippingCost('ground', -10)).toBe(0);
    });

    it('should calculate ground shipping correctly', () => {
      expect(getShippingCost('ground', 30)).toBe(10);
      expect(getShippingCost('ground', 100)).toBe(20);
      expect(getShippingCost('ground', 300)).toBe(30);
      expect(getShippingCost('ground', 600)).toBe(40); // 30 + 1*10
      expect(getShippingCost('UPS Ground', 600)).toBe(40);
    });

    it('should calculate overnight shipping correctly', () => {
      expect(getShippingCost('overnight', 30)).toBe(20);
      expect(getShippingCost('overnight', 100)).toBe(30);
      expect(getShippingCost('overnight', 300)).toBe(40);
      expect(getShippingCost('overnight', 600)).toBe(55); // 40 + 1*15
    });

    it('should return 0 for unknown shipping method', () => {
      expect(getShippingCost('unknown', 100)).toBe(0);
      expect(getShippingCost(null, 100)).toBe(0);
    });

    it('should handle case-insensitive shipping methods', () => {
      expect(getShippingCost('GROUND', 100)).toBe(20);
      expect(getShippingCost('Ground', 100)).toBe(20);
      expect(getShippingCost('  ground  ', 100)).toBe(20);
    });
  });
});
*/
