// @vitest-environment jsdom
import {cleanup, render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AppLayout} from '@/components/AppLayout';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn(),
    user: {email: 'ada@example.com', id: 'u1', name: 'Ada Lovelace', orgId: 'o1'},
  }),
}));

describe('AppLayout', () => {
  afterEach(cleanup);

  it('links the avatar and the name of the header to the profile', () => {
    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', {name: 'My profile'});

    expect(link.getAttribute('href')).toBe('/profile');
    expect(link.textContent).toContain('AL');
    expect(link.textContent).toContain('Ada Lovelace');
  });
});
