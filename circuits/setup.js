/**
 * Circuit Compilation & Trusted Setup Script
 *
 * This script:
 *   1. Compiles the Circom circuit
 *   2. Runs a Groth16 trusted setup (Powers of Tau + circuit-specific)
 *   3. Exports the verification key
 *
 * Prerequisites:
 *   - circom compiler installed globally (npm i -g circom or from https://docs.circom.io/)
 *   - npm install in this directory
 *
 * Usage: node setup.js
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const CIRCUIT = "studentVerify";
const BUILD_DIR = path.join(__dirname, "build");

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: __dirname });
}

async function main() {
  // Create build directory
  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
  }

  console.log("=== Step 1: Compile Circuit ===");
  // Use local circom binary if available, otherwise fall back to global
  const localCircom = path.join(__dirname, "circom.exe");
  const circomBin = fs.existsSync(localCircom) ? `"${localCircom}"` : "circom";
  run(
    `${circomBin} ${CIRCUIT}.circom --r1cs --wasm --sym -o build -l node_modules`
  );

  console.log("\n=== Step 2: Powers of Tau (Phase 1) ===");
  run(
    `npx snarkjs powersoftau new bn128 14 build/pot14_0000.ptau -v`
  );
  run(
    `npx snarkjs powersoftau contribute build/pot14_0000.ptau build/pot14_0001.ptau --name="First contribution" -v -e="random entropy for hackathon"`
  );
  run(
    `npx snarkjs powersoftau prepare phase2 build/pot14_0001.ptau build/pot14_final.ptau -v`
  );

  console.log("\n=== Step 3: Circuit-Specific Setup (Phase 2) ===");
  run(
    `npx snarkjs groth16 setup build/${CIRCUIT}.r1cs build/pot14_final.ptau build/${CIRCUIT}_0000.zkey`
  );
  run(
    `npx snarkjs zkey contribute build/${CIRCUIT}_0000.zkey build/${CIRCUIT}_final.zkey --name="Hackathon contribution" -v -e="more random entropy"`
  );

  console.log("\n=== Step 4: Export Verification Key ===");
  run(
    `npx snarkjs zkey export verificationkey build/${CIRCUIT}_final.zkey build/verification_key.json`
  );

  console.log("\n=== Setup Complete! ===");
  console.log(`Build artifacts in: ${BUILD_DIR}`);
  console.log("Files generated:");
  console.log(`  - build/${CIRCUIT}_js/${CIRCUIT}.wasm  (circuit WASM)`);
  console.log(`  - build/${CIRCUIT}_final.zkey          (proving key)`);
  console.log(`  - build/verification_key.json          (verification key)`);

  // Copy artifacts needed by backend and frontend
  const backendArtifacts = path.join(__dirname, "..", "backend", "artifacts");
  const frontendArtifacts = path.join(__dirname, "..", "frontend", "public", "artifacts");

  for (const dir of [backendArtifacts, frontendArtifacts]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Copy verification key to backend
  fs.copyFileSync(
    path.join(BUILD_DIR, "verification_key.json"),
    path.join(backendArtifacts, "verification_key.json")
  );

  // Copy WASM and zkey to frontend (needed for in-browser proof generation)
  fs.copyFileSync(
    path.join(BUILD_DIR, `${CIRCUIT}_js`, `${CIRCUIT}.wasm`),
    path.join(frontendArtifacts, `${CIRCUIT}.wasm`)
  );
  fs.copyFileSync(
    path.join(BUILD_DIR, `${CIRCUIT}_final.zkey`),
    path.join(frontendArtifacts, `${CIRCUIT}_final.zkey`)
  );

  // Also copy verification key to frontend for client-side verification demo
  fs.copyFileSync(
    path.join(BUILD_DIR, "verification_key.json"),
    path.join(frontendArtifacts, "verification_key.json")
  );

  console.log("\nArtifacts copied to backend/artifacts and frontend/public/artifacts");
}

main().catch((err) => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
