(() => {
  'use strict';
  function initHeroCarousel() {
    const root = document.getElementById('courtgo-hero-carousel');
    if (!root) return;

    const slides = Array.from(root.querySelectorAll('.hero-carousel-slide'));
    const dots = Array.from(root.querySelectorAll('.hero-carousel-dot'));

    if (slides.length <= 1) return;

    let current = 0;
    let timer = null;
    const INTERVAL = 3800; // Tự động chạy mỗi 3.8 giây

    function goTo(index) {
      slides[current]?.classList.remove('active');
      dots[current]?.classList.remove('active');
      dots[current]?.setAttribute('aria-selected', 'false');

      current = (index + slides.length) % slides.length;

      slides[current]?.classList.add('active');
      dots[current]?.classList.add('active');
      dots[current]?.setAttribute('aria-selected', 'true');
    }

    function next() {
      goTo(current + 1);
    }

    function start() {
      stop();
      timer = setInterval(next, INTERVAL);
    }

    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    // Nút nhỏ để đổi slide bên dưới
    dots.forEach((dot, idx) => {
      dot.addEventListener('click', (e) => {
        e.preventDefault();
        goTo(idx);
        start(); // Reset timer để tiếp tục tự động chạy
      });
    });

    // Luôn luôn tự động chạy mượt mà
    start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeroCarousel);
  } else {
    initHeroCarousel();
  }
})();
