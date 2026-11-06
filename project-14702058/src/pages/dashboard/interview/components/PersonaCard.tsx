import { useState } from "react";
import Modal from "@/components/base/Modal";
import type { InterviewPersona } from "@/lib/interview";
import { difficultyLabel, difficultyStyle } from "@/pages/dashboard/interview/components/difficulty";
import VoicePanel from "@/pages/dashboard/interview/components/VoicePanel";

function initials(name?: string) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export default function PersonaCard({
  persona,
  starting,
  hasCustomVoice,
  onStart,
  onVoiceChanged,
}: {
  persona: InterviewPersona;
  starting: boolean;
  hasCustomVoice?: boolean;
  onStart: (persona: InterviewPersona) => void;
  onVoiceChanged?: (hasCustomVoice: boolean) => void;
}) {
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);

  return (
    <div className="rounded-2xl bg-background-100/60 border border-background-200 p-5 flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 flex-shrink-0 rounded-xl overflow-hidden bg-primary-100 text-primary-700 flex items-center justify-center font-heading font-semibold text-lg">
          {persona.avatar_url ? (
            <img
              src={persona.avatar_url}
              alt={persona.name}
              title={`${persona.name} — ${persona.role}`}
              className="w-full h-full object-cover object-top"
            />
          ) : (
            initials(persona.name)
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-heading text-base font-semibold text-foreground-950 whitespace-nowrap">
              {persona.name}
            </h3>
            <span
              className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${difficultyStyle(persona.difficulty)}`}
            >
              {difficultyLabel(persona.difficulty)}
            </span>
          </div>
          <p className="text-sm text-foreground-600 mt-0.5 truncate">
            {persona.role}
            {persona.company ? ` · ${persona.company}` : ""}
          </p>
          {hasCustomVoice && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-secondary-900 bg-secondary-100 px-2 py-0.5 rounded-full mt-1.5 whitespace-nowrap">
              <i className="ri-user-voice-line"></i>
              Custom voice
            </span>
          )}
        </div>
      </div>

      <p className="text-sm text-foreground-700 leading-relaxed flex-1">
        {persona.bio || "A practiced interviewer ready to put your answers to the test."}
      </p>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setVoiceOpen(true)}
          disabled={voiceBusy}
          className="inline-flex flex-1 items-center justify-center gap-2 text-sm font-semibold bg-background-100 text-foreground-900 border border-background-200 px-4 py-2.5 rounded-md hover:bg-background-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
        >
          <i className={voiceBusy ? "ri-loader-4-line animate-spin" : "ri-user-voice-line"}></i>
          {voiceBusy ? "Saving…" : "Voice"}
        </button>
        <button
          onClick={() => onStart(persona)}
          disabled={starting}
          className="inline-flex flex-1 items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
        >
          {starting ? (
            <>
              <i className="ri-loader-4-line animate-spin"></i>
              Starting…
            </>
          ) : (
            <>
              <i className="ri-play-fill"></i>
              Start interview
            </>
          )}
        </button>
      </div>

      {voiceOpen && (
        <Modal title={`Voice — ${persona.name}`} onClose={() => setVoiceOpen(false)}>
          <VoicePanel
            persona={persona}
            onClose={() => setVoiceOpen(false)}
            onChanged={onVoiceChanged}
            onBusyChange={setVoiceBusy}
          />
        </Modal>
      )}
    </div>
  );
}