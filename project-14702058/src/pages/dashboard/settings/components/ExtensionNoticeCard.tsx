import { useState } from "react";
import { useExtensionName } from "@/hooks/useBranding";
import { useExtensionInstall } from "@/hooks/useExtensionInstall";
import { useToast } from "@/components/base/ToastProvider";
import { clearExtensionSeen } from "@/lib/extensionSeenMemory";
import { Button, Card } from "@/components/base";

/**
 * Settings card for people who already have the extension. Lets them restore the
 * "you're all set" setup notice on the extension page if they dismissed it but
 * want to review the connect steps again.
 */
export default function ExtensionNoticeCard() {
  const extensionName = useExtensionName();
  const { installed } = useExtensionInstall();
  const { showToast } = useToast();
  const [restored, setRestored] = useState(false);

  // Only meaningful for people who actually have the extension.
  if (!installed) return null;

  function handleShowAgain() {
    clearExtensionSeen();
    setRestored(true);
    showToast("Setup notice restored — it'll show next time you open the extension page", "success");
  }

  return (
    <Card surface="tinted" padded>
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 flex items-center justify-center rounded-tile bg-secondary-100 text-secondary-900">
          <i className="ri-puzzle-2-line"></i>
        </span>
        <h3 className="text-sm font-semibold text-foreground-950">Browser extension</h3>
      </div>
      <p className="text-sm text-foreground-600 mt-2 leading-relaxed">
        {extensionName} is installed on this browser. Bring back the setup steps on the extension
        page if you&apos;d like to review how connecting works.
      </p>
      <Button
        variant="ghost"
        size="sm"
        icon={restored ? "ri-check-line" : "ri-refresh-line"}
        onClick={handleShowAgain}
        className="mt-3 -ml-3"
      >
        {restored ? "Notice restored" : "Show the setup notice again"}
      </Button>
    </Card>
  );
}