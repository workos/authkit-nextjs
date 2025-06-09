# AuthKit Next.js Pages Router Implementation Plan (Clerk-Aligned + Incrementally Testable)

## Current State Analysis

### ✅ What's Working
- Basic middleware integration
- User can log in through hosted AuthKit
- Protected routes redirect to sign-in
- Conditional export structure exists (`src/index.ts` detects router type)

### ❌ What's Broken
- `useAuth()` always returns `null` user
- Client-side auth state not hydrated from server SSR props
- Session state lost after page navigation
- Missing seamless server → client state bridge

### 🔄 What's Partially Working
- Server-side auth detection (middleware → `getAuth()` works)
- SSR prop structure exists but not properly implemented
- Router detection and conditional exports

## Root Cause Analysis

**The gap**: Pages Router needs the same "just works" experience as App Router, where:
1. **Middleware** handles all auth logic
2. **Server helpers** (`withAuth`, `buildWorkOSProps`) seamlessly pass state
3. **Client hooks** (`useAuth`) just work without additional setup
4. **No user-created API routes** required

**Current issue**: The bridge between server auth state and client React state is broken.

## Clerk's Pages Router Pattern Analysis

### How Clerk Does It (Our Target)
```typescript
// 1. Middleware (once) - Same for both routers
export default clerkMiddleware()

// 2. Pages with auth (simple)
export const getServerSideProps = withClerkSSR(async (ctx) => {
  const { userId } = getAuth(ctx.req)
  return { props: { ...buildClerkProps(ctx.req) } }
})

// 3. _app.tsx (simple setup)
<ClerkProvider authServerSideProps={pageProps.auth}>
  <Component {...pageProps} />
</ClerkProvider>

// 4. Components (just works)
const { user } = useUser() // Never null when logged in
```

### Key Clerk Principles
- **Zero API routes** required from users
- **Automatic SSR state passing** through props
- **Seamless client hydration** from server state
- **Built-in session management** handled by library
- **Conditional exports** provide right implementation per router

## Implementation Plan

### Phase 0: Fix Conditional Export Structure
**Goal**: Ensure proper router detection and component provision

#### Step 0.1: Verify Export Conditionals
- **File**: `src/index.ts`
- **Verify**: Components export correctly based on router detection
- **Test**: Import behavior in both App Router and Pages Router apps

```typescript
// Should work in both:
import { ClerkProvider, useAuth } from '@workos-inc/authkit-nextjs'
// Automatically provides correct implementation
```

**🧪 Test Step 0.1:**
```bash
# Create minimal test apps
mkdir test-app-router test-pages-router

# Test imports work
echo "import { useAuth } from '@workos-inc/authkit-nextjs'; console.log(useAuth)" > test.js
```

**✅ Success Criteria 0.1:**
- [ ] Imports work in both router types without errors
- [ ] TypeScript types resolve correctly
- [ ] No "module not found" errors

**🔄 Rollback 0.1:** If imports fail, debug conditional export logic in `src/index.ts`

#### Step 0.2: Ensure Pages Router Components Export
- **Files**: 
  - `src/pages-router/components/index.ts`
  - `src/pages-router/server/index.ts`
- **Verify**: All necessary components and helpers are exported
- **Add**: Any missing exports to match App Router API

**🧪 Test Step 0.2:**
```typescript
// Test script to verify all exports exist
import { 
  AuthKitProvider, 
  useAuth, 
  useAccessToken, 
  useTokenClaims,
  withAuth,
  buildWorkOSProps,
  getAuth 
} from '@workos-inc/authkit-nextjs'

console.log('All exports found:', {
  AuthKitProvider: !!AuthKitProvider,
  useAuth: !!useAuth,
  withAuth: !!withAuth,
  // ... etc
})
```

**✅ Success Criteria 0.2:**
- [ ] All expected exports are available
- [ ] TypeScript doesn't show "not exported" errors
- [ ] Components can be imported without errors

**🔄 Rollback 0.2:** Add missing exports to index files

---

### Phase 1: Fix Core SSR State Flow (Critical Path)
**Goal**: Fix the broken `useAuth()` following Clerk's SSR pattern

#### Step 1.1: Fix buildWorkOSProps (Server → Client Bridge)
- **File**: `src/pages-router/server/buildWorkOSProps.ts`
- **Issue**: Not creating proper serializable auth state
- **Fix**: Match Clerk's `buildClerkProps` pattern exactly

