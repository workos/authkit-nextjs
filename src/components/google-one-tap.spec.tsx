import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import React from 'react';
import { GoogleOneTap } from './google-one-tap.js';

describe('GoogleOneTap', () => {
  it('renders the Google Identity Services configuration', () => {
    const { container } = render(
      <GoogleOneTap
        clientId="google-client-id"
        loginUri="https://example.com/auth/google-one-tap"
        context="signup"
        cancelOnTapOutside={false}
      />,
    );

    expect(document.querySelector('script')).toHaveAttribute('src', 'https://accounts.google.com/gsi/client');
    expect(container.querySelector('#g_id_onload')).toHaveAttribute('data-client_id', 'google-client-id');
    expect(container.querySelector('#g_id_onload')).toHaveAttribute(
      'data-login_uri',
      'https://example.com/auth/google-one-tap',
    );
    expect(container.querySelector('#g_id_onload')).toHaveAttribute('data-context', 'signup');
    expect(container.querySelector('#g_id_onload')).toHaveAttribute('data-cancel_on_tap_outside', 'false');
  });
});
