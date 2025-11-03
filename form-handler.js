// =======================================================
// form-handler.js (Handles Contact Form Submission via AJAX)
// =======================================================

document.addEventListener("DOMContentLoaded", function () {
    const contactForm = document.getElementById('contact-form');
    const formStatus = document.getElementById('form-status');
    const submitButton = contactForm.querySelector('button[type="submit"]');

    if (!contactForm) {
        return; // Exit if the form isn't on this page
    }

    contactForm.addEventListener("submit", async function (e) {
        e.preventDefault(); // Stop the default HTML form submission

        const originalButtonText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.textContent = "Sending...";
        formStatus.textContent = ""; // Clear previous messages

        // Get the form data
        const formData = new FormData(contactForm);

        // --- IMPORTANT ---
        // This is your public access key
        const ACCESS_KEY = "54d7cabc-62b2-4719-b498-e7aec023da27"; 
        formData.append("access_key", ACCESS_KEY);
        
        // Add a subject for the email
        formData.append("subject", "New Inquiry from Kevin Roden Photography");
        
        // Honeypot field for spam (must match the HTML)
        formData.append("botcheck", ""); 

        try {
            const response = await fetch("https://api.web3forms.com/submit", {
                method: "POST",
                body: formData,
            });

            const result = await response.json();

            if (result.success) {
                // SUCCESS!
                contactForm.reset(); // Clear the form fields
                formStatus.textContent = "Thank you! Your message has been sent.";
                formStatus.classList.add("success");
                formStatus.classList.remove("error");
                submitButton.textContent = "Message Sent!";
                // We leave the button disabled to prevent re-submission
            } else {
                // ERROR from the server
                console.error("Error from Web3Forms:", result.message);
                formStatus.textContent = "An error occurred. Please try again.";
                formStatus.classList.add("error");
                formStatus.classList.remove("success");
                submitButton.disabled = false;
                submitButton.textContent = originalButtonText;
            }
        } catch (error) {
            // NETWORK ERROR
            console.error("Network Error:", error);
            formStatus.textContent = "A network error occurred. Please check your connection and try again.";
            formStatus.classList.add("error");
            formStatus.classList.remove("success");
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        }
    });
});