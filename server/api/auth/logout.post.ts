import { defineEventHandler } from 'h3';
import { clearSessionCookie } from '../../utils/jwt';

export default defineEventHandler((event) => {
  clearSessionCookie(event);
  return {
    success: true
  };
});
