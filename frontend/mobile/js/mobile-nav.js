document.addEventListener("DOMContentLoaded", () => {
    const menuButton = document.getElementById("mobile-menu-button");
    const mobileMenu = document.getElementById("mobile-menu");
    let isOpen = false;

    menuButton.addEventListener("click", () => {
      isOpen = !isOpen;
      mobileMenu.classList.toggle("translate-y-0", isOpen);
      mobileMenu.classList.toggle("-translate-y-full", !isOpen);
    });

    document.addEventListener("click", (e) => {
      if (!menuButton.contains(e.target) && !mobileMenu.contains(e.target) && isOpen) {
        mobileMenu.classList.remove("translate-y-0");
        mobileMenu.classList.add("-translate-y-full");
        isOpen = false;
      }
    });
  });

