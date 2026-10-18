import { redirect } from "next/navigation";

// Alerts and Recommendations are now one list: Actions.
export default async function Moved({ params, searchParams }: PageProps<"/c/[ws]/alerts">) {
  const { ws } = await params;
  const q = new URLSearchParams(Object.entries(await searchParams).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
  redirect(`/c/${ws}/actions${q ? `?${q}` : ""}`);
}
