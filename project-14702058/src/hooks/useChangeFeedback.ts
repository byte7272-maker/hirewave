import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/base/ToastProvider";
import { ApiError } from "@/lib/api";
import { UNCHANGED_MESSAGE, changeErrorMessage } from "@/lib/changeFeedback";

/**
 * The one place every change action reports its outcome, so nothing fails
 * silently:
 *
 *  - `reportError` shows a red toast carrying the HTTP status + message, and on
 *    a 401 sends the user straight to sign-in (the session is gone).
 *  - `reportUnchanged` shows the single, consistent "no change was made" notice.
 *
 * Shared by the improve/incorporate pipeline, Find & replace, and the templates
 * panels, so a failure always ends visibly and the same way everywhere.
 */
export default function useChangeFeedback() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const reportError = useCallback(
    (err: unknown, kindLabel: string) => {
      if (err instanceof ApiError && err.status === 401) {
        showToast("Your session expired — please sign in again.", "error");
        navigate("/auth/login");
        return;
      }
      showToast(changeErrorMessage(err, kindLabel), "error");
    },
    [showToast, navigate]
  );

  const reportUnchanged = useCallback(() => {
    showToast(UNCHANGED_MESSAGE, "info");
  }, [showToast]);

  return { reportError, reportUnchanged };
}