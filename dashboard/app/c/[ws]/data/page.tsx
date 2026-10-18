import { redirect } from "next/navigation";

// The Data page was split into Upload report, Reports and Targets & settings.
export default async function Moved({ params }: PageProps<"/c/[ws]/data">) {
  const { ws } = await params;
  redirect(`/c/${ws}/upload`);
}
