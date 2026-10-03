/* ============================================================
   tripreviewall.com — Contact page form (sends to /api/leads)
   ============================================================ */
(function () {
  var form = document.getElementById("contact-form");
  if (!form) return;
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const form = this;
    const btn = form.querySelector("button[type=submit]");
    const originalText = btn.textContent;
    const errorBox = document.getElementById("form-error");
    errorBox.style.display = "none";
    btn.disabled = true;
    btn.textContent = "Sending...";

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "contact",
          name: document.getElementById("cf-name").value,
          email: document.getElementById("cf-email").value,
          message: document.getElementById("cf-message").value,
          companyWebsite: form.querySelector('[name="companyWebsite"]').value,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Something went wrong.");
      form.style.display = "none";
      errorBox.style.display = "none";
      const ok = document.getElementById("form-success");
      ok.style.display = "block";
      ok.focus();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = originalText;
      errorBox.textContent = err.message || "Something went wrong — please try again or email us directly.";
      errorBox.style.display = "block";
    }
  });
})();
