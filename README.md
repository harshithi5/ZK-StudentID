# 🔐 ZK-StudentID

**Zero-Knowledge Student Credential Verification with EdDSA Signatures**

A privacy-preserving system where students prove academic claims (enrollment, CGPA thresholds) to third-party services — without revealing any personal data. Powered by Zero-Knowledge Proofs and EdDSA digital signatures.

## The Problem

Students share sensitive data (registration numbers, exact CGPA, transcripts) with third-party websites just to prove basic eligibility for discounts or opportunities. This is unnecessary data exposure.

## The Solution

Using ZKPs + EdDSA signatures, students can prove:
- ✅ "I am enrolled at IIT Dholakpur" — without sharing their enrollment number
- ✅ "My CGPA ≥ 8.0" — without revealing their exact CGPA
- ✅ "My credentials are cryptographically signed by IIT Dholakpur" — without exposing any personal identity

The verifier (e.g., MS365) **never learns** the student's name, enrollment number, department, or exact CGPA.

## Architecture

```
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│  MS365 Website   │         │  IIT Dholakpur   │         │  MS365 Website   │
│  (Verifier)      │         │  Student Portal  │         │  (Verifier)      │
│                  │  nonce  │                  │  proof  │                  │
│  1. Issues nonce ├────────▶│  2. Student logs │────────▶│  4. Verifies     │
│                  │         │     in, pastes   │         │     proof        │
│                  │         │     nonce        │         │                  │
│                  │         │  3. Institute    │         │  5. ✅ Discount   │
│                  │         │     signs with   │         │     granted!     │
│                  │         │     EdDSA &      │         │                  │
│                  │         │     generates    │         │                  │
│                  │         │     ZK proof     │         │                  │
└──────────────────┘         └──────────────────┘         └──────────────────┘
```

## How EdDSA + ZKP Works Together

1. **Institute signs** student credentials (regNo, CGPA, enrollment, salt) using its **EdDSA private key** (Baby Jubjub curve)
2. **ZK circuit verifies** the EdDSA signature **inside** the proof — proving the data came from a trusted issuer
3. **Circuit also checks** CGPA ≥ threshold and/or enrollment status
4. **Verifier** only sees the institute's **public key** + a valid proof — fully offline, no registry needed

This is stronger than hash-based approaches because:
- No credential hash registry needed — just a public key
- Verifier can confirm *which* institute issued credentials
- Cryptographically unforgeable — nobody can create valid proofs without the institute's signature

## Security Features

| Attack | Prevention |
|--------|-----------|
| **Proof replay** (using same proof twice) | Nonce is one-time use — rejected on second attempt |
| **Proof transfer** (sharing proof with a friend) | Nonce binds proof to a specific MS365 session |
| **Data forgery** (faking CGPA) | EdDSA signature verified inside ZK circuit — only institute can sign |
| **Identity leakage** | Enrollment number and name are private inputs — never in the proof |
| **Rogue issuer** | Verifier checks public key matches trusted institute |

## What the Verifier Sees vs What's Hidden

| Data | Visible to verifier? |
|------|---------------------|
| Enrolled (yes/no) | ✅ Only if requested |
| CGPA ≥ threshold | ✅ Only the threshold, not exact value |
| Institute's public key (proves who signed) | ✅ Yes |
| Session nonce | ✅ Yes (for anti-replay) |
| Student's name | ❌ **Hidden** |
| Enrollment number | ❌ **Hidden** |
| Exact CGPA | ❌ **Hidden** |
| Department | ❌ **Hidden** |
| EdDSA signature itself | ❌ **Hidden** (verified inside ZK) |

## Tech Stack

| Component | Technology |
|-----------|-----------|
| ZK Circuit | Circom 2.2 |
| Proof System | Groth16 via snarkjs |
| Signature | EdDSA on Baby Jubjub curve |
| Hash Function | Poseidon (ZK-friendly) |
| Backend | Node.js + Express |
| Institute Frontend | React + Vite (port 5173) |
| MS365 Frontend | React + Vite (port 5174) |

## Project Structure

```
hackathon/
├── circuits/
│   ├── studentVerify.circom   # ZK circuit (EdDSA verify + range proof + nonce)
│   ├── setup.js               # Compile & trusted setup script
│   └── package.json
├── backend/
│   ├── server.js              # Express API (EdDSA signing, proof gen, verification)
│   ├── utils/credential.js    # EdDSA key generation & credential signing
│   ├── artifacts/             # Circuit WASM, zkey, verification key
│   └── package.json
├── frontend/                  # IIT Dholakpur Student Portal
│   ├── src/
│   │   ├── pages/Institute.jsx
│   │   ├── App.jsx
│   │   └── App.css
│   └── package.json
├── ms365/                     # Microsoft 365 Student Discount (Verifier)
│   ├── src/
│   │   ├── App.jsx
│   │   └── styles.css
│   └── package.json
└── README.md
```

