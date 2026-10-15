import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import { t } from './i18n/zh-TW';

describe('App', () => {
  it('renders title and drop zone hint', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: t.app.title })).toBeInTheDocument();
    expect(screen.getByText(t.dropzone.hint)).toBeInTheDocument();
  });
});
