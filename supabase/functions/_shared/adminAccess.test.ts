import { describe, expect, it } from 'bun:test';
import { hasAdminRole } from '../../../src/lib/adminAccess';

describe('hasAdminRole', () => {
  it('allows the admin role', () => {
    expect(hasAdminRole(['admin'])).toBe(true);
  });

  it('denies an account with no roles', () => {
    expect(hasAdminRole([])).toBe(false);
  });

  it('denies non-admin roles', () => {
    expect(hasAdminRole(['member', 'user'])).toBe(false);
  });
});
