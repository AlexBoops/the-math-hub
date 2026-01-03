/**
 * Vidfast Reverse Proxy Middleware
 * 
 * Proxies vidfast.pro through /video/* with full content rewriting
 * so the browser never sees the original domain.
 * 
 * OPTIMIZATIONS:
 * - In-memory caching for rewritten content (LRU-like)
 * - Response compression (Gzip/Brotli)
 * - Pre-compiled Regex patterns
 */

import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
import { Buffer } from 'node:buffer';

const TARGET_HOST = 'vidfast.pro';
const TARGET_ORIGIN = `https://${TARGET_HOST}`;
const PROXY_PATH = '/video';

// --- CONFIGURATION ---
const CACHE_TTL_MS = 60 * 1000;
const MAX_CACHE_SIZE = 100;

// --- PRE-COMPILED REGEX PATTERNS ---
const REGEX_TARGET_PROTOCOL = new RegExp(`https?://${TARGET_HOST}`, 'gi');
const REGEX_TARGET_NO_PROTOCOL = new RegExp(`//${TARGET_HOST}`, 'gi');
const REGEX_HTML_ATTRS = /((?:src|href|action|srcset|poster|data-src|data-href)\s*=\s*["'])\/(?!video\/)([^"']*["'])/gi;
const REGEX_NEXT_DOUBLE = /"(\/(?:_next|api|cdn-cgi|hezushon|tv|movie|watch)[^"]*)"/g;
const REGEX_NEXT_SINGLE = /'(\/(?:_next|api|cdn-cgi|hezushon|tv|movie|watch)[^']*)'/g;
const REGEX_PRELOAD = /(rel=["'](?:preload|prefetch|modulepreload)["'][^>]*href=["'])\/(?!video\/)([^"']+["'])/gi;
const REGEX_PRELOAD_REVERSED = /(href=["'])\/(?!video\/)([^"']+["'][^>]*rel=["'](?:preload|prefetch|modulepreload)["'])/gi;
const REGEX_SCRIPT_TAG = /(<script[^>]*>)([\s\S]*?)(<\/script>)/gi;
const REGEX_CSS_URL = /url\(\s*["']?\/([^"')]+)["']?\s*\)/gi;
const REGEX_JSON_URL = new RegExp(`"https?://${TARGET_HOST}`, 'gi');

// NEW: Pattern to match internal paths in JSON/JS that need rewriting
const REGEX_JSON_INTERNAL_PATHS = /"(\/(?:tv|movie|watch)\/[^"]*)"/g;

const REWRITABLE_TYPES = [
    'text/html',
    'text/css',
    'application/javascript',
    'text/javascript',
    'application/json',
];

// --- CACHE ---
interface CacheEntry {
    content: Buffer;
    contentType: string;
    encoding: 'br' | 'gzip' | 'deflate' | 'identity';
    timestamp: number;
    etag: string;
}

const responseCache = new Map<string, CacheEntry>();

function getFromCache(key: string): CacheEntry | null {
    const entry = responseCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        responseCache.delete(key);
        return null;
    }
    return entry;
}

function addToCache(key: string, entry: CacheEntry) {
    if (responseCache.size >= MAX_CACHE_SIZE) {
        const firstKey = responseCache.keys().next().value;
        if (firstKey) responseCache.delete(firstKey);
    }
    responseCache.set(key, entry);
}

// --- IMPROVED INTERCEPTOR SCRIPT ---
const INTERCEPTOR_SCRIPT = `
<script>
(function() {
    const PROXY_PATH = '/video';
    const PROXY_EXT = '/video/ext/';
    
    // Paths that MUST go through the proxy
    const PROXY_PATHS = ['/tv/', '/movie/', '/watch/', '/watch?', '/_next/', '/api/', '/cdn-cgi/', '/hezushon/'];
    
    function shouldProxyPath(path) {
        if (!path) return false;
        if (path.startsWith('/video/')) return false; // Already proxied
        return PROXY_PATHS.some(function(p) { return path.startsWith(p); });
    }
    
    function rewriteUrl(url) {
        if (!url) return url;
        if (typeof url !== 'string') url = String(url);
        
        // Already proxied - don't touch
        if (url.startsWith('/video/') || url.indexOf('/video/') !== -1) {
            return url;
        }
        
        // Root-relative paths (e.g., /tv/123, /movie/456)
        if (url.charAt(0) === '/' && url.charAt(1) !== '/') {
            if (shouldProxyPath(url)) {
                return PROXY_PATH + url;
            }
            return url;
        }
        
        // Protocol-relative URLs (//example.com/...)
        if (url.startsWith('//')) {
            return PROXY_EXT + 'https/' + url.substring(2);
        }
        
        // Absolute URLs
        if (url.startsWith('http://') || url.startsWith('https://')) {
            try {
                var parsed = new URL(url);
                // Same origin - check if path needs proxying
                if (parsed.origin === window.location.origin) {
                    if (shouldProxyPath(parsed.pathname)) {
                        return PROXY_PATH + parsed.pathname + parsed.search + parsed.hash;
                    }
                    return url;
                }
                // External URL - proxy it
                return PROXY_EXT + url.replace('://', '/');
            } catch(e) {
                return url;
            }
        }
        
        return url;
    }

    // --- FETCH INTERCEPT ---
    var originalFetch = window.fetch;
    window.fetch = function(input, init) {
        var newInput = input;
        if (typeof input === 'string') {
            newInput = rewriteUrl(input);
        } else if (input && typeof input.url === 'string') {
            var newUrl = rewriteUrl(input.url);
            if (newUrl !== input.url) {
                newInput = new Request(newUrl, input);
            }
        }
        return originalFetch.call(window, newInput, init);
    };

    // --- XHR INTERCEPT ---
    var originalXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        var args = Array.prototype.slice.call(arguments);
        args[1] = rewriteUrl(url);
        return originalXhrOpen.apply(this, args);
    };

    // --- HISTORY API INTERCEPT ---
    var originalPushState = history.pushState;
    var originalReplaceState = history.replaceState;

    history.pushState = function(state, unused, url) {
        var newUrl = url ? rewriteUrl(String(url)) : url;
        return originalPushState.call(history, state, unused, newUrl);
    };

    history.replaceState = function(state, unused, url) {
        var newUrl = url ? rewriteUrl(String(url)) : url;
        return originalReplaceState.call(history, state, unused, newUrl);
    };
    
    // --- LOCATION INTERCEPT ---
    try {
        var originalAssign = location.assign.bind(location);
        var originalReplace = location.replace.bind(location);
        
        location.assign = function(url) {
            return originalAssign(rewriteUrl(url));
        };
        
        location.replace = function(url) {
            return originalReplace(rewriteUrl(url));
        };
    } catch(e) {}
    
    // --- WINDOW.OPEN INTERCEPT ---
    var originalWindowOpen = window.open;
    window.open = function(url, target, features) {
        return originalWindowOpen.call(window, rewriteUrl(url), target, features);
    };
    
    // --- CLICK HANDLER (Capture Phase) ---
    document.addEventListener('click', function(e) {
        var target = e.target;
        // Walk up to find anchor tag
        while (target && target.tagName !== 'A') {
            target = target.parentElement;
        }

        if (target && target.href) {
            try {
                var url = new URL(target.href, window.location.origin);
                // Only intercept same-origin navigations
                if (url.origin === window.location.origin && shouldProxyPath(url.pathname)) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    window.location.href = PROXY_PATH + url.pathname + url.search + url.hash;
                    return false;
                }
            } catch(err) {}
        }
    }, true);
    
    // --- FORM SUBMIT INTERCEPT ---
    document.addEventListener('submit', function(e) {
        var form = e.target;
        if (form && form.action) {
            try {
                var url = new URL(form.action, window.location.origin);
                if (url.origin === window.location.origin && shouldProxyPath(url.pathname)) {
                    form.action = PROXY_PATH + url.pathname + url.search;
                }
            } catch(err) {}
        }
    }, true);
    
    // --- POPSTATE HANDLER (Back/Forward buttons) ---
    window.addEventListener('popstate', function(e) {
        // If somehow we ended up at a non-proxied path, redirect
        if (shouldProxyPath(window.location.pathname)) {
            window.location.href = PROXY_PATH + window.location.pathname + window.location.search + window.location.hash;
        }
    });
    
    // --- MUTATION OBSERVER (Catch dynamically added links) ---
    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) { // Element node
                    // Check the node itself
                    if (node.tagName === 'A' && node.href) {
                        try {
                            var url = new URL(node.href, window.location.origin);
                            if (url.origin === window.location.origin && shouldProxyPath(url.pathname)) {
                                node.href = PROXY_PATH + url.pathname + url.search + url.hash;
                            }
                        } catch(e) {}
                    }
                    // Check child anchor tags
                    var anchors = node.querySelectorAll ? node.querySelectorAll('a[href]') : [];
                    anchors.forEach(function(a) {
                        try {
                            var url = new URL(a.href, window.location.origin);
                            if (url.origin === window.location.origin && shouldProxyPath(url.pathname)) {
                                a.href = PROXY_PATH + url.pathname + url.search + url.hash;
                            }
                        } catch(e) {}
                    });
                }
            });
        });
    });
    
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
</script>
`;

function needsRewriting(contentType: string | null): boolean {
    if (!contentType) return false;
    return REWRITABLE_TYPES.some(type => contentType.includes(type));
}

function rewriteContent(content: string, contentType: string | null, proxyBase: string): string {
    let rewritten = content;

    // Rewrite absolute URLs to the target
    rewritten = rewritten.replace(REGEX_TARGET_PROTOCOL, proxyBase);

    // Rewrite protocol-relative URLs
    rewritten = rewritten.replace(REGEX_TARGET_NO_PROTOCOL, proxyBase.replace(/^https?:/, ''));

    // For HTML content
    if (contentType?.includes('text/html')) {
        rewritten = rewritten.replace(REGEX_HTML_ATTRS, `$1${PROXY_PATH}/$2`);
        rewritten = rewritten.replace(REGEX_NEXT_DOUBLE, `"${PROXY_PATH}$1"`);
        rewritten = rewritten.replace(REGEX_NEXT_SINGLE, `'${PROXY_PATH}$1'`);
        rewritten = rewritten.replace(REGEX_PRELOAD, `$1${PROXY_PATH}/$2`);
        rewritten = rewritten.replace(REGEX_PRELOAD_REVERSED, `$1${PROXY_PATH}/$2`);

        // Rewrite __NEXT_DATA__ and other inline scripts
        rewritten = rewritten.replace(
            REGEX_SCRIPT_TAG,
            (match, openTag, scriptContent, closeTag) => {
                let rewrittenContent = scriptContent;

                // Rewrite paths in JSON-like structures
                rewrittenContent = rewrittenContent.replace(REGEX_JSON_INTERNAL_PATHS, `"${PROXY_PATH}$1"`);
                rewrittenContent = rewrittenContent.replace(REGEX_NEXT_DOUBLE, `"${PROXY_PATH}$1"`);
                rewrittenContent = rewrittenContent.replace(REGEX_NEXT_SINGLE, `'${PROXY_PATH}$1'`);

                return openTag + rewrittenContent + closeTag;
            }
        );

        // Inject interceptor as early as possible (after <head> opens, before other scripts)
        if (rewritten.includes('<head>')) {
            rewritten = rewritten.replace('<head>', '<head>' + INTERCEPTOR_SCRIPT);
        } else if (rewritten.includes('<head ')) {
            rewritten = rewritten.replace(/<head[^>]*>/, '$&' + INTERCEPTOR_SCRIPT);
        } else {
            rewritten = rewritten.replace('</head>', INTERCEPTOR_SCRIPT + '</head>');
        }
    }

    // For JavaScript content
    if (contentType?.includes('javascript')) {
        const targets = ['_next', 'api', 'cdn-cgi', 'hezushon', 'tv', 'movie', 'watch'];
        const pattern = targets.join('|');

        // Match paths with various endings (not just trailing slash)
        rewritten = rewritten.replace(new RegExp(`"(\\/(${pattern})(?:\\/[^"]*|[^"]*))(?=")`, 'g'), `"${PROXY_PATH}$1`);
        rewritten = rewritten.replace(new RegExp(`'(\\/(${pattern})(?:\\/[^']*|[^']*))(?=')`, 'g'), `'${PROXY_PATH}$1`);
        rewritten = rewritten.replace(new RegExp(`\`(\\/(${pattern})(?:\\/[^\`]*|[^\`]*))\``, 'g'), `\`${PROXY_PATH}$1\``);
    }

    // For CSS content
    if (contentType?.includes('text/css')) {
        rewritten = rewritten.replace(REGEX_CSS_URL, `url("${PROXY_PATH}/$1")`);
    }

    // For JSON content
    if (contentType?.includes('application/json')) {
        rewritten = rewritten.replace(REGEX_JSON_URL, `"${proxyBase}`);
        // Also rewrite internal paths in JSON
        rewritten = rewritten.replace(REGEX_JSON_INTERNAL_PATHS, `"${PROXY_PATH}$1"`);
    }

    return rewritten;
}

function rewriteCookieHeader(cookie: string): string {
    let rewritten = cookie.replace(/;\s*domain=[^;]*/gi, '');
    rewritten = rewritten.replace(/;\s*path=\//gi, `; Path=${PROXY_PATH}/`);
    return rewritten;
}

function compressContent(content: string | Buffer, acceptEncoding: string): { buffer: Buffer, encoding: 'br' | 'gzip' | 'deflate' | 'identity' } {
    const input = Buffer.isBuffer(content) ? content : Buffer.from(content);

    if (acceptEncoding.includes('br')) {
        try {
            return { buffer: brotliCompressSync(input), encoding: 'br' };
        } catch (e) { /* fall through */ }
    }

    if (acceptEncoding.includes('gzip')) {
        return { buffer: gzipSync(input), encoding: 'gzip' };
    }

    if (acceptEncoding.includes('deflate')) {
        return { buffer: deflateSync(input), encoding: 'deflate' };
    }

    return { buffer: input, encoding: 'identity' };
}

export async function handleProxyRequest(
    request: Request,
    proxyBase: string
): Promise<Response> {
    const url = new URL(request.url);
    const targetPath = url.pathname.replace(new RegExp(`^${PROXY_PATH}`), '') || '/';
    const targetUrl = new URL(targetPath + url.search, TARGET_ORIGIN);

    const cacheKey = request.method === 'GET' ? targetUrl.toString() : null;

    if (cacheKey) {
        const cached = getFromCache(cacheKey);
        if (cached) {
            const acceptEncoding = request.headers.get('accept-encoding') || '';
            if (acceptEncoding.includes(cached.encoding) || cached.encoding === 'identity') {
                return new Response(cached.content as any, {
                    status: 200,
                    headers: {
                        'Content-Type': cached.contentType,
                        'Content-Encoding': cached.encoding,
                        'Cache-Control': 'public, max-age=60',
                        'X-Proxy-Cache': 'HIT',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
        }
    }

    const proxyHeaders = new Headers();
    for (const [key, value] of request.headers.entries()) {
        const lowerKey = key.toLowerCase();
        if (['host', 'connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade'].includes(lowerKey)) continue;
        proxyHeaders.set(key, value);
    }
    proxyHeaders.set('Host', TARGET_HOST);
    proxyHeaders.set('Accept-Encoding', 'gzip, deflate, br');

    const referer = request.headers.get('referer');
    if (referer) {
        try {
            const refererUrl = new URL(referer);
            if (refererUrl.pathname.startsWith(PROXY_PATH)) {
                refererUrl.host = TARGET_HOST;
                refererUrl.pathname = refererUrl.pathname.replace(PROXY_PATH, '');
                proxyHeaders.set('Referer', refererUrl.toString());
            } else {
                proxyHeaders.set('Referer', TARGET_ORIGIN + '/');
            }
        } catch { }
    } else {
        proxyHeaders.set('Referer', TARGET_ORIGIN + '/');
    }

    const origin = request.headers.get('origin');
    if (origin) proxyHeaders.set('Origin', TARGET_ORIGIN);

    try {
        const proxyResponse = await fetch(targetUrl.toString(), {
            method: request.method,
            headers: proxyHeaders,
            body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : undefined,
            redirect: 'manual',
        });

        const responseHeaders = new Headers();
        for (const [key, value] of proxyResponse.headers.entries()) {
            const lowerKey = key.toLowerCase();
            if (['connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'content-length', 'content-encoding'].includes(lowerKey)) continue;

            if (lowerKey === 'location') {
                let location = value;
                if (location.startsWith('/')) {
                    location = `${PROXY_PATH}${location}`;
                } else if (location.includes(TARGET_HOST)) {
                    location = location.replace(TARGET_ORIGIN, proxyBase);
                }
                responseHeaders.set(key, location);
                continue;
            }
            if (lowerKey === 'set-cookie') {
                responseHeaders.append(key, rewriteCookieHeader(value));
                continue;
            }
            if (['content-security-policy', 'content-security-policy-report-only', 'x-frame-options'].includes(lowerKey)) continue;

            responseHeaders.set(key, value);
        }

        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        responseHeaders.set('Access-Control-Allow-Headers', '*');

        const contentType = proxyResponse.headers.get('content-type');

        if (needsRewriting(contentType)) {
            const text = await proxyResponse.text();
            const rewrittenContent = rewriteContent(text, contentType, proxyBase);
            const acceptEncoding = request.headers.get('accept-encoding') || '';
            const { buffer, encoding } = compressContent(rewrittenContent, acceptEncoding);

            responseHeaders.set('Content-Encoding', encoding);
            responseHeaders.set('X-Proxy-Cache', 'MISS');

            if (cacheKey && proxyResponse.status === 200) {
                addToCache(cacheKey, {
                    content: buffer,
                    contentType: contentType || 'text/plain',
                    encoding,
                    timestamp: Date.now(),
                    etag: `W/"${Date.now()}"`
                });
            }

            return new Response(buffer as any, {
                status: proxyResponse.status,
                statusText: proxyResponse.statusText,
                headers: responseHeaders,
            });
        }

        return new Response(proxyResponse.body, {
            status: proxyResponse.status,
            statusText: proxyResponse.statusText,
            headers: responseHeaders,
        });

    } catch (error) {
        console.error('[vidfast-proxy] Error:', error);
        return new Response(`Proxy error: ${error}`, {
            status: 502,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

export async function handleExtProxyRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    if (parts.length < 5) return new Response("Invalid proxy URL format", { status: 400 });

    const protocol = parts[3];
    const host = parts[4];
    const path = parts.slice(5).join('/');
    const targetUrl = `${protocol}://${host}/${path}${url.search}`;

    try {
        const headers = new Headers();
        const forbidden = ['host', 'origin', 'referer', 'connection', 'keep-alive', 'transfer-encoding'];

        for (const [key, value] of request.headers.entries()) {
            if (!forbidden.includes(key.toLowerCase())) headers.set(key, value);
        }
        headers.set('Origin', TARGET_ORIGIN);
        headers.set('Referer', TARGET_ORIGIN + '/');

        const response = await fetch(targetUrl, {
            method: request.method,
            headers: headers,
            body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : undefined,
            redirect: 'follow'
        });

        const responseHeaders = new Headers(response.headers);
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
        responseHeaders.set('Access-Control-Allow-Headers', '*');
        responseHeaders.delete('x-frame-options');
        responseHeaders.delete('content-security-policy');

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders
        });

    } catch (e) {
        return new Response(`External proxy error: ${e}`, { status: 502 });
    }
}

export function shouldProxy(pathname: string): boolean {
    return pathname.startsWith(PROXY_PATH) ||
        pathname.startsWith('/_next/') ||
        pathname.startsWith('/api/') ||
        pathname.startsWith('/cdn-cgi/') ||
        pathname.startsWith('/hezushon/') ||
        pathname === '/4k.png';
}

export { PROXY_PATH, TARGET_HOST, TARGET_ORIGIN };