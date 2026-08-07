import Link from "next/link";

export type LegalSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export default function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <main className="min-h-screen bg-[#07070B] px-5 py-10 text-white">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-semibold text-violet-300 hover:text-violet-200">
          ← PartySafari
        </Link>
        <h1 className="mt-5 text-4xl font-black tracking-tight">{title}</h1>
        <p className="mt-3 text-sm text-white/50">Effective August 6, 2026</p>
        <p className="mt-6 text-base leading-7 text-white/75">{intro}</p>

        <div className="mt-10 space-y-9">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-bold text-white">{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-3 leading-7 text-white/70">
                  {paragraph}
                </p>
              ))}
              {section.bullets ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-white/70">
                  {section.bullets.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
