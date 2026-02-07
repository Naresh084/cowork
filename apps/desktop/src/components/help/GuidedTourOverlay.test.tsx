import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { GuidedTourOverlay } from './GuidedTourOverlay';
import { useHelpStore } from '@/stores/help-store';

describe('GuidedTourOverlay', () => {
  beforeEach(() => {
    useHelpStore.setState({
      isHelpOpen: false,
      activeArticleId: 'platform-overview',
      activeTourId: null,
      activeTourStepIndex: 0,
      completedTours: {},
      tourVersion: 1,
    });
    document.body.innerHTML = '';
  });

  it('supports next, back, and skip controls', async () => {
    document.body.innerHTML = `
      <div data-tour-id=\"sidebar-root\" style=\"width:120px;height:40px;\"></div>
      <div data-tour-id=\"session-header-root\" style=\"width:120px;height:40px;\"></div>
      <div data-tour-id=\"chat-input-area\" style=\"width:120px;height:40px;\"></div>
    `;

    render(<GuidedTourOverlay />);

    act(() => {
      useHelpStore.getState().startTour('workspace', true);
    });

    expect(await screen.findByText('Sidebar Navigation')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Session Controls')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Sidebar Navigation')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => {
      expect(useHelpStore.getState().activeTourId).toBeNull();
    });
  });

  it('auto-skips missing targets', async () => {
    document.body.innerHTML = `
      <div data-tour-id=\"onboarding-provider-block\" style=\"width:120px;height:40px;\"></div>
    `;

    render(<GuidedTourOverlay />);

    act(() => {
      useHelpStore.getState().startTour('onboarding', true);
    });

    await waitFor(() => {
      expect(useHelpStore.getState().activeTourStepIndex).toBe(1);
    }, { timeout: 2000 });

    expect(await screen.findByText('Provider and Key')).toBeInTheDocument();
  });

  it('replays a completed tour from the beginning', async () => {
    document.body.innerHTML = `
      <div data-tour-id=\"sidebar-root\" style=\"width:120px;height:40px;\"></div>
      <div data-tour-id=\"session-header-root\" style=\"width:120px;height:40px;\"></div>
      <div data-tour-id=\"chat-input-area\" style=\"width:120px;height:40px;\"></div>
    `;

    render(<GuidedTourOverlay />);

    act(() => {
      useHelpStore.getState().startTour('workspace', true);
      useHelpStore.getState().setTourStep(2);
    });

    expect(await screen.findByText('Input and Attachments')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => {
      expect(useHelpStore.getState().completedTours.workspace).toBe(true);
      expect(useHelpStore.getState().activeTourId).toBeNull();
    });

    act(() => {
      useHelpStore.getState().startTour('workspace', true);
    });

    expect(await screen.findByText('Sidebar Navigation')).toBeInTheDocument();
  });
});
