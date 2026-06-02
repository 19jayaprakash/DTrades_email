import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

export function setupApi() {
  setAuthTokenGetter(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("auth_token");
    }
    return null;
  });

  // Under unified Next.js, API routes already start with /api, so we don't prepend it again
  setBaseUrl("");
}

