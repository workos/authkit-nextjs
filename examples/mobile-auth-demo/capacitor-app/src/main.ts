import { WorkOSAuth, AuthTokens } from './auth';

// Initialize the auth service
const auth = new WorkOSAuth();

// DOM elements
const loginView = document.getElementById('loginView')!;
const userView = document.getElementById('userView')!;
const loginBtn = document.getElementById('loginBtn')!;
const refreshBtn = document.getElementById('refreshBtn')!;
const logoutBtn = document.getElementById('logoutBtn')!;
const statusMessage = document.getElementById('statusMessage')!;
const userInfo = document.getElementById('userInfo')!;
const debugInfo = document.getElementById('debugInfo')!;

// Event handlers
loginBtn.addEventListener('click', handleLogin);
refreshBtn.addEventListener('click', handleRefresh);
logoutBtn.addEventListener('click', handleLogout);

// Listen for auth events from the auth service
window.addEventListener('auth-success', handleAuthSuccess);
window.addEventListener('auth-error', handleAuthError);

// Check for existing session on load
checkExistingSession();

async function handleLogin() {
  try {
    showStatus('Opening browser for authentication...', 'info');
    loginBtn.setAttribute('disabled', 'true');

    await auth.signIn();

    // The actual authentication happens in the browser
    // We'll get a callback via the appUrlOpen event
  } catch (error) {
    console.error('Login error:', error);
    showStatus(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
    loginBtn.removeAttribute('disabled');
  }
}

async function handleRefresh() {
  try {
    showStatus('Refreshing token...', 'info');
    refreshBtn.setAttribute('disabled', 'true');

    const tokens = await auth.refreshToken();

    showStatus('✅ Token refreshed successfully!', 'success');
    displayUserInfo(tokens);
  } catch (error) {
    console.error('Refresh error:', error);
    showStatus(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
  } finally {
    refreshBtn.removeAttribute('disabled');
  }
}

async function handleLogout() {
  try {
    await auth.signOut();
    showLoginView();
    showStatus('Signed out successfully', 'info');
  } catch (error) {
    console.error('Logout error:', error);
    showStatus(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
  }
}

async function handleAuthSuccess(event: Event) {
  const customEvent = event as CustomEvent;
  console.log('Auth success event:', customEvent.detail);

  // Give the token exchange a moment to complete
  await new Promise((resolve) => setTimeout(resolve, 500));

  const session = await auth.getSession();
  if (session) {
    showStatus('✅ Authentication successful!', 'success');
    displayUserInfo(session);
    showUserView();
  }

  loginBtn.removeAttribute('disabled');
}

function handleAuthError(event: Event) {
  const customEvent = event as CustomEvent;
  console.error('Auth error event:', customEvent.detail);

  showStatus(`Error: ${customEvent.detail.error}`, 'error');
  loginBtn.removeAttribute('disabled');
}

async function checkExistingSession() {
  const session = await auth.getSession();
  if (session) {
    console.log('Found existing session');

    // Check if token is expired or about to expire (within 5 minutes)
    try {
      const tokenPayload = JSON.parse(atob(session.accessToken.split('.')[1]));
      const expiresAt = tokenPayload.exp * 1000; // Convert to milliseconds
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      if (expiresAt - now < fiveMinutes) {
        console.log('Token expired or expiring soon, refreshing...');
        showStatus('Refreshing session...', 'info');

        try {
          const refreshedSession = await auth.refreshToken();
          displayUserInfo(refreshedSession);
          showUserView();
          console.log('✅ Session refreshed on app start');
        } catch (error) {
          console.error('Failed to refresh token:', error);
          // Token refresh failed, show login screen
          showLoginView();
          showStatus('Session expired, please sign in again', 'info');
          return;
        }
      } else {
        displayUserInfo(session);
        showUserView();
      }
    } catch (error) {
      console.error('Error checking token expiration:', error);
      // If we can't decode the token, just display what we have
      displayUserInfo(session);
      showUserView();
    }
  }
}

function showLoginView() {
  loginView.classList.remove('hidden');
  userView.classList.add('hidden');
}

function showUserView() {
  loginView.classList.add('hidden');
  userView.classList.remove('hidden');
}

function displayUserInfo(tokens: AuthTokens) {
  const { user, organizationId } = tokens;

  // Defensive check - if user object is missing, show error
  if (!user) {
    console.error('User object is missing from tokens:', tokens);
    showStatus('Error: User information not available. Try signing in again.', 'error');
    showLoginView();
    return;
  }

  userInfo.innerHTML = `
        <h3>👤 User Information</h3>
        <p><strong>Name:</strong> ${user.firstName || 'N/A'} ${user.lastName || 'N/A'}</p>
        <p><strong>Email:</strong> ${user.email || 'N/A'}</p>
        <p><strong>Email Verified:</strong> ${user.emailVerified ? '✅ Yes' : '❌ No'}</p>
        <p><strong>User ID:</strong> ${user.id || 'N/A'}</p>
        ${organizationId ? `<p><strong>Organization ID:</strong> ${organizationId}</p>` : ''}
    `;

  debugInfo.textContent = JSON.stringify(
    {
      userId: user.id || 'N/A',
      email: user.email || 'N/A',
      hasAccessToken: !!tokens.accessToken,
      hasRefreshToken: !!tokens.refreshToken,
      organizationId: organizationId || null,
    },
    null,
    2
  );
}

function showStatus(message: string, type: 'success' | 'error' | 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.classList.remove('hidden');

  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      statusMessage.classList.add('hidden');
    }, 5000);
  }
}
