import { vi } from 'vitest';

export const AuthAPI = {
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  getCurrentUser: vi.fn(),
};