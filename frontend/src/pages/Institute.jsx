import React, { useState } from "react";

const API = "/api";

export default function Institute() {
  const [regNo, setRegNo] = useState("");
  const [password, setPassword] = useState("");
  const [student, setStudent] = useState(null);
  const [proofType, setProofType] = useState("enrollment");
  const [cgpaThreshold, setCgpaThreshold] = useState("8.0");
  const [nonce, setNonce] = useState("");
  const [proofPackage, setProofPackage] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setStatus(null);
    setProofPackage(null);
    setLoading(true);
    try {
      const res = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regNo, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStudent(data);
      setStatus({ type: "success", msg: `Welcome, ${data.name}!` });
    } catch (err) {
      setStatus({ type: "error", msg: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateProof = async () => {
    if (!nonce.trim()) {
      setStatus({ type: "error", msg: "Please enter the verification code from the service website." });
      return;
    }
    setLoading(true);
    setProofPackage(null);
    setStatus({ type: "info", msg: "Generating your ZK proof (EdDSA signed)... This may take a few seconds." });
    try {
      const res = await fetch(`${API}/generate-proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regNo,
          password,
          proofType,
          cgpaThreshold: parseFloat(cgpaThreshold),
          nonce: nonce.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProofPackage(data);
      setStatus({
        type: "success",
        msg: "✅ Proof generated! Download and submit it to the service website.",
      });
    } catch (err) {
      setStatus({ type: "error", msg: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(proofPackage, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zk_proof_${regNo}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <h2>🏛️ IIT Dholakpur — Student Portal</h2>
      <p className="description">
        Generate ZK proofs to verify your student status. Credentials are
        signed with <strong>EdDSA</strong> — cryptographically verified, no registry needed.
      </p>

      {!student ? (
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Enrollment Number</label>
            <input
              type="text"
              value={regNo}
              onChange={(e) => setRegNo(e.target.value)}
              placeholder="e.g., B23165"
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? (
              <><span className="loading" /> Logging in...</>
            ) : (
              "Login"
            )}
          </button>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
            Demo accounts: B23165 / B23042 / B23108 / B22091 (password: pass123)
          </p>
        </form>
      ) : (
        <>
          {/* Student Info */}
          <div className="credential-card">
            <h3>👤 {student.name}</h3>
            <div className="credential-field">
              <span className="label">Enrollment No</span>
              <span className="value">{student.regNo}</span>
            </div>
            <div className="credential-field">
              <span className="label">Department</span>
              <span className="value">{student.department}</span>
            </div>
            <div className="credential-field">
              <span className="label">CGPA</span>
              <span className="value">{student.cgpa}</span>
            </div>
            <div className="credential-field">
              <span className="label">Status</span>
              <span className="value">{student.enrolled ? "✅ Enrolled" : "🎓 Graduated"}</span>
            </div>
            <div className="credential-field">
              <span className="label">Signed by</span>
              <span className="value" style={{ color: "var(--primary)" }}>
                IIT Dholakpur (EdDSA)
              </span>
            </div>
          </div>

          <hr className="divider" />

          {/* Proof Generation */}
          <h3 style={{ marginBottom: "0.5rem" }}>🔐 Generate Verification Proof</h3>

          <div className="form-group">
            <label>Verification Code (from the service website)</label>
            <input
              type="text"
              value={nonce}
              onChange={(e) => setNonce(e.target.value)}
              placeholder="Paste the code shown on the service website"
              style={{ fontFamily: "monospace" }}
            />
          </div>

          <div className="form-group">
            <label>What to prove</label>
            <select value={proofType} onChange={(e) => setProofType(e.target.value)}>
              <option value="enrollment">I am currently enrolled</option>
              <option value="cgpa">My CGPA is above a threshold</option>
              <option value="both">Enrolled + CGPA above threshold</option>
            </select>
          </div>

          {(proofType === "cgpa" || proofType === "both") && (
            <div className="form-group">
              <label>CGPA Threshold</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="10"
                value={cgpaThreshold}
                onChange={(e) => setCgpaThreshold(e.target.value)}
              />
            </div>
          )}

          <button className="btn btn-primary" onClick={handleGenerateProof} disabled={loading}>
            {loading ? (
              <><span className="loading" /> Generating Proof...</>
            ) : (
              "🔐 Generate ZK Proof"
            )}
          </button>

          {proofPackage && (
            <div className="credential-card" style={{ marginTop: "1rem" }}>
              <h3>✅ Proof Ready</h3>
              <div className="credential-field">
                <span className="label">Issuer</span>
                <span className="value">{proofPackage.metadata.institute}</span>
              </div>
              <div className="credential-field">
                <span className="label">Signature</span>
                <span className="value">{proofPackage.metadata.signatureType}</span>
              </div>
              <div className="credential-field">
                <span className="label">Session bound</span>
                <span className="value" style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                  {proofPackage.metadata.nonce}
                </span>
              </div>
              <div style={{ marginTop: "1rem" }}>
                <button className="btn btn-success" onClick={handleDownload}>
                  📥 Download Proof
                </button>
              </div>
              <p style={{ marginTop: "0.8rem", fontSize: "0.8rem", color: "var(--success)" }}>
                🔒 Cryptographically signed by {proofPackage.metadata.institute}.
                No personal data. One-time use only.
              </p>
            </div>
          )}

          <button
            className="btn btn-reject"
            onClick={() => { setStudent(null); setProofPackage(null); setStatus(null); setNonce(""); }}
            style={{ marginTop: "0.5rem" }}
          >
            Logout
          </button>
        </>
      )}

      {status && <div className={`status ${status.type}`}>{status.msg}</div>}
    </div>
  );
}
