"use client";

const companies = [
  {
    id: 1,
    name: "Red Bull",
    agreementImage: "/agreements/redbull.png",
  },
];

export default function AdminCompaniesPage() {
  return (
    <>
      <h1 className="text-xl font-semibold mb-6">Companies</h1>

      <div className="grid md:grid-cols-2 gap-6">
        {companies.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border p-4">
            <p className="font-medium mb-2">{c.name}</p>
            <img
              src={c.agreementImage}
              alt="Agreement"
              className="rounded-lg border"
            />
          </div>
        ))}
      </div>
    </>
  );
}
