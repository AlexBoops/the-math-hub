
document.addEventListener('DOMContentLoaded', () => {
    const adContainer = document.getElementById('ad-container');
    if (!adContainer) return;

    // Add ad content
    adContainer.innerHTML = `
        <div class="ad-close" title="Close">×</div>
        <div class="ad-content">
        <script>
  atOptions = {
    'key' : '0b4f29943f8825bf9a2e81a67765af8b',
    'format' : 'iframe',
    'height' : 90,
    'width' : 728,
    'params' : {}
  };
</script>
<script src="https://thieflamppost.com/0b4f29943f8825bf9a2e81a67765af8b/invoke.js"></script>
        </div>
    `;

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
