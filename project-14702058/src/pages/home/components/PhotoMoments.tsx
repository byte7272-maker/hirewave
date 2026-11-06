import { useScrollReveal } from '@/hooks/useScrollReveal';
import { useBrandName } from '@/hooks/useBranding';

interface Moment {
  chip: string;
  heading: string;
  body: string;
  img: string;
  alt: string;
  imgTitle: string;
}

function MomentFigure({ moment, index }: { moment: Moment; index: number }) {
  const { ref, visible } = useScrollReveal<HTMLElement>({ threshold: 0.2 });

  return (
    <figure
      ref={ref}
      style={{ transitionDelay: `${index * 140}ms` }}
      className={`group relative rounded-2xl overflow-hidden border border-background-200 transition-all duration-700 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
      }`}
    >
      <div className="w-full h-[300px] md:h-[420px]">
        <img
          src={moment.img}
          alt={moment.alt}
          title={moment.imgTitle}
          className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-[1.03]"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-foreground-950/85 via-foreground-950/25 to-transparent"></div>
      <figcaption className="absolute bottom-0 left-0 right-0 p-6 md:p-7">
        <span className="inline-block text-[11px] uppercase tracking-widest font-semibold px-2.5 py-1 rounded bg-accent-500 text-background-50 dark:text-foreground-950 mb-3">
          {moment.chip}
        </span>
        <h3 className="font-heading text-xl md:text-2xl text-background-50 font-medium tracking-tight mb-1.5">
          {moment.heading}
        </h3>
        <p className="text-sm text-background-200 leading-relaxed max-w-md">
          {moment.body}
        </p>
      </figcaption>
    </figure>
  );
}

export default function PhotoMoments() {
  const brandName = useBrandName();

  const MOMENTS: Moment[] = [
    {
      chip: "Interview mode",
      heading: "Rehearse the nerve-wracking ones",
      body: "Answer out loud and get scored on structure, specificity and filler words — while the stakes are still zero.",
      img: "https://storage.helloreaddy.io/project_files/d6523991-0f51-4e05-ac11-6a28b4f177fa/dfbcee30-39d7-416b-88ed-89368fe37194_compressed_Agent-Image---A-confident-young-Middle-Eastern-woman-giving-a-presentation-to-a-small-seated-audienc.webp",
      alt: "A confident professional presenting to a small seated audience in a bright meeting room",
      imgTitle: `${brandName} mock interview practice session`,
    },
    {
      chip: "Culture fit",
      heading: "Walk in already at ease",
      body: "Prep the role, the team and the questions that make you sound like you already belong in the room.",
      img: "https://storage.helloreaddy.io/project_files/d6523991-0f51-4e05-ac11-6a28b4f177fa/0ec81b66-a419-4d63-b5da-371f1b2c0d8b_compressed_Agent-Image---Two-coworkers-sharing-a-laugh-by-the-office-coffee-station_-an-East-Asian-woman-in-her.webp",
      alt: "Two coworkers sharing a laugh over coffee in a bright modern office",
      imgTitle: `${brandName} community and culture fit`,
    },
  ];

  return (
    <section className="py-20 md:py-28 bg-background-50">
      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-6 items-end mb-10">
          <div className="lg:col-span-7">
            <p className="text-xs uppercase tracking-[0.2em] text-accent-700 font-semibold mb-4">
              In the room
            </p>
            <h2 className="font-heading text-3xl md:text-5xl leading-[1.05] tracking-tight text-foreground-950 font-medium">
              The human side of
              <br />
              <span className="italic text-accent-600">landing the offer</span>
            </h2>
          </div>
          <p className="lg:col-span-5 text-base text-foreground-700 leading-relaxed">
            {brandName} handles the tedious middle — the sourcing, the tailoring,
            the applying — so you can spend your energy on the two moments that
            actually decide the outcome: the interview and the culture fit.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {MOMENTS.map((m, index) => (
            <MomentFigure key={m.chip} moment={m} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}