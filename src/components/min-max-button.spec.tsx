import { render, act } from '@testing-library/react';
import { MinMaxButton } from './min-max-button.js';
import * as React from 'react';
import '@testing-library/jest-dom';

describe('MinMaxButton', () => {
  beforeEach(() => {
    // Create the root element before each test
    const root = document.createElement('div');
    root.setAttribute('data-workos-impersonation-root', '');
    document.body.appendChild(root);
  });

  afterEach(() => {
    // Clean up after each test
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('sets minimized value when clicked', () => {
    const { getByRole } = render(<MinMaxButton minimizedValue="1">Minimize</MinMaxButton>);

    act(() => {
      getByRole('button').click();
    });

    const root = document.querySelector('[data-workos-impersonation-root]');
    expect(root).toHaveStyle({ '--wi-minimized': '1' });
  });

  it('does nothing if root is undefined', () => {
    const { getByRole } = render(<MinMaxButton minimizedValue="1">Minimize</MinMaxButton>);

    const root = document.querySelector('[data-workos-impersonation-root]');

    // Mock querySelector to return null for this test
    jest.spyOn(document, 'querySelector').mockReturnValue(null);

    act(() => {
      getByRole('button').click();
    });

    expect(root).not.toHaveStyle({ '--wi-minimized': '1' });
  });

  it('renders children correctly', () => {
    const { getByText } = render(<MinMaxButton minimizedValue="0">Test Child</MinMaxButton>);

    expect(getByText('Test Child')).toBeInTheDocument();
  });

  it('applies correct default styling', () => {
    const { getByRole } = render(<MinMaxButton minimizedValue="0">Test</MinMaxButton>);

    const button = getByRole('button');
    expect(button).toHaveStyle({
      padding: 0,
      width: '1.714em',
    });
  });
});
