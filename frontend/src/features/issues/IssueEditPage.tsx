import { useParams, useLocation, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ErrorAlert } from "../../components/Alert";
import { ApiError } from "../../api/ApiClient";
import { Button } from "../../components/Button";
import { LoadingState } from "../../components/LoadingState";
import { issueApi } from "./issueApi";
import { IssueEditor } from "./IssueEditor";
import { UUID } from "./issuePresentation";
export function IssueEditPage() {
  const { issueId = "" } = useParams();
  const location = useLocation();
  const context = location.state as {
    returnTo?: string;
    scrollY?: number;
    focusIssueId?: string;
    focusNewIssue?: boolean;
    boardScrollLeft?: number;
  } | null;
  const boardBack = /^\/(?:issues|archive)(?:\?|$)/.test(
    context?.returnTo ?? "",
  )
    ? context!.returnTo!
    : "/issues";
  const boardState = {
    restoreScrollY: context?.scrollY,
    focusIssueId: context?.focusIssueId,
    focusNewIssue: context?.focusNewIssue,
    boardScrollLeft: context?.boardScrollLeft,
  };
  const valid = UUID.test(issueId);
  const issue = useQuery({
    queryKey: ["issues", "detail", issueId],
    queryFn: ({ signal }) => issueApi.detail(issueId, signal),
    enabled: valid,
    refetchOnMount: "always",
  });
  if (!valid)
    return (
      <>
        <h1 tabIndex={-1}>Issue non trovata</h1>
        <Link to={boardBack} state={boardState}>
          Torna alle issue
        </Link>
      </>
    );
  if (issue.isPending) return <LoadingState />;
  if (issue.error)
    return (
      <>
        <h1 tabIndex={-1}>
          {issue.error instanceof ApiError && issue.error.status === 404
            ? "Issue non trovata"
            : issue.error instanceof ApiError && issue.error.status === 403
              ? "Accesso non consentito"
              : "Modifica issue"}
        </h1>
        <ErrorAlert error={issue.error} />
        <Link to={boardBack} state={boardState}>
          Torna alle issue
        </Link>
        <Button onClick={() => void issue.refetch()}>
          Riprova caricamento
        </Button>
      </>
    );
  if (!issue.data.permissions.canEdit)
    return (
      <>
        <h1 tabIndex={-1}>Accesso non consentito</h1>
        <p>Il tuo account non può modificare questa issue.</p>
        <Link to={`/issues/${issueId}`} state={location.state}>
          Torna al dettaglio
        </Link>
      </>
    );
  return <IssueEditor key={issueId} issue={issue.data} />;
}
