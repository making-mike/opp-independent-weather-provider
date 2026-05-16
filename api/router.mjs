import { handleOppRequest } from "../server.mjs";

export default function handler(request, response) {
  const parsed = new URL(request.url ?? "/", "https://internal.vercel");
  const path = parsed.searchParams.get("path") ?? "";
  parsed.searchParams.delete("path");

  const originalPath = `/${path.replace(/^\/+/, "")}`;
  const query = parsed.searchParams.toString();
  request.url = query ? `${originalPath}?${query}` : originalPath;

  return handleOppRequest(request, response);
}
