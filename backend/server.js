/**
 * ZK-StudentID Backend Server (EdDSA)
 *
 * IIT Dholakpur signs credentials with EdDSA.
 * Verification is FULLY OFFLINE — verifier only needs the public key.
 *
 * Endpoints:
 *   POST /api/login            — Student login
 *   POST /api/generate-proof   — Generate ZK proof (EdDSA signed)
 *   POST /api/request-nonce    — Get a session nonce
 *   POST /api/verify-proof     — Verify proof
 *   GET  /api/public-keys      — Get trusted public keys
 */

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const snarkjs = require("snarkjs");
const { init, generateKeyPair, signCredential } = require("./utils/credential");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── Key pair for issuer ──
let INSTITUTE_KEYS = null; // IIT Dholakpur

// Nonce store
const nonceStore = new Map();

// ── Mock student database (IIT Dholakpur) ──
const STUDENT_DB = [
  {
    regNo: "B23165",
    name: "Om Kumar",
    department: "Computer Science",
    cgpa: 8.75,
    enrolled: true,
    password: "pass123",
  },
  {
    regNo: "B23042",
    name: "Priya Patel",
    department: "Electronics",
    cgpa: 9.2,
    enrolled: true,
    password: "pass123",
  },
  {
    regNo: "B23108",
    name: "Rahul Verma",
    department: "Mechanical",
    cgpa: 7.5,
    enrolled: true,
    password: "pass123",
  },
  {
    regNo: "B22091",
    name: "Sneha Gupta",
    department: "Computer Science",
    cgpa: 8.1,
    enrolled: false,
    password: "pass123",
  },
];

// Circuit artifacts
const WASM_PATH = path.join(__dirname, "artifacts", "studentVerify.wasm");
const ZKEY_PATH = path.join(__dirname, "artifacts", "studentVerify_final.zkey");
const VKEY_PATH = path.join(__dirname, "artifacts", "verification_key.json");

// ── POST /api/login — Student login (institute) ──
app.post("/api/login", (req, res) => {
  const { regNo, password } = req.body;
  const student = STUDENT_DB.find(
    (s) => s.regNo === regNo && s.password === password
  );
  if (!student) {
    return res.status(401).json({ error: "Invalid enrollment number or password" });
  }
  res.json({
    regNo: student.regNo,
    name: student.name,
    department: student.department,
    cgpa: student.cgpa,
    enrolled: student.enrolled,
  });
});

// ── POST /api/request-nonce — Get a session nonce ──
app.post("/api/request-nonce", (req, res) => {
  const { service } = req.body;
  const nonceBytes = crypto.randomBytes(6);
  const nonce = BigInt("0x" + nonceBytes.toString("hex")).toString();

  nonceStore.set(nonce, {
    createdAt: Date.now(),
    used: false,
    service: service || "unknown",
  });

  // Clean old nonces (>10 min)
  for (const [key, val] of nonceStore) {
    if (Date.now() - val.createdAt > 600000) nonceStore.delete(key);
  }

  console.log(`Nonce issued: ${nonce} for service: ${service}`);
  res.json({ nonce });
});

// ── POST /api/generate-proof — Generate ZK proof with EdDSA ──
app.post("/api/generate-proof", async (req, res) => {
  try {
    const { regNo, password, proofType, cgpaThreshold, nonce } = req.body;

    if (!nonce) {
      return res.status(400).json({ error: "Nonce is required." });
    }

    // Authenticate
    const student = STUDENT_DB.find(
      (s) => s.regNo === regNo && s.password === password
    );
    if (!student) {
      return res.status(401).json({ error: "Authentication failed" });
    }

    if (!fs.existsSync(WASM_PATH) || !fs.existsSync(ZKEY_PATH)) {
      return res.status(500).json({ error: "Circuit artifacts not found." });
    }

    // Sign credential with EdDSA
    const signedCred = await signCredential(student, INSTITUTE_KEYS.privKey);

    // Determine proof parameters
    const checkEnrolled = proofType === "enrollment" || proofType === "both" ? 1 : 0;
    const threshold =
      proofType === "cgpa" || proofType === "both"
        ? Math.round(parseFloat(cgpaThreshold || 0) * 100)
        : 0;

    // Build circuit input
    const circuitInput = {
      // Private inputs
      regNo: signedCred.credential.regNoNumeric,
      cgpa: signedCred.credential.cgpaScaled,
      enrolled: signedCred.credential.enrolled,
      salt: signedCred.credential.salt,
      sigR8x: signedCred.signature.R8x,
      sigR8y: signedCred.signature.R8y,
      sigS: signedCred.signature.S,
      // Public inputs
      pubKeyX: INSTITUTE_KEYS.pubKey[0].toString(),
      pubKeyY: INSTITUTE_KEYS.pubKey[1].toString(),
      cgpaThreshold: threshold.toString(),
      checkEnrolled: checkEnrolled.toString(),
      nonce: nonce.toString(),
    };

    console.log(`Generating proof for ${student.name}...`);

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInput,
      WASM_PATH,
      ZKEY_PATH
    );

    console.log(`  ✅ Proof generated!`);

    res.json({
      proof,
      publicSignals,
      metadata: {
        institute: "IIT Dholakpur",
        proofType,
        nonce,
        claims: {
          enrollment: checkEnrolled === 1 ? "Proves current enrollment" : "Not included",
          cgpa: threshold > 0 ? `Proves CGPA ≥ ${threshold / 100}` : "Not included",
        },
        signatureType: "EdDSA (Baby Jubjub)",
        generatedAt: new Date().toISOString(),
        note: "This proof is cryptographically signed and bound to a specific session.",
      },
    });
  } catch (err) {
    console.error("Generate proof error:", err);
    res.status(500).json({ error: "Failed to generate proof: " + err.message });
  }
});