```typescript
export function buildWorkOSProps(options: { session: Session | null }) {
  return {
    __workos_ssr_state: session ? {
      user: session.user,
      sessionId: session.sessionId,
      organizationId: session.organizationId,
      role: session.role,
      permissions: session.permissions,
      entitlements: session.entitlements,
      impersonator: session.impersonator,
    } : null,
  };
}
```

**🧪 Test Step 1.1:**
```typescript
// Create test page to verify props structure
export const getServerSideProps = withAuth(async ({ auth }) => {
  const props = buildWorkOSProps({ session: auth });
  
  // Add debug logging
  console.log('buildWorkOSProps output:', JSON.stringify(props, null, 2));
  
  return { props };
});

export default function TestPage(props) {
  console.log('Client received props:', props);
  return <div>Check console for props structure</div>;
}
```

**✅ Success Criteria 1.1:**
- [ ] `buildWorkOSProps` returns object with `__workos_ssr_state` key
- [ ] When user is logged in, `__workos_ssr_state` contains user data
- [ ] When user is logged out, `__workos_ssr_state` is null
- [ ] Props are JSON-serializable (no functions/classes)

**🔄 Rollback 1.1:** Revert to original structure if serialization fails

#### Step 1.2: Fix Basic withAuth Data Flow (Before Enhancement)
- **File**: `src/pages-router/server/withAuth.ts`
- **Issue**: Not properly passing auth data through props
- **Fix**: Ensure auth data flows to `buildWorkOSProps`

```typescript
export function withAuth(handler, options = {}) {
  return async (context) => {
    const { req, res } = context;
    const authKit = createPagesAdapter();
    
    // Get auth data (should work from existing implementation)
    const authResult = await authKit.withAuth(req);
    
    // Create proper auth object for buildWorkOSProps
    const auth = authResult.user ? {
      user: authResult.user,
      sessionId: authResult.sessionId,
      organizationId: authResult.claims?.org_id,
      role: authResult.claims?.role,
      permissions: authResult.claims?.permissions,
      entitlements: authResult.claims?.entitlements,
      impersonator: authResult.impersonator,
    } : null;
    
    // Call user's handler
    return handler({ ...context, auth });
  };
}
```

**🧪 Test Step 1.2:**
```typescript
// Test page to verify auth data flow
export const getServerSideProps = withAuth(async ({ auth }) => {
  console.log('withAuth provided auth:', JSON.stringify(auth, null, 2));
  
  return {
    props: {
      authData: auth, // Direct pass-through for testing
      ...buildWorkOSProps({ session: auth }),
    },
  };
});

export default function TestPage({ authData, __workos_ssr_state }) {
  return (
    <div>
      <h1>Auth Test</h1>
      <pre>Auth Data: {JSON.stringify(authData, null, 2)}</pre>
      <pre>SSR State: {JSON.stringify(__workos_ssr_state, null, 2)}</pre>
    </div>
  );
}
```

**✅ Success Criteria 1.2:**
- [ ] Logged in: `auth` object contains user data
- [ ] Logged out: `auth` is null
- [ ] `buildWorkOSProps` receives correct session data
- [ ] Server console shows proper auth data structure

**🔄 Rollback 1.2:** Debug authKit.withAuth() call if auth data is incorrect

#### Step 1.3: Fix AuthKitProvider Basic Hydration (Before API Removal)
- **File**: `src/pages-router/components/AuthKitProvider.tsx`
- **Issue**: Not consuming `initialSession` from SSR props
- **Fix**: Initialize state from SSR, test before removing API calls

```typescript
export const AuthKitProvider = ({ children, initialSession }) => {
  // Initialize from SSR state immediately (like Clerk)
  const [user, setUser] = useState<User | null>(initialSession?.user || null);
  const [sessionId, setSessionId] = useState(initialSession?.sessionId);
  const [organizationId, setOrganizationId] = useState(initialSession?.organizationId);
  const [role, setRole] = useState(initialSession?.role);
  const [permissions, setPermissions] = useState(initialSession?.permissions);
  const [entitlements, setEntitlements] = useState(initialSession?.entitlements);
  const [impersonator, setImpersonator] = useState(initialSession?.impersonator);
  const [loading, setLoading] = useState(false);

  // KEEP existing API calls for now - we'll remove in Step 1.5
  // This allows us to test SSR hydration vs API fallback
  const getAuth = async ({ ensureSignedIn = false } = {}) => {
    // ... existing implementation
  };

  // Add debug logging
  useEffect(() => {
    console.log('AuthKitProvider initialized with:', {
      initialSession,
      currentUser: user,
      source: initialSession ? 'SSR' : 'will-fetch-from-API'
    });
  }, []);

  return (
    <AuthContext.Provider value={{
      user, sessionId, organizationId, role, permissions, entitlements, impersonator, loading,
      getAuth, // ... other methods
    }}>
      {children}
    </AuthContext.Provider>
  );
};
```

