import { NextMiddleware, NextResponse } from "next/server";
import { updateSession } from "./session";

type AuthkitMiddlewareConfig = {};

export function authkitMiddleware({}: AuthkitMiddlewareConfig = {}): NextMiddleware {
  return function (request, event) {
    return updateSession(request);
  };
}
