# Plan: Replace Timeout-Based Refresh with Interval Checking

## Approach: Replace Complex Timeout Logic with Simple Interval

Replace the current setTimeout-based refresh scheduling with a simple setInterval that periodically checks if refresh is needed.

## Changes Required

1. **Remove timeout-based scheduling**
   - Remove `MAX_REFRESH_DELAY_SECONDS` constant (no longer needed)
   - Remove `getRefreshDelay` function (no longer needed)
   - Remove all `setTimeout` calls for refresh scheduling in `updateToken` and `refresh`

2. **Add interval-based checking**
   - Add `REFRESH_CHECK_INTERVAL_SECONDS = 15` constant for check frequency
   - Add `lastRefreshAttempt` timestamp tracking
   - Replace timeout logic with single `setInterval` that runs throughout component lifecycle

3. **Implement smart refresh logic**
   - On each interval: parse token and check if refresh needed
   - Only refresh if:
     - Token is missing/expired within buffer time (`TOKEN_EXPIRY_BUFFER_SECONDS`)
     - AND minimum delay has passed since last attempt (`MIN_REFRESH_DELAY_SECONDS`)
     - AND not currently fetching (`fetchingRef.current`)
   - For errors: respect `RETRY_DELAY_SECONDS` before next attempt

4. **Preserve all existing behavior**
   - Keep `TOKEN_EXPIRY_BUFFER_SECONDS = 60` - still refresh 60s before expiry
   - Keep `MIN_REFRESH_DELAY_SECONDS = 15` - still prevent rapid refreshes  
   - Keep `RETRY_DELAY_SECONDS = 300` - still wait 5min after errors
   - Keep all existing error handling and state management
   - Keep immediate refresh on mount if token expired/missing

5. **Update cleanup**
   - Replace `clearRefreshTimeout` with `clearInterval`
   - Ensure interval is cleared on component unmount

## Benefits
- **No setTimeout overflow**: Eliminates the root cause completely
- **Clock resilient**: Adapts to time changes within 15 seconds
- **Simpler code**: No complex timeout calculations needed
- **Minimal changes**: Same API, same behavior, just different scheduling
- **Respects existing timing**: All buffer/delay logic preserved

## Code Changes Summary
- Remove ~15 lines (timeout logic)
- Add ~10 lines (interval logic)
- Net reduction in complexity
- Zero API changes