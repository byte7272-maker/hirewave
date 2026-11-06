import { useState } from "react";
import { userProfile } from "@/mocks/dashboard";
import ConnectedSitesPanel from "@/pages/dashboard/components/ConnectedSitesPanel";
import ExtensionNoticeCard from "@/pages/dashboard/settings/components/ExtensionNoticeCard";
import SessionStatusChip from "@/components/feature/SessionStatusChip";
import { GLIDE_SPEED_OPTIONS, type GlideSpeedPref } from "@/lib/railGlide";
import { readGlideSpeedPref, writeGlideSpeedPref } from "@/lib/railGlideMemory";
import { Badge, Button, Card, SectionHeader, TextField } from "@/components/base";

function Toggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-foreground-900">{label}</div>
        <div className="text-xs text-foreground-500 mt-0.5">{desc}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
          checked ? "bg-primary-500" : "bg-background-300"
        }`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background-50 transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        ></span>
      </button>
    </div>
  );
}

export default function Settings() {
  const [name, setName] = useState(userProfile.name);
  const [email, setEmail] = useState("jordan@projectharbor.app");
  const [role, setRole] = useState(userProfile.role);
  const [location, setLocation] = useState(userProfile.location);
  const [emailNotif, setEmailNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [glideSpeed, setGlideSpeed] = useState<GlideSpeedPref>(() => readGlideSpeedPref());
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  /** Apply the glide pace immediately and remember it, so rails feel it at once. */
  const chooseGlideSpeed = (pref: GlideSpeedPref) => {
    setGlideSpeed(pref);
    writeGlideSpeedPref(pref);
  };

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">
            Settings
          </h1>
          <p className="text-sm text-foreground-600 mt-1">Manage your profile and preferences.</p>
        </div>
        {saved && (
          <Badge tone="primary" icon="ri-check-line" className="animate-fade-in-up">
            Saved
          </Badge>
        )}
      </section>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card surface="tinted" className="animate-fade-in-up">
            <SectionHeader
              icon="ri-user-line"
              tone="primary"
              title="Profile"
              subtitle="Your job-seeker details"
            />
            <div className="p-5 grid sm:grid-cols-2 gap-4">
              <TextField label="Full name" value={name} onChange={setName} autoComplete="name" />
              <TextField
                label="Email"
                value={email}
                onChange={setEmail}
                type="email"
                autoComplete="email"
              />
              <TextField label="Job title" value={role} onChange={setRole} />
              <TextField
                label="Location"
                value={location}
                onChange={setLocation}
                icon="ri-map-pin-line"
              />
            </div>
          </Card>

          <Card
            surface="tinted"
            className="animate-fade-in-up"
            style={{ animationDelay: "0.06s" }}
          >
            <SectionHeader
              icon="ri-notification-3-line"
              tone="secondary"
              title="Notifications"
              subtitle="Choose what hits your inbox"
            />
            <div className="p-5 space-y-4">
              <Toggle
                label="Email replies"
                desc="Get notified when a recruiter replies"
                checked={emailNotif}
                onChange={setEmailNotif}
              />
              <Toggle
                label="Push notifications"
                desc="Interview reminders and match alerts"
                checked={pushNotif}
                onChange={setPushNotif}
              />
              <Toggle
                label="Weekly digest"
                desc="A summary of your job-search progress"
                checked={weeklyDigest}
                onChange={setWeeklyDigest}
              />
            </div>
          </Card>

          <Card
            surface="tinted"
            className="animate-fade-in-up"
            style={{ animationDelay: "0.075s" }}
          >
            <SectionHeader
              icon="ri-speed-up-line"
              tone="accent"
              title="Browsing"
              subtitle="How rails behave under your cursor"
            />
            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground-900">
                    Rail glide speed
                  </div>
                  <div className="text-xs text-foreground-500 mt-0.5 max-w-md">
                    How fast the version and document rails move when you hover an
                    arrow. Whichever you choose, the rail still eases in gently and
                    settles softly. Applies right away.
                  </div>
                </div>
                <div
                  className="inline-flex items-center gap-1 p-1 rounded-full border border-background-200 bg-background-50"
                  role="radiogroup"
                  aria-label="Rail glide speed"
                >
                  {GLIDE_SPEED_OPTIONS.map((opt) => {
                    const active = glideSpeed === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        title={opt.hint}
                        onClick={() => chooseGlideSpeed(opt.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                          active
                            ? "bg-primary-500 text-background-50 dark:text-foreground-950"
                            : "text-foreground-600 hover:bg-background-100"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

          <Card
            surface="tinted"
            className="animate-fade-in-up"
            style={{ animationDelay: "0.09s" }}
          >
            <SectionHeader
              icon="ri-shield-keyhole-line"
              tone="foreground"
              title="Session"
              subtitle="Your sign-in stays alive automatically — here's the refresh activity"
            />
            <div className="p-5">
              <SessionStatusChip variant="panel" showHistory />
            </div>
          </Card>

          <ConnectedSitesPanel />

          <div className="animate-fade-in-up" style={{ animationDelay: "0.12s" }}>
            <Button icon="ri-save-line" onClick={save}>
              Save changes
            </Button>
          </div>
        </div>

        <aside className="space-y-6 animate-fade-in-up" style={{ animationDelay: "0.06s" }}>
          <Card surface="tinted" padded>
            <h3 className="text-sm font-semibold text-foreground-950">Plan</h3>
            <p className="text-sm text-foreground-600 mt-1">
              You&apos;re on the{" "}
              <span className="font-semibold text-foreground-900">{userProfile.plan}</span> plan.
            </p>
            <Button
              variant="ghost"
              size="sm"
              trailingIcon="ri-arrow-right-line"
              className="mt-3 -ml-3"
            >
              Manage subscription
            </Button>
          </Card>
          <ExtensionNoticeCard />
          <Card surface="tinted" padded>
            <h3 className="text-sm font-semibold text-foreground-950">Danger zone</h3>
            <p className="text-sm text-foreground-600 mt-1">
              Permanently delete your account and all data.
            </p>
            <Button variant="outline" icon="ri-delete-bin-line" className="mt-3">
              Delete account
            </Button>
          </Card>
        </aside>
      </div>
    </div>
  );
}