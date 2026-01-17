"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

const events = [
  {
    id: 1,
    name: "Proshow Day 1",
    location: "Main Ground",
    date: "Feb 14, 2025",
    image: "/images/proshow.jpg",
  },
  {
    id: 2,
    name: "Tech Expo",
    location: "Auditorium",
    date: "Feb 16, 2025",
    image: "/images/tech.jpg",
  },
];

export default function FestEvents() {
  const router = useRouter();

  return (
    <section className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-lg font-semibold text-purple-700 mb-4">
        Fest Events
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {events.map((event) => (
          <div
            key={event.id}
            onClick={() => router.push(`/host/events/${event.id}/manage?from=admin`)}
            className="cursor-pointer border rounded-xl overflow-hidden hover:shadow-md transition"
          >
            <div className="relative h-40">
              <Image
                src={event.image}
                alt={event.name}
                fill
                className="object-cover"
              />
            </div>

            <div className="p-4">
              <h3 className="font-semibold">{event.name}</h3>
              <p className="text-sm text-gray-500">{event.location}</p>
              <p className="text-sm text-gray-400">{event.date}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
