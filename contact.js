// Contact form → Web3Forms (https://web3forms.com). Static-site friendly: no backend.
// ============================================================================
// SET YOUR KEY HERE (the only place). Create a free access key at web3forms.com
// with the address that should receive the messages, then replace REPLACE_ME.
const WEB3FORMS_ACCESS_KEY = "e36d8535-8a2c-427f-a6ae-c29d62a06011";
// ============================================================================
const WEB3FORMS_ENDPOINT = "https://api.web3forms.com/submit";

(function setupContactForm() {
  const form = document.getElementById("contact-form");
  if (!form) return;
  const status = document.getElementById("form-status");
  const submit = document.getElementById("contact-submit");
  const configured = WEB3FORMS_ACCESS_KEY && WEB3FORMS_ACCESS_KEY !== "REPLACE_ME";
  form.querySelector("[data-access-key]").value = configured ? WEB3FORMS_ACCESS_KEY : "";

  const messages = {
    name: "Please enter your name.",
    email: "Please enter a valid email address.",
    topic: "Please choose a subject.",
    message: "Please write a message (at least 10 characters).",
    consent: "Please agree so that I can reply to you."
  };

  function showStatus(kind, html) {
    status.className = "form-status is-" + kind;
    status.innerHTML = html;
    status.hidden = false;
    status.focus();
  }

  function setError(field, text) {
    const err = document.getElementById(field.id + "-error");
    if (!err) return;
    if (text) {
      err.textContent = text;
      err.hidden = false;
      field.setAttribute("aria-invalid", "true");
    } else {
      err.textContent = "";
      err.hidden = true;
      field.removeAttribute("aria-invalid");
    }
  }

  function checkField(id) {
    const field = form.elements[id];
    let ok = field.type === "checkbox" ? field.checked : field.value.trim() !== "" && field.checkValidity();
    if (id === "message" && field.value.trim().length < 10) ok = false;
    setError(field, ok ? "" : messages[id]);
    return ok;
  }

  function validate() {
    let firstInvalid = null;
    Object.keys(messages).forEach((id) => {
      if (!checkField(id) && !firstInvalid) firstInvalid = form.elements[id];
    });
    return firstInvalid;
  }

  // After a failed submit, errors clear while the user fixes a field (on input/change),
  // never on blur, so the layout does not jump under the pointer.
  Object.keys(messages).forEach((id) => {
    const field = form.elements[id];
    const recheck = () => { if (field.getAttribute("aria-invalid") === "true") checkField(id); };
    field.addEventListener("input", recheck);
    field.addEventListener("change", recheck);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const invalid = validate();
    if (invalid) {
      invalid.focus();
      return;
    }
    if (form.elements.botcheck.value) return; // honeypot filled: silently ignore bots

    if (!configured) {
      showStatus(
        "info",
        "<strong>The contact form is not configured yet.</strong> Your message was not sent. " +
          'Please email me directly at <a href="mailto:dingshuai.yang@fau.de">dingshuai.yang@fau.de</a>.'
      );
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries());
    data.subject = "Website message: " + data.topic + " — " + data.name;
    data.replyto = data.email; // replies go straight to the sender
    submit.disabled = true;
    submit.textContent = "Sending…";
    try {
      const res = await fetch(WEB3FORMS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(data)
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        form.reset();
        form.hidden = true;
        showStatus("success", "<strong>Thank you — your message has been sent.</strong> I will reply to the email address you provided.");
      } else {
        throw new Error(json.message || "HTTP " + res.status);
      }
    } catch (err) {
      showStatus(
        "error",
        "<strong>Sorry, the message could not be sent.</strong> Please try again later or email me at " +
          '<a href="mailto:dingshuai.yang@fau.de">dingshuai.yang@fau.de</a>.'
      );
    } finally {
      submit.disabled = false;
      submit.textContent = "Send message";
    }
  });
})();

// Copy-to-clipboard for the email address in the sidebar.
(function setupCopy() {
  document.querySelectorAll(".copy-btn[data-copy]").forEach((btn) => {
    const status = document.getElementById(btn.getAttribute("aria-describedby"));
    btn.addEventListener("click", async () => {
      const text = btn.dataset.copy;
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
        ta.remove();
      }
      btn.textContent = ok ? "Copied" : "Copy";
      if (status) status.textContent = ok ? "Email address copied to clipboard." : "Copy failed — please select the address manually.";
      setTimeout(() => { btn.textContent = "Copy"; if (status) status.textContent = ""; }, 2500);
    });
  });
})();
