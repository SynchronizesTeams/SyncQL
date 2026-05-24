import jwt from 'jsonwebtoken';
import type { H3Event } from 'h3';

const DEFAULT_SECRET = 'sync-db-glowing-development-secret-key-19842026';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_SECRET;
const COOKIE_NAME = 'auth_token';

export interface UserSession {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string;
}

export function signToken(payload: UserSession): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): UserSession | null {
  try {
    return jwt.verify(token, JWT_SECRET) as UserSession;
  } catch (e) {
    return null;
  }
}

export function setSessionCookie(event: H3Event, session: UserSession) {
  const token = signToken(session);
  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7 // 7 days
  });
}

export function clearSessionCookie(event: H3Event) {
  deleteCookie(event, COOKIE_NAME);
}

export function getUserFromEvent(event: H3Event): UserSession | null {
  const token = getCookie(event, COOKIE_NAME);
  if (!token) return null;
  return verifyToken(token);
}
