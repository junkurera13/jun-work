const lightbox = document.querySelector(".lightbox");
const slide = document.querySelector(".lightbox-slide");
const lightboxVideo = document.querySelector(".lightbox-video");
const slideCount = document.querySelector(".slide-count");
const productPicker = document.querySelector(".product-picker");
const productPickerTrigger = document.querySelector(".product-picker-trigger");
const productPickerLabel = document.querySelector(".product-picker-label");
const productPickerMenu = document.querySelector(".product-picker-menu");
const productPickerOptions = [...document.querySelectorAll(".product-picker-option")];
const closeButton = document.querySelector(".close-button");
const previousButton = document.querySelector(".nav-button--previous");
const nextButton = document.querySelector(".nav-button--next");
const shots = [...document.querySelectorAll(".project-shot")];
const inlineVideos = [...document.querySelectorAll(".project-shot video")];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const projects = {
  chapter: {
    label: "Chapter",
    slides: [
      { type: "video", src: "/videos/chapter/chapter.mp4", width: 1920, height: 1078 },
      { type: "image", src: "/images/chapter/ch2.png", width: 3420, height: 2004 },
      { type: "image", src: "/images/chapter/ch3.png", width: 3420, height: 2004 },
      { type: "image", src: "/images/chapter/ch4.png", width: 3420, height: 2008 },
      { type: "image", src: "/images/chapter/ch5.png", width: 3420, height: 2026 },
      { type: "image", src: "/images/chapter/ch6.png", width: 3420, height: 2018 },
      { type: "image", src: "/images/chapter/ch7.png", width: 3420, height: 2018 },
      { type: "image", src: "/images/chapter/ch8.png", width: 3420, height: 2014 },
      { type: "image", src: "/images/chapter/ch9.png", width: 3420, height: 2026 },
    ],
  },
  clawbucket: {
    label: "Clawbucket",
    slides: [
  { src: "/images/clawbucket/cb1.png", width: 1920, height: 1010 },
  { src: "/images/clawbucket/cb4-focused.png", width: 1122, height: 1402 },
      { src: "/images/clawbucket/cb2-focused.png", width: 1393, height: 1129 },
  { src: "/images/clawbucket/cb3-focused.png", width: 1724, height: 912 },
    ],
  },
  playmosaic: {
    label: "PlayMosaic",
    slides: [
      { type: "image", src: "/images/playmosaic/m1.png", width: 3420, height: 2058 },
      { type: "image", src: "/images/playmosaic/m2.png", width: 3420, height: 2062 },
      { type: "image", src: "/images/playmosaic/m4.png", width: 3420, height: 2066 },
      { type: "image", src: "/images/playmosaic/m3.png", width: 2868, height: 2062 },
      { type: "image", src: "/images/playmosaic/m5.png", width: 2880, height: 2058 },
      { type: "image", src: "/images/playmosaic/m6.png", width: 2844, height: 1354 },
      { type: "image", src: "/images/playmosaic/m7.png", width: 2880, height: 2066 },
      { type: "image", src: "/images/playmosaic/m8.png", width: 3420, height: 2066 },
      { type: "image", src: "/images/playmosaic/m9.png", width: 3420, height: 2072 },
    ],
  },
  hokshi: {
    label: "Hokshi",
  slides: [
    { type: "image", src: "/images/hokshi/h1.png", width: 3420, height: 2026 },
    { type: "image", src: "/images/hokshi/korean-hero.png", width: 1920, height: 1080 },
    { type: "image", src: "/images/hokshi/h2.png", width: 2000, height: 1100 },
    { type: "image", src: "/images/hokshi/h3.png", width: 1996, height: 1104 },
    { type: "image", src: "/images/hokshi/h4.png", width: 2176, height: 1114 },
    { type: "image", src: "/images/hokshi/h5.png", width: 1376, height: 816, cropY: 1.006 },
    { type: "image", src: "/images/hokshi/login-card.png", width: 1200, height: 1400 },
    ],
  },
  oddware: {
    label: "Oddware",
    slides: [
      { type: "image", src: "/images/oddware/o1.png", width: 1920, height: 1004 },
      {
        type: "video",
        src: "/videos/oddware/oddware-hover-demo.mp4?v=3",
        width: 1820,
        height: 1080,
      },
    ],
  },
  cast: {
    label: "Cast",
    slides: [
      { type: "image", src: "/images/cast/c1.png", width: 1920, height: 998 },
      { type: "video", src: "/videos/cast/c11.mp4?v=2", width: 1792, height: 1080 },
      { type: "image", src: "/images/cast/c2.png", width: 1920, height: 548 },
      { type: "image", src: "/images/cast/c3.png", width: 1920, height: 990 },
      { type: "image", src: "/images/cast/c10.png", width: 788, height: 214 },
      { type: "image", src: "/images/cast/c4.png", width: 1920, height: 1020 },
      { type: "image", src: "/images/cast/c12.png", width: 1340, height: 1644 },
      { type: "image", src: "/images/cast/c5.png", width: 3420, height: 2032 },
      { type: "image", src: "/images/cast/c6.png", width: 3420, height: 2058 },
      { type: "image", src: "/images/cast/c7.png", width: 3420, height: 2080 },
      { type: "video", src: "/videos/cast/cast.mp4", width: 1776, height: 1080 },
      { type: "image", src: "/images/cast/c8.png", width: 3420, height: 2066 },
      { type: "image", src: "/images/cast/c9.png", width: 3420, height: 2076 },
    ],
  },
};

let activeProjectKey = "clawbucket";
let activeSlide = 0;
let closeTimer;

const formatNumber = (number) => String(number).padStart(2, "0");

