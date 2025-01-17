'use client';

import * as React from 'react';
import { Button } from './button.js';
import { MinMaxButton } from './min-max-button.js';
import { getOrganizationAction, handleSignOutAction } from '../actions.js';
import type { Organization } from '@workos-inc/node';
import { useAuth } from './authkit-provider.js';

interface ImpersonationProps extends React.ComponentPropsWithoutRef<'div'> {
  side?: 'top' | 'bottom';
}

export function Impersonation({ side = 'bottom', ...props }: ImpersonationProps) {
  const { user, impersonator, organizationId, loading } = useAuth();

  const [organization, setOrganization] = React.useState<Organization | null>(null);

  React.useEffect(() => {
    if (!organizationId) return;
    getOrganizationAction(organizationId).then(setOrganization);
  }, [organizationId]);

  if (loading || !impersonator || !user) return null;

  return (
    <div
      {...props}
      data-workos-impersonation-root=""
      style={{
        'position': 'fixed',
        'inset': 0,
        'pointerEvents': 'none',
        'zIndex': 9999,

        // short properties with defaults for authoring convenience
        '--wi-minimized': '0',
        '--wi-s': 'min(max(var(--workos-impersonation-size, 4px), 2px), 15px)',
        '--wi-bgc': 'var(--workos-impersonation-background-color, #fce654)',
        '--wi-c': 'var(--workos-impersonation-color, #1a1600)',
        '--wi-bc': 'var(--workos-impersonation-border-color, #e0c36c)',
        '--wi-bw': 'var(--workos-impersonation-border-width, 1px)',

        ...props.style,
      }}
    >
      <div
        style={{
          '--wi-frame-size': 'calc(var(--wi-s) * (1 - var(--wi-minimized)) + var(--wi-minimized) * var(--wi-bw) * -1)',
          'position': 'absolute',
          'inset': 'calc(var(--wi-frame-size) * -1)',
          'borderRadius': 'calc(var(--wi-frame-size) * 3)',
          'boxShadow': `
						inset 0 0 0 calc(var(--wi-frame-size) * 2) var(--wi-bgc),
						inset 0 0 0 calc(var(--wi-frame-size) * 2 + var(--wi-bw)) var(--wi-bc)
					`,
          'transition': 'all 500ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',

          position: 'fixed',
          left: 0,
          right: 0,
          ...(side === 'top' && { top: 'var(--wi-s)' }),
          ...(side === 'bottom' && { bottom: 'var(--wi-s)' }),

          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",
          fontSize: 'calc(12px + var(--wi-s) * 0.5)',
          lineHeight: '1.4',
        }}
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            await handleSignOutAction();
          }}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            paddingLeft: 'var(--wi-s)',
            paddingRight: 'var(--wi-s)',

            position: 'relative',
            marginLeft: 'calc(var(--wi-s) * 2)',
            marginRight: 'calc(var(--wi-s) * 2)',

            pointerEvents: 'auto',
            backgroundColor: 'var(--wi-bgc)',
            borderStyle: 'solid',
            borderColor: 'var(--wi-bc)',
            borderLeftWidth: 'var(--wi-bw)',
            borderRightWidth: 'var(--wi-bw)',

            transition: 'all 500ms cubic-bezier(0.16, 1, 0.3, 1)',
            transform: `translateX(calc(var(--wi-minimized) * (var(--wi-s) * 10 - 5%)))`,
            opacity: 'calc(1 - var(--wi-minimized))',
            zIndex: 'calc(1 - var(--wi-minimized))',

            ...(side === 'top' && {
              paddingTop: 0,
              paddingBottom: 'var(--wi-s)',
              borderTopWidth: 0,
              borderBottomWidth: 'var(--wi-bw)',
              borderBottomLeftRadius: 'var(--wi-s)',
              borderBottomRightRadius: 'var(--wi-s)',
            }),

            ...(side === 'bottom' && {
              paddingTop: 'var(--wi-s)',
              paddingBottom: 0,
              borderTopWidth: 'var(--wi-bw)',
              borderBottomWidth: 0,
              borderTopLeftRadius: 'var(--wi-s)',
              borderTopRightRadius: 'var(--wi-s)',
            }),
          }}
        >
          <p style={{ all: 'unset', color: 'var(--wi-c)', textWrap: 'balance', marginLeft: 'var(--wi-s)' }}>
            You are impersonating <b>{user.email}</b>{' '}
            {organization !== null && (
              <>
                within the <b>{organization.name}</b> organization
              </>
            )}
          </p>
          <Button type="submit" style={{ marginLeft: 'calc(var(--wi-s) * 2)', marginRight: 'var(--wi-s)' }}>
            Stop
          </Button>
          <MinMaxButton minimizedValue="1">{side === 'top' ? '↗' : '↘'}</MinMaxButton>
        </form>

        <div
          style={{
            padding: 'var(--wi-s)',

            position: 'fixed',
            right: 'var(--wi-s)',

            pointerEvents: 'auto',
            backgroundColor: 'var(--wi-bgc)',
            border: 'var(--wi-bw) solid var(--wi-bc)',
            borderRadius: 'var(--wi-s)',

            transition: 'all 500ms cubic-bezier(0.16, 1, 0.3, 1)',
            transform: 'translateX(calc((1 - var(--wi-minimized)) * var(--wi-s) * -5))',
            opacity: 'var(--wi-minimized)',
            zIndex: 'var(--wi-minimized)',

            ...(side === 'top' && { top: 'var(--wi-s)' }),
            ...(side === 'bottom' && { bottom: 'var(--wi-s)' }),
          }}
        >
          <MinMaxButton minimizedValue="0">{side === 'top' ? '↙' : '↖'}</MinMaxButton>
        </div>
      </div>
    </div>
  );
}
