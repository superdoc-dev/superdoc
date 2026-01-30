/**
 * Tests for ImeHandler
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ImeHandler } from '../src/ime-handler';

describe('ImeHandler', () => {
  let handler: ImeHandler;

  beforeEach(() => {
    handler = new ImeHandler();
  });

  const createCompositionEvent = (data: string): CompositionEvent => ({ data }) as CompositionEvent;

  describe('onCompositionStart', () => {
    it('should activate IME state', () => {
      handler.onCompositionStart(createCompositionEvent('a'));

      expect(handler.isActive()).toBe(true);
      expect(handler.shouldDeferLayout()).toBe(true);
    });

    it('should set composition text', () => {
      handler.onCompositionStart(createCompositionEvent('test'));

      expect(handler.getCompositionText()).toBe('test');
    });
  });

  describe('onCompositionUpdate', () => {
    it('should update composition text', () => {
      handler.onCompositionStart(createCompositionEvent('a'));
      handler.onCompositionUpdate(createCompositionEvent('ab'));

      expect(handler.getCompositionText()).toBe('ab');
      expect(handler.isActive()).toBe(true);
    });
  });

  describe('onCompositionEnd', () => {
    it('should deactivate IME state', () => {
      handler.onCompositionStart(createCompositionEvent('test'));
      handler.onCompositionEnd(createCompositionEvent('test'));

      expect(handler.isActive()).toBe(false);
      expect(handler.shouldDeferLayout()).toBe(false);
    });
  });

  describe('getState', () => {
    it('should return full state', () => {
      const state = handler.getState();

      expect(state).toHaveProperty('active');
      expect(state).toHaveProperty('text');
      expect(state).toHaveProperty('start');
      expect(state).toHaveProperty('end');
    });
  });

  describe('reset', () => {
    it('should reset state', () => {
      handler.onCompositionStart(createCompositionEvent('test'));
      handler.reset();

      expect(handler.isActive()).toBe(false);
      expect(handler.getCompositionText()).toBe('');
    });
  });
});
