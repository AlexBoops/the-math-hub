
document.addEventListener('DOMContentLoaded', () => {
    const adContainer = document.getElementById('ad-container');
    if (!adContainer) return;

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

        if (Date.now() - lastUncollapsedTime < 600) return;

        isExpanding = true;

        adContainer.classList.add('popping');
        adContainer.classList.remove('collapsed');

        setTimeout(() => {
            isCollapsed = false;
            isExpanding = false;
            lastUncollapsedTime = Date.now();
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

    document.addEventListener('mousemove', (e) => {
        if (!isCollapsed || isExpanding) return;

        const rect = adContainer.getBoundingClientRect();
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        const distanceThreshold = 200;

        if (mouseY >= rect.top - distanceThreshold &&
            mouseY <= rect.bottom + distanceThreshold &&
            mouseX >= rect.left - distanceThreshold) {
            expandAd();
        }
    });

    adContainer.addEventListener('mouseenter', () => {
        if (isCollapsed) expandAd();
    });
});
