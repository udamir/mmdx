// @vitest-environment jsdom
// StatusBox (A5): loading and empty are a status region, an error an alert with Retry when the host can retry.
import { describe, expect, it, vi } from 'vitest';
import { createStatusBox } from '../../../src/ui/blocks/status-box.js';

describe('StatusBox', () => {
  it('says what is happening, and offers Retry on an error the host can retry', () => {
    const box = createStatusBox({ kind: 'loading', text: 'Loading the history…' });
    expect(box.el.querySelector('[role=status]')!.textContent).toBe('Loading the history…');
    const retry = vi.fn();
    box.update({ kind: 'error', text: 'Could not load', retryLabel: 'Retry', onRetry: retry });
    const alert = box.el.querySelector('[role=alert]')!;
    expect(alert.textContent).toContain('Could not load');
    alert.querySelector('button')!.click();
    expect(retry).toHaveBeenCalledTimes(1);
    box.update({ kind: 'error', onRetry: undefined });
    expect(box.el.querySelector('button')).toBeNull();
    box.update({ kind: null });
    expect(box.el.childElementCount).toBe(0);
    box.destroy();
  });
});
