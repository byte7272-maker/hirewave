import MockInterview from "@/pages/dashboard/components/MockInterview";

export default function Interview() {
  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up">
        <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">
          Interview prep
        </h1>
        <p className="text-sm text-foreground-600 mt-1">
          Practice behavioral, technical, and case interviews out loud with an AI interviewer.
        </p>
      </section>
      <div className="animate-fade-in-up" style={{ animationDelay: "0.06s" }}>
        <MockInterview />
      </div>
    </div>
  );
}