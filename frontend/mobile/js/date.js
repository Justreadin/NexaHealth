
    document.addEventListener("DOMContentLoaded", function () {
        const dateSpan = document.getElementById("current-date");
        const now = new Date();

        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        const formattedDate = now.toLocaleDateString('en-US', options);

        dateSpan.textContent = formattedDate;
    });

