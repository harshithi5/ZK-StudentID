import React from "react";
import Institute from "./pages/Institute";

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>🏛️ IIT Dholakpur</h1>
        <p className="subtitle">Student Verification Portal</p>
      </header>
      <main className="main">
        <Institute />
      </main>
      <footer className="footer">
        Powered by ZK-StudentID — Zero-Knowledge Proof Verification
      </footer>
    </div>
  );
}
