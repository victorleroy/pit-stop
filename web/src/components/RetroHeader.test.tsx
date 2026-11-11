// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {RetroHeader} from '@/components/RetroHeader';

const renderHeader = ({
  canZoom = true,
  dice,
  templateName,
  zoom = 1,
}: {canZoom?: boolean; dice?: React.ReactNode; templateName?: string; zoom?: number} = {}) => {
  const onZoomChange = vi.fn();
  render(
    <MemoryRouter>
      <RetroHeader
        canZoom={canZoom}
        dice={dice}
        onZoomChange={onZoomChange}
        presence={<span>Live</span>}
        teamId="team-1"
        templateName={templateName}
        title="Sprint 42"
        zoom={zoom}
      />
    </MemoryRouter>,
  );
  return onZoomChange;
};

describe('RetroHeader', () => {
  afterEach(cleanup);

  it('puts the way back, the title and the zoom in one band, in that order', () => {
    renderHeader();

    const band = screen.getByRole('banner');
    const back = screen.getByRole('link', {name: 'Back to the team'});
    const title = screen.getByRole('heading', {name: 'Sprint 42'});
    const zoom = screen.getByRole('group', {name: 'Zoom'});

    expect(back.getAttribute('href')).toBe('/teams/team-1');
    for (const element of [back, title, zoom]) expect(band.contains(element)).toBe(true);
    expect(back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(title.compareDocumentPosition(zoom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('carries the dice between the title and the zoom', () => {
    renderHeader({dice: <div aria-label="Speaking order" role="group" />});

    const dice = screen.getByRole('group', {name: 'Speaking order'});

    expect(screen.getByRole('banner').contains(dice)).toBe(true);
    expect(
      screen.getByRole('heading', {name: 'Sprint 42'}).compareDocumentPosition(dice) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      dice.compareDocumentPosition(screen.getByRole('group', {name: 'Zoom'})) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('steps and resets the zoom', () => {
    const onZoomChange = renderHeader({zoom: 1.2});

    fireEvent.click(screen.getByRole('button', {name: 'Zoom in'}));
    fireEvent.click(screen.getByRole('button', {name: 'Zoom out'}));
    fireEvent.click(screen.getByRole('button', {name: 'Reset the zoom'}));

    expect(onZoomChange.mock.calls).toEqual([[1.3], [1.1], [1]]);
  });

  it('leaves the zoom out on a board without columns', () => {
    renderHeader({canZoom: false});

    expect(screen.queryByRole('group', {name: 'Zoom'})).toBeNull();
    expect(screen.getByRole('heading', {name: 'Sprint 42'})).toBeTruthy();
  });

  it('names the template the retro was created from, when there is one', () => {
    renderHeader({templateName: 'Sailboat'});

    expect(screen.getByText('From template: Sailboat')).toBeTruthy();
  });

  it('says nothing about a template when the retro has none', () => {
    renderHeader();

    expect(screen.queryByText(/From template/)).toBeNull();
  });
});
