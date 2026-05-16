import { handleOppRequest } from "../server.mjs";

export default function handler(request, response) {
  return handleOppRequest(request, response);
}
