'use client';

import * as React from 'react';
import { Button } from './button.js';

interface MinMaxButtonProps {
  children?: React.ReactNode;
  minimizedValue: '0' | '1';
}

export function MinMaxButton({ children, minimizedValue }: MinMaxButtonProps) {
  return (
    <Button
      onClick={() => {
        const root = document.querySelector('[data-workos-impersonation-root]') as HTMLElement | null;
        root?.style.setProperty('--wi-minimized', minimizedValue);
      }}
      style={{ padding: 0, width: '1.714em' }}
    >
      {children}
    </Button>
  );
}
