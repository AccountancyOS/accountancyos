/**
 * Progressive-enhancement handler for lead forms (enquiry + pre-booking).
 *
 * Client layer only: validation, a honeypot spam trap, and submission to a
 * configured endpoint. When no endpoint is configured it falls back to opening
 * the visitor's email client with the details pre-filled, so an enquiry is never
 * silently discarded.
 *
 * IMPORTANT: server-side validation, rate limiting and spam filtering MUST be
 * enforced by the configured endpoint (CRM / form backend / serverless
 * function). See README before launch.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setError(field: HTMLElement, message: string) {
  const control = field.querySelector<HTMLElement>('input, select, textarea');
  const errEl = field.querySelector<HTMLElement>('.field-error');
  if (control) control.setAttribute('aria-invalid', 'true');
  if (errEl) errEl.textContent = message;
}

function clearError(field: HTMLElement) {
  const control = field.querySelector<HTMLElement>('input, select, textarea');
  const errEl = field.querySelector<HTMLElement>('.field-error');
  if (control) control.removeAttribute('aria-invalid');
  if (errEl) errEl.textContent = '';
}

function validate(form: HTMLFormElement): { ok: boolean; firstInvalid?: HTMLElement } {
  let ok = true;
  let firstInvalid: HTMLElement | undefined;

  const fields = Array.from(form.querySelectorAll<HTMLElement>('.field, .consent'));
  for (const field of fields) {
    const control = field.querySelector<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >('input, select, textarea');
    if (!control || control.classList.contains('hp-input')) continue;
    clearError(field);

    const required = control.hasAttribute('required');
    const value = (control.value ?? '').trim();

    if (control.type === 'checkbox') {
      if (required && !(control as HTMLInputElement).checked) {
        setError(field, 'Please confirm to continue.');
        ok = false;
        firstInvalid ??= control;
      }
      continue;
    }

    if (required && !value) {
      setError(field, 'This field is required.');
      ok = false;
      firstInvalid ??= control;
      continue;
    }
    if (control.type === 'email' && value && !EMAIL_RE.test(value)) {
      setError(field, 'Please enter a valid email address.');
      ok = false;
      firstInvalid ??= control;
    }
  }
  return { ok, firstInvalid };
}

function show(el: HTMLElement | null) {
  if (el) el.hidden = false;
}
function hide(el: HTMLElement | null) {
  if (el) el.hidden = true;
}

function buildMailto(form: HTMLFormElement): string {
  const to = form.dataset.mailto || '';
  const data = new FormData(form);
  const subject =
    form.dataset.subject || `Enquiry — ${data.get('firstName') ?? ''} ${data.get('lastName') ?? ''}`;
  const lines: string[] = [];
  for (const [key, val] of data.entries()) {
    if (key === 'company_url' || !String(val).trim()) continue; // skip honeypot / empty
    const label = key
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .replace(/^\w/, (c) => c.toUpperCase());
    lines.push(`${label}: ${val}`);
  }
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    lines.join('\n'),
  )}`;
}

function initForm(form: HTMLFormElement) {
  const successEl = form.parentElement?.querySelector<HTMLElement>('[data-form-success]') ?? null;
  const errorEl = form.parentElement?.querySelector<HTMLElement>('[data-form-error]') ?? null;
  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');

  form.setAttribute('novalidate', '');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hide(errorEl);

    // Honeypot: a filled hidden field means a bot. Pretend success, do nothing.
    const hp = form.querySelector<HTMLInputElement>('.hp-input');
    if (hp && hp.value.trim() !== '') {
      form.hidden = true;
      show(successEl);
      return;
    }

    const { ok, firstInvalid } = validate(form);
    if (!ok) {
      firstInvalid?.focus();
      return;
    }

    const endpoint = form.dataset.endpoint?.trim();

    // No endpoint configured — fall back to the visitor's email client.
    if (!endpoint) {
      window.location.href = buildMailto(form);
      form.hidden = true;
      show(successEl);
      successEl?.focus();
      return;
    }

    submitBtn?.setAttribute('disabled', '');
    const original = submitBtn?.textContent;
    if (submitBtn) submitBtn.textContent = 'Sending…';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      form.hidden = true;
      show(successEl);
      successEl?.focus();
    } catch (err) {
      // Do not silently discard: surface an actionable error.
      console.error('Lead form submission failed', err);
      show(errorEl);
      errorEl?.focus();
      submitBtn?.removeAttribute('disabled');
      if (submitBtn && original) submitBtn.textContent = original;
    }
  });

  // Clear a field's error as the user corrects it.
  form.querySelectorAll<HTMLElement>('.field, .consent').forEach((field) => {
    const control = field.querySelector<HTMLElement>('input, select, textarea');
    control?.addEventListener('input', () => clearError(field));
    control?.addEventListener('change', () => clearError(field));
  });
}

document
  .querySelectorAll<HTMLFormElement>('form[data-lead-form]')
  .forEach((form) => initForm(form));
