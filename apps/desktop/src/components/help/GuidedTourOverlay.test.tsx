// Copyright (c) 2026 Naresh. All rights reserved.
// Licensed under the MIT License. See LICENSE file for details.

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
      tourVersion: 2,
    });
    document.body.innerHTML = '';
  });

  it('supports next, back, and skip controls', async () => {
    document.body.innerHTML = `
      <div data-tour-id=\"sidebar-root\" style=\"width:120px;height:40px;\"></div>
      <div data-tour-id=\"sidebar-automations-button\" style=\"width:120px;height:40px;\"></div>
      <div data-tour-id=\"session-header-root\" style=\"width:120px;height:40px;\"></div>
      <div data-tour-id=\"session-execution-mode-plan\" style=\"width:120px;height:40px;\"></div>
      <div data-tour-id=\"chat-input-area\" style=\"width:120px;height:40px;\"></div>
    `;

    render(<GuidedTourOverlay />);

    act(() => {
      useHelpStore.getState().startTour('workspace', true);
    });

    expect(await screen.findByText('Sidebar Navigation')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Automations')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Sidebar Navigation')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => {
      expect(useHelpStore.getState().activeTourId).toBeNull();
    });
  });

  it('auto-skips missing targets', async () => {
    document.body.innerHTML = `
      <div data-tour-id=\"settings-tab-provider\" style=\"width:120px;height:40px;\"></div>
    `;

    render(<GuidedTourOverlay />);

    act(() => {
      useHelpStore.getState().startTour('settings', true);
    });

    await waitFor(() => {
      expect(useHelpStore.getState().activeTourStepIndex).toBe(1);
    }, { timeout: 2000 });

    expect(await screen.findByText('Provider Tab')).toBeInTheDocument();
  });

  it('replays a completed tour from the beginning', async () => {
    document.body.innerHTML = `
      <div data-tour-id=\"sidebar-root\" style=\"width:120px;height:40px;\"></div>
      <div data-tour-id=\"sidebar-automations-button\" style=\"width:120px;height:40px;\"></div>
      <div data-tour-id=\"session-header-root\" style=\"width:120px;height:40px;\"></div>
      <div data-tour-id=\"session-execution-mode-plan\" style=\"width:120px;height:40px;\"></div>
      <div data-tour-id=\"chat-input-area\" style=\"width:120px;height:40px;\"></div>
    `;

    render(<GuidedTourOverlay />);

    act(() => {
      useHelpStore.getState().startTour('workspace', true);
      useHelpStore.getState().setTourStep(4);
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
