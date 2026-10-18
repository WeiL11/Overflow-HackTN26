import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import FoodQueryDetails from './FoodQueryDetails';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('displays keywords without exposing the background LLM payload', () => {
  const query = { schema_version: 1, task: 'food_donation_follow_up', messages: [{ role: 'user', content: 'observations' }] };
  render(<FoodQueryDetails analysis={{ keywords: ['apple', 'bag'], llm_query: query }} />);
  expect(screen.getByText('apple')).toBeInTheDocument();
  expect(screen.queryByText('LLM query payload')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Copy LLM query' })).not.toBeInTheDocument();
});
it('keeps older listings without keywords working', () => {
  const { container } = render(<FoodQueryDetails analysis={{ description: 'Old analysis' }} />);
  expect(container).toBeEmptyDOMElement();
});
