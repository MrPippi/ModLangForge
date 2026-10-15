import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './TranslatorApp';
import { t } from './i18n/zh-TW';

describe('App', () => {
  it('renders title and drop zone hint after loading', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: t.app.title })).toBeInTheDocument();
    expect(await screen.findByText(t.dropzone.hint)).toBeInTheDocument();
  });
});