**🧪 Test Step 1.3:**
```typescript
// Test _app.tsx setup
export default function App({ Component, pageProps }) {
  return (
    <AuthKitProvider initialSession={pageProps.__workos_ssr_state}>
      <Component {...pageProps} />
    </AuthKitProvider>
  );
}

// Test component
function TestComponent() {
  const { user, loading } = useAuth();
  
  useEffect(() => {
    console.log('useAuth result:', { user: user?.email, loading });
  }, [user, loading]);
  
  if (loading) return <div>Loading...</div>;
  
  return (
    <div>
      {user ? (
        <div>✅ User: {user.email}</div>
      ) : (
        <div>❌ No user</div>
      )}
    </div>
  );
}
```

**✅ Success Criteria 1.3:**
- [ ] When logged in: `useAuth()` immediately returns user (not null)
- [ ] When logged out: `useAuth()` returns null
- [ ] No "Loading..." state on initial render when SSR data exists
- [ ] Console shows "source: SSR" when initialSession exists

**🔄 Rollback 1.3:** Debug initialSession prop passing if useAuth still returns null

#### Step 1.4: Test End-to-End Basic Flow
**Goal**: Verify basic login → navigate → useAuth works before advanced features

**🧪 Test Step 1.4:**
```typescript
// Test sequence:
1. Start logged out → visit protected page → redirects to login ✅
2. Complete login → returns to protected page → useAuth() returns user ✅  
3. Navigate to another page → useAuth() still returns user ✅
4. Refresh page → useAuth() still returns user ✅
```

**✅ Success Criteria 1.4:**
- [ ] Full login flow works end-to-end
- [ ] `useAuth()` never returns null when user is logged in
- [ ] Session persists across page navigation
- [ ] Session persists across page refresh

**🔄 Rollback 1.4:** If any step fails, debug the specific step that broke

#### Step 1.5: Remove API Calls and Implement SSR-Only Pattern
- **File**: `src/pages-router/components/AuthKitProvider.tsx`
- **Issue**: Still makes API calls despite having SSR props
- **Fix**: Replace ALL API calls with SSR refresh pattern

```typescript
export const AuthKitProvider = ({ children, initialSession }) => {
  const router = useRouter();
  
  // Initialize ALL state from SSR state immediately (like Clerk)
  const [user, setUser] = useState<User | null>(initialSession?.user || null);
  const [sessionId, setSessionId] = useState(initialSession?.sessionId);
  const [organizationId, setOrganizationId] = useState(initialSession?.organizationId);
  const [role, setRole] = useState(initialSession?.role);
  const [permissions, setPermissions] = useState(initialSession?.permissions);
  const [entitlements, setEntitlements] = useState(initialSession?.entitlements);
  const [impersonator, setImpersonator] = useState(initialSession?.impersonator);
  const [loading, setLoading] = useState(false);

  // REMOVE: All fetch calls to /api/auth/* endpoints
  // REPLACE WITH: SSR refresh pattern (Clerk's approach)
  
  const refreshAuth = async () => {
    setLoading(true);
    // Force SSR refresh by navigating to current page (Clerk pattern)
    router.replace(router.asPath);
    // Loading state will be cleared by page refresh
  };

  const signOut = async ({ returnTo }: { returnTo?: string } = {}) => {
    setLoading(true);
    // Set logout cookie/param, then refresh to let SSR handle logout
    document.cookie = '__workos_logout=true; path=/; SameSite=lax';
    router.replace(returnTo || '/');
  };

  const switchToOrganization = async (organizationId: string) => {
    setLoading(true);
    // Set org switch param, then refresh to let SSR handle switch
    const currentUrl = new URL(router.asPath, window.location.origin);
    currentUrl.searchParams.set('__workos_switch_org', organizationId);
    router.replace(currentUrl.pathname + currentUrl.search);
  };

  // REMOVE: All useEffect API calls - no fetch fallbacks needed
  // REMOVE: getAuth method that makes API calls

  return (
    <AuthContext.Provider value={{
      user, sessionId, organizationId, role, permissions, entitlements, impersonator, loading,
      refreshAuth, signOut, switchToOrganization,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
```

