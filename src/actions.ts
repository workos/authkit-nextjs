'use server';

/**
 * This action is only accessible to authenticated users,
 * there is no need to check the session here as the middleware will
 * be responsible for that.
 */
export const checkSessionAction = async () => {
  return true;
};
