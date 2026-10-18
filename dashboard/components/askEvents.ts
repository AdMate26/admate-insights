// "Ask AdMate why" buttons anywhere on the page open the assistant panel with a
// question and, optionally, the finding it's about.
export interface AskRequest {
  question?: string;
  findingKey?: string;
}

export const ASK_EVENT = "admate:ask";

export function openAsk(req: AskRequest = {}) {
  window.dispatchEvent(new CustomEvent<AskRequest>(ASK_EVENT, { detail: req }));
}
