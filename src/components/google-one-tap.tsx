'use client';

import React from 'react';

export interface GoogleOneTapProps {
  clientId: string;
  loginUri: string;
  context?: 'signin' | 'signup' | 'use';
  cancelOnTapOutside?: boolean;
}

export function GoogleOneTap({ clientId, loginUri, context = 'signin', cancelOnTapOutside = true }: GoogleOneTapProps) {
  return (
    <>
      <script async src="https://accounts.google.com/gsi/client" />
      <div
        id="g_id_onload"
        data-cancel_on_tap_outside={String(cancelOnTapOutside)}
        data-client_id={clientId}
        data-context={context}
        data-itp_support="true"
        data-login_uri={loginUri}
      />
    </>
  );
}