**🧪 Test Step 1.5:**
```typescript
// Test that no API calls are made
1. Open browser dev tools → Network tab
2. Load page with auth → verify no /api/auth/* requests
3. Test signOut() → verify no API calls, only page refresh
4. Test refreshAuth() → verify no API calls, only page refresh

// Test functionality still works
function TestComponent() {
  const { user, signOut, refreshAuth } = useAuth();
  
  return (
    <div>
      <div>User: {user?.email || 'Not logged in'}</div>
      <button onClick={() => signOut()}>Sign Out</button>
      <button onClick={() => refreshAuth()}>Refresh</button>
    </div>
  );
}
```

**✅ Success Criteria 1.5:**
- [ ] No `/api/auth/*` requests in browser network tab
- [ ] Sign out still works (via page refresh)
- [ ] Refresh auth still works (via page refresh)
- [ ] All functionality preserved from Step 1.4

**🔄 Rollback 1.5:** If functionality breaks, revert to Step 1.4 implementation

#### Step 1.6: Enhanced withAuth for SSR Auth Operations
- **File**: `src/pages-router/server/withAuth.ts`
- **Issue**: Need to handle auth operations (logout, org switch) through SSR instead of API routes
- **Fix**: Detect auth operation params/cookies and handle in SSR

```typescript
export function withAuth(handler, options = {}) {
  return async (context) => {
    const { req, res } = context;
    
    // Handle logout request via cookie
    if (req.cookies.__workos_logout) {
      // Clear session and redirect
      await clearSessionCookie(res);
      // Clear the logout cookie
      res.setHeader('Set-Cookie', '__workos_logout=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT');
      return { redirect: { destination: '/', permanent: false } };
    }
    
    // Handle org switch request via URL param
    const switchOrgId = req.query.__workos_switch_org;
    if (switchOrgId) {
      // Switch org and refresh session
      await switchToOrganizationSSR(req, res, switchOrgId);
      // Redirect to clean URL (remove the param)
      const cleanUrl = context.resolvedUrl.split('?')[0];
      return { redirect: { destination: cleanUrl, permanent: false } };
    }
    
    // Get/refresh auth normally
    const authKit = createPagesAdapter();
    const authResult = await authKit.withAuth(req);
    
    // Create proper auth object
    const auth = authResult.user ? {
      user: authResult.user,
      sessionId: authResult.sessionId,
      organizationId: authResult.claims?.org_id,
      role: authResult.claims?.role,
      permissions: authResult.claims?.permissions,
      entitlements: authResult.claims?.entitlements,
      impersonator: authResult.impersonator,
    } : null;
    
    // Call user's handler
    return handler({ ...context, auth });
  };
}
```

**🧪 Test Step 1.6:**
```typescript
// Test logout via cookie
1. Login → set __workos_logout cookie → refresh page
2. Should redirect to home and clear session

// Test org switch via URL param  
1. Login → visit page with ?__workos_switch_org=org_123
2. Should switch org context and redirect to clean URL

// Helper test functions
async function testLogout() {
  document.cookie = '__workos_logout=true; path=/';
  window.location.reload();
}

async function testOrgSwitch(orgId) {
  window.location.href = window.location.pathname + `?__workos_switch_org=${orgId}`;
}
```

**✅ Success Criteria 1.6:**
- [ ] Logout cookie triggers session clear and redirect
- [ ] Org switch param triggers org context change
- [ ] Clean URL after org switch (param removed)
- [ ] Regular page loads still work normally

**🔄 Rollback 1.6:** If SSR operations break, implement as simpler middleware-only approach

---

### Phase 2: Complete Zero-API-Route Session Management
**Goal**: Verify ALL session lifecycle works through SSR

#### Step 2.1: Integration Testing - Full Flow
**Goal**: Test complete auth lifecycle without any API routes

