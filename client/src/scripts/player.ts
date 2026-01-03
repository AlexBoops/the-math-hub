const playerFrame = document.getElementById("player-frame") as HTMLIFrameElement;
const urlParams = new URLSearchParams(window.location.search);
const movie = urlParams.get('type') === 'movie';
const id = urlParams.get('id');
const season = urlParams.get('s') || '';
const episode = urlParams.get('e') || '';

if (movie) {
    playerFrame.src = `https://vidfast.pro/movie/${id}?theme=2980B9`;
} else if (season && episode) {
    playerFrame.src = `https://vidfast.pro/tv/${id}/${season}/${episode}?theme=2980B9`;
} else {
    playerFrame.src = `https://vidfast.pro/tv/${id}?theme=2980B9`;
}