inlineVideos.forEach((video) => {
  const play = () => video.play().catch(() => {});
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) play();
  else video.addEventListener("canplay", play, { once: true });
});

function updateSlide(nextIndex, direction = 1, animate = true) {
  const activeProject = projects[activeProjectKey];
  const slideTotal = activeProject.slides.length;
  activeSlide = (nextIndex + slideTotal) % slideTotal;
  const selectedSlide = activeProject.slides[activeSlide];
  const isVideo = selectedSlide.type === "video";

  if (isVideo) {
    slide.style.backgroundImage = "none";
    if (lightboxVideo.getAttribute("src") !== selectedSlide.src) {
      lightboxVideo.src = selectedSlide.src;
    }
    lightboxVideo.hidden = false;
    lightboxVideo.currentTime = 0;
    lightboxVideo.play().catch(() => {});
  } else {
    lightboxVideo.pause();
    lightboxVideo.hidden = true;
    slide.style.backgroundImage = `url("${selectedSlide.src}")`;
    slide.style.backgroundSize = selectedSlide.cropY ? `auto ${selectedSlide.cropY * 100}%` : "cover";
  }

  slide.style.setProperty("--slide-ratio", selectedSlide.width / selectedSlide.height);
  slideCount.textContent = `${formatNumber(activeSlide + 1)} / ${formatNumber(slideTotal)}`;
  slide.setAttribute(
    "aria-label",
    `${activeProject.label} ${isVideo ? "video" : "screenshot"} ${activeSlide + 1} of ${slideTotal}`,
  );
  previousButton.disabled = slideTotal <= 1;
  nextButton.disabled = slideTotal <= 1;

  if (!animate || reducedMotion.matches) return;

  slide.getAnimations().forEach((animation) => animation.cancel());
  slide.animate(
    [
      {
        opacity: 0.55,
        transform: `translate3d(${direction * 2.5}%, 0, -28px) rotateY(${direction * -3}deg)`,
      },
      {
        opacity: 1,
        transform: "translate3d(0, 0, 0) rotateY(0deg)",
      },
    ],
    {
      duration: 240,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
    },
  );
}

function openLightbox(projectKey, index) {
  window.clearTimeout(closeTimer);
  activeProjectKey = projectKey;
  updateProductPicker(projectKey);
  updateSlide(index, 1, false);
  lightbox.showModal();
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => lightbox.setAttribute("data-open", ""));
  });
}

function closeLightbox() {
  if (!lightbox.open) return;
  closeProductPicker(false);
  lightboxVideo.pause();
  lightbox.removeAttribute("data-open");
  closeTimer = window.setTimeout(
    () => {
      lightbox.close();
      document.body.style.overflow = "";
    },
    reducedMotion.matches ? 100 : 250,
  );
}

shots.forEach((shot) => {
  shot.addEventListener("click", () => {
    openLightbox(shot.dataset.project, Number(shot.dataset.slide));
  });
});

function updateProductPicker(projectKey) {
  productPickerLabel.textContent = projects[projectKey].label;
  productPickerOptions.forEach((option) => {
    option.setAttribute("aria-selected", String(option.dataset.project === projectKey));
  });
}

function openProductPicker() {
  productPickerMenu.hidden = false;
  productPicker.setAttribute("data-open", "");
  productPickerTrigger.setAttribute("aria-expanded", "true");
  const activeOption = productPickerOptions.find(
    (option) => option.dataset.project === activeProjectKey,
  );
  requestAnimationFrame(() => activeOption?.focus());
}

function closeProductPicker(returnFocus = true) {
  if (productPickerMenu.hidden) return;
  productPicker.removeAttribute("data-open");
  productPickerTrigger.setAttribute("aria-expanded", "false");
  productPickerMenu.hidden = true;
  if (returnFocus) productPickerTrigger.focus();
}

function selectProject(projectKey) {
  activeProjectKey = projectKey;
  updateProductPicker(projectKey);
  updateSlide(0, 1, !reducedMotion.matches);
  closeProductPicker();
}

productPickerTrigger.addEventListener("click", () => {
  if (productPickerMenu.hidden) openProductPicker();
  else closeProductPicker();
});

productPickerTrigger.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  openProductPicker();
});

productPickerOptions.forEach((option) => {
  option.addEventListener("click", () => selectProject(option.dataset.project));
});

productPickerMenu.addEventListener("keydown", (event) => {
  const currentIndex = productPickerOptions.indexOf(document.activeElement);
  let nextIndex = currentIndex;

  if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % productPickerOptions.length;
  else if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + productPickerOptions.length) % productPickerOptions.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = productPickerOptions.length - 1;
  else if (event.key === "Escape") {
    event.preventDefault();
    closeProductPicker();
    return;
  } else return;

  event.preventDefault();
  productPickerOptions[nextIndex].focus();
});

previousButton.addEventListener("click", () => updateSlide(activeSlide - 1, -1));
nextButton.addEventListener("click", () => updateSlide(activeSlide + 1, 1));
closeButton.addEventListener("click", closeLightbox);

lightbox.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeLightbox();
});

lightbox.addEventListener("click", (event) => {
  if (!productPickerMenu.hidden && !productPicker.contains(event.target)) {
    closeProductPicker(false);
  }
  if (event.target === lightbox) closeLightbox();
});

document.addEventListener("keydown", (event) => {
  if (!lightbox.open) return;

  if (event.key === "Escape") {
    event.preventDefault();
    if (!productPickerMenu.hidden) {
      closeProductPicker();
      return;
    }
    closeLightbox();
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    updateSlide(activeSlide - 1, -1, false);
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    updateSlide(activeSlide + 1, 1, false);
  }
});
