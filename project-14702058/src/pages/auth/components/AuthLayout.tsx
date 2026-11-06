import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useBrandName } from "@/hooks/useBranding";
import ThemeToggle from "@/components/base/ThemeToggle";

const HIGHLIGHTS = [
  { icon: "ri-radar-line", text: "Semantic job matching tuned to your skills, salary, and location" },
  { icon: "ri-shield-check-line", text: "Every posting verified before it reaches your shortlist" },
  { icon: "ri-file-text-line", text: "Tailored resumes and cover letters, generated in seconds" },
  { icon: "ri-mic-line", text: "Voice mock interviews with real-time feedback" },
];

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

export default function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  const brandName = useBrandName();
  return (
    <div className="min-h-screen bg-background-50 text-foreground-950 font-sans flex flex-col lg:flex-row">
      {/* Branding panel */}
      <aside className="hidden lg:flex lg:w-[44%] xl:w-1/2 relative overflow-hidden">
        <img
          src="https://readdy.ai/api/search-image?query=Cinematic%20editorial%20business%20photography%20of%20a%20confident%20professional%20woman%20in%20a%20tailored%20blazer%20walking%20through%20a%20modern%20glass%20office%20atrium%2C%20warm%20golden%20hour%20light%20streaming%20through%20windows%2C%20soft%20cream%20and%20warm%20neutral%20tones%20with%20subtle%20emerald%20and%20coral%20accent%20lighting%2C%20shallow%20depth%20of%20field%2C%20premium%20magazine%20aesthetic%2C%20aspirational%20forward-looking%20mood%2C%20high%20detail%2C%20vertical%20composition&width=900&height=1400&seq=auth-branding-01&orientation=portrait"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-primary-950/80 via-primary-900/60 to-primary-950/85"></div>
        <div className="absolute inset-0 bg-noise opacity-10"></div>
        <div className="absolute inset-0 hw-dotgrid opacity-[0.15]"></div>

        <div className="relative z-10 flex flex-col justify-between w-full p-10 xl:p-12 text-background-50">
          <Link to="/" className="flex items-center gap-2 cursor-pointer w-fit whitespace-nowrap">
            <img
              src="https://storage.helloreaddy.io/project_files/d6523991-0f51-4e05-ac11-6a28b4f177fa/1f022524-733b-4112-925c-668e802bb9e2_compressed_icon128.webp"
              alt={`${brandName} logo`}
              width={36}
              height={36}
              className="w-9 h-9 rounded-lg object-cover"
            />
            <span className="font-heading text-2xl font-semibold tracking-tight">{brandName}</span>
          </Link>

          <div className="max-w-md">
            <h2 className="font-heading text-4xl leading-tight">
              Your job search, finally on autopilot.
            </h2>
            <ul className="mt-8 space-y-2.5">
              {HIGHLIGHTS.map((h) => (
                <li
                  key={h.text}
                  className="flex items-start gap-3 rounded-xl bg-background-50/[0.06] border border-background-50/10 px-3.5 py-3"
                >
                  <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-background-50/15 flex-shrink-0">
                    <i className={`${h.icon} text-base`}></i>
                  </span>
                  <span className="text-sm text-background-50/90 leading-relaxed pt-1">{h.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <blockquote className="max-w-md rounded-xl bg-background-50/10 border border-background-50/20 p-5">
            <p className="text-sm leading-relaxed text-background-50/90">
              “{brandName} found me interviews at three companies I’d never have discovered on my own — and the mock interview prep gave me real confidence.”
            </p>
            <div className="mt-4 flex items-center gap-3">
              <span className="w-9 h-9 flex items-center justify-center rounded-full bg-background-50/20 text-sm font-semibold">
                MR
              </span>
              <div>
                <div className="text-sm font-semibold">Maya Reyes</div>
                <div className="text-xs text-background-50/70">Senior Product Designer</div>
              </div>
            </div>
          </blockquote>
        </div>
      </aside>

      {/* Form panel */}
      <div className="relative flex-1 flex flex-col min-h-screen">
        <div className="absolute top-4 right-4 md:top-6 md:right-6 z-10">
          <ThemeToggle className="border border-background-200 bg-background-50/80 backdrop-blur" />
        </div>
        <header className="lg:hidden flex items-center justify-between px-4 md:px-6 py-4 border-b border-background-200">
          <Link to="/" className="flex items-center gap-2 cursor-pointer">
            <img
              src="https://storage.helloreaddy.io/project_files/d6523991-0f51-4e05-ac11-6a28b4f177fa/1f022524-733b-4112-925c-668e802bb9e2_compressed_icon128.webp"
              alt={`${brandName} logo`}
              width={32}
              height={32}
              className="w-8 h-8 rounded-lg object-cover"
            />
            <span className="font-heading text-xl font-semibold">{brandName}</span>
          </Link>
        </header>

        <div className="flex-1 flex items-center justify-center px-4 md:px-10 py-10 md:py-14">
          <div className="w-full max-w-md">
            <h1 className="font-heading text-3xl md:text-4xl font-medium">{title}</h1>
            <p className="text-sm text-foreground-600 mt-2">{subtitle}</p>

            <div className="mt-8">{children}</div>

            <div className="mt-6 text-sm text-foreground-600">{footer}</div>
          </div>
        </div>
      </div>
    </div>
  );
}