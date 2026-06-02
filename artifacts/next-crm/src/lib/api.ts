import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

export function setupApi() {
  setAuthTokenGetter(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("auth_token");
    }
    return null;
  });

  setBaseUrl("/api");
}

