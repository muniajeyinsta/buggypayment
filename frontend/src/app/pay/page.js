'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/* ────────── CONSTANTS ────────── */

const PLANS = [
  { id: 'monthly', name: 'Monthly', months: 1, original: 300, offer: 300 },
  { id: '3months', name: '3 Months', months: 3, original: 900, offer: 891 },
  { id: '6months', name: '6 Months', months: 6, original: 1800, offer: 1746 },
  { id: '12months', name: '12 Months', months: 12, original: 3600, offer: 3420 },
];

const STORAGE_PREFIX = 'evBuggy_profile:';

/* ────────── HELPERS ────────── */

function formatINR(n) {
  return `₹${n.toLocaleString('en-IN')}`;
}

function addMonths(date, months) {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function formatExpiry(d) {
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function loadProfileFromStorage(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.name !== 'string' || typeof data.phone !== 'string') return null;
    return {
      name: data.name,
      phone: data.phone,
      email: typeof data.email === 'string' ? data.email : '',
    };
  } catch {
    return null;
  }
}

function saveProfileToStorage(userId, profile) {
  if (!userId) return;
  localStorage.setItem(
    `${STORAGE_PREFIX}${userId}`,
    JSON.stringify({
      name: profile.name.trim(),
      phone: profile.phone.trim(),
      email: (profile.email || '').trim(),
    })
  );
}

/* ────────── ICONS ────────── */

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M13 2L3 14h7l-1 8 11-12h-7l0-8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M20 6L9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BackArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
      <path
        d="M19 12H5M12 19l-7-7 7-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PaymentCardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22">
      <rect x="2" y="6" width="20" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 12.5l2.5 2L16 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width="28"
      height="28"
      aria-hidden="true"
      className="ss-upload-icon"
    >
      <path
        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="17,8 12,3 7,8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="12" y1="3" x2="12" y2="15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ────────── MAIN COMPONENT ────────── */

