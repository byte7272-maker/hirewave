import WorksWithStrip from "@/components/feature/WorksWithStrip";

/** "Works with" logo strip sitting directly under the extension hero. */
export default function ExtensionWorksWith() {
  return (
    <section className="border-y border-background-200 bg-background-50 py-10 md:py-12">
      <div className="w-full px-6 md:px-10 max-w-7xl mx-auto">
        <WorksWithStrip />
      </div>
    </section>
  );
}