**🧪 Test Step 2.1:**
```typescript
// Complete test sequence (no API routes should exist)
1. ✅ Fresh app install → no /api/auth/* routes created
2. ✅ Login flow → works via middleware + SSR
3. ✅ useAuth() → returns user immediately  
4. ✅ Navigate pages → state persists via SSR props
5. ✅ Refresh page → state persists via SSR props
6. ✅ Sign out → works via SSR cookie + refresh
7. ✅ Org switch → works via SSR param + refresh
8. ✅ Protected routes → redirect via withAuth SSR

// Verification script
function verifyNoAPIRoutes() {
  const apiRoutes = [
    '/api/auth/session',
    '/api/auth/signout', 
    '/api/auth/refresh',
    '/api/auth/access-token',
    '/api/auth/switch-organization'
  ];
  
  // Verify these return 404 (don't exist)
  apiRoutes.forEach(async route => {
    const response = await fetch(route);
    console.log(`${route}: ${response.status} (should be 404)`);
  });
}
```

**✅ Success Criteria 2.1:**
- [ ] All auth operations work without custom API routes
- [ ] Network tab shows no `/api/auth/*` requests during normal operation
- [ ] User experience matches or exceeds Clerk's Pages Router UX

**🔄 Rollback 2.1:** If any operation fails, debug the specific SSR implementation

#### Step 2.2: Stress Testing SSR Pattern
**Goal**: Ensure SSR pattern handles edge cases

**🧪 Test Step 2.2:**
```typescript
// Edge case testing
1. ✅ Multiple rapid sign out clicks → handles gracefully
2. ✅ Multiple rapid org switches → handles gracefully  
3. ✅ Browser back/forward with auth state changes → works
4. ✅ Concurrent tabs → auth state syncs properly
5. ✅ Network interruption during auth operation → recovers

// Performance testing
1. ✅ Auth state change latency vs API route approach
2. ✅ Memory usage of SSR pattern vs API pattern
3. ✅ Bundle size impact
```

**✅ Success Criteria 2.2:**
- [ ] No race conditions in auth operations
- [ ] Graceful handling of rapid state changes
- [ ] Performance meets or exceeds API route approach

**🔄 Rollback 2.2:** Optimize SSR pattern or add rate limiting if needed

---

### Phase 3: Advanced Features (Defer to Clerk)
**Goal**: Implement missing features using Clerk's patterns

#### Step 3.1: Access Token Management
- **Research**: How does Clerk handle `useSession().getToken()`
- **Implement**: Same pattern for `useAccessToken()`
- **Avoid**: Separate API routes, use SSR state + client management

**🧪 Test Step 3.1:**
```typescript
function TestAccessTokens() {
  const { accessToken, loading, error, refresh } = useAccessToken();
  
  return (
    <div>
      <div>Token: {accessToken ? 'Present' : 'None'}</div>
      <div>Loading: {loading.toString()}</div>
      <div>Error: {error?.message || 'None'}</div>
      <button onClick={refresh}>Refresh Token</button>
    </div>
  );
}
```

**✅ Success Criteria 3.1:**
- [ ] `useAccessToken()` returns valid tokens
- [ ] Token refresh works without API routes
- [ ] Automatic token refresh before expiry

#### Step 3.2: Token Claims Support
**🧪 Test Step 3.2:**
```typescript
function TestTokenClaims() {
  const claims = useTokenClaims();
  
  return (
    <pre>{JSON.stringify(claims, null, 2)}</pre>
  );
}
```

**✅ Success Criteria 3.2:**
- [ ] Claims decode properly from access tokens
- [ ] Custom claims are included
- [ ] Claims update when tokens refresh

#### Step 3.3: Multi-Domain Support Testing
**🧪 Test Step 3.3:**
```typescript
// Test satellite app configuration
1. ✅ Primary domain auth works
2. ✅ Satellite domain receives auth state
3. ✅ Cross-domain organization switching
4. ✅ Proxy URL handling
```

**✅ Success Criteria 3.3:**
- [ ] Multi-domain apps work same as App Router
- [ ] No additional configuration required

#### Step 3.4: Impersonation Support
**🧪 Test Step 3.4:**
```typescript
function TestImpersonation() {
  const { impersonator } = useAuth();
  
  return (
    <div>
      {impersonator ? (
        <>
          <Impersonation />
          <div>Impersonating: {impersonator.email}</div>
        </>
      ) : (
        <div>Not impersonating</div>
      )}
    </div>
  );
}
```

**✅ Success Criteria 3.4:**
- [ ] Impersonation detection works
- [ ] Impersonation UI displays correctly
- [ ] Stop impersonation works via SSR pattern

---

