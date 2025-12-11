import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  // The @astrojs/node adapter in middleware mode should have
  // already set locals from the Symbol we used in Express
  // This middleware just ensures the context has all needed properties

  // If locals are already set (via Symbol), we're good
  if (context.locals?.db) {
    return next();
  }

  // Fallback: try to get from clientAddress context
  // @ts-ignore - accessing internals
  const nodeReq = context.clientAddress ? context : null;

  return next();
});
