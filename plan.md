# AuthKit Next.js Pages Router Implementation Plan (Clerk-Aligned)

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

#### Step 0.2: Ensure Pages Router Components Export
- **Files**: 
  - `src/pages-router/components/index.ts`
  - `src/pages-router/server/index.ts`
- **Verify**: All necessary components and helpers are exported
- **Add**: Any missing exports to match App Router API

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

#### Step 1.2: Fix withAuth HOC (Server-Side Props)
- **File**: `src/pages-router/server/withAuth.ts`
- **Issue**: Not properly passing auth data through props
- **Fix**: Ensure auth data flows to `buildWorkOSProps`

```typescript
export const getServerSideProps = withAuth(async ({ auth }) => {
  // auth should contain full session data from middleware
  return {
    props: {
      ...buildWorkOSProps({ session: auth }),
      // user's other props
    },
  };
});
```

#### Step 1.3: Fix AuthKitProvider Hydration (UPDATED - ELIMINATE API CALLS)
- **File**: `src/pages-router/components/AuthKitProvider.tsx`
- **Issue**: Still makes API calls despite having SSR props, violates "zero API routes" principle
- **Fix**: Initialize ALL state from SSR immediately, replace API calls with SSR refresh pattern

```typescript
export const AuthKitProvider = ({ children, initialSession }) => {
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
    // Force SSR refresh by navigating to current page (Clerk pattern)
    router.replace(router.asPath);
  };

  const signOut = async ({ returnTo }: { returnTo?: string } = {}) => {
    // Set logout cookie/param, then refresh to let SSR handle logout
    document.cookie = '__workos_logout=true; path=/';
    router.replace(returnTo || '/');
  };

  const switchToOrganization = async (organizationId: string) => {
    // Set org switch param, then refresh to let SSR handle switch
    const currentUrl = new URL(router.asPath, window.location.origin);
    currentUrl.searchParams.set('__workos_switch_org', organizationId);
    router.replace(currentUrl.pathname + currentUrl.search);
  };

  // REMOVE: All useEffect API calls - no fetch fallbacks needed
};
```

#### Step 1.4: Enhanced withAuth/Middleware for SSR Auth Operations (NEW)
- **File**: `src/pages-router/server/withAuth.ts`
- **Issue**: Need to handle auth operations (logout, org switch) through SSR instead of API routes
- **Fix**: Detect auth operation params/cookies and handle in SSR

```typescript
export function withAuth(handler, options) {
  return async (context) => {
    const { req, res } = context;
    
    // Handle logout request via cookie
    if (req.cookies.__workos_logout) {
      // Clear session and redirect
      await clearSessionCookie(res);
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
    const authResult = await authKit.withAuth(req);
    // ... rest of existing logic with enhanced buildWorkOSProps integration
  };
}
```

#### Step 1.5: Fix useAuth Hook Context  
- **File**: `src/pages-router/components/useAuth.ts`
- **Issue**: May not be reading provider state correctly
- **Fix**: Ensure proper context consumption

### Phase 2: Complete Zero-API-Route Session Management (UPDATED)
**Goal**: Handle ALL session lifecycle through SSR, eliminating user-created API routes

#### Step 2.1: Remove Built-in API Utilities (UPDATED)
- **REMOVE**: All references to users creating `/api/auth/*` routes
- **REPLACE**: Document that no API routes are needed
- **Pattern**: Everything handled through withAuth + SSR refresh

```typescript
// REMOVE: Export of handleAuth for API routes
// REMOVE: Documentation suggesting API route creation
// REPLACE WITH: Pure SSR pattern documentation

// Users only need:
// 1. withAuth in getServerSideProps
// 2. AuthKitProvider with initialSession
// 3. No API routes required
```

#### Step 2.2: SSR-Only Session Operations (IMPLEMENTED IN STEP 1.3)
- **File**: Already handled in AuthKitProvider fix above
- **Pattern**: `router.replace(router.asPath)` for all operations
- **Result**: Zero API route dependencies

#### Step 2.3: SSR-Only Organization Switching (IMPLEMENTED IN STEP 1.4)  
- **File**: Already handled in withAuth enhancement above
- **Pattern**: URL param + SSR redirect cycle
- **Result**: No separate API route needed

### Phase 3: Advanced Features (Defer to Clerk)
**Goal**: Implement missing features using Clerk's patterns

#### Step 3.1: Access Token Management
- **Research**: How does Clerk handle `useSession().getToken()`
- **Implement**: Same pattern for `useAccessToken()`
- **Avoid**: Separate API routes, use SSR state + client management

#### Step 3.2: User Profile Management
- **Research**: Clerk's `useUser().update()` pattern
- **Implement**: If needed, use same approach
- **Note**: May not be needed for WorkOS AuthKit scope

#### Step 3.3: Multi-Domain Support
- **Research**: Clerk's satellite app setup for Pages Router
- **Test**: Current implementation against Clerk's patterns
- **Fix**: Any discrepancies in proxy/domain handling

