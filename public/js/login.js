
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");

loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    loginMessage.textContent = "Verifying credentials...";
    loginMessage.style.color = "#788198";

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify({
                email: email,
                password: password
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Login failed.");
        }

        loginMessage.textContent = "Login successful. Redirecting...";
        loginMessage.style.color = "#087f5b";

        window.location.assign(result.redirect);
    } catch (error) {
        loginMessage.textContent = error.message;
        loginMessage.style.color = "#c0392b";
    }
});
