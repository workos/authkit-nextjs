import { NextResponse } from 'next/server';

export function redirectWithFallback(redirectUri: string) {
  // Fall back to standard Response if NextResponse is not available.
  // This is to support Next.js 13.
  return NextResponse?.redirect
    ? NextResponse.redirect(redirectUri)
    : new Response(null, { status: 307, headers: { Location: redirectUri } });
}

export function errorResponseWithFallback(errorBody: { error: { message: string; description: string } }) {
  // Fall back to standard Response if NextResponse is not available.
  // This is to support Next.js 13.
  return NextResponse?.json
    ? NextResponse.json(errorBody, { status: 500 })
    : new Response(JSON.stringify(errorBody), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
}
