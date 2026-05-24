import { defineEventHandler } from 'h3';
import { getUserFromEvent } from '../../utils/jwt';

export default defineEventHandler((event) => {
  const user = getUserFromEvent(event);
  return {
    user
  };
});
