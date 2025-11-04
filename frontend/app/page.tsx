"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [message, setMessage] = useState<string>("Loading...");

  useEffect(() => {
    fetch("http://localhost:4000/api/hello")
      .then((res) => res.json())
      .then((data) => setMessage(data.message))
      .catch((err) => setMessage("Error: " + err.message));
  }, []);

  return (
    <main className="p-8 font-sans">
      <h1 className="text-3xl font-bold mb-4">tiqrdupe prototype</h1>
      <p>{message}</p>
    </main>
  );
}
