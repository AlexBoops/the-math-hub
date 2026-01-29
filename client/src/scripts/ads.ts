

document.addEventListener('DOMContentLoaded', () => {

    const adContainer = document.getElementById('ad-container');
    if (!adContainer) return;

    // Add ad content structure
    adContainer.innerHTML = `
        <div class="ad-close" title="Close">×</div>
        <div class="ad-content"></div>
    `;

    const adContent = adContainer.querySelector('.ad-content');
    if (adContent) {
        // Create atOptions script
        const script1 = document.createElement('script');
        script1.type = 'text/javascript';
        script1.text = `
            atOptions = {
                'key' : '0b4f29943f8825bf9a2e81a67765af8b',
                'format' : 'iframe',
                'height' : 90,
                'width' : 728,
                'params' : {}
            };
        `;
        adContent.appendChild(script1);

        // Create invoke.js script with proxy fallback
        const script2 = document.createElement('script');
        script2.type = 'text/javascript';

        const localads = true;

        if (localads) {
            script2.src = '/ads.js';
        } else {
            // Try proxy first, fallback to direct URL on error
            const proxyUrl = '/api/ad-proxy';
            const directUrl = 'https://thieflamppost.com/0b4f29943f8825bf9a2e81a67765af8b/invoke.js';

            script2.src = proxyUrl;

            // Fallback to direct URL if proxy fails
            script2.onerror = () => {
                console.warn('Ad proxy failed, falling back to direct URL');
                const fallbackScript = document.createElement('script');
                fallbackScript.type = 'text/javascript';
                fallbackScript.src = directUrl;
                fallbackScript.onerror = () => {
                    console.error('Both ad proxy and direct URL failed');
                };
                adContent.appendChild(fallbackScript);
            };
        }

        adContent.appendChild(script2);
    }

    const closeBtn = adContainer.querySelector('.ad-close');

    let isCollapsed = false;
    let isExpanding = false;
    let lastUncollapsedTime = 0;

    const collapseAd = () => {
        if (isCollapsed) return;
        isCollapsed = true;
        adContainer.classList.add('collapsed');
        adContainer.classList.remove('popping');
    };

    const expandAd = () => {
        if (!isCollapsed || isExpanding) return;

        // Cooldown to prevent instant pop-back if the user's mouse is already there
        if (Date.now() - lastUncollapsedTime < 600) return;

        isExpanding = true;

        // Use the popping animation
        adContainer.classList.add('popping');
        adContainer.classList.remove('collapsed');

        setTimeout(() => {
            isCollapsed = false;
            isExpanding = false;
            lastUncollapsedTime = Date.now();
            // We keep the popping class for a bit to finish animation then remove it
            setTimeout(() => {
                adContainer.classList.remove('popping');
            }, 400);
        }, 100);
    };

    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            collapseAd();
            lastUncollapsedTime = Date.now();
        });
    }

    // Annoying behavior: Pop back out if cursor is near
    document.addEventListener('mousemove', (e) => {
        if (!isCollapsed || isExpanding) return;

        const rect = adContainer.getBoundingClientRect();
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        // Check distance to the collapsed container
        const distanceThreshold = 200; // Even more aggressive threshold

        // If mouse is within the vertical bounds of the ad and within the threshold of the left edge
        if (mouseY >= rect.top - distanceThreshold &&
            mouseY <= rect.bottom + distanceThreshold &&
            mouseX >= rect.left - distanceThreshold) {
            expandAd();
        }
    });

    // Also expand if specifically hovered
    adContainer.addEventListener('mouseenter', () => {
        if (isCollapsed) expandAd();
    });
});
