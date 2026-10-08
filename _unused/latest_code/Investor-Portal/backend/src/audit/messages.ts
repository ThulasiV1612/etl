/**
 * Human-readable log lines per semantic event domain (SOC-friendly).
 */

export function auditHumanMessage(input: {
  event: string;
  outcome: string;
  httpStatus: number;
  method: string;
  pathOnly: string;
}): string {
  const { event, outcome, httpStatus, method, pathOnly } = input;

  if (event === "auth.signin") {
    if (httpStatus === 200 && outcome === "success")
      return "User signed in successfully";
    if (httpStatus >= 500 || outcome === "server_error")
      return "Sign-in failed due to a server error";
    if (httpStatus === 401 || outcome === "auth_failure") return "Sign-in failed";
    return "Sign-in request completed";
  }

  const domain = event.split(".")[0] ?? "";

  if (event.endsWith(".export_notify") || event.includes("export_notify"))
    return outcome === "success"
      ? `Export notification recorded (${method} ${pathOnly})`
      : `Export notification failed (${method} ${pathOnly})`;

  if (domain === "company")
    return outcome === "success"
      ? `Company workspace action succeeded (${event})`
      : `Company workspace action failed (${event})`;

  if (domain === "deal")
    return outcome === "success"
      ? `Deal workflow step succeeded (${event})`
      : `Deal workflow step failed (${event})`;

  if (domain === "contact")
    return outcome === "success"
      ? `Contact action succeeded (${event})`
      : `Contact action failed (${event})`;

  if (domain === "user_admin" || domain === "user")
    return outcome === "success"
      ? `User or membership action succeeded (${event})`
      : `User or membership action failed (${event})`;

  if (domain === "investing")
    return outcome === "success"
      ? `Investor profile book update succeeded (${event})`
      : `Investor profile book update failed (${event})`;

  if (domain === "auth")
    return outcome === "success"
      ? `Authentication action succeeded (${event})`
      : `Authentication action failed (${event})`;

  if (httpStatus >= 200 && httpStatus < 400)
    return `${method} ${pathOnly} completed successfully`;
  if (httpStatus >= 500)
    return `${method} ${pathOnly} failed (server error)`;
  return `${method} ${pathOnly} failed (client error)`;
}
