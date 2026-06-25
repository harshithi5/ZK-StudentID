/**
 * Credential utilities — EdDSA signing + Poseidon hashing.
 */

const { buildPoseidon, buildEddsa } = require("circomlibjs");
const crypto = require("crypto");

let poseidon = null;
let eddsa = null;
let F = null;

async function init() {
  if (!poseidon) {
    poseidon = await buildPoseidon();
    F = poseidon.F;
  }
  if (!eddsa) {
    eddsa = await buildEddsa();
  }
}

/**
 * Generate an EdDSA key pair for an institute.
 * @returns {{ privKey: Buffer, pubKey: [bigint, bigint] }}
 */
function generateKeyPair(seed) {
  const privKey = crypto.createHash("sha256").update(seed).digest();
  const pubKey = eddsa.prv2pub(privKey);
  return {
    privKey,
    pubKey: [F.toObject(pubKey[0]), F.toObject(pubKey[1])],
  };
}

/**
 * Generate a random salt.
 */
function generateSalt() {
  return BigInt("0x" + crypto.randomBytes(16).toString("hex"));
}

/**
 * Convert alphanumeric string to a numeric value for circuit input.
 */
function stringToNumeric(str) {
  let num = BigInt(0);
  for (let i = 0; i < str.length; i++) {
    num = num * BigInt(256) + BigInt(str.charCodeAt(i));
  }
  return num;
}

/**
 * Sign student credential data with EdDSA.
 * Message = Poseidon(regNo, cgpa, enrolled, salt)
 *
 * @returns Signed credential with all needed circuit inputs
 */
async function signCredential(studentData, privKey) {
  await init();

  const salt = generateSalt();
  const cgpaScaled = Math.round(studentData.cgpa * 100);
  const enrolled = studentData.enrolled ? 1 : 0;
  const regNoNumeric = stringToNumeric(studentData.regNo);

  // Compute message: Poseidon(regNo, cgpa, enrolled, salt)
  const msgHash = poseidon([
    regNoNumeric,
    BigInt(cgpaScaled),
    BigInt(enrolled),
    salt,
  ]);

  // Sign the message with EdDSA
  const signature = eddsa.signPoseidon(privKey, msgHash);

  return {
    // Circuit private inputs
    credential: {
      regNo: studentData.regNo,
      regNoNumeric: regNoNumeric.toString(),
      name: studentData.name,
      department: studentData.department,
      cgpa: studentData.cgpa,
      cgpaScaled: cgpaScaled.toString(),
      enrolled: enrolled.toString(),
      salt: salt.toString(),
    },
    // EdDSA signature (private — student holds these)
    signature: {
      R8x: F.toObject(signature.R8[0]).toString(),
      R8y: F.toObject(signature.R8[1]).toString(),
      S: signature.S.toString(),
    },
    // Metadata
    issuedAt: new Date().toISOString(),
  };
}

module.exports = { init, generateKeyPair, signCredential, stringToNumeric };
