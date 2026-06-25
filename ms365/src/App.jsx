import React, { useState, useRef, useEffect } from "react";

const API = "/api";

export default function App() {
  const [nonce, setNonce] = useState(null);
  const [proofData, setProofData] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const fileInputRef = useRef(null);

  // Request a nonce when the page loads
  useEffect(() => {
    requestNonce();
  }, []);

  const requestNonce = async () => {
    try {
      const res = await fetch(`${API}/request-nonce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: "ms365" }),
      });
      const data = await res.json();
      setNonce(data.nonce);
    } catch (err) {
      setStatus({ type: "error", msg: "Failed to generate verification code." });
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.proof || !data.publicSignals) {
          throw new Error("Invalid proof file");
        }
        setProofData(data);
        setResult(null);
        setStatus(null);
      } catch (err) {
        setStatus({ type: "error", msg: "Invalid file: " + err.message });
      }
    };
    reader.readAsText(file);
  };

  const handleVerify = async () => {
    if (!proofData) return;
    setLoading(true);
    setResult(null);
    setStatus({ type: "info", msg: "Verifying your student proof..." });

    try {
      const res = await fetch(`${API}/verify-proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proofData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      setStatus(null);
    } catch (err) {
      setStatus({ type: "error", msg: "Verification failed: " + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyNonce = () => {
    navigator.clipboard.writeText(nonce);
    setStatus({ type: "info", msg: "Verification code copied!" });
    setTimeout(() => setStatus(null), 2000);
  };

  return (
    <div className="app">
      {/* MS365 Header */}
      <div className="ms-header">
        <div className="ms-logo">
          <div className="r"></div>
          <div className="g"></div>
          <div className="b"></div>
          <div className="y"></div>
        </div>
        <div>
          <div className="ms-title">Microsoft 365</div>
          <div className="ms-subtitle">Education</div>
        </div>
      </div>

      {/* Hero */}
      <div className="hero">
        <h2>🎓 Student Discount</h2>
        <p>
          Verify your student status using Zero-Knowledge Proof —
          we never see your personal data.
        </p>
        <div className="price">
          ₹149/mo <span className="original">₹299/mo</span>
        </div>
      </div>

      {/* Steps */}
      <div className="card">
        <h3>How to verify:</h3>
        <div className="steps">
          <div className="step">
            <div className={`step-number ${nonce ? "done" : ""}`}>1</div>
            <div className="step-content">
              <h4>Copy your verification code</h4>
              <p>This unique code ties the proof to your session.</p>
            </div>
          </div>
          <div className="step">
            <div className={`step-number ${proofData ? "done" : ""}`}>2</div>
            <div className="step-content">
              <h4>Get proof from your institute portal</h4>
              <p>Paste the code there, generate proof, and download it.</p>
            </div>
          </div>
          <div className="step">
            <div className={`step-number ${result?.verified ? "done" : ""}`}>3</div>
            <div className="step-content">
              <h4>Upload proof here</h4>
              <p>We verify the math — no personal info needed.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Step 1: Nonce */}
      <div className="card">
        <h3>Step 1: Your Verification Code</h3>
        {nonce ? (
          <div className="nonce-box">
            <div className="label">Verification Code</div>
            <div className="code">{nonce}</div>
            <div className="hint">Copy this and paste it in your institute's student portal</div>
            <button
              className="btn btn-primary"
              onClick={handleCopyNonce}
              style={{ marginTop: "0.8rem", width: "auto", padding: "0.5rem 1.5rem" }}
            >
              📋 Copy Code
            </button>
          </div>
        ) : (
          <p style={{ color: "var(--ms-text-muted)" }}>Generating code...</p>
        )}
      </div>

      {/* Step 2 & 3: Upload proof */}
      <div className="card">
        <h3>Step 2: Upload Your Proof</h3>
        <p style={{ fontSize: "0.8rem", color: "var(--ms-text-muted)", marginBottom: "1rem" }}>
          After generating the proof from your institute portal, upload it here.
        </p>

        <div
          className={`upload-area ${proofData ? "loaded" : ""}`}
          onClick={() => fileInputRef.current?.click()}
        >
          {proofData ? (
            <>
              <p style={{ fontSize: "1.5rem" }}>✅</p>
              <p style={{ fontWeight: 600, marginTop: "0.3rem" }}>Proof uploaded</p>
              {proofData.metadata && (
                <p style={{ fontSize: "0.8rem", color: "var(--ms-text-muted)" }}>
                  From: {proofData.metadata.institute}
                </p>
              )}
            </>
          ) : (
            <>
              <p style={{ fontSize: "1.5rem" }}>📁</p>
              <p style={{ marginTop: "0.3rem" }}>Click to upload proof file</p>
              <p style={{ fontSize: "0.75rem", color: "var(--ms-text-muted)" }}>
                .json file from your institute
              </p>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileUpload}
          style={{ display: "none" }}
        />

        {proofData && !result && (
          <button
            className="btn btn-primary"
            onClick={handleVerify}
            disabled={loading}
            style={{ marginTop: "1rem" }}
          >
            {loading ? (
              <><span className="loading" /> Verifying...</>
            ) : (
              "🔍 Verify & Unlock Discount"
            )}
          </button>
        )}
      </div>

      {/* Result */}
      {result && (
        <div className={`result ${result.verified ? "success" : "failed"}`}>
          <div className="icon">{result.verified ? "🎉" : "❌"}</div>
          <h3>
            {result.verified
              ? "Student Verified — 50% Discount Activated!"
              : "Verification Failed"}
          </h3>

          {result.verified ? (
            <>
              <div className="result-details">
                <div className="result-row">
                  <span>Issuer</span>
                  <strong>{result.issuer}</strong>
                </div>
                <div className="result-row">
                  <span>Signature</span>
                  <strong>{result.signatureType ? "✅ EdDSA Verified" : "—"}</strong>
                </div>
                <div className="result-row">
                  <span>Enrollment</span>
                  <strong>{result.claims.enrollmentVerified ? "✅ Verified" : "—"}</strong>
                </div>
                <div className="result-row">
                  <span>CGPA Requirement</span>
                  <strong>
                    {result.claims.cgpaAboveThreshold !== "not checked"
                      ? `✅ ${result.claims.cgpaAboveThreshold}`
                      : "— Not required"}
                  </strong>
                </div>
                <div className="result-row">
                  <span>Session Nonce</span>
                  <strong>{result.nonceValid ? "✅ Valid" : "❌ Invalid"}</strong>
                </div>
              </div>
              <div className="privacy-badge">
                🔒 Zero personal data collected
              </div>
            </>
          ) : (
            <p style={{ fontSize: "0.85rem", color: "var(--ms-danger)", marginTop: "0.5rem" }}>
              {!result.proofValid
                ? "The cryptographic proof is invalid."
                : !result.nonceValid
                  ? "The verification code doesn't match. Please get a fresh code and regenerate your proof."
                  : "Verification failed. Please try again."}
            </p>
          )}
        </div>
      )}

      {status && <div className={`status ${status.type}`}>{status.msg}</div>}

      {/* Privacy Note */}
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h3>🔒 Your Privacy</h3>
        <p style={{ fontSize: "0.8rem", color: "var(--ms-text-muted)", lineHeight: 1.6 }}>
          Microsoft 365 uses <strong>Zero-Knowledge Proof</strong> technology for student
          verification. This means:
        </p>
        <ul style={{ fontSize: "0.8rem", color: "var(--ms-text-muted)", paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
          <li>We <strong>never</strong> see your name or enrollment number</li>
          <li>We <strong>never</strong> see your exact CGPA</li>
          <li>We only verify mathematical proof that you meet eligibility</li>
          <li>The proof is bound to this session — no one else can use it</li>
        </ul>
      </div>

      <div className="footer">
        © 2026 Microsoft Corporation — Powered by ZK-StudentID
      </div>
    </div>
  );
}
