
const registerForm = document.getElementById("registerForm");
const registerMessage = document.getElementById("registerMessage");

registerForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    registerMessage.textContent = "Submitting your registration...";
    registerMessage.style.color = "#788198";

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const institute = document.getElementById("institute").value.trim();
    const password = document.getElementById("password").value;

    try {
        const response = await fetch("/api/auth/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: name,
                email: email,
                institute: institute,
                password: password
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Registration failed.");
        }

        registerMessage.textContent = result.message;
        registerMessage.style.color = "#087f5b";
        registerForm.reset();
    } catch (error) {
        registerMessage.textContent = error.message;
        registerMessage.style.color = "#c0392b";
    }
});
