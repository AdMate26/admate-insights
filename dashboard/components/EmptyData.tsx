import { ButtonLink } from "./ui";

export function EmptyData({ workspaceId }: { workspaceId: string }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h2 className="text-2xl">No data yet</h2>
      <p className="mt-2 text-muted">
        Upload an export from Meta Ads Manager, Google Ads, TikTok Ads or LinkedIn Campaign Manager. AdMate reads it, judges each campaign by its objective and tells you
        what to do next.
      </p>
      <div className="mt-6 flex justify-center">
        <ButtonLink href={`/c/${workspaceId}/upload`}>Upload an export</ButtonLink>
      </div>
    </div>
  );
}
