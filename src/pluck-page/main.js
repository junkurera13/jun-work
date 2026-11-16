// The Pluck project page: the skin at work on this site, playing a clip streamed from Mux.
import '@fontsource-variable/figtree';
import '@videojs/html/i18n';
import '@videojs/html/video/player';
import '@videojs/html/media/mux-video';
import '../pluck/video/skin';
import skinTemplate from '../pluck/video/skin.html?raw';
import './page.css';

const PLAYBACK_ID = 'xG01564UK84ImVKRj200Csx6TONQIUVm1Oav1Egu02clAU';
const SRC = `https://stream.mux.com/${PLAYBACK_ID}.m3u8`;
const POSTER = `https://image.mux.com/${PLAYBACK_ID}/thumbnail.webp?time=9`;
const CHAPTERS = '/pluck/van-session-chapters.vtt';

const player = document.createElement('video-player');

player.setAttribute('poster', POSTER);
player.innerHTML = skinTemplate.replace(
  '<!-- Add a compatible media component here. -->',
  `<mux-video src="${SRC}" playsinline crossorigin><track kind="chapters" label="English" srclang="en" src="${CHAPTERS}" default></mux-video>`
);

const i18n = document.createElement('media-i18n');

i18n.append(player);
document.getElementById('player').append(i18n);