### Phase 4: Developer Experience Polish
**Goal**: Match Clerk's DX exactly

#### Step 4.1: TypeScript Support
**🧪 Test Step 4.1:**
```typescript
// Type safety testing
const auth = useAuth(); // Should infer correct types
const { user } = await withAuth(({ auth }) => auth); // Should be typed
const props = buildWorkOSProps({ session: null }); // Should accept Session | null
```

**✅ Success Criteria 4.1:**
- [ ] Full type safety matches App Router
- [ ] No TypeScript errors in usage
- [ ] Proper type inference

#### Step 4.2: Error Handling
**🧪 Test Step 4.2:**
```typescript
// Error scenarios
1. ✅ Network errors during auth → graceful fallback
2. ✅ Invalid session data → proper error state
3. ✅ Middleware misconfiguration → helpful error messages
```

**✅ Success Criteria 4.2:**
- [ ] Clear error messages for common issues
- [ ] Graceful degradation
- [ ] No uncaught promise rejections

#### Step 4.3: Debug Support
**🧪 Test Step 4.3:**
```typescript
// Debug mode testing
process.env.NODE_ENV = 'development';
// Should show helpful logs about auth state, SSR data flow, etc.
```

**✅ Success Criteria 4.3:**
- [ ] Useful debug information available
- [ ] Clear auth state inspection
- [ ] SSR data flow visibility

---

## Implementation Priority with Testing

### P0 - Critical (Fix Broken State)
1. ✅ **Step 0.1-0.2**: Verify exports work → **Test**: Import verification
2. ✅ **Step 1.1**: Fix buildWorkOSProps → **Test**: Props structure in console
3. ✅ **Step 1.2**: Fix withAuth data flow → **Test**: Auth data in page props
4. ✅ **Step 1.3**: Fix initial hydration → **Test**: useAuth returns user immediately
5. ✅ **Step 1.4**: Test end-to-end flow → **Test**: Login → navigate → refresh cycle
6. ✅ **Step 1.5**: Remove API calls → **Test**: Network tab shows no API requests
7. ✅ **Step 1.6**: SSR auth operations → **Test**: Logout/org switch via SSR

### P1 - Core Features (Zero API Routes)
8. ✅ **Step 2.1**: Integration testing → **Test**: Complete flow verification
9. ✅ **Step 2.2**: Stress testing → **Test**: Edge cases and performance

### P2 - Advanced Features (Clerk Parity)
10. ✅ **Step 3.1-3.4**: Advanced features → **Test**: Each feature independently

### P3 - Polish (DX Matching)
11. ✅ **Step 4.1-4.3**: DX improvements → **Test**: Developer experience quality

## Testing Strategy

### Manual Testing Checklist (Incremental)
- [ ] **After Step 1.3**: `useAuth()` returns user (not null)
- [ ] **After Step 1.4**: Full login flow works
- [ ] **After Step 1.5**: No API requests in network tab
- [ ] **After Step 1.6**: Auth operations work via SSR
- [ ] **After Step 2.1**: Complete auth lifecycle works
- [ ] **After Phase 3**: All advanced features work
- [ ] **After Phase 4**: Developer experience matches Clerk

### Automated Testing Opportunities
```typescript
// Unit tests for each step
describe('buildWorkOSProps', () => {
  it('serializes session data correctly', () => {
    const result = buildWorkOSProps({ session: mockSession });
    expect(result.__workos_ssr_state).toEqual(expectedStructure);
  });
});

describe('AuthKitProvider', () => {
  it('initializes from SSR props', () => {
    render(<AuthKitProvider initialSession={mockSession}><TestComponent /></AuthKitProvider>);
    expect(screen.getByText(mockSession.user.email)).toBeInTheDocument();
  });
});
```

## Rollback Strategy

Each step has clear rollback criteria:
- **Step fails**: Revert that specific step, debug, retry
- **Integration breaks**: Rollback to last working step
- **Performance degrades**: Optimize or revert to API pattern temporarily

## Key Architectural Principles

### Follow Clerk's Lead
1. **Minimal Setup**: Zero API routes, minimal configuration
2. **SSR First**: All auth state through server-side rendering
3. **Seamless Hydration**: Client picks up server state immediately
4. **Incremental Testing**: Each step independently verifiable
5. **Graceful Rollback**: Can revert any step without breaking others

This approach ensures we can verify progress at each step while building toward Clerk-equivalent functionality.