#### Step 3.4: Impersonation
- **File**: `src/pages-router/components/Impersonation.tsx`
- **Research**: How Clerk handles impersonation in Pages Router
- **Test**: Current implementation
- **Fix**: Any Pages Router specific issues

### Phase 4: Developer Experience Polish
**Goal**: Match Clerk's DX exactly

#### Step 4.1: TypeScript Support
- **Review**: Clerk's TypeScript patterns for Pages Router
- **Implement**: Same type safety and overloads
- **Test**: Type inference works correctly

#### Step 4.2: Error Handling
- **Research**: Clerk's error boundary patterns
- **Implement**: Same error states and recovery
- **Add**: Proper loading states

#### Step 4.3: Debug Support
- **Research**: Clerk's debug modes for Pages Router
- **Implement**: Same debugging capabilities
- **Add**: Development-time warnings and guides

## Implementation Priority

### P0 - Critical (Eliminate API Dependencies)
1. ✅ Fix AuthKitProvider to use only SSR state (Step 1.3)
2. ✅ Replace all fetch calls with router.replace pattern (Step 1.3)  
3. ✅ Enhance withAuth to handle logout/org-switch via SSR (Step 1.4)
4. ✅ Fix `buildWorkOSProps` integration with enhanced withAuth
5. ✅ Test: Full auth flow without any custom API routes

### P1 - Core Features (Match Clerk)
6. ✅ Session refresh without API routes
7. ✅ Organization switching through SSR
8. ✅ Access token management (Clerk pattern)
9. ✅ Protection patterns for Pages Router

### P2 - Advanced Features (Clerk Parity)
10. ✅ Multi-domain support testing
11. ✅ Impersonation component fixes
12. ✅ Custom auth flow support
13. ✅ TypeScript improvements

### P3 - Polish (DX Matching)
14. ✅ Error handling patterns
15. ✅ Debug logging
16. ✅ Performance optimizations
17. ✅ Documentation

## Success Criteria

### Must Work (Zero API Routes - Clerk Equivalent)
- ✅ Users never create `/api/auth/*` routes
- ✅ All auth operations work through SSR refresh  
- ✅ `useAuth()` returns data immediately from SSR props
- ✅ Login/logout/org-switch work without custom API routes
- ✅ Session persists across navigation via SSR state

### Should Work (Feature Parity)
- ✅ Access tokens available through hooks
- ✅ Organization switching works
- ✅ All server helpers function correctly
- ✅ TypeScript support matches App Router

### Nice to Have (Advanced)
- ✅ Debug mode available
- ✅ Custom auth flows supported
- ✅ Impersonation works correctly
- ✅ Multi-domain apps supported

## Research Tasks

Before implementing each phase, research Clerk's exact approach:

### Phase 1 Research
- [ ] How does `buildClerkProps` serialize auth state?
- [ ] What's in Clerk's `__clerk_ssr_state` object?
- [ ] How does `ClerkProvider` consume SSR props?

### Phase 2 Research  
- [ ] How does Clerk handle session refresh in Pages Router?
- [ ] Does Clerk require API routes or handle through SSR?
- [ ] How does organization switching work?

### Phase 3 Research
- [ ] How does `useSession().getToken()` work internally?
- [ ] What's Clerk's impersonation pattern for Pages Router?
- [ ] How does multi-domain setup differ between routers?

## Testing Strategy

### Manual Testing Checklist (Zero API Routes Baseline)
- [ ] Fresh install → login → `useAuth()` returns user (no API routes created)
- [ ] Navigate between pages → state persists via SSR
- [ ] Refresh page → state persists via SSR  
- [ ] Logout → works via SSR refresh, no API route
- [ ] Protected page when logged out → redirects via withAuth
- [ ] Organization switching → works via SSR refresh, no API route
- [ ] **Verify: No `/api/auth/*` routes exist in user's codebase**

### Integration Testing
- [ ] Test against Clerk's Pages Router example apps
- [ ] Verify same user experience patterns
- [ ] Ensure no additional setup required vs Clerk

## Key Architectural Principles

### Follow Clerk's Lead
1. **Minimal Setup**: Like Clerk, require minimal user configuration
2. **SSR First**: Use server-side rendering for state, not API routes
3. **Seamless Hydration**: Client should seamlessly pick up server state
4. **Built-in Utilities**: Provide importable helpers, don't require user implementation
5. **Conditional Logic**: Same import paths work for both routers

### Avoid Overengineering  
- ❌ Don't create APIs users need to implement
- ❌ Don't require complex setup procedures  
- ❌ Don't reinvent patterns Clerk already solved
- ❌ Don't make fetch calls when SSR state is available
- ✅ Use SSR + withAuth for ALL state management
- ✅ Provide "just works" experience with zero API routes
- ✅ Follow Clerk's SSR-first patterns exactly

This approach ensures we match Clerk's excellent developer experience while providing AuthKit's functionality.
