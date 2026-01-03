/**
 * Astro Middleware for Vidfast Proxy
 * 
 * This integrates the vidfast proxy with Astro's server-side rendering.
 */
import type { MiddlewareHandler } from 'astro';
import { handleProxyRequest, handleExtProxyRequest, shouldProxy, PROXY_PATH } from './middleware/vidfast-proxy';

export const onRequest: MiddlewareHandler = async (context, next) => {
    const { request, url } = context;

    // Handle external proxy requests (universal proxy for CORS)
    if (url.pathname.startsWith(PROXY_PATH + '/ext/')) {
        return handleExtProxyRequest(request);
    }

    // Check if this request should be proxied normally
    if (shouldProxy(url.pathname)) {
        // Construct the proxy base URL from the request
        const proxyBase = `${url.protocol}//${url.host}${PROXY_PATH}`;

        // Handle the proxy request
        return handleProxyRequest(request, proxyBase);
    }

    // Not a proxy request, continue to next handler
    return next();
};
