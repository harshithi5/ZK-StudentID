pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/eddsaposeidon.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

// ZK-StudentID v2: EdDSA Signature Verification
//
// The institute (or DigiLocker) signs student data with EdDSA.
// The circuit verifies the signature IN the proof — so the verifier
// only needs the institute's public key. No registry needed.
//
// Privacy preserved:
//   - regNo, salt, exact CGPA: HIDDEN
//   - Institute public key, threshold, nonce: PUBLIC
//
// Security:
//   - EdDSA signature proves data came from the institute
//   - Nonce prevents replay/transfer attacks
//   - Range proof hides exact CGPA

template StudentVerify() {
    // ── Private inputs (HIDDEN) ──
    signal input regNo;       // enrollment number
    signal input cgpa;        // CGPA * 100
    signal input enrolled;    // 1 or 0
    signal input salt;        // random secret

    // EdDSA signature components (private — student holds these)
    signal input sigR8x;
    signal input sigR8y;
    signal input sigS;

    // ── Public inputs (verifier sees these) ──
    signal input pubKeyX;       // institute's public key X
    signal input pubKeyY;       // institute's public key Y
    signal input cgpaThreshold; // minimum CGPA * 100 (0 = skip)
    signal input checkEnrolled; // 1 = verify enrollment, 0 = skip
    signal input nonce;         // session nonce — prevents replay

    // ── Step 1: Compute message hash ──
    // M = Poseidon(regNo, cgpa, enrolled, salt)
    component msgHash = Poseidon(4);
    msgHash.inputs[0] <== regNo;
    msgHash.inputs[1] <== cgpa;
    msgHash.inputs[2] <== enrolled;
    msgHash.inputs[3] <== salt;

    // ── Step 2: Verify EdDSA signature ──
    // Proves that the institute signed this exact data
    component sigVerifier = EdDSAPoseidonVerifier();
    sigVerifier.enabled <== 1;
    sigVerifier.Ax <== pubKeyX;
    sigVerifier.Ay <== pubKeyY;
    sigVerifier.R8x <== sigR8x;
    sigVerifier.R8y <== sigR8y;
    sigVerifier.S <== sigS;
    sigVerifier.M <== msgHash.out;

    // ── Step 3: Enrollment check (conditional) ──
    signal enrollmentGate;
    enrollmentGate <== checkEnrolled * (1 - enrolled);
    enrollmentGate === 0;

    // ── Step 4: CGPA range proof ──
    component gte = GreaterEqThan(16);
    gte.in[0] <== cgpa;
    gte.in[1] <== cgpaThreshold;
    gte.out === 1;

    // ── Step 5: Nonce binding ──
    signal nonceSquare;
    nonceSquare <== nonce * nonce;
}

component main {public [pubKeyX, pubKeyY, cgpaThreshold, checkEnrolled, nonce]} = StudentVerify();