## Setup & Running

### Prerequisites

- Node.js 18+
- Circom 2.x compiler ([install guide](https://docs.circom.io/getting-started/installation/))

### Step 1: Install Dependencies

```bash
cd circuits && npm install
cd ../backend && npm install
cd ../frontend && npm install
cd ../ms365 && npm install
```

### Step 2: Compile Circuit & Generate Keys

```bash
cd circuits
npm run setup
```

This compiles the Circom circuit (EdDSA + range proof, ~7698 constraints), runs the Groth16 trusted setup, and copies artifacts to `backend/artifacts/`.

### Step 3: Start All Services

```bash
# Terminal 1 — Backend API
cd backend && node server.js              # http://localhost:3001

# Terminal 2 — IIT Dholakpur Portal
cd frontend && npx vite                   # http://localhost:5173

# Terminal 3 — MS365 Student Discount
cd ms365 && npx vite                      # http://localhost:5174
```

## Demo Flow

1. **MS365** (http://localhost:5174) — Click "Get Student Discount". Copy the verification code (nonce).

2. **IIT Dholakpur** (http://localhost:5173) — Log in as a student, paste the verification code, choose what to prove, generate & download proof.

3. **MS365** (http://localhost:5174) — Upload the proof file. Click verify. Student discount is activated — **zero personal data collected**.

4. **Try replay attack** — Upload the same proof again. It fails! Nonce is already used.

## Mock Student Accounts

| Enrollment No | Name | CGPA | Enrolled | Password |
|---------------|------|------|----------|----------|
| B23165 | Om Kumar | 8.75 | ✅ Yes | pass123 |
| B23042 | Priya Patel | 9.20 | ✅ Yes | pass123 |
| B23108 | Rahul Verma | 7.50 | ✅ Yes | pass123 |
| B22091 | Sneha Gupta | 8.10 | ❌ No (Graduated) | pass123 |

## How the ZK Circuit Works

The `studentVerify.circom` circuit uses **EdDSAPoseidonVerifier** from circomlib (~7698 non-linear constraints).

**Private inputs** (never leaves the student/institute):
- `regNo` — enrollment number (numeric)
- `cgpa` — exact CGPA × 100
- `enrolled` — enrollment status (0 or 1)
- `salt` — random secret for uniqueness
- `sigR8x`, `sigR8y`, `sigS` — EdDSA signature components

**Public inputs** (verifier sees these):
- `pubKeyX`, `pubKeyY` — Institute's EdDSA public key (identifies the issuer)
- `cgpaThreshold` — minimum CGPA to prove (× 100)
- `checkEnrolled` — whether to verify enrollment (0 or 1)
- `nonce` — session binding (anti-replay)

**Constraints verified inside the proof:**
1. `msg = Poseidon(regNo, cgpa, enrolled, salt)` → computes credential hash
2. `EdDSAVerify(pubKey, msg, signature) === true` → data is signed by trusted institute
3. `enrolled === 1` (if requested) → student is currently enrolled
4. `cgpa >= cgpaThreshold` → CGPA meets requirement
5. `nonce` is bound into the proof → prevents reuse

## Example Proof Output

```json
{
  "publicSignals": [
    "4537517...",       // pubKeyX (institute's public key X)
    "1633638...",       // pubKeyY (institute's public key Y)
    "800",             // cgpaThreshold (proves CGPA ≥ 8.0)
    "0",               // checkEnrolled (not checked in this proof)
    "111754327092404"  // nonce (bound to MS365 session)
  ]
}
```

From this, you can tell: credentials are signed by IIT Dholakpur and CGPA ≥ 8.0 ✅. But you **cannot** extract the exact CGPA, student name, enrollment number, or even the signature itself. That's the power of ZKPs + EdDSA.

## Future Enhancements

- DigiLocker / ABC integration (government as alternative issuer)
- Credential revocation via Merkle tree
- On-chain verification (Solidity smart contract)
- Mobile wallet app with biometric binding
- Multi-institute support with shared credential schema

## Team

- Harshit Kumar Singh
- Kartavya Sandhu
- Om Kumar
- Adarsh Tripathi 
Built for Hackathon 2026 🚀
