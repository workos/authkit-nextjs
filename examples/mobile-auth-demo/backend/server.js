import express from 'express';
import cors from 'cors';
import { WorkOS } from '@workos-inc/node';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize WorkOS client
const workos = new WorkOS(process.env.WORKOS_API_KEY);
const clientId = process.env.WORKOS_CLIENT_ID;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'WorkOS Mobile Auth Demo Backend' });
});

// Generate authorization URL
app.post('/auth/url', (req, res) => {
  try {
    const { redirectUri, state, organizationId } = req.body;

    const authorizationUrl = workos.userManagement.getAuthorizationUrl({
      clientId,
      redirectUri: redirectUri || 'http://localhost:3000/callback',
      responseType: 'code',
      state,
      provider: 'authkit',
      ...(organizationId && { organizationId }),
    });

    res.json({ authorizationUrl });
  } catch (error) {
    console.error('Error generating authorization URL:', error);
    res.status(500).json({
      error: 'Failed to generate authorization URL',
      message: error.message,
    });
  }
});

// Exchange authorization code for tokens
app.post('/auth/callback', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        error: 'Missing authorization code',
        message: 'The "code" parameter is required',
      });
    }

    console.log('Exchanging authorization code for tokens...');

    // Exchange code for tokens with WorkOS
    const { accessToken, refreshToken, user, impersonator, organizationId, oauthTokens, authenticationMethod } =
      await workos.userManagement.authenticateWithCode({
        clientId,
        code,
      });

    console.log('Authentication successful for user:', user.email);

    // Return tokens and user information to the client
    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
        profilePictureUrl: user.profilePictureUrl,
      },
      organizationId,
      impersonator,
      authenticationMethod,
      // Note: oauthTokens only present if using OAuth provider (not AuthKit)
      ...(oauthTokens && { oauthTokens }),
    });
  } catch (error) {
    console.error('Error during authentication:', error);
    res.status(500).json({
      error: 'Authentication failed',
      message: error.message,
      details: error.rawData || error.response?.data,
    });
  }
});

// Refresh access token using refresh token
app.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Missing refresh token',
        message: 'The "refreshToken" parameter is required',
      });
    }

    console.log('Refreshing access token...');

    // Exchange refresh token for new tokens
    const { accessToken, refreshToken: newRefreshToken, user } = await workos.userManagement.authenticateWithRefreshToken({
      clientId,
      refreshToken,
    });

    console.log('Token refresh successful for user:', user.email);

    const responseData = {
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
        profilePictureUrl: user.profilePictureUrl,
      },
    };

    console.log('Returning refresh response with user:', {
      email: user.email,
      hasFirstName: !!user.firstName,
      hasLastName: !!user.lastName,
    });

    res.json(responseData);
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({
      error: 'Token refresh failed',
      message: error.message,
      details: error.rawData || error.response?.data,
    });
  }
});

// Get user's organization membership and roles (RBAC example)
app.post('/auth/roles', async (req, res) => {
  try {
    const { userId, organizationId } = req.body;

    if (!userId || !organizationId) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Both "userId" and "organizationId" are required',
      });
    }

    console.log(`Fetching roles for user ${userId} in organization ${organizationId}...`);

    // Get organization membership which includes role information
    const membership = await workos.userManagement.getOrganizationMembership({
      userId,
      organizationId,
    });

    res.json({
      userId: membership.userId,
      organizationId: membership.organizationId,
      role: membership.role,
      status: membership.status,
    });
  } catch (error) {
    console.error('Error fetching user roles:', error);
    res.status(500).json({
      error: 'Failed to fetch user roles',
      message: error.message,
      details: error.rawData || error.response?.data,
    });
  }
});

// Verify and decode access token (useful for protected routes)
app.post('/auth/verify', async (req, res) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        error: 'Missing access token',
        message: 'The "accessToken" parameter is required',
      });
    }

    // Verify the token with WorkOS
    const user = await workos.userManagement.getUser({
      accessToken,
    });

    res.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(401).json({
      valid: false,
      error: 'Invalid or expired token',
      message: error.message,
    });
  }
});

// Sign out and revoke session
app.post('/auth/logout', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Missing session ID',
        message: 'The "sessionId" parameter is required',
      });
    }

    console.log(`Revoking session ${sessionId}...`);

    // Get the logout URL from WorkOS
    const logoutUrl = getWorkOS().userManagement.getLogoutUrl({ sessionId });

    console.log('Logout URL generated:', logoutUrl);
    console.log('Session will be revoked when user navigates to logout URL');

    res.json({
      success: true,
      logoutUrl,
    });
  } catch (error) {
    console.error('Error revoking session:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: error.message,
    });
  }
});

// Example protected endpoint that requires authentication
app.get('/api/protected', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
      });
    }

    const accessToken = authHeader.replace('Bearer ', '');

    // Verify the token
    const user = await workos.userManagement.getUser({
      accessToken,
    });

    res.json({
      message: 'This is a protected endpoint',
      user: {
        id: user.id,
        email: user.email,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error accessing protected endpoint:', error);
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired access token',
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 WorkOS Mobile Auth Demo Backend`);
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET  /health              - Health check`);
  console.log(`  POST /auth/url            - Generate authorization URL`);
  console.log(`  POST /auth/callback       - Exchange code for tokens`);
  console.log(`  POST /auth/refresh        - Refresh access token`);
  console.log(`  POST /auth/roles          - Get user roles (RBAC)`);
  console.log(`  POST /auth/verify         - Verify access token`);
  console.log(`  GET  /api/protected       - Example protected endpoint`);
  console.log(`\n⚙️  Configuration:`);
  console.log(`  WORKOS_API_KEY: ${process.env.WORKOS_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`  WORKOS_CLIENT_ID: ${process.env.WORKOS_CLIENT_ID ? '✅ Set' : '❌ Missing'}`);
  console.log('');
});