// ── POST /api/verify-proof — Verify proof (fully offline — no registry!) ──
app.post("/api/verify-proof", async (req, res) => {
  try {
    const { proof, publicSignals } = req.body;

    if (!proof || !publicSignals) {
      return res.status(400).json({ error: "Missing proof or publicSignals" });
    }

    if (!fs.existsSync(VKEY_PATH)) {
      return res.status(500).json({ error: "Verification key not found." });
    }
    const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));

    // Verify the proof
    const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);

    // Decode public signals: [pubKeyX, pubKeyY, cgpaThreshold, checkEnrolled, nonce]
    const pubKeyX = publicSignals[0];
    const pubKeyY = publicSignals[1];
    const cgpaThreshold = Number(publicSignals[2]);
    const checkEnrolled = Number(publicSignals[3]);
    const nonce = publicSignals[4];

    // Check nonce
    const nonceEntry = nonceStore.get(nonce);
    let nonceValid = false;
    if (nonceEntry && !nonceEntry.used) {
      nonceValid = true;
      nonceEntry.used = true;
    }

    // Identify issuer from public key
    let issuer = "Unknown";
    if (
      pubKeyX === INSTITUTE_KEYS.pubKey[0].toString() &&
      pubKeyY === INSTITUTE_KEYS.pubKey[1].toString()
    ) {
      issuer = "IIT Dholakpur";
    }

    console.log(
      `Verification: valid=${isValid}, nonce=${nonceValid}, issuer=${issuer}, ` +
        `cgpa≥${cgpaThreshold / 100}, enrolled=${checkEnrolled}`
    );

    res.json({
      verified: isValid && nonceValid,
      proofValid: isValid,
      nonceValid,
      issuer,
      claims: {
        cgpaAboveThreshold: cgpaThreshold > 0 ? `≥ ${cgpaThreshold / 100}` : "not checked",
        enrollmentVerified: checkEnrolled === 1,
      },
      signatureType: "EdDSA (Baby Jubjub) — verified inside ZK proof",
    });
  } catch (err) {
    console.error("Verify proof error:", err);
    res.status(500).json({ error: "Proof verification failed" });
  }
});

// ── GET /api/public-keys — Trusted public keys ──
app.get("/api/public-keys", (req, res) => {
  res.json({
    trustedIssuers: [
      {
        name: "IIT Dholakpur",
        pubKeyX: INSTITUTE_KEYS.pubKey[0].toString(),
        pubKeyY: INSTITUTE_KEYS.pubKey[1].toString(),
        type: "EdDSA Baby Jubjub",
      },
    ],
  });
});

// ── Start server ──
async function start() {
  await init();

  // Generate key pair (deterministic seed for demo reproducibility)
  INSTITUTE_KEYS = generateKeyPair("IIT-Dholakpur-EdDSA-Private-Key-2026");

  app.listen(PORT, () => {
    console.log(`\n🔐 ZK-StudentID Backend (EdDSA)`);
    console.log(`   Running on http://localhost:${PORT}\n`);
    console.log(`Trusted Issuer:`);
    console.log(`  🏛️  IIT Dholakpur — pubKey: [${INSTITUTE_KEYS.pubKey[0].toString().slice(0, 20)}...]`);
    console.log(`\nMock students:`);
    STUDENT_DB.forEach((s) => {
      console.log(`  ${s.regNo} | ${s.name} | CGPA: ${s.cgpa} | Enrolled: ${s.enrolled} | Pass: ${s.password}`);
    });
    console.log(`\nEndpoints:`);
    console.log(`  POST /api/login             — Student login`);
    console.log(`  POST /api/request-nonce     — Get session nonce`);
    console.log(`  POST /api/generate-proof    — Generate proof (EdDSA signed)`);
    console.log(`  POST /api/verify-proof      — Verify proof`);
    console.log(`  GET  /api/public-keys       — Trusted issuer public keys`);
  });
}

start();