export default function PaymentPage() {
  const [view, setView] = useState('loading');
  const [userId, setUserId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [upiConfig, setUpiConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [failReason, setFailReason] = useState('');
  const [successData, setSuccessData] = useState({ plan: '', amount: '', expiry: '' });
  const [showSavedHint, setShowSavedHint] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState(null);
  const [ssLabelText, setSsLabelText] = useState('Upload payment screenshot');
  const [utrValue, setUtrValue] = useState('');

  const nameRef = useRef(null);
  const phoneRef = useRef(null);
  const emailRef = useRef(null);
  const fileInputRef = useRef(null);

  // Parse userId from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('userid') || params.get('userId');
    if (!id || !String(id).trim()) {
      setView('error');
      return;
    }
    const uid = String(id).trim();
    setUserId(uid);

    const storedProfile = loadProfileFromStorage(uid);
    if (storedProfile) {
      setProfile(storedProfile);
      setView('plans');
      setShowSavedHint(true);
    } else {
      setView('register');
    }

    fetch('/upi-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setUpiConfig({ upiId: data.upiId || '', payeeName: data.payeeName || 'EV Buggy' });
        } else {
          setUpiConfig({ upiId: '', payeeName: 'EV Buggy' });
        }
      })
      .catch(() => {
        setUpiConfig({ upiId: '', payeeName: 'EV Buggy' });
      });
  }, []);

  const handleRegister = useCallback(
    (e) => {
      e.preventDefault();
      const name = nameRef.current?.value?.trim() || '';
      const phone = phoneRef.current?.value?.trim() || '';
      const email = emailRef.current?.value?.trim() || '';
      if (!name || !phone) return;
      const newProfile = { name, phone, email };
      setProfile(newProfile);
      saveProfileToStorage(userId, newProfile);
      setView('plans');
      setShowSavedHint(true);
      setSelectedPlan(null);
    },
    [userId]
  );

  const goRegister = useCallback((isEdit) => {
    setEditMode(isEdit);
    setView('register');
  }, []);

  const handleSelectPlan = useCallback((planId) => {
    const plan = PLANS.find((p) => p.id === planId);
    setSelectedPlan(plan || null);
  }, []);

  const buildUpiUrl = useCallback(
    (amount, txnNote) => {
      if (!upiConfig) return null;
      const params = new URLSearchParams({
        pa: upiConfig.upiId,
        pn: upiConfig.payeeName,
        am: String(amount),
        cu: 'INR',
        tn: txnNote || 'EV Buggy Subscription',
      });
      return `upi://pay?${params.toString()}`;
    },
    [upiConfig]
  );

  const goUpiPay = useCallback(() => {
    if (!selectedPlan || !upiConfig) return;
    setUtrValue('');
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setSsLabelText('Upload payment screenshot');
    setView('upi-pay');
  }, [selectedPlan, upiConfig]);

  const handleScreenshotSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (JPG, PNG, or WebP)');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Screenshot must be under 5 MB');
      e.target.value = '';
      return;
    }
    setScreenshotFile(file);
    setSsLabelText(file.name.length > 25 ? file.name.slice(0, 22) + '…' : file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setScreenshotPreview(ev.target.result);
    };
    reader.readAsDataURL(file);
  }, []);

  const removeScreenshot = useCallback(() => {
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setSsLabelText('Upload payment screenshot');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const confirmUpiPayment = useCallback(async () => {
    if (!utrValue.trim() || !userId || !selectedPlan || !profile) return;
    setPaying(true);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('userId', userId);
      formData.append('plan', selectedPlan.id);
      formData.append('amount', String(selectedPlan.offer));
      formData.append('upiTransactionId', utrValue.trim());
      formData.append('name', profile.name);
      formData.append('phone', profile.phone);
      formData.append('email', profile.email || '');
      if (screenshotFile) {
        formData.append('screenshot', screenshotFile);
      }
      const res = await fetch('/upi-payment', { method: 'POST', body: formData });
      const text = await res.text();
      let result;
      try { result = text ? JSON.parse(text) : {}; } catch { result = { raw: text }; }
      if (!res.ok) {
        const parts = [result.error, result.detail].filter((x) => typeof x === 'string' && x.trim());
        throw new Error(parts.length ? parts.join(' — ') : res.statusText || 'Request failed');
      }
      const expRaw = result?.expiryDate ? String(result.expiryDate).slice(0, 10) : '';
      const expDate = expRaw ? new Date(`${expRaw}T12:00:00`) : addMonths(new Date(), selectedPlan.months);
      setSuccessData({
        plan: `${selectedPlan.name} — ${formatINR(selectedPlan.offer)}`,
        amount: formatINR(selectedPlan.offer),
        expiry: formatExpiry(expDate),
      });
      setView('success');
    } catch (e) {
      setFailReason(e instanceof Error ? e.message : 'Something went wrong');
      setView('failure');
    } finally {
      setPaying(false);
      setLoading(false);
    }
  }, [utrValue, userId, selectedPlan, profile, screenshotFile]);

  const handleRetry = useCallback(() => {
    setSelectedPlan(null);
    setView('plans');
  }, []);

  const goBackToPlans = useCallback(() => {
    setSelectedPlan(null);
    setShowSavedHint(true);
    setView('plans');
  }, []);

  useEffect(() => {
    if (view === 'register' && profile) {
      if (nameRef.current) nameRef.current.value = profile.name;
      if (phoneRef.current) phoneRef.current.value = profile.phone;
      if (emailRef.current) emailRef.current.value = profile.email || '';
    }
  }, [view, profile]);

  const upiUrl =
    selectedPlan && upiConfig
      ? buildUpiUrl(selectedPlan.offer, `EV Buggy ${selectedPlan.name} - ${userId}`)
      : null;

  const confirmDisabled = utrValue.trim().length < 6;

  if (view === 'loading') return null;

  return (
    <>
      <div id="app" className="app" aria-live="polite">
        <header className="header">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <BoltIcon />
            </span>
            <div>
              <p className="brand-title">EV Buggy Subscription</p>
              <p className="brand-sub">Quick &amp; easy pass renewal</p>
            </div>
          </div>
        </header>

        {/* Error */}
        {view === 'error' && (
          <section className="view view--centered" aria-labelledby="err-title">
            <div className="card card--center">
              <div className="icon-circle icon-circle--warn" aria-hidden="true">!</div>
              <h1 id="err-title" className="h1">Invalid link</h1>
              <p className="muted">
                This page needs a valid card link. Please scan the QR code on your RFID card again.
              </p>
            </div>
          </section>
        )}

        {/* Register */}
        {view === 'register' && (
          <section className="view" aria-labelledby="reg-title">
            <h1 id="reg-title" className="h1">
              {editMode ? 'Edit your details' : 'Your details'}
            </h1>
            <p className="lead">One-time setup. We&#39;ll remember you on this device.</p>
            <form className="card form" noValidate onSubmit={handleRegister}>
              <label className="field">
                <span className="label">Full name <span className="req">*</span></span>
                <input ref={nameRef} id="input-name" name="name" type="text" autoComplete="name" required maxLength={120} placeholder="As on your ID" />
              </label>
              <label className="field">
                <span className="label">Phone <span className="req">*</span></span>
                <input ref={phoneRef} id="input-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={20} placeholder="10-digit mobile" />
              </label>
              <label className="field">
                <span className="label">Email <span className="optional">(optional)</span></span>
                <input ref={emailRef} id="input-email" name="email" type="email" autoComplete="email" maxLength={120} placeholder="you@example.com" />
              </label>
              <button type="submit" className="btn btn--primary btn--large" id="btn-register">
                {editMode ? 'Save and continue' : 'Continue to plans'}
              </button>
            </form>
          </section>
        )}

        {/* Plans */}
        {view === 'plans' && (
          <section className="view" aria-labelledby="plans-title">
            <div className="plans-head">
              <h1 id="plans-title" className="h1">Choose your plan</h1>
              <p className="lead">Limited-time pricing on longer packs.</p>
              {showSavedHint && (
                <div className="hint" role="status">
                  <span className="hint__check" aria-hidden="true"><CheckIcon /></span>
                  Details saved for next time
                </div>
              )}
            </div>
            <div className="plan-list">
              {PLANS.map((plan) => {
                const save = plan.original - plan.offer;
                const isSelected = selectedPlan?.id === plan.id;
                return (
                  <button key={plan.id} type="button" className={`plan-card${isSelected ? ' selected' : ''}`} aria-pressed={isSelected ? 'true' : 'false'} onClick={() => handleSelectPlan(plan.id)}>
                    <p className="plan-name">{plan.name}</p>
                    <div className="price-row">
                      <span className="price-original">{formatINR(plan.original)}</span>
                      <span className="price-offer">{formatINR(plan.offer)}</span>
                    </div>
                    <span className="badge">Limited Offer</span>
                    {save > 0 && <p className="save-tag">Save {formatINR(save)}</p>}
                  </button>
                );
              })}
            </div>
            <div className="stack">
              <button type="button" className="btn btn--primary btn--large" id="btn-pay" disabled={!selectedPlan || paying} onClick={goUpiPay}>Proceed to Pay</button>
              <button type="button" className="btn btn--ghost" id="btn-edit-details" onClick={() => goRegister(true)}>Edit details</button>
            </div>
          </section>
        )}

        {/* UPI Pay */}
        {view === 'upi-pay' && selectedPlan && (
          <section className="view" aria-labelledby="upi-title">
            <div className="upi-header">
              <button type="button" className="btn-back" id="btn-back-plans" aria-label="Back to plans" onClick={goBackToPlans}>
                <BackArrowIcon /> Back
              </button>
              <h1 id="upi-title" className="h1">Pay via UPI</h1>
            </div>
            <div className="card upi-summary-card">
              <div className="upi-summary-row">
                <span className="upi-summary-label">Plan</span>
                <span className="upi-summary-value">{selectedPlan.name}</span>
              </div>
              <div className="upi-summary-row upi-summary-row--total">
                <span className="upi-summary-label">Total</span>
                <span className="upi-summary-value upi-summary-amount">{formatINR(selectedPlan.offer)}</span>
              </div>
            </div>
            {upiUrl && (
              <a id="btn-open-upi" className="btn btn--upi btn--large" href={upiUrl} role="button">
                <span className="upi-btn-icon" aria-hidden="true"><PaymentCardIcon /></span>
                Pay via UPI App
                <span className="upi-btn-sub">Opens GPay, PhonePe, Paytm etc.</span>
              </a>
            )}
            <div className="upi-divider">
              <span className="upi-divider__line"></span>
              <span className="upi-divider__text">or scan QR code</span>
              <span className="upi-divider__line"></span>
            </div>
            <div className="card card--center upi-qr-card">
              <div className="upi-qr-container">
                <img src="/IMG_5342.jpeg" alt="UPI QR Code — Scan to pay" className="upi-qr-img" width={220} height={220} />
              </div>
              <p className="muted small" style={{ marginTop: '12px' }}>Scan with any UPI app to pay</p>
              <p className="upi-payee-hint">UPI ID: <strong>{upiConfig?.upiId || '—'}</strong></p>
            </div>
            <div className="upi-divider">
              <span className="upi-divider__line"></span>
              <span className="upi-divider__text">after payment</span>
              <span className="upi-divider__line"></span>
            </div>
            <div className="card upi-confirm-card">
              <p className="upi-confirm-title">Confirm your payment</p>
              <p className="muted small" style={{ margin: '0 0 14px' }}>
                Enter the UPI transaction/reference ID and upload a screenshot from your payment app.
              </p>
              <label className="field">
                <span className="label">UPI Transaction ID / UTR <span className="req">*</span></span>
                <input id="input-utr" name="utr" type="text" inputMode="text" required maxLength={60} placeholder="e.g. 123456789012" value={utrValue} onChange={(e) => setUtrValue(e.target.value)} />
              </label>
              <div className="field ss-field">
                <span className="label">Payment Screenshot <span className="optional">(recommended)</span></span>
                <label className="ss-upload-area" htmlFor="input-screenshot">
                  <input ref={fileInputRef} id="input-screenshot" name="screenshot" type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="ss-file-input" onChange={handleScreenshotSelect} />
                  <UploadIcon />
                  <span className="ss-label-text">{ssLabelText}</span>
                  <span className="ss-hint-text">JPG, PNG or WebP — max 5 MB</span>
                </label>
                {screenshotFile && (
                  <button type="button" className="btn-remove-ss" onClick={removeScreenshot}>
                    <CloseIcon /> Remove
                  </button>
                )}
                {screenshotPreview && (
                  <div className="ss-preview">
                    <img src={screenshotPreview} alt="Payment screenshot preview" />
                  </div>
                )}
              </div>
              <button type="button" className="btn btn--primary btn--large" id="btn-confirm-upi" disabled={confirmDisabled || paying} onClick={confirmUpiPayment}>Confirm Payment</button>
            </div>
          </section>
        )}

        {/* Success */}
        {view === 'success' && (
          <section className="view view--centered" aria-labelledby="ok-title">
            <div className="card card--center success-card">
              <div className="icon-circle icon-circle--ok" aria-hidden="true">✓</div>
              <h1 id="ok-title" className="h1">Payment recorded</h1>
              <p className="success-plan">{successData.plan}</p>
              <p className="success-expiry">Valid until <strong>{successData.expiry}</strong></p>
              <p className="muted small">Your payment is being verified. You will be activated shortly.</p>
            </div>
          </section>
        )}

        {/* Failure */}
        {view === 'failure' && (
          <section className="view view--centered" aria-labelledby="fail-title">
            <div className="card card--center">
              <div className="icon-circle icon-circle--bad" aria-hidden="true">×</div>
              <h1 id="fail-title" className="h1">Something went wrong</h1>
              <p className="muted">{failReason}</p>
              <button type="button" className="btn btn--primary btn--large" id="btn-retry" onClick={handleRetry}>Try again</button>
            </div>
          </section>
        )}
      </div>

      {loading && (
        <div className="loader" aria-hidden="false">
          <div className="loader__panel">
            <div className="spinner" aria-hidden="true"></div>
            <p className="loader__text">Please wait…</p>
          </div>
        </div>
      )}
    </>
  );
}
