"use client";

import Link from "next/link";

const events = [
  {
    id: 1,
    name: "Proshow Day 1",
    fest: "Tathva",
    image: "/images/proshow.jpg",
  },
];

export default function AdminFestsPage() {
  return (
    <>
      <h1 className="text-xl font-semibold mb-6">Fests & Events</h1>

      <div className="grid md:grid-cols-3 gap-6">
        {events.map((e) => (
          <Link
            key={e.id}
            href={`/host/events/${e.id}/manage`}
            className="rounded-xl overflow-hidden border bg-white hover:shadow-md transition"
          >
            <img src={e.image} className="h-40 w-full object-cover" />
            <div className="p-4">
              <p className="font-medium">{e.name}</p>
              <p className="text-sm text-gray-500">{e.fest}</p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
