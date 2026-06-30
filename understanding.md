# 📘 ZK-StudentID — Complete Understanding Document

> This file documents everything about the project: full flow, internals, problems faced, and solutions.

---

## 📋 Table of Contents

1. [What is this Project?](#what-is-this-project)
2. [The Problem in Detail](#the-problem-in-detail)
3. [Core Concepts Used](#core-concepts-used)
4. [System Architecture](#system-architecture)
5. [Complete Flow — Step by Step](#complete-flow--step-by-step)
6. [Circuit Deep Dive](#circuit-deep-dive)
7. [Backend Deep Dive](#backend-deep-dive)
8. [Frontend Deep Dive](#frontend-deep-dive)
9. [MS365 Verifier Deep Dive](#ms365-verifier-deep-dive)
10. [Security Model](#security-model)
11. [Problems Faced & Solutions](#problems-faced--solutions)
12. [How to Run](#how-to-run)
13. [Resume Session Command](#resume-session-command)

---

## What is this Project?

ZK-StudentID is a privacy-preserving student credential verification system. Students can prove claims like "I am enrolled" or "My CGPA ≥ 8" to third-party services (like MS365) **without revealing any personal data** — no name, no enrollment number, no exact CGPA.

It uses:
- **Zero-Knowledge Proofs (ZKPs)** — prove a statement is true without revealing the underlying data
- **EdDSA Digital Signatures** — cryptographic proof that the institute issued the credentials
- **Groth16 Proof System** — efficient proof generation and verification
- **Poseidon Hash** — ZK-friendly hash function for credential hashing

---

## The Problem in Detail

### Current Situation
When a student wants a student discount (Spotify, MS365, Amazon Prime, etc.), the typical flow is:
1. Website asks: "Enter your enrollment number / university email / upload ID card"
2. Student hands over sensitive personal data
3. Website stores this data (often indefinitely)

### What's Wrong
- **Enrollment numbers are sensitive** — they can be used to log into institute portals, access academic records
- **Exact CGPA is private** — to prove CGPA ≥ 8, why reveal it's 8.75?
- **No standardization** — every verifier builds their own integration with each institute
- **Data breaches** — if the verifier gets hacked, student data is leaked
- **No revocability** — once shared, you can't "un-share" your enrollment number

### What We Want
- Student proves "I am enrolled at IIT Dholakpur" → verifier gets ✅ or ❌
- Student proves "My CGPA ≥ 8" → verifier gets ✅ or ❌
- Verifier **never** learns the student's name, enrollment number, or exact CGPA
- Verification is offline — no need to call the institute's API every time

---

## Core Concepts Used

### 1. Zero-Knowledge Proofs (ZKPs)
A ZKP lets you prove a statement is true without revealing WHY it's true.

**Analogy:** You want to prove to a bouncer that you're 18+. Instead of showing your Aadhaar (which reveals name, address, exact DOB), you give a mathematical proof that says "yes, this person is 18+" — the bouncer can verify it's correct but learns nothing else.

In our case:
- Statement: "I have credentials signed by IIT Dholakpur, and my CGPA ≥ 8"
- Proof: A ~800 byte mathematical object that the verifier can check
- Hidden: enrollment number, name, exact CGPA, signature itself

### 2. EdDSA (Edwards-curve Digital Signature Algorithm)
A digital signature scheme on the **Baby Jubjub** elliptic curve.

Why EdDSA?
- It's "ZK-friendly" — can be verified efficiently inside a ZK circuit
- Uses Poseidon hash (which has low constraint count in circuits)
- The institute signs credentials; the circuit verifies the signature INSIDE the proof
- Verifier only needs the public key — no registry or database

### 3. Poseidon Hash
A hash function specifically designed for ZK circuits. Standard hashes like SHA-256 would require ~30,000+ constraints in a circuit. Poseidon does it in ~250 constraints.

### 4. Groth16 Proof System
The most widely-used ZK proof system. Properties:
- **Proof size:** Constant (~192 bytes regardless of circuit complexity)
- **Verification time:** Constant (~10ms)
- **Trusted setup required:** Yes (one-time ceremony)
- **Prover time:** O(n) where n = number of constraints

### 5. Nonce (Number Used Once)
A random value issued by the verifier to:
- Bind the proof to a specific session
- Prevent replay attacks (same proof can't be used twice)
- Prevent transfer attacks (proof can't be shared with a friend)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BACKEND (Express.js, Port 3001)                     │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  /api/login   │  │ /api/request │  │ /api/generate│  │ /api/verify  │   │
│  │              │  │   -nonce     │  │   -proof     │  │   -proof     │   │
│  │ Authenticates│  │             │  │             │  │             │   │
│  │ student      │  │ Generates   │  │ Signs with  │  │ Verifies    │   │
│  │              │  │ one-time    │  │ EdDSA, then │  │ Groth16     │   │
│  │              │  │ nonce       │  │ generates   │  │ proof       │   │
│  │              │  │             │  │ ZK proof    │  │             │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  EdDSA Key Pair (deterministic from seed for demo reproducibility) │    │
│  │  Private Key: SHA256("IIT-Dholakpur-EdDSA-Private-Key-2026")       │    │
│  │  Public Key: [pubKeyX, pubKeyY] on Baby Jubjub curve              │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌────────────────────────────────────────────┐                           │
│  │  Circuit Artifacts                          │                           │
│  │  - studentVerify.wasm (2.71 MB)            │                           │
│  │  - studentVerify_final.zkey (4.65 MB)      │                           │
│  │  - verification_key.json                    │                           │
│  └────────────────────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐                          ┌──────────────────────┐
│  STUDENT PORTAL       │                          │  MS365 VERIFIER       │
│  (React, Port 5173)   │                          │  (React, Port 5174)   │
│                        │                          │                        │
│  - Login form          │                          │  - Nonce generation    │
│  - Proof type select   │     Verification Code    │  - Proof upload        │
│  - Nonce input        │◀─ ─ ─ ─ (manual copy) ─ ─│  - Verify button       │
│  - Generate button    │                          │  - Result display      │
│  - Download proof     │─ ─ ─ ─ (manual upload)─ ▶│                        │
│                        │                          │                        │
│  Proxies /api → :3001 │                          │  Proxies /api → :3001  │
└──────────────────────┘                          └──────────────────────┘
```

---

## Complete Flow — Step by Step

### Phase 0: One-Time Setup (Done Before Demo)
1. **Circuit compilation:** `circom studentVerify.circom` → produces R1CS + WASM
2. **Trusted setup:** Powers of Tau ceremony (bn128, 2^14) → produces `.zkey`
3. **Verification key export:** From `.zkey` → `verification_key.json`
4. **EdDSA key generation:** `SHA256("IIT-Dholakpur-EdDSA-Private-Key-2026")` → private key → derive public key on Baby Jubjub

### Phase 1: MS365 Issues a Nonce
1. Student visits MS365 (http://localhost:5174)
2. MS365 frontend calls `POST /api/request-nonce { service: "ms365" }`
3. Backend generates 6 random bytes → converts to BigInt → stores in `nonceStore` Map
4. Returns nonce to MS365 frontend
5. Student **copies** the nonce (manual step — this is the session binding)

### Phase 2: Student Logs In & Generates Proof
1. Student visits Institute Portal (http://localhost:5173)
2. Enters enrollment number (`B23165`) and password (`pass123`)
3. Frontend calls `POST /api/login` → backend validates against `STUDENT_DB`
4. Student sees their credentials (name, dept, CGPA, enrollment status)
5. Student **pastes** the nonce from MS365
6. Student selects proof type (enrollment / CGPA ≥ threshold / both)
7. Clicks "Generate ZK Proof"

### Phase 3: Backend Generates the Proof (Server-Side)
This is the most complex part. Here's what happens inside `POST /api/generate-proof`:

```
Step 3a: Re-authenticate the student
   → Verify regNo + password against STUDENT_DB

Step 3b: Sign credentials with EdDSA
   → salt = random 16 bytes (unique per proof)
   → regNoNumeric = stringToNumeric("B23165") → 75504951545053 (char codes)
   → cgpaScaled = round(8.75 * 100) = 875
   → enrolled = 1
   → message = Poseidon(regNoNumeric, cgpaScaled, enrolled, salt)
   → signature = EdDSA.sign(privateKey, message)
   → Extract: sigR8x, sigR8y, sigS

Step 3c: Prepare circuit inputs
   Private inputs: regNo, cgpa, enrolled, salt, sigR8x, sigR8y, sigS
   Public inputs: pubKeyX, pubKeyY, cgpaThreshold, checkEnrolled, nonce

Step 3d: Generate Groth16 proof
   → snarkjs.groth16.fullProve(inputs, WASM_PATH, ZKEY_PATH)
   → Takes ~3-5 seconds (EdDSA circuit is 7698 constraints)
   → Returns: { proof: {pi_a, pi_b, pi_c}, publicSignals: [5 values] }

Step 3e: Return proof + metadata to frontend
```

### Phase 4: Student Downloads Proof
1. Frontend receives proof JSON
2. Student clicks "Download Proof" → saves `zk_proof_B23165.json`
3. This file contains: `{ proof, publicSignals, metadata }`

### Phase 5: Student Uploads Proof to MS365
1. Student goes back to MS365 portal
2. Clicks upload → selects the `.json` file
3. MS365 frontend parses the file, shows "Proof uploaded"

### Phase 6: MS365 Verifies the Proof
`POST /api/verify-proof { proof, publicSignals }`:

```
Step 6a: Load verification key from disk
   → verification_key.json (generated during trusted setup)

Step 6b: Verify Groth16 proof
   → snarkjs.groth16.verify(vkey, publicSignals, proof)
   → Mathematically checks: do the proof values satisfy the circuit constraints?
   → Returns true/false

Step 6c: Decode public signals
   → publicSignals[0] = pubKeyX (institute's public key)
   → publicSignals[1] = pubKeyY
   → publicSignals[2] = cgpaThreshold (e.g., 800 = CGPA ≥ 8.0)
   → publicSignals[3] = checkEnrolled (0 or 1)
   → publicSignals[4] = nonce

Step 6d: Validate nonce
   → Look up nonce in nonceStore
   → If found AND not used → mark as used, nonceValid = true
   → If not found or already used → nonceValid = false

Step 6e: Identify issuer
   → Compare pubKeyX/pubKeyY against known institute keys
   → Match found → issuer = "IIT Dholakpur"

Step 6f: Return result
   → verified = proofValid AND nonceValid
   → Include: issuer, claims, signatureType
```

### Phase 7: Result
- ✅ Verified → Student gets 50% discount
- ❌ Failed → Either proof is invalid OR nonce is expired/reused

---

## Circuit Deep Dive

### File: `circuits/studentVerify.circom`

The circuit is written in **Circom 2.1.6** and has **7,698 non-linear constraints**.

### Signals (Inputs/Outputs)

| Signal | Type | Description |
|--------|------|-------------|
| `regNo` | Private | Enrollment number (numeric) |
| `cgpa` | Private | CGPA × 100 (e.g., 875 = 8.75) |
| `enrolled` | Private | 1 = enrolled, 0 = graduated |
| `salt` | Private | Random secret (prevents rainbow table attacks) |
| `sigR8x` | Private | EdDSA signature R8 point X coordinate |
| `sigR8y` | Private | EdDSA signature R8 point Y coordinate |
| `sigS` | Private | EdDSA signature S scalar |
| `pubKeyX` | **Public** | Institute's public key X |
| `pubKeyY` | **Public** | Institute's public key Y |
| `cgpaThreshold` | **Public** | Minimum CGPA × 100 (0 = skip check) |
| `checkEnrolled` | **Public** | 1 = enforce enrollment, 0 = skip |
| `nonce` | **Public** | Session binding value |

### Circuit Logic (5 Steps)

**Step 1: Compute message hash**
```
M = Poseidon(regNo, cgpa, enrolled, salt)
```
This recreates the same hash that was signed. Uses the `Poseidon(4)` template from circomlib.

**Step 2: Verify EdDSA signature**
```
EdDSAPoseidonVerifier(enabled=1, Ax=pubKeyX, Ay=pubKeyY, R8x, R8y, S, M)
```
This is the **most expensive** part (~7000 of the 7698 constraints). It verifies that the EdDSA signature `(R8x, R8y, S)` is a valid signature of message `M` under public key `(pubKeyX, pubKeyY)`.

If signature is invalid → circuit is unsatisfiable → no valid proof can be generated.

**Step 3: Enrollment check (conditional)**
```
enrollmentGate = checkEnrolled * (1 - enrolled)
enrollmentGate === 0
```
Logic:
- If `checkEnrolled = 0` → gate = 0 regardless → passes (enrollment not checked)
- If `checkEnrolled = 1` AND `enrolled = 1` → gate = 1 * (1-1) = 0 → passes
- If `checkEnrolled = 1` AND `enrolled = 0` → gate = 1 * (1-0) = 1 → **FAILS**

**Step 4: CGPA range proof**
```
GreaterEqThan(16): cgpa >= cgpaThreshold
```
Uses 16-bit comparator (supports values up to 65535, i.e., CGPA up to 655.35 when scaled by 100). The `GreaterEqThan` template from circomlib does bit decomposition and comparison.

Note: If `cgpaThreshold = 0`, the check always passes (any CGPA ≥ 0).

**Step 5: Nonce binding**
```
nonceSquare = nonce * nonce
```
This creates a constraint involving `nonce`, ensuring it's "used" in the circuit. Without this, the nonce would be a free input that doesn't affect the proof's validity, and could theoretically be changed.

### Why These Design Choices?

- **EdDSA over Poseidon hash registry:** Previously, the circuit just checked `Poseidon(data) === credentialHash` and the hash was registered in a database. Problem: the verifier needed to query the institute's database. With EdDSA, the verifier only needs the public key — fully offline verification.

- **Poseidon over SHA-256:** SHA-256 would require ~25,000 constraints just for hashing. Poseidon does it in ~250. This matters because proof generation time is proportional to constraint count.

- **16-bit comparator:** CGPA × 100 ranges from 0 to 1000. 16 bits supports up to 65535 — more than enough with minimal constraint overhead.

- **Salt:** Without salt, the same student would always produce the same message hash. An attacker could build a rainbow table: try all enrollment numbers and see which hash matches. The salt (random 16 bytes) prevents this.

---

## Backend Deep Dive

### File: `backend/server.js`

### Key Components

**1. EdDSA Key Management**
```javascript
INSTITUTE_KEYS = generateKeyPair("IIT-Dholakpur-EdDSA-Private-Key-2026");
```
- Uses SHA-256 of a seed string as the private key
- Derives public key on Baby Jubjub curve
- Deterministic: same seed → same key pair (for demo reproducibility)
- In production: private key stored in HSM, seed generated from true randomness

**2. Nonce Store**
```javascript
const nonceStore = new Map();
// Key: nonce string, Value: { createdAt, used, service }
```
- Nonces expire after 10 minutes (cleaned on each new nonce request)
- Once used, `used = true` → can never be used again
- This prevents replay attacks

**3. Student Database (Mock)**
```javascript
const STUDENT_DB = [
  { regNo: "B23165", name: "Om Kumar", cgpa: 8.75, enrolled: true, password: "pass123" },
  // ... 3 more students
];
```
In production: this would be the institute's actual student database.

**4. Proof Generation Pipeline**
The backend does ALL the heavy lifting:
- Authenticates the student
- Signs their credentials with EdDSA
- Generates fresh salt
- Constructs circuit inputs
- Calls `snarkjs.groth16.fullProve()` (3-5 seconds)
- Returns proof to frontend

This is important: **the student never generates the proof themselves**. This simplifies UX — the student just clicks a button.

### File: `backend/utils/credential.js`

**`stringToNumeric(str)`** — Converts alphanumeric enrollment numbers to BigInt:
```
"B23165" → 66*256^5 + 50*256^4 + 51*256^3 + 49*256^2 + 54*256 + 53
         = 75504951545053
```
This is needed because Circom circuits only work with numbers (field elements).

**`signCredential(studentData, privKey)`** — The signing pipeline:
1. Generate random salt (16 bytes → BigInt)
2. Scale CGPA: `8.75 * 100 = 875`
3. Convert enrolled: `true → 1`
4. Convert regNo: `"B23165" → 75504951545053`
5. Hash message: `Poseidon(regNoNumeric, cgpaScaled, enrolled, salt)`
6. Sign: `eddsa.signPoseidon(privKey, msgHash)`
7. Return all values needed for circuit input

---

## Frontend Deep Dive

### File: `frontend/src/pages/Institute.jsx`

Simple React component with these states:
- Login flow: `regNo`, `password` → POST `/api/login` → show student card
- Proof generation: `nonce`, `proofType`, `cgpaThreshold` → POST `/api/generate-proof`
- Download: converts proof JSON to Blob → creates download link

The frontend does NO cryptographic operations. It's purely a UI that talks to the backend.

### Vite Config
```javascript
proxy: { '/api': 'http://localhost:3001' }
```
All `/api/*` requests from the browser are proxied to the backend. This avoids CORS issues.

---

## MS365 Verifier Deep Dive

### File: `ms365/src/App.jsx`

The verifier portal (themed as Microsoft 365 Education):

1. **On page load:** Calls `POST /api/request-nonce` → displays the nonce
2. **Copy button:** Puts nonce in clipboard
3. **File upload:** Parses JSON, validates structure (must have `proof` + `publicSignals`)
4. **Verify button:** Calls `POST /api/verify-proof` with proof data
5. **Result display:** Shows verified/failed with details (issuer, claims, nonce status)

Key UX detail: The nonce is displayed prominently with a "Copy" button — this is the link between the two portals.

---

## Security Model

### Attack: Proof Replay
**Scenario:** Attacker intercepts a valid proof and submits it again.
**Prevention:** The nonce is stored in `nonceStore`. On first verification, `used = true`. On second attempt, `nonceValid = false` → verification fails.

### Attack: Proof Transfer
**Scenario:** Student A generates a proof and gives it to Student B (who is not enrolled).
**Prevention:** The nonce is issued by MS365 for a specific session. Student B would need to get their OWN nonce and generate their OWN proof. The original proof is bound to Student A's session.

### Attack: Data Forgery
**Scenario:** Someone claims CGPA = 9.5 when it's actually 6.0.
**Prevention:** The EdDSA signature is verified inside the circuit. Only the institute's private key can produce a valid signature. If you change any credential data, the signature won't verify → circuit is unsatisfiable → no proof can be generated.

### Attack: Fake Institute
**Scenario:** Someone creates their own key pair and signs fake credentials.
**Prevention:** The verifier checks `pubKeyX`/`pubKeyY` in the public signals against a whitelist of trusted institutes. Unknown public keys → `issuer = "Unknown"` → reject.

### Attack: Nonce Guessing
**Scenario:** Attacker generates a proof with a guessed nonce.
**Prevention:** Nonces are 6 random bytes = 2^48 possible values (~281 trillion). Computationally infeasible to guess.

### Attack: Rainbow Table on Credential Hash
**Scenario:** Attacker pre-computes `Poseidon(regNo, cgpa, enrolled, salt)` for all possible regNos.
**Prevention:** The salt is random 16 bytes (2^128 possibilities). Even if you know the regNo, you can't compute the hash without knowing the salt.

### What the Verifier CAN see (Public Signals):
1. `pubKeyX`, `pubKeyY` — identifies which institute signed the credentials
2. `cgpaThreshold` — the threshold being proven (NOT the actual CGPA)
3. `checkEnrolled` — whether enrollment was verified
4. `nonce` — session binding

### What the Verifier CANNOT see:
1. Student's name
2. Enrollment number
3. Exact CGPA
4. Department
5. The EdDSA signature itself
6. The salt

---

## Problems Faced & Solutions

### Problem 1: Circom npm package is v1 only
**Issue:** Running `npm install circom` installs circom v1 (JavaScript-based), which doesn't support circom 2.x syntax like `pragma circom 2.1.6` or the `{public [...]}` syntax.

**Solution:** Downloaded the **Circom 2.2.3 Windows binary** directly from GitHub releases (`circom-windows-amd64.exe`) and saved it as `circuits/circom.exe`. The setup script checks for this local binary first.

### Problem 2: "Too many values for input signal" error
**Issue:** After recompiling the circuit with EdDSA (which has more signals), the old WASM file was still cached in `backend/artifacts/`. The old WASM expected fewer inputs than we were providing.

**Solution:** Always force-copy new WASM from `circuits/build/` to `backend/artifacts/` after recompilation. The `setup.js` script does this automatically. If you get this error, delete `backend/artifacts/` and re-run setup.

### Problem 3: Nonce too large for circuit
**Issue:** Initially used `crypto.randomBytes(32)` (256 bits) for nonces. When converting to BigInt, the value exceeded the BN128 field prime (~254 bits), causing snarkjs to error.

**Solution:** Reduced nonce to **6 bytes** (48 bits). This is still 2^48 = ~281 trillion possible values — more than enough for anti-replay, and safely within the field.

### Problem 4: Alphanumeric enrollment numbers in circuits
**Issue:** Circom only works with numbers (field elements on BN128). Enrollment numbers like "B23165" can't be directly used.

**Solution:** Created `stringToNumeric()` function that converts each character to its ASCII code and combines them:
```
"B23165" → B=66, 2=50, 3=51, 1=49, 6=54, 5=53
→ 66×256⁵ + 50×256⁴ + 51×256³ + 49×256² + 54×256¹ + 53×256⁰
= 75504951545053
```

### Problem 5: EdDSA signature format mismatch
**Issue:** The `circomlibjs` library's `signPoseidon()` returns signature as `{ R8: [Uint8Array, Uint8Array], S: BigInt }`. But the circuit expects scalar field elements.

**Solution:** Convert using the finite field:
```javascript
R8x: F.toObject(signature.R8[0]).toString()
R8y: F.toObject(signature.R8[1]).toString()
S: signature.S.toString()
```

### Problem 6: Powers of Tau size
**Issue:** Initially used `2^12` (4096 constraints max) for Powers of Tau. After adding EdDSA verification, the circuit grew to 7,698 constraints — exceeding the limit.

**Solution:** Upgraded to `2^14` (16,384 constraints max). This makes the `.ptau` file ~16MB but easily handles our circuit. The setup takes ~30 seconds longer.

### Problem 7: Proof generation too slow on client
**Issue:** Originally, proof generation was done in the browser (frontend). With EdDSA verification, it took 15-20 seconds and sometimes crashed on low-memory devices.

**Solution:** Moved proof generation to the **backend** (server-side). Now it takes 3-5 seconds on the server. The student just clicks a button and downloads the result. Much better UX.

### Problem 8: Replay attack vulnerability
**Issue:** In the initial design, the same proof could be uploaded multiple times. A student could share their proof with friends.

**Solution:** Implemented **nonce-based challenge-response**:
1. MS365 issues a random nonce per session
2. Nonce is included as a public input in the proof
3. During verification, backend checks: is this nonce valid AND unused?
4. After first use, nonce is marked as used → second attempt fails

### Problem 9: Credential hash registry (original design flaw)
**Issue:** The original design used a Poseidon hash as a "credential hash" that was stored in a registry. The verifier needed to check this hash against the registry. Problem: this required the institute to maintain an online registry, and the verifier needed to query it.

**Solution:** Replaced hash registry with **EdDSA signatures**. Now:
- Institute signs credentials with EdDSA private key
- ZK circuit verifies the signature inside the proof
- Verifier only needs the institute's public key (no registry needed)
- Fully offline verification!

### Problem 10: DigiLocker added complexity without clear UX benefit
**Issue:** Added DigiLocker as a second credential source, but it complicated the frontend with a toggle and confused the demo flow.

**Solution:** Removed DigiLocker from the final version. Kept it as a "Future Enhancement" in the README. The single-issuer flow is cleaner for demo and easier to understand.

### Problem 11: Frontend proxy not working (CORS)
**Issue:** When the frontend (port 5173) tried to call the backend (port 3001) directly, CORS errors blocked the requests.

**Solution:** Used Vite's built-in proxy:
```javascript
// vite.config.js
server: {
  port: 5173,
  proxy: { '/api': 'http://localhost:3001' }
}
```
Now frontend calls `/api/login` (same origin) → Vite proxies to `localhost:3001/api/login`.

### Problem 12: Git not installed / EMU account restrictions
**Issue:** Machine didn't have Git installed, and the Enterprise Managed User (EMU) GitHub account couldn't create public repositories.

**Solution:** Installed Git via `winget install Git.Git`, then authenticated with a personal GitHub account (`harshithi5`) using `gh auth login` to push the repo as public.

---

## How to Run

### Prerequisites
- Node.js 18+
- Circom 2.x (auto-downloaded during setup as `circom.exe`)

### Quick Start
```bash
# Install all dependencies
cd hackathon/circuits && npm install
cd ../backend && npm install
cd ../frontend && npm install
cd ../ms365 && npm install

# Compile circuit & trusted setup (only needed once, ~2 min)
cd ../circuits && node setup.js

# Start all services (3 terminals)
cd ../backend && node server.js          # Backend API → http://localhost:3001
cd ../frontend && npx vite               # Student Portal → http://localhost:5173
cd ../ms365 && npx vite                  # MS365 Verifier → http://localhost:5174
```

### Demo Accounts
| Enrollment | Name | CGPA | Enrolled | Password |
|-----------|------|------|----------|----------|
| B23165 | Om Kumar | 8.75 | ✅ | pass123 |
| B23042 | Priya Patel | 9.20 | ✅ | pass123 |
| B23108 | Rahul Verma | 7.50 | ✅ | pass123 |
| B22091 | Sneha Gupta | 8.10 | ❌ | pass123 |

---

## Resume Session Command

To resume this Copilot CLI session and continue working on this project:

```
copilot session resume f6e35031-c1f1-475c-87ee-fe2230b43e33
```

This session contains the full history of building ZK-StudentID: architecture decisions, EdDSA integration, circuit design, frontend/backend development, debugging, and deployment.

---

## GitHub Repository

**Public:** https://github.com/harshithi5/ZK-StudentID

---

*Built for Hackathon 2026 🚀